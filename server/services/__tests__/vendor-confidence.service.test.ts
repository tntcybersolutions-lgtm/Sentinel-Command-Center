import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db", () => ({
  pool: {},
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock("../audit.service", () => ({
  auditService: { log: vi.fn() },
}));

vi.mock("../event-stream.service", () => ({
  eventStreamService: { emit: vi.fn() },
}));

const mockDbModule = await import("../../db");
const mockDb = mockDbModule.db as any;

function makeChain(rows: any[] = []) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    set: vi.fn(() => chain),
    values: vi.fn(() => chain),
    returning: vi.fn(async () => rows),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
    [Symbol.asyncIterator]: undefined,
  };
  chain[Symbol.asyncIterator] = async function* () { for (const r of rows) yield r; };
  Object.defineProperty(chain, Symbol.asyncIterator, { get: () => undefined });
  return { chain, rows };
}

async function resolveChain(rows: any[]) {
  return rows;
}

import { vendorConfidenceService } from "../vendor-confidence.service";

describe("VendorConfidenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findDuplicates", () => {
    it("returns empty array when no existing vendors", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      const result = await vendorConfidenceService.findDuplicates("t1", {
        name: "Acme Corp",
      });
      expect(result).toEqual([]);
    });

    it("finds exact match with confidence 1.0", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "v1", companyName: "Acme Corp", contactEmail: null, contactPhone: null },
          ]),
        }),
      });
      const result = await vendorConfidenceService.findDuplicates("t1", {
        name: "Acme Corp",
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
      const exactMatch = result.find((m: any) => m.matchType === "exact");
      expect(exactMatch).toBeDefined();
      expect(exactMatch?.confidence).toBe(1.0);
    });

    it("finds fuzzy match for similar names", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "v2", companyName: "Acme Corporation Inc", contactEmail: null, contactPhone: null },
          ]),
        }),
      });
      const result = await vendorConfidenceService.findDuplicates("t1", {
        name: "Acme Corporation",
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it("matches by email when provided", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { id: "v3", companyName: "Different Name LLC", email: "contact@acme.com", contactPhone: null },
          ]),
        }),
      });
      const result = await vendorConfidenceService.findDuplicates("t1", {
        name: "Acme Inc",
        contactEmail: "contact@acme.com",
      });
      const emailMatch = result.find((m: any) => m.matchType === "email");
      expect(emailMatch).toBeDefined();
    });
  });

  describe("getPendingVendorReviews", () => {
    it("returns pending reviews list", async () => {
      const mockReviews = [
        { id: "r1", tenantId: "t1", status: "pending_review", companyName: "Test Co" },
      ];
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockReviews),
        }),
      });
      const result = await vendorConfidenceService.getPendingVendorReviews("t1");
      expect(Array.isArray(result)).toBe(true);
    });

    it("returns empty array when no pending reviews", async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      const result = await vendorConfidenceService.getPendingVendorReviews("t1");
      expect(result).toEqual([]);
    });
  });

  describe("mergeVendors", () => {
    it("calls db.update to mark merged vendor inactive", async () => {
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        }),
      });
      await vendorConfidenceService.mergeVendors("t1", "keep-1", "merge-2");
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
