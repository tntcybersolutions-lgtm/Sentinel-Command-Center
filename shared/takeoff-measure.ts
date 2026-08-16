/**
 * Deterministic quantity-takeoff measurement engine.
 *
 * This is real measurement, not estimation: every quantity is computed from
 * geometry the user drew on a calibrated sheet, so any number in a takeoff can
 * be re-derived from its stored points. There is no model in this path and no
 * randomness — the same points and the same calibration always produce the same
 * quantity, which is what makes a takeoff defensible in a bid.
 *
 * Coordinate space
 * ----------------
 * All points are in **PDF user space** (points, 1/72"), NOT screen pixels.
 * The client converts screen coordinates through the pdf.js viewport before
 * storing them, so zooming or re-rendering at a different device pixel ratio
 * never changes a saved measurement.
 *
 * Money
 * -----
 * Extensions are computed in **integer cents**. Audit finding D4 was a float
 * comparison (0.7 + 0.3 < 1.0) that left invoices permanently "partial"; the
 * same class of bug in an estimate silently misprices a bid.
 */

// ── Geometry ────────────────────────────────────────────────────────────────

export type Point = { x: number; y: number };

/**
 * Sheet calibration: how many real-world feet one PDF unit represents.
 *
 * Derived by drawing a line across a dimension whose real length is known
 * (a printed dimension string, a door width, a grid bay) and entering that
 * length. Stored per blueprint page — sheets in one set are frequently at
 * different scales, and a detail sheet is never at the plan's scale.
 */
export type Calibration = {
  /** Real-world feet represented by one PDF unit. Always > 0. */
  feetPerUnit: number;
  /** Page this calibration applies to. Page scales differ within one set. */
  pageNumber: number;
  /** Echo of what the user measured, so the calibration is auditable. */
  referencePixelDistance: number;
  referenceRealFeet: number;
};

export type MeasurementKind = "linear" | "area" | "count" | "volume";

/** A single drawn measurement, as persisted in takeoff_items.locationJson. */
export type MeasurementGeometry = {
  kind: MeasurementKind;
  pageNumber: number;
  /** Ordered vertices in PDF user space. For `count`, one point per item. */
  points: Point[];
  /** Volume only: the third dimension, in feet (slab thickness, trench depth). */
  depthFeet?: number;
  /** Optional deduction regions subtracted from an area (openings, cutouts). */
  holes?: Point[][];
};

// ── Units ───────────────────────────────────────────────────────────────────

export const LINEAR_UNITS = ["LF", "FT", "IN", "YD"] as const;
export const AREA_UNITS = ["SF", "SY", "SQ"] as const;
export const VOLUME_UNITS = ["CF", "CY"] as const;
export const COUNT_UNITS = ["EA"] as const;

export type LinearUnit = (typeof LINEAR_UNITS)[number];
export type AreaUnit = (typeof AREA_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type CountUnit = (typeof COUNT_UNITS)[number];
export type TakeoffUnit = LinearUnit | AreaUnit | VolumeUnit | CountUnit;

/** Feet -> unit. */
const LINEAR_FROM_FEET: Record<LinearUnit, number> = {
  LF: 1,
  FT: 1,
  IN: 12,
  YD: 1 / 3,
};

/** Square feet -> unit. SQ is a roofing "square" = 100 SF. */
const AREA_FROM_SQFT: Record<AreaUnit, number> = {
  SF: 1,
  SY: 1 / 9,
  SQ: 1 / 100,
};

/** Cubic feet -> unit. */
const VOLUME_FROM_CUFT: Record<VolumeUnit, number> = {
  CF: 1,
  CY: 1 / 27,
};

export function isLinearUnit(u: string): u is LinearUnit {
  return (LINEAR_UNITS as readonly string[]).includes(u);
}
export function isAreaUnit(u: string): u is AreaUnit {
  return (AREA_UNITS as readonly string[]).includes(u);
}
export function isVolumeUnit(u: string): u is VolumeUnit {
  return (VOLUME_UNITS as readonly string[]).includes(u);
}
export function isCountUnit(u: string): u is CountUnit {
  return (COUNT_UNITS as readonly string[]).includes(u);
}

/** The unit families a given measurement kind is allowed to report in. */
export function unitsForKind(kind: MeasurementKind): readonly TakeoffUnit[] {
  switch (kind) {
    case "linear":
      return LINEAR_UNITS;
    case "area":
      return AREA_UNITS;
    case "volume":
      return VOLUME_UNITS;
    case "count":
      return COUNT_UNITS;
  }
}

// ── Calibration ─────────────────────────────────────────────────────────────

export class TakeoffMeasurementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TakeoffMeasurementError";
  }
}

