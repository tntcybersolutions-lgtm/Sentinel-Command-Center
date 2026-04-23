import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so that queries can be made to throw on demand.
// The service's design is graceful degradation: when the DB rejects,
// it falls back to in-process Map storage or default values.
vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

import {
  getPreferences,
  updatePreferences,
  getPatterns,
  getMemorySummary,
  upsertPlaybookRule,
  storeInteraction,
} from "../herbie-memory.service";
import { db } from "../../db";

function makeDbAlwaysReject(reason = "db unavailable") {
  const rejecting: any = () => Promise.reject(new Error(reason));
  // select().from().where().limit() chain
  (db.select as any).mockReturnValue({
    from: () => ({
      where: () => ({
        limit: rejecting,
        orderBy: () => ({
          limit: rejecting,
        }),
      }),
    }),
  });
  // insert().values().onConflictDoNothing()
  (db.insert as any).mockReturnValue({
    values: () => ({
      onConflictDoNothing: rejecting,
      returning: rejecting,
      then: (resolve: any, reject: any) => rejecting().then(resolve, reject),
    }),
  });
  // update().set().where()
  (db.update as any).mockReturnValue({
    set: () => ({ where: rejecting }),
  });
  (db.execute as any).mockImplementation(rejecting);
}

// The service keeps a module-level in-memory Map as its DB-rejection
// fallback. To stay isolated across tests we give each test its own
// (tenantId, userId) pair — otherwise state from one test leaks into
// the next. Using a fresh nonce per test keeps assertions reliable.
function freshIds() {
  const n = Math.random().toString(36).slice(2, 10);
  return { tenantId: `tenant-${n}`, userId: `user-${n}` };
}

describe("herbie-memory — graceful DB-failure behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    makeDbAlwaysReject();
  });

  it("getPreferences returns a sensible default when the DB rejects", async () => {
    const { tenantId, userId } = freshIds();
    const prefs = await getPreferences(tenantId, userId);
    expect(prefs).toMatchObject({
      tone: "professional",
      format: "bullets",
      role: "owner",
    });
    expect(Array.isArray(prefs.priorities)).toBe(true);
  });

  it("updatePreferences does not throw when the DB is unreachable", async () => {
    const { tenantId, userId } = freshIds();
    await expect(
      updatePreferences(tenantId, userId, { tone: "terse", role: "pm" }),
    ).resolves.not.toThrow();
  });

  it("getPatterns returns an empty pattern set when the DB rejects", async () => {
    const { tenantId, userId } = freshIds();
    const patterns = await getPatterns(tenantId, userId);
    expect(patterns).toEqual({
      recurringIssues: [],
      automationCandidates: [],
      trainingOpportunities: [],
    });
  });

  it("getMemorySummary composes a summary from defaults and returns a non-empty string", async () => {
    const { tenantId, userId } = freshIds();
    const summary = await getMemorySummary(tenantId, userId);
    expect(typeof summary).toBe("string");
    expect(summary).toContain("Preferences:");
    expect(summary).toContain("role=owner");
  });

  it("upsertPlaybookRule swallows DB failures silently (graceful degradation)", async () => {
    const { tenantId } = freshIds();
    await expect(
      upsertPlaybookRule(tenantId, {
        name: "rfi_turnaround",
        rule: "RFI turnaround: 3 business days",
        category: "rfi",
        description: "Tighter SLA for premium tier",
      }),
    ).resolves.not.toThrow();
  });

  it("storeInteraction swallows DB failures and falls back to in-memory store", async () => {
    const { tenantId, userId } = freshIds();
    await expect(
      storeInteraction(
        tenantId,
        userId,
        { query: "status on ABC project" },
        { reply: "on track" },
        { risks: [] },
      ),
    ).resolves.not.toThrow();
  });
});

// TODO (Phase 1 Roadmap, Feature 8 — three-layer Herbie memory):
// These describe behaviors prescribed by HERBIE.md but not yet
// implemented in the service. Each becomes a real test when its
// feature lands.
describe("herbie-memory — prescribed Phase 1 behaviors (not yet implemented)", () => {
  it.skip("record_fact writes to herbie_facts with source_id and confidence", () => {});
  it.skip("a fact with conflicting predicate marks the prior fact superseded_by instead of deleting", () => {});
  it.skip("confidence < 0.7 routes to herbie_review_queue, not herbie_facts", () => {});
  it.skip("record_decision writes to herbie_decisions with rationale and decided_by", () => {});
  it.skip("herbie_relationships upsert is idempotent on (tenant, project, contact, role)", () => {});
});
