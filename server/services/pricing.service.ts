import { db } from "../db";
import { bidPricingSnapshots, pricingHistory, bidProjects, opportunities, buyers } from "@shared/schema";
import { eq, and, or, desc } from "drizzle-orm";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

export const pricingService = {
  async computeBaseline(tenantId: string, bidProjectId: string) {
    const bid = await db
      .select()
      .from(bidProjects)
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (!bid.length) return null;

    const opp = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, bid[0].opportunityId))
      .limit(1);

    const naicsCodes = opp[0]?.naicsCodes || [];
    let agencyName: string | null = null;
    if (opp[0]?.buyerId) {
      const buyer = await db
        .select()
        .from(buyers)
        .where(eq(buyers.id, opp[0].buyerId))
        .limit(1);
      agencyName = buyer[0]?.name || null;
    }

    let history = await db
      .select()
      .from(pricingHistory)
      .where(eq(pricingHistory.tenantId, tenantId));

    let matched = history.filter((h) => {
      const naicsMatch = naicsCodes.length === 0 || (h.naicsCode && naicsCodes.includes(h.naicsCode));
      const agencyMatch = !agencyName || h.agency === agencyName;
      return naicsMatch || agencyMatch;
    });

    if (matched.length === 0) {
      matched = history;
    }

    if (matched.length === 0) return null;

    const values = matched
      .map((h) => Number(h.awardValue || h.bidValue || 0))
      .filter((v) => v > 0);

    if (values.length === 0) return null;

    const medianValue = median(values);
    const meanValue = values.reduce((a, b) => a + b, 0) / values.length;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const q25 = percentile(values, 25);
    const q75 = percentile(values, 75);

    const wonCount = matched.filter((h) => h.outcome === "won").length;
    const totalWithOutcome = matched.filter((h) => h.outcome === "won" || h.outcome === "lost").length;
    const winRate = totalWithOutcome > 0 ? Math.round((wonCount / totalWithOutcome) * 100) : null;

    return {
      medianValue,
      meanValue,
      minValue,
      maxValue,
      q25,
      q75,
      winRate,
      sampleSize: matched.length,
      competitiveFloor: minValue * 1.05,
    };
  },

  async compareCurrentToBaseline(tenantId: string, bidProjectId: string) {
    const snapshots = await db
      .select()
      .from(bidPricingSnapshots)
      .where(
        and(
          eq(bidPricingSnapshots.tenantId, tenantId),
          eq(bidPricingSnapshots.bidProjectId, bidProjectId)
        )
      )
      .orderBy(desc(bidPricingSnapshots.createdAt))
      .limit(1);

    const snapshot = snapshots[0] || null;
    const baseline = await this.computeBaseline(tenantId, bidProjectId);

    let comparison = null;
    if (snapshot && baseline && snapshot.estimatedValue) {
      const currentValue = Number(snapshot.estimatedValue);
      const delta = currentValue - baseline.medianValue;
      const deltaPercent = baseline.medianValue > 0 ? (delta / baseline.medianValue) * 100 : 0;

      let winProbability = baseline.winRate || 50;
      if (delta < 0) {
        winProbability = Math.min(95, winProbability + Math.abs(deltaPercent) * 0.5);
      } else if (delta > 0) {
        winProbability = Math.max(5, winProbability - deltaPercent * 0.5);
      }
      winProbability = Math.round(winProbability);

      const costBreakdown = snapshot.costBreakdown as Record<string, number> | null;
      const totalCost = costBreakdown
        ? Object.values(costBreakdown).reduce((a: number, b: number) => a + (Number(b) || 0), 0)
        : null;
      const marginSafety = totalCost ? totalCost * 1.05 : null;

      comparison = {
        currentValue,
        delta,
        deltaPercent: Math.round(deltaPercent * 10) / 10,
        winProbability,
        marginPercent: snapshot.marginPercent ? Number(snapshot.marginPercent) : null,
        costBreakdown,
        marginSafety,
        notes: snapshot.notes,
        snapshotId: snapshot.id,
        snapshotCreatedAt: snapshot.createdAt,
      };
    }

    return {
      baseline,
      snapshot: snapshot
        ? {
            id: snapshot.id,
            estimatedValue: snapshot.estimatedValue ? Number(snapshot.estimatedValue) : null,
            marginPercent: snapshot.marginPercent ? Number(snapshot.marginPercent) : null,
            costBreakdown: snapshot.costBreakdown,
            notes: snapshot.notes,
            createdAt: snapshot.createdAt,
          }
        : null,
      comparison,
    };
  },

  async createSnapshot(
    tenantId: string,
    data: {
      bidProjectId: string;
      estimatedValue?: string;
      costBreakdown?: Record<string, number>;
      marginPercent?: string;
      notes?: string;
    }
  ) {
    const [result] = await db
      .insert(bidPricingSnapshots)
      .values({
        tenantId,
        bidProjectId: data.bidProjectId,
        estimatedValue: data.estimatedValue || null,
        costBreakdown: data.costBreakdown || null,
        marginPercent: data.marginPercent || null,
        notes: data.notes || null,
      })
      .returning();
    return result;
  },

  async addHistoryEntry(
    tenantId: string,
    data: {
      naicsCode?: string;
      agency?: string;
      region?: string;
      awardValue?: string;
      bidValue?: string;
      outcome?: string;
      awardedAt?: string;
      projectDescription?: string;
    }
  ) {
    const [result] = await db
      .insert(pricingHistory)
      .values({
        tenantId,
        naicsCode: data.naicsCode || null,
        agency: data.agency || null,
        region: data.region || null,
        awardValue: data.awardValue || null,
        bidValue: data.bidValue || null,
        outcome: data.outcome || null,
        awardedAt: data.awardedAt ? new Date(data.awardedAt) : null,
        projectDescription: data.projectDescription || null,
      })
      .returning();
    return result;
  },

  async listHistory(tenantId: string) {
    return db
      .select()
      .from(pricingHistory)
      .where(eq(pricingHistory.tenantId, tenantId))
      .orderBy(desc(pricingHistory.createdAt));
  },
};
