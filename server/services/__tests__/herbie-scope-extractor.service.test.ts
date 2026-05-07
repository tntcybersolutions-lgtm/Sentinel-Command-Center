import { describe, it, expect, vi } from "vitest";
import {
  extractSolicitationScope,
  normalizeExtraction,
  buildUserPrompt,
  renderScopeExtractionMarkdown,
  type ScopeExtractionInput,
} from "../herbie-scope-extractor.service";
import type { LLMProvider, LLMResponse } from "../llm/types";

function input(overrides: Partial<ScopeExtractionInput> = {}): ScopeExtractionInput {
  return {
    title: "VA Hospital Renovation",
    solicitationNumber: "36C25024Q9999",
    agency: "Department of Veterans Affairs",
    setAside: "SDVOSB",
    contractValue: 4_200_000,
    naics: ["236220"],
    solicitationText: "PWS: General contractor services for renovation of clinical wing including demolition, MEP, and finishes.",
    ...overrides,
  };
}

function mockProvider(opts: {
  stub?: boolean;
  extractJsonImpl?: LLMProvider["extractJson"];
  throwOnExtract?: Error;
}): LLMProvider {
  const usage: LLMResponse["usage"] = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  return {
    name: "mock",
    stub: opts.stub ?? false,
    chat: vi.fn(),
    extractJson: opts.throwOnExtract
      ? vi.fn(async () => {
          throw opts.throwOnExtract;
        })
      : (opts.extractJsonImpl || (vi.fn(async () => ({
          data: undefined,
          raw: "",
          usage,
        })) as any)),
  };
}

describe("buildUserPrompt", () => {
  it("includes core project metadata", () => {
    const out = buildUserPrompt(input());
    expect(out).toContain("VA Hospital Renovation");
    expect(out).toContain("Solicitation: 36C25024Q9999");
    expect(out).toContain("Set-aside: SDVOSB");
    expect(out).toContain("NAICS: 236220");
    expect(out).toContain("# Solicitation text");
  });

  it("emits a placeholder when solicitation text is empty", () => {
    const out = buildUserPrompt(input({ solicitationText: "" }));
    expect(out).toContain("(no solicitation text supplied");
  });
});

describe("normalizeExtraction", () => {
  it("clamps confidence and trims strings", () => {
    const r = normalizeExtraction({
      summary: "  hello  ",
      scopeItems: [{ category: " A ", description: " B " }],
      riskFlags: [{ severity: "HIGH", flag: " F ", rationale: " R " }],
      complianceItems: [{ requirement: " X ", source: " Y " }],
      confidence: 1.7,
      notes: " n ",
    } as any, "llm");
    expect(r.summary).toBe("hello");
    expect(r.scopeItems).toEqual([{ category: "A", description: "B" }]);
    expect(r.riskFlags).toEqual([{ severity: "high", flag: "F", rationale: "R" }]);
    expect(r.complianceItems).toEqual([{ requirement: "X", source: "Y" }]);
    expect(r.confidence).toBe(1);
  });

  it("filters out malformed entries", () => {
    const r = normalizeExtraction({
      scopeItems: [{ category: "OK", description: "good" }, { category: 1 }, "junk"],
      riskFlags: [{ severity: "purple", flag: "x", rationale: "x" }, { severity: "low", flag: "ok", rationale: "ok" }],
      complianceItems: [{ requirement: "OK" }, null],
      confidence: -2,
    } as any, "llm");
    expect(r.scopeItems).toEqual([{ category: "OK", description: "good" }]);
    expect(r.riskFlags).toEqual([{ severity: "low", flag: "ok", rationale: "ok" }]);
    expect(r.complianceItems).toEqual([]);
    expect(r.confidence).toBe(0);
  });

  it("truncates risk-flag rationales to 280 chars", () => {
    const longRationale = "a".repeat(500);
    const r = normalizeExtraction({
      riskFlags: [{ severity: "medium", flag: "F", rationale: longRationale }],
    } as any, "llm");
    expect(r.riskFlags[0].rationale.length).toBe(280);
  });
});

