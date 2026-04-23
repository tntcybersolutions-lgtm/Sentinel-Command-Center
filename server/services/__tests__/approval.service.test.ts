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

import {
  approvalService,
  registerApprovalDispatcher,
  __clearApprovalDispatchers,
} from "../approval.service";
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

  // Captures the values passed to db.insert(approvalActions).values(...)
  // so tests can assert on the row shape (e.g. that notes pass through).
  let lastInsertValues: any = null;

  function wireDecisionMocks(
    options: { priorAction?: { id: string; decision: string } } = {},
  ) {
    lastInsertValues = null;
    (db.select as any).mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () =>
            options.priorAction ? [options.priorAction] : [],
        }),
      }),
    });
    (db.insert as any).mockReturnValue({
      values: (v: any) => {
        lastInsertValues = v;
        return {
          returning: async () => [{ id: "action-1" }],
        };
      },
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

  it("is idempotent: second decide returns the prior outcome without inserting again", async () => {
    // A prior approval already exists for this request. The second
    // decide call should short-circuit — no new action row, no request
    // status update, no audit event.
    wireDecisionMocks({ priorAction: { id: "action-prior", decision: "approved" } });
    const result = await approvalService.processDecision(
      { requestId: "req-already-decided", actor: "user-1", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(true);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(auditService.logEvent).not.toHaveBeenCalled();
  });

  it("idempotency honors the prior outcome — even if a later caller says 'approved', a prior denial wins", async () => {
    wireDecisionMocks({ priorAction: { id: "action-prior", decision: "denied" } });
    const result = await approvalService.processDecision(
      { requestId: "req-already-denied", actor: "user-2", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(false);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejecting with a reason stores the notes verbatim in approval_actions", async () => {
    wireDecisionMocks();
    await approvalService.processDecision(
      {
        requestId: "req-5",
        actor: "user-1",
        decision: "denied",
        notes: "Missing insurance limits — bond amount short of requirement.",
      },
      "tenant-1",
    );
    expect(lastInsertValues.notes).toBe(
      "Missing insurance limits — bond amount short of requirement.",
    );
    expect(lastInsertValues.decision).toBe("denied");
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

describe("approvalService — dispatcher registry (Phase 1 Feature 10)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearApprovalDispatchers();
  });

  // Shared mock chain for these tests — select() needs to answer both
  // the idempotency check (no prior action) AND the post-decision
  // actionType lookup. We route by whether the chained from() was
  // called with approvalActions or approvalRequests by inspecting
  // the table's string identity.
  function wireMocksForAction(actionType: string) {
    let selectCallCount = 0;
    (db.select as any).mockImplementation(() => ({
      from: (_tbl: any) => ({
        where: () => ({
          limit: async () => {
            selectCallCount++;
            // First select is the idempotency check on approvalActions.
            if (selectCallCount === 1) return [];
            // Second select is the post-audit actionType lookup.
            return [{ actionType }];
          },
        }),
      }),
    }));
    (db.insert as any).mockReturnValue({
      values: () => ({ returning: async () => [{ id: "action-1" }] }),
    });
    (db.update as any).mockReturnValue({
      set: () => ({ where: async () => ({ rowCount: 1 }) }),
    });
  }

  it("fires the registered dispatcher on approval for that action type", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerApprovalDispatcher("draft_external_message", dispatcher);
    wireMocksForAction("draft_external_message");

    const result = await approvalService.processDecision(
      { requestId: "req-ext-1", actor: "user-1", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(true);
    expect(dispatcher).toHaveBeenCalledOnce();
    expect(dispatcher).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      requestId: "req-ext-1",
      actor: "user-1",
      notes: undefined,
    });
  });

  it("does NOT fire the dispatcher on denial", async () => {
    const dispatcher = vi.fn().mockResolvedValue(undefined);
    registerApprovalDispatcher("draft_external_message", dispatcher);
    wireMocksForAction("draft_external_message");

    await approvalService.processDecision(
      { requestId: "req-ext-2", actor: "user-1", decision: "denied", notes: "no" },
      "tenant-1",
    );
    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("ignores actions with no registered dispatcher without throwing", async () => {
    // No dispatcher registered for "draft_rfi".
    wireMocksForAction("draft_rfi");
    const result = await approvalService.processDecision(
      { requestId: "req-rfi-1", actor: "user-1", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(true);
  });

  it("swallows dispatcher errors so the decision still lands", async () => {
    const boom = vi
      .fn()
      .mockRejectedValue(new Error("downstream offline"));
    registerApprovalDispatcher("draft_rfi", boom);
    wireMocksForAction("draft_rfi");

    const consoleErr = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const result = await approvalService.processDecision(
      { requestId: "req-boom", actor: "user-1", decision: "approved" },
      "tenant-1",
    );
    expect(result).toBe(true); // decision still counts as approved
    expect(boom).toHaveBeenCalledOnce();
    expect(consoleErr).toHaveBeenCalled();
    consoleErr.mockRestore();
  });
});
