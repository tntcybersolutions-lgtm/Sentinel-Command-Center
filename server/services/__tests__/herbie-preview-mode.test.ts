import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal mocks — same pattern as herbie-tools.test.ts.
// We only need the mocks to keep imports from blowing up; the preview-mode
// tests assert that the mocks are NOT called when the flag is on.
// ---------------------------------------------------------------------------
vi.mock("../herbie-facts.service", () => ({
  recordFact: vi.fn(),
  recordDecision: vi.fn(),
}));
vi.mock("../rfi-draft.service", () => ({ draftRfi: vi.fn() }));
vi.mock("../submittal-draft.service", () => ({ draftSubmittal: vi.fn() }));
vi.mock("../voice-daily-log.service", () => ({ upsertVoiceDailyLog: vi.fn() }));
vi.mock("../coi.service", () => ({
  listForProject: vi.fn(),
  partitionByTier: vi.fn(),
  coisExpiringWithin: vi.fn(),
}));
vi.mock("../outbound-message-draft.service", () => ({ draftMessage: vi.fn() }));
vi.mock("../rag.service", () => ({
  createRAGService: () => ({ search: vi.fn() }),
}));
vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: () => ({ values: () => ({ returning: async () => [{ id: "rq-1" }] }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
  },
}));

import {
  executeHerbieTool,
  WRITE_CAPABLE_TOOLS,
  isPreviewMode,
} from "../herbie-tools";
import * as facts from "../herbie-facts.service";
import * as rfi from "../rfi-draft.service";
import * as submittal from "../submittal-draft.service";
import * as voiceLog from "../voice-daily-log.service";
import * as msgDraft from "../outbound-message-draft.service";

const ctx = { tenantId: "t1", userId: "u1", projectId: "p1" };

function setPreviewMode(val: string | undefined) {
  if (val === undefined) {
    delete process.env.HERBIE_PREVIEW_MODE;
  } else {
    process.env.HERBIE_PREVIEW_MODE = val;
  }
}

afterEach(() => {
  setPreviewMode(undefined);
  vi.clearAllMocks();
});

describe("HERBIE_PREVIEW_MODE — flag helpers", () => {
  it("isPreviewMode returns false when env var is absent", () => {
    setPreviewMode(undefined);
    expect(isPreviewMode()).toBe(false);
  });

  it("isPreviewMode returns false when env var is 'false'", () => {
    setPreviewMode("false");
    expect(isPreviewMode()).toBe(false);
  });

  it("isPreviewMode returns true when env var is 'true'", () => {
    setPreviewMode("true");
    expect(isPreviewMode()).toBe(true);
  });

  it("WRITE_CAPABLE_TOOLS contains the expected write tools", () => {
    const expected = [
      "record_fact",
      "record_decision",
      "create_rfi",
      "create_submittal",
      "flag_for_review",
      "log_daily",
      "draft_message",
    ];
    for (const t of expected) {
      expect(WRITE_CAPABLE_TOOLS.has(t)).toBe(true);
    }
  });

  it("WRITE_CAPABLE_TOOLS does not contain read-only tools", () => {
    expect(WRITE_CAPABLE_TOOLS.has("get_project_status")).toBe(false);
    expect(WRITE_CAPABLE_TOOLS.has("search_project")).toBe(false);
    expect(WRITE_CAPABLE_TOOLS.has("read_document")).toBe(false);
    expect(WRITE_CAPABLE_TOOLS.has("extract_fields")).toBe(false);
  });
});

