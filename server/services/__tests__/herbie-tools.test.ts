import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all backing services so we're testing the tool-dispatch seam
// rather than re-testing each service's internals.
const recordFactMock = vi.fn();
const recordDecisionMock = vi.fn();
const draftRfiMock = vi.fn();
const draftSubmittalMock = vi.fn();
const upsertVoiceMock = vi.fn();
const listForProjectMock = vi.fn();
const partitionByTierMock = vi.fn();
const coisExpiringWithinMock = vi.fn();
const draftMessageMock = vi.fn();

vi.mock("../herbie-facts.service", () => ({
  recordFact: (...a: any[]) => recordFactMock(...a),
  recordDecision: (...a: any[]) => recordDecisionMock(...a),
}));
vi.mock("../rfi-draft.service", () => ({
  draftRfi: (...a: any[]) => draftRfiMock(...a),
}));
vi.mock("../submittal-draft.service", () => ({
  draftSubmittal: (...a: any[]) => draftSubmittalMock(...a),
}));
vi.mock("../voice-daily-log.service", () => ({
  upsertVoiceDailyLog: (...a: any[]) => upsertVoiceMock(...a),
}));
vi.mock("../coi.service", () => ({
  listForProject: (...a: any[]) => listForProjectMock(...a),
  partitionByTier: (...a: any[]) => partitionByTierMock(...a),
  coisExpiringWithin: (...a: any[]) => coisExpiringWithinMock(...a),
}));
vi.mock("../outbound-message-draft.service", () => ({
  draftMessage: (...a: any[]) => draftMessageMock(...a),
}));

// herbie-tools.ts also writes to herbie_review_queue via db.insert;
// mock the db chain with a minimal returning stub.
const dbInsertMock = vi.fn();
vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: (_tbl: any) => ({
      values: (v: any) => {
        dbInsertMock(v);
        return {
          returning: async () => [{ id: "rq-1" }],
        };
      },
    }),
  },
}));

import {
  HERBIE_TOOL_SPECS,
  getHerbieToolSpec,
  executeHerbieTool,
} from "../herbie-tools";

const ctx = { tenantId: "t1", userId: "u1", projectId: "p1" };

function reset() {
  recordFactMock.mockReset();
  recordDecisionMock.mockReset();
  draftRfiMock.mockReset();
  draftSubmittalMock.mockReset();
  upsertVoiceMock.mockReset();
  listForProjectMock.mockReset();
  partitionByTierMock.mockReset();
  coisExpiringWithinMock.mockReset();
  draftMessageMock.mockReset();
  dbInsertMock.mockReset();
}

describe("herbie-tools — specs", () => {
  it("registers all 11 HERBIE.md tools", () => {
    const names = HERBIE_TOOL_SPECS.map((s) => s.name).sort();
    expect(names).toEqual(
      [
        "create_rfi",
        "create_submittal",
        "draft_message",
        "extract_fields",
        "flag_for_review",
        "get_project_status",
        "log_daily",
        "read_document",
        "record_decision",
        "record_fact",
        "search_project",
      ].sort(),
    );
  });

  it("every spec declares parameters with an object type + required list", () => {
    for (const s of HERBIE_TOOL_SPECS) {
      expect(s.parameters.type).toBe("object");
      expect(s.parameters.properties).toBeDefined();
    }
  });

  it("getHerbieToolSpec returns by name", () => {
    expect(getHerbieToolSpec("record_fact")?.name).toBe("record_fact");
    expect(getHerbieToolSpec("nope-missing")).toBeUndefined();
  });
});

