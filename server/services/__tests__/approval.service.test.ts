import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be declared before importing the service under test so that
// the service's own imports resolve to these doubles.
vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../audit.service", () => ({
  auditService: {
    logEvent: vi.fn().mockResolvedValue(undefined),
  },
}));

import { approvalService } from "../approval.service";
import { db } from "../../db";
import { auditService } from "../audit.service";

describe("approvalService.createRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts an approval request and returns the new id", async () => {
    (db.insert as any).mockReturnValue({
      values: () => ({
        returning: async () => [{ id: "req-abc" }],
      }),
    });

    const id = await approvalService.createRequest({
      tenantId: "tenant-1",
      entityType: "document",
      entityId: "doc-1",
      actionType: "document_release",
      requestedBy: "user-1",
    });

    expect(id).toBe("req-abc");
    expect(db.insert).toHaveBeenCalledOnce();
    expect(auditService.logEvent).toHaveBeenCalledOnce();
    const [auditCall] = (auditService.logEvent as any).mock.calls;
    expect(auditCall[0]).toMatchObject({
      eventType: "approval_request_created",
      actor: "user-1",
      entityType: "approval_request",
      entityId: "req-abc",
    });
  });
});

describe("approvalService.processDecision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function wireDecisionMocks() {
    (db.insert as any).mockReturnValue({
      values: () => ({
        returning: async () => [{ id: "action-1" }],
      }),
    });
    (db.update as any).mockReturnValue({
      set: () => ({
        where: async () => ({ rowCount: 1 }),
      }),
    });
  }

  it("returns true when the decision is 'approved'", async () => {
    wireDecisionMocks();
    const result = await approvalService.processDecision(
      { requestId: "req-1", actor: "user-1", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(true);
  });

  it("returns false when the decision is 'denied' and logs approval_denied", async () => {
    wireDecisionMocks();
    const result = await approvalService.processDecision(
      { requestId: "req-2", actor: "user-1", decision: "denied", notes: "incomplete" },
      "tenant-1",
    );
    expect(result).toBe(false);
    const [auditCall] = (auditService.logEvent as any).mock.calls;
    expect(auditCall[0].eventType).toBe("approval_denied");
  });

  it("records an approval_actions row even on denial", async () => {
    wireDecisionMocks();
    await approvalService.processDecision(
      { requestId: "req-3", actor: "user-1", decision: "denied" },
      "tenant-1",
    );
    expect(db.insert).toHaveBeenCalledOnce();
    expect(db.update).toHaveBeenCalledOnce();
  });
});

describe("approvalService.checkApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { approved: false } when no matching approved request exists", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    });

    const result = await approvalService.checkApproval(
      "tenant-1",
      "document",
      "doc-1",
      "document_release",
    );
    expect(result).toEqual({ approved: false });
  });

  it("returns { approved: true, requestId } when an approved record is found", async () => {
    (db.select as any).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "req-approved" }],
        }),
      }),
    });

    const result = await approvalService.checkApproval(
      "tenant-1",
      "document",
      "doc-1",
      "document_release",
    );
    expect(result).toEqual({ approved: true, requestId: "req-approved" });
  });
});

// TODO (Phase 1 Roadmap, Feature 10):
// Prescribed behaviors from HERBIE.md not yet implemented in the service
// contract. Kept as .skip markers so they turn into tests as soon as the
// corresponding feature lands.
describe("approvalService — prescribed Phase 1 behaviors (not yet implemented)", () => {
  it.skip("double-approve on the same request is idempotent (no duplicate action row)", () => {});
  it.skip("a draft_external_message approval triggers the configured outbound dispatcher", () => {});
  it.skip("rejecting with a reason stores it verbatim in approval_actions.notes", () => {});
});
