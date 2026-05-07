import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseVisionJson,
  clampNonNegInt,
  clamp01,
  labelFor,
  VISION_TARGET_TYPES,
  realVisionCounter,
  __resetVisionClient,
} from "../vision-counter.service";

describe("parseVisionJson", () => {
  it("parses bare JSON", () => {
    expect(parseVisionJson('{"count": 3, "confidence": 0.9}')).toEqual({
      count: 3,
      confidence: 0.9,
    });
  });

  it("strips a json code fence", () => {
    expect(parseVisionJson('```json\n{"count": 5}\n```')).toEqual({ count: 5 });
  });

  it("recovers JSON from leading prose", () => {
    expect(parseVisionJson('Sure! Here you go: {"count": 7}')).toEqual({ count: 7 });
  });

  it("returns null for unparseable text", () => {
    expect(parseVisionJson("totally broken")).toBeNull();
  });
});

describe("clampNonNegInt", () => {
  it("floors to non-negative integer", () => {
    expect(clampNonNegInt(3.9)).toBe(3);
    expect(clampNonNegInt(-2)).toBe(0);
    expect(clampNonNegInt("12.5")).toBe(12);
  });

  it("returns 0 for junk", () => {
    expect(clampNonNegInt(NaN)).toBe(0);
    expect(clampNonNegInt(undefined)).toBe(0);
    expect(clampNonNegInt("abc")).toBe(0);
  });
});

describe("clamp01", () => {
  it("clamps to 0..1", () => {
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-1)).toBe(0);
  });

  it("returns 0 for non-finite", () => {
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01("nope")).toBe(0);
  });
});

describe("labelFor", () => {
  it("returns a meaningful label for each target type", () => {
    for (const t of VISION_TARGET_TYPES) {
      const label = labelFor(t);
      expect(label.length).toBeGreaterThan(2);
      expect(label).not.toContain("undefined");
    }
  });
});

describe("realVisionCounter (stub mode)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    __resetVisionClient();
  });

  it("returns deterministic fallback when ANTHROPIC_API_KEY is absent", async () => {
    const r = await realVisionCounter.count({
      imageBase64: "dGVzdA==",
      mimeType: "image/png",
      targetType: "doors",
    });
    expect(r.source).toBe("fallback");
    expect(r.count).toBe(0);
    expect(r.confidence).toBe(0);
    expect(r.notes).toContain("no_api_key");
  });

  it("rejects empty imageBase64", async () => {
    await expect(
      realVisionCounter.count({
        imageBase64: "",
        mimeType: "image/png",
        targetType: "doors",
      }),
    ).rejects.toThrow(/imageBase64/);
  });

  it("rejects unknown targetType", async () => {
    await expect(
      realVisionCounter.count({
        imageBase64: "dGVzdA==",
        mimeType: "image/png",
        targetType: "spaceships" as any,
      }),
    ).rejects.toThrow(/Unknown targetType/);
  });
});

describe("VISION_TARGET_TYPES vocabulary", () => {
  it("covers the standard takeoff items", () => {
    expect(VISION_TARGET_TYPES).toContain("doors");
    expect(VISION_TARGET_TYPES).toContain("parking_spaces");
    expect(VISION_TARGET_TYPES).toContain("fire_sprinklers");
    expect(VISION_TARGET_TYPES).toContain("light_fixtures");
    expect(VISION_TARGET_TYPES.length).toBeGreaterThanOrEqual(12);
  });
});
