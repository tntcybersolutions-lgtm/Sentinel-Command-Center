import { db } from "../db";
import { metricSnapshots, opportunities, bidProjects, approvalRequests, tenants } from "@shared/schema";
import { eq, and, gte, lt, lte, count, inArray, sql, desc } from "drizzle-orm";

const WINNABLE_STATUSES = ['prospecting', 'qualified', 'estimating', 'submitted', 'negotiation', 'forecast', 'on_hold'];
const ACTIVE_BID_STATUSES = ['initiated', 'capture', 'estimating', 'submitted', 'shortlisted'];
const DEFAULT_PROBABILITY: Record<string, number> = {
  prospecting: 10, qualified: 30, estimating: 45, submitted: 55,
  negotiation: 70, forecast: 80, on_hold: 20, awarded: 100, lost: 0, dead: 0,
};

function weekBounds(offset = 0): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function quarterBounds(offset = 0): { start: Date; end: Date } {
  const now = new Date();
  const currentQ = Math.floor(now.getMonth() / 3);
  const targetQ = currentQ + offset;
  const year = now.getFullYear() + Math.floor(targetQ / 4);
  const q = ((targetQ % 4) + 4) % 4;
  const start = new Date(year, q * 3, 1, 0, 0, 0, 0);
  const end = new Date(year, q * 3 + 3, 1, 0, 0, 0, 0);
  return { start, end };
}

export async function getActiveTenantIds(): Promise<string[]> {
  const rows = await db.select({ id: tenants.id }).from(tenants)
    .where(eq(tenants.status, "active"));
  return rows.map(r => r.id);
}

export async function computeMetrics(tenantId: string) {
  const [activeOpp] = await db.select({ count: count() }).from(opportunities)
    .where(and(eq(opportunities.tenantId, tenantId), inArray(opportunities.statusNormalized, WINNABLE_STATUSES)));

  const [activeBid] = await db.select({ count: count() }).from(bidProjects)
    .where(and(eq(bidProjects.tenantId, tenantId), inArray(bidProjects.statusNormalized, ACTIVE_BID_STATUSES)));

  const winnableOpps = await db.select({
    contractValue: opportunities.contractValue,
    statusNormalized: opportunities.statusNormalized,
    probability: opportunities.probability,
  }).from(opportunities)
    .where(and(eq(opportunities.tenantId, tenantId), inArray(opportunities.statusNormalized, WINNABLE_STATUSES)));

  const pipelineValue = winnableOpps.reduce((s, o) => s + (Number(o.contractValue) || 0), 0);
  const weightedPipeline = winnableOpps.reduce((s, o) => {
    const val = Number(o.contractValue) || 0;
    const prob = o.probability ?? DEFAULT_PROBABILITY[o.statusNormalized] ?? 10;
    return s + (val * prob / 100);
  }, 0);

  const [pending] = await db.select({ count: count() }).from(approvalRequests)
    .where(and(eq(approvalRequests.tenantId, tenantId), eq(approvalRequests.status, "pending")));

  const now = new Date();
  const [atRisk] = await db.select({ count: count() }).from(opportunities)
    .where(and(
      eq(opportunities.tenantId, tenantId),
      inArray(opportunities.statusNormalized, WINNABLE_STATUSES),
      lt(opportunities.dueAt, now)
    ));

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const [awarded] = await db.select({ count: count() }).from(opportunities)
    .where(and(
      eq(opportunities.tenantId, tenantId),
      eq(opportunities.statusNormalized, "awarded"),
      gte(opportunities.awardedDate, monthStart)
    ));

  return {
    active_opportunities_count: Number(activeOpp?.count || 0),
    active_bids_count: Number(activeBid?.count || 0),
    pipeline_value: pipelineValue,
    weighted_pipeline_value: weightedPipeline,
    pending_approvals_count: Number(pending?.count || 0),
    at_risk_count: Number(atRisk?.count || 0),
    awarded_this_month_count: Number(awarded?.count || 0),
  };
}

async function upsertSnapshot(tenantId: string, metricKey: string, metricValue: number, periodStart: Date, periodEnd: Date, isSeeded: boolean = false) {
  const [row] = await db.insert(metricSnapshots).values({
    tenantId,
    metricKey,
    metricValue: String(metricValue),
    isSeeded,
    periodStart,
    periodEnd,
  }).onConflictDoUpdate({
    target: [metricSnapshots.tenantId, metricSnapshots.metricKey, metricSnapshots.periodStart, metricSnapshots.periodEnd],
    set: { metricValue: String(metricValue), isSeeded },
  }).returning();
  return row;
}

export async function writeSnapshot(tenantId: string, periodType: "week" | "quarter" = "week") {
  const metrics = await computeMetrics(tenantId);
  const bounds = periodType === "week" ? weekBounds(0) : quarterBounds(0);

  const results = [];
  for (const [key, value] of Object.entries(metrics)) {
    const row = await upsertSnapshot(tenantId, key, value, bounds.start, bounds.end);
    results.push(row);
  }
  return results;
}

