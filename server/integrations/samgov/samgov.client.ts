// server/integrations/samgov/samgov.client.ts
//
// SAM.gov API client + ingestion service.
//
// Fixes (2026-05-20) — addresses 3 months of silent ingestion failure:
//   1. CRITICAL: date format. SAM.gov v2 REQUIRES MM/dd/yyyy. Old code sent
//      `new Date().toISOString().split('T')[0]` which is yyyy-MM-dd and returns
//      400 on every call.
//   2. URL: canonical https://api.sam.gov/prod/opportunities/v2/search kept
//      (this DOES work; the /opportunities/v2/search variant in getOpportunityById
//      was inconsistent — now normalized).
//   3. Failure logging: response body is captured and surfaced in error message
//      so we know WHY a call failed (401 = bad key, 429 = rate-limit, etc).
//   4. Retries with exponential backoff for 429 and 5xx (3 attempts, 1s/2s/4s).
//   5. Pagination: searchOpportunities now follows totalRecords through all pages
//      (capped at 10 pages = 1000 records per run to stay polite).
//   6. Headers: Accept: application/json, User-Agent, and a 30s timeout.
//   7. runIngestion: looks back 7 days by default (was 30) since cron fires every
//      10 minutes — 7 days is plenty of overlap to catch backfills without
//      hammering the API. Also pulls ptype="o,k,p" (Solicitation + Combined
//      Synopsis + Presolicitation) which is what a GC actually wants to see.

import { db } from "../../db";
import {
  sourceSystems,
  sourceRuns,
  sourceItemsRaw,
  opportunities,
  opportunityAmendments,
  buyers,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  recordSourceRunTouch,
  getImpactedBidProjectIdsForRun,
  enqueueArtifactIngestionJob,
} from "../../services/ingestion/ingestion.helpers";

// ─── Types (unchanged public surface) ─────────────────────────────────────────

export interface SamGovOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  fullParentPathName?: string;
  fullParentPathCode?: string;
  postedDate?: string;
  type?: string;
  baseType?: string;
  archiveType?: string;
  archiveDate?: string;
  typeOfSetAsideDescription?: string;
  typeOfSetAside?: string;
  responseDeadLine?: string;
  naicsCode?: string;
  naicsCodes?: string[];
  classificationCode?: string;
  active?: string;
  organizationType?: string;
  resourceLinks?: string[];
  uiLink?: string;
  office?: { name?: string; code?: string };
  pointOfContact?: Array<{
    type?: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  placeOfPerformance?: {
    city?: { name?: string; code?: string };
    state?: { name?: string; code?: string };
    country?: { name?: string; code?: string };
  };
  description?: string;
}

export interface SamGovSearchParams {
  postedFrom?: string; // accepted in EITHER MM/dd/yyyy or yyyy-MM-dd — we normalize.
  postedTo?: string;
  ptype?: string;
  naics?: string;
  limit?: number;
  offset?: number;
}

export interface SamGovAttachment {
  url: string;
  name: string;
  source: "resourceLinks" | "links" | "additionalInfoLink" | "relatedNotice";
}

