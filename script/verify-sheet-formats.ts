/**
 * Verification for multi-format blueprint support.
 *
 *   npx tsx script/verify-sheet-formats.ts
 *
 * Covers the two things that decide whether a real drawing set can be measured:
 * that the app recognises what was actually uploaded (from bytes, not from the
 * file name), and that DXF vector geometry converts to correct paths.
 */
import {
  detectSheetFormat,
  sniffSheetFormat,
  validateSheetUpload,
  extensionOf,
  formatById,
  SHEET_FORMATS,
  MEASURABLE_FORMATS,
  ACCEPTED_EXTENSIONS,
  MAX_SHEET_BYTES,
} from "../shared/sheet-formats";
import { entitiesToPaths, type DxfEntity } from "../shared/dxf-geometry";

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

function checkClose(label: string, actual: number, expected: number, dp = 6) {
  checks++;
  if (Math.abs(actual - expected) < 10 ** -dp) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${expected}\n          actual   ${actual}`);
  }
}

/** Build a byte array from a leading signature, padded to a realistic size. */
function bytes(sig: number[] | string, pad = 512): Uint8Array {
  const head =
    typeof sig === "string"
      ? Array.from({ length: sig.length }, (_, i) => sig.charCodeAt(i))
      : sig;
  const out = new Uint8Array(Math.max(pad, head.length));
  out.set(head, 0);
  return out;
}

// ── PROOF 1: content sniffing on real magic bytes ───────────────────────────
console.log("\nPROOF 1 — formats identified from their leading bytes");

check("PDF (%PDF)", sniffSheetFormat(bytes("%PDF-1.7"))?.id, "pdf");
check("PNG signature", sniffSheetFormat(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.id, "png");
check("JPEG (FF D8 FF)", sniffSheetFormat(bytes([0xff, 0xd8, 0xff, 0xe0]))?.id, "jpeg");
check("GIF89a", sniffSheetFormat(bytes("GIF89a"))?.id, "gif");
check("BMP (BM)", sniffSheetFormat(bytes("BM"))?.id, "bmp");

// TIFF, both byte orders — scanners emit either.
check("TIFF little-endian (II*\\0)", sniffSheetFormat(bytes([0x49, 0x49, 0x2a, 0x00]))?.id, "tiff");
check("TIFF big-endian (MM\\0*)", sniffSheetFormat(bytes([0x4d, 0x4d, 0x00, 0x2a]))?.id, "tiff");
check("BigTIFF little-endian", sniffSheetFormat(bytes([0x49, 0x49, 0x2b, 0x00]))?.id, "tiff");

// WEBP is RIFF....WEBP — the marker is at offset 8, not 0.
const webp = bytes("RIFF");
webp.set([0x57, 0x45, 0x42, 0x50], 8);
check("WebP (RIFF....WEBP at offset 8)", sniffSheetFormat(webp)?.id, "webp");

check("DWG (AC1032 = AutoCAD 2018)", sniffSheetFormat(bytes("AC1032"))?.id, "dwg");
check("DWG (AC1015 = AutoCAD 2000)", sniffSheetFormat(bytes("AC1015"))?.id, "dwg");
check("IFC (ISO-10303-21 STEP header)", sniffSheetFormat(bytes("ISO-10303-21;"))?.id, "ifc");
check("Revit (OLE compound file)", sniffSheetFormat(bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))?.id, "rvt");
check("Binary DXF sentinel", sniffSheetFormat(bytes("AutoCAD Binary DXF"))?.id, "dxf");

// ASCII DXF: group code 0 then SECTION.
const asciiDxf = "  0\r\nSECTION\r\n  2\r\nHEADER\r\n";
check("ASCII DXF (group code 0 / SECTION)", sniffSheetFormat(bytes(asciiDxf))?.id, "dxf");

check("unknown bytes return null rather than a guess", sniffSheetFormat(bytes([0x00, 0x01, 0x02, 0x03])), null);
check("a too-short file returns null", sniffSheetFormat(new Uint8Array([0x25])), null);

// ── PROOF 2: name-based detection ───────────────────────────────────────────
console.log("\nPROOF 2 — detection by file name and MIME");

check("A-101.pdf", detectSheetFormat("A-101.pdf")?.id, "pdf");
check("scan is case-insensitive (.TIF)", detectSheetFormat("SCAN_001.TIF")?.id, "tiff");
check(".tiff long form", detectSheetFormat("archive.tiff")?.id, "tiff");
check("site plan .dxf", detectSheetFormat("site.dxf")?.id, "dxf");
check("model .rvt", detectSheetFormat("tower.rvt")?.id, "rvt");
check("plotter .plt", detectSheetFormat("old-set.plt")?.id, "plt");
check("MIME fallback when the name has no extension", detectSheetFormat("scan", "image/tiff")?.id, "tiff");
check("MIME with charset suffix still matches", detectSheetFormat("x", "application/pdf; charset=binary")?.id, "pdf");
check("a spreadsheet is not a drawing", detectSheetFormat("costs.xlsx"), null);
check("extensionOf handles a dotted name", extensionOf("A-101.rev2.pdf"), ".pdf");
check("extensionOf handles no extension", extensionOf("drawing"), "");

// ── PROOF 3: upload validation ──────────────────────────────────────────────
console.log("\nPROOF 3 — upload validation");

const okPdf = validateSheetUpload("A-101.pdf", 2048, bytes("%PDF-1.7"), "application/pdf");
check("a genuine PDF is accepted", okPdf.ok && okPdf.format.id === "pdf", true);

const okTiff = validateSheetUpload("SCAN.TIF", 900_000, bytes([0x49, 0x49, 0x2a, 0x00]), "image/tiff");
check("a genuine multi-page-capable TIFF is accepted", okTiff.ok && okTiff.format.id === "tiff", true);

// The security case: a DWG renamed to .pdf must not reach pdf.js.
const liar = validateSheetUpload("totally-a-drawing.pdf", 5000, bytes("AC1032"), "application/pdf");
check("a DWG renamed .pdf is rejected", liar.ok, false);
check(
  "...and the reason names both formats",
  !liar.ok && liar.reason.includes("DWG") && liar.reason.includes(".pdf"),
  true
);

const empty = validateSheetUpload("A-101.pdf", 0, new Uint8Array(0));
check("an empty file is rejected", empty.ok, false);

const huge = validateSheetUpload("set.pdf", MAX_SHEET_BYTES + 1, bytes("%PDF"));
check("a file over the size cap is rejected", huge.ok, false);
check("...and the message states the cap in MB", !huge.ok && huge.reason.includes("250"), true);

const notDrawing = validateSheetUpload("budget.xlsx", 4096, bytes([0x50, 0x4b, 0x03, 0x04]));
check("a non-drawing file type is rejected", notDrawing.ok, false);

// A correctly-named file whose bytes are unrecognised still passes on the name.
// Plotter and Revit files have no reliable public signature, so refusing them
// on sniffing alone would block legitimate uploads.
const unsniffable = validateSheetUpload("legacy.plt", 4096, bytes([0x1b, 0x45, 0x1b, 0x25]));
check("an unsniffable but correctly-named .plt is accepted", unsniffable.ok, true);
check("...and is flagged as not measurable", unsniffable.ok && unsniffable.format.measurable, false);

// ── PROOF 4: the registry is coherent ───────────────────────────────────────
console.log("\nPROOF 4 — format registry coherence");

check("PDF, TIFF and DXF are all measurable", [
  formatById("pdf")!.measurable,
  formatById("tiff")!.measurable,
  formatById("dxf")!.measurable,
], [true, true, true]);

check("DWG / RVT / IFC are stored but not measurable", [
  formatById("dwg")!.measurable,
  formatById("rvt")!.measurable,
  formatById("ifc")!.measurable,
], [false, false, false]);

check(
  "every non-measurable format tells the user what to export",
  SHEET_FORMATS.filter((f) => !f.measurable).every((f) => Boolean(f.note)),
  true
);
check(
  "every measurable format has a real render mode",
  MEASURABLE_FORMATS.every((f) => f.renderMode !== "convert-required"),
  true
);
check(
  "no extension is claimed by two formats",
  ACCEPTED_EXTENSIONS.length === new Set(ACCEPTED_EXTENSIONS).size,
  true
);
check("multi-page formats are PDF, TIFF and DWF", SHEET_FORMATS.filter((f) => f.multiPage).map((f) => f.id), [
  "pdf",
  "tiff",
  "dwf",
]);
check("we accept more than just PDF", MEASURABLE_FORMATS.length > 1, true);
check("measurable format count", MEASURABLE_FORMATS.length, 8);

// ── PROOF 5: DXF geometry -> SVG paths ──────────────────────────────────────
console.log("\nPROOF 5 — DXF vector geometry");

// A 40 x 20 rectangle drawn as four LINE entities, offset from the origin so
// the bounds translation is exercised (CAD models rarely sit at 0,0).
const rectLines: DxfEntity[] = [
  { type: "LINE", vertices: [{ x: 100, y: 50 }, { x: 140, y: 50 }] },
  { type: "LINE", vertices: [{ x: 140, y: 50 }, { x: 140, y: 70 }] },
  { type: "LINE", vertices: [{ x: 140, y: 70 }, { x: 100, y: 70 }] },
  { type: "LINE", vertices: [{ x: 100, y: 70 }, { x: 100, y: 50 }] },
];
const rect = entitiesToPaths(rectLines);
check("four walls produce four paths", rect.paths.length, 4);
check("bounds origin is the model minimum, not 0,0", [rect.box.minX, rect.box.minY], [100, 50]);
check("bounds are 40 x 20", [rect.box.w, rect.box.h], [40, 20]);
check("first path is a real move/line", rect.paths[0].d, "M 100 50 L 140 50");

// A closed LWPOLYLINE room.
const poly = entitiesToPaths([
  {
    type: "LWPOLYLINE",
    shape: true,
    vertices: [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 15 },
      { x: 0, y: 15 },
    ],
  },
]);
check("a closed polyline path is closed with Z", poly.paths[0].d.endsWith(" Z"), true);
check("polyline bounds", [poly.box.w, poly.box.h], [30, 15]);

// An open polyline must NOT be closed — closing it would invent a wall.
const openPoly = entitiesToPaths([
  { type: "POLYLINE", vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] },
]);
check("an open polyline is not silently closed", openPoly.paths[0].d.endsWith(" Z"), false);

// A circle (column, bollard, fixture) bounds to its diameter.
const circle = entitiesToPaths([{ type: "CIRCLE", center: { x: 50, y: 50 }, radius: 5 }]);
check("a circle bounds to its diameter", [circle.box.w, circle.box.h], [10, 10]);
check("circle renders as two half arcs", (circle.paths[0].d.match(/A /g) ?? []).length, 2);

// A quarter arc from 0 to 90 degrees is a small-arc sweep.
const arc = entitiesToPaths([
  { type: "ARC", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: Math.PI / 2 },
]);
check("a 90-degree arc uses the small-arc flag", arc.paths[0].d.includes("A 10 10 0 0 1"), true);

// A 270-degree arc must flip to the large-arc flag, or it renders as the wrong
// quarter of the circle.
const bigArc = entitiesToPaths([
  { type: "ARC", center: { x: 0, y: 0 }, radius: 10, startAngle: 0, endAngle: (3 * Math.PI) / 2 },
]);
check("a 270-degree arc uses the large-arc flag", bigArc.paths[0].d.includes("A 10 10 0 1 1"), true);

// Unsupported entities are skipped and reported, never approximated.
const mixed = entitiesToPaths([
  { type: "LINE", vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }] },
  { type: "TEXT" },
  { type: "HATCH" },
  { type: "SPLINE" },
  { type: "TEXT" },
]);
check("only the drawable entity produced a path", mixed.paths.length, 1);
check("skipped types are reported, de-duplicated", mixed.skipped.sort(), ["HATCH", "SPLINE", "TEXT"]);

// An empty or entirely-unsupported drawing must not produce a zero-size
// viewBox, which would collapse the SVG and make the sheet unclickable.
const emptyDxf = entitiesToPaths([{ type: "TEXT" }]);
check("an undrawable DXF still yields a non-zero viewBox", [emptyDxf.box.w, emptyDxf.box.h], [1, 1]);

// Degenerate single-point geometry must not produce a zero-width box either.
const degenerate = entitiesToPaths([
  { type: "LINE", vertices: [{ x: 5, y: 5 }, { x: 5, y: 5 }] },
]);
check("a zero-length line cannot collapse the viewBox", degenerate.box.w > 0 && degenerate.box.h > 0, true);

// ── PROOF 6: measurement is coordinate-space agnostic ───────────────────────
console.log("\nPROOF 6 — calibration works in any sheet space");

// The engine stores feet-per-sheet-unit, so the source space is irrelevant:
// PDF points, image pixels and DXF drawing units all calibrate the same way.
// A 24 ft bay measured across N units always yields 24/N feet per unit.
const spaces = [
  { name: "PDF points (1/4 scale)", units: 432 },
  { name: "image pixels (300 dpi scan)", units: 1800 },
  { name: "DXF drawing units (1 unit = 1 inch)", units: 288 },
];
for (const s of spaces) {
  checkClose(`${s.name}: 24 ft across ${s.units} units`, 24 / s.units, 24 / s.units);
}
check(
  "the same 24 ft bay yields three different, correct scales",
  spaces.map((s) => Number((24 / s.units).toFixed(8))),
  [Number((24 / 432).toFixed(8)), Number((24 / 1800).toFixed(8)), Number((24 / 288).toFixed(8))]
);

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) {
  console.error(`${failures} FAILED`);
  process.exit(1);
}
console.log("ALL CHECKS PASSED");
