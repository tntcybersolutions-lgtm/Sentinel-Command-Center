// Tests for vision-counter-v2: the multi-pass, scale-aware takeoff counter.
//
// We don't hit the real Claude API in unit tests — we inject a stub
// counter via MultiPassRequest.counter so we can drive every branch.

import { describe, it, expect } from "vitest";
import {
  runMultiPassSweep,
  composeHint,
  describeTileRegion,
  clamp,
  clamp01,
  round3,
  LOW_CONFIDENCE_THRESHOLD,
  type PageImage,
  type MultiPassRequest,
} from "../vision-counter-v2.service";
import type { VisionCounter, VisionCountInput, VisionCountResult } from "../vision-counter.service";

// ─── Stub counter helpers ────────────────────────────────────────────────────

function stubCounter(
  responder: (input: VisionCountInput, callIndex: number) => VisionCountResult,
): { counter: VisionCounter; calls: VisionCountInput[] } {
  const calls: VisionCountInput[] = [];
  let i = 0;
  const counter: VisionCounter = {
    async count(input: VisionCountInput): Promise<VisionCountResult> {
      calls.push(input);
      const out = responder(input, i);
      i += 1;
      return out;
    },
  };
  return { counter, calls };
}

function pageOf(n: number, opts: Partial<PageImage> = {}): PageImage {
  return {
    pageNumber: n,
    imageBase64: "iVBORw0KGgo=", // tiny base64 — content doesn't matter for stubs
    mimeType: "image/png",
    pixelsPerFoot: 8,
    label: `Page ${n}`,
    ...opts,
  };
}

function llmResult(count: number, confidence: number, notes = ""): VisionCountResult {
  return { count, confidence, source: "llm", notes, model: "stub-haiku" };
}

function fallbackResult(notes = "no_api_key"): VisionCountResult {
  return { count: 0, confidence: 0, source: "fallback", notes, model: "stub" };
}

// ─── Input validation ───────────────────────────────────────────────────────

describe("runMultiPassSweep — input validation", () => {
  it("throws when pages array is empty", async () => {
    await expect(
      runMultiPassSweep({ pages: [], counter: stubCounter(() => llmResult(0, 1)).counter }),
    ).rejects.toThrow(/pages array is empty/);
  });

  it("throws when no valid target types provided", async () => {
    await expect(
      runMultiPassSweep({
        pages: [pageOf(1)],
        targetTypes: [],
        counter: stubCounter(() => llmResult(0, 1)).counter,
      }),
    ).rejects.toThrow(/no valid target types/);
  });

  it("filters out unknown target types", async () => {
    const { counter } = stubCounter(() => llmResult(3, 0.9));
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      // @ts-expect-error — runtime validation should drop "bogus"
      targetTypes: ["doors", "bogus"],
      counter,
    });
    expect(result.items.map((i) => i.type)).toEqual(["doors"]);
  });
});

// ─── Single-pass path (high confidence) ─────────────────────────────────────

describe("runMultiPassSweep — high confidence path", () => {
  it("does not run a verify pass when first-pass confidence ≥ verifyThreshold", async () => {
    const { counter, calls } = stubCounter(() => llmResult(7, 0.95, "clear plan"));
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: true,
      verifyThreshold: 0.85,
      counter,
    });
    expect(calls.length).toBe(1);
    expect(result.items[0].count).toBe(7);
    expect(result.items[0].confidence).toBe(0.95);
    expect(result.items[0].needsReview).toBe(false);
    expect(result.warnings).not.toContain(expect.stringContaining("doors_low_confidence"));
    expect(result.llmCallCount).toBe(1);
  });

  it("aggregates counts across multiple pages", async () => {
    const { counter } = stubCounter((_input, i) =>
      llmResult([4, 6, 2][i] ?? 0, 0.9),
    );
    const result = await runMultiPassSweep({
      pages: [pageOf(1), pageOf(2), pageOf(3)],
      targetTypes: ["doors"],
      counter,
    });
    expect(result.items[0].count).toBe(12);
    expect(result.items[0].pageNumbers).toEqual([1, 2, 3]);
  });
});

// ─── Verification pass ──────────────────────────────────────────────────────