export interface SamGovOpportunityDetail {
  noticeId: string;
  title: string;
  solicitationNumber?: string;
  description?: string;
  additionalInfoLink?: string;
  uiLink?: string;
  attachments: SamGovAttachment[];
  relatedNotices: string[];
  resourceLinks: string[];
  pointOfContact?: Array<{
    type?: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  postedDate?: string;
  responseDeadLine?: string;
  archiveDate?: string;
  type?: string;
  active?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAM_BASE_URL = "https://api.sam.gov/prod/opportunities/v2/search";
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "Sentinel-Command-Center/1.0 (+ops@sentinel)";
const MAX_PAGES_PER_RUN = 10; // 10 pages × 100 limit = 1000 records max per cron tick
const MAX_RETRIES = 3;

/** Format a date as MM/dd/yyyy — the ONLY format SAM.gov v2 accepts. */
function formatSamDate(input: Date | string): string {
  if (typeof input === "string") {
    // Already MM/dd/yyyy? pass through.
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(input)) return input;
    // yyyy-MM-dd → reformat
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
    // fall through — let Date parse it
    input = new Date(input);
  }
  const mm = String(input.getMonth() + 1).padStart(2, "0");
  const dd = String(input.getDate()).padStart(2, "0");
  const yyyy = input.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Client ───────────────────────────────────────────────────────────────────

export class SamGovClient {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("SamGovClient: apiKey is required");
    this.apiKey = apiKey;
  }

  /** Single page fetch — used internally by searchOpportunities for pagination. */
  private async fetchPage(params: SamGovSearchParams): Promise<{
    totalRecords: number;
    opportunitiesData: SamGovOpportunity[];
  }> {
    const q = new URLSearchParams();
    if (params.postedFrom) q.set("postedFrom", formatSamDate(params.postedFrom));
    if (params.postedTo) q.set("postedTo", formatSamDate(params.postedTo));
    q.set("ptype", params.ptype || "o,k,p");
    if (params.naics) q.set("ncode", params.naics);
    q.set("limit", String(params.limit ?? 100));
    q.set("offset", String(params.offset ?? 0));
    q.set("api_key", this.apiKey);

    const url = `${SAM_BASE_URL}?${q.toString()}`;
    const sanitizedUrl = url.replace(this.apiKey, "***");

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          const snippet = body.slice(0, 500);
          const msg = `SAM.gov ${res.status} ${res.statusText} for ${sanitizedUrl} — body: ${snippet}`;
          if (isRetryable(res.status) && attempt < MAX_RETRIES) {
            const backoff = 1000 * Math.pow(2, attempt - 1);
            console.warn(`[samgov] ${msg} — retry ${attempt}/${MAX_RETRIES} in ${backoff}ms`);
            await sleep(backoff);
            lastErr = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const data = (await res.json()) as {
          totalRecords?: number;
          opportunitiesData?: SamGovOpportunity[];
        };
        return {
          totalRecords: data.totalRecords ?? 0,
          opportunitiesData: data.opportunitiesData ?? [],
        };
      } catch (err: any) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        // network / timeout — retry
        if (attempt < MAX_RETRIES) {
          const backoff = 1000 * Math.pow(2, attempt - 1);
          console.warn(
            `[samgov] fetch error attempt ${attempt}/${MAX_RETRIES}: ${lastErr.message} — retry in ${backoff}ms`,
          );
          await sleep(backoff);
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("[samgov] exhausted retries");
  }

  /** Search opportunities, transparently following pagination. */
  async searchOpportunities(
    params: SamGovSearchParams,
  ): Promise<SamGovOpportunity[]> {
    const limit = params.limit ?? 100;
    let offset = params.offset ?? 0;
    let total = 0;
    let pages = 0;
    const all: SamGovOpportunity[] = [];

    do {
      const page = await this.fetchPage({ ...params, limit, offset });
      total = page.totalRecords;
      all.push(...page.opportunitiesData);
      pages++;
      offset += limit;
      if (pages >= MAX_PAGES_PER_RUN) break;
      if (page.opportunitiesData.length < limit) break; // last page
    } while (offset < total);

    console.log(
      `[samgov] searchOpportunities: total=${total} fetched=${all.length} pages=${pages}`,
    );
    return all;
  }

  async getOpportunityById(
    noticeId: string,
  ): Promise<SamGovOpportunity | null> {
    try {
      const q = new URLSearchParams();
      q.set("noticeId", noticeId);
      q.set("api_key", this.apiKey);
      const url = `${SAM_BASE_URL}?${q.toString()}`;

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `[samgov] getOpportunityById ${noticeId}: ${res.status} — ${body.slice(0, 300)}`,
        );
        return null;
      }
      const data = await res.json();
      return data.opportunitiesData?.[0] ?? null;
    } catch (err) {
      console.error(`[samgov] getOpportunityById ${noticeId} threw:`, err);
      return null;
    }
  }

