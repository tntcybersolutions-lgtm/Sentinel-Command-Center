// Phase 1 Batch 10: Measurement Engine — calibration + LF/SF/CY/EA math.
//
// This is the takeoff math layer that turns raw pixel coordinates from a
// PDF viewer into real-world quantities. It's the foundation of the
// "click on a drawing, get a quantity" flow that Procore Sheets and
// Bluebeam own — except we're going to layer Claude vision on top
// (vision-counter.service.ts) so a single click on a region can also
// auto-count items, which neither of them does out of the box.
//
// All functions are pure — no DB, no fetch. The route layer is responsible
// for persisting calibration onto blueprints.pixelsPerFootByPage and any
// resulting measurements onto blueprintAnnotations / takeoffQuantities.

export interface Point {
  x: number;
  y: number;
}

// ─── Calibration ─────────────────────────────────────────────────────────────

/**
 * Given two points the user picked on a known dimension and the known
 * length in feet, return pixelsPerFoot for that page. Throw if the
 * pixel distance is degenerate (≤0) or the known length is non-positive.
 */
export function computePixelsPerFoot(
  p1: Point,
  p2: Point,
  knownLengthFt: number,
): number {
  if (!Number.isFinite(knownLengthFt) || knownLengthFt <= 0) {
    throw new Error("knownLengthFt must be a positive number");
  }
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const px = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(px) || px <= 0) {
    throw new Error("Calibration points are coincident or invalid");
  }
  return px / knownLengthFt;
}

// ─── Measurement primitives ──────────────────────────────────────────────────

export interface CalibratedScale {
  pixelsPerFoot: number;
}

function requireScale(scale: CalibratedScale): number {
  if (!scale || !Number.isFinite(scale.pixelsPerFoot) || scale.pixelsPerFoot <= 0) {
    throw new Error("Drawing has not been calibrated yet (set pixelsPerFoot first)");
  }
  return scale.pixelsPerFoot;
}

/** Distance between two points in feet. */
export function linearDistanceFt(p1: Point, p2: Point, scale: CalibratedScale): number {
  const ppf = requireScale(scale);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy) / ppf;
}

/** Cumulative length of an n-segment polyline, in feet. */
export function polylineLengthFt(points: Point[], scale: CalibratedScale): number {
  const ppf = requireScale(scale);
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total / ppf;
}

/**
 * Area of a closed polygon (vertices in image space) in square feet,
 * using the shoelace formula. Auto-closes the polygon if the last
 * vertex doesn't match the first.
 */
export function polygonAreaSf(points: Point[], scale: CalibratedScale): number {
  const ppf = requireScale(scale);
  if (points.length < 3) return 0;
  // Shoelace sum
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    sum += points[i].x * points[j].y;
    sum -= points[j].x * points[i].y;
  }
  const areaPx = Math.abs(sum) / 2;
  // pixels² → ft²
  return areaPx / (ppf * ppf);
}

/** Volume in cubic yards: area × depth_ft / 27. */
export function volumeCubicYards(
  points: Point[],
  scale: CalibratedScale,
  depthFt: number,
): number {
  if (!Number.isFinite(depthFt) || depthFt <= 0) {
    throw new Error("depthFt must be a positive number");
  }
  const sf = polygonAreaSf(points, scale);
  return (sf * depthFt) / 27;
}

/** Count: just the array length, with a guard. */
export function countItems(points: Point[]): number {
  return Array.isArray(points) ? points.length : 0;
}

// ─── High-level measurement input/output ─────────────────────────────────────

export type MeasurementType = "linear" | "polyline" | "area" | "volume" | "count";

export interface MeasurementInput {
  type: MeasurementType;
  points: Point[];
  /** Required when type === "volume". */
  depthFt?: number;
}

export interface MeasurementResult {
  type: MeasurementType;
  /** Numeric quantity expressed in the standard unit for that type. */
  quantity: number;
  unit: "LF" | "SF" | "CY" | "EA";
  /** When > 1, signals that the polyline closed back on itself. */
  closed: boolean;
}

export function evaluateMeasurement(
  input: MeasurementInput,
  scale: CalibratedScale,
): MeasurementResult {
  const points = (input.points ?? []).filter(isFinitePoint);
  switch (input.type) {
    case "linear": {
      if (points.length < 2) {
        return { type: "linear", quantity: 0, unit: "LF", closed: false };
      }
      return {
        type: "linear",
        quantity: round(linearDistanceFt(points[0], points[1], scale), 3),
        unit: "LF",
        closed: false,
      };
    }
    case "polyline": {
      const closed = isClosed(points);
      return {
        type: "polyline",
        quantity: round(polylineLengthFt(points, scale), 3),
        unit: "LF",
        closed,
      };
    }
    case "area": {
      return {
        type: "area",
        quantity: round(polygonAreaSf(points, scale), 2),
        unit: "SF",
        closed: true,
      };
    }
    case "volume": {
      if (input.depthFt === undefined) {
        throw new Error("depthFt is required for volume measurements");
      }
      return {
        type: "volume",
        quantity: round(volumeCubicYards(points, scale, input.depthFt), 3),
        unit: "CY",
        closed: true,
      };
    }
    case "count":
      return { type: "count", quantity: countItems(points), unit: "EA", closed: false };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isFinitePoint(p: Point): boolean {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function isClosed(points: Point[]): boolean {
  if (points.length < 3) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}
