// Anthropic provider. Uses the official @anthropic-ai/sdk and maps the
// LLMProvider interface onto Messages API calls.
//
// Key design choices (informed by the claude-api skill):
//   • Default model: claude-opus-4-7 (most capable for Herbie
//     orchestration). Tier "extraction" maps to claude-haiku-4-5 for
//     cheap structured-output work. Tier "cheap" is an explicit alias.
//   • Adaptive thinking (`thinking: {type: "adaptive"}`) is enabled
//     when `thinking: true` is set on the call input. Opus 4.7 requires
//     adaptive — the old `budget_tokens` form 400s.
//   • Prompt caching: when `system` is passed as an array with
//     `cacheable: true`, we set `cache_control: {type: "ephemeral"}` on
//     that block. HERBIE.md is the textbook cache candidate — stable,
//     rendered first, dominated by input tokens on every call.
//   • Opus 4.7 rejects `temperature`/`top_p`/`top_k` — we never send
//     them. Steering is prompt-only.
//   • Stub mode: if ANTHROPIC_API_KEY is absent, all calls return a
//     deterministic stub so dev works without keys and tests don't
//     need network.

import Anthropic from "@anthropic-ai/sdk";
import type {
  LLMProvider,
  LLMCallInput,
  LLMResponse,
  LLMToolSpec,
  LLMMessage,
} from "./types";

const DEFAULT_MAX_TOKENS = 8_192;

// Tier → model mapping. Edit here, not at call sites.
const TIER_MODEL: Record<
  NonNullable<LLMCallInput["tier"]>,
  string
> = {
  orchestration: "claude-opus-4-7",
  extraction: "claude-haiku-4-5",
  cheap: "claude-haiku-4-5",
};

export function resolveAnthropicModel(
  input: Pick<LLMCallInput, "model" | "tier">,
): string {
  if (input.model) return input.model;
  const tier = input.tier ?? "orchestration";
  return TIER_MODEL[tier];
}

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  get stub(): boolean {
    return getClient() === null;
  }

  async chat(input: LLMCallInput): Promise<LLMResponse> {
    const client = getClient();
    if (!client) return stubResponse(input);

    const model = resolveAnthropicModel(input);
    const system = toAnthropicSystem(input.system);
    const tools = input.tools ? input.tools.map(toAnthropicTool) : undefined;
    const messages = input.messages.map(toAnthropicMessage);

    // Opus 4.7 rejects sampling params; omit them. Adaptive thinking is
    // the only thinking mode Opus 4.7 accepts.
    const req: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
      system,
      messages,
      ...(tools ? { tools } : {}),
      ...(input.thinking ? { thinking: { type: "adaptive" as const } } : {}),
    };

    try {
      const response = await client.messages.create(req);
      return fromAnthropicResponse(response);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) {
        console.error("[llm/anthropic] rate limit:", err.message);
      } else if (err instanceof Anthropic.APIError) {
        console.error(
          `[llm/anthropic] API error ${err.status}:`,
          err.message,
        );
      }
      throw err;
    }
  }

  async extractJson<T = unknown>(input: {
    system: string;
    userPrompt: string;
    tier?: LLMCallInput["tier"];
    model?: string;
    maxTokens?: number;
  }): Promise<{
    data: T | undefined;
    raw: string;
    usage: LLMResponse["usage"];
  }> {
    const systemBlock =
      input.system +
      "\n\nRespond with a single JSON object and nothing else. No code fences, no prose.";
    const res = await this.chat({
      system: systemBlock,
      messages: [{ role: "user", content: input.userPrompt }],
      tier: input.tier ?? "extraction",
      model: input.model,
      maxTokens: input.maxTokens ?? 2_048,
    });
    const raw = res.text.trim();
    const data = safeJsonParse<T>(raw);
    return { data, raw, usage: res.usage };
  }
}

function stubResponse(input: LLMCallInput): LLMResponse {
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user");
  const userText = typeof lastUser?.content === "string"
    ? lastUser.content
    : Array.isArray(lastUser?.content)
      ? lastUser!.content
          .filter((b): b is { type: "text"; text: string } => b.type === "text")
          .map((b) => b.text)
          .join("\n")
      : "";
  return {
    text: `[stub — ANTHROPIC_API_KEY not set. Would have answered: ${userText.slice(0, 120)}${userText.length > 120 ? "…" : ""}]`,
    toolCalls: [],
    stopReason: "end_turn",
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    },
    model: "stub",
  };
}

// ── input translation ──────────────────────────────────────────────

type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

function toAnthropicSystem(
  sys: LLMCallInput["system"],
): string | AnthropicSystemBlock[] {
  if (typeof sys === "string") return sys;
  return sys.map((b) => ({
    type: "text" as const,
    text: b.text,
    ...(b.cacheable ? { cache_control: { type: "ephemeral" as const } } : {}),
  }));
}

function toAnthropicTool(spec: LLMToolSpec): Anthropic.Tool {
  return {
    name: spec.name,
    description: spec.description,
    input_schema: spec.parameters as Anthropic.Tool.InputSchema,
  };
}

function toAnthropicMessage(m: LLMMessage): Anthropic.MessageParam {
  if (typeof m.content === "string") {
    return { role: m.role, content: m.content };
  }
  const blocks: Anthropic.ContentBlockParam[] = m.content.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "tool_use") {
      return { type: "tool_use", id: b.id, name: b.name, input: b.input };
    }
    // tool_result — only valid from user role per Anthropic's schema.
    return {
      type: "tool_result",
      tool_use_id: b.tool_use_id,
      content: b.content,
      ...(b.is_error ? { is_error: true } : {}),
    };
  });
  return { role: m.role, content: blocks };
}

// ── response translation ───────────────────────────────────────────

function fromAnthropicResponse(r: Anthropic.Message): LLMResponse {
  const texts: string[] = [];
  const toolCalls: LLMResponse["toolCalls"] = [];
  for (const block of r.content) {
    if (block.type === "text") texts.push(block.text);
    else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      });
    }
    // thinking / other block types: ignored for LLMResponse shape.
  }
  return {
    text: texts.join("\n").trim(),
    toolCalls,
    stopReason: mapStopReason(r.stop_reason),
    usage: {
      inputTokens: r.usage.input_tokens ?? 0,
      outputTokens: r.usage.output_tokens ?? 0,
      cacheReadTokens: (r.usage as any).cache_read_input_tokens ?? 0,
      cacheCreationTokens: (r.usage as any).cache_creation_input_tokens ?? 0,
    },
    model: r.model,
  };
}

function mapStopReason(
  reason: Anthropic.Message["stop_reason"],
): LLMResponse["stopReason"] {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "unknown";
  }
}

function safeJsonParse<T>(s: string): T | undefined {
  // Tolerate the LLM wrapping JSON in a fence or adding leading prose.
  const stripped = s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Try to find the first { … } balanced object.
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return undefined;
    }
  }
}
