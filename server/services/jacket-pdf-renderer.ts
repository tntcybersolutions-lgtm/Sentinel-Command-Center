// Phase 2 v2 — real PDF rendering for jacket auto-fill.
//
// Uses pdf-lib (already in package.json) to produce proper PDFs for the
// takeoff summary and scope summary that get filed into the jacket.
//
// Why pdf-lib (vs pdfkit / puppeteer):
//   - Already a dependency (pdf-lib ^1.17.1 + @pdf-lib/fontkit ^1.1.1)
//   - No font bundling — uses built-in Standard14 fonts
//   - Works in Node and browser identically
//   - Lower-level API (manual layout) but adequate for our two doc types
//
// Both renderers handle multi-page overflow automatically — when the cursor
// approaches the bottom margin we add a new page.

import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb, RGB } from "pdf-lib";
import type {
  TakeoffSnapshot,
  ScopeExtractionSummary,
} from "./jacket-auto-fill.service.v2";

// ─── Layout constants (US Letter, 0.75" margins) ────────────────────────────

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const MARGIN_X = 54; // 0.75"
const MARGIN_Y_TOP = 54;
const MARGIN_Y_BOT = 54;
const CONTENT_WIDTH = LETTER_WIDTH - MARGIN_X * 2;

const COLOR_TEXT: RGB = rgb(0.1, 0.1, 0.12);
const COLOR_MUTED: RGB = rgb(0.42, 0.45, 0.5);
const COLOR_RULE: RGB = rgb(0.85, 0.86, 0.88);
const COLOR_HEADER_BG: RGB = rgb(0.94, 0.95, 0.97);

interface DocCtx {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  /** Current Y baseline for the next line (decreases as we write). */
  y: number;
}

async function newCtx(): Promise<DocCtx> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  return { doc, page, font, bold, y: LETTER_HEIGHT - MARGIN_Y_TOP };
}

function ensureSpace(ctx: DocCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_Y_BOT) {
    ctx.page = ctx.doc.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
    ctx.y = LETTER_HEIGHT - MARGIN_Y_TOP;
  }
}

function drawHeading(ctx: DocCtx, text: string, opts: { size?: number; spaceAfter?: number; color?: RGB } = {}): void {
  const size = opts.size ?? 16;
  ensureSpace(ctx, size + 6);
  ctx.page.drawText(text, {
    x: MARGIN_X,
    y: ctx.y - size,
    size,
    font: ctx.bold,
    color: opts.color ?? COLOR_TEXT,
  });
  ctx.y -= size + (opts.spaceAfter ?? 6);
}

function drawText(ctx: DocCtx, text: string, opts: { size?: number; bold?: boolean; color?: RGB; spaceAfter?: number; x?: number } = {}): void {
  const size = opts.size ?? 10;
  const lines = wrapText(text, opts.bold ? ctx.bold : ctx.font, size, CONTENT_WIDTH - ((opts.x ?? MARGIN_X) - MARGIN_X));
  for (const line of lines) {
    ensureSpace(ctx, size + 2);
    ctx.page.drawText(line, {
      x: opts.x ?? MARGIN_X,
      y: ctx.y - size,
      size,
      font: opts.bold ? ctx.bold : ctx.font,
      color: opts.color ?? COLOR_TEXT,
    });
    ctx.y -= size + 2;
  }
  ctx.y -= opts.spaceAfter ?? 0;
}

function drawRule(ctx: DocCtx, opts: { spaceAfter?: number } = {}): void {
  ensureSpace(ctx, 4);
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y - 1 },
    end: { x: LETTER_WIDTH - MARGIN_X, y: ctx.y - 1 },
    thickness: 0.5,
    color: COLOR_RULE,
  });
  ctx.y -= 1 + (opts.spaceAfter ?? 6);
}

