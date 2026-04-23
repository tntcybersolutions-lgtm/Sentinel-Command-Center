import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory row stores to emulate minimum Drizzle surface the service uses.
// This lets us test supersession / idempotency / confidence-routing logic
// without standing up a database.
interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  herbie_facts: [],
  herbie_decisions: [],
  herbie_relationships: [],
  herbie_review_queue: [],
};

function tableKey(arg: any): string {
  // Drizzle pgTable objects expose a Symbol-keyed name; fall back to a
  // toString() match to keep the mock readable across minor version diffs.
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  if (String(name).includes("herbie_facts")) return "herbie_facts";
  if (String(name).includes("herbie_decisions")) return "herbie_decisions";
  if (String(name).includes("herbie_relationships")) return "herbie_relationships";
  if (String(name).includes("herbie_review_queue")) return "herbie_review_queue";
  throw new Error(`Unexpected table in mock: ${String(name)}`);
}

let filterPredicate: ((row: DbRow) => boolean) | null = null;
let currentTable: string | null = null;

// Intercept drizzle's fluent chain with the minimum set of methods the
// service actually calls. Each method returns a shape that matches what
// the next chained call expects, terminating in a promise or array.
function makeDbMock() {
  return {
    insert: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        values: (vals: any) => {
          const row: DbRow = {
            id: `id-${store[currentTable!].length + 1}`,
            ...vals,
          };
          store[currentTable!].push(row);
          return {
            returning: async (cols?: any) => {
              if (cols && cols.id) return [{ id: row.id }];
              return [row];
            },
          };
        },
      };
    },
    select: (_cols?: any) => ({
      from: (tbl: any) => {
        currentTable = tableKey(tbl);
        filterPredicate = null;
        return {
          where: (pred: any) => {
            filterPredicate = pred;
            return {
              limit: async (_n: number) => {
                const rows = store[currentTable!].filter(
                  (r) => !filterPredicate || filterPredicate(r),
                );
                return rows.slice(0, _n);
              },
              orderBy: () => ({
                limit: async (_n: number) => {
                  const rows = store[currentTable!].filter(
                    (r) => !filterPredicate || filterPredicate(r),
                  );
                  return rows.slice(0, _n);
                },
              }),
            };
          },
        };
      },
    }),
    update: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        set: (patch: any) => ({
          where: (_pred: any) => {
            const target = store[currentTable!].find((r) => _pred(r));
            if (target) Object.assign(target, patch);
            return {
              returning: async () => (target ? [target] : []),
              // When the chain ends without .returning(), the service
              // doesn't await a returning — just resolve.
              then: (resolve: any) => resolve(target ? 1 : 0),
            };
          },
        }),
      };
    },
  };
}

// drizzle's `and`, `eq`, `isNull` are functions of the form
// (col, val) -> Predicate. We model them as row-predicate factories.
function buildPredicates() {
  return {
    and: (...preds: Array<(r: DbRow) => boolean>) => (r: DbRow) =>
      preds.every((p) => p(r)),
    eq: (col: any, val: any) => (r: DbRow) => r[colName(col)] === val,
    isNull: (col: any) => (r: DbRow) =>
      r[colName(col)] === null || r[colName(col)] === undefined,
    desc: (c: any) => c,
    sql: (..._args: any[]) => ({}),
  };
}

function colName(col: any): string {
  // Drizzle columns carry their column name on an internal symbol/prop.
  // We fall back to string introspection for robustness.
  const n =
    col?.name ||
    col?._?.name ||
    col?.[Symbol.for("drizzle:Name")] ||
    String(col);
  const m = String(n).match(/"([^"]+)"/);
  if (m) return snakeToCamel(m[1]);
  if (typeof n === "string") return snakeToCamel(n);
  return String(n);
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}

vi.mock("../../db", () => ({
  pool: {},
  db: makeDbMock(),
}));

// Partial-mock drizzle-orm — leave `relations` and others intact so that
// @shared/schema keeps working, but override the predicate helpers the
// service uses at call sites.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    ...buildPredicates(),
  };
});

// Now import under test.
import {
  recordFact,
  recordDecision,
  recordRelationship,
  getFacts,
  getDecisions,
  getRelationships,
  __peekCurrentFact,
  FACT_CONFIDENCE_THRESHOLD,
} from "../herbie-facts.service";

function reset() {
  store.herbie_facts.length = 0;
  store.herbie_decisions.length = 0;
  store.herbie_relationships.length = 0;
  store.herbie_review_queue.length = 0;
}

