import { describe, it, expect, vi } from "vitest";
import {
  categorizeByRules,
  categorizeTakeoffItem,
  suggestTakeoffItems,
  buildSuggestionPrompt,
  normalizeSuggestedItems,
  TAKEOFF_TRADES,
} from "../takeoff-assistant.service";
import type { LLMProvider, LLMResponse } from "../llm/types";

function mockProvider(opts: {
  stub?: boolean;
  extractJsonImpl?: LLMProvider["extractJson"];
  throwOnExtract?: Error;
}): LLMProvider {
  const usage: LLMResponse["usage"] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
  return {
    name: "mock",
    stub: opts.stub ?? false,
    chat: vi.fn(),
    extractJson: opts.throwOnExtract
      ? vi.fn(async () => {
          throw opts.throwOnExtract;
        })
      : (opts.extractJsonImpl || (vi.fn(async () => ({ data: undefined, raw: "", usage })) as any)),
  };
}

describe("categorizeByRules", () => {
  it("matches concrete keywords", () => {
    expect(categorizeByRules({ name: "4 inch slab on grade with #4 rebar" })?.trade).toBe("concrete");
    expect(categorizeByRules({ name: "Spread footing F-12" })?.trade).toBe("concrete");
  });

  it("matches MEP trades", () => {
    expect(categorizeByRules({ name: "Branch conduit and wire" })?.trade).toBe("electrical");
    expect(categorizeByRules({ name: "Sanitary main piping" })?.trade).toBe("plumbing");
    expect(categorizeByRules({ name: "Supply duct trunk to AHU-1" })?.trade).toBe("hvac");
    expect(categorizeByRules({ name: "Sprinkler heads in corridor" })?.trade).toBe("fire_protection");
  });

  it("returns null for empty input", () => {
    expect(categorizeByRules({ name: "" })).toBeNull();
    expect(categorizeByRules({ name: "  " })).toBeNull();
  });

  it("returns null for unmatched gibberish", () => {
    expect(categorizeByRules({ name: "xyzzy plugh" })).toBeNull();
  });

  it("flags rule-source confidence at 0.85", () => {
    const r = categorizeByRules({ name: "concrete slab" });
    expect(r?.source).toBe("rule");
    expect(r?.confidence).toBe(0.85);
  });
});

describe("categorizeTakeoffItem", () => {
  it("uses rule match without consulting the LLM", async () => {
    const provider = mockProvider({});
    const r = await categorizeTakeoffItem({ name: "Drywall on metal studs" }, provider);
    expect(r.trade).toBe("drywall");
    expect(r.source).toBe("rule");
    expect(provider.extractJson).not.toHaveBeenCalled();
  });

  it("returns 'other' fallback when in stub mode and no rule matched", async () => {
    const provider = mockProvider({ stub: true });
    const r = await categorizeTakeoffItem({ name: "ambiguous mystery item" }, provider);
    expect(r.trade).toBe("other");
    expect(r.source).toBe("fallback");
    expect(r.reasoning).toContain("no_api_key");
  });

  it("uses LLM when no rule matches and provider is live", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: { trade: "lv", confidence: 0.7, reasoning: "Cabling" },
        raw: "...",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const r = await categorizeTakeoffItem({ name: "something something cabling" }, provider);
    expect(r.trade).toBe("lv");
    expect(r.source).toBe("llm");
    expect(r.confidence).toBeCloseTo(0.7);
  });

  it("falls back when LLM returns an unknown trade label", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: { trade: "magic", confidence: 0.9, reasoning: "x" },
        raw: "x",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const r = await categorizeTakeoffItem({ name: "ambiguous item" }, provider);
    expect(r.trade).toBe("other");
    expect(r.source).toBe("llm");
  });

  it("falls back when LLM throws", async () => {
    const provider = mockProvider({ throwOnExtract: new Error("rate limited") });
    const r = await categorizeTakeoffItem({ name: "ambiguous item" }, provider);
    expect(r.trade).toBe("other");
    expect(r.source).toBe("fallback");
    expect(r.reasoning).toContain("rate limited");
  });
});

