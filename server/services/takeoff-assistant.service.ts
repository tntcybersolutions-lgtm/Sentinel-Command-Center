// Phase 1 Batch 6: AI takeoff assistant.
//
// Two capabilities:
//   1. suggestTakeoffItems(scope) — given a solicitation / scope of work
//      blob, returns a list of suggested takeoff line items the
//      estimator can accept/edit. Uses Claude (extraction tier).
//   2. categorizeTakeoffItem(name, description) — given a freeform
//      takeoff item name + description, classifies it into a trade
//      (concrete, framing, drywall, electrical, ...). A small rule
//      layer handles the obvious cases without an LLM call; the LLM is
//      a fallback for ambiguous descriptions.
//
// Both calls degrade gracefully when the LLM provider is in stub mode.

import { getLLMProvider, type LLMProvider } from "./llm";

// ─── 2. Categorization ───────────────────────────────────────────────────────

export const TAKEOFF_TRADES = [
  "concrete",
  "framing",
  "drywall",
  "flooring",
  "roofing",
  "electrical",
  "plumbing",
  "hvac",
  "lv",
  "fire_protection",
  "sitework",
  "structural",
  "finishes",
  "other",
] as const;

export type TakeoffTrade = (typeof TAKEOFF_TRADES)[number];

// More-specific patterns first — "drywall on metal studs" should match
// drywall, not framing (which also matches "stud").
const RULE_KEYWORDS: Array<{ trade: TakeoffTrade; pattern: RegExp }> = [
  { trade: "drywall", pattern: /\b(drywall|gypsum|sheetrock|tape|mud|insulation)/i },
  { trade: "concrete", pattern: /\b(concrete|slab|footing|caisson|pier|grout|rebar|reinforc)/i },
  { trade: "framing", pattern: /\b(framing|stud|joist|rafter|truss|cmu|masonry|block|brick)/i },
  { trade: "flooring", pattern: /\b(carpet|tile|vinyl|vct|lvt|hardwood|terrazzo|polished\s+concrete\s+floor)/i },
  { trade: "roofing", pattern: /\b(roof|membrane|tpo|epdm|shingle|underlayment|gutter|downspout)/i },
  { trade: "electrical", pattern: /\b(electrical|conduit|wire|cable\s+tray|panel\s*board|breaker|outlet|receptacle|switchgear|transformer|fixture)/i },
  { trade: "plumbing", pattern: /\b(plumb|pipe|fixture|sink|toilet|urinal|water\s+closet|sanitary|water\s+main)/i },
  { trade: "hvac", pattern: /\b(hvac|duct|diffuser|grille|ahu|rtu|chiller|boiler|vav|register)/i },
  { trade: "lv", pattern: /\b(low\s*voltage|cat6|cat\s*6|ethernet|fiber|access\s+control|cctv|nvr|av|paging)/i },
  { trade: "fire_protection", pattern: /\b(sprinkler|fire\s+alarm|pull\s+station|smoke\s+detector|standpipe|fdc)/i },
  { trade: "sitework", pattern: /\b(sitework|earthwork|grading|excavat|paving|asphalt|striping|fence|landscap|curb|sidewalk)/i },
  { trade: "structural", pattern: /\b(structural\s+steel|wide\s+flange|w\s*\d|hss|girder|beam|column|deck)/i },
  { trade: "finishes", pattern: /\b(paint|finish|millwork|casework|cabinet|trim|baseboard|wallcovering|ceiling\s+grid|act)/i },
];

export interface CategorizationResult {
  trade: TakeoffTrade;
  confidence: number;
  source: "rule" | "llm" | "fallback";
  reasoning?: string;
}

export function categorizeByRules(input: { name: string; description?: string }): CategorizationResult | null {
  const haystack = `${input.name || ""} ${input.description || ""}`.trim();
  if (!haystack) return null;
  for (const { trade, pattern } of RULE_KEYWORDS) {
    if (pattern.test(haystack)) {
      return { trade, confidence: 0.85, source: "rule", reasoning: `matched /${pattern.source}/` };
    }
  }
  return null;
}

export async function categorizeTakeoffItem(
  input: { name: string; description?: string },
  providerOverride?: LLMProvider,
): Promise<CategorizationResult> {
  const ruleHit = categorizeByRules(input);
  if (ruleHit) return ruleHit;

  const provider = providerOverride ?? getLLMProvider();
  if (provider.stub) {
    return { trade: "other", confidence: 0, source: "fallback", reasoning: "no_api_key" };
  }

  const allowed = TAKEOFF_TRADES.join(", ");
  try {
    const result = await provider.extractJson<{ trade?: string; confidence?: number; reasoning?: string }>({
      system: `You classify construction takeoff line items into a trade. Reply with strict JSON:\n{"trade": "<one of: ${allowed}>", "confidence": 0..1, "reasoning": "short"}\nNo prose, no fences.`,
      userPrompt: `Item name: ${input.name}\nDescription: ${input.description ?? "(none)"}`,
      tier: "extraction",
      maxTokens: 200,
    });
    if (!result.data) {
      return { trade: "other", confidence: 0, source: "fallback", reasoning: "json_parse_failed" };
    }
    const trade = TAKEOFF_TRADES.includes((result.data.trade as TakeoffTrade) ?? "")
      ? (result.data.trade as TakeoffTrade)
      : "other";
    const confidence = clamp01(result.data.confidence);
    return {
      trade,
      confidence,
      source: "llm",
      reasoning: typeof result.data.reasoning === "string" ? result.data.reasoning : undefined,
    };
  } catch (err: any) {
    return { trade: "other", confidence: 0, source: "fallback", reasoning: `llm_error: ${err?.message || String(err)}` };
  }
}

