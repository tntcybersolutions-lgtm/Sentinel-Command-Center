import { describe, it, expect } from "vitest";
import {
  computePixelsPerFoot,
  linearDistanceFt,
  polylineLengthFt,
  polygonAreaSf,
  volumeCubicYards,
  countItems,
  evaluateMeasurement,
  type Point,
} from "../measurement-engine.service";

const ppf100 = { pixelsPerFoot: 100 };

describe("computePixelsPerFoot", () => {
  it("returns pixel distance / known length", () => {
    expect(
      computePixelsPerFoot({ x: 0, y: 0 }, { x: 1000, y: 0 }, 10),
    ).toBe(100);
  });

  it("works for diagonals (Pythagoras)", () => {
    expect(
      computePixelsPerFoot({ x: 0, y: 0 }, { x: 600, y: 800 }, 10),
    ).toBe(100); // sqrt(600^2 + 800^2) = 1000, /10 = 100
  });

  it("throws on coincident points", () => {
    expect(() => computePixelsPerFoot({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toThrow();
  });

  it("throws on non-positive known length", () => {
    expect(() => computePixelsPerFoot({ x: 0, y: 0 }, { x: 100, y: 0 }, 0)).toThrow();
    expect(() => computePixelsPerFoot({ x: 0, y: 0 }, { x: 100, y: 0 }, -5)).toThrow();
  });
});

describe("linearDistanceFt", () => {
  it("computes feet from pixel distance / pixelsPerFoot", () => {
    expect(linearDistanceFt({ x: 0, y: 0 }, { x: 500, y: 0 }, ppf100)).toBe(5);
  });

  it("throws when scale is missing or zero", () => {
    expect(() =>
      linearDistanceFt({ x: 0, y: 0 }, { x: 500, y: 0 }, { pixelsPerFoot: 0 }),
    ).toThrow(/calibrated/i);
  });
});

describe("polylineLengthFt", () => {
  it("sums segment lengths", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 300, y: 0 }, // +3 ft
      { x: 300, y: 400 }, // +4 ft
    ];
    expect(polylineLengthFt(pts, ppf100)).toBe(7);
  });

  it("returns 0 for fewer than 2 points", () => {
    expect(polylineLengthFt([], ppf100)).toBe(0);
    expect(polylineLengthFt([{ x: 0, y: 0 }], ppf100)).toBe(0);
  });
});

describe("polygonAreaSf", () => {
  it("computes square area via shoelace", () => {
    // 1000x1000 px square, 100 ppf → 10x10 ft = 100 sf
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    expect(polygonAreaSf(pts, ppf100)).toBe(100);
  });

  it("computes a triangle area", () => {
    // 1000 base, 1000 height triangle = 0.5 * 10 * 10 = 50 sf
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 0, y: 1000 },
    ];
    expect(polygonAreaSf(pts, ppf100)).toBe(50);
  });

  it("returns 0 for fewer than 3 vertices", () => {
    expect(polygonAreaSf([], ppf100)).toBe(0);
    expect(polygonAreaSf([{ x: 0, y: 0 }, { x: 100, y: 100 }], ppf100)).toBe(0);
  });

  it("is invariant under polygon orientation (cw vs ccw)", () => {
    const ccw: Point[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    const cw = [...ccw].reverse();
    expect(polygonAreaSf(cw, ppf100)).toBe(polygonAreaSf(ccw, ppf100));
  });
});

describe("volumeCubicYards", () => {
  it("computes area × depth / 27", () => {
    const pts: Point[] = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ];
    // 100 sf × 0.5 ft / 27 ≈ 1.852 cy
    expect(volumeCubicYards(pts, ppf100, 0.5)).toBeCloseTo(1.852, 2);
  });

  it("throws on non-positive depth", () => {
    expect(() => volumeCubicYards([], ppf100, 0)).toThrow();
    expect(() => volumeCubicYards([], ppf100, -1)).toThrow();
  });
});

describe("countItems", () => {
  it("returns the number of points", () => {
    expect(countItems([])).toBe(0);
    expect(countItems([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(3);
  });

  it("returns 0 for non-array input", () => {
    expect(countItems(null as any)).toBe(0);
    expect(countItems(undefined as any)).toBe(0);
  });
});

describe("evaluateMeasurement", () => {
  it("dispatches to linear", () => {
    const r = evaluateMeasurement({
      type: "linear",
      points: [{ x: 0, y: 0 }, { x: 500, y: 0 }],
    }, ppf100);
    expect(r).toEqual({ type: "linear", quantity: 5, unit: "LF", closed: false });
  });

  it("returns 0 LF when linear has fewer than 2 points", () => {
    const r = evaluateMeasurement({ type: "linear", points: [] }, ppf100);
    expect(r.quantity).toBe(0);
  });

  it("dispatches to polyline and detects closed shapes", () => {
    const open = evaluateMeasurement({
      type: "polyline",
      points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }],
    }, ppf100);
    expect(open.closed).toBe(false);

    const closed = evaluateMeasurement({
      type: "polyline",
      points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 400 }, { x: 0, y: 0 }],
    }, ppf100);
    expect(closed.closed).toBe(true);
  });

  it("dispatches to area", () => {
    const r = evaluateMeasurement({
      type: "area",
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
    }, ppf100);
    expect(r).toEqual({ type: "area", quantity: 100, unit: "SF", closed: true });
  });

  it("dispatches to volume and requires depthFt", () => {
    expect(() =>
      evaluateMeasurement({
        type: "volume",
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 1000 },
          { x: 0, y: 1000 },
        ],
      }, ppf100),
    ).toThrow(/depthFt/);

    const r = evaluateMeasurement({
      type: "volume",
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
        { x: 0, y: 1000 },
      ],
      depthFt: 1,
    }, ppf100);
    expect(r.unit).toBe("CY");
    expect(r.quantity).toBeCloseTo(100 / 27, 2);
  });

  it("dispatches to count and ignores scale", () => {
    const r = evaluateMeasurement({
      type: "count",
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }],
    }, { pixelsPerFoot: 0 });
    expect(r).toEqual({ type: "count", quantity: 4, unit: "EA", closed: false });
  });

  it("filters out non-finite points before measuring", () => {
    const r = evaluateMeasurement({
      type: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: NaN, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 400 },
      ],
    }, ppf100);
    expect(r.quantity).toBe(7);
  });
});
