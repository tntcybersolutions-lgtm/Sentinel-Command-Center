import { describe, it, expect, vi, beforeEach } from "vitest";

// Reuse the same in-memory table-store pattern as herbie-facts. Kept
// local (not a shared helper) so each service test file stays
// self-contained — easier to read, trivial duplication cost.
interface DbRow {
  id: string;
  [k: string]: any;
}
const store: Record<string, DbRow[]> = {
  coi_certificates: [],
};

function tableKey(arg: any): string {
  const name =
    arg?._?.name ||
    arg?.[Symbol.for("drizzle:Name")] ||
    (typeof arg?.toString === "function" ? arg.toString() : "");
  if (String(name).includes("coi_certificates")) return "coi_certificates";
  throw new Error(`Unexpected table in mock: ${String(name)}`);
}

let currentTable: string | null = null;
let filterPredicate: ((r: DbRow) => boolean) | null = null;

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
            returning: async () => [row],
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
              limit: async (n: number) => {
                const rows = store[currentTable!].filter(
                  (r) => !filterPredicate || filterPredicate(r),
                );
                return rows.slice(0, n);
              },
              orderBy: (_col: any) => {
                const rows = store[currentTable!].filter(
                  (r) => !filterPredicate || filterPredicate(r),
                );
                // Sort by expiryDate asc (callers only use asc here).
                rows.sort((a, b) => {
                  const ax = a.expiryDate?.getTime?.() ?? 0;
                  const bx = b.expiryDate?.getTime?.() ?? 0;
                  return ax - bx;
                });
                return rows;
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
          where: (pred: any) => {
            const target = store[currentTable!].find((r) => pred(r));
            if (target) Object.assign(target, patch);
            return {
              returning: async () => (target ? [target] : []),
            };
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
    eq: (col: any, val: any) => (r: DbRow) => r[colName(col)] === val,
    isNull: (col: any) => (r: DbRow) =>
      r[colName(col)] === null || r[colName(col)] === undefined,
    lte: (col: any, val: any) => (r: DbRow) => {
      const v = r[colName(col)];
      if (v instanceof Date && val instanceof Date) return v.getTime() <= val.getTime();
      return v <= val;
    },
    gte: (col: any, val: any) => (r: DbRow) => {
      const v = r[colName(col)];
      if (v instanceof Date && val instanceof Date) return v.getTime() >= val.getTime();
      return v >= val;
    },
    asc: (c: any) => c,
    desc: (c: any) => c,
    sql: (..._args: any[]) => ({}),
  };
}

function colName(col: any): string {
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
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, ...buildPredicates() };
});

import {
  upsertCoi,
  listForProject,
  listForVendor,
  coisExpiringWithin,
  expiryTier,
  tierSeverity,
  partitionByTier,
  COI_ALERT_DAYS,
} from "../coi.service";

function reset() {
  store.coi_certificates.length = 0;
}

describe("coi.service — expiryTier (pure)", () => {
  const now = new Date("2026-05-01T12:00:00Z");

  it("classifies expired certificates", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-04-30T12:00:00Z") }, now),
    ).toBe("expired");
  });

  it("classifies expiring within 1 day as critical_1d", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-05-02T12:00:00Z") }, now),
    ).toBe("critical_1d");
  });

  it("classifies 2–7 day window as critical_7d", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-05-05T12:00:00Z") }, now),
    ).toBe("critical_7d");
  });

  it("classifies 8–14 day window as warning_14d", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-05-12T12:00:00Z") }, now),
    ).toBe("warning_14d");
  });

  it("classifies 15–30 day window as warning_30d", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-05-25T12:00:00Z") }, now),
    ).toBe("warning_30d");
  });

  it("classifies anything past 30 days as ok", () => {
    expect(
      expiryTier({ expiryDate: new Date("2026-10-01T12:00:00Z") }, now),
    ).toBe("ok");
  });

  it("tierSeverity maps tiers to severity buckets", () => {
    expect(tierSeverity("expired")).toBe("critical");
    expect(tierSeverity("critical_1d")).toBe("critical");
    expect(tierSeverity("critical_7d")).toBe("high");
    expect(tierSeverity("warning_14d")).toBe("medium");
    expect(tierSeverity("warning_30d")).toBe("low");
    expect(tierSeverity("ok")).toBe("low");
  });

  it("COI_ALERT_DAYS matches HERBIE.md (30/14/7/1)", () => {
    expect([...COI_ALERT_DAYS]).toEqual([30, 14, 7, 1]);
  });
});

