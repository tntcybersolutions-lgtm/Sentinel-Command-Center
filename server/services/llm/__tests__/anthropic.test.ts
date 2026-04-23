import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { AnthropicProvider, resolveAnthropicModel } from "../anthropic";

// Tests for the Anthropic provider's pure functions + stub mode.
// Network-backed tests would need an ANTHROPIC_API_KEY and real API
// responses — those belong in integration tests. Here we verify
// behavior when no key is configured (stub mode), which is how CI
// runs.

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "";
});

afterAll(() => {
  if (ORIGINAL_KEY !== undefined) {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
});

describe("resolveAnthropicModel", () => {
  it("maps orchestration tier to claude-opus-4-7", () => {
    expect(resolveAnthropicModel({ tier: "orchestration" })).toBe(
      "claude-opus-4-7",
    );
  });

  it("maps extraction tier to claude-haiku-4-5", () => {
    expect(resolveAnthropicModel({ tier: "extraction" })).toBe(
      "claude-haiku-4-5",
    );
  });

  it("maps cheap tier to claude-haiku-4-5", () => {
    expect(resolveAnthropicModel({ tier: "cheap" })).toBe("claude-haiku-4-5");
  });

  it("defaults to orchestration when no tier is given", () => {
    expect(resolveAnthropicModel({})).toBe("claude-opus-4-7");
  });

  it("an explicit model wins over the tier mapping", () => {
    expect(
      resolveAnthropicModel({ tier: "extraction", model: "claude-opus-4-7" }),
    ).toBe("claude-opus-4-7");
  });
});

describe("AnthropicProvider — stub mode (no API key)", () => {
  // Each test gets a fresh instance so the cached client inside the
  // provider is regenerated after we clear ANTHROPIC_API_KEY.
  it("reports stub=true when ANTHROPIC_API_KEY is absent", () => {
    const provider = new AnthropicProvider();
    expect(provider.stub).toBe(true);
  });

  it("chat() returns a deterministic stub echoing the last user message", async () => {
    const provider = new AnthropicProvider();
    const res = await provider.chat({
      system: "You are a test.",
      messages: [{ role: "user", content: "Hello from the test." }],
    });
    expect(res.text).toContain("stub");
    expect(res.text).toContain("Hello from the test.");
    expect(res.stopReason).toBe("end_turn");
    expect(res.toolCalls).toHaveLength(0);
    expect(res.model).toBe("stub");
    expect(res.usage.inputTokens).toBe(0);
  });

  it("chat() handles array-content (text + tool_result) in the last user message", async () => {
    const provider = new AnthropicProvider();
    const res = await provider.chat({
      system: "system",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Check the COI." },
            { type: "text", text: "Also the submittal status." },
          ],
        },
      ],
    });
    expect(res.text).toContain("Check the COI.");
    expect(res.text).toContain("Also the submittal status.");
  });

  it("extractJson() returns data: undefined when in stub mode", async () => {
    const provider = new AnthropicProvider();
    const r = await provider.extractJson<any>({
      system: "Parse this",
      userPrompt: "Clear day, crew of 6.",
    });
    // Stub responses aren't JSON, so safeJsonParse should return undefined.
    expect(r.data).toBeUndefined();
    expect(r.raw).toContain("stub");
  });
});
