/**
 * Verification for the deterministic takeoff measurement engine.
 *
 *   npx tsx script/verify-takeoff.ts
 *
 * Every case is hand-computable: a 40x20 unit rectangle on a sheet calibrated
 * at 0.5 ft/unit is 20ft x 10ft = 200 SF exactly. If the engine disagrees with
 * arithmetic anyone can do on paper, it is wrong — that is the whole point of
 * building measurement instead of estimation.
 */
import {
  calibrate,
  computeQuantity,
  distance,
  polylineLength,
  polygonArea,
  polygonPerimeter,
  parseArchitecturalScale,
  applyWaste,
  extendCents,
  totalCents,
  formatCents,
  parseCents,
  roundQuantity,
  TakeoffMeasurementError,
  type Calibration,
  type MeasurementGeometry,
} from "../shared/takeoff-measure";

let failures = 0;
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${e}\n          actual   ${a}`);
  }
}

/** Float comparison for derived quantities, to 6 decimal places. */
function checkClose(label: string, actual: number, expected: number, dp = 6) {
  checks++;
  const ok = Math.abs(actual - expected) < 10 ** -dp;
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${expected}\n          actual   ${actual}`);
  }
}

function checkThrows(label: string, fn: () => unknown) {
  checks++;
  try {
    fn();
    failures++;
    console.log(`  FAIL  ${label}\n          expected a TakeoffMeasurementError, got no throw`);
  } catch (err) {
    if (err instanceof TakeoffMeasurementError) {
      console.log(`  PASS  ${label}`);
    } else {
      failures++;
      console.log(`  FAIL  ${label}\n          threw the wrong error type: ${err}`);
    }
  }
}

// ── PROOF 1: calibration ────────────────────────────────────────────────────
console.log("\nPROOF 1 — calibration from a drawn reference line");

// The user draws a 100-unit line across a dimension labeled 50'-0".
const cal: Calibration = calibrate({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 1);
check("100 units across a 50 ft dimension -> 0.5 ft per unit", cal.feetPerUnit, 0.5);
check("calibration records what was measured", cal.referenceRealFeet, 50);
checkClose("diagonal distance is euclidean (3-4-5)", distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);

checkThrows("zero-length reference line is refused", () =>
  calibrate({ x: 10, y: 10 }, { x: 10, y: 10 }, 50, 1)
);
checkThrows("zero real length is refused", () =>
  calibrate({ x: 0, y: 0 }, { x: 100, y: 0 }, 0, 1)
);

// ── PROOF 2: raw geometry ───────────────────────────────────────────────────
console.log("\nPROOF 2 — raw geometry");

// 40 x 20 unit rectangle.
const RECT = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 20 },
  { x: 0, y: 20 },
];

check("rectangle area (shoelace) = 40 x 20 = 800 units^2", polygonArea(RECT), 800);
check("rectangle perimeter = 2*(40+20) = 120 units", polygonPerimeter(RECT), 120);
check(
  "winding direction does not flip the sign",
  polygonArea([...RECT].reverse()),
  800
);
check("open polyline 30 then 40 = 70 units", polylineLength([
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 40 },
]), 70);
check("a single point has no length", polylineLength([{ x: 5, y: 5 }]), 0);
check("two points cannot enclose an area", polygonArea([{ x: 0, y: 0 }, { x: 5, y: 5 }]), 0);

// An L-shaped room — the case a naive bounding-box implementation gets wrong.
// Outline: (0,0) (60,0) (60,20) (20,20) (20,50) (0,50)
// True area = 60*20 + 20*30 = 1200 + 600 = 1800 units^2
check("L-shaped polygon area = 1800 units^2 (not the 3000 bounding box)", polygonArea([
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 50 },
  { x: 0, y: 50 },
]), 1800);

// ── PROOF 3: geometry -> real-world quantity ────────────────────────────────
console.log("\nPROOF 3 — real-world quantities at 0.5 ft/unit");

const areaGeom: MeasurementGeometry = { kind: "area", pageNumber: 1, points: RECT };

// 40 units x 0.5 = 20 ft;  20 units x 0.5 = 10 ft;  20 x 10 = 200 SF
const sf = computeQuantity(areaGeom, cal, "SF");
checkClose("40x20 units at 0.5 ft/unit = 200 SF", sf.quantity, 200);
checkClose("perimeter reported alongside = 60 LF", sf.feet, 60);

