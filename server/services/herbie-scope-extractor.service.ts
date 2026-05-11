// Phase 1 Batch 4: real LLM-driven scope extraction for the bid jacket.
//
// Replaces the deterministic "Scope Extract + Risk Flags" template that
// herbie-jacket-builder.service.ts has been emitting since the audit. Given
// solicitation text + opportunity metadata, this service uses Claude
// (Haiku 4.5 by default per the LLM tier mapping) to return structured
// scope/risk/compliance data. The orchestration layer renders the result
// to markdown for storage in the bid jacket.
//
// Behavior contract:
//   - When the LLM provider is in stub mode (no ANTHROPIC_API_KEY) the
//     extractor returns a deterministic fallback so dev/demo flows still
//     work end-to-end. Callers do not need to special-case stub mode.
//   - The extractor never throws on parse failure; it returns an empty
//     extraction with confidence=0 and a hint in `notes`.

import { getLLMProvider, type LLMProvider } from "./llm";

export interface ScopeExtractionInput {
  title: string;
  solicitationNumber: string | null;
  agency?: string | null;
  setAside?: string | null;
  contractValue?: number | string | null;
  naics?: string[] | string | null;
  /** Raw solicitation text (PWS/SOW or full notice). May be empty. */
  solicitationText: string;
}

export interface ScopeItem {
  category: string;
  description: string;
}

export interface RiskFlag {
  severity: "low" | "medium" | "high";
  flag: string;
  rationale: string;
}

export interface ComplianceItem {
  requirement: string;
  source: string;
}

export interface ScopeExtraction {
  summary: string;
  scopeItems: ScopeItem[];
  riskFlags: RiskFlag[];
  complianceItems: ComplianceItem[];
  /** 0..1 — model's self-rating, or 1 for deterministic fallback shape. */
  confidence: number;
  /** Free text — reasons for low confidence, fallback markers, etc. */
  notes: string;
  /** "anthropic" | "fallback" — how the result was produced. */
  source: "llm" | "fallback";
}

const SYSTEM_PROMPT = `You are Herbie's scope extraction analyst. You read federal/state construction solicitations and emit a tight, structured analysis.

Always return strict JSON with this exact shape:
{
  "summary": string,                       // 2–4 sentence project summary in plain English
  "scopeItems": [{"category": string, "description": string}],
  "riskFlags": [{"severity": "low"|"medium"|"high", "flag": string, "rationale": string}],
  "complianceItems": [{"requirement": string, "source": string}],
  "confidence": number,                     // 0..1 — your own rating of extraction fidelity
  "notes": string                            // free text; if low confidence, say why
}

Rules:
- Every array MUST be present (use [] when nothing applies).
- "category" examples: Sitework, Demolition, Concrete, Structural, Mechanical, Electrical, Plumbing, Fire Protection, Finishes, Site Utilities.
- "flag" examples: SHORT_TIMELINE, DAVIS_BACON, BUY_AMERICAN, PROHIBITED_CONTENT, BONDING_REQUIRED, INTENSE_SECURITY_CLEARANCE, MULTI_AWARD.
- Keep each "rationale" under 280 chars.
- Cite exact FAR/CFR/spec section numbers in "source" when the solicitation does.
- DO NOT include code fences. JSON only.`;

export async function extractSolicitationScope(
  input: ScopeExtractionInput,
  providerOverride?: LLMProvider,
): Promise<ScopeExtraction> {
  const provider = providerOverride ?? getLLMProvider();

  // No API key — return a deterministic stub with the same shape so the
  // rest of the pipeline keeps working in dev / demo.
  if (provider.stub) {
    return fallbackExtraction(input, "no_api_key");
  }

  const userPrompt = buildUserPrompt(input);
  try {
    const result = await provider.extractJson<RawScopeJson>({
      system: SYSTEM_PROMPT,
      userPrompt,
      tier: "extraction",
      maxTokens: 2_500,
    });
    if (!result.data) {
      return fallbackExtraction(input, "json_parse_failed");
    }
    return normalizeExtraction(result.data, "llm");
  } catch (err: any) {
    return fallbackExtraction(input, `llm_error: ${err?.message || String(err)}`);
  }
}

interface RawScopeJson {
  summary?: unknown;
  scopeItems?: unknown;
  riskFlags?: unknown;
  complianceItems?: unknown;
  confidence?: unknown;
  notes?: unknown;
}

export function normalizeExtraction(
  raw: RawScopeJson,
  source: "llm" | "fallback",
): ScopeExtraction {
  return {
    summary: typeof raw.summary === "string" ? raw.summary.trim() : "",
    scopeItems: normalizeScopeItems(raw.scopeItems),
    riskFlags: normalizeRiskFlags(raw.riskFlags),
    complianceItems: normalizeComplianceItems(raw.complianceItems),
    confidence: clampConfidence(raw.confidence),
    notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    source,
  };
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeScopeItems(v: unknown): ScopeItem[] {
  if (!Array.isArray(v)) return [];
  const out: ScopeItem[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.category === "string" && typeof o.description === "string") {
      out.push({ category: o.category.trim(), description: o.description.trim() });
    }
  }
  return out;
}

