// Phase 1: server-side enforcement that bid-jacket checklist items cannot
// transition to "done" while their required artifacts are missing.
//
// `bidJacketChecklistItems.requiredArtifactCodes` is a jsonb array of
// template codes (e.g. ["SAM_SOLICITATION", "PRICING_SHEET"]). For each
// code we verify there exists a `bid_jacket_artifacts` row for the same
// bid project whose status is "ready" or "approved".

export const ARTIFACT_READY_STATUSES = ["ready", "approved"] as const;
export type ArtifactReadyStatus = (typeof ARTIFACT_READY_STATUSES)[number];

export interface ArtifactRow {
  templateCode: string | null;
  status: string | null;
}

export interface BlockingArtifactCheckInput {
  requiredArtifactCodes: unknown;
  bidArtifacts: ArtifactRow[];
}

export interface BlockingArtifactCheckResult {
  blocked: boolean;
  missingCodes: string[];
}

export function evaluateChecklistArtifactGate(
  input: BlockingArtifactCheckInput,
): BlockingArtifactCheckResult {
  const required = normalizeCodes(input.requiredArtifactCodes);
  if (required.length === 0) {
    return { blocked: false, missingCodes: [] };
  }

  const ready = new Set(
    input.bidArtifacts
      .filter((a) => a.templateCode && a.status && ARTIFACT_READY_STATUSES.includes(a.status as ArtifactReadyStatus))
      .map((a) => a.templateCode as string),
  );

  const missingCodes = required.filter((code) => !ready.has(code));
  return {
    blocked: missingCodes.length > 0,
    missingCodes,
  };
}

function normalizeCodes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" && v.trim().length > 0) out.push(v.trim());
  }
  return out;
}
