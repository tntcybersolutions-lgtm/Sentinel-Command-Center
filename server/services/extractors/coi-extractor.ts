// Deterministic extractor for Certificate-of-Insurance text. Uses
// regex + string heuristics — no LLM. Returns a typed result with a
// confidence score based on how many fields were found.
//
// The input is OCR'd or text-layer-extracted document text. When the
// caller only has a filename (no OCR yet), pass the filename and we
// fall back to filename-only heuristics at low confidence.

export type CoiPolicyType =
  | "gl"
  | "wc"
  | "auto"
  | "umbrella"
  | "professional"
  | "pollution"
  | "builders_risk";

export interface CoiExtraction {
  policyType?: CoiPolicyType;
  carrier?: string;
  policyNumber?: string;
  effectiveDate?: Date;
  expiryDate?: Date;
  limits?: {
    eachOccurrence?: number;
    generalAggregate?: number;
    autoLiability?: number;
  };
  confidence: number; // 0..1
  evidence: string[]; // short snippets we pulled each field from
}

// `\s` alone misses filename separators (hyphens, underscores).
// SEP matches any run of whitespace / hyphen / underscore so
// "general liability", "general-liability", and "general_liability"
// all hit.
const SEP = "[\\s_-]+";
const POLICY_TYPE_PATTERNS: Array<{ type: CoiPolicyType; rx: RegExp }> = [
  { type: "gl", rx: new RegExp(`\\b(general${SEP}liability|gl)\\b`, "i") },
  { type: "wc", rx: new RegExp(`\\b(workers?[\\s'_-]*comp(?:ensation)?|wc)\\b`, "i") },
  { type: "auto", rx: new RegExp(`\\b(auto(?:mobile)?${SEP}liability|business${SEP}auto)\\b`, "i") },
  { type: "umbrella", rx: /\b(umbrella|excess[\s_-]+liability)\b/i },
  { type: "professional", rx: new RegExp(`\\b(professional${SEP}liability|e&o|errors${SEP}and${SEP}omissions)\\b`, "i") },
  { type: "pollution", rx: new RegExp(`\\b(pollution${SEP}liability|environmental${SEP}liability)\\b`, "i") },
  { type: "builders_risk", rx: new RegExp(`\\b(builder['']?s?${SEP}risk)\\b`, "i") },
];

const DATE_PATTERNS = [
  // MM/DD/YYYY
  /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g,
  // YYYY-MM-DD
  /\b(\d{4})-(\d{2})-(\d{2})\b/g,
];

