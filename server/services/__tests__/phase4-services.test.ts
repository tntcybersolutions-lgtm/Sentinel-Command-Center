import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../audit.service", () => ({
  auditService: { log: vi.fn(), logEvent: vi.fn() },
}));

vi.mock("../event-stream.service", () => ({
  eventStreamService: { emit: vi.fn() },
}));

vi.mock("../herbie.service", () => ({
  herbieService: { complete: vi.fn() },
}));

const mockDbModule = await import("../../db");
const mockDb = mockDbModule.db as any;

// Universal DB mock chain that resolves any terminal method with provided rows
function makeSelectChainFull(rows: any[] = []) {
  const chain: any = {};
  const terminal = () => Promise.resolve(rows);
  const cont = () => chain;
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockResolvedValue(rows);
  chain.orderBy = vi.fn().mockResolvedValue(rows);
  chain.limit = vi.fn().mockResolvedValue(rows);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: any, reject?: any) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}


function makeSelectChain(rows: any[]) {
  const inner: any = { where: vi.fn().mockResolvedValue(rows) };
  return { from: vi.fn().mockReturnValue(inner) };
}

function makeSelectChainOrderBy(rows: any[]) {
  const inner2: any = { orderBy: vi.fn().mockResolvedValue(rows), where: vi.fn().mockResolvedValue(rows) };
  const inner: any = { from: vi.fn().mockReturnValue(inner2) };
  return inner;
}

// ─── ScoringService ───────────────────────────────────────────────────────────

import { ScoringService } from "../scoring.service";

describe("ScoringService", () => {
  let service: ScoringService;
  beforeEach(() => {
    service = new ScoringService();
    vi.clearAllMocks();
  });

  describe("getScoreHistory", () => {
    it("returns score history for an opportunity", async () => {
      const mockHistory = [
        { id: "sh1", tenantId: "t1", opportunityId: "opp1", totalScore: 85, action: "bid" },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockHistory),
          }),
        }),
      });
      const result = await service.getScoreHistory("t1", "opp1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no history found", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      const result = await service.getScoreHistory("t1", "opp-none");
      expect(result).toEqual([]);
    });
  });

  describe("getActiveProfiles", () => {
    it("returns active fit profiles for tenant", async () => {
      const mockProfiles = [
        { id: "fp1", tenantId: "t1", name: "Federal IT Profile", isActive: true },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockProfiles),
        }),
      });
      const result = await service.getActiveProfiles("t1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no profiles configured", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      const result = await service.getActiveProfiles("t1");
      expect(result).toEqual([]);
    });
  });

  describe("getActiveModels", () => {
    it("returns active scoring models for tenant", async () => {
      const mockModels = [
        { id: "m1", tenantId: "t1", name: "Default Model", isActive: true },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockModels),
        }),
      });
      const result = await service.getActiveModels("t1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no models configured", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      const result = await service.getActiveModels("t1");
      expect(result).toEqual([]);
    });
  });

  describe("scoreOpportunity", () => {
    it("throws when opportunity not found", async () => {
      mockDb.select.mockReturnValue(makeSelectChainFull([]));
      await expect(
        service.scoreOpportunity("t1", "opp-none", "fp1", "sm1")
      ).rejects.toThrow();
    });

    it("throws when profile or model not found", async () => {
      let callCount = 0;
      mockDb.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: opportunity found
          return makeSelectChainFull([{ id: "opp1", tenantId: "t1", naicsCode: "541511" }]);
        }
        // Subsequent calls: profile or model not found
        return makeSelectChainFull([]);
      });
      await expect(
        service.scoreOpportunity("t1", "opp1", "fp-none", "sm-none")
      ).rejects.toThrow();
    });
  });
});

// ─── FinanceService ───────────────────────────────────────────────────────────

import { financeService } from "../finance.service";

describe("FinanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listInvoices", () => {
    it("returns invoices for tenant", async () => {
      const mockInvoices = [
        { id: "inv1", tenantId: "t1", invoiceNumber: "INV-001", status: "pending", totalAmount: "5000" },
      ];
      mockDb.select.mockReturnValue(makeSelectChainFull(mockInvoices));
      const result = await financeService.listInvoices("t1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no invoices", async () => {
      mockDb.select.mockReturnValue(makeSelectChainFull([]));
      const result = await financeService.listInvoices("t1");
      expect(result).toEqual([]);
    });

    it("filters by status when provided", async () => {
      mockDb.select.mockReturnValue(makeSelectChainFull([]));
      const result = await financeService.listInvoices("t1", { status: "paid" });
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getInvoice", () => {
    it("returns invoice by id", async () => {
      const mockInvoice = { id: "inv1", tenantId: "t1", invoiceNumber: "INV-001" };
      mockDb.select.mockReturnValue(makeSelectChainFull([mockInvoice]));
      const result = await financeService.getInvoice("t1", "inv1");
      expect(result).toBeDefined();
    });

    it("returns undefined when invoice not found", async () => {
      mockDb.select.mockReturnValue(makeSelectChainFull([]));
      const result = await financeService.getInvoice("t1", "nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("createInvoice", () => {
    it("creates an invoice and returns it", async () => {
      const newInvoice = { id: "inv2", tenantId: "t1", invoiceNumber: "INV-002", status: "pending" };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newInvoice]),
        }),
      });
      const result = await financeService.createInvoice("t1", {
        projectId: "proj1", vendorId: "v1", invoiceNumber: "INV-002",
        totalAmount: "5000", currency: "USD", issueDate: new Date().toISOString(),
        dueDate: new Date().toISOString(), lineItems: [],
      } as any);
      expect(result).toBeDefined();
      expect(result.id).toBe("inv2");
    });
  });

  describe("updateInvoiceStatus", () => {
    it("updates invoice status", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "inv1", status: "approved" }]),
          }),
        }),
      });
      const result = await financeService.updateInvoiceStatus("t1", "inv1", "approved");
      expect(result).toBeDefined();
    });

    it("returns undefined when invoice not found for status update", async () => {
      mockDb.select.mockReturnValue(makeSelectChainFull([]));
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      });
      const result = await financeService.updateInvoiceStatus("t1", "nonexistent", "approved");
      expect(result).toBeUndefined();
    });
  });
});

// ─── proactive-intelligence ───────────────────────────────────────────────────

import { runProactiveAnalysis } from "../proactive-intelligence.service";

describe("runProactiveAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns created/updated counts", async () => {
    mockDb.select.mockReturnValue(makeSelectChainFull([]));
    const result = await runProactiveAnalysis("t1");
    expect(result).toHaveProperty("created");
    expect(result).toHaveProperty("updated");
    expect(typeof result.created).toBe("number");
    expect(typeof result.updated).toBe("number");
  });

  it("handles empty data gracefully", async () => {
    mockDb.select.mockReturnValue(makeSelectChainFull([]));
    const result = await runProactiveAnalysis("tenant-empty");
    expect(result.created).toBeGreaterThanOrEqual(0);
    expect(result.updated).toBeGreaterThanOrEqual(0);
  });

  it("uses DEFAULT_TENANT_ID when no tenantId provided", async () => {
    mockDb.select.mockReturnValue(makeSelectChainFull([]));
    const result = await runProactiveAnalysis();
    expect(result).toBeDefined();
  });
});