function drawKeyValue(ctx: DocCtx, key: string, value: string): void {
  ensureSpace(ctx, 12);
  ctx.page.drawText(key, { x: MARGIN_X, y: ctx.y - 10, size: 10, font: ctx.bold, color: COLOR_MUTED });
  const keyWidth = ctx.bold.widthOfTextAtSize(key, 10);
  ctx.page.drawText(value, {
    x: MARGIN_X + keyWidth + 6,
    y: ctx.y - 10,
    size: 10,
    font: ctx.font,
    color: COLOR_TEXT,
  });
  ctx.y -= 14;
}

/** Word-wrap a single string at given font/size to fit `maxWidth` pixels. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(candidate, size);
    if (width <= maxWidth) {
      current = candidate;
    } else {
      if (current) out.push(current);
      // word longer than line width → break it character-wise
      if (font.widthOfTextAtSize(w, size) > maxWidth) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        if (chunk) current = chunk;
        else current = "";
      } else {
        current = w;
      }
    }
  }
  if (current) out.push(current);
  return out;
}

// ─── Table renderer ─────────────────────────────────────────────────────────

interface TableColumn {
  label: string;
  /** Column width as a fraction of CONTENT_WIDTH. Sum should be 1.0. */
  flex: number;
  align?: "left" | "right";
}

function drawTableHeader(ctx: DocCtx, columns: TableColumn[]): void {
  const rowHeight = 18;
  ensureSpace(ctx, rowHeight + 4);
  // Background bar
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - rowHeight,
    width: CONTENT_WIDTH,
    height: rowHeight,
    color: COLOR_HEADER_BG,
  });
  let cursorX = MARGIN_X + 4;
  for (const col of columns) {
    const w = CONTENT_WIDTH * col.flex - 8;
    const labelW = ctx.bold.widthOfTextAtSize(col.label, 9);
    const x = col.align === "right" ? cursorX + w - labelW : cursorX;
    ctx.page.drawText(col.label, { x, y: ctx.y - rowHeight + 5, size: 9, font: ctx.bold, color: COLOR_TEXT });
    cursorX += CONTENT_WIDTH * col.flex;
  }
  ctx.y -= rowHeight + 2;
}

function drawTableRow(ctx: DocCtx, columns: TableColumn[], cells: string[], opts: { rule?: boolean; rowHeight?: number } = {}): void {
  const rowH = opts.rowHeight ?? 14;
  ensureSpace(ctx, rowH + 2);
  let cursorX = MARGIN_X + 4;
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const cell = cells[i] ?? "";
    const w = CONTENT_WIDTH * col.flex - 8;
    const wrapped = wrapText(cell, ctx.font, 9, w);
    const display = wrapped[0] ?? "";
    const cellW = ctx.font.widthOfTextAtSize(display, 9);
    const x = col.align === "right" ? cursorX + w - cellW : cursorX;
    ctx.page.drawText(display, {
      x,
      y: ctx.y - rowH + 4,
      size: 9,
      font: ctx.font,
      color: COLOR_TEXT,
    });
    cursorX += CONTENT_WIDTH * col.flex;
  }
  if (opts.rule !== false) {
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y - rowH },
      end: { x: LETTER_WIDTH - MARGIN_X, y: ctx.y - rowH },
      thickness: 0.25,
      color: COLOR_RULE,
    });
  }
  ctx.y -= rowH;
}

function drawFooter(ctx: DocCtx, text: string): void {
  for (const page of ctx.doc.getPages()) {
    page.drawText(text, {
      x: MARGIN_X,
      y: 24,
      size: 8,
      font: ctx.font,
      color: COLOR_MUTED,
    });
  }
}

// ─── Public renderers ───────────────────────────────────────────────────────

