import { describe, it, expect } from "vitest";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Live integration test — makes one real Anthropic API call with
 * claude-haiku-4-5.  Skipped automatically when ANTHROPIC_API_KEY is
 * not set so CI without the key still passes.
 *
 * Run manually:
 *   ANTHROPIC_API_KEY=sk-ant-... npm run test:integration
 */
describe("live", () => {
  const hasKey = !!process.env.ANTHROPIC_API_KEY;

  it.skipIf(!hasKey)(
    "claude-haiku-4-5 responds with non-empty usage",
    async () => {
      const client = new Anthropic();

      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 64,
        messages: [{ role: "user", content: "Say hi." }],
      });

      expect(response.model).toContain("haiku");
      expect(response.usage.input_tokens).toBeGreaterThan(0);
      expect(response.usage.output_tokens).toBeGreaterThan(0);
    },
    15_000,
  );
});