/** Straight-line distance between two points, in PDF units. */
export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build a calibration from a drawn reference line of known real length.
 *
 * Throws rather than returning a degenerate calibration: a zero-length or
 * zero-feet reference would make every downstream quantity 0 or Infinity, and
 * silently producing those is far worse than refusing to calibrate.
 */
export function calibrate(
  from: Point,
  to: Point,
  realFeet: number,
  pageNumber: number
): Calibration {
  const px = distance(from, to);
  if (!Number.isFinite(px) || px <= 0) {
    throw new TakeoffMeasurementError(
      "Calibration line has zero length — draw across a known dimension."
    );
  }
  if (!Number.isFinite(realFeet) || realFeet <= 0) {
    throw new TakeoffMeasurementError(
      "Calibration length must be a positive number of feet."
    );
  }
  return {
    feetPerUnit: realFeet / px,
    pageNumber,
    referencePixelDistance: px,
    referenceRealFeet: realFeet,
  };
}

/**
 * Parse an architectural scale string into feet-per-PDF-unit.
 *
 * Accepts the forms printed in a title block: `1/4" = 1'-0"`, `3/8"=1'`,
 * `1" = 20'` (civil), `1:100` (metric ratio). Returns null when unparseable —
 * callers fall back to drawn calibration, which is always more reliable
 * because it survives a sheet being plotted to a non-standard size.
 */
export function parseArchitecturalScale(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // Pure ratio, e.g. 1:100 -> 100 drawing units per unit, in the same system.
  const ratio = s.match(/^1:(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const denom = Number(ratio[1]);
    if (denom <= 0) return null;
    // 1 PDF unit = 1/72 inch on the sheet; times the ratio gives real inches.
    return (denom / 72) / 12;
  }

  // <inches> = <feet>, where inches may be a fraction: 1/4"=1'-0"
  const m = s.match(/^(\d+)?(?:(\d+)\/(\d+))?"?=(\d+(?:\.\d+)?)'?(?:-?0"?)?$/);
  if (!m) return null;

  const whole = m[1] ? Number(m[1]) : 0;
  const num = m[2] ? Number(m[2]) : 0;
  const den = m[3] ? Number(m[3]) : 0;
  const feet = Number(m[4]);

  let inches = whole;
  if (den > 0) inches += num / den;
  if (inches <= 0 || !Number.isFinite(feet) || feet <= 0) return null;

  // `inches` on the sheet represents `feet` in reality.
  // One PDF unit is 1/72 inch, so it represents (feet / inches / 72) feet.
  return feet / inches / 72;
}

// ── Raw geometry ────────────────────────────────────────────────────────────

