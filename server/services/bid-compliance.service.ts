import { db } from "../db";
import { complianceItems } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS_ORDER: Record<string, number> = { missing: 0, in_progress: 1, satisfied: 2 };

export const bidComplianceService = {
  async getComplianceSummary(tenantId: string, bidProjectId: string) {
    const items = await db
      .select()
      .from(complianceItems)
      .where(
        and(
          eq(complianceItems.tenantId, tenantId),
          eq(complianceItems.bidProjectId, bidProjectId)
        )
      );

    const total = items.length;
    const byStatus = {
      missing: items.filter((i) => i.status === "missing").length,
      in_progress: items.filter((i) => i.status === "in_progress").length,
      satisfied: items.filter((i) => i.status === "satisfied").length,
    };
    const bySeverity = {
      critical: items.filter((i) => i.severity === "critical").length,
      high: items.filter((i) => i.severity === "high").length,
      medium: items.filter((i) => i.severity === "medium").length,
      low: items.filter((i) => i.severity === "low").length,
    };

    const complianceScore = total > 0 ? Math.round((byStatus.satisfied / total) * 100) : 0;

    const criticalGaps = items.filter(
      (i) => i.severity === "critical" && i.status !== "satisfied"
    );
    const highRiskItems = items.filter(
      (i) => i.severity === "high" && i.status !== "satisfied"
    );

    const sorted = [...items].sort((a, b) => {
      const sevDiff = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
      if (sevDiff !== 0) return sevDiff;
      return (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    });

    return {
      total,
      byStatus,
      bySeverity,
      complianceScore,
      criticalGaps,
      highRiskItems,
      items: sorted,
    };
  },

  async generateFromSolicitation(tenantId: string, bidProjectId: string) {
    const defaults = [
      { title: "Technical Proposal Volume", severity: "critical", folderSortOrder: 10 },
      { title: "Pricing Schedule", severity: "critical", folderSortOrder: 11 },
      { title: "Past Performance References", severity: "critical", folderSortOrder: 12 },
      { title: "Representations and Certifications", severity: "high", folderSortOrder: 13 },
      { title: "Subcontracting Plan", severity: "high", folderSortOrder: 6 },
      { title: "Key Personnel Resumes", severity: "high", folderSortOrder: 10 },
      { title: "Safety Plan", severity: "medium", folderSortOrder: 7 },
      { title: "Quality Control Plan", severity: "medium", folderSortOrder: 7 },
      { title: "Bonding Documentation", severity: "critical", folderSortOrder: 4 },
      { title: "Insurance Certificates", severity: "high", folderSortOrder: 4 },
      { title: "Organizational Chart", severity: "medium", folderSortOrder: 10 },
      { title: "Small Business Participation Plan", severity: "medium", folderSortOrder: 13 },
      { title: "Wage Determination Acknowledgment", severity: "high", clauseRef: "FAR 22.1002" },
      { title: "Section 508 Compliance Statement", severity: "low", folderSortOrder: 10 },
    ];

    const existing = await db
      .select({ title: complianceItems.title })
      .from(complianceItems)
      .where(
        and(
          eq(complianceItems.tenantId, tenantId),
          eq(complianceItems.bidProjectId, bidProjectId)
        )
      );

    const existingTitles = new Set(existing.map((e) => e.title));

    const toInsert = defaults
      .filter((d) => !existingTitles.has(d.title))
      .map((d) => ({
        tenantId,
        bidProjectId,
        title: d.title,
        severity: d.severity,
        status: "missing" as const,
        clauseRef: (d as any).clauseRef || null,
        folderSortOrder: (d as any).folderSortOrder || null,
      }));

    if (toInsert.length > 0) {
      await db.insert(complianceItems).values(toInsert);
    }

    return { generated: toInsert.length, skipped: defaults.length - toInsert.length };
  },

  async updateItemStatus(tenantId: string, itemId: string, status: string) {
    const [updated] = await db
      .update(complianceItems)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(complianceItems.id, itemId),
          eq(complianceItems.tenantId, tenantId)
        )
      )
      .returning();
    return updated;
  },

  async deleteItem(tenantId: string, itemId: string) {
    const [deleted] = await db
      .delete(complianceItems)
      .where(
        and(
          eq(complianceItems.id, itemId),
          eq(complianceItems.tenantId, tenantId)
        )
      )
      .returning();
    return deleted;
  },
};
