import { db } from "../db";
import { 
  bidReadinessScores, 
  bidProjects, 
  bidChecklists, 
  bidChecklistItems,
  jacketFolders,
  jacketDocuments,
  bidAddenda,
  bidForms,
  herbieExtractionEvidence,
  documentAlerts,
  BID_JACKET_FOLDERS,
} from "@shared/schema";
import { eq, and, sql, desc, inArray, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

interface MissingItem {
  category: string;
  item: string;
  severity: "critical" | "warning" | "info";
  description: string;
}

interface CategoryScore {
  score: number;
  weight: number;
  items: { name: string; present: boolean; required: boolean }[];
}

const READINESS_SORT_ORDERS = {
  SOLICITATION: 1,
  AMENDMENTS: 2,
  RFIS_QA: 4,
  ESTIMATING: 5,
  SUB_QUOTES: 6,
  INSURANCE_BONDING: 7,
  FORMS_CERTS: 8,
  PAST_PERFORMANCE: 9,
  TECHNICAL: 10,
  PRICING: 11,
  SUBMISSION: 12,
} as const;

export class BidReadinessService {
  private tenantId: string;

  private readonly WEIGHTS = {
    solicitation: 10,
    forms: 15,
    insurance: 20,
    bonding: 20,
    pricing: 15,
    technical: 10,
    pastPerformance: 5,
    subQuotes: 5,
  };

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  private async getDocCountsBySortOrder(
    bidProjectId: string,
    sortOrders: number[]
  ): Promise<Map<number, number>> {
    if (sortOrders.length === 0) return new Map();

    const rows = await db
      .select({
        sortOrder: jacketFolders.sortOrder,
        docCount: sql<number>`count(${jacketDocuments.id})`.mapWith(Number),
      })
      .from(jacketFolders)
      .leftJoin(
        jacketDocuments,
        and(
          eq(jacketDocuments.folderId, jacketFolders.id),
          eq(jacketDocuments.status, "active")
        )
      )
      .where(
        and(
          eq(jacketFolders.tenantId, this.tenantId),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId),
          inArray(jacketFolders.sortOrder, sortOrders)
        )
      )
      .groupBy(jacketFolders.sortOrder);

    const map = new Map<number, number>();
    for (const r of rows) map.set(r.sortOrder, r.docCount);
    return map;
  }

  private async hasBidForm(bidProjectId: string): Promise<boolean> {
    const form = await db
      .select({ id: bidForms.id })
      .from(bidForms)
      .where(
        and(
          eq(bidForms.tenantId, this.tenantId),
          eq(bidForms.bidProjectId, bidProjectId)
        )
      )
      .limit(1);
    return form.length > 0;
  }

  private async hasEvidenceForCategory(bidProjectId: string, category: string): Promise<boolean> {
    const evidence = await db.select({ count: sql<number>`count(*)` })
      .from(herbieExtractionEvidence)
      .where(and(
        eq(herbieExtractionEvidence.tenantId, this.tenantId),
        eq(herbieExtractionEvidence.bidProjectId, bidProjectId),
        eq(herbieExtractionEvidence.fieldCategory, category)
      ));

    return Number(evidence[0]?.count || 0) > 0;
  }

  async calculateCategoryScores(bidProjectId: string): Promise<Record<string, CategoryScore>> {
    const allSortOrders = Object.values(READINESS_SORT_ORDERS);
    const docCounts = await this.getDocCountsBySortOrder(bidProjectId, [...allSortOrders]);

    const get = (so: number) => docCounts.get(so) ?? 0;

    const solicitationDocs = get(READINESS_SORT_ORDERS.SOLICITATION);
    const amendmentDocs = get(READINESS_SORT_ORDERS.AMENDMENTS);
    const formsDocs = get(READINESS_SORT_ORDERS.FORMS_CERTS);
    const insuranceDocs = get(READINESS_SORT_ORDERS.INSURANCE_BONDING);
    const pastPerfDocs = get(READINESS_SORT_ORDERS.PAST_PERFORMANCE);
    const technicalDocs = get(READINESS_SORT_ORDERS.TECHNICAL);
    const pricingDocs = get(READINESS_SORT_ORDERS.PRICING);
    const subQuoteDocs = get(READINESS_SORT_ORDERS.SUB_QUOTES);

    const hasInsuranceEvidence = await this.hasEvidenceForCategory(bidProjectId, "insurance");
    const hasBondingEvidence = await this.hasEvidenceForCategory(bidProjectId, "bonding");

    const bidFormExists = await this.hasBidForm(bidProjectId);

    const addenda = await db.select({ count: sql<number>`count(*)` })
      .from(bidAddenda)
      .where(and(
        eq(bidAddenda.tenantId, this.tenantId),
        eq(bidAddenda.bidProjectId, bidProjectId)
      ));

    const acknowledgedAddenda = await db.select({ count: sql<number>`count(*)` })
      .from(bidAddenda)
      .where(and(
        eq(bidAddenda.tenantId, this.tenantId),
        eq(bidAddenda.bidProjectId, bidProjectId),
        eq(bidAddenda.acknowledged, true)
      ));

    return {
      solicitation: {
        score: solicitationDocs > 0 ? 100 : 0,
        weight: this.WEIGHTS.solicitation,
        items: [
          { name: "Solicitation Document", present: solicitationDocs > 0, required: true },
          { name: "Amendments Acknowledged", present: Number(addenda[0]?.count) === Number(acknowledgedAddenda[0]?.count), required: amendmentDocs > 0 },
        ],
      },
      forms: {
        score: formsDocs > 0 ? (bidFormExists ? 100 : 75) : 0,
        weight: this.WEIGHTS.forms,
        items: [
          { name: "Required Forms", present: formsDocs > 0, required: true },
          { name: "Bid Form Created", present: bidFormExists, required: true },
          { name: "Reps & Certs", present: formsDocs >= 2, required: true },
        ],
      },
      insurance: {
        score: insuranceDocs > 0 && hasInsuranceEvidence ? 100 : (insuranceDocs > 0 ? 50 : 0),
        weight: this.WEIGHTS.insurance,
        items: [
          { name: "Insurance Certificate", present: insuranceDocs > 0, required: true },
          { name: "Coverage Verified", present: hasInsuranceEvidence, required: true },
        ],
      },
      bonding: {
        score: hasBondingEvidence ? 100 : 0,
        weight: this.WEIGHTS.bonding,
        items: [
          { name: "Bid Bond", present: hasBondingEvidence, required: true },
          { name: "Bonding Capacity Verified", present: hasBondingEvidence, required: true },
        ],
      },
      pricing: {
        score: pricingDocs > 0 ? 100 : 0,
        weight: this.WEIGHTS.pricing,
        items: [
          { name: "Pricing Volume", present: pricingDocs > 0, required: true },
          { name: "Cost Breakdown", present: pricingDocs >= 2, required: false },
        ],
      },
      technical: {
        score: technicalDocs > 0 ? 100 : 0,
        weight: this.WEIGHTS.technical,
        items: [
          { name: "Technical Proposal", present: technicalDocs > 0, required: true },
        ],
      },
      pastPerformance: {
        score: pastPerfDocs > 0 ? 100 : 0,
        weight: this.WEIGHTS.pastPerformance,
        items: [
          { name: "Past Performance References", present: pastPerfDocs > 0, required: true },
        ],
      },
      subQuotes: {
        score: subQuoteDocs > 0 ? 100 : 50,
        weight: this.WEIGHTS.subQuotes,
        items: [
          { name: "Subcontractor Quotes", present: subQuoteDocs > 0, required: false },
        ],
      },
    };
  }

  async calculateReadinessScore(bidProjectId: string): Promise<{
    overallScore: number;
    status: "critical" | "warning" | "ready" | "submitted";
    categoryScores: Record<string, number>;
    missingItems: MissingItem[];
  }> {
    const bid = await db.select()
      .from(bidProjects)
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length === 0) {
      throw new Error(`BID_NOT_FOUND:${bidProjectId}`);
    }

    const categoryScores = await this.calculateCategoryScores(bidProjectId);
    
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const missingItems: MissingItem[] = [];
    let hasCriticalMissing = false;
    let hasWarningMissing = false;

    for (const [category, data] of Object.entries(categoryScores)) {
      totalWeightedScore += (data.score / 100) * data.weight;
      totalWeight += data.weight;

      for (const item of data.items) {
        if (item.required && !item.present) {
          const isCritical = category === "insurance" || category === "bonding";
          const severity = isCritical ? "critical" : "warning";
          
          if (isCritical) hasCriticalMissing = true;
          else hasWarningMissing = true;

          missingItems.push({
            category,
            item: item.name,
            severity,
            description: `Required ${item.name.toLowerCase()} is missing from ${category} section`,
          });
        }
      }
    }

    const overallScore = Math.round((totalWeightedScore / totalWeight) * 100);
    
    let status: "critical" | "warning" | "ready" | "submitted";
    if (bid[0].status === "submitted") {
      status = "submitted";
    } else if (hasCriticalMissing) {
      status = "critical";
    } else if (hasWarningMissing) {
      status = "warning";
    } else if (overallScore >= 90) {
      status = "ready";
    } else {
      status = "warning";
    }

    return {
      overallScore,
      status,
      categoryScores: Object.fromEntries(
        Object.entries(categoryScores).map(([k, v]) => [k, v.score])
      ),
      missingItems,
    };
  }

  async updateReadinessScore(bidProjectId: string): Promise<void> {
    const result = await this.calculateReadinessScore(bidProjectId);

    const existing = await db.select()
      .from(bidReadinessScores)
      .where(eq(bidReadinessScores.bidProjectId, bidProjectId))
      .limit(1);

    const scoreData = {
      tenantId: this.tenantId,
      bidProjectId,
      overallScore: result.overallScore,
      status: result.status,
      solicitationScore: result.categoryScores.solicitation || 0,
      formsScore: result.categoryScores.forms || 0,
      insuranceScore: result.categoryScores.insurance || 0,
      bondingScore: result.categoryScores.bonding || 0,
      pricingScore: result.categoryScores.pricing || 0,
      technicalScore: result.categoryScores.technical || 0,
      pastPerformanceScore: result.categoryScores.pastPerformance || 0,
      subQuotesScore: result.categoryScores.subQuotes || 0,
      missingItemsJson: result.missingItems,
      criticalMissingCount: result.missingItems.filter(i => i.severity === "critical").length,
      warningMissingCount: result.missingItems.filter(i => i.severity === "warning").length,
      lastCalculatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db.update(bidReadinessScores)
        .set({ ...scoreData, updatedAt: new Date() })
        .where(eq(bidReadinessScores.id, existing[0].id));
    } else {
      await db.insert(bidReadinessScores).values({
        id: randomUUID(),
        ...scoreData,
      });
    }

    const criticalMissing = result.missingItems.filter(i => i.severity === "critical");
    for (const item of criticalMissing) {
      await db.insert(documentAlerts).values({
        tenantId: this.tenantId,
        alertType: "missing_required",
        severity: "critical",
        bidId: bidProjectId,
        title: `Missing: ${item.item}`,
        message: item.description,
        status: "active",
      }).onConflictDoNothing();
    }
  }

  async getReadinessScore(bidProjectId: string): Promise<{
    overallScore: number;
    status: string;
    categoryScores: Record<string, number>;
    missingItems: MissingItem[];
    lastCalculatedAt: Date | null;
  }> {
    const bid = await db.select()
      .from(bidProjects)
      .where(eq(bidProjects.id, bidProjectId))
      .limit(1);

    if (bid.length === 0) {
      throw new Error(`BID_NOT_FOUND:${bidProjectId}`);
    }

    const score = await db.select()
      .from(bidReadinessScores)
      .where(eq(bidReadinessScores.bidProjectId, bidProjectId))
      .limit(1);

    if (score.length === 0) {
      await this.updateReadinessScore(bidProjectId);
      const refreshed = await db.select()
        .from(bidReadinessScores)
        .where(eq(bidReadinessScores.bidProjectId, bidProjectId))
        .limit(1);
      if (refreshed.length === 0) {
        throw new Error(`Failed to compute readiness for bid: ${bidProjectId}`);
      }
      return this.formatScore(refreshed[0]);
    }

    return this.formatScore(score[0]);
  }

  private formatScore(s: typeof bidReadinessScores.$inferSelect) {
    return {
      overallScore: s.overallScore,
      status: s.status,
      categoryScores: {
        solicitation: s.solicitationScore || 0,
        forms: s.formsScore || 0,
        insurance: s.insuranceScore || 0,
        bonding: s.bondingScore || 0,
        pricing: s.pricingScore || 0,
        technical: s.technicalScore || 0,
        pastPerformance: s.pastPerformanceScore || 0,
        subQuotes: s.subQuotesScore || 0,
      },
      missingItems: (s.missingItemsJson as MissingItem[]) || [],
      lastCalculatedAt: s.lastCalculatedAt,
    };
  }
}

export function createBidReadinessService(tenantId: string): BidReadinessService {
  return new BidReadinessService(tenantId);
}