export function extractCoiFields(input: {
  text?: string;
  fileName?: string;
}): CoiExtraction {
  const text = (input.text ?? "").trim();
  const fileName = (input.fileName ?? "").trim();
  const haystack = text || fileName;
  const evidence: string[] = [];
  const result: CoiExtraction = {
    confidence: 0,
    evidence,
  };
  if (!haystack) return result;

  // Policy type — scan all patterns and pick the first that hits.
  for (const { type, rx } of POLICY_TYPE_PATTERNS) {
    const m = haystack.match(rx);
    if (m) {
      result.policyType = type;
      evidence.push(`policy_type ← "${m[0]}"`);
      break;
    }
  }

  // Expiry / effective dates — find labeled dates first, then fall
  // back to any date pair.
  const expRx = /expir(?:ation|es|y|ing)\s*(?:date)?\s*[:\-]?\s*([01]?\d\/[0-3]?\d\/\d{4}|\d{4}-\d{2}-\d{2})/i;
  const effRx = /effective\s*(?:date)?\s*[:\-]?\s*([01]?\d\/[0-3]?\d\/\d{4}|\d{4}-\d{2}-\d{2})/i;
  const expMatch = haystack.match(expRx);
  const effMatch = haystack.match(effRx);
  if (expMatch) {
    const d = parseDateToken(expMatch[1]);
    if (d) {
      result.expiryDate = d;
      evidence.push(`expiry_date ← "${expMatch[0]}"`);
    }
  }
  if (effMatch) {
    const d = parseDateToken(effMatch[1]);
    if (d) {
      result.effectiveDate = d;
      evidence.push(`effective_date ← "${effMatch[0]}"`);
    }
  }
  // Fallback: pick the first two dates in chronological order as
  // (effective, expiry).
  if (!result.expiryDate) {
    const dates = extractDates(haystack).sort((a, b) => a.getTime() - b.getTime());
    if (dates.length >= 2) {
      if (!result.effectiveDate) result.effectiveDate = dates[0];
      result.expiryDate = dates[dates.length - 1];
      evidence.push("dates ← chronological fallback");
    }
  }

  // Carrier — often labeled "Insurer" or "Carrier". We only look
  // for the label variants here (not the broader "Insurance
  // Company") because the latter matches mid-string inside carrier
  // names like "Acme Mutual Insurance Company" and captures the
  // wrong text.
  const carrierRx = /(?:insurer|carrier)\s*[:\-]?\s*([A-Z][A-Za-z0-9 &,.'-]{2,60})/i;
  const carrierMatch = text.match(carrierRx);
  if (carrierMatch) {
    result.carrier = carrierMatch[1].trim().replace(/[,.]$/, "");
    evidence.push(`carrier ← "${carrierMatch[0]}"`);
  }

  // Policy number — labeled "policy no" / "policy number" / "policy #".
  const polNumRx = /policy\s*(?:no\.?|number|#)\s*[:\-]?\s*([A-Z0-9-]{4,30})/i;
  const polMatch = text.match(polNumRx);
  if (polMatch) {
    result.policyNumber = polMatch[1];
    evidence.push(`policy_number ← "${polMatch[0]}"`);
  }

  // Limits — look for explicit dollar amounts near known labels.
  const eachOccRx = /each\s+occurrence\s*[:\-]?\s*\$?\s*([\d,]+)/i;
  const genAggRx = /general\s+aggregate\s*[:\-]?\s*\$?\s*([\d,]+)/i;
  const autoRx = /(?:auto(?:mobile)?\s+)?combined\s+single\s+limit\s*[:\-]?\s*\$?\s*([\d,]+)/i;
  const limits: CoiExtraction["limits"] = {};
  const em = text.match(eachOccRx);
  if (em) {
    limits.eachOccurrence = parseCurrency(em[1]);
    evidence.push(`each_occurrence ← "${em[0]}"`);
  }
  const gm = text.match(genAggRx);
  if (gm) {
    limits.generalAggregate = parseCurrency(gm[1]);
    evidence.push(`general_aggregate ← "${gm[0]}"`);
  }
  const am = text.match(autoRx);
  if (am) {
    limits.autoLiability = parseCurrency(am[1]);
    evidence.push(`auto_liability ← "${am[0]}"`);
  }
  if (Object.keys(limits).length > 0) result.limits = limits;

  result.confidence = scoreConfidence(result, text.length > 0);
  return result;
}

function parseDateToken(tok: string): Date | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tok);
  if (iso) {
    return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  }
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(tok);
  if (mdy) {
    return new Date(Date.UTC(+mdy[3], +mdy[1] - 1, +mdy[2]));
  }
  return undefined;
}

function extractDates(haystack: string): Date[] {
  const found: Date[] = [];
  for (const pattern of DATE_PATTERNS) {
    let m;
    // Reset state for global regex.
    pattern.lastIndex = 0;
    while ((m = pattern.exec(haystack)) !== null) {
      const d = parseDateToken(m[0]);
      if (d && !Number.isNaN(d.getTime())) found.push(d);
    }
  }
  return found;
}

function parseCurrency(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function scoreConfidence(r: CoiExtraction, hasBodyText: boolean): number {
  // Base: 0.2 for recognizable policy type from text, 0.1 from filename.
  let score = 0;
  if (r.policyType) score += hasBodyText ? 0.25 : 0.15;
  if (r.expiryDate) score += 0.25;
  if (r.effectiveDate) score += 0.1;
  if (r.carrier) score += 0.15;
  if (r.policyNumber) score += 0.15;
  if (r.limits) score += 0.1;
  // Clamp
  return Math.min(1, Math.round(score * 100) / 100);
}