checkClose("same area in square yards = 200/9", computeQuantity(areaGeom, cal, "SY").quantity, 200 / 9);
checkClose("same area in roofing squares = 2.00", computeQuantity(areaGeom, cal, "SQ").quantity, 2);

const linearGeom: MeasurementGeometry = {
  kind: "linear",
  pageNumber: 1,
  points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }],
};
checkClose("70 units of wall at 0.5 ft/unit = 35 LF", computeQuantity(linearGeom, cal, "LF").quantity, 35);
checkClose("same run in inches = 420", computeQuantity(linearGeom, cal, "IN").quantity, 420);
checkClose("same run in yards = 35/3", computeQuantity(linearGeom, cal, "YD").quantity, 35 / 3);

const countGeom: MeasurementGeometry = {
  kind: "count",
  pageNumber: 1,
  points: [
    { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5 },
  ],
};
check("five clicked fixtures = 5 EA", computeQuantity(countGeom, cal, "EA").quantity, 5);

// Slab: 200 SF at 0.5 ft thick = 100 CF = 3.7037 CY
const volGeom: MeasurementGeometry = {
  kind: "volume",
  pageNumber: 1,
  points: RECT,
  depthFeet: 0.5,
};
checkClose("200 SF slab x 0.5 ft = 100 CF", computeQuantity(volGeom, cal, "CF").quantity, 100);
checkClose("same slab in cubic yards = 100/27", computeQuantity(volGeom, cal, "CY").quantity, 100 / 27);

// ── PROOF 4: deductions ─────────────────────────────────────────────────────
console.log("\nPROOF 4 — openings are deducted from gross area");

// A 20x10 unit opening inside the 40x20 rectangle.
// Gross 800 - hole 200 = 600 units^2 -> 600 * 0.25 = 150 SF
const withHole: MeasurementGeometry = {
  kind: "area",
  pageNumber: 1,
  points: RECT,
  holes: [[
    { x: 10, y: 5 },
    { x: 30, y: 5 },
    { x: 30, y: 15 },
    { x: 10, y: 15 },
  ]],
};
checkClose("200 SF gross minus a 50 SF opening = 150 SF net", computeQuantity(withHole, cal, "SF").quantity, 150);

// A deduction larger than the region must clamp at zero, never go negative.
const overCut: MeasurementGeometry = {
  kind: "area",
  pageNumber: 1,
  points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  holes: [RECT],
};
check("an oversized deduction clamps to 0, never negative", computeQuantity(overCut, cal, "SF").quantity, 0);

// ── PROOF 5: the guards that keep a wrong number from being saved ───────────
console.log("\nPROOF 5 — refusals");

