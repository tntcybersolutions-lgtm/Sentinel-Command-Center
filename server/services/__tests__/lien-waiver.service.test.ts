import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory mock store for the two tables this service touches.
interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  lien_waivers: [],
  lien_waiver_events: [],
  vendors: [],
  projects: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  const s = String(name);
  if (s.includes("lien_waiver_events")) return "lien_waiver_events";
  if (s.includes("lien_waivers")) return "lien_waivers";
  if (s.includes("vendors")) return "vendors";
  if (s.includes("projects")) return "projects";
  throw new Error(`Unexpected table: ${s}`);
}

function colName(col: any): string {
  const raw =
    (col && typeof col === "object" && "name" in col && col.name) ||
    (col && col._ && col._.name) ||
    String(col);
  return String(raw);
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
            createdAt: new Date(),
            updatedAt: new Date(),
            ...vals,
          };
          store[currentTable!].push(row);
          return {
            returning: async () => [row],
          };
        },
      };
    },
    select: (cols?: any) => ({
      from: (tbl: any) => {
        currentTable = tableKey(tbl);
        let filter: ((r: DbRow) => boolean) | null = null;
        const builder: any = {
          where: (pred: any) => {
            filter = pred;
            return builder;
          },
          orderBy: () => builder,
          limit: async (n: number) => {
            const rows = store[currentTable!].filter(
              (r) => !filter || filter(r),
            );
            const sliced = rows.slice(0, n);
            // count(*) selector
            if (cols && cols.count) {
              return [{ count: rows.length }];
            }
            return sliced;
          },
          then: undefined as any,
        };
        // Allow `await db.select().from(...).where(...)` w/o limit.
        builder.then = (resolve: any) => {
          const rows = store[currentTable!].filter(
            (r) => !filter || filter(r),
          );
          if (cols && cols.count) return resolve([{ count: rows.length }]);
          return resolve(rows);
        };
        return builder;
      },
    }),
    update: (tbl: any) => {
      currentTable = tableKey(tbl);
      return {
        set: (patch: any) => ({
          where: (pred: any) => ({
            returning: async () => {
              const target = store[currentTable!].find((r) => pred(r));
              if (target) Object.assign(target, patch);
              return target ? [target] : [];
            },
          }),
        }),
      };
    },
  };
}

vi.mock("../../db", () => ({ db: makeDbMock() }));
vi.mock("drizzle-orm", () => ({
  and: (...preds: Array<(r: DbRow) => boolean>) => (r: DbRow) =>
    preds.every((p) => p(r)),
  eq: (col: any, val: any) => {
    const name = colName(col);
    return (r: DbRow) => r[name] === val;
  },
  desc: (c: any) => c,
  asc: (c: any) => c,
  sql: () => ({ count: true }),
}));
// Schema mock — drizzle's pgTable name is read via column.name lookups.
vi.mock("@shared/schema", () => {
  const mkCol = (name: string) => ({ name, _: { name } });
  const make = (name: string, columns: string[]) => {
    const tbl: any = { _: { name }, toString: () => name };
    columns.forEach((c) => (tbl[c] = mkCol(c)));
    return tbl;
  };
  return {
    lienWaivers: make("lien_waivers", [
      "id",
      "tenantId",
      "projectId",
      "vendorId",
      "subcontractId",
      "payAppId",
      "waiverNumber",
      "waiverType",
      "status",
      "throughDate",
      "paymentAmount",
      "exceptionsJson",
      "signerName",
      "signerTitle",
      "signerEmail",
      "sentAt",
      "signedAt",
      "receivedAt",
      "voidedAt",
      "expiresAt",
      "documentId",
      "notesText",
      "createdByUserId",
      "createdAt",
      "updatedAt",
    ]),
    lienWaiverEvents: make("lien_waiver_events", [
      "id",
      "tenantId",
      "waiverId",
      "eventType",
      "actorUserId",
      "actorName",
      "payloadJson",
      "createdAt",
    ]),
    vendors: make("vendors", ["id", "companyName", "contactName"]),
    projects: make("projects", ["id", "name", "projectNumber"]),
  };
});

const TENANT = "test-tenant";

beforeEach(() => {
  store.lien_waivers.length = 0;
  store.lien_waiver_events.length = 0;
  store.vendors.length = 0;
  store.projects.length = 0;
  store.vendors.push({ id: "v1", companyName: "Acme Plumbing", contactName: "Joe" });
  store.projects.push({ id: "p1", name: "Maple Build", projectNumber: "MAP-1" });
});

const baseInput = () => ({
  tenantId: TENANT,
  projectId: "p1",
  vendorId: "v1",
  waiverType: "conditional_partial" as const,
  throughDate: new Date("2026-04-01"),
  paymentAmount: 12500,
});

