// Phase 2 — vision-counter-v2: production-grade takeoff vision counter.
//
// Why a v2: the original vision-counter.service.ts handles a single image +
// single target type with one LLM call. That's fine for a quick check, but
// real takeoffs run across:
//   - multiple pages of a drawing set
//   - multiple item types per page
//   - calibrated scale (pixels-per-foot) that the model should be told about
//   - tile-overlap so we don't double-count items spanning crop boundaries
//   - low-confidence cases that need to be flagged to the estimator instead
//     of silently shipping bad numbers
//
// This module wraps the underlying single-image counter with:
//   1) Multi-pass — first quick scan, then verify with a tighter prompt
//   2) Scale-aware prompting — passes pixelsPerFoot so the model can reason
//      about typical sizes (e.g. parking stall ≈ 9'×18')
//   3) Per-page sweep with overlap-merge — splits a page into overlapping
//      tiles, counts each, then deduplicates the overlap region
//   4) Confidence aggregation — every result includes confidence per type
//      and a `warnings` array for any type below the configured threshold
//   5) Deterministic fallbacks — if the API key is missing or every pass
//      fails, we return source="fallback" with reasons so the UI can warn
//
// Behavior contract follows the rest of the codebase:
//   - Never throws on transient failures (parse errors, API errors)
//   - Throws ONLY on programmer errors (no input, unknown type, etc.)
//   - All shapes are JSON-serializable for storage in takeoff records

import {
  realVisionCounter,
  VISION_TARGET_TYPES,
  type VisionCounter,
  type VisionCountInput,
  type VisionCountResult,
  type VisionTargetType,
} from "./vision-counter.service";

export const LOW_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_VERIFY_THRESHOLD = 0.85;
export const MAX_TILES_PER_PAGE = 9; // 3×3 grid is the most we'll subdivide

// ─── Public types ────────────────────────────────────────────────────────────

export interface PageImage {
  /** 1-indexed page number from the source PDF / drawing set. */
  pageNumber: number;
  /** Base64-encoded image. */
  imageBase64: string;
  mimeType: string;
  /** Pixels per foot if the page has been calibrated; null otherwise. */
  pixelsPerFoot?: number | null;
  /** Optional human label e.g. "Floor 1 — Lighting Plan". */
  label?: string;
}

export interface MultiPassRequest {
  /** All pages we should sweep. */
  pages: PageImage[];
  /** Item types we want counts for. Empty = use a sensible default set. */
  targetTypes?: VisionTargetType[];
  /** Optional plain-English hint applied to every type. */
  hint?: string;
  /**
   * If true, every type gets a verification pass when first-pass
   * confidence is below `verifyThreshold`. Default true.
   */
  verifyLowConfidence?: boolean;
  verifyThreshold?: number;
  /**
   * Tile a page into a grid for very dense plans. 1 = no tiling.
   * Recommended values: 1 (default), 2 (2×2), 3 (3×3).
   */
  tileGrid?: 1 | 2 | 3;
  /** Overlap as a fraction of tile width (0..0.4). Default 0.15. */
  tileOverlap?: number;
  /** Override the underlying counter (test seam). */
  counter?: VisionCounter;
}

export interface PerTypeCount {
  type: VisionTargetType;
  count: number;
  /** 0..1 — aggregated confidence across all passes/pages. */
  confidence: number;
  /** Pages that contributed to this count. */
  pageNumbers: number[];
  /** Short notes pulled from underlying passes. */
  evidenceQuotes: string[];
  /** "llm" if at least one real pass succeeded; "fallback" otherwise. */
  source: "llm" | "fallback" | "mixed";
  /** True when confidence < LOW_CONFIDENCE_THRESHOLD. */
  needsReview: boolean;
}

export interface MultiPassResult {
  items: PerTypeCount[];
  warnings: string[];
  /** Summary of which pages were processed. */
  pagesProcessed: number[];
  /** True when EVERY page used a calibrated pixelsPerFoot value. */
  fullyCalibrated: boolean;
  /** Total LLM calls actually issued (useful for billing visibility). */
  llmCallCount: number;
}

// ─── Default target set ──────────────────────────────────────────────────────