describe("herbie-facts — recordFact", () => {
  beforeEach(reset);

  it("persists a high-confidence fact with its source", async () => {
    const result = await recordFact({
      tenantId: "t1",
      projectId: "p1",
      subjectType: "vendor",
      subjectId: "v1",
      predicate: "coi_expires_at",
      object: "2026-05-15",
      sourceType: "document",
      sourceId: "doc-1",
      confidence: 0.92,
    });
    expect(result.status).toBe("persisted");
    expect(result.factId).toBeDefined();
    expect(store.herbie_facts).toHaveLength(1);
    expect(store.herbie_facts[0]).toMatchObject({
      predicate: "coi_expires_at",
      object: "2026-05-15",
      sourceType: "document",
      sourceId: "doc-1",
    });
  });

  it("routes low-confidence facts to herbie_review_queue, not herbie_facts", async () => {
    const result = await recordFact({
      tenantId: "t1",
      subjectType: "vendor",
      subjectId: "v1",
      predicate: "coi_expires_at",
      object: "2026-05-15",
      sourceType: "herbie_extraction",
      confidence: 0.55,
    });
    expect(result.status).toBe("queued_for_review");
    expect(result.reviewQueueId).toBeDefined();
    expect(store.herbie_facts).toHaveLength(0);
    expect(store.herbie_review_queue).toHaveLength(1);
  });

  it("is idempotent when the same fact is recorded twice", async () => {
    const a = await recordFact({
      tenantId: "t1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "gc_name",
      object: "Bergman Construction",
      sourceType: "user",
      confidence: 0.95,
    });
    const b = await recordFact({
      tenantId: "t1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "gc_name",
      object: "Bergman Construction",
      sourceType: "user",
      confidence: 0.95,
    });
    expect(a.factId).toBe(b.factId);
    expect(store.herbie_facts).toHaveLength(1);
  });

  it("supersedes a prior conflicting fact rather than deleting it", async () => {
    await recordFact({
      tenantId: "t1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "concrete_spec",
      object: "4000psi",
      sourceType: "document",
      sourceId: "doc-a",
      confidence: 0.9,
    });
    const updated = await recordFact({
      tenantId: "t1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "concrete_spec",
      object: "5000psi",
      sourceType: "document",
      sourceId: "doc-b",
      confidence: 0.92,
    });
    expect(updated.status).toBe("persisted");
    expect(updated.supersededFactId).toBeDefined();
    expect(store.herbie_facts).toHaveLength(2);
    const prior = store.herbie_facts.find((f) => f.object === "4000psi");
    expect(prior?.supersededById).toBe(updated.factId);
  });

  it("FACT_CONFIDENCE_THRESHOLD is 0.7 per HERBIE.md", () => {
    expect(FACT_CONFIDENCE_THRESHOLD).toBe(0.7);
  });
});

describe("herbie-facts — recordDecision", () => {
  beforeEach(reset);

  it("appends a decision and returns the new row", async () => {
    const row = await recordDecision({
      tenantId: "t1",
      projectId: "p1",
      summary: "approved CO-07 for $4,200",
      rationale: "Within change-order allowance",
      decidedBy: "user-1",
      relatedEntityType: "change_order",
      relatedEntityId: "co-7",
    });
    expect(row.summary).toContain("CO-07");
    expect(store.herbie_decisions).toHaveLength(1);
  });
});

describe("herbie-facts — recordRelationship", () => {
  beforeEach(reset);

  it("upserts a vendor relationship by (tenant, project, vendor, role)", async () => {
    const a = await recordRelationship({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      role: "sub",
      status: "active",
    });
    const b = await recordRelationship({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      role: "sub",
      status: "active",
      notes: "backup confirmed",
    });
    expect(a.id).toBe(b.id);
    expect(b.notes).toBe("backup confirmed");
    expect(store.herbie_relationships).toHaveLength(1);
  });

  it("rejects inputs that name zero or multiple target entities", async () => {
    await expect(
      recordRelationship({
        tenantId: "t1",
        role: "sub",
      } as any),
    ).rejects.toThrow(/exactly one/);
    await expect(
      recordRelationship({
        tenantId: "t1",
        contactId: "c1",
        vendorId: "v1",
        role: "sub",
      } as any),
    ).rejects.toThrow(/exactly one/);
  });
});

describe("herbie-facts — reads", () => {
  beforeEach(reset);

  it("getFacts returns only the current (non-superseded) facts", async () => {
    await recordFact({
      tenantId: "t1",
      projectId: "p1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "concrete_spec",
      object: "4000psi",
      sourceType: "document",
      confidence: 0.9,
    });
    await recordFact({
      tenantId: "t1",
      projectId: "p1",
      subjectType: "project",
      subjectId: "p1",
      predicate: "concrete_spec",
      object: "5000psi",
      sourceType: "document",
      confidence: 0.92,
    });
    const rows = await getFacts({
      tenantId: "t1",
      projectId: "p1",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].object).toBe("5000psi");
  });

  it("getDecisions / getRelationships return the inserted rows", async () => {
    await recordDecision({
      tenantId: "t1",
      projectId: "p1",
      summary: "approved CO-08",
      decidedBy: "user-1",
    });
    await recordRelationship({
      tenantId: "t1",
      projectId: "p1",
      contactId: "c1",
      role: "pm",
      status: "active",
    });
    const decisions = await getDecisions({ tenantId: "t1", projectId: "p1" });
    const rels = await getRelationships({ tenantId: "t1", projectId: "p1" });
    expect(decisions).toHaveLength(1);
    expect(rels).toHaveLength(1);
  });

  it("__peekCurrentFact returns the active row for a (subject, predicate)", async () => {
    await recordFact({
      tenantId: "t1",
      subjectType: "vendor",
      subjectId: "v1",
      predicate: "coi_expires_at",
      object: "2026-05-15",
      sourceType: "document",
      confidence: 0.9,
    });
    const peek = await __peekCurrentFact("t1", "vendor", "v1", "coi_expires_at");
    expect(peek?.object).toBe("2026-05-15");
  });
});
