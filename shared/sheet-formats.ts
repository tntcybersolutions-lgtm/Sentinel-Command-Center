/**
 * Blueprint sheet formats.
 *
 * Real drawing sets are not all PDFs. Issued drawings are usually PDF, but
 * archived and as-built sheets are very often scanned multi-page TIFF, CAD
 * lives in DXF/DWG, BIM in RVT/IFC, and older plotter output in PLT. This is
 * the single source of truth for what the app accepts and how each format
 * reaches the measurement surface — shared by the client renderer and the
 * server upload validator so the two cannot drift apart.
 *
 * Honesty rule: a format is only marked measurable if the app can actually
 * render it to draw on. Formats we can store but not render say so plainly and
 * tell the user what to export instead. Accepting a DWG and then silently
 * failing to open it is worse than refusing it.
 */

/** How a sheet reaches the measurement surface. */
export type RenderMode =
  /** Rendered by pdf.js. Native coordinate space is PDF points (1/72"). */
  | "pdf"
  /** Rendered directly by the browser in an <img>. Space is image pixels. */
  | "image"
  /** Decoded to RGBA client-side (UTIF) and painted to a canvas. Multi-page. */
  | "tiff"
  /** Parsed to SVG (dxf-parser). Space is DXF drawing units. */
  | "dxf"
  /** Stored, but cannot be rendered for measurement without conversion. */
  | "convert-required";

export type SheetFormat = {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
  renderMode: RenderMode;
  /** True when the user can calibrate and draw on it. */
  measurable: boolean;
  /** True when the format can carry more than one sheet in one file. */
  multiPage: boolean;
  /** Shown in the UI. For non-measurable formats, says what to export. */
  note?: string;
};