export const DEFAULT_TARGET_SET: VisionTargetType[] = [
  "doors",
  "windows",
  "parking_spaces",
  "light_fixtures",
  "electrical_outlets",
  "fire_sprinklers",
  "plumbing_fixtures",
  "smoke_detectors",
  "exit_signs",
];

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Run a multi-pass, scale-aware sweep over a set of pages.
 *
 * The flow is:
 *   For each (page, type):
 *     1. First pass with a scale-aware hint
 *     2. If verify is on AND confidence < verifyThreshold, run a
 *        verification pass with a tighter prompt
 *     3. If tileGrid > 1, also count each tile and reconcile by taking
 *        the higher of (full-page count) vs (sum-of-tiles minus overlap)
 *
 *   Then aggregate across pages by summing counts and averaging confidence.
 *
 * Returns a structured result the UI can render directly.
 */
export async function runMultiPassSweep(
  req: MultiPassRequest,
): Promise<MultiPassResult> {
  if (!req.pages || req.pages.length === 0) {
    throw new Error("runMultiPassSweep: pages array is empty");
  }

  const counter = req.counter ?? realVisionCounter;
  const targetTypes = (req.targetTypes && req.targetTypes.length > 0
    ? req.targetTypes
    : DEFAULT_TARGET_SET
  ).filter((t) => VISION_TARGET_TYPES.includes(t));

  if (targetTypes.length === 0) {
    throw new Error("runMultiPassSweep: no valid target types provided");
  }

  const verifyOn = req.verifyLowConfidence ?? true;
  const verifyThreshold = clamp01(req.verifyThreshold ?? DEFAULT_VERIFY_THRESHOLD);
  const tileGrid: 1 | 2 | 3 =
    (req.tileGrid && [1, 2, 3].includes(req.tileGrid) ? req.tileGrid : 1) as 1 | 2 | 3;
  const tileOverlap = clamp(req.tileOverlap ?? 0.15, 0, 0.4);

  const warnings: string[] = [];
  let llmCallCount = 0;
  const fullyCalibrated = req.pages.every(
    (p) => typeof p.pixelsPerFoot === "number" && (p.pixelsPerFoot as number) > 0,
  );
  if (!fullyCalibrated) {
    warnings.push(
      "one_or_more_pages_uncalibrated — counts may be less accurate; calibrate scale on each page",
    );
  }

  // perType[type] = aggregator across pages
  const perType = new Map<
    VisionTargetType,
    {
      count: number;
      confidenceSum: number;
      confidenceN: number;
      pageNumbers: Set<number>;
      evidenceQuotes: string[];
      llmSeen: boolean;
      fallbackSeen: boolean;
    }
  >();
  for (const t of targetTypes) {
    perType.set(t, {
      count: 0,
      confidenceSum: 0,
      confidenceN: 0,
      pageNumbers: new Set<number>(),
      evidenceQuotes: [],
      llmSeen: false,
      fallbackSeen: false,
    });
  }

  for (const page of req.pages) {
    if (!page.imageBase64) {
      warnings.push(`page_${page.pageNumber}_missing_image — skipped`);
      continue;
    }
    for (const targetType of targetTypes) {
      // 1) First pass on the full page
      const firstPass = await countOnePassWithScale({
        counter,
        page,
        targetType,
        userHint: req.hint,
      });
      llmCallCount += 1;

      let bestCount = firstPass.count;
      let bestConfidence = firstPass.confidence;
      const passNotes: string[] = [];
      if (firstPass.notes) passNotes.push(firstPass.notes);
      let llmSeen = firstPass.source === "llm";
      let fallbackSeen = firstPass.source === "fallback";

      // 2) Verification pass when low confidence
      if (verifyOn && firstPass.source === "llm" && firstPass.confidence < verifyThreshold) {
        const verify = await countOnePassWithScale({
          counter,
          page,
          targetType,
          userHint: req.hint,
          verify: { firstPassCount: firstPass.count },
        });
        llmCallCount += 1;
        if (verify.notes) passNotes.push(`verify: ${verify.notes}`);
        if (verify.source === "llm") {
          llmSeen = true;
          // Reconcile: if both passes agree closely, average and keep
          // the higher confidence. If they disagree wildly, take the
          // lower count and warn.
          const diff = Math.abs(verify.count - firstPass.count);
          const tolerance = Math.max(1, Math.round(firstPass.count * 0.1));
          if (diff <= tolerance) {
            bestCount = Math.round((firstPass.count + verify.count) / 2);
            bestConfidence = Math.max(firstPass.confidence, verify.confidence);
          } else {
            bestCount = Math.min(firstPass.count, verify.count);
            bestConfidence = Math.min(firstPass.confidence, verify.confidence);
            warnings.push(
              `page_${page.pageNumber}_${targetType}_disagreement — first=${firstPass.count} verify=${verify.count}`,
            );
          }
        }
      }

      // 3) Tile sweep for very dense plans
      if (tileGrid > 1) {
        const tileSum = await sumTileCounts({
          counter,
          page,
          targetType,
          userHint: req.hint,
          tileGrid,
          tileOverlap,
        });
        llmCallCount += tileGrid * tileGrid;
        // Take the higher of full-page count vs tile sum; tile sum is
        // usually closer to reality on dense plans where the full-page
        // model misses items.
        if (tileSum.count > bestCount) {
          bestCount = tileSum.count;
          bestConfidence = Math.min(bestConfidence, tileSum.confidence);
          passNotes.push(`tiles: ${tileSum.count}`);
        }
        if (tileSum.source === "llm") llmSeen = true;
        if (tileSum.source === "fallback") fallbackSeen = true;
      }

      // Aggregate into perType
      const acc = perType.get(targetType)!;
      acc.count += bestCount;
      acc.confidenceSum += bestConfidence;
      acc.confidenceN += 1;
      acc.pageNumbers.add(page.pageNumber);
      for (const note of passNotes) {
        if (note && acc.evidenceQuotes.length < 6) acc.evidenceQuotes.push(note);
      }
      if (llmSeen) acc.llmSeen = true;
      if (fallbackSeen) acc.fallbackSeen = true;
    }
  }

  const items: PerTypeCount[] = [];
  for (const [type, acc] of perType.entries()) {
    const confidence = acc.confidenceN > 0 ? acc.confidenceSum / acc.confidenceN : 0;
    const source: PerTypeCount["source"] =
      acc.llmSeen && acc.fallbackSeen
        ? "mixed"
        : acc.llmSeen
          ? "llm"
          : "fallback";
    const needsReview = confidence < LOW_CONFIDENCE_THRESHOLD;
    items.push({
      type,
      count: acc.count,
      confidence: round3(confidence),
      pageNumbers: Array.from(acc.pageNumbers).sort((a, b) => a - b),
      evidenceQuotes: acc.evidenceQuotes,
      source,
      needsReview,
    });
    if (needsReview) {
      warnings.push(
        `${type}_low_confidence — count=${acc.count} confidence=${round3(confidence)}`,
      );
    }
    if (source === "fallback") {
      warnings.push(`${type}_no_llm — all passes fell back; count is unreliable`);
    }
  }

  return {
    items,
    warnings,
    pagesProcessed: req.pages.map((p) => p.pageNumber).sort((a, b) => a - b),
    fullyCalibrated,
    llmCallCount,
  };
}