/** Total length of an open polyline, in PDF units. */
export function polylineLength(points: Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Area of a simple polygon via the shoelace formula, in PDF units².
 *
 * Returns the absolute value, so winding direction (clockwise vs
 * counter-clockwise) does not flip the sign — a user tracing a room
 * counter-clockwise must not get a negative area.
 */
export function polygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** Perimeter of a closed polygon, in PDF units. */
export function polygonPerimeter(points: Point[]): number {
  if (points.length < 2) return 0;
  return polylineLength([...points, points[0]]);
}

// ── Measurement -> quantity ─────────────────────────────────────────────────

export type ComputedQuantity = {
  /** Quantity in `unit`, before waste. */
  quantity: number;
  unit: TakeoffUnit;
  /** Always-populated base values, for audit and unit conversion in the UI. */
  feet: number;
  squareFeet: number;
  cubicFeet: number;
  count: number;
};

/**
 * Convert drawn geometry into a real-world quantity.
 *
 * The server calls this on save rather than trusting a client-sent number, so
 * a tampered or stale client cannot write a quantity that its own geometry
 * does not support.
 */
export function computeQuantity(
  geometry: MeasurementGeometry,
  calibration: Calibration,
  unit: TakeoffUnit
): ComputedQuantity {
  if (!Number.isFinite(calibration.feetPerUnit) || calibration.feetPerUnit <= 0) {
    throw new TakeoffMeasurementError("Sheet is not calibrated.");
  }
  if (geometry.pageNumber !== calibration.pageNumber) {
    throw new TakeoffMeasurementError(
      `Measurement is on page ${geometry.pageNumber} but the calibration is for page ${calibration.pageNumber}. Calibrate each sheet separately.`
    );
  }

  const allowed = unitsForKind(geometry.kind);
  if (!(allowed as readonly string[]).includes(unit)) {
    throw new TakeoffMeasurementError(
      `Unit ${unit} is not valid for a ${geometry.kind} measurement (expected one of ${allowed.join(", ")}).`
    );
  }

  const f = calibration.feetPerUnit;
  const base: ComputedQuantity = {
    quantity: 0,
    unit,
    feet: 0,
    squareFeet: 0,
    cubicFeet: 0,
    count: 0,
  };

  switch (geometry.kind) {
    case "count": {
      base.count = geometry.points.length;
      base.quantity = base.count;
      return base;
    }

    case "linear": {
      if (geometry.points.length < 2) {
        throw new TakeoffMeasurementError(
          "A linear measurement needs at least two points."
        );
      }
      base.feet = polylineLength(geometry.points) * f;
      base.quantity = base.feet * LINEAR_FROM_FEET[unit as LinearUnit];
      return base;
    }

    case "area": {
      if (geometry.points.length < 3) {
        throw new TakeoffMeasurementError(
          "An area measurement needs at least three points."
        );
      }
      // Deductions: openings and cutouts are subtracted from the gross area.
      const grossUnits = polygonArea(geometry.points);
      const holeUnits = (geometry.holes ?? []).reduce(
        (sum, h) => sum + polygonArea(h),
        0
      );
      const netUnits = Math.max(0, grossUnits - holeUnits);

      base.squareFeet = netUnits * f * f;
      base.feet = polygonPerimeter(geometry.points) * f;
      base.quantity = base.squareFeet * AREA_FROM_SQFT[unit as AreaUnit];
      return base;
    }

    case "volume": {
      if (geometry.points.length < 3) {
        throw new TakeoffMeasurementError(
          "A volume measurement needs at least three points."
        );
      }
      const depth = geometry.depthFeet;
      if (!Number.isFinite(depth as number) || (depth as number) <= 0) {
        throw new TakeoffMeasurementError(
          "A volume measurement needs a positive depth in feet."
        );
      }
      const grossUnits = polygonArea(geometry.points);
      const holeUnits = (geometry.holes ?? []).reduce(
        (sum, h) => sum + polygonArea(h),
        0
      );
      const netUnits = Math.max(0, grossUnits - holeUnits);

      base.squareFeet = netUnits * f * f;
      base.feet = polygonPerimeter(geometry.points) * f;
      base.cubicFeet = base.squareFeet * (depth as number);
      base.quantity = base.cubicFeet * VOLUME_FROM_CUFT[unit as VolumeUnit];
      return base;
    }
  }
}

// ── Waste and pricing ───────────────────────────────────────────────────────

/** Apply a waste/overage percentage. 10 means +10%. */
export function applyWaste(quantity: number, wastePercent: number): number {
  if (!Number.isFinite(wastePercent) || wastePercent < 0) {
    throw new TakeoffMeasurementError("Waste percent must be zero or greater.");
  }
  return quantity * (1 + wastePercent / 100);
}

/**
 * Extend a quantity against a unit cost, in **integer cents**.
 *
 * Deliberately never returns a float dollar amount: accumulating float dollars
 * across a few hundred line items drifts, and a bid that is off by pennies for
 * an unexplainable reason is a bid nobody trusts.
 */
export function extendCents(quantity: number, unitCostCents: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new TakeoffMeasurementError("Quantity must be zero or greater.");
  }
  if (!Number.isInteger(unitCostCents) || unitCostCents < 0) {
    throw new TakeoffMeasurementError(
      "Unit cost must be a non-negative integer number of cents."
    );
  }
  return Math.round(quantity * unitCostCents);
}

/** Sum line-item extensions. Integer cents in, integer cents out. */
export function totalCents(lineItemCents: number[]): number {
  return lineItemCents.reduce((sum, c) => sum + c, 0);
}

/** "$1,234.56" from integer cents. */
export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const formatted = `$${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${formatted}` : formatted;
}

/** Parse "1,234.56" / "$1234.56" into integer cents. Throws on garbage. */
export function parseCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new TakeoffMeasurementError(`"${input}" is not a valid dollar amount.`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** Round a display quantity without letting float noise leak into the UI. */
export function roundQuantity(q: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(q * factor) / factor;
}
