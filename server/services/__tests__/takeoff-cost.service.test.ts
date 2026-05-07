import { describe, it, expect } from "vitest";
import { computeTakeoffExtendedCost } from "../takeoff-cost.service";

describe("computeTakeoffExtendedCost", () => {
  it("multiplies quantity by unitCost when no labor or waste", () => {
    expect(computeTakeoffExtendedCost({ quantity: "10", unitCost: "5.50" })).toBe("55.00");
  });

  it("adds labor cost when laborRate and laborHours are provided", () => {
    // 4 * 100 = 400 material; 50 * 8 = 400 labor; total 800
    expect(
      computeTakeoffExtendedCost({
        quantity: "4",
        unitCost: "100",
        laborRate: "50",
        laborHours: "8",
      }),
    ).toBe("800.00");
  });

  it("applies wasteFactor as a percentage", () => {
    // material 100, waste 10% -> 110
    expect(
      computeTakeoffExtendedCost({
        quantity: "10",
        unitCost: "10",
        wasteFactor: "10",
      }),
    ).toBe("110.00");
  });

  it("treats missing fields as zero", () => {
    expect(computeTakeoffExtendedCost({ quantity: "5" })).toBe("0.00");
    expect(computeTakeoffExtendedCost({ quantity: null })).toBe("0.00");
    expect(computeTakeoffExtendedCost({ quantity: undefined })).toBe("0.00");
  });

  it("accepts numeric inputs alongside strings", () => {
    expect(
      computeTakeoffExtendedCost({ quantity: 3, unitCost: 4.5 }),
    ).toBe("13.50");
  });

  it("returns 0 for non-numeric junk inputs", () => {
    expect(
      computeTakeoffExtendedCost({ quantity: "abc", unitCost: "xyz" }),
    ).toBe("0.00");
  });

  it("combines material, labor, and waste together", () => {
    // material 2 * 50 = 100; labor 25 * 4 = 100; subtotal 200; +5% waste = 210
    expect(
      computeTakeoffExtendedCost({
        quantity: "2",
        unitCost: "50",
        laborRate: "25",
        laborHours: "4",
        wasteFactor: "5",
      }),
    ).toBe("210.00");
  });
});
