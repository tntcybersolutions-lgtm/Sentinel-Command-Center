import { describe, it, expect, vi, beforeEach } from "vitest";

interface DbRow { id: string; [k: string]: any }
const store: Record<string, DbRow[]> = {
  conversation_memory: [],
  approval_requests: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  const s = String(name);
  if (s.includes("approval_requests")) return "approval_requests";
  if (s.includes("conversation_memory")) return "conversation_memory";
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
        return {
          where: (pred: any) => {
            filter = pred;
            return {
              limit: async (n: number) => {
                const rows = store[currentTable!].filter(
                  (r) => !filter || filter(r),
                );
                return rows.slice(0, n);
              },
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
    isNull: (col: any) => (r: DbRow) => r[colName(col)] == null,
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
    createRequest: (...a: any[]) => createRequestMock(...a),
  },
  registerApprovalDispatcher: (...a: any[]) =>
    registerApprovalDispatcherMock(...a),
}));

import {
  draftMessage,
  getMessageDraft,
  outboundMessageDispatcher,
  registerOutboundMessageDispatcher,
} from "../outbound-message-draft.service";

function reset() {
  store.conversation_memory.length = 0;
  store.approval_requests.length = 0;
  createRequestMock.mockReset();
  registerApprovalDispatcherMock.mockReset();
  let counter = 0;
  createRequestMock.mockImplementation(async (input: any) => {
    const id = `req-${++counter}`;
    store.approval_requests.push({
      id,
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: input.actionType,
    });
    return id;
  });
}

describe("outbound-message-draft — draftMessage", () => {
  beforeEach(reset);

  it("files an approval request and stores the draft body keyed by request id", async () => {
    const r = await draftMessage({
      tenantId: "t1",
      projectId: "p1",
      recipient: "vendor@acme.test",
      channel: "email",
      subject: "GL COI renewal",
      body: "Hi — your GL expires Friday. Renew please.",
      draftedBy: "herbie",
    });
    expect(r.approvalRequestId).toBeDefined();
    expect(r.draftId).toBe(r.approvalRequestId);

    // Approval request was created with the right action type.
    expect(store.approval_requests).toHaveLength(1);
    expect(store.approval_requests[0].actionType).toBe("draft_external_message");

    // Draft body is retrievable by request id.
    const draft = await getMessageDraft("t1", r.approvalRequestId);
    expect(draft).toBeDefined();
    expect(draft?.recipient).toBe("vendor@acme.test");
    expect(draft?.channel).toBe("email");
    expect(draft?.body).toContain("Renew");
  });

  it("normalizes entityId so it equals the approval request id after the patch", async () => {
    const r = await draftMessage({
      tenantId: "t1",
      recipient: "x@y.test",
      channel: "sms",
      body: "hi",
    });
    const req = store.approval_requests.find((x) => x.id === r.approvalRequestId);
    expect(req?.entityId).toBe(r.approvalRequestId);
  });
});

describe("outbound-message-draft — dispatcher", () => {
  beforeEach(reset);

  it("on approval, writes a herbie_outbound_approved record with approver metadata", async () => {
    const r = await draftMessage({
      tenantId: "t1",
      recipient: "sub@acme.test",
      channel: "portal",
      body: "Portal note",
    });
    await outboundMessageDispatcher({
      tenantId: "t1",
      requestId: r.approvalRequestId,
      actor: "user-1",
      notes: "ok",
    });
    const approved = store.conversation_memory.find(
      (row) => row.memoryType === "herbie_outbound_approved",
    );
    expect(approved).toBeDefined();
    const v = approved!.memoryValue as any;
    expect(v.approvedBy).toBe("user-1");
    expect(v.approvalNotes).toBe("ok");
    expect(v.body).toBe("Portal note");
  });

  it("is a no-op when there's no draft for the given request id", async () => {
    await outboundMessageDispatcher({
      tenantId: "t1",
      requestId: "missing-req",
      actor: "user-1",
    });
    const approved = store.conversation_memory.find(
      (row) => row.memoryType === "herbie_outbound_approved",
    );
    expect(approved).toBeUndefined();
  });

  it("registerOutboundMessageDispatcher wires draft_external_message into the registry", () => {
    registerOutboundMessageDispatcher();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledOnce();
    expect(registerApprovalDispatcherMock).toHaveBeenCalledWith(
      "draft_external_message",
      expect.any(Function),
    );
  });
});
