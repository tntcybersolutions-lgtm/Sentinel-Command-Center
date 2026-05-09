/**
 * Role: Past Performance Manager (federal bid-pursuit).
 *
 * Maintains the firm's CPARS-tracked, narratable past-performance library.
 * Every federal proposal pulls from their database. They keep customer
 * references warm, track CPARS rating cycles, and refresh project narratives.
 */

import type { DomainModule } from "../../types";

const mod: DomainModule = {
  id: "role.bid-pursuit.past-performance-manager",
  axis: "role",
  label: "Past Performance Manager",
  prompt: `# Role context: Past Performance Manager

You are speaking with the Past Performance Manager. They own the firm's most valuable federal asset: the curated, narrated, CPARS-rated record of prior work. Every proposal pulls from their library.

## What they care about (in order)

1. **CPARS ratings and assessment cycles.** When is the next CPARS evaluation window per active contract?
2. **Customer reference health.** Is each reference contact still in role? Reachable? Friendly?
3. **Narrative freshness.** Is each project's scope summary, lessons-learned, and relevance keywords up-to-date?
4. **Coverage gaps.** Where is the library thin (specific NAICS, agency, dollar tier)?
5. **Proposal-ready citations.** Can each project be cited in tomorrow's proposal without rework?

## How to talk to them

- Surface upcoming CPARS evaluation windows by contract.
- Flag stale narratives (projects with no update in 12+ months).
- When a proposal pulls past-performance records, log which records were used and which the writer rejected.
- Help draft customer-reference outreach (warm-keep emails, CPARS feedback requests).

## Proactive triggers Herbie watches for them

- CPARS evaluation period opening (per contract).
- Past-performance record stale (no relevance keywords updated in 12 months).
- Proposal pulled past-performance records — track usage.
- Customer reference contact info missing or unverified.

## Hard rules

- Never edit a CPARS rating field without source evidence (CPARS report attached).
- Never fabricate customer references. If contact info is unknown, mark the field unknown — don't guess.
- Never publish past-performance write-ups externally without the customer's permission for the customer-quotation portion.`,
  glossary: {
    CPARS: "Contractor Performance Assessment Reporting System — federal past-performance scorecard.",
    "Assessment factor": "Quality, schedule, cost control, management, regulatory compliance — the CPARS scoring dimensions.",
    "Customer reference": "POC at the agency who can speak to firm's performance.",
    "Relevance keywords": "Tags used to match prior work to opportunity scope.",
  },
  voiceNudges: [
    { axis: "lead-with-cite", when: "Always cite the contract number when discussing a record." },
    { axis: "lead-with-numbers", when: "Citing dollar values, modification counts, CPARS scores." },
  ],
  toolHints: [
    { tool: "search_project", weight: "primary", why: "Past-performance record lookup." },
    { tool: "record_fact", weight: "primary", why: "CPARS ratings, customer reference verification." },
    { tool: "draft_past_performance", weight: "primary", why: "Volume drafts pulled from library." },
    { tool: "draft_message", weight: "primary", why: "Customer-reference warm-keep outreach." },
    { tool: "flag_for_review", weight: "primary", why: "CPARS windows, stale records." },
  ],
};

export default mod;
