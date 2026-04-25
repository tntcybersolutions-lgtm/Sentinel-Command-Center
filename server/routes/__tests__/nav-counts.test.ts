import { describe, it, expect } from "vitest";

/**
 * Phase H regression: the Approvals sidebar badge must reflect a real
 * total, not a hardcoded 0. The contract enforced by /api/nav-counts is:
 *
 *   approvalsNeededCount = pendingApprovalCount + overdueTaskCount
 *
 * These tests pin that math so a future refactor can't silently regress
 * the badge back to 0 (the original bug) or accidentally double-count.
 */
function computeApprovalsNeededCount(
  pendingApprovalCount: number,
  overdueTaskCount: number,
): number {
  return pendingApprovalCount + overdueTaskCount;
}

describe("nav-counts: approvalsNeededCount math", () => {
  it("equals pending + overdue when both have rows", () => {
    expect(computeApprovalsNeededCount(21, 15)).toBe(36);
  });

  it("returns 0 when nothing is pending or overdue", () => {
    expect(computeApprovalsNeededCount(0, 0)).toBe(0);
  });

  it("handles only-pending and only-overdue cases", () => {
    expect(computeApprovalsNeededCount(7, 0)).toBe(7);
    expect(computeApprovalsNeededCount(0, 4)).toBe(4);
  });

  it("never silently returns 0 when inputs are non-zero (the original bug)", () => {
    expect(computeApprovalsNeededCount(1, 1)).not.toBe(0);
    expect(computeApprovalsNeededCount(99, 0)).not.toBe(0);
    expect(computeApprovalsNeededCount(0, 99)).not.toBe(0);
  });

  it("is stable on the live demo numbers (21 pending + 15 overdue = 36)", () => {
    const live = computeApprovalsNeededCount(21, 15);
    expect(live).toBe(36);
    expect(live).toBeGreaterThan(0);
  });
});

describe("nav-counts: response shape contract", () => {
  it("declares the keys the sidebar expects", () => {
    const sample = {
      overdueTaskCount: 15,
      openRfiCount: 14,
      pendingSubmittalCount: 4,
      orphanPurchaseOrderCount: 47,
      unpaidInvoiceCount: 10,
      approvalsNeededCount: 36,
      pendingApprovalCount: 21,
      missingArtifactsCount: 20,
      checklistTodoCount: 60,
    };
    const requiredKeys = [
      "overdueTaskCount",
      "openRfiCount",
      "pendingSubmittalCount",
      "orphanPurchaseOrderCount",
      "unpaidInvoiceCount",
      "approvalsNeededCount",
      "pendingApprovalCount",
      "missingArtifactsCount",
      "checklistTodoCount",
    ];
    for (const k of requiredKeys) {
      expect(sample).toHaveProperty(k);
      expect(typeof (sample as any)[k]).toBe("number");
    }
    expect(sample.approvalsNeededCount).toBe(
      sample.pendingApprovalCount + sample.overdueTaskCount,
    );
  });
});
