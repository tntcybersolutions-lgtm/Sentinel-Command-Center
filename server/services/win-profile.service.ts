// Phase 1 Batch 9: derive a "win profile" from bid_history so SAM.gov
// auto-pull can rank new opportunities by similarity to past wins.
//
// Inputs: rows in bid_history with outcome="win".
// Output: a profile that summarizes Blackhawk's winning pattern (which
//   NAICS codes win most, which agencies, which set-asides, dollar
//   bands).
// Scoring: scoreOpportunityFit(opp, profile) returns 0..100 — used by
//   the SAM auto-create pipeline to decide which opps to materialize as
//   bid_projects with full jackets, and which to leave as raw
//   opportunity rows.

export interface WinProfileInput {
  naicsCode: string | null;
  setAsideCode: string | null;
  agencyName: string | null;
  contractValue: string | number | null;
}

export interface WinProfile {
  totalWins: number;
  naicsFreq: Map<string, number>;
  agencyFreq: Map<string, number>;
  setAsideFreq: Map<string, number>;
  /** Min/max contract value across wins, null if all values missing. */
  valueRange: { min: number; max: number } | null;
  /** Median contract value, null if no values. */
  medianValue: number | null;
}

export function buildWinProfileFromRows(rows: WinProfileInput[]): WinProfile {
  const naicsFreq = new Map<string, number>();
  const agencyFreq = new Map<string, number>();
  const setAsideFreq = new Map<string, number>();
  const values: number[] = [];

  for (const r of rows) {
    if (r.naicsCode) bump(naicsFreq, r.naicsCode);
    if (r.agencyName) bump(agencyFreq, r.agencyName);
    if (r.setAsideCode) bump(setAsideFreq, r.setAsideCode);
    const v = parseValue(r.contractValue);
    if (v !== null) values.push(v);
  }

  values.sort((a, b) => a - b);
  const valueRange = values.length > 0 ? { min: values[0], max: values[values.length - 1] } : null;
  const medianValue = values.length > 0 ? values[Math.floor(values.length / 2)] : null;

  return {
    totalWins: rows.length,
    naicsFreq,
    agencyFreq,
    setAsideFreq,
    valueRange,
    medianValue,
  };
}

export interface OpportunityFitInput {
  naicsCodes: string[] | null;
  agency: string | null;
  setAside: string | null;
  contractValue: number | string | null;
}

export interface FitScore {
  /** 0..100 — higher means closer to past wins. */
  score: number;
  /** Sub-scores so we can show the user why something matched. */
  breakdown: {
    naics: number;
    agency: number;
    setAside: number;
    value: number;
  };
  reasons: string[];
}

/**
 * Score how similar an opportunity is to Blackhawk's win profile.
 * Weights:
 *   NAICS  — 40 (any matching NAICS code in the win frequency map; bonus
 *            for top-3)
 *   Agency — 25 (exact name match; partial-substring fallback)
 *   SetAside — 15 (exact code match)
 *   Value  — 20 (within median 0.3x..3x band; partial credit for
 *                edges of historic min/max)
 *
 * No wins yet → returns a neutral 50 score with all-zero breakdown so
 * we don't bias against a brand-new tenant.
 */
export function scoreOpportunityFit(
  opp: OpportunityFitInput,
  profile: WinProfile,
): FitScore {
  if (profile.totalWins === 0) {
    return {
      score: 50,
      breakdown: { naics: 0, agency: 0, setAside: 0, value: 0 },
      reasons: ["No win history yet — neutral score."],
    };
  }

  const reasons: string[] = [];

  // ─── NAICS (40) ────────────────────────────────────────────────────────────
  const oppNaics = (opp.naicsCodes || []).filter((c): c is string => typeof c === "string" && c.length > 0);
  const top3Naics = sortedTop(profile.naicsFreq, 3).map(([k]) => k);
  let naicsScore = 0;
  for (const code of oppNaics) {
    if (profile.naicsFreq.has(code)) {
      naicsScore = Math.max(naicsScore, top3Naics.includes(code) ? 40 : 25);
    }
  }
  if (naicsScore > 0) reasons.push(`NAICS ${oppNaics.join(", ")} matches win history`);

  // ─── Agency (25) ───────────────────────────────────────────────────────────
  let agencyScore = 0;
  if (opp.agency) {
    const lower = opp.agency.toLowerCase();
    const exact = profile.agencyFreq.has(opp.agency);
    if (exact) {
      agencyScore = 25;
      reasons.push(`Past wins with ${opp.agency}`);
    } else {
      const partial = Array.from(profile.agencyFreq.keys()).some(
        (a) => a.toLowerCase().includes(lower) || lower.includes(a.toLowerCase()),
      );
      if (partial) {
        agencyScore = 12;
        reasons.push(`Agency overlaps win history (${opp.agency})`);
      }
    }
  }

  // ─── Set-aside (15) ────────────────────────────────────────────────────────
  let setAsideScore = 0;
  if (opp.setAside && profile.setAsideFreq.has(opp.setAside)) {
    setAsideScore = 15;
    reasons.push(`Set-aside ${opp.setAside} matches win history`);
  }

  // ─── Contract value (20) ───────────────────────────────────────────────────
  const v = parseValue(opp.contractValue);
  let valueScore = 0;
  if (v !== null && profile.medianValue !== null && profile.valueRange !== null) {
    const median = profile.medianValue;
    const ratio = median > 0 ? v / median : 1;
    if (ratio >= 0.3 && ratio <= 3) {
      valueScore = 20;
      reasons.push(`Contract value $${v.toLocaleString()} fits sweet spot (~${median.toLocaleString()})`);
    } else if (v >= profile.valueRange.min * 0.5 && v <= profile.valueRange.max * 2) {
      valueScore = 10;
      reasons.push(`Contract value $${v.toLocaleString()} within historic range (extended)`);
    }
  }

  const total = naicsScore + agencyScore + setAsideScore + valueScore;
  return {
    score: total,
    breakdown: { naics: naicsScore, agency: agencyScore, setAside: setAsideScore, value: valueScore },
    reasons,
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedTop<K, V extends number>(map: Map<K, V>, n: number): Array<[K, V]> {
  return Array.from(map.entries())
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, n);
}

function parseValue(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// ─── DB-bound wrapper (used by the SAM auto-create pipeline) ─────────────────

export interface WinProfileLoader {
  loadWins(tenantId: string): Promise<WinProfileInput[]>;
}

export async function loadWinProfile(
  tenantId: string,
  loader: WinProfileLoader,
): Promise<WinProfile> {
  const rows = await loader.loadWins(tenantId);
  return buildWinProfileFromRows(rows);
}