// ─── Internal: a single scale-aware pass ─────────────────────────────────────

interface SinglePassArgs {
  counter: VisionCounter;
  page: PageImage;
  targetType: VisionTargetType;
  userHint?: string;
  verify?: { firstPassCount: number };
}

async function countOnePassWithScale(args: SinglePassArgs): Promise<VisionCountResult> {
  const hint = composeHint(args.page, args.targetType, args.userHint, args.verify);
  const input: VisionCountInput = {
    imageBase64: args.page.imageBase64,
    mimeType: args.page.mimeType,
    targetType: args.targetType,
    hint,
  };
  return args.counter.count(input);
}

/**
 * Compose the hint string. We embed:
 *   - calibration info if available
 *   - page label if available
 *   - user's own hint
 *   - verification framing when this is the second pass
 *
 * The underlying single-image counter already has a strong system prompt;
 * we only add the per-call hint so the model has page-specific context.
 */
export function composeHint(
  page: PageImage,
  targetType: VisionTargetType,
  userHint: string | undefined,
  verify: { firstPassCount: number } | undefined,
): string {
  const parts: string[] = [];
  if (page.label) parts.push(`Page label: ${page.label}.`);
  if (typeof page.pixelsPerFoot === "number" && page.pixelsPerFoot > 0) {
    parts.push(
      `Drawing scale: ${round3(page.pixelsPerFoot)} pixels per foot — use this when judging size of items like parking stalls (~9'×18') or doors (~3' wide).`,
    );
  } else {
    parts.push(
      `Drawing scale is not calibrated for this page — count by symbol pattern, do not assume sizes.`,
    );
  }
  // Type-specific tightening
  switch (targetType) {
    case "doors":
      parts.push(
        "Count distinct door swings/openings. Do not count cabinet doors or appliance doors. A double door = 2.",
      );
      break;
    case "parking_spaces":
      parts.push(
        "Count striped stalls only. Exclude drive aisles, ADA-loading-zones (count those separately if asked), and curb-cuts.",
      );
      break;
    case "light_fixtures":
      parts.push(
        "Count fixture symbols on the actual plan. Do NOT count rows in the legend / fixture schedule table.",
      );
      break;
    case "electrical_outlets":
      parts.push(
        "Count receptacles only — exclude switches, junction boxes, and data outlets. Duplex outlet = 1, quad = 1.",
      );
      break;
    case "fire_sprinklers":
      parts.push(
        "Count sprinkler heads — typically a small circle with a cross or asterisk. Do NOT count smoke detectors.",
      );
      break;
    case "plumbing_fixtures":
      parts.push(
        "Count toilets, sinks, urinals, drinking fountains, and mop sinks. Each fixture = 1.",
      );
      break;
    case "smoke_detectors":
      parts.push(
        "Count smoke detector symbols (typically a circle with 'SD' or similar). Do NOT count fire sprinklers.",
      );
      break;
    case "exit_signs":
      parts.push(
        "Count exit sign symbols. Do NOT count regular signage or address numbers.",
      );
      break;
    default:
      break;
  }
  if (userHint) parts.push(`User hint: ${userHint}`);
  if (verify) {
    parts.push(
      `This is a verification pass. The first pass returned ${verify.firstPassCount}. Look again carefully — confirm or correct.`,
    );
  }
  return parts.join(" ");
}

