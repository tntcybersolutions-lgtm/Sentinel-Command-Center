import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock coi.service so we control which COIs appear in the digest.
const coisExpiringWithinMock = vi.fn();
vi.mock("../coi.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../coi.service")>();
  return {
    ...actual,
    coisExpiringWithin: (...a: any[]) => coisExpiringWithinMock(...a),
  };
});

// db stub — select() returns a controllable array based on which
// table was read.
let approvalRows: any[] = [];
let rfiRows: any[] = [];
let currentTable = "";

vi.mock("../../db", () => ({
  pool: {},
  db: {
    select: (_cols?: any) => ({
      from: (tbl: any) => {
        const name = String(tbl?.name ?? tbl?._?.name ?? tbl?.[Symbol.for("drizzle:Name")] ?? "");
        if (name.includes("approval_requests")) currentTable = "approvals";
        else if (name.includes("rfis")) currentTable = "rfis";
        else currentTable = "unknown";
        return {
          where: (_pred: any) => {
            if (currentTable === "approvals") return Promise.resolve(approvalRows);
            if (currentTable === "rfis") return Promise.resolve(rfiRows);
            return Promise.resolve([]);
          },
        };
      },
    }),
  },
}));

import { buildHerbieDigest } from "../herbie-digest.service";

const now = new Date("2026-05-01T12:00:00Z");

function reset() {
  coisExpiringWithinMock.mockReset();
  coisExpiringWithinMock.mockResolvedValue([]);
  approvalRows = [];
  rfiRows = [];
}

describe("herbie-digest — buildHerbieDigest", () => {
  beforeEach(reset);

  it("returns an empty digest with zero totals when nothing is live", async () => {
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    expect(d.items).toHaveLength(0);
    expect(d.totals).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
  });

  it("surfaces expired COIs as critical with a stop-work action", async () => {
    coisExpiringWithinMock.mockResolvedValue([
      {
        id: "c1",
        policyType: "gl",
        carrier: "Acme Mutual",
        policyNumber: "POL-1",
        expiryDate: new Date("2026-04-29T12:00:00Z"),
        projectId: null,
      },
    ]);
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    expect(d.items).toHaveLength(1);
    const item = d.items[0];
    expect(item.severity).toBe("critical");
    expect(item.headline).toContain("EXPIRED");
    expect(item.suggestedAction).toContain("Stop");
    expect(d.totals.critical).toBe(1);
  });

  it("surfaces 30-day-window COIs at low severity with a future-tense headline", async () => {
    coisExpiringWithinMock.mockResolvedValue([
      {
        id: "c2",
        policyType: "wc",
        carrier: null,
        policyNumber: null,
        expiryDate: new Date("2026-05-20T00:00:00Z"), // 19 days out
        projectId: null,
      },
    ]);
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    expect(d.items[0].severity).toBe("low");
    // friendlyDate returns ISO date for >7 days out (19 days here).
    expect(d.items[0].headline).toMatch(/expires .+\./);
    expect(d.items[0].headline).toContain("2026-05-20");
  });

  it("pulls pending approvals and tags Herbie drafts specially", async () => {
    approvalRows = [
      {
        id: "req-1",
        actionType: "draft_rfi",
        priority: "normal",
        entityType: "rfi",
        entityId: "rfi-1",
        createdAt: new Date("2026-04-30T00:00:00Z"),
      },
      {
        id: "req-2",
        actionType: "bid_submission",
        priority: "urgent",
        entityType: "bid_project",
        entityId: "bp-1",
        createdAt: new Date("2026-04-30T00:00:00Z"),
      },
    ];
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    // The urgent one sorts first (critical).
    expect(d.items[0].severity).toBe("critical");
    expect(d.items[0].category).toBe("approval");
    // The draft_rfi one is medium and has the "Herbie drafted" voice.
    const draft = d.items.find((i) => i.headline.includes("Herbie drafted"));
    expect(draft).toBeDefined();
    expect(draft?.severity).toBe("medium");
  });

  it("flags stale RFIs (>10 days, not answered) and escalates overdue ones", async () => {
    const oldCreated = new Date("2026-04-01T00:00:00Z"); // 30 days back
    rfiRows = [
      {
        id: "r1",
        rfiNumber: "RFI-0001",
        subject: "Concrete spec",
        status: "open",
        dueDate: new Date("2026-04-20T00:00:00Z"), // past due
        projectId: "p1",
        createdAt: oldCreated,
      },
      {
        id: "r2",
        rfiNumber: "RFI-0002",
        subject: "Door hardware",
        status: "submitted",
        dueDate: null,
        projectId: "p1",
        createdAt: oldCreated,
      },
    ];
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    expect(d.items.some((i) => i.headline.includes("Overdue RFI"))).toBe(true);
    expect(d.items.some((i) => i.headline.includes("Stale RFI"))).toBe(true);
    const overdue = d.items.find((i) => i.headline.includes("Overdue"));
    expect(overdue?.severity).toBe("high");
  });

  it("sorts items critical → high → medium → low", async () => {
    coisExpiringWithinMock.mockResolvedValue([
      {
        id: "c1",
        policyType: "gl",
        expiryDate: new Date("2026-04-29T12:00:00Z"), // expired → critical
      },
      {
        id: "c2",
        policyType: "wc",
        expiryDate: new Date("2026-05-20T12:00:00Z"), // warning_30d → low
      },
    ]);
    const d = await buildHerbieDigest({ tenantId: "t1", now });
    expect(d.items[0].severity).toBe("critical");
    expect(d.items[d.items.length - 1].severity).toBe("low");
  });
});
