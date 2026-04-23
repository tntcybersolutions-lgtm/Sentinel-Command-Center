import { describe, it, expect, vi, beforeEach } from "vitest";

// Self-contained in-memory table store. The rfi-draft service only
// touches `rfis` directly + the approval.service module, which we
// mock at its boundary (below) rather than threading calls through
// the real approvalService → real db chain.
interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  rfis: [],
  approval_requests: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  const s = String(name);
  if (s.includes("approval_requests")) return "approval_requests";
  if (s.includes("rfis")) return "rfis";
  throw new Error(`Unexpected table: ${s}`);
}

let currentTable: string | null = null;

function makeDbMock() {
  return {
    insert: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        values: (vals: any) => {
          const row: DbRow = {
            id: `${currentTable}-${store[currentTable!].length + 1}`,
            ...vals,
          };
          store[currentTable!].push(row);
          return {
            returning: async (cols?: any) =>
              cols && cols.id ? [{ id: row.id }] : [row],
          };
        },
      };
    },
    select: (_cols?: any) => ({
      from: (tbl: any) => {
        currentTable = tableKey(tbl);
        let filter: ((r: DbRow) => boolean) | null = null;
        const terminal = async (n: number) => {
          const rows = store[currentTable!].filter((r) => !filter || filter(r));
          return rows.slice(0, n);
        };
        return {
          where: (pred: any) => {
            filter = pred;
            return {
              limit: terminal,
              orderBy: () => ({ limit: terminal }),
            };
          },
        };
      },
    }),
    update: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        set: (patch: any) => ({
          where: async (pred: any) => {
            const target = store[currentTable!].find((r) => pred(r));
            if (target) Object.assign(target, patch);
            return { rowCount: target ? 1 : 0 };
          },
        }),
      };
    },
  };
}

// Helpers for drizzle-orm predicate factories. Since the rfi-draft
// service uses these at runtime (via importOriginal on drizzle-orm),
// we need the predicate factories to actually produce row-matchers
// against our in-memory store.
function buildPredicates() {
  return {
    and: (...preds: Array<(r: DbRow) => boolean>) => (r: DbRow) =>
      preds.every((p) => p(r)),
    eq: (col: any, val: any) => {
      const name = colName(col);
      return (r: DbRow) => r[name] === val;
    },
    isNull: (col: any) => {
      const name = colName(col);
      return (r: DbRow) => r[name] == null;
    },
    desc: (c: any) => c,
    asc: (c: any) => c,
    or: () => () => true,
    sql: () => ({}),
  };
}

function colName(col: any): string {
  // A drizzle Column exposes `.name` as the DB-side snake_case name.
  // Our store rows use camelCase, matching the service's insert shape.
  const raw =
    (col && typeof col === "object" && "name" in col && col.name) ||
    (col && col._ && col._.name) ||
    String(col);
  return snakeToCamel(String(raw));
}
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}

vi.mock("../../db", () => ({ pool: {}, db: makeDbMock() }));
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, ...buildPredicates() };
});

// Mock approval.service at the boundary. vi.mock is hoisted above
// these `const` declarations, but the arrow functions below only
// dereference the mocks when they're actually *called* — by which
// time the const bindings are initialized. This is the vitest
// "lazy closure" pattern documented in the Vitest docs for mocks
// that capture local variables.
const createRequestMock = vi.fn();
const registerApprovalDispatcherMock = vi.fn();

vi.mock("../approval.service", () => ({
  approvalService: {
    createRequest: (...args: any[]) => createRequestMock(...args),
  },
  registerApprovalDispatcher: (...args: any[]) =>
    registerApprovalDispatcherMock(...args),
}));

import {
  draftRfi,
  rfiApprovalDispatcher,
  registerRfiDispatcher,
  RFI_DRAFT_STATUS,
  RFI_SUBMITTED_STATUS,
} from "../rfi-draft.service";

function reset() {
  for (const t of Object.keys(store)) store[t].length = 0;
  createRequestMock.mockClear();
  createRequestMock.mockImplementation(
    async () => `approval-req-${Math.random().toString(36).slice(2, 10)}`,
  );
  registerApprovalDispatcherMock.mockClear();
}

