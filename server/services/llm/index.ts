// Provider selection. Anthropic is the default — Herbie is built on
// Claude. If you need to swap (e.g. the user explicitly configured
// another provider), set LLM_PROVIDER in the environment and wire a
// new implementation here.

import { AnthropicProvider } from "./anthropic";
import type { LLMProvider } from "./types";

let cached: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cached) return cached;
  const preference = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  switch (preference) {
    case "anthropic":
    default:
      cached = new AnthropicProvider();
      return cached;
  }
}

/** Test-only helper: reset the cached provider. */
export function __resetLLMProvider(): void {
  cached = null;
}

export type { LLMProvider, LLMCallInput, LLMResponse, LLMToolSpec, LLMMessage, LLMContentBlock, LLMToolCall } from "./types";
