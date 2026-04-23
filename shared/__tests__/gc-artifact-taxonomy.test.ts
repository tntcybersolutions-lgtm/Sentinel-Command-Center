import { describe, it, expect } from "vitest";
import {
  GC_ARTIFACT_CATEGORIES,
  GC_ARTIFACT_LABELS,
  GC_ARTIFACT_DESCRIPTIONS,
  GC_ARTIFACT_CLASSIFY_THRESHOLD,
  isGcArtifactCategory,
  type GcArtifactCategory,
} from "../gc-artifact-taxonomy";

describe("gc-artifact-taxonomy", () => {
  it("has a label and description for every canonical category", () => {
    for (const cat of GC_ARTIFACT_CATEGORIES) {
      expect(GC_ARTIFACT_LABELS[cat]).toBeTruthy();
      expect(GC_ARTIFACT_DESCRIPTIONS[cat]).toBeTruthy();
    }
    expect(Object.keys(GC_ARTIFACT_LABELS)).toHaveLength(GC_ARTIFACT_CATEGORIES.length);
    expect(Object.keys(GC_ARTIFACT_DESCRIPTIONS)).toHaveLength(GC_ARTIFACT_CATEGORIES.length);
  });

  it("isGcArtifactCategory accepts members and rejects outsiders", () => {
    expect(isGcArtifactCategory("coi")).toBe(true);
    expect(isGcArtifactCategory("submittal")).toBe(true);
    expect(isGcArtifactCategory("BID_FORMS")).toBe(false); // bid-jacket taxonomy, not GC
    expect(isGcArtifactCategory("")).toBe(false);
    expect(isGcArtifactCategory("random")).toBe(false);
  });

  it("confidence threshold matches HERBIE.md (0.7)", () => {
    expect(GC_ARTIFACT_CLASSIFY_THRESHOLD).toBe(0.7);
  });

  it("category keys are stable and ordered", () => {
    // Callers index into this array for UI ordering; lock it in.
    expect(GC_ARTIFACT_CATEGORIES).toEqual([
      "plans",
      "specs",
      "coi",
      "contract",
      "change_order",
      "submittal",
      "rfi",
      "daily_log",
      "photos",
      "invoice",
      "misc",
    ]);
  });

  it("GcArtifactCategory type narrows correctly", () => {
    const input: string = "rfi";
    if (isGcArtifactCategory(input)) {
      const narrowed: GcArtifactCategory = input;
      expect(GC_ARTIFACT_LABELS[narrowed]).toBe("RFI");
    } else {
      throw new Error("type guard failed");
    }
  });
});
