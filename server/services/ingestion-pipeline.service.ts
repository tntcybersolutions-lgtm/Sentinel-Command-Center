import crypto from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { bidJacketArtifacts, bidProjects, opportunities, projects, sourceSystems } from "@shared/schema";
import { fetchAllPendingArtifacts, fetchAndStoreArtifact } from "./document-fetch.service";
import { importBidJacketArtifactsToProjectDocuments } from "./bid-jacket-to-project-documents.service";
import { logIngestionEvent } from "./ingestion-events.service";
import { discoverSamAttachments } from "./sam-discovery.service";
import { discoverHigherGovAttachments } from "./highergov-discovery.service";

export type IngestionResult = {
  runId: string;
  discovered: number;
  upserted: number;
  downloaded: number;
  filed: number;
  failed: number;
  skipped: number;
  extractedFromZips: number;
  errors: { stage: string; message: string; artifactId?: string }[];
};

function genRunId() {
  return crypto.randomUUID();
}

function normalizeUrl(u: string) {
  return u.trim();
}

function fileNameFromUrl(u: string) {
  try {
    const noQuery = u.split("?")[0];
    return decodeURIComponent(noQuery.split("/").pop() || "");
  } catch {
    return u.split("?")[0].split("/").pop() || "";
  }
}

function guessTemplateCode(filename: string): string | null {
  const f = filename.toUpperCase();
  if (f.includes("SOLICIT") || f.includes("RFP") || f.includes("IFB")) return "SAM_SOLICITATION";
  if (f.includes("PWS") || f.includes("SOW") || f.includes("STATEMENTOFWORK")) return "SAM_PWS_SOW";
  if (f.includes("WAGE") || f.includes("WDOL") || f.includes("DETERMINATION")) return "SAM_WAGE_DETERMINATION";
  if (f.includes("DRAW") || f.includes("PLAN") || f.includes("BLUEPRINT")) return "SAM_DRAWINGS";
  if (f.includes("SPEC")) return "SAM_SPECIFICATIONS";
  if (f.includes("AMEND") || f.includes("MODIFICATION") || f.includes("MOD_") || f.includes("ADDEND")) return "SAM_AMENDMENTS";
  if (f.includes("RFI")) return "RFI";
  if (f.includes("SUBMITTAL")) return "SUBMITTAL";
  if (f.includes("CHANGE")) return "CHANGE_ORDER";
  return null;
}

type Discovered = { title: string; url: string; sourceType: string; hint?: string | null };

async function resolveProjectIdForBidProject(tenantId: string, bidProjectId: string): Promise<string | null> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.bidProjectId, bidProjectId)))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function getBidProjectOpportunity(tenantId: string, bidProjectId: string) {
  const rows = await db
    .select({
      bidProjectId: bidProjects.id,
      opportunityId: bidProjects.opportunityId,
      opportunityExternalId: opportunities.externalId,
      opportunityUrl: opportunities.url,
      sourceSystemKey: sourceSystems.key,
    })
    .from(bidProjects)
    .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
    .leftJoin(sourceSystems, eq(opportunities.sourceSystemId, sourceSystems.id))
    .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.id, bidProjectId)))
    .limit(1);

  return rows[0] ?? null;
}