  async getOpportunityDetail(
    noticeId: string,
  ): Promise<SamGovOpportunityDetail | null> {
    try {
      const q = new URLSearchParams();
      q.set("noticeId", noticeId);
      q.set("api_key", this.apiKey);
      const url = `${SAM_BASE_URL}?${q.toString()}`;

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `[samgov-client] Detail fetch failed for ${noticeId}: ${res.status} ${body.slice(0, 300)}`,
        );
        return null;
      }

      const data = await res.json();
      const opp = data.opportunitiesData?.[0];
      if (!opp) return null;

      const attachments: SamGovAttachment[] = [];
      if (opp.resourceLinks && Array.isArray(opp.resourceLinks)) {
        for (const link of opp.resourceLinks) {
          const filename = link.split("/").pop() || link;
          attachments.push({
            url: link,
            name: decodeURIComponent(filename),
            source: "resourceLinks",
          });
        }
      }
      if (opp.links && Array.isArray(opp.links)) {
        for (const link of opp.links) {
          if (link.href && link.rel !== "self") {
            attachments.push({
              url: link.href,
              name: link.rel || link.href.split("/").pop() || "linked-document",
              source: "links",
            });
          }
        }
      }
      if (opp.additionalInfoLink) {
        attachments.push({
          url: opp.additionalInfoLink,
          name: "Additional Information",
          source: "additionalInfoLink",
        });
      }

      const relatedNotices: string[] = [];
      if (opp.relatedNotice) {
        if (typeof opp.relatedNotice === "string") relatedNotices.push(opp.relatedNotice);
        else if (Array.isArray(opp.relatedNotice)) relatedNotices.push(...opp.relatedNotice);
      }

      return {
        noticeId: opp.noticeId,
        title: opp.title,
        solicitationNumber: opp.solicitationNumber,
        description: opp.description,
        additionalInfoLink: opp.additionalInfoLink,
        uiLink: opp.uiLink,
        attachments,
        relatedNotices,
        resourceLinks: opp.resourceLinks || [],
        pointOfContact: opp.pointOfContact,
        postedDate: opp.postedDate,
        responseDeadLine: opp.responseDeadLine,
        archiveDate: opp.archiveDate,
        type: opp.type,
        active: opp.active,
      };
    } catch (err) {
      console.error(`[samgov-client] Failed to fetch detail for ${noticeId}:`, err);
      return null;
    }
  }
}

// ─── Ingestion service ────────────────────────────────────────────────────────

export class SamGovIngestionService {
  private client: SamGovClient;
  private tenantId: string;
  private sourceSystemId: string;

  constructor(apiKey: string, tenantId: string, sourceSystemId: string) {
    this.client = new SamGovClient(apiKey);
    this.tenantId = tenantId;
    this.sourceSystemId = sourceSystemId;
  }