describe("HERBIE_PREVIEW_MODE — flag OFF (normal execution)", () => {
  beforeEach(() => setPreviewMode(undefined));

  it("record_fact runs the backing service (flag off)", async () => {
    (facts.recordFact as any).mockResolvedValue({ status: "persisted", factId: "f1" });
    const r = await executeHerbieTool(
      {
        tool: "record_fact",
        args: {
          subjectType: "vendor",
          predicate: "coi_expires_at",
          sourceType: "document",
          confidence: 0.9,
        },
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect((r as any).preview).toBeUndefined();
    expect(facts.recordFact).toHaveBeenCalledOnce();
  });

  it("draft_message runs the backing service (flag off)", async () => {
    (msgDraft.draftMessage as any).mockResolvedValue({
      draftId: "d1",
      approvalRequestId: "a1",
    });
    const r = await executeHerbieTool(
      {
        tool: "draft_message",
        args: { recipient: "v@acme.test", channel: "email", body: "hi" },
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect((r as any).preview).toBeUndefined();
    expect(msgDraft.draftMessage).toHaveBeenCalledOnce();
  });
});

describe("HERBIE_PREVIEW_MODE — flag ON (tools blocked)", () => {
  beforeEach(() => setPreviewMode("true"));

  it("returns preview payload for record_fact and does NOT call the backing service", async () => {
    const args = {
      subjectType: "vendor",
      predicate: "coi_expires_at",
      sourceType: "document",
      confidence: 0.9,
    };
    const r = await executeHerbieTool({ tool: "record_fact", args }, ctx);
    expect(r.success).toBe(true);
    expect((r as any).preview).toBe(true);
    expect((r as any).would_have).toEqual({ tool: "record_fact", args });
    expect(facts.recordFact).not.toHaveBeenCalled();
  });

  it("returns preview payload for create_rfi and does NOT call draftRfi", async () => {
    const args = { projectId: "p1", subject: "Concrete spec", question: "Which mix?" };
    const r = await executeHerbieTool({ tool: "create_rfi", args }, ctx);
    expect(r.success).toBe(true);
    expect((r as any).preview).toBe(true);
    expect((r as any).would_have.tool).toBe("create_rfi");
    expect(rfi.draftRfi).not.toHaveBeenCalled();
  });

  it("returns preview payload for create_submittal", async () => {
    const r = await executeHerbieTool(
      { tool: "create_submittal", args: { projectId: "p1", name: "Steel shop drawings" } },
      ctx,
    );
    expect((r as any).preview).toBe(true);
    expect(submittal.draftSubmittal).not.toHaveBeenCalled();
  });

  it("returns preview payload for log_daily", async () => {
    const r = await executeHerbieTool(
      { tool: "log_daily", args: { projectId: "p1", transcript: "Crew of 4." } },
      ctx,
    );
    expect((r as any).preview).toBe(true);
    expect(voiceLog.upsertVoiceDailyLog).not.toHaveBeenCalled();
  });

  it("returns preview payload for draft_message", async () => {
    const r = await executeHerbieTool(
      { tool: "draft_message", args: { recipient: "v@acme.test", channel: "email", body: "hi" } },
      ctx,
    );
    expect((r as any).preview).toBe(true);
    expect(msgDraft.draftMessage).not.toHaveBeenCalled();
  });

  it("returns preview payload for flag_for_review", async () => {
    const r = await executeHerbieTool(
      {
        tool: "flag_for_review",
        args: { reviewType: "fact_extraction", actionProposed: "approve x", confidence: 0.6 },
      },
      ctx,
    );
    expect((r as any).preview).toBe(true);
  });

  it("returns preview payload for record_decision", async () => {
    const r = await executeHerbieTool(
      { tool: "record_decision", args: { summary: "Go with option A", decidedBy: "u1" } },
      ctx,
    );
    expect((r as any).preview).toBe(true);
    expect(facts.recordDecision).not.toHaveBeenCalled();
  });

  it("read-only tool get_project_status is NOT blocked in preview mode", async () => {
    // get_project_status calls coi.service; the mocks return empty arrays, which
    // is fine — we just want to confirm it isn't intercepted by the preview gate.
    const { listForProject, partitionByTier, coisExpiringWithin } = await import("../coi.service");
    (listForProject as any).mockResolvedValue([]);
    (partitionByTier as any).mockReturnValue({
      expired: [], critical_1d: [], critical_7d: [],
      warning_14d: [], warning_30d: [], ok: [],
    });
    (coisExpiringWithin as any).mockResolvedValue([]);

    const r = await executeHerbieTool(
      { tool: "get_project_status", args: { projectId: "p1" } },
      ctx,
    );
    expect(r.success).toBe(true);
    expect((r as any).preview).toBeUndefined();
  });

  it("unknown tool still returns UNKNOWN_TOOL even in preview mode", async () => {
    const r = await executeHerbieTool({ tool: "send_missile", args: {} }, ctx);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.code).toBe("UNKNOWN_TOOL");
  });
});
