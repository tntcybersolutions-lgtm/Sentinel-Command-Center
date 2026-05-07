// Phase 1 Batch 9: SAM.gov auto-create pipeline.
//
// Wires together the pieces that already exist:
//   1. SAM.gov ingestion already runs every 10 minutes (samgov_ingest
//      cron in server/queue/scheduler.ts) and inserts rows into
//      opportunities + bid_jacket_artifacts.
//   2. Win profile (server/services/win-profile.service.ts) ranks each
//      new opportunity 0..100 by similarity to past wins.
//   3. Bid jacket creation + canonical folders (jacket.service).
//   4. Checklist + artifact seeding (bid-jacket-artifacts.service).
//   5. Artifact filing (bid-jacket-filing.service from Batch 3) which
//      downloads the SAM blob and lands it in the correct folder.
//
// This service runs the pipeline end-to-end for any opportunity that
// scores above the configured fit threshold and doesn't already have a
// bid_project. The result: high-fit SAM.gov opportunities show up in
// Sentinel as fully built bid jackets, ready to bid, without a human
// having to click anything.

import { db } from "../db";
import { and, eq, isNotNull, gte } from "drizzle-orm";
import {
  opportunities,
  bidProjects,
  bidHistory,
} from "@shared/schema";
import {
  buildWinProfileFromRows,
  scoreOpportunityFit,
  type WinProfile,
  type FitScore,
} from "./win-profile.service";

export interface AutoCreateConfig {
  /** Minimum fit score (0..100) to auto-create. Default: 60. */
  minFitScore: number;
  /** Only consider opportunities posted within this many days. Default: 30. */
  postedWithinDays: number;
  /** Hard cap on auto-creations per run, to avoid runaway. Default: 25. */
  maxPerRun: number;
}

const DEFAULT_CONFIG: AutoCreateConfig = {
  minFitScore: 60,
  postedWithinDays: 30,
  maxPerRun: 25,
};

export interface AutoCreateResult {
  evaluated: number;
  created: number;
  skipped: number;
  failed: number;
  results: Array<{
    opportunityId: string;
    title: string;
    fitScore: number;
    outcome: "created" | "skipped_low_fit" | "skipped_existing" | "failed";
    bidProjectId?: string;
    artifactsFiled?: number;
    reason?: string;
    fitReasons?: string[];
  }>;
}

export interface AutoCreateDeps {
  /** List candidate opportunities not yet attached to a bid_project. */
  loadCandidates: (tenantId: string, postedSinceMs: number) => Promise<typeof opportunities.$inferSelect[]>;
  /** Load past wins for tenant, used to derive the win profile. */
  loadWinHistory: (tenantId: string) => Promise<{
    naicsCode: string | null;
    setAsideCode: string | null;
    agencyName: string | null;
    contractValue: string | number | null;
  }[]>;
  /** Check whether a given opportunity already has a bid_project. */
  bidProjectExistsForOpp: (tenantId: string, opportunityId: string) => Promise<boolean>;
  /** Create the bid_project + canonical jacket + checklist + artifacts for an opportunity. */
  createJacketForOpp: (tenantId: string, oppId: string) => Promise<{
    bidProjectId: string;
  }>;
  /** Run the SAM/HigherGov artifact-filing pass for the bid project. */
  fileArtifacts: (tenantId: string, bidProjectId: string) => Promise<{ filed: number; failed: number }>;
}