describe("runMultiPassSweep — verification pass", () => {
  it("triggers a verify pass when first-pass confidence < verifyThreshold", async () => {
    const { counter, calls } = stubCounter((_input, i) =>
      i === 0 ? llmResult(5, 0.6, "uncertain") : llmResult(5, 0.9, "verified"),
    );
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: true,
      verifyThreshold: 0.85,
      counter,
    });
    expect(calls.length).toBe(2);
    expect(result.items[0].count).toBe(5); // both passes agreed
    expect(result.items[0].confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("on small disagreement averages the counts and uses higher confidence", async () => {
    const { counter } = stubCounter((_input, i) =>
      i === 0 ? llmResult(10, 0.6) : llmResult(11, 0.9),
    );
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      counter,
    });
    // (10 + 11) / 2 = 10.5 → rounds to 11
    expect(result.items[0].count).toBe(11);
    expect(result.items[0].confidence).toBe(0.9);
  });

  it("on large disagreement takes the LOWER count and warns", async () => {
    const { counter } = stubCounter((_input, i) =>
      i === 0 ? llmResult(20, 0.5) : llmResult(8, 0.6),
    );
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      counter,
    });
    expect(result.items[0].count).toBe(8);
    expect(
      result.warnings.some((w) => w.includes("disagreement")),
    ).toBe(true);
  });

  it("does not verify when verifyLowConfidence=false even if confidence is low", async () => {
    const { counter, calls } = stubCounter(() => llmResult(3, 0.3));
    await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      counter,
    });
    expect(calls.length).toBe(1);
  });
});

// ─── Confidence + warnings ──────────────────────────────────────────────────

describe("runMultiPassSweep — confidence aggregation", () => {
  it("flags needsReview when aggregated confidence < threshold", async () => {
    const { counter } = stubCounter(() => llmResult(2, LOW_CONFIDENCE_THRESHOLD - 0.1));
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      counter,
    });
    expect(result.items[0].needsReview).toBe(true);
    expect(
      result.warnings.some((w) => w.startsWith("doors_low_confidence")),
    ).toBe(true);
  });

  it("does NOT flag needsReview at the boundary", async () => {
    const { counter } = stubCounter(() => llmResult(2, LOW_CONFIDENCE_THRESHOLD));
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      counter,
    });
    expect(result.items[0].needsReview).toBe(false);
  });

  it("warns when at least one page is uncalibrated", async () => {
    const { counter } = stubCounter(() => llmResult(1, 1));
    const result = await runMultiPassSweep({
      pages: [
        pageOf(1, { pixelsPerFoot: 10 }),
        pageOf(2, { pixelsPerFoot: null }),
      ],
      targetTypes: ["doors"],
      counter,
    });
    expect(result.fullyCalibrated).toBe(false);
    expect(
      result.warnings.some((w) => w.includes("uncalibrated")),
    ).toBe(true);
  });

  it("reports fullyCalibrated=true when every page has pixelsPerFoot > 0", async () => {
    const { counter } = stubCounter(() => llmResult(1, 1));
    const result = await runMultiPassSweep({
      pages: [pageOf(1, { pixelsPerFoot: 8 }), pageOf(2, { pixelsPerFoot: 12 })],
      targetTypes: ["doors"],
      counter,
    });
    expect(result.fullyCalibrated).toBe(true);
  });
});

// ─── Fallback behavior ──────────────────────────────────────────────────────