function normalizeRiskFlags(v: unknown): RiskFlag[] {
  if (!Array.isArray(v)) return [];
  const allowed: RiskFlag["severity"][] = ["low", "medium", "high"];
  const out: RiskFlag[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const sev = (typeof o.severity === "string" ? o.severity.toLowerCase() : "") as RiskFlag["severity"];
    if (!allowed.includes(sev)) continue;
    if (typeof o.flag !== "string" || typeof o.rationale !== "string") continue;
    out.push({ severity: sev, flag: o.flag.trim(), rationale: o.rationale.trim().slice(0, 280) });
  }
  return out;
}

function normalizeComplianceItems(v: unknown): ComplianceItem[] {
  if (!Array.isArray(v)) return [];
  const out: ComplianceItem[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.requirement === "string" && typeof o.source === "string") {
      out.push({ requirement: o.requirement.trim(), source: o.source.trim() });
    }
  }
  return out;
}

export function buildUserPrompt(input: ScopeExtractionInput): string {
  const lines: string[] = [];
  lines.push(`# Project`);
  lines.push(`Title: ${input.title}`);
  if (input.solicitationNumber) lines.push(`Solicitation: ${input.solicitationNumber}`);
  if (input.agency) lines.push(`Agency: ${input.agency}`);
  if (input.setAside) lines.push(`Set-aside: ${input.setAside}`);
  if (input.contractValue) lines.push(`Estimated value: ${input.contractValue}`);
  const naicsList = Array.isArray(input.naics)
    ? input.naics.join(", ")
    : typeof input.naics === "string"
      ? input.naics
      : "";
  if (naicsList) lines.push(`NAICS: ${naicsList}`);
  lines.push("");
  lines.push("# Solicitation text");
  lines.push(input.solicitationText.trim() || "(no solicitation text supplied — extract everything you can from the project metadata above)");
  return lines.join("\n");
}

function fallbackExtraction(input: ScopeExtractionInput, reason: string): ScopeExtraction {
  const summary = `Construction project: ${input.title}${
    input.solicitationNumber ? ` (Solicitation ${input.solicitationNumber})` : ""
  }. Detailed scope extraction unavailable (${reason}).`;

  const baseItems: ScopeItem[] = [
    { category: "Sitework", description: "Confirm site access, mobilization, and disposal requirements." },
    { category: "Structural", description: "Verify structural deliverables per drawings and specifications." },
    { category: "Finishes", description: "Confirm finishes scope per architectural set." },
  ];

  const baseRisks: RiskFlag[] = [
    {
      severity: "medium",
      flag: "MISSING_LLM_EXTRACTION",
      rationale: `Falling back to deterministic scope template because ${reason}. Set ANTHROPIC_API_KEY for richer extraction.`,
    },
  ];
  if (input.setAside) {
    baseRisks.push({
      severity: "low",
      flag: "SET_ASIDE",
      rationale: `${input.setAside} set-aside applies — confirm certification status before submission.`,
    });
  }

  const baseCompliance: ComplianceItem[] = [
    { requirement: "Verify FAR Part 36 (Construction) clauses are addressed in the proposal.", source: "FAR 36" },
    { requirement: "Confirm bonding letter (bid, performance, payment) is on file.", source: "Solicitation" },
    { requirement: "Confirm GL/WC/Auto/Umbrella COIs are current and meet limits.", source: "Solicitation" },
  ];

  return {
    summary,
    scopeItems: baseItems,
    riskFlags: baseRisks,
    complianceItems: baseCompliance,
    confidence: 0,
    notes: `fallback: ${reason}`,
    source: "fallback",
  };
}

export function renderScopeExtractionMarkdown(
  input: ScopeExtractionInput,
  extraction: ScopeExtraction,
): string {
  const lines: string[] = [];
  lines.push(`# Scope Extract & Risk Flags`);
  lines.push("");
  lines.push(`**Project:** ${input.title}`);
  if (input.solicitationNumber) lines.push(`**Solicitation:** ${input.solicitationNumber}`);
  lines.push(`**Source:** ${extraction.source === "llm" ? "Herbie (Claude)" : "Deterministic fallback"}`);
  lines.push(`**Confidence:** ${(extraction.confidence * 100).toFixed(0)}%`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push(extraction.summary || "(no summary)");
  lines.push("");

  lines.push(`## Scope Items (${extraction.scopeItems.length})`);
  if (extraction.scopeItems.length === 0) {
    lines.push("_None extracted._");
  } else {
    for (const item of extraction.scopeItems) {
      lines.push(`- **${item.category}** — ${item.description}`);
    }
  }
  lines.push("");

  lines.push(`## Risk Flags (${extraction.riskFlags.length})`);
  if (extraction.riskFlags.length === 0) {
    lines.push("_None identified._");
  } else {
    for (const flag of extraction.riskFlags) {
      const sev = flag.severity.toUpperCase();
      lines.push(`- [${sev}] **${flag.flag}** — ${flag.rationale}`);
    }
  }
  lines.push("");

  lines.push(`## Compliance Items (${extraction.complianceItems.length})`);
  if (extraction.complianceItems.length === 0) {
    lines.push("_None identified._");
  } else {
    for (const item of extraction.complianceItems) {
      lines.push(`- ${item.requirement} _(source: ${item.source})_`);
    }
  }
  lines.push("");

  if (extraction.notes) {
    lines.push(`## Notes`);
    lines.push(extraction.notes);
  }

  return lines.join("\n");
}