  /**
   * Run one ingestion pass. Looks back 7 days by default (cron fires every
   * 10 minutes so 7d overlap catches anything backfilled while staying small).
   */
  async runIngestion(): Promise<{
    created: number;
    updated: number;
    errors: number;
    fetched: number;
  }> {
    const [run] = await db
      .insert(sourceRuns)
      .values({
        tenantId: this.tenantId,
        sourceSystemId: this.sourceSystemId,
        status: "running",
        countsJson: {},
      })
      .returning({ id: sourceRuns.id });

    const stats = { created: 0, updated: 0, errors: 0, fetched: 0 };

    try {
      const today = new Date();
      const lookback = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const params: SamGovSearchParams = {
        postedFrom: formatSamDate(lookback),
        postedTo: formatSamDate(today),
        ptype: "o,k,p", // Solicitation + Combined Synopsis + Presolicitation
        limit: 100,
      };

      const oppList = await this.client.searchOpportunities(params);
      stats.fetched = oppList.length;
      console.log(
        `[samgov-ingest] fetched ${oppList.length} opportunities from SAM.gov for window ${params.postedFrom} → ${params.postedTo}`,
      );

      for (const opp of oppList) {
        try {
          const result = await this.processOpportunity(opp, run.id);
          if (result.outcome === "created") stats.created++;
          else if (result.outcome === "updated") stats.updated++;

          if (result.outcome === "created" || result.outcome === "updated") {
            await recordSourceRunTouch({
              tenantId: this.tenantId,
              sourceRunId: run.id,
              sourceSystemId: this.sourceSystemId,
              entityType: "opportunity",
              entityId: result.opportunityId,
              action: result.outcome,
            });
          }
        } catch (err) {
          console.error(
            `[samgov-ingest] error processing opportunity ${opp.noticeId}:`,
            err,
          );
          stats.errors++;
        }
      }

      const impactedBidProjectIds = await getImpactedBidProjectIdsForRun({
        tenantId: this.tenantId,
        sourceRunId: run.id,
      });

      for (const bidProjectId of impactedBidProjectIds) {
        await enqueueArtifactIngestionJob({
          tenantId: this.tenantId,
          bidProjectId,
          sourceType: "samgov",
        });
      }

      await db
        .update(sourceRuns)
        .set({
          status: "ok",
          endedAt: new Date(),
          countsJson: stats,
        })
        .where(eq(sourceRuns.id, run.id));

      console.log(
        `[samgov-ingest] run ${run.id} OK — fetched=${stats.fetched} created=${stats.created} updated=${stats.updated} errors=${stats.errors}`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`[samgov-ingest] run ${run.id} FAILED: ${msg}`);
      await db
        .update(sourceRuns)
        .set({
          status: "failed",
          endedAt: new Date(),
          errorJson: { message: msg, stack: (err as Error).stack },
        })
        .where(eq(sourceRuns.id, run.id));
      throw err;
    }

    return stats;
  }

