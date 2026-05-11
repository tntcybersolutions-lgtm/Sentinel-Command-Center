// Phase 1 Batch 10: AI vision counter — the actual takeoff differentiator.
//
// Procore Sheets and Bluebeam both ship a manual "click each item to add
// to the count" workflow. Sentinel uses Claude vision to pre-populate
// the count: send a cropped region of a drawing + a target item type
// (doors, parking spaces, light fixtures, electrical outlets, sprinkler
// heads, plumbing fixtures), and Claude returns { count, confidence,
// notes } so the estimator just verifies instead of hand-counting.
//
// Anthropic's vision is well-suited for this — it handles construction
// drawings reliably and gives confidence + reasoning in structured JSON.
//
// Behavior contract (follows the rest of the codebase):
//   - When ANTHROPIC_API_KEY is absent we return a deterministic
//     fallback so dev/demo doesn't break.
//   - On parse / API failure we return source="fallback" with the
//     reason so the UI can warn the user.
//   - The function never throws on transient failures — only on
//     genuine programmer error (no input, etc).

import Anthropic from "@anthropic-ai/sdk";

export const VISION_TARGET_TYPES = [
  "doors",
  "windows",
  "parking_spaces",
  "light_fixtures",
  "electrical_outlets",
  "data_outlets",
  "fire_sprinklers",
  "plumbing_fixtures",
  "hvac_diffusers",
  "smoke_detectors",
  "exit_signs",
  "structural_columns",
  "trees",
  "other",
] as const;

export type VisionTargetType = (typeof VISION_TARGET_TYPES)[number];

export interface VisionCountInput {
  imageBase64: string;
  /** "image/png", "image/jpeg", etc. */
  mimeType: string;
  targetType: VisionTargetType;
  /** Optional plain-English hint, e.g. "Only count single-leaf doors, not double". */
  hint?: string;
}

export interface VisionCountResult {
  count: number;
  /** 0..1 — Claude's self-rating. */
  confidence: number;
  source: "llm" | "fallback";
  notes: string;
  /** Raw model name (or "stub" / "fallback"). */
  model: string;
}

const SYSTEM_PROMPT = `You are Herbie's takeoff vision specialist. You look at construction drawing images (typically architectural floor plans, electrical/MEP plans, site plans) and count the number of a specific item type visible in the image.

Reply with strict JSON, no code fences, no prose:
{
  "count": <integer ≥ 0>,
  "confidence": <number 0..1>,
  "notes": "<one short sentence — what you saw / any ambiguity>"
}

Rules:
- count MUST be an integer ≥ 0. If you can't see clearly, return 0 with low confidence and explain in notes.
- Don't double-count items that span tile boundaries.
- Distinguish symbol legends from instances on the plan — only count instances, not legend examples.
- For "doors" count door swings/openings. For "parking_spaces" count striped stalls (do not count drive aisles). For "light_fixtures" count fixture symbols on the lighting plan, not callouts in tables.
- If the user supplied a hint, follow it.`;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

/** Test-only — clears the memoized client between mocks. */
export function __resetVisionClient(): void {
  cachedClient = null;
}

export interface VisionCounter {
  count(input: VisionCountInput): Promise<VisionCountResult>;
}

export const realVisionCounter: VisionCounter = {
  async count(input: VisionCountInput): Promise<VisionCountResult> {
    if (!input.imageBase64 || input.imageBase64.length === 0) {
      throw new Error("imageBase64 is required");
    }
    if (!VISION_TARGET_TYPES.includes(input.targetType)) {
      throw new Error(`Unknown targetType: ${input.targetType}`);
    }

    const client = getClient();
    if (!client) {
      return {
        count: 0,
        confidence: 0,
        source: "fallback",
        notes: "no_api_key — set ANTHROPIC_API_KEY for real counts",
        model: "stub",
      };
    }

    const userText = [
      `Count the ${labelFor(input.targetType)} visible in this drawing region.`,
      input.hint ? `Hint: ${input.hint}` : "",
    ].filter(Boolean).join("\n");

    try {
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: normalizeMimeType(input.mimeType) as
                    | "image/jpeg"
                    | "image/png"
                    | "image/gif"
                    | "image/webp",
                  data: input.imageBase64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      const parsed = parseVisionJson(text);
      if (!parsed) {
        return {
          count: 0,
          confidence: 0,
          source: "fallback",
          notes: "json_parse_failed",
          model: response.model,
        };
      }
      return {
        count: clampNonNegInt(parsed.count),
        confidence: clamp01(parsed.confidence),
        source: "llm",
        notes: typeof parsed.notes === "string" ? parsed.notes.trim() : "",
        model: response.model,
      };
    } catch (err: any) {
      return {
        count: 0,
        confidence: 0,
        source: "fallback",
        notes: `llm_error: ${err?.message || String(err)}`,
        model: "fallback",
      };
    }
  },
};

// ─── helpers (exported for tests) ────────────────────────────────────────────

export function parseVisionJson(text: string): { count?: unknown; confidence?: unknown; notes?: unknown } | null {
  // Tolerate fenced JSON or leading prose.
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const m = stripped.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

export function clampNonNegInt(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function labelFor(target: VisionTargetType): string {
  switch (target) {
    case "doors": return "doors (door swings / openings on the plan)";
    case "windows": return "windows";
    case "parking_spaces": return "striped parking stalls";
    case "light_fixtures": return "lighting fixture symbols";
    case "electrical_outlets": return "electrical receptacles / outlets";
    case "data_outlets": return "data / network outlets";
    case "fire_sprinklers": return "sprinkler heads";
    case "plumbing_fixtures": return "plumbing fixtures (toilets, sinks, urinals, drinking fountains)";
    case "hvac_diffusers": return "HVAC supply / return diffusers and registers";
    case "smoke_detectors": return "smoke detectors";
    case "exit_signs": return "exit signs";
    case "structural_columns": return "structural columns";
    case "trees": return "trees / landscape symbols";
    case "other": return "items of the requested type";
  }
}

function normalizeMimeType(m: string): string {
  if (!m) return "image/png";
  const lower = m.toLowerCase();
  if (lower === "image/jpg") return "image/jpeg";
  return lower;
}