describe("lien-waiver.service", () => {
  it("creates a draft with auto waiver number and logs an event", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    expect(w.status).toBe("draft");
    expect(w.waiverNumber).toMatch(/^LW-\d{4}-0001$/);
    expect(store.lien_waiver_events.length).toBe(1);
    expect(store.lien_waiver_events[0].eventType).toBe("created");
  });

  it("auto-numbers sequentially per tenant", async () => {
    const svc = await import("../lien-waiver.service");
    const a = await svc.createWaiver(baseInput());
    const b = await svc.createWaiver(baseInput());
    expect(a.waiverNumber.endsWith("0001")).toBe(true);
    expect(b.waiverNumber.endsWith("0002")).toBe(true);
  });

  it("walks the happy-path lifecycle draft → sent → signed → received", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    const sent = await svc.sendWaiver(TENANT, w.id);
    expect(sent.status).toBe("sent");
    expect(sent.sentAt).toBeTruthy();
    const signed = await svc.signWaiver(TENANT, w.id);
    expect(signed.status).toBe("signed");
    expect(signed.signedAt).toBeTruthy();
    const recv = await svc.receiveWaiver(TENANT, w.id);
    expect(recv.status).toBe("received");
    expect(recv.receivedAt).toBeTruthy();
    const events = store.lien_waiver_events.map((e) => e.eventType);
    expect(events).toEqual(["created", "sent", "signed", "received"]);
  });

  it("rejects invalid transitions with a 409-style error", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    // can't receive a draft
    await expect(svc.receiveWaiver(TENANT, w.id)).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("strictly enforces draft → sent → signed (no skipping sent)", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    // Cannot sign a draft directly — must go through sent first.
    await expect(svc.signWaiver(TENANT, w.id)).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("does not allow voiding a received (terminal) waiver", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await svc.signWaiver(TENANT, w.id);
    await svc.receiveWaiver(TENANT, w.id);
    await expect(svc.voidWaiver(TENANT, w.id, "oops")).rejects.toMatchObject({
      message: expect.stringContaining("cannot transition"),
      statusCode: 409,
    });
  });

  it("send is idempotent — re-sending a sent waiver returns the row unchanged", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const beforeEvents = store.lien_waiver_events.length;
    const again = await svc.sendWaiver(TENANT, w.id);
    expect(again.status).toBe("sent");
    expect(store.lien_waiver_events.length).toBe(beforeEvents);
  });

  it("voids from any non-final state and records the reason", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    const voided = await svc.voidWaiver(TENANT, w.id, "duplicate of LW-2026-0007");
    expect(voided.status).toBe("voided");
    expect(voided.voidedAt).toBeTruthy();
    const voidEvent = store.lien_waiver_events.find((e) => e.eventType === "voided");
    expect(voidEvent?.payloadJson).toMatchObject({ reason: expect.stringContaining("duplicate") });
  });

  it("blocks edits on non-draft waivers", async () => {
    const svc = await import("../lien-waiver.service");
    const w = await svc.createWaiver(baseInput());
    await svc.sendWaiver(TENANT, w.id);
    await expect(
      svc.updateWaiver(TENANT, w.id, { paymentAmount: 999 }),
    ).rejects.toMatchObject({ message: expect.stringContaining("draft"), statusCode: 409 });
  });

  it("computes stats with outstanding amount over draft+sent", async () => {
    const svc = await import("../lien-waiver.service");
    const a = await svc.createWaiver({ ...baseInput(), paymentAmount: 100 });
    const b = await svc.createWaiver({ ...baseInput(), paymentAmount: 250 });
    await svc.sendWaiver(TENANT, a.id);
    const stats = await svc.getStats(TENANT);
    expect(stats.total).toBe(2);
    expect(stats.draft).toBe(1);
    expect(stats.sent).toBe(1);
    expect(stats.outstandingAmount).toBe(350);
  });

  it("generates document text for all four waiver types", async () => {
    const svc = await import("../lien-waiver.service");
    for (const t of svc.WAIVER_TYPES) {
      const w = await svc.createWaiver({ ...baseInput(), waiverType: t });
      const text = await svc.generateDocumentText(TENANT, w.id);
      expect(text).toContain("WAIVER");
      expect(text).toContain(w.waiverNumber);
      if (t.startsWith("conditional")) {
        expect(text).toContain("does not become effective");
      } else {
        expect(text).toContain("paid in full");
      }
      if (t.endsWith("final")) {
        expect(text).toContain("FINAL waiver");
      } else {
        expect(text).toContain("PARTIAL");
      }
    }
  });

  it("rejects invalid waiver types", async () => {
    const svc = await import("../lien-waiver.service");
    await expect(
      svc.createWaiver({ ...baseInput(), waiverType: "invalid" as any }),
    ).rejects.toThrow(/invalid waiver_type/);
  });
});