export async function seedPreviousPeriodSnapshots(tenantId: string) {
  const metrics = await computeMetrics(tenantId);

  const lastWeek = weekBounds(-1);
  const lastQuarter = quarterBounds(-1);

  const results = [];
  for (const [key, value] of Object.entries(metrics)) {
    const existingWeek = await db.select().from(metricSnapshots).where(and(
      eq(metricSnapshots.tenantId, tenantId),
      eq(metricSnapshots.metricKey, key),
      eq(metricSnapshots.periodStart, lastWeek.start),
      eq(metricSnapshots.periodEnd, lastWeek.end),
    ));
    if (existingWeek.length === 0) {
      const row = await upsertSnapshot(tenantId, key, value, lastWeek.start, lastWeek.end, true);
      results.push(row);
    }

    const existingQtr = await db.select().from(metricSnapshots).where(and(
      eq(metricSnapshots.tenantId, tenantId),
      eq(metricSnapshots.metricKey, key),
      eq(metricSnapshots.periodStart, lastQuarter.start),
      eq(metricSnapshots.periodEnd, lastQuarter.end),
    ));
    if (existingQtr.length === 0) {
      const row = await upsertSnapshot(tenantId, key, value, lastQuarter.start, lastQuarter.end, true);
      results.push(row);
    }
  }
  return results;
}

export async function writeAllSnapshots(tenantId?: string) {
  const tenantIds = tenantId ? [tenantId] : await getActiveTenantIds();
  const allResults: Record<string, any> = {};

  for (const tid of tenantIds) {
    const weekResults = await writeSnapshot(tid, "week");
    const quarterResults = await writeSnapshot(tid, "quarter");
    allResults[tid] = { week: weekResults, quarter: quarterResults };
  }
  return allResults;
}

export async function writeAllSnapshotsForAllTenants() {
  const tenantIds = await getActiveTenantIds();
  console.log(`[metrics] Writing snapshots for ${tenantIds.length} active tenant(s): ${tenantIds.join(", ")}`);
  const allResults: Record<string, any> = {};

  for (const tid of tenantIds) {
    await seedPreviousPeriodSnapshots(tid);
    const weekResults = await writeSnapshot(tid, "week");
    const quarterResults = await writeSnapshot(tid, "quarter");
    allResults[tid] = { week: weekResults, quarter: quarterResults };
  }
  return allResults;
}

export type SnapshotDelta = {
  wow: { deltaPercent: number | null; deltaLabel: string | null; direction: "up" | "down" | "flat" | null };
  qoq: { deltaPercent: number | null; deltaLabel: string | null; direction: "up" | "down" | "flat" | null };
};

export async function getSnapshotDeltas(tenantId: string): Promise<Record<string, SnapshotDelta>> {
  const { computeDelta } = await import("../utils/metrics");

  const thisWeek = weekBounds(0);
  const lastWeek = weekBounds(-1);
  const thisQuarter = quarterBounds(0);
  const lastQuarter = quarterBounds(-1);

  const allSnapshots = await db.select().from(metricSnapshots)
    .where(eq(metricSnapshots.tenantId, tenantId))
    .orderBy(desc(metricSnapshots.createdAt));

  const find = (key: string, start: Date, end: Date) => {
    return allSnapshots.find(s =>
      s.metricKey === key &&
      new Date(s.periodStart).getTime() === start.getTime() &&
      new Date(s.periodEnd).getTime() === end.getTime()
    );
  };

  const metricKeys = [
    'active_opportunities_count', 'active_bids_count', 'pipeline_value',
    'weighted_pipeline_value', 'pending_approvals_count', 'at_risk_count',
    'awarded_this_month_count',
  ];

  const result: Record<string, SnapshotDelta> = {};

  for (const key of metricKeys) {
    const currentWeekSnap = find(key, thisWeek.start, thisWeek.end);
    const prevWeekSnap = find(key, lastWeek.start, lastWeek.end);
    const currentQtrSnap = find(key, thisQuarter.start, thisQuarter.end);
    const prevQtrSnap = find(key, lastQuarter.start, lastQuarter.end);

    const wow = computeDelta(
      currentWeekSnap ? Number(currentWeekSnap.metricValue) : null,
      prevWeekSnap ? Number(prevWeekSnap.metricValue) : null,
      { previousIsSeeded: prevWeekSnap?.isSeeded === true, currentIsSeeded: currentWeekSnap?.isSeeded === true }
    );

    const qoq = computeDelta(
      currentQtrSnap ? Number(currentQtrSnap.metricValue) : null,
      prevQtrSnap ? Number(prevQtrSnap.metricValue) : null,
      { previousIsSeeded: prevQtrSnap?.isSeeded === true, currentIsSeeded: currentQtrSnap?.isSeeded === true }
    );

    result[key] = { wow, qoq };
  }

  return result;
}