describe("buildSuggestionPrompt", () => {
  it("includes project, scope, and dedup list", () => {
    const out = buildSuggestionPrompt({
      projectTitle: "Wing C Reno",
      scopeText: "Demo, MEP, finishes per A-100.",
      existingItemNames: ["Mobilization", "Concrete slab on grade"],
      maxItems: 5,
    });
    expect(out).toContain("Project: Wing C Reno");
    expect(out).toContain("Suggest 5 likely takeoff");
    expect(out).toContain("Existing items (do NOT duplicate):");
    expect(out).toContain("- Mobilization");
    expect(out).toContain("Demo, MEP, finishes per A-100.");
  });

  it("emits placeholder when scope text is empty", () => {
    const out = buildSuggestionPrompt({ projectTitle: "X", scopeText: "" });
    expect(out).toContain("(no scope text supplied)");
  });
});

describe("normalizeSuggestedItems", () => {
  it("filters out malformed items and clamps unknown trades to 'other'", () => {
    const items = normalizeSuggestedItems([
      { name: "Slab", description: "4in slab", trade: "concrete", unit: "sf", estimatedQuantity: 1200 },
      { name: 1, description: "bad" }, // dropped: name not string
      { name: "Mystery", description: "weird", trade: "magic", unit: "" }, // trade→other, unit→EA
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Slab", trade: "concrete", unit: "SF", estimatedQuantity: 1200 });
    expect(items[1]).toMatchObject({ name: "Mystery", trade: "other", unit: "EA" });
  });

  it("handles non-array input", () => {
    expect(normalizeSuggestedItems(null)).toEqual([]);
    expect(normalizeSuggestedItems("not an array")).toEqual([]);
  });

  it("ignores negative quantities", () => {
    const items = normalizeSuggestedItems([
      { name: "X", description: "Y", trade: "other", unit: "EA", estimatedQuantity: -5 },
    ]);
    expect(items[0].estimatedQuantity).toBeUndefined();
  });
});

describe("suggestTakeoffItems", () => {
  it("returns generic fallback in stub mode", async () => {
    const provider = mockProvider({ stub: true });
    const r = await suggestTakeoffItems(
      { projectTitle: "Test", scopeText: "Build a thing" },
      provider,
    );
    expect(r.source).toBe("fallback");
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.notes).toContain("Stub mode");
    expect(provider.extractJson).not.toHaveBeenCalled();
  });

  it("dedups fallback items against existingItemNames", async () => {
    const provider = mockProvider({ stub: true });
    const r = await suggestTakeoffItems(
      { projectTitle: "T", scopeText: "S", existingItemNames: ["Mobilization", "Drywall"] },
      provider,
    );
    expect(r.items.find((i) => i.name === "Mobilization")).toBeUndefined();
    expect(r.items.find((i) => i.name === "Drywall")).toBeUndefined();
  });

  it("returns LLM items on happy path", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: {
          items: [
            { name: "Slab on grade", description: "4in", trade: "concrete", unit: "SF", estimatedQuantity: 5400 },
            { name: "Steel framing", description: "W-shapes", trade: "structural", unit: "TON" },
          ],
        },
        raw: "...",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const r = await suggestTakeoffItems(
      { projectTitle: "P", scopeText: "Concrete and steel" },
      provider,
    );
    expect(r.source).toBe("llm");
    expect(r.items).toHaveLength(2);
    expect(r.items[0].trade).toBe("concrete");
  });

  it("falls back to generic items when the LLM returns an empty list", async () => {
    const provider = mockProvider({
      extractJsonImpl: vi.fn(async () => ({
        data: { items: [] },
        raw: "{}",
        usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      })),
    });
    const r = await suggestTakeoffItems(
      { projectTitle: "P", scopeText: "S" },
      provider,
    );
    expect(r.source).toBe("fallback");
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.notes).toBe("llm_returned_no_items");
  });

  it("falls back when LLM throws", async () => {
    const provider = mockProvider({ throwOnExtract: new Error("oops") });
    const r = await suggestTakeoffItems(
      { projectTitle: "P", scopeText: "S" },
      provider,
    );
    expect(r.source).toBe("fallback");
    expect(r.notes).toContain("oops");
  });
});

describe("trade vocabulary", () => {
  it("exposes a known set of trades", () => {
    expect(TAKEOFF_TRADES).toContain("concrete");
    expect(TAKEOFF_TRADES).toContain("electrical");
    expect(TAKEOFF_TRADES).toContain("other");
  });
});
