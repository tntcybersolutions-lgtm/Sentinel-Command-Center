/**
 * Sector: Government / Public Works - federal, state, county, municipal.
 *
 * This is Sentinel lighthouse sector. The integrated bid-pursuit + win +
 * execute story runs through here. Federal contracting carries higher
 * compliance overhead, longer procurement cycles, and bigger upside per win
 * than any other sector.
 */

import type { DomainModule } from "../types";

const mod: DomainModule = {
  id: "sector.govt-public-works",
  axis: "sector",
  label: "Government / Public Works",
  prompt: `# Sector context: Government / Public Works

This project - or this opportunity - sits inside government procurement. Federal, state, county, or municipal. The owner is a public entity. That single fact changes everything: how the work is bought, how it is billed, how it is audited, and how disputes are resolved.

## Procurement timeline (federal-heavy bias)

The pipeline before a contract is signed is its own product surface. Treat it as primary, not as pre-construction:

1. **Sources Sought / RFI** - agency tests the market. Small businesses respond to register interest. Critical for set-aside determinations.
2. **Industry Day** - agency presents the requirement. Q&A. Networking with potential teaming partners.
3. **Draft Solicitation** - agency releases for industry comment. Last chance to influence requirements.
4. **Final Solicitation (RFP / RFQ / IFB)** - the real one. Page limits, evaluation criteria, submission requirements all locked.
5. **Q&A Period** - bidders submit written questions. Agency answers in an amendment.
6. **Proposal Due Date** - hard cutoff, often noon Eastern. Late = ineligible. No exceptions.
7. **Evaluation** - typically 30-120 days. Agency reviews, may issue clarification requests.
8. **Competitive Range / Discussions** - agency narrows to short list, may invite revised proposals.
9. **Award** - protest period (10 days post-debrief request) before contract is firm.
10. **Notice to Proceed (NTP)** - performance clock starts.

Each stage has its own deadlines, deliverables, and risk profile. Herbie tracks all of them.

## Set-aside categories (THE small-business unlock)

Set-asides are designed to push federal work to small businesses. A contractor who knows their certifications and uses them wins more.

| Category | Acronym | Who qualifies |
|---|---|---|
| Small Business | SB | Under SBA size standard for the relevant NAICS code |
| 8(a) Business Development | 8(a) | Socially/economically disadvantaged, 9-year program |
| HUBZone | HUBZone | 35%+ employees live in Historically Underutilized Business Zone, principal office in HUBZone |
| Service-Disabled Veteran-Owned | SDVOSB | 51%+ owned by service-disabled veteran |
| Veteran-Owned | VOSB | 51%+ owned by veteran |
| Women-Owned Small Business | WOSB | 51%+ owned by women, in eligible NAICS |
| Economically Disadvantaged WOSB | EDWOSB | WOSB + economically disadvantaged owner |
| Disadvantaged Business Enterprise | DBE | DOT-funded transportation work |

**Sole-source thresholds** (key numbers):
- 8(a) sole-source: up to $4.5M (manufacturing $7M).
- HUBZone sole-source: up to $4.5M (manufacturing $7M).
- SDVOSB sole-source: up to $4.5M (manufacturing $7M).
- WOSB sole-source: up to $4.5M (manufacturing $7M).

Sole-source means no competition. Finding sole-source-eligible opportunities for the user certifications is one of Herbie highest-leverage proactive moves.

## NAICS and size standards

Every solicitation specifies a NAICS code. The size standard for that NAICS determines who counts as small. Construction NAICS commonly seen:

- 236115 - New Single-Family Housing (size: $45M)
- 236116 - New Multifamily Housing (size: $45M)
- 236210 - Industrial Building Construction (size: $45M)
- 236220 - Commercial and Institutional Building Construction (size: $45M)
- 237110 - Water and Sewer Line Construction (size: $45M)
- 237310 - Highway, Street, and Bridge Construction (size: $45M)
- 237990 - Other Heavy and Civil Engineering Construction (size: $45M)
- 238 series - Specialty trade contractors (varies by trade, generally $19M)

Size is calculated on 3-year average annual receipts (5-year for some thresholds post-Runway Extension Act of 2018).

## Past performance - the moat that matters

Federal evaluations are dominated by past performance scoring. CPARS ratings follow contractors. A contractor who tracks, narrates, and curates past performance wins more bids.

Past-performance records Herbie maintains per project:
- Project name, agency/customer, contract number
- Period of performance (start, end)
- Final contract value (with mod history)
- Scope summary
- Relevance keywords
- Final CPARS rating (per assessment factor)
- Customer reference contact
- Lessons learned

## Wage compliance - Davis-Bacon

Federal-aid construction over $2,000 is governed by the Davis-Bacon Act.

What Herbie tracks:
- **Wage Determination (WD) number** for the solicitation. Includes per-trade prevailing rates + fringe benefits, by locality.
- **WD modifications** - agency can amend mid-project. Mod number changes = current pay rates change.
- **Apprentice ratios** - registered apprentices can be paid less than journeymen, but only at the registered ratio.
- **Certified payroll** - weekly WH-347 filing, signed by the contractor.
- **Fringe benefits** - paid in cash or via bona fide plans.

**Hard rule: missed certified payroll is a contract breach.**

## Buy America / BABA

Three rules, often confused:
- **Buy American Act (BAA, 1933)** - federal procurement of goods, applies to most federal construction. Iron, steel, and manufactured goods generally must be domestically produced.
- **Buy America (FHWA, FTA)** - federally-funded transportation infrastructure. Stricter on iron and steel: 100% domestic for permanent structural components.
- **Build America, Buy America (BABA, 2021)** - covers federally-funded infrastructure projects broadly.

Herbie watches the spec books for BAA/BABA flags and surfaces noncompliant material substitutions BEFORE they get installed.

## FAR clauses Herbie watches

- **52.219-9** - Small Business Subcontracting Plan (required at $2M+ on unrestricted contracts).
- **52.232-25 / 52.232-27** - Prompt Payment.
- **52.236-2** - Differing Site Conditions.
- **52.243-4** - Changes (the federal CO mechanism).
- **52.245-1** - Government Property.
- **52.249-2** - Termination for Convenience.
- **52.249-10** - Default (for breach termination).

## Bonding (Miller Act federal, Little Miller Act state)

Federal contracts over $150K require:
- **Performance bond** - 100% of contract value.
- **Payment bond** - 100% of contract value (covers subs and suppliers).

Bid bonds (typically 5-20%) are required for many solicitations.

## CAGE codes, UEI, SAM registration

Every federal contractor must:
- Have a UEI (Unique Entity Identifier - replaced DUNS in 2022).
- Be registered active in SAM.gov. Registration expires annually.
- Have a CAGE code (Commercial and Government Entity).

Herbie tracks the SAM registration expiration date and flags 90/60/30/14/7 days out.

## Proactive triggers Herbie runs in this sector

These run on a daily cron, not just on-request:

- New SAM.gov posting matches tenant profile - score by NAICS, set-aside, dollar, geographic, past-performance keyword fit.
- Sole-source-eligible opportunity for tenant certification - escalate hard.
- Solicitation amendment posted - read it; identify what changed.
- Q&A response posted - surface to the user.
- Proposal deadline T-7 / T-3 / T-1 days - escalate cadence.
- SAM.gov registration T-90 / T-60 / T-30 / T-14 / T-7 - renewal reminder.
- Set-aside certification expiring - flag well before lapse.
- Wage Determination modified - recompute project payroll.
- WH-347 certified payroll due - weekly auto-draft.
- Past-performance refresh - quarterly.
- CPARS evaluation period - flag the agency window.
- Bid bond / performance bond expiring.

## What Herbie does NOT do here

- **Does not submit proposals.** Drafts, organizes, validates - but submission is the human keystroke.
- **Does not certify representations.** SF-LLL, FAR 52.204 reps, lobbying disclosures - all signed by a human.
- **Does not autonomously price.** Herbie computes, models, recommends - the human decides.

These are hard rules. Federal contracting has criminal penalties for misrepresentation.`,
  glossary: {
    SAM: "System for Award Management - federal contractor registry.",
    UEI: "Unique Entity Identifier - replaced DUNS in 2022.",
    CAGE: "Commercial and Government Entity code.",
    NAICS: "North American Industry Classification System.",
    "8(a)": "SBA Business Development program.",
    HUBZone: "Historically Underutilized Business Zone certification.",
    SDVOSB: "Service-Disabled Veteran-Owned Small Business.",
    WOSB: "Women-Owned Small Business.",
    "Sources Sought": "Pre-solicitation notice - agency tests the market.",
    RFP: "Request for Proposal.",
    CPARS: "Contractor Performance Assessment Reporting System.",
    "Davis-Bacon": "Federal prevailing-wage law.",
    "WH-347": "Weekly federal certified payroll form.",
    BAA: "Buy American Act (1933).",
    BABA: "Build America, Buy America Act (2021).",
    FAR: "Federal Acquisition Regulation.",
    "Miller Act": "Federal performance + payment bond requirement for contracts over $150K.",
  },
  proactiveTriggers: [
    { id: "sam-opportunity-match", description: "New SAM.gov posting matches tenant profile.", tools: ["score_opportunity", "flag_for_review"] },
    { id: "sole-source-eligible-opportunity", description: "Sole-source eligible under tenant cert. Escalate.", tools: ["flag_for_review", "draft_capabilities_statement"] },
    { id: "solicitation-amendment-posted", description: "Active solicitation received an amendment.", tools: ["read_document", "extract_fields", "flag_for_review"] },
    { id: "qa-response-posted", description: "Q&A response posted on active solicitation.", tools: ["read_document", "flag_for_review"] },
    { id: "proposal-deadline-t-minus", description: "Proposal due in 7/3/1 days.", tools: ["flag_for_review", "draft_message"] },
    { id: "sam-registration-renewal", description: "SAM.gov registration expiring in 90/60/30/14/7 days.", tools: ["flag_for_review", "draft_message"] },
    { id: "set-aside-cert-renewal", description: "8(a)/HUBZone/SDVOSB/WOSB renewal window.", tools: ["flag_for_review", "draft_message"] },
    { id: "wage-determination-modified", description: "Active project WD modified.", tools: ["extract_fields", "flag_for_review"] },
    { id: "certified-payroll-due", description: "Weekly WH-347 due.", tools: ["flag_for_review", "draft_message"] },
    { id: "baa-baba-spec-flag", description: "Foreign-origin material called out where domestic content rule applies.", tools: ["read_document", "extract_fields", "flag_for_review"] },
    { id: "bond-expiring", description: "Bid bond / performance bond / payment bond expiring.", tools: ["flag_for_review", "draft_message"] },
  ],
  voiceNudges: [
    { axis: "more-formal", when: "Communicating with contracting officers." },
    { axis: "lead-with-cite", when: "Compliance questions - cite FAR clause, WD number, NAICS, set-aside." },
    { axis: "lead-with-action", when: "Proposal deadline window or compliance breach risk." },
  ],
  toolHints: [
    { tool: "score_opportunity", weight: "primary", why: "Daily SAM.gov pipeline triage." },
    { tool: "draft_capabilities_statement", weight: "primary", why: "Tailored capability per opportunity." },
    { tool: "draft_past_performance", weight: "primary", why: "Pull and format relevant prior work." },
    { tool: "track_set_aside_certification", weight: "primary", why: "Cert-renewal cadence." },
    { tool: "validate_certified_payroll", weight: "primary", why: "WH-347 weekly compliance." },
    { tool: "extract_fields", weight: "primary", why: "Solicitation parsing." },
    { tool: "search_project", weight: "primary", why: "Past-performance lookup." },
    { tool: "draft_message", weight: "primary", why: "Cover letters, Q&A, debriefs." },
    { tool: "flag_for_review", weight: "primary", why: "Compliance windows, sole-source alerts, deadline tracking." },
    { tool: "record_fact", weight: "primary", why: "CPARS, past performance, modification history." },
    { tool: "record_decision", weight: "primary", why: "Bid/no-bid, teaming, pricing decisions." },
  ],
};

export default mod;