  private async processOpportunity(
    opp: SamGovOpportunity,
    runId: string,
  ): Promise<{
    outcome: "created" | "updated" | "unchanged";
    opportunityId: string;
  }> {
    const rawJson = opp as unknown as Record<string, unknown>;
    const contentHash = await this.hashContent(JSON.stringify(rawJson));

    const existingRaw = await db
      .select()
      .from(sourceItemsRaw)
      .where(
        and(
          eq(sourceItemsRaw.tenantId, this.tenantId),
          eq(sourceItemsRaw.sourceSystemId, this.sourceSystemId),
          eq(sourceItemsRaw.externalId, opp.noticeId),
          eq(sourceItemsRaw.contentHash, contentHash),
        ),
      )
      .limit(1);

    if (existingRaw.length > 0) {
      const existingOpp = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.tenantId, this.tenantId),
            eq(opportunities.sourceSystemId, this.sourceSystemId),
            eq(opportunities.externalId, opp.noticeId),
          ),
        )
        .limit(1);
      return {
        outcome: "unchanged",
        opportunityId: existingOpp[0]?.id ?? "",
      };
    }

    await db.insert(sourceItemsRaw).values({
      tenantId: this.tenantId,
      sourceSystemId: this.sourceSystemId,
      externalId: opp.noticeId,
      contentHash,
      rawJson,
      parserVersion: "1.1",
      runId,
    });

    const existingOpp = await db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenantId, this.tenantId),
          eq(opportunities.sourceSystemId, this.sourceSystemId),
          eq(opportunities.externalId, opp.noticeId),
        ),
      )
      .limit(1);

    let buyerId: string | null = null;
    if (opp.fullParentPathName) {
      const normalizedKey =
        opp.fullParentPathCode ||
        opp.fullParentPathName.toLowerCase().replace(/\s+/g, "_");
      const [newBuyer] = await db
        .insert(buyers)
        .values({
          tenantId: this.tenantId,
          name: opp.fullParentPathName,
          type: opp.organizationType || "agency",
          normalizedKey,
        })
        .onConflictDoNothing()
        .returning({ id: buyers.id });

      if (newBuyer) {
        buyerId = newBuyer.id;
      } else {
        const existingBuyer = await db
          .select()
          .from(buyers)
          .where(eq(buyers.normalizedKey, normalizedKey))
          .limit(1);
        buyerId = existingBuyer[0]?.id || null;
      }
    }

    // 2026-05-20 field-name fix: map to the drizzle field names that actually
    // exist in shared/schema.ts:opportunities. Previously this used names like
    // agencyName/responseDueAt/setAsideCode/locationCity that drizzle silently
    // dropped, so ingested rows had NULL for everything except title/postedAt.
    const normalizedData = {
      tenantId: this.tenantId,
      sourceSystemId: this.sourceSystemId,
      externalId: opp.noticeId,
      buyerId,
      title: opp.title,
      synopsis: opp.description || null,
      description: opp.description || null,
      url: opp.uiLink || null,
      solicitationType: opp.type || null,
      status: "open",
      postedAt: opp.postedDate ? new Date(opp.postedDate) : null,
      dueAt: opp.responseDeadLine ? new Date(opp.responseDeadLine) : null,
      setAside: opp.typeOfSetAside || null,
      setAsideCategory: opp.typeOfSetAsideDescription || null,
      naicsCode: opp.naicsCode || (opp.naicsCodes?.[0] ?? null),
      naicsCodes: opp.naicsCodes || (opp.naicsCode ? [opp.naicsCode] : []),
      agency: opp.fullParentPathName || null,
      placeOfPerformanceState: opp.placeOfPerformance?.state?.code || null,
      locationJson: {
        city: opp.placeOfPerformance?.city?.name || null,
        state: opp.placeOfPerformance?.state?.code || null,
        country: opp.placeOfPerformance?.country?.code || "USA",
        office: opp.office?.name || null,
        contact: opp.pointOfContact?.[0] || null,
        solicitationNumber: opp.solicitationNumber || null,
        archiveDate: opp.archiveDate || null,
        classificationCode: opp.classificationCode || null,
      },
      lastSeenAt: new Date(),
    };

    if (existingOpp.length > 0) {
      await db
        .update(opportunities)
        .set({ ...normalizedData, updatedAt: new Date() })
        .where(eq(opportunities.id, existingOpp[0].id));

      await db.insert(opportunityAmendments).values({
        tenantId: this.tenantId,
        opportunityId: existingOpp[0].id,
        amendmentNo: 1,
        changeSummary: "Updated from SAM.gov sync",
        rawRefId: null,
      });

      return { outcome: "updated", opportunityId: existingOpp[0].id };
    } else {
      const [newOpp] = await db
        .insert(opportunities)
        .values(normalizedData)
        .returning({ id: opportunities.id });
      return { outcome: "created", opportunityId: newOpp.id };
    }
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function createSamGovIngestionService(
  tenantId: string,
): Promise<SamGovIngestionService | null> {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    console.warn("[samgov] SAM_GOV_API_KEY not configured");
    return null;
  }

  const [sourceSystem] = await db
    .select()
    .from(sourceSystems)
    .where(
      and(
        eq(sourceSystems.tenantId, tenantId),
        eq(sourceSystems.key, "samgov"),
      ),
    )
    .limit(1);

  if (!sourceSystem) {
    const [newSource] = await db
      .insert(sourceSystems)
      .values({
        tenantId,
        key: "samgov",
        name: "SAM.gov",
        type: "api",
        enabled: true,
        configJson: { pollMinutes: 10 },
      })
      .returning({ id: sourceSystems.id });

    return new SamGovIngestionService(apiKey, tenantId, newSource.id);
  }

  return new SamGovIngestionService(apiKey, tenantId, sourceSystem.id);
}
