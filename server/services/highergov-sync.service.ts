import { db } from "../db";
import { sql, and, eq } from "drizzle-orm";
import * as schema from "@shared/schema";
import { searchOpportunities, type HigherGovOpportunity } from "../connectors/highergov";
import crypto from "crypto";

type TenantId = string;

function csvToArr(csv: string): string[] {
  return (csv || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.toLowerCase());
}

export function computeScore(item: { title?: string; agency?: string; naics?: string; placeOfPerformance?: string; estimatedValue?: number | string | null; dueAt?: string | null }, profile: schema.HighergovWatchProfile): number {
  let score = 0;

  const naicsArr = csvToArr(profile.naicsCsv);
  const kwArr = csvToArr(profile.keywordsCsv);
  const agencyArr = csvToArr(profile.agenciesCsv);
  const stateArr = csvToArr(profile.statesCsv);

  const title = (item.title || "").toLowerCase();
  const agency = (item.agency || "").toLowerCase();
  const pop = (item.placeOfPerformance || "").toLowerCase();
  const naics = (item.naics || "").toLowerCase();

  if (naics && naicsArr.length > 0) {
    for (let i = 0; i < naicsArr.length; i++) {
      if (naics.startsWith(naicsArr[i])) { score += 35; break; }
    }
  }

  if (kwArr.length > 0) {
    let hits = 0;
    for (let i = 0; i < kwArr.length; i++) {
      if (kwArr[i] && title.includes(kwArr[i])) hits++;
    }
    score += Math.min(25, hits * 8);
  }

  if (agencyArr.length > 0 && agency) {
    for (let i = 0; i < agencyArr.length; i++) {
      if (agencyArr[i] && agency.includes(agencyArr[i])) { score += 15; break; }
    }
  }

  if (stateArr.length > 0 && pop) {
    for (let i = 0; i < stateArr.length; i++) {
      if (stateArr[i] && pop.includes(stateArr[i])) { score += 10; break; }
    }
  }

  const minV = Number(profile.minValue ?? 0);
  const maxV = profile.maxValue == null ? null : Number(profile.maxValue);
  const val = item.estimatedValue != null ? Number(item.estimatedValue) : null;
  if (val != null && !isNaN(val)) {
    if (val >= minV) score += 10;
    if (maxV != null && val <= maxV) score += 5;
  }

  if (item.dueAt) {
    const due = new Date(item.dueAt).getTime();
    const now = Date.now();
    const days = (due - now) / (1000 * 60 * 60 * 24);
    if (days < 3) score -= 10;
    else if (days < 7) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

async function getActiveProfiles(tenantId: TenantId) {
  return db.select().from(schema.highergovWatchProfiles)
    .where(and(eq(schema.highergovWatchProfiles.tenantId, tenantId), eq(schema.highergovWatchProfiles.isActive, true)));
}

export async function runHigherGovSync(args: {
  tenantId: TenantId;
  mode: "nightly" | "manual";
  query?: string;
}): Promise<{ runId: string; fetched: number; inserted: number; updated: number; errors: any[] }> {
  const { tenantId, mode, query } = args;

  const [run] = await db.insert(schema.highergovSyncRuns).values({
    tenantId,
    source: "highergov",
    mode,
    status: "running",
  }).returning({ id: schema.highergovSyncRuns.id });

  const runId = run.id;
  const errors: any[] = [];
  let fetched = 0;
  let inserted = 0;
  let updated = 0;

  try {
    const profiles = await getActiveProfiles(tenantId);

    const searchParams: any = { limit: 100 };
    if (query) searchParams.query = query;
    if (profiles.length > 0) {
      const firstProfile = profiles[0];
      const naicsList = csvToArr(firstProfile.naicsCsv);
      if (naicsList.length > 0) {
        searchParams.naics = naicsList[0];
      }
      const kwList = csvToArr(firstProfile.keywordsCsv);
      if (kwList.length > 0 && !query) {
        searchParams.query = kwList.join(" ");
      }
    }

    if (!searchParams.query) {
      searchParams.query = "construction";
    }

    const result = await searchOpportunities(searchParams);
    const items = result.opportunities;
    fetched = items.length;

    for (const item of items) {
      try {
        const sourceId = item.id || item.raw?.solicitation_id || crypto.randomUUID();

        const bestScore = profiles.length
          ? Math.max(...profiles.map(p => computeScore({
              title: item.title,
              agency: item.agency,
              naics: item.naics,
              placeOfPerformance: item.raw?.place_of_performance as string,
              estimatedValue: item.value,
              dueAt: item.dueDate,
            }, p)))
          : 0;

        const solNum = (item.raw?.solicitation_number as string) ?? (item.raw?.solicitation_id as string) ?? null;
        const rowValues = {
          tenantId,
          source: "highergov" as const,
          noticeId: String(sourceId),
          solicitationNumber: solNum,
          title: item.title,
          agency: item.agency ?? null,
          subAgency: (item.raw?.sub_agency as string) ?? null,
          postedAt: item.postedDate ? new Date(item.postedDate) : null,
          dueAt: item.dueDate ? new Date(item.dueDate) : null,
          naicsCode: item.naics ?? null,
          setAside: item.setAside ?? null,
          estimatedValue: item.value != null ? String(item.value) : null,
          placeOfPerformance: (item.raw?.place_of_performance as string) ?? null,
          url: item.url ?? null,
          status: "new",
          score: bestScore,
          rawPayloadJson: item.raw ?? {},
        };

        const result = await db.insert(schema.highergovOpportunities).values(rowValues)
          .onConflictDoUpdate({
            target: [schema.highergovOpportunities.tenantId, schema.highergovOpportunities.source, schema.highergovOpportunities.noticeId],
            set: {
              title: sql`excluded.title`,
              agency: sql`excluded.agency`,
              subAgency: sql`excluded.sub_agency`,
              solicitationNumber: sql`excluded.solicitation_number`,
              postedAt: sql`excluded.posted_at`,
              dueAt: sql`excluded.due_at`,
              naicsCode: sql`excluded.naics_code`,
              setAside: sql`excluded.set_aside`,
              estimatedValue: sql`excluded.estimated_value`,
              placeOfPerformance: sql`excluded.place_of_performance`,
              url: sql`excluded.url`,
              score: sql`excluded.score`,
              rawPayloadJson: sql`excluded.raw_payload_json`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: schema.highergovOpportunities.id, createdAt: schema.highergovOpportunities.createdAt, updatedAt: schema.highergovOpportunities.updatedAt });

        if (result.length > 0) {
          const row = result[0];
          const isNew = Math.abs(new Date(row.createdAt).getTime() - new Date(row.updatedAt).getTime()) < 1000;
          if (isNew) inserted++;
          else updated++;
        }
      } catch (e: any) {
        errors.push({ sourceId: item.id, message: e?.message || String(e) });
      }
    }

    await db.update(schema.highergovSyncRuns).set({
      status: errors.length > 0 ? "partial" : "success",
      completedAt: new Date(),
      finishedAt: new Date(),
      fetchedCount: fetched,
      insertedCount: inserted,
      updatedCount: updated,
      errorCount: errors.length,
      errorsJson: errors,
    }).where(eq(schema.highergovSyncRuns.id, runId));

    return { runId, fetched, inserted, updated, errors };
  } catch (e: any) {
    errors.push({ message: e?.message || String(e) });

    await db.update(schema.highergovSyncRuns).set({
      status: "failed",
      completedAt: new Date(),
      finishedAt: new Date(),
      fetchedCount: fetched,
      insertedCount: inserted,
      updatedCount: updated,
      errorCount: errors.length,
      errorsJson: errors,
      errorLogText: e?.message || String(e),
    }).where(eq(schema.highergovSyncRuns.id, runId));

    throw e;
  }
}

let schedulerStarted = false;

export function startNightlyHigherGovScheduler(getActiveTenantIds: () => Promise<string[]>) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  if (process.env.HIGHERGOV_SYNC_DISABLED === "true") {
    console.log("[highergov] nightly scheduler disabled via HIGHERGOV_SYNC_DISABLED=true");
    return;
  }

  const targetHour = Number(process.env.HIGHERGOV_SYNC_HOUR ?? 2);
  const targetMinute = Number(process.env.HIGHERGOV_SYNC_MINUTE ?? 0);

  async function tick() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(targetHour, targetMinute, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    const ms = next.getTime() - now.getTime();

    console.log(`[highergov] next nightly sync scheduled at ${next.toISOString()} (${Math.round(ms / 60000)} min)`);

    setTimeout(async () => {
      try {
        const tenantIds = await getActiveTenantIds();
        for (const tenantId of tenantIds) {
          try {
            await runHigherGovSync({ tenantId, mode: "nightly" });
          } catch (e: any) {
            console.error(`[highergov] nightly sync failed for tenant ${tenantId}:`, e?.message);
          }
        }
        console.log(`[highergov] nightly sync completed for ${tenantIds.length} tenant(s)`);
      } catch (e: any) {
        console.error("[highergov] nightly sync error:", e?.message || e);
      } finally {
        tick();
      }
    }, ms);
  }

  tick();
}