describe("rfi-draft.service — draftRfi", () => {
  beforeEach(reset);

  it("creates an RFI in draft_pending_approval status and files an approval request", async () => {
    const result = await draftRfi({
      tenantId: "t1",
      projectId: "p1",
      subject: "Concrete spec clarification, section 03 30 00",
      question: "Plans say 4000psi, spec says 5000psi — which wins?",
    });
    expect(result.rfiNumber).toMatch(/^RFI-\d{4}$/);
    expect(store.rfis).toHaveLength(1);
    expect(store.rfis[0].status).toBe(RFI_DRAFT_STATUS);
    expect(createRequestMock).toHaveBeenCalledOnce();
    const [arg] = createRequestMock.mock.calls[0];
    expect(arg.entityType).toBe("rfi");
    expect(arg.actionType).toBe("draft_rfi");
    expect(arg.entityId).toBe(result.rfiId);
  });

  it("auto-increments RFI numbers within a project", async () => {
    await draftRfi({ tenantId: "t1", projectId: "p1", subject: "a", question: "?" });
    await draftRfi({ tenantId: "t1", projectId: "p1", subject: "b", question: "?" });
    const nums = store.rfis.map((r) => r.rfiNumber);
    expect(nums).toEqual(["RFI-0001", "RFI-0002"]);
  });

  it("keeps RFI number counters scoped per project", async () => {
    await draftRfi({ tenantId: "t1", projectId: "p1", subject: "a", question: "?" });
    await draftRfi({ tenantId: "t1", projectId: "p2", subject: "a", question: "?" });
    const p1Rfis = store.rfis.filter((r) => r.projectId === "p1");
    const p2Rfis = store.rfis.filter((r) => r.projectId === "p2");
    expect(p1Rfis.map((r) => r.rfiNumber)).toEqual(["RFI-0001"]);
    expect(p2Rfis.map((r) => r.rfiNumber)).toEqual(["RFI-0001"]);
  });

  it("respects a caller-supplied rfiNumber", async () => {
    const r = await draftRfi({
      tenantId: "t1",
      projectId: "p1",
      rfiNumber: "RFI-SPEC-007",
      subject: "x",
      question: "?",
    });
    expect(r.rfiNumber).toBe("RFI-SPEC-007");
  });
});

describe("rfi-draft.service — registerRfiDispatcher", () => {
  beforeEach(reset);

  it("registers the dispatcher with approval.service for draft_rfi", () => {
    registerRfiDispatcher();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledOnce();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledWith(
      "draft_rfi",
      expect.any(Function),
    );
  });
});

describe("rfi-draft.service — dispatcher behavior", () => {
  beforeEach(reset);

  it("flips the RFI status to submitted when invoked on a real RFI approval", async () => {
    const drafted = await draftRfi({
      tenantId: "t1",
      projectId: "p1",
      subject: "s",
      question: "q",
    });
    // Seed the approval_requests store the way approvalService would.
    store.approval_requests.push({
      id: drafted.approvalRequestId,
      entityType: "rfi",
      entityId: drafted.rfiId,
      actionType: "draft_rfi",
      tenantId: "t1",
    });

    await rfiApprovalDispatcher({
      tenantId: "t1",
      requestId: drafted.approvalRequestId,
      actor: "user-1",
    });

    const rfi = store.rfis.find((r) => r.id === drafted.rfiId);
    expect(rfi?.status).toBe(RFI_SUBMITTED_STATUS);
    expect(rfi?.submittedAt).toBeInstanceOf(Date);
  });

  it("is a no-op for a non-rfi approval request", async () => {
    store.approval_requests.push({
      id: "foreign-req",
      entityType: "document",
      entityId: "doc-9",
    });
    await rfiApprovalDispatcher({
      tenantId: "t1",
      requestId: "foreign-req",
      actor: "user-1",
    });
    expect(store.rfis).toHaveLength(0);
  });
});