describe("extractSolicitationScope", () => {
  it("returns deterministic fallback when provider is in stub mode", async () => {
    const provider = mockProvider({ stub: true });
    const result = await extractSolicitationScope(input(), provider);
    expect(result.source).toBe("fallback");
    expect(result.confidence).toBe(0);
    expect(result.notes).toContain("no_api_key");
    expect(result.scopeItems.length).toBeGreaterThan(0);
    expect(result.riskFlags.some((f) => f.flag === "MISSING_LLM_EXTRACTION")).toBe(true);
    expect(result.riskFlags.some((f) => f.flag === "SET_ASIDE")).toBe(true);
    expect(provider.extractJson).not.toHaveBeenCalled();
  });

  it("falls back when provider returns unparseable JSON", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: undefined,
        raw: "I'm sorry, Dave",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const result = await extractSolicitationScope(input(), provider);
    expect(result.source).toBe("fallback");
    expect(result.notes).toContain("json_parse_failed");
  });

  it("falls back when provider throws", async () => {
    const provider = mockProvider({ throwOnExtract: new Error("rate limited") });
    const result = await extractSolicitationScope(input(), provider);
    expect(result.source).toBe("fallback");
    expect(result.notes).toContain("rate limited");
  });

  it("happy path: returns normalized LLM data when JSON parses", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: {
          summary: "Renovation of VA clinical wing.",
          scopeItems: [
            { category: "Demolition", description: "Selective demo of existing wing." },
            { category: "Mechanical", description: "Replace AHUs and supply ductwork." },
          ],
          riskFlags: [
            { severity: "high", flag: "DAVIS_BACON", rationale: "Federal construction contract — Davis-Bacon wages apply." },
          ],
          complianceItems: [
            { requirement: "EMR < 1.0 required", source: "Section L" },
          ],
          confidence: 0.82,
          notes: "Extraction looked clean.",
        },
        raw: "...",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const result = await extractSolicitationScope(input(), provider);
    expect(result.source).toBe("llm");
    expect(result.summary).toBe("Renovation of VA clinical wing.");
    expect(result.scopeItems).toHaveLength(2);
    expect(result.riskFlags[0].flag).toBe("DAVIS_BACON");
    expect(result.confidence).toBeCloseTo(0.82);
  });
});

describe("renderScopeExtractionMarkdown", () => {
  it("renders a complete markdown doc with all sections", () => {
    const md = renderScopeExtractionMarkdown(input(), {
      summary: "S",
      scopeItems: [{ category: "Demo", description: "demo all" }],
      riskFlags: [{ severity: "high", flag: "F", rationale: "R" }],
      complianceItems: [{ requirement: "Comp", source: "Src" }],
      confidence: 0.5,
      notes: "fine",
      source: "llm",
    });
    expect(md).toContain("# Scope Extract & Risk Flags");
    expect(md).toContain("**Source:** Herbie (Claude)");
    expect(md).toContain("Confidence:** 50%");
    expect(md).toContain("## Scope Items (1)");
    expect(md).toContain("- **Demo** — demo all");
    expect(md).toContain("[HIGH] **F** — R");
    expect(md).toContain("- Comp _(source: Src)_");
    expect(md).toContain("## Notes");
  });

  it("renders empty-state placeholders for empty arrays", () => {
    const md = renderScopeExtractionMarkdown(input(), {
      summary: "",
      scopeItems: [],
      riskFlags: [],
      complianceItems: [],
      confidence: 0,
      notes: "",
      source: "fallback",
    });
    expect(md).toContain("_None extracted._");
    expect(md).toContain("_None identified._");
    expect(md).toContain("**Source:** Deterministic fallback");
    expect(md).not.toContain("## Notes");
  });
});
