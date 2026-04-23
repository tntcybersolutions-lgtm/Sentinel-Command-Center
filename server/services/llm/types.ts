// LLM provider abstraction. Keeps model-vendor specifics out of service
// code so call sites stay portable across Anthropic / OpenAI / future
// providers without a surface rewrite.

export interface LLMMessage {
  role: "user" | "assistant";
  content: string | Array<LLMContentBlock>;
}

export type LLMContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LLMToolSpec {
  name: string;
  description: string;
  // JSON-schema object (same shape OpenAI's `parameters` and Anthropic's
  // `input_schema` both accept).
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LLMCallInput {
  system: string | Array<{ type: "text"; text: string; cacheable?: boolean }>;
  messages: LLMMessage[];
  tools?: LLMToolSpec[];
  maxTokens?: number;
  /** Semantic tier — the provider maps to a concrete model. */
  tier?: "orchestration" | "extraction" | "cheap";
  /** Override tier → model mapping with a specific model id. */
  model?: string;
  /** If true, enable adaptive thinking (Anthropic Opus tier only). */
  thinking?: boolean;
  /** Effort level — mapped by the provider; ignored if unsupported. */
  effort?: "low" | "medium" | "high";
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  toolCalls: LLMToolCall[];
  stopReason:
    | "end_turn"
    | "tool_use"
    | "max_tokens"
    | "refusal"
    | "unknown";
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Tokens read from the prompt cache, if any. */
    cacheReadTokens: number;
    /** Tokens written to the prompt cache on this request. */
    cacheCreationTokens: number;
  };
  /** Name of the provider-side model that served this request. */
  model: string;
}

export interface LLMProvider {
  /** Single-turn chat. Caller is responsible for the tool-result loop. */
  chat(input: LLMCallInput): Promise<LLMResponse>;

  /**
   * Extract structured JSON from a prompt. Providers should steer the
   * model toward a single JSON response object — Anthropic via
   * `response_format` via `output_config` or a prefixed user message;
   * OpenAI via `response_format: {type: "json_object"}`.
   */
  extractJson<T = unknown>(input: {
    system: string;
    userPrompt: string;
    tier?: LLMCallInput["tier"];
    model?: string;
    maxTokens?: number;
  }): Promise<{ data: T | undefined; raw: string; usage: LLMResponse["usage"] }>;

  /** Provider label for logging/audit. */
  readonly name: string;
  /** True when the provider is in stub mode (no API key). */
  readonly stub: boolean;
}