// ─── 1. Suggestion ────────────────────────────────────────────────────────────

export interface SuggestionInput {
  projectTitle: string;
  scopeText: string;
  /** Existing line item names the assistant should not duplicate. */
  existingItemNames?: string[];
  /** Number of suggestions to ask for (LLM hint, not a hard cap). */
  maxItems?: number;
}

export interface SuggestedTakeoffItem {
  name: string;
  description: string;
  trade: TakeoffTrade;
  unit: string;
  estimatedQuantity?: number;
  rationale?: string;
}

export interface SuggestionResult {
  items: SuggestedTakeoffItem[];
  source: "llm" | "fallback";
  notes: string;
}

const SUGGESTION_SYSTEM = `You are Herbie's takeoff assistant. Given a construction scope of work, return a list of likely takeoff line items the estimator should price. Reply with strict JSON:

{
  "items": [
    {
      "name": "Concrete slab on grade",
      "description": "4\\" thick slab w/ #4 @ 12\\" o.c. each way",
      "trade": "concrete",
      "unit": "SF",
      "estimatedQuantity": 5400,
      "rationale": "Per A1.0 floor plan area"
    }
  ]
}

Rules:
- "trade" MUST be one of: concrete, framing, drywall, flooring, roofing, electrical, plumbing, hvac, lv, fire_protection, sitework, structural, finishes, other.
- "unit" should be SF, LF, EA, CY, TON, HR, or a similar standard takeoff unit.
- Do NOT duplicate items already listed under "Existing items" in the prompt.
- Cap at the requested number of suggestions.
- No prose outside the JSON object. No code fences.`;

export async function suggestTakeoffItems(
  input: SuggestionInput,
  providerOverride?: LLMProvider,
): Promise<SuggestionResult> {
  const provider = providerOverride ?? getLLMProvider();

  if (provider.stub) {
    return {
      items: fallbackSuggestions(input),
      source: "fallback",
      notes: "Stub mode (no ANTHROPIC_API_KEY). Returning generic GC line items. Set the key for real suggestions.",
    };
  }

  const userPrompt = buildSuggestionPrompt(input);
  try {
    const result = await provider.extractJson<{ items?: unknown }>({
      system: SUGGESTION_SYSTEM,
      userPrompt,
      tier: "extraction",
      maxTokens: 2_500,
    });
    if (!result.data) {
      return { items: fallbackSuggestions(input), source: "fallback", notes: "json_parse_failed" };
    }
    const items = normalizeSuggestedItems(result.data.items);
    if (items.length === 0) {
      return { items: fallbackSuggestions(input), source: "fallback", notes: "llm_returned_no_items" };
    }
    return { items, source: "llm", notes: "" };
  } catch (err: any) {
    return {
      items: fallbackSuggestions(input),
      source: "fallback",
      notes: `llm_error: ${err?.message || String(err)}`,
    };
  }
}

export function buildSuggestionPrompt(input: SuggestionInput): string {
  const lines: string[] = [];
  lines.push(`Project: ${input.projectTitle}`);
  lines.push(`Suggest ${input.maxItems ?? 12} likely takeoff line items.`);
  if (input.existingItemNames && input.existingItemNames.length > 0) {
    lines.push("");
    lines.push("Existing items (do NOT duplicate):");
    for (const name of input.existingItemNames) lines.push(`- ${name}`);
  }
  lines.push("");
  lines.push("Scope:");
  lines.push(input.scopeText.trim() || "(no scope text supplied)");
  return lines.join("\n");
}

export function normalizeSuggestedItems(raw: unknown): SuggestedTakeoffItem[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestedTakeoffItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.description !== "string") continue;
    const trade = (TAKEOFF_TRADES as readonly string[]).includes(String(o.trade)) ? (o.trade as TakeoffTrade) : "other";
    const unit = typeof o.unit === "string" && o.unit.trim().length > 0 ? o.unit.trim().toUpperCase() : "EA";
    const item: SuggestedTakeoffItem = {
      name: o.name.trim(),
      description: o.description.trim(),
      trade,
      unit,
    };
    const q = typeof o.estimatedQuantity === "number" ? o.estimatedQuantity : Number(o.estimatedQuantity);
    if (Number.isFinite(q) && q >= 0) item.estimatedQuantity = q;
    if (typeof o.rationale === "string") item.rationale = o.rationale.trim();
    out.push(item);
  }
  return out;
}

function fallbackSuggestions(input: SuggestionInput): SuggestedTakeoffItem[] {
  const seen = new Set((input.existingItemNames || []).map((n) => n.toLowerCase()));
  const candidates: SuggestedTakeoffItem[] = [
    { name: "Mobilization", description: "Mobilize equipment and trailers to site.", trade: "sitework", unit: "LS", estimatedQuantity: 1 },
    { name: "Concrete slab on grade", description: "Slab on grade per drawings.", trade: "concrete", unit: "SF" },
    { name: "Structural steel", description: "Wide-flange beams and columns per structural set.", trade: "structural", unit: "TON" },
    { name: "Drywall", description: "Gypsum board on metal stud framing.", trade: "drywall", unit: "SF" },
    { name: "HVAC ductwork", description: "Galvanized supply/return ductwork.", trade: "hvac", unit: "LF" },
    { name: "Electrical conduit", description: "Branch circuit conduit and wire.", trade: "electrical", unit: "LF" },
    { name: "Sanitary piping", description: "PVC sanitary main and branches.", trade: "plumbing", unit: "LF" },
  ];
  return candidates.filter((c) => !seen.has(c.name.toLowerCase()));
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
