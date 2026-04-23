import { describe, it, expect, vi, beforeEach } from "vitest";

interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  submittals: [],
  approval_requests: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  const s = String(name);
  if (s.includes("approval_requests")) return "approval_requests";
  if (s.includes("submittals")) return "submittals";
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
  draftSubmittal,
  submittalApprovalDispatcher,
  registerSubmittalDispatcher,
  SUBMITTAL_DRAFT_STATUS,
  SUBMITTAL_SUBMITTED_STATUS,
} from "../submittal-draft.service";

function reset() {
  for (const t of Object.keys(store)) store[t].length = 0;
  createRequestMock.mockClear();
  createRequestMock.mockImplementation(
    async () => `approval-req-${Math.random().toString(36).slice(2, 10)}`,
  );
  registerApprovalDispatcherMock.mockClear();
}

describe("submittal-draft.service — draftSubmittal", () => {
  beforeEach(reset);

  it("creates a submittal in draft_pending_approval + files approval request", async () => {
    const r = await draftSubmittal({
      tenantId: "t1",
      projectId: "p1",
      name: "Concrete mix design — 5000psi",
      submittalType: "product_data",
    });
    expect(r.submittalNumber).toMatch(/^SUB-\d{4}$/);
    expect(store.submittals).toHaveLength(1);
    expect(store.submittals[0].status).toBe(SUBMITTAL_DRAFT_STATUS);
    expect(createRequestMock).toHaveBeenCalledOnce();
    const [arg] = createRequestMock.mock.calls[0];
    expect(arg.entityType).toBe("submittal");
    expect(arg.actionType).toBe("draft_submittal");
    expect(arg.entityId).toBe(r.submittalId);
  });

  it("auto-increments SUB numbers per project", async () => {
    await draftSubmittal({ tenantId: "t1", projectId: "p1", name: "a" });
    await draftSubmittal({ tenantId: "t1", projectId: "p1", name: "b" });
    const nums = store.submittals.map((s) => s.submittalNumber);
    expect(nums).toEqual(["SUB-0001", "SUB-0002"]);
  });
});

describe("submittal-draft.service — dispatcher", () => {
  beforeEach(reset);

  it("flips to submitted on approval of a real submittal approval", async () => {
    const d = await draftSubmittal({
      tenantId: "t1",
      projectId: "p1",
      name: "shop drawings — stairs",
    });
    store.approval_requests.push({
      id: d.approvalRequestId,
      entityType: "submittal",
      entityId: d.submittalId,
      tenantId: "t1",
    });
    await submittalApprovalDispatcher({
      tenantId: "t1",
      requestId: d.approvalRequestId,
      actor: "user-1",
    });
    const row = store.submittals.find((s) => s.id === d.submittalId);
    expect(row?.status).toBe(SUBMITTAL_SUBMITTED_STATUS);
    expect(row?.submittedAt).toBeInstanceOf(Date);
  });

  it("is a no-op for a non-submittal approval request", async () => {
    store.approval_requests.push({
      id: "foreign",
      entityType: "rfi",
      entityId: "rfi-99",
    });
    await submittalApprovalDispatcher({
      tenantId: "t1",
      requestId: "foreign",
      actor: "u",
    });
    expect(store.submittals).toHaveLength(0);
  });

  it("registerSubmittalDispatcher wires draft_submittal into the registry", () => {
    registerSubmittalDispatcher();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledOnce();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledWith(
      "draft_submittal",
      expect.any(Function),
    );
  });
});
