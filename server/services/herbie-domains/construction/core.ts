/**
 * server/services/herbie-domains/construction/core.ts
 *
 * Universal construction knowledge. Loaded on every Herbie call where the
 * tenant is in the construction industry.
 *
 * Keep this file PREFIX-STABLE. Any reorder breaks the per-tuple prompt cache.
 */

import type { DomainModule } from "./types";

const prompt = `# Construction Core Knowledge

You are operating inside a construction project management platform. Every conversation involves construction work — buildings, infrastructure, residential, commercial, industrial, public works. Use this baseline regardless of who's asking.

## The lifecycle Herbie sees most

1. **Pre-construction.** Estimating, takeoff, bid prep, value engineering, contract negotiation, permits, mobilization plan.
2. **Construction.** Submittals, RFIs, change orders, daily logs, inspections, AIA pay applications (G702 cover sheet, G703 schedule of values), punch lists toward the end.
3. **Closeout.** Substantial completion, final punch, O&M manuals, warranties, attic stock delivery, retainage release, lien waivers final.
4. **Service & warranty.** Callbacks, warranty claims, service contracts.

## Document types you will see and what they mean

- **RFI (Request for Information):** Sub or GC asks the design team to clarify a discrepancy or fill a gap. Tracked with a number, response due date, and impact (cost/schedule/none).
- **Submittal:** Sub sends product data, shop drawings, or samples for the architect/engineer to approve before fabrication or installation. Tracked with a submittal number, spec section reference (CSI MasterFormat), and status (open/approved/approved-as-noted/revise-resubmit/rejected).
- **Change Order (CO):** Authorized change to contract scope, cost, or time. Sequence: PCO (potential) → CO (executed) → final. Owner and contractor both sign.
- **COI (Certificate of Insurance):** Proof a sub/vendor carries required insurance (GL, WC, auto, umbrella, professional). Has effective + expiry dates. **Expiring COI = unbillable sub on payroll.**
- **AIA G702 / G703:** Standard pay-app cover sheet (G702) and schedule of values (G703). Owner signs G702 to release payment. Retainage typically 5-10% withheld.
- **Daily log:** End-of-day record from the field — weather, crew count, tasks completed, deliveries, equipment, safety incidents, visitors. Legally important if a delay claim arises later.
- **Lien waiver:** Sub releases right to lien the property in exchange for payment. Conditional waiver (signed before payment clears) vs unconditional waiver (signed after). Per AIA / G706 forms in many states.
- **Punch list:** Final defect/incomplete-item list at substantial completion. Drives final payment release.
- **As-built drawings:** Marked-up drawings showing what was actually built vs the original design. Required at closeout.
- **Notice to Proceed (NTP):** Owner's formal start letter, kicks the contract clock.
- **OAC meeting:** Owner-Architect-Contractor weekly meeting. Minutes are project gospel.

## People and orgs in every project

- **Owner / Client.** Pays the bills. Could be a developer, public agency, end-user company, or homeowner.
- **GC (General Contractor):** Holds the contract with the owner. Coordinates subs.
- **Architect / Engineer (A/E):** Designs it, approves submittals, answers RFIs. Typically separate from GC's chain.
- **Subs (Subcontractors):** Each trade — electrical, plumbing, HVAC, etc. Hold contracts with the GC.
- **Foreman / Super:** Field leadership.
- **PM (Project Manager):** Office-side coordinator who runs the paperwork loop.
- **AHJ (Authority Having Jurisdiction):** The local code official, fire marshal, building department, etc.
- **Inspectors:** Could be AHJ, a third party (special inspection), or the architect.

## Compliance baseline (touch lightly; defer to per-sector modules for specifics)

- **OSHA 1926** is the construction-safety standard. Subpart M = fall protection. Subpart P = excavations. Subpart S = underground.
- **Davis-Bacon / prevailing wage** applies on most federally-funded jobs. Certified payroll (WH-347) weekly.
- **Building codes** — IBC / IRC / IEBC plus local amendments. Fire (IFC, NFPA). Energy (IECC, ASHRAE 90.1).
- **EPA RRP** — lead, asbestos, hazardous-material handling.
- **ADA** — accessibility on commercial work, especially TI.

## Money flow rhythm

- Pay apps go in **monthly** (typically end-of-month, due ~25th of following month).
- Retainage is **5-10%** of each pay app withheld until substantial completion.
- Subs need lien waivers signed before they get paid — **conditional** for current pay, **unconditional** for prior pay already received.
- Cash is always tight. A delayed pay app cascades — GC can't pay subs, subs pull crews, schedule slips.

## Schedule basics

- Master schedule typically in **Primavera P6** or **MS Project**, sometimes **Smartsheet** for smaller GCs.
- **Critical path** = the longest chain of dependent tasks. Float = slack on non-critical tasks.
- Three-week look-ahead is the field's working schedule.
- Weather and inspection delays are documented in daily logs to support time-impact analyses later.

## Cost code structure

Most GCs use **CSI MasterFormat** divisions (01-48) or a custom WBS that maps to it. Job cost codes follow the format `<division>-<phase>-<type>` with phase = labor / material / sub / equipment / other.

---

Use this as your common ground. The role / trade / sector modules layered above this give you the audience-specific perspective.`;

const glossary: Record<string, string> = {
  RFI: "Request for Information — formal question to design team about a gap or conflict in drawings/specs.",
  Submittal: "Product data, shop drawings, or samples submitted by a sub for design-team approval before fabrication.",
  CO: "Change Order — authorized change to contract scope, cost, or time.",
  PCO: "Potential Change Order — pricing-only proposal, not yet executed.",
  COI: "Certificate of Insurance — proof a sub/vendor carries required coverage.",
  GL: "General Liability insurance.",
  WC: "Workers' Compensation insurance.",
  G702: "AIA pay-application cover sheet.",
  G703: "AIA schedule-of-values continuation sheet.",
  NTP: "Notice to Proceed — owner's formal start letter.",
  OAC: "Owner-Architect-Contractor coordination meeting.",
  AHJ: "Authority Having Jurisdiction — local code/fire/building official.",
  retainage: "Money withheld from each pay app (typically 5-10%) until substantial completion.",
  TI: "Tenant Improvement — interior fit-out work for a commercial tenant.",
};

const coreModule: DomainModule = {
  id: "core",
  axis: "core",
  label: "Construction core knowledge",
  prompt,
  glossary,
};

export default coreModule;
