import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { opportunities, sourceItemsRaw, sourceSystems } from "@shared/schema";
import { HigherGovAdapter } from "../integrations/highergov/adapter";
import { logIngestionEvent } from "./ingestion-events.service";

export type DiscoveredAttachment = {
  title: string;
  url: string;
  sourceType: "highergov";
  hint?: string | null;
};

function s(x: unknown): string | null {
  return typeof x === "string" && x.trim() ? x.trim() : null;
}

export async function discoverHigherGovAttachments(params: {
  tenantId: string;
  opportunityId: string;
  runId?: string;
}): Promise<DiscoveredAttachment[]> {
  const { tenantId, opportunityId, runId } = params;

  const rows = await db
    .select({
      id: opportunities.id,
      externalId: opportunities.externalId,
      rawRefId: opportunities.rawRefId,
      sourceSystemKey: sourceSystems.key,
      rawJson: sourceItemsRaw.rawJson,
    })
    .from(opportunities)
    .leftJoin(sourceSystems, eq(opportunities.sourceSystemId, sourceSystems.id))
    .leftJoin(sourceItemsRaw, eq(opportunities.rawRefId, sourceItemsRaw.id))
    .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.id, opportunityId)))
    .limit(1);

  if (!rows.length) return [];
  const o = rows[0]!;

  const sysKey = (o.sourceSystemKey || "").toLowerCase();
  if (sysKey !== "highergov") return [];

  const raw: any = o.rawJson ?? null;
  const entityId = s(o.externalId) || s(raw?.id) || s(raw?.opportunityId) || s(raw?.entityId);
  if (!entityId) {
    await logIngestionEvent({
      tenantId,
      projectId: null,
      bidProjectId: null,
      runId: runId ?? null,
      eventType: "discover.highergov.none",
      entityType: "opportunity",
      entityId: o.id,
      message: "HigherGov discovery failed: missing entityId (externalId/raw_json id not present)",
      detailsJson: { hasExternalId: !!o.externalId, hasRawJson: !!raw },
    });
    return [];
  }

  const adapter = new HigherGovAdapter();
  const docs = await adapter.listDocuments(entityId);

  const seen = new Set<string>();
  const out: DiscoveredAttachment[] = [];

  for (const d of docs || []) {
    const url = s((d as any)?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    out.push({
      title: s((d as any)?.name) || s((d as any)?.fileName) || "HigherGov Document",
      url,
      sourceType: "highergov",
      hint: s((d as any)?.type) || null,
    });
  }

  await logIngestionEvent({
    tenantId,
    projectId: null,
    bidProjectId: null,
    runId: runId ?? null,
    eventType: out.length ? "discover.highergov.found" : "discover.highergov.none",
    entityType: "opportunity",
    entityId: o.id,
    message: out.length ? `HigherGov discovered ${out.length} doc(s)` : "HigherGov returned no documents",
    detailsJson: { entityId, hasKey: !!process.env.HIGHERGOV_API_KEY },
  });

  return out;
}