export async function renderTakeoffPdf(snapshot: TakeoffSnapshot): Promise<Buffer> {
  const ctx = await newCtx();

  // Title
  drawHeading(ctx, "Takeoff Summary", { size: 22, spaceAfter: 4 });
  drawText(ctx, snapshot.projectName, { size: 12, color: COLOR_MUTED, spaceAfter: 8 });
  drawRule(ctx, { spaceAfter: 12 });

  // Project meta
  drawKeyValue(ctx, "Bid Project ID:", snapshot.bidProjectId);
  drawKeyValue(ctx, "Generated:", new Date().toISOString());
  drawKeyValue(ctx, "Last Update:", snapshot.updatedAt);
  drawKeyValue(ctx, "Line Items:", String(snapshot.itemCount));
  drawKeyValue(ctx, "Total Cost:", `$${snapshot.totalCost.toFixed(2)}`);
  ctx.y -= 8;
  drawRule(ctx, { spaceAfter: 12 });

  // Items table
  drawHeading(ctx, "Line Items", { size: 13, spaceAfter: 6 });
  const cols: TableColumn[] = [
    { label: "Division", flex: 0.16 },
    { label: "Description", flex: 0.42 },
    { label: "Qty", flex: 0.12, align: "right" },
    { label: "Unit", flex: 0.08 },
    { label: "Unit Cost", flex: 0.11, align: "right" },
    { label: "Extended", flex: 0.11, align: "right" },
  ];
  drawTableHeader(ctx, cols);
  if (snapshot.items.length === 0) {
    drawTableRow(ctx, cols, ["—", "(no line items)", "—", "—", "—", "—"]);
  } else {
    for (const item of snapshot.items) {
      drawTableRow(ctx, cols, [
        item.division,
        item.description,
        String(item.quantity),
        item.unit,
        `$${item.unitCost.toFixed(2)}`,
        `$${item.extendedCost.toFixed(2)}`,
      ]);
    }
  }
  ctx.y -= 6;

  // Totals row
  drawTableRow(ctx, cols,
    ["", "TOTAL", "", "", "", `$${snapshot.totalCost.toFixed(2)}`],
    { rule: false, rowHeight: 18 },
  );

  drawFooter(
    ctx,
    `Sentinel Command Center · auto-fill takeoff summary · idempotent: re-finalize replaces in place · ${new Date().toISOString()}`,
  );

  const bytes = await ctx.doc.save();
  return Buffer.from(bytes);
}

export async function renderScopePdf(scope: ScopeExtractionSummary): Promise<Buffer> {
  const ctx = await newCtx();

  drawHeading(ctx, "Scope Summary", { size: 22, spaceAfter: 4 });
  drawText(ctx, "Compliance and scope items extracted from the solicitation.", { size: 11, color: COLOR_MUTED, spaceAfter: 8 });
  drawRule(ctx, { spaceAfter: 12 });

  drawKeyValue(ctx, "Bid Project ID:", scope.bidProjectId);
  drawKeyValue(ctx, "Source Hash:", scope.sourceHash);
  drawKeyValue(ctx, "Generated:", new Date().toISOString());
  ctx.y -= 6;
  drawRule(ctx, { spaceAfter: 12 });

  const drawListSection = (heading: string, items: string[]) => {
    drawHeading(ctx, heading, { size: 13, spaceAfter: 4 });
    if (items.length === 0) {
      drawText(ctx, "(none)", { color: COLOR_MUTED, spaceAfter: 10 });
      return;
    }
    for (const item of items) {
      drawText(ctx, `• ${item}`, { x: MARGIN_X + 6, spaceAfter: 0 });
    }
    ctx.y -= 8;
  };

  drawListSection("Scope Items", scope.scopeItems);
  drawListSection("Divisions", scope.divisions);
  drawListSection("Exclusions", scope.exclusions);
  drawListSection("Assumptions", scope.assumptions);

  drawFooter(
    ctx,
    `Sentinel Command Center · auto-fill scope summary · idempotent: re-extract replaces in place · ${new Date().toISOString()}`,
  );

  const bytes = await ctx.doc.save();
  return Buffer.from(bytes);
}