// ─── Internal: tile sweep ────────────────────────────────────────────────────

/**
 * Tiling is logical (we tell the counter to focus on a region) rather than
 * physically cropping the base64. The current single-image counter doesn't
 * accept region coordinates, so we emulate with hint text that scopes the
 * count to a quadrant. This is conservative: for true cropping we'd need
 * server-side image processing, which is out of scope for this PR.
 */
async function sumTileCounts(args: {
  counter: VisionCounter;
  page: PageImage;
  targetType: VisionTargetType;
  userHint?: string;
  tileGrid: 1 | 2 | 3;
  tileOverlap: number;
}): Promise<{ count: number; confidence: number; source: "llm" | "fallback" | "mixed" }> {
  const tiles: Array<{ row: number; col: number }> = [];
  for (let r = 0; r < args.tileGrid; r++) {
    for (let c = 0; c < args.tileGrid; c++) {
      tiles.push({ row: r, col: c });
    }
  }
  // Cap at MAX_TILES_PER_PAGE to keep cost predictable
  const capped = tiles.slice(0, MAX_TILES_PER_PAGE);

  let totalCount = 0;
  let confidenceSum = 0;
  let confidenceN = 0;
  let llmSeen = false;
  let fallbackSeen = false;

  for (const tile of capped) {
    const tileLabel = describeTileRegion(tile.row, tile.col, args.tileGrid);
    const result = await args.counter.count({
      imageBase64: args.page.imageBase64,
      mimeType: args.page.mimeType,
      targetType: args.targetType,
      hint: [
        `Region: ${tileLabel}.`,
        "Count ONLY items in this region; ignore the rest of the drawing.",
        args.userHint ?? "",
      ].filter(Boolean).join(" "),
    });
    totalCount += result.count;
    confidenceSum += result.confidence;
    confidenceN += 1;
    if (result.source === "llm") llmSeen = true;
    if (result.source === "fallback") fallbackSeen = true;
  }

  // Adjust for overlap: items in the overlap regions get counted in both
  // adjacent tiles, so we subtract a haircut proportional to overlap.
  const overlapHaircut = Math.round(totalCount * args.tileOverlap * 0.5);
  const adjusted = Math.max(0, totalCount - overlapHaircut);

  const avgConfidence = confidenceN > 0 ? confidenceSum / confidenceN : 0;
  const source: "llm" | "fallback" | "mixed" =
    llmSeen && fallbackSeen ? "mixed" : llmSeen ? "llm" : "fallback";
  return { count: adjusted, confidence: avgConfidence, source };
}

export function describeTileRegion(row: number, col: number, grid: 1 | 2 | 3): string {
  if (grid === 1) return "the entire drawing";
  const rowLabel =
    grid === 2
      ? row === 0
        ? "top"
        : "bottom"
      : row === 0
        ? "top"
        : row === 1
          ? "middle"
          : "bottom";
  const colLabel =
    grid === 2
      ? col === 0
        ? "left"
        : "right"
      : col === 0
        ? "left"
        : col === 1
          ? "center"
          : "right";
  return `${rowLabel}-${colLabel} portion of the drawing (approx ${row + 1} of ${grid} vertically, ${col + 1} of ${grid} horizontally)`;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// Re-export so consumers can grab everything from one module
export { VISION_TARGET_TYPES, type VisionCounter, type VisionTargetType };