async function upsertDiscoveredArtifacts(params: {
  tenantId: string;
  bidProjectId: string;
  discovered: Discovered[];
  runId: string;
}): Promise<{ upserted: number; alreadyExisted: number }> {
  const { tenantId, bidProjectId, discovered, runId } = params;

  let upserted = 0;
  let alreadyExisted = 0;

  for (const d of discovered) {
    const url = normalizeUrl(d.url);
    const filename = fileNameFromUrl(url);
    const templateCode = guessTemplateCode(filename);

    const exists = await db
      .select({ id: bidJacketArtifacts.id })
      .from(bidJacketArtifacts)
      .where(and(
        eq(bidJacketArtifacts.tenantId, tenantId),
        eq(bidJacketArtifacts.bidProjectId, bidProjectId),
        eq(bidJacketArtifacts.sourceUrl, url),
      ))
      .limit(1);

    if (exists.length) {
      alreadyExisted++;
      continue;
    }

    if (templateCode) {
      const placeholder = await db
        .select({ id: bidJacketArtifacts.id })
        .from(bidJacketArtifacts)
        .where(and(
          eq(bidJacketArtifacts.tenantId, tenantId),
          eq(bidJacketArtifacts.bidProjectId, bidProjectId),
          eq(bidJacketArtifacts.templateCode, templateCode),
          isNull(bidJacketArtifacts.sourceUrl),
        ))
        .limit(1);

      if (placeholder.length) {
        await db.update(bidJacketArtifacts)
          .set({
            title: d.title,
            sourceType: d.sourceType,
            sourceUrl: url,
            status: "ready",
            metadataJson: sql`coalesce(${bidJacketArtifacts.metadataJson}, '{}'::jsonb) || ${JSON.stringify({
              discoveredHint: d.hint ?? null,
              discoveredAt: new Date().toISOString(),
              discoveredFilename: filename || null,
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(bidJacketArtifacts.id, placeholder[0]!.id));

        upserted++;

        await logIngestionEvent({
          tenantId,
          bidProjectId,
          projectId: null,
          runId,
          eventType: "artifact.placeholder.upgraded",
          entityType: "bid_jacket_artifact",
          entityId: placeholder[0]!.id,
          message: `Upgraded placeholder ${templateCode} to real sourceUrl`,
          detailsJson: { templateCode, url },
        });

        continue;
      }
    }

    const inserted = await db.insert(bidJacketArtifacts)
      .values({
        tenantId,
        bidProjectId,
        templateCode,
        title: d.title || filename || "Discovered Document",
        sourceType: d.sourceType,
        sourceUrl: url,
        storageKey: null,
        status: "ready",
        metadataJson: {
          discoveredHint: d.hint ?? null,
          discoveredAt: new Date().toISOString(),
          discoveredFilename: filename || null,
        },
      })
      .returning({ id: bidJacketArtifacts.id });

    upserted++;

    await logIngestionEvent({
      tenantId,
      bidProjectId,
      projectId: null,
      runId,
      eventType: "artifact.inserted",
      entityType: "bid_jacket_artifact",
      entityId: inserted[0]?.id ?? null,
      message: "Inserted discovered artifact",
      detailsJson: { templateCode, url },
    });
  }

  return { upserted, alreadyExisted };
}

export async function runFullIngestion(tenantId: string, bidProjectId: string, projectId?: string | null): Promise<IngestionResult> {
  const runId = genRunId();

  const result: IngestionResult = {
    runId,
    discovered: 0,
    upserted: 0,
    downloaded: 0,
    filed: 0,
    failed: 0,
    skipped: 0,
    extractedFromZips: 0,
    errors: [],
  };

  const resolvedProjectId = projectId ?? (await resolveProjectIdForBidProject(tenantId, bidProjectId));

  await logIngestionEvent({
    tenantId,
    bidProjectId,
    projectId: resolvedProjectId,
    runId,
    eventType: "ingestion.started",
    entityType: "bid_project",
    entityId: bidProjectId,
    message: "Full ingestion started",
    detailsJson: {},
  });

  const bp = await getBidProjectOpportunity(tenantId, bidProjectId);
  if (!bp) {
    result.errors.push({ stage: "lookup", message: "Bid project not found or opportunity missing" });
    await logIngestionEvent({
      tenantId,
      bidProjectId,
      projectId: resolvedProjectId,
      runId,
      eventType: "ingestion.error",
      entityType: "bid_project",
      entityId: bidProjectId,
      message: "Bid project not found or opportunity missing",
      detailsJson: {},
    });
    return result;
  }

  const discovered: Discovered[] = [];

  try {
    const sam = await discoverSamAttachments({ tenantId, opportunityId: bp.opportunityId, runId });
    discovered.push(...sam.map(x => ({ ...x, sourceType: "samgov" as string })));
  } catch (e: any) {
    result.errors.push({ stage: "discover.sam", message: e?.message ?? "SAM discovery failed" });
  }

  try {
    const hg = await discoverHigherGovAttachments({ tenantId, opportunityId: bp.opportunityId, runId });
    discovered.push(...hg.map(x => ({ ...x, sourceType: "highergov" as string })));
  } catch (e: any) {
    result.errors.push({ stage: "discover.highergov", message: e?.message ?? "HigherGov discovery failed" });
  }

  const byUrl = new Map<string, Discovered>();
  for (const d of discovered) {
    const u = normalizeUrl(d.url);
    if (!u) continue;
    if (!byUrl.has(u)) byUrl.set(u, d);
  }
  const uniqueDiscovered = Array.from(byUrl.values());
  result.discovered = uniqueDiscovered.length;

  if (!uniqueDiscovered.length) {
    const diag = {
      hasOpportunity: true,
      hasUrl: !!bp.opportunityUrl,
      hasExternalId: !!bp.opportunityExternalId,
      sourceSystemKey: bp.sourceSystemKey ?? null,
      hasSamKey: !!process.env.SAM_GOV_API_KEY,
      hasHigherGovKey: !!process.env.HIGHERGOV_API_KEY,
      note: "If this bid was created manually and opportunity.rawRefId/url/externalId are null, discovery cannot pull docs.",
    };

    await logIngestionEvent({
      tenantId,
      bidProjectId,
      projectId: resolvedProjectId,
      runId,
      eventType: "discover.no_results",
      entityType: "opportunity",
      entityId: bp.opportunityId,
      message: "Discovery found zero attachments (see diagnostics)",
      detailsJson: diag,
    });

    await logIngestionEvent({
      tenantId,
      bidProjectId,
      projectId: resolvedProjectId,
      runId,
      eventType: "ingestion.completed",
      entityType: "bid_project",
      entityId: bidProjectId,
      message: "Full ingestion completed (no discoveries)",
      detailsJson: { ...result, diagnostics: diag },
    });

    return result;
  }

  const up = await upsertDiscoveredArtifacts({ tenantId, bidProjectId, discovered: uniqueDiscovered, runId });
  result.upserted = up.upserted;

  const fetchSummary = await fetchAllPendingArtifacts({ tenantId, bidProjectId, runId });
  result.downloaded = fetchSummary.downloaded;
  result.failed = fetchSummary.failed;
  result.skipped = fetchSummary.skipped;
  result.extractedFromZips = fetchSummary.extractedFromZips;

  if (resolvedProjectId) {
    const importSummary = await importBidJacketArtifactsToProjectDocuments({
      tenantId,
      projectId: resolvedProjectId,
      bidProjectId,
      runId,
    });
    result.filed = importSummary.inserted;
  }

  await logIngestionEvent({
    tenantId,
    bidProjectId,
    projectId: resolvedProjectId,
    runId,
    eventType: "ingestion.completed",
    entityType: "bid_project",
    entityId: bidProjectId,
    message: "Full ingestion completed",
    detailsJson: result,
  });

  return result;
}

export async function retryArtifact(tenantId: string, artifactId: string): Promise<{ success: boolean; storageKey?: string; error?: string }> {
  const row = await db
    .select({
      id: bidJacketArtifacts.id,
      bidProjectId: bidJacketArtifacts.bidProjectId,
      sourceUrl: bidJacketArtifacts.sourceUrl,
    })
    .from(bidJacketArtifacts)
    .where(and(eq(bidJacketArtifacts.tenantId, tenantId), eq(bidJacketArtifacts.id, artifactId)))
    .limit(1);

  if (!row.length) return { success: false, error: "Artifact not found" };
  const a = row[0]!;
  if (!a.sourceUrl) return { success: false, error: "Artifact has no sourceUrl" };

  await db.update(bidJacketArtifacts).set({ status: "ready", updatedAt: new Date() }).where(eq(bidJacketArtifacts.id, a.id));

  const res = await fetchAndStoreArtifact({
    tenantId,
    bidProjectId: a.bidProjectId,
    artifactId: a.id,
    sourceUrl: a.sourceUrl,
  });

  return { success: res.success, storageKey: res.storageKey, error: res.error };
}

export async function resyncIngestion(tenantId: string, bidProjectId: string, projectId?: string | null): Promise<IngestionResult> {
  return runFullIngestion(tenantId, bidProjectId, projectId);
}

export async function getIngestionStatus(tenantId: string, bidProjectId: string): Promise<{ total: number; byStatus: Record<string, number>; bySource: Record<string, number>; lastRunId: string | null; lastRunAt: string | null }> {
  const rows = await db
    .select({
      status: bidJacketArtifacts.status,
      sourceType: bidJacketArtifacts.sourceType,
      count: sql<number>`count(*)::int`,
    })
    .from(bidJacketArtifacts)
    .where(and(eq(bidJacketArtifacts.tenantId, tenantId), eq(bidJacketArtifacts.bidProjectId, bidProjectId)))
    .groupBy(bidJacketArtifacts.status, bidJacketArtifacts.sourceType);

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let total = 0;

  for (const r of rows) {
    total += r.count;
    byStatus[r.status] = (byStatus[r.status] || 0) + r.count;
    bySource[r.sourceType] = (bySource[r.sourceType] || 0) + r.count;
  }

  return { total, byStatus, bySource, lastRunId: null, lastRunAt: null };
}