checkThrows("measuring against an uncalibrated sheet is refused", () =>
  computeQuantity(areaGeom, { ...cal, feetPerUnit: 0 }, "SF")
);
checkThrows("page 2 geometry against a page 1 calibration is refused", () =>
  computeQuantity({ ...areaGeom, pageNumber: 2 }, cal, "SF")
);
checkThrows("an area cannot be reported in linear feet", () =>
  computeQuantity(areaGeom, cal, "LF" as never)
);
checkThrows("a linear run cannot be reported in square feet", () =>
  computeQuantity(linearGeom, cal, "SF" as never)
);
checkThrows("two points cannot make an area", () =>
  computeQuantity({ kind: "area", pageNumber: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, cal, "SF")
);
checkThrows("one point cannot make a run", () =>
  computeQuantity({ kind: "linear", pageNumber: 1, points: [{ x: 0, y: 0 }] }, cal, "LF")
);
checkThrows("a volume without depth is refused", () =>
  computeQuantity({ kind: "volume", pageNumber: 1, points: RECT }, cal, "CY")
);

// ── PROOF 6: architectural scale strings ────────────────────────────────────
console.log("\nPROOF 6 — title-block scale parsing");

// 1/4" = 1'-0"  ->  0.25 in on the sheet is 1 ft real.
// 1 PDF unit = 1/72 in, so it represents 1/0.25/72 = 1/18 ft.
checkClose('1/4" = 1\'-0" -> 1/18 ft per unit', parseArchitecturalScale(`1/4" = 1'-0"`)!, 1 / 18);
checkClose('3/8"=1\' -> 1/27 ft per unit', parseArchitecturalScale(`3/8"=1'`)!, 1 / 0.375 / 72);
checkClose('civil 1" = 20\' -> 20/72 ft per unit', parseArchitecturalScale(`1" = 20'`)!, 20 / 72);
checkClose("metric 1:100 -> (100/72)/12 ft per unit", parseArchitecturalScale("1:100")!, 100 / 72 / 12);
check("unparseable scale returns null rather than guessing", parseArchitecturalScale("as noted"), null);
check("empty scale returns null", parseArchitecturalScale("   "), null);

// A parsed 1/4" scale must agree with drawing a calibration line on a known
// dimension — the two paths have to produce the same number or one is wrong.
const quarterInch = parseArchitecturalScale(`1/4"=1'-0"`)!;
// At 1/18 ft/unit, a 20 ft wall is 360 units long.
checkClose("a 20 ft wall at 1/4 scale measures 360 PDF units", 20 / quarterInch, 360);

// ── PROOF 7: waste and money ────────────────────────────────────────────────
console.log("\nPROOF 7 — waste and integer-cent pricing");

checkClose("150 SF with 10% waste = 165 SF", applyWaste(150, 10), 165);
check("zero waste changes nothing", applyWaste(150, 0), 150);
checkThrows("negative waste is refused", () => applyWaste(150, -5));

check("150 SF at $12.50 = $1,875.00", extendCents(150, 1250), 187_500);
check("formatting integer cents", formatCents(187_500), "$1,875.00");
check("formatting sub-dollar cents pads correctly", formatCents(5), "$0.05");
check("parse a formatted dollar amount", parseCents("$1,875.00"), 187_500);
check("parse a bare amount with one decimal", parseCents("1234.5"), 123_450);
checkThrows("garbage is not a dollar amount", () => parseCents("twelve dollars"));
checkThrows("a float unit cost is refused (cents must be integer)", () => extendCents(10, 12.5));

// The float-drift guard. In floats, 0.1 + 0.2 !== 0.3; in cents it is exact.
check("float drift: 0.1 + 0.2 !== 0.3 (why we use cents)", 0.1 + 0.2 === 0.3, false);
check("integer cents: 10 + 20 === 30 exactly", 10 + 20 === 30, true);

// 300 line items of $33.33 must total exactly $9,999.00, not $9,998.99...
const many = Array.from({ length: 300 }, () => extendCents(1, 3333));
check("300 line items of $33.33 total exactly $9,999.00", totalCents(many), 999_900);
check("...and format cleanly", formatCents(totalCents(many)), "$9,999.00");

check("display rounding trims float noise", roundQuantity(200 / 9, 2), 22.22);

// ── PROOF 8: a realistic end-to-end line item ───────────────────────────────
console.log("\nPROOF 8 — end to end: one real line item");

// Sheet A-101 calibrated on a 24'-0" grid bay that measures 432 units.
const sheetCal = calibrate({ x: 100, y: 100 }, { x: 532, y: 100 }, 24, 1);
checkClose("24 ft across 432 units = 1/18 ft per unit (1/4 scale)", sheetCal.feetPerUnit, 1 / 18);

// Trace a 30' x 40' slab: 540 x 720 units at that calibration.
const slab: MeasurementGeometry = {
  kind: "volume",
  pageNumber: 1,
  points: [
    { x: 0, y: 0 },
    { x: 540, y: 0 },
    { x: 540, y: 720 },
    { x: 0, y: 720 },
  ],
  depthFeet: 4 / 12, // 4" slab
};

const slabArea = computeQuantity({ ...slab, kind: "area" }, sheetCal, "SF");
checkClose("slab is 30 ft x 40 ft = 1,200 SF", slabArea.quantity, 1200);

const slabVolume = computeQuantity(slab, sheetCal, "CY");
// 1200 SF * (4/12) ft = 400 CF = 14.8148 CY
checkClose("4-inch slab over 1,200 SF = 400 CF", computeQuantity(slab, sheetCal, "CF").quantity, 400);
checkClose("...which is 400/27 CY", slabVolume.quantity, 400 / 27);

// Order with 5% waste, priced at $185.00/CY.
const ordered = applyWaste(slabVolume.quantity, 5);
checkClose("with 5% waste = 15.5556 CY", ordered, (400 / 27) * 1.05);
check(
  "priced at $185.00/CY = $2,877.78",
  formatCents(extendCents(ordered, 18_500)),
  "$2,877.78"
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
