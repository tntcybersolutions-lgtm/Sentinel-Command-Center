// GC-focused artifact taxonomy (Roadmap Feature 2).
//
// Distinct from the federal bid-jacket CANON taxonomy in
// server/services/bid-jacket-to-project-documents.service.ts — that
// one is oriented around a bid package; this one is oriented around
// a live construction project as a small-to-mid GC sees it.
//
// Features that need a canonical category: document vault (Feature 2),
// COI tracker (Feature 3), daily log capture (Feature 4),
// RFI/Submittal drafting (Feature 5), proactive monitor (Feature 9).

export const GC_ARTIFACT_CATEGORIES = [
  "plans",
  "specs",
  "coi",
  "contract",
  "change_order",
  "submittal",
  "rfi",
  "daily_log",
  "photos",
  "invoice",
  "misc",
] as const;

export type GcArtifactCategory = (typeof GC_ARTIFACT_CATEGORIES)[number];

export const GC_ARTIFACT_LABELS: Record<GcArtifactCategory, string> = {
  plans: "Plans",
  specs: "Specifications",
  coi: "Certificate of Insurance",
  contract: "Contract",
  change_order: "Change Order",
  submittal: "Submittal",
  rfi: "RFI",
  daily_log: "Daily Log",
  photos: "Photos",
  invoice: "Invoice",
  misc: "Other",
};

// Short, human-friendly description per category — used in UI tooltips
// and in Herbie's classification prompt context so the LLM has the
// same definitions the UI does.
export const GC_ARTIFACT_DESCRIPTIONS: Record<GcArtifactCategory, string> = {
  plans: "Architectural or engineering drawings — floor plans, elevations, site plans, details.",
  specs: "Project specifications describing materials, methods, and quality requirements by section.",
  coi: "Certificate of Insurance — proof of GL / auto / workers' comp / umbrella coverage for a vendor or the GC.",
  contract: "Executed agreements — prime contract, subcontracts, amendments, NTPs, executed COs.",
  change_order: "Change order requests and approvals affecting scope, cost, or schedule.",
  submittal: "Product data, samples, and shop drawings submitted for review and approval.",
  rfi: "Requests for Information and their responses.",
  daily_log: "Daily field reports — weather, crew, work completed, deliveries, issues.",
  photos: "Field photos — progress, safety, issues, completed work.",
  invoice: "Vendor invoices, pay applications, and related billing backup.",
  misc: "Anything that does not fit another category — re-categorize when clearer.",
};

export function isGcArtifactCategory(x: string): x is GcArtifactCategory {
  return (GC_ARTIFACT_CATEGORIES as readonly string[]).includes(x);
}

// Default confidence threshold used when classifying into this taxonomy.
// Matches the fact-recording threshold in HERBIE.md — below this, route
// to human review rather than auto-filing.
export const GC_ARTIFACT_CLASSIFY_THRESHOLD = 0.7;