describe("coi.service — upsertCoi", () => {
  beforeEach(reset);

  it("inserts a new COI when no row matches the composite key", async () => {
    const row = await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "gl",
      carrier: "Acme Mutual",
      policyNumber: "POL-001",
      expiryDate: new Date("2026-06-01T00:00:00Z"),
    });
    expect(row.id).toBeDefined();
    expect(store.coi_certificates).toHaveLength(1);
  });

  it("updates the existing row when (tenant, project, vendor, policyType) matches", async () => {
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "gl",
      carrier: "Acme",
      expiryDate: new Date("2026-06-01T00:00:00Z"),
    });
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "gl",
      carrier: "Acme",
      expiryDate: new Date("2027-06-01T00:00:00Z"), // renewed
    });
    expect(store.coi_certificates).toHaveLength(1);
    expect(store.coi_certificates[0].expiryDate.getFullYear()).toBe(2027);
  });

  it("treats a different policyType as a separate COI", async () => {
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "gl",
      expiryDate: new Date("2026-06-01T00:00:00Z"),
    });
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "wc",
      expiryDate: new Date("2026-06-01T00:00:00Z"),
    });
    expect(store.coi_certificates).toHaveLength(2);
  });
});

describe("coi.service — read queries", () => {
  beforeEach(reset);

  async function seed() {
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v1",
      policyType: "gl",
      expiryDate: new Date("2026-05-10T00:00:00Z"),
    });
    await upsertCoi({
      tenantId: "t1",
      projectId: "p1",
      vendorId: "v2",
      policyType: "gl",
      expiryDate: new Date("2026-06-10T00:00:00Z"),
    });
    await upsertCoi({
      tenantId: "t1",
      projectId: null as any,
      vendorId: null as any,
      policyType: "umbrella",
      expiryDate: new Date("2027-01-01T00:00:00Z"),
    });
  }

  it("listForProject returns rows scoped to the project", async () => {
    await seed();
    const rows = await listForProject("t1", "p1");
    expect(rows).toHaveLength(2);
  });

  it("listForVendor returns rows scoped to the vendor", async () => {
    await seed();
    const rows = await listForVendor("t1", "v1");
    expect(rows).toHaveLength(1);
  });

  it("coisExpiringWithin returns certificates expiring within the window", async () => {
    await seed();
    const now = new Date("2026-05-01T12:00:00Z");
    const rows = await coisExpiringWithin("t1", 14, now);
    // v1's COI expires 2026-05-10 (9 days out). Included.
    // v2's COI expires 2026-06-10 (40 days). Excluded.
    // umbrella expires 2027-01-01. Excluded.
    expect(rows).toHaveLength(1);
  });
});

describe("coi.service — partitionByTier", () => {
  it("buckets a mix of certificates by tier", () => {
    const now = new Date("2026-05-01T12:00:00Z");
    const buckets = partitionByTier(
      [
        { expiryDate: new Date("2026-04-30T12:00:00Z") } as any, // expired
        { expiryDate: new Date("2026-05-02T12:00:00Z") } as any, // critical_1d
        { expiryDate: new Date("2026-05-05T12:00:00Z") } as any, // critical_7d
        { expiryDate: new Date("2026-05-20T12:00:00Z") } as any, // warning_30d
        { expiryDate: new Date("2026-10-01T12:00:00Z") } as any, // ok
      ],
      now,
    );
    expect(buckets.expired).toHaveLength(1);
    expect(buckets.critical_1d).toHaveLength(1);
    expect(buckets.critical_7d).toHaveLength(1);
    expect(buckets.warning_30d).toHaveLength(1);
    expect(buckets.ok).toHaveLength(1);
  });
});