export const SHEET_FORMATS: SheetFormat[] = [
  {
    id: "pdf",
    label: "PDF",
    extensions: [".pdf"],
    mimeTypes: ["application/pdf"],
    renderMode: "pdf",
    measurable: true,
    multiPage: true,
    note: "Issued drawing sets. Best fidelity for measurement.",
  },
  {
    id: "tiff",
    label: "TIFF",
    extensions: [".tif", ".tiff"],
    mimeTypes: ["image/tiff", "image/x-tiff"],
    renderMode: "tiff",
    measurable: true,
    multiPage: true,
    note: "Scanned and archived sheets. Multi-page TIFF is fully supported.",
  },
  {
    id: "png",
    label: "PNG",
    extensions: [".png"],
    mimeTypes: ["image/png"],
    renderMode: "image",
    measurable: true,
    multiPage: false,
  },
  {
    id: "jpeg",
    label: "JPEG",
    extensions: [".jpg", ".jpeg"],
    mimeTypes: ["image/jpeg"],
    renderMode: "image",
    measurable: true,
    multiPage: false,
    note: "Photos of drawings work, but scans measure more accurately.",
  },
  {
    id: "webp",
    label: "WebP",
    extensions: [".webp"],
    mimeTypes: ["image/webp"],
    renderMode: "image",
    measurable: true,
    multiPage: false,
  },
  {
    id: "bmp",
    label: "Bitmap",
    extensions: [".bmp"],
    mimeTypes: ["image/bmp", "image/x-ms-bmp"],
    renderMode: "image",
    measurable: true,
    multiPage: false,
  },
  {
    id: "gif",
    label: "GIF",
    extensions: [".gif"],
    mimeTypes: ["image/gif"],
    renderMode: "image",
    measurable: true,
    multiPage: false,
  },
  {
    id: "dxf",
    label: "DXF (CAD)",
    extensions: [".dxf"],
    mimeTypes: ["application/dxf", "image/vnd.dxf", "application/x-dxf"],
    renderMode: "dxf",
    measurable: true,
    multiPage: false,
    note: "Vector CAD. Measures against true drawing geometry.",
  },

  // ── Stored, but not measurable in-app ────────────────────────────────────
  {
    id: "dwg",
    label: "DWG (AutoCAD)",
    extensions: [".dwg"],
    mimeTypes: ["application/acad", "image/vnd.dwg", "application/x-dwg"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: false,
    note: "Stored for the record. To measure, export to DXF or plot to PDF from AutoCAD.",
  },
  {
    id: "rvt",
    label: "Revit",
    extensions: [".rvt", ".rfa"],
    mimeTypes: ["application/octet-stream"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: false,
    note: "Stored for the record. To measure, export sheets to PDF or DWG from Revit.",
  },
  {
    id: "ifc",
    label: "IFC (BIM)",
    extensions: [".ifc", ".ifcxml"],
    mimeTypes: ["application/x-step", "model/ifc"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: false,
    note: "Stored for the record. Quantities come from the model, not a sheet takeoff.",
  },
  {
    id: "dwf",
    label: "DWF",
    extensions: [".dwf", ".dwfx"],
    mimeTypes: ["model/vnd.dwf", "application/x-dwf"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: true,
    note: "Stored for the record. Export to PDF from Design Review to measure.",
  },
  {
    id: "plt",
    label: "Plotter (HPGL)",
    extensions: [".plt", ".hpgl", ".hgl"],
    mimeTypes: ["application/vnd.hp-hpgl"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: false,
    note: "Legacy plotter output. Convert to PDF to measure.",
  },
  {
    id: "skp",
    label: "SketchUp",
    extensions: [".skp"],
    mimeTypes: ["application/octet-stream"],
    renderMode: "convert-required",
    measurable: false,
    multiPage: false,
    note: "Stored for the record. Export a scene to PDF to measure.",
  },
];

/** 250 MB — a full multi-discipline set scanned at 400dpi runs large. */
export const MAX_SHEET_BYTES = 250 * 1024 * 1024;

export const ACCEPTED_EXTENSIONS: string[] = SHEET_FORMATS.flatMap((f) => f.extensions);

/** Value for an <input type="file" accept="..."> attribute. */
export const SHEET_ACCEPT_ATTRIBUTE: string = [
  ...ACCEPTED_EXTENSIONS,
  ...SHEET_FORMATS.flatMap((f) => f.mimeTypes),
].join(",");

export const MEASURABLE_FORMATS = SHEET_FORMATS.filter((f) => f.measurable);

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Look up a format by file name, falling back to MIME type. */
export function detectSheetFormat(filename: string, mimeType?: string): SheetFormat | null {
  const ext = extensionOf(filename);
  const byExt = SHEET_FORMATS.find((f) => f.extensions.includes(ext));
  if (byExt) return byExt;

  if (mimeType) {
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    const byMime = SHEET_FORMATS.find((f) => f.mimeTypes.includes(normalized));
    if (byMime) return byMime;
  }
  return null;
}

export function formatById(id: string): SheetFormat | null {
  return SHEET_FORMATS.find((f) => f.id === id) ?? null;
}

// ── Content sniffing ────────────────────────────────────────────────────────

/**
 * Identify a file from its leading bytes.
 *
 * The extension is a claim by the uploader, not a fact. Renaming a `.exe` to
 * `.pdf` must not get it treated as a drawing, and a correctly-named file whose
 * contents are something else must not reach a decoder that trusts its shape.
 * Returns null when the bytes match nothing known — the caller decides whether
 * to reject or fall back to the extension.
 */
export function sniffSheetFormat(bytes: Uint8Array): SheetFormat | null {
  const startsWith = (sig: number[], offset = 0): boolean =>
    sig.every((b, i) => bytes[offset + i] === b);

  const ascii = (s: string, offset = 0): boolean =>
    startsWith(
      Array.from({ length: s.length }, (_, i) => s.charCodeAt(i)),
      offset
    );

  if (bytes.length < 4) return null;

  // %PDF
  if (ascii("%PDF")) return formatById("pdf");

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return formatById("png");

  // JPEG: FF D8 FF
  if (startsWith([0xff, 0xd8, 0xff])) return formatById("jpeg");

  // GIF87a / GIF89a
  if (ascii("GIF87a") || ascii("GIF89a")) return formatById("gif");

  // RIFF....WEBP
  if (ascii("RIFF") && ascii("WEBP", 8)) return formatById("webp");

  // BMP
  if (ascii("BM")) return formatById("bmp");

  // TIFF: little-endian "II*\0" or big-endian "MM\0*"
  if (startsWith([0x49, 0x49, 0x2a, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2a])) {
    return formatById("tiff");
  }
  // BigTIFF
  if (startsWith([0x49, 0x49, 0x2b, 0x00]) || startsWith([0x4d, 0x4d, 0x00, 0x2b])) {
    return formatById("tiff");
  }

  // DWG: "AC" followed by a 4-digit version (AC1015 = R2000, AC1032 = R2018).
  if (ascii("AC10") || ascii("AC1.") || ascii("AC2.")) return formatById("dwg");

  // Binary DXF has an explicit sentinel; ASCII DXF is checked below.
  if (ascii("AutoCAD Binary DXF")) return formatById("dxf");

  // IFC is STEP text.
  if (ascii("ISO-10303-21")) return formatById("ifc");

  // Revit and other OLE compound files.
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return formatById("rvt");

  // DWF (classic) carries a version banner.
  if (ascii("(DWF V")) return formatById("dwf");

  // ASCII DXF: a text file whose first group code is 0 followed by SECTION.
  // Scan a bounded window so a large file is not decoded in full.
  const head = new TextDecoder("ascii", { fatal: false }).decode(
    bytes.subarray(0, Math.min(bytes.length, 2048))
  );
  if (/^\s*0\s*[\r\n]+\s*SECTION/i.test(head) || /\bENTITIES\b/.test(head) && /\bSECTION\b/.test(head)) {
    return formatById("dxf");
  }

  return null;
}

export type SheetValidation =
  | { ok: true; format: SheetFormat; sniffed: SheetFormat | null }
  | { ok: false; reason: string };

/**
 * Validate an upload by name, size and content.
 *
 * Rejects on a content/extension mismatch rather than trusting either one:
 * a file whose bytes say DWG but whose name says .pdf would otherwise be handed
 * to pdf.js, and a mismatch is a strong signal that something is wrong
 * regardless of intent.
 */
export function validateSheetUpload(
  filename: string,
  sizeBytes: number,
  bytes: Uint8Array,
  mimeType?: string
): SheetValidation {
  if (sizeBytes <= 0) {
    return { ok: false, reason: "File is empty." };
  }
  if (sizeBytes > MAX_SHEET_BYTES) {
    return {
      ok: false,
      reason: `File is ${(sizeBytes / 1024 / 1024).toFixed(0)} MB — the limit is ${MAX_SHEET_BYTES / 1024 / 1024} MB.`,
    };
  }

  const byName = detectSheetFormat(filename, mimeType);
  const sniffed = sniffSheetFormat(bytes);

  if (!byName && !sniffed) {
    return {
      ok: false,
      reason: `${extensionOf(filename) || "That file type"} is not a drawing format. Accepted: ${SHEET_FORMATS.map((f) => f.label).join(", ")}.`,
    };
  }

  // Content wins over the name, but a hard disagreement is rejected outright.
  if (byName && sniffed && byName.id !== sniffed.id) {
    return {
      ok: false,
      reason: `This file is named ${extensionOf(filename)} but its contents are ${sniffed.label}. Rename it correctly and re-upload.`,
    };
  }

  const format = sniffed ?? byName!;
  return { ok: true, format, sniffed };
}