describe("runMultiPassSweep — fallbacks", () => {
  it("when every pass falls back, source is 'fallback' and warning is emitted", async () => {
    const { counter } = stubCounter(() => fallbackResult("no_api_key"));
    const result = await runMultiPassSweep({
      pages: [pageOf(1), pageOf(2)],
      targetTypes: ["doors"],
      counter,
    });
    expect(result.items[0].source).toBe("fallback");
    expect(
      result.warnings.some((w) => w.includes("doors_no_llm")),
    ).toBe(true);
  });

  it("when SOME passes fall back and some succeed, source is 'mixed'", async () => {
    const { counter } = stubCounter((_input, i) =>
      i === 0 ? llmResult(5, 0.9) : fallbackResult(),
    );
    const result = await runMultiPassSweep({
      pages: [pageOf(1), pageOf(2)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      counter,
    });
    expect(result.items[0].source).toBe("mixed");
  });

  it("skips a page with missing imageBase64 and warns", async () => {
    const { counter, calls } = stubCounter(() => llmResult(3, 0.9));
    const result = await runMultiPassSweep({
      pages: [pageOf(1, { imageBase64: "" }), pageOf(2)],
      targetTypes: ["doors"],
      counter,
    });
    expect(calls.length).toBe(1);
    expect(result.items[0].count).toBe(3);
    expect(
      result.warnings.some((w) => w.includes("page_1_missing_image")),
    ).toBe(true);
  });
});

// ─── Tile sweep ─────────────────────────────────────────────────────────────

describe("runMultiPassSweep — tile sweep", () => {
  it("when tileGrid=2, takes the higher of full-page count vs tile sum", async () => {
    // First call = full page (low count), next 4 = 2x2 tiles (higher each)
    const { counter, calls } = stubCounter((_input, i) => {
      if (i === 0) return llmResult(5, 0.95); // full page; high confidence so no verify
      return llmResult(3, 0.9); // each tile
    });
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      tileGrid: 2,
      tileOverlap: 0,
      counter,
    });
    expect(calls.length).toBe(5); // 1 full + 4 tiles
    // tile sum = 12, full = 5 → take higher (12)
    expect(result.items[0].count).toBe(12);
  });

  it("tile haircut for overlap reduces double-count proportionally", async () => {
    const { counter } = stubCounter((_input, i) => {
      if (i === 0) return llmResult(0, 0.95);
      return llmResult(10, 0.9);
    });
    const result = await runMultiPassSweep({
      pages: [pageOf(1)],
      targetTypes: ["doors"],
      verifyLowConfidence: false,
      tileGrid: 2,
      tileOverlap: 0.2,
      counter,
    });
    // raw tile sum = 40; haircut = 40 * 0.2 * 0.5 = 4 → 36
    expect(result.items[0].count).toBe(36);
  });
});

// ─── composeHint ────────────────────────────────────────────────────────────

describe("composeHint", () => {
  it("includes scale info when calibrated", () => {
    const hint = composeHint(pageOf(1, { pixelsPerFoot: 12.34, label: "Floor 1" }), "doors", undefined, undefined);
    expect(hint).toContain("Drawing scale: 12.34 pixels per foot");
    expect(hint).toContain("Page label: Floor 1");
  });

  it("notes when scale is not calibrated", () => {
    const hint = composeHint(pageOf(1, { pixelsPerFoot: null }), "doors", undefined, undefined);
    expect(hint).toContain("not calibrated");
  });

  it("includes type-specific tightening for parking_spaces", () => {
    const hint = composeHint(pageOf(1), "parking_spaces", undefined, undefined);
    expect(hint.toLowerCase()).toContain("striped stalls");
  });

  it("includes verify framing when verify={...}", () => {
    const hint = composeHint(pageOf(1), "doors", undefined, { firstPassCount: 7 });
    expect(hint).toContain("verification pass");
    expect(hint).toContain("7");
  });

  it("includes user hint at the end", () => {
    const hint = composeHint(pageOf(1), "doors", "ignore garage doors", undefined);
    expect(hint).toContain("User hint: ignore garage doors");
  });
});

// ─── describeTileRegion ─────────────────────────────────────────────────────

describe("describeTileRegion", () => {
  it("for grid=1 returns 'entire drawing'", () => {
    expect(describeTileRegion(0, 0, 1)).toBe("the entire drawing");
  });

  it("for grid=2 returns top/bottom + left/right", () => {
    expect(describeTileRegion(0, 0, 2)).toContain("top-left");
    expect(describeTileRegion(0, 1, 2)).toContain("top-right");
    expect(describeTileRegion(1, 0, 2)).toContain("bottom-left");
    expect(describeTileRegion(1, 1, 2)).toContain("bottom-right");
  });

  it("for grid=3 includes middle/center labels", () => {
    expect(describeTileRegion(1, 1, 3)).toContain("middle-center");
    expect(describeTileRegion(0, 2, 3)).toContain("top-right");
    expect(describeTileRegion(2, 0, 3)).toContain("bottom-left");
  });
});

// ─── helper math ────────────────────────────────────────────────────────────

describe("math helpers", () => {
  it("clamp keeps within bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp(NaN, 0, 10)).toBe(0); // returns lo on NaN
  });

  it("clamp01 clamps to 0..1", () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(-0.1)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
  });

  it("round3 rounds to 3 decimal places", () => {
    expect(round3(0.123456)).toBe(0.123);
    expect(round3(0.1239)).toBe(0.124);
  });
});