describe("herbie-tools — dispatch", () => {
  beforeEach(reset);

  it("record_fact dispatches to herbie-facts.recordFact with tenant + project from context", async () => {
    recordFactMock.mockResolvedValue({ status: "persisted", factId: "f1" });
    const result = await executeHerbieTool(
      {
        tool: "record_fact",
        args: {
          subjectType: "vendor",
          subjectId: "v1",
          predicate: "coi_expires_at",
          object: "2026-05-15",
          sourceType: "document",
          sourceId: "doc-1",
          confidence: 0.92,
        },
      },
      ctx,
    );
    expect(result).toEqual({ success: true, data: { status: "persisted", factId: "f1" } });
    expect(recordFactMock).toHaveBeenCalledOnce();
    const arg = recordFactMock.mock.calls[0][0];
    expect(arg.tenantId).toBe("t1");
    expect(arg.projectId).toBe("p1"); // from ctx
    expect(arg.confidence).toBe(0.92);
  });

  it("create_rfi dispatches to rfi-draft.draftRfi and returns its result", async () => {
    draftRfiMock.mockResolvedValue({
      rfiId: "rfi-1",
      rfiNumber: "RFI-0001",
      approvalRequestId: "req-1",
    });
    const result = await executeHerbieTool(
      {
        tool: "create_rfi",
        args: { projectId: "p1", subject: "s", question: "q" },
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(draftRfiMock.mock.calls[0][0].draftedBy).toBe("u1");
  });

  it("create_submittal dispatches to submittal-draft.draftSubmittal", async () => {
    draftSubmittalMock.mockResolvedValue({
      submittalId: "s-1",
      submittalNumber: "SUB-0001",
      approvalRequestId: "req-2",
    });
    const r = await executeHerbieTool(
      { tool: "create_submittal", args: { projectId: "p1", name: "n" } },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(draftSubmittalMock).toHaveBeenCalledOnce();
  });

  it("flag_for_review writes to herbie_review_queue", async () => {
    const r = await executeHerbieTool(
      {
        tool: "flag_for_review",
        args: {
          reviewType: "fact_extraction",
          actionProposed: "approve: gc_name = Bergman",
          confidence: 0.65,
          reasoningText: "Below threshold",
          priority: 50,
        },
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(dbInsertMock).toHaveBeenCalledOnce();
    const values = dbInsertMock.mock.calls[0][0];
    expect(values.reviewType).toBe("fact_extraction");
    expect(values.priority).toBe(50);
    expect(values.confidence).toBe("0.65");
  });

  it("get_project_status assembles a COI rollup from coi.service", async () => {
    listForProjectMock.mockResolvedValue([
      { id: "c1" },
      { id: "c2" },
    ]);
    partitionByTierMock.mockReturnValue({
      expired: [{ id: "c1" }],
      critical_1d: [],
      critical_7d: [{ id: "c2" }],
      warning_14d: [],
      warning_30d: [],
      ok: [],
    });
    coisExpiringWithinMock.mockResolvedValue([
      { id: "c2", policyType: "gl", expiryDate: new Date("2026-05-10"), projectId: "p1" },
    ]);
    const r = await executeHerbieTool(
      { tool: "get_project_status", args: { projectId: "p1" } },
      ctx,
    );
    expect(r.success).toBe(true);
    const data = (r as any).data;
    expect(data.coi).toEqual({
      total: 2,
      expired: 1,
      critical: 1,
      warning: 0,
      ok: 0,
    });
    expect(data.coisExpiringSoon).toHaveLength(1);
  });

  it("log_daily dispatches to upsertVoiceDailyLog with a text-only transcriber", async () => {
    upsertVoiceMock.mockResolvedValue({ dailyLogId: "dl-1", transcript: "x", draft: {}, stubbed: { transcribe: true, extract: false } });
    const r = await executeHerbieTool(
      {
        tool: "log_daily",
        args: { projectId: "p1", transcript: "Clear day. Crew of 6." },
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(upsertVoiceMock).toHaveBeenCalledOnce();
    const arg = upsertVoiceMock.mock.calls[0][0];
    // The tool always injects a stub transcriber when called with a
    // transcript so the LLM can hand text without needing to upload
    // audio.
    expect(arg.transcriber).toBeDefined();
    const t = await arg.transcriber.transcribe(Buffer.from(""));
    expect(t.text).toBe("Clear day. Crew of 6.");
  });

  it("returns NOT_IMPLEMENTED for tools whose backing service isn't wired", async () => {
    for (const tool of ["read_document", "extract_fields", "search_project"]) {
      const r = await executeHerbieTool({ tool, args: {} }, ctx);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.code).toBe("NOT_IMPLEMENTED");
      }
    }
  });

  it("draft_message dispatches to outbound-message-draft.draftMessage", async () => {
    draftMessageMock.mockResolvedValue({
      draftId: "req-out-1",
      approvalRequestId: "req-out-1",
    });
    const r = await executeHerbieTool(
      {
        tool: "draft_message",
        args: {
          recipient: "vendor@acme.test",
          channel: "email",
          subject: "Renewal of GL COI",
          body: "Hi — your GL COI expires Friday. Can you send the renewal today?",
        },
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(draftMessageMock).toHaveBeenCalledOnce();
    const arg = draftMessageMock.mock.calls[0][0];
    expect(arg.tenantId).toBe("t1");
    expect(arg.projectId).toBe("p1");
    expect(arg.draftedBy).toBe("u1");
    expect(arg.recipient).toBe("vendor@acme.test");
  });

  it("returns UNKNOWN_TOOL for a tool not in the spec list", async () => {
    const r = await executeHerbieTool({ tool: "not_a_real_tool", args: {} }, ctx);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("UNKNOWN_TOOL");
  });

  it("returns HANDLER_ERROR when a backing service throws", async () => {
    draftRfiMock.mockRejectedValue(new Error("db down"));
    const r = await executeHerbieTool(
      {
        tool: "create_rfi",
        args: { projectId: "p1", subject: "s", question: "q" },
      },
      ctx,
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.code).toBe("HANDLER_ERROR");
      expect(r.error).toContain("db down");
    }
  });
});
