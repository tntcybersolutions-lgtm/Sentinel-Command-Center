import { describe, it, expect } from "vitest";
import { evaluateChecklistArtifactGate } from "../checklist-gate.service";

describe("evaluateChecklistArtifactGate", () => {
  it("does not block when no artifacts are required", () => {
    expect(evaluateChecklistArtifactGate({ requiredArtifactCodes: [], bidArtifacts: [] })).toEqual({
      blocked: false,
      missingCodes: [],
    });
  });

  it("does not block when all required artifacts are ready", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["SAM_SOLICITATION", "PRICING_SHEET"],
      bidArtifacts: [
        { templateCode: "SAM_SOLICITATION", status: "ready" },
        { templateCode: "PRICING_SHEET", status: "approved" },
      ],
    });
    expect(result.blocked).toBe(false);
    expect(result.missingCodes).toEqual([]);
  });

  it("blocks when a required artifact is still missing", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["SAM_SOLICITATION", "PRICING_SHEET"],
      bidArtifacts: [{ templateCode: "SAM_SOLICITATION", status: "ready" }],
    });
    expect(result).toEqual({ blocked: true, missingCodes: ["PRICING_SHEET"] });
  });

  it("blocks when a required artifact exists but is in a non-ready status", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["SAM_SOLICITATION"],
      bidArtifacts: [{ templateCode: "SAM_SOLICITATION", status: "needs_review" }],
    });
    expect(result).toEqual({ blocked: true, missingCodes: ["SAM_SOLICITATION"] });
  });

  it("returns the union of missing codes when several are unsatisfied", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["A", "B", "C"],
      bidArtifacts: [{ templateCode: "B", status: "approved" }],
    });
    expect(result.blocked).toBe(true);
    expect(result.missingCodes).toEqual(["A", "C"]);
  });

  it("treats non-array requiredArtifactCodes as no requirement", () => {
    expect(
      evaluateChecklistArtifactGate({ requiredArtifactCodes: null, bidArtifacts: [] }),
    ).toEqual({ blocked: false, missingCodes: [] });
    expect(
      evaluateChecklistArtifactGate({ requiredArtifactCodes: "PRICING", bidArtifacts: [] }),
    ).toEqual({ blocked: false, missingCodes: [] });
  });

  it("ignores blank or non-string entries in requiredArtifactCodes", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["", "  ", 0, null, "OK"],
      bidArtifacts: [{ templateCode: "OK", status: "ready" }],
    });
    expect(result).toEqual({ blocked: false, missingCodes: [] });
  });

  it("ignores artifact rows with null templateCode or status", () => {
    const result = evaluateChecklistArtifactGate({
      requiredArtifactCodes: ["A"],
      bidArtifacts: [
        { templateCode: null, status: "ready" },
        { templateCode: "A", status: null },
      ],
    });
    expect(result).toEqual({ blocked: true, missingCodes: ["A"] });
  });
});