export async function runAutoCreate(
  tenantId: string,
  deps: AutoCreateDeps,
  configOverride: Partial<AutoCreateConfig> = {},
): Promise<AutoCreateResult> {
  const config: AutoCreateConfig = { ...DEFAULT_CONFIG, ...configOverride };
  const postedSinceMs = Date.now() - config.postedWithinDays * 24 * 60 * 60 * 1000;

  const wins = await deps.loadWinHistory(tenantId);
  const profile: WinProfile = buildWinProfileFromRows(wins);

  const candidates = await deps.loadCandidates(tenantId, postedSinceMs);

  const results: AutoCreateResult["results"] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const opp of candidates) {
    if (created >= config.maxPerRun) break;

    const fit: FitScore = scoreOpportunityFit(
      {
        naicsCodes: opp.naicsCodes ?? null,
        agency: extractAgency(opp),
        setAside: opp.setAside ?? null,
        contractValue: opp.contractValue ?? null,
      },
      profile,
    );

    if (fit.score < config.minFitScore) {
      skipped++;
      results.push({
        opportunityId: opp.id,
        title: opp.title,
        fitScore: fit.score,
        outcome: "skipped_low_fit",
        reason: `score ${fit.score} < threshold ${config.minFitScore}`,
        fitReasons: fit.reasons,
      });
      continue;
    }

    const exists = await deps.bidProjectExistsForOpp(tenantId, opp.id);
    if (exists) {
      skipped++;
      results.push({
        opportunityId: opp.id,
        title: opp.title,
        fitScore: fit.score,
        outcome: "skipped_existing",
        reason: "bid_project already exists",
        fitReasons: fit.reasons,
      });
      continue;
    }

    try {
      const { bidProjectId } = await deps.createJacketForOpp(tenantId, opp.id);
      const fileResult = await deps.fileArtifacts(tenantId, bidProjectId);
      created++;
      results.push({
        opportunityId: opp.id,
        title: opp.title,
        fitScore: fit.score,
        outcome: "created",
        bidProjectId,
        artifactsFiled: fileResult.filed,
        fitReasons: fit.reasons,
      });
    } catch (err: any) {
      failed++;
      results.push({
        opportunityId: opp.id,
        title: opp.title,
        fitScore: fit.score,
        outcome: "failed",
        reason: err?.message || String(err),
        fitReasons: fit.reasons,
      });
    }
  }

  return {
    evaluated: candidates.length,
    created,
    skipped,
    failed,
    results,
  };
}

function extractAgency(opp: typeof opportunities.$inferSelect): string | null {
  // The opportunities row doesn't always have a flat agency column —
  // look in raw_json fallbacks. Most SAM payloads put it under
  // organizationType / fullParentPathName.
  const raw = (opp as any).rawJson as Record<string, unknown> | null | undefined;
  if (!raw) return null;
  const candidates = ["fullParentPathName", "department", "subTier", "office", "agency", "organizationType"];
  for (const k of candidates) {
    const v = raw[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

// ─── Production wiring ───────────────────────────────────────────────────────

export const productionAutoCreateDeps: AutoCreateDeps = {
  async loadCandidates(tenantId, postedSinceMs) {
    const since = new Date(postedSinceMs);
    return db
      .select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        isNotNull(opportunities.dueAt),
        gte(opportunities.postedAt, since),
      ))
      .limit(200);
  },

  async loadWinHistory(tenantId) {
    return db
      .select({
        naicsCode: bidHistory.naicsCode,
        setAsideCode: bidHistory.setAsideCode,
        agencyName: bidHistory.agencyName,
        contractValue: bidHistory.contractValue,
      })
      .from(bidHistory)
      .where(and(
        eq(bidHistory.tenantId, tenantId),
        eq(bidHistory.outcome, "win"),
      ));
  },

  async bidProjectExistsForOpp(tenantId, opportunityId) {
    const rows = await db
      .select({ id: bidProjects.id })
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        eq(bidProjects.opportunityId, opportunityId),
      ))
      .limit(1);
    return rows.length > 0;
  },

  async createJacketForOpp(tenantId, oppId) {
    const [opp] = await db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.id, oppId)));
    if (!opp) throw new Error(`Opportunity ${oppId} not found`);

    const [project] = await db
      .insert(bidProjects)
      .values({
        tenantId,
        opportunityId: oppId,
        status: "initiated",
        statusNormalized: "initiated",
      })
      .returning({ id: bidProjects.id });

    const { jacketService } = await import("./jacket.service");
    await jacketService.createBidJacket(
      tenantId,
      project.id,
      opp.sourceSystemId || oppId,
      opp.title.slice(0, 50),
      opp.dueAt ? new Date(opp.dueAt).toISOString() : "",
    );

    const { seedArtifactsForBidProject, seedChecklistForBidProject } = await import(
      "./bid-jacket-artifacts.service"
    );
    await seedArtifactsForBidProject(tenantId, project.id);
    await seedChecklistForBidProject(tenantId, project.id);

    return { bidProjectId: project.id };
  },

  async fileArtifacts(tenantId, bidProjectId) {
    const { fileUnfiledArtifactsForBid, productionFilingDeps } = await import(
      "./bid-jacket-filing.service"
    );
    const r = await fileUnfiledArtifactsForBid(tenantId, bidProjectId, productionFilingDeps);
    return { filed: r.filed, failed: r.failed };
  },
};
