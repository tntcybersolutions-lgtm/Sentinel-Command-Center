import { db } from "../db";
import { artifactTemplates, bidJacketChecklistTemplates } from "@shared/schema";
import { sql } from "drizzle-orm";

const ARTIFACT_TEMPLATE_SEEDS = [
  { code: "SAM_SOLICITATION", title: "SAM Solicitation / Notice", category: "SAM", phase: "Capture", required: true, defaultFormat: "pdf", promptMd: "Download the official solicitation document from SAM.gov." },
  { code: "SAM_ATTACHMENTS_PACKAGE", title: "SAM Attachments Package (All)", category: "SAM", phase: "Capture", required: true, defaultFormat: "url", promptMd: "Download the full attachments package from SAM.gov resourceLinks." },
  { code: "SAM_PWS_SOW", title: "PWS / SOW", category: "SAM", phase: "Capture", required: true, defaultFormat: "pdf", promptMd: "The Performance Work Statement or Statement of Work defining scope and deliverables." },
  { code: "SAM_DRAWINGS_SPECS", title: "Drawings & Specifications", category: "SAM", phase: "PreBid", required: true, defaultFormat: "pdf", promptMd: "Construction drawings, plans, and technical specifications." },
  { code: "SAM_WAGE_DETERMINATION", title: "Wage Determination (if applicable)", category: "SAM", phase: "PreBid", required: false, defaultFormat: "pdf", promptMd: "Davis-Bacon wage determination applicable to this project." },
  { code: "SAM_QA_QC", title: "QA/QC Requirements", category: "SAM", phase: "PreBid", required: false, defaultFormat: "pdf", promptMd: "Quality Assurance and Quality Control requirements." },
  { code: "SAM_SITE_VISIT", title: "Site Visit Instructions / RSVP", category: "SAM", phase: "PreBid", required: false, defaultFormat: "pdf", promptMd: "Site visit and pre-bid conference details." },
  { code: "SAM_AMENDMENTS", title: "Amendments / Mods (All)", category: "SAM", phase: "PreBid", required: false, defaultFormat: "pdf", promptMd: "Solicitation amendments and modifications." },
  { code: "SAM_QA_QA", title: "Q&A / Questions Log (if posted)", category: "SAM", phase: "PreBid", required: false, defaultFormat: "pdf", promptMd: "Questions and answers log posted by the contracting officer." },
  { code: "SAM_SUBMISSION_RULES", title: "Submission Instructions", category: "SAM", phase: "Submission", required: true, defaultFormat: "pdf", promptMd: "Official submission instructions, portal info, and formatting requirements." },
  { code: "BID_COVER_SHEET", title: "Bid Cover Sheet", category: "Proposal", phase: "Proposal", required: true, defaultFormat: "pdf", promptMd: "Professional cover sheet with company info, project title, solicitation number." },
  { code: "BID_EXEC_SUMMARY", title: "Executive Summary", category: "Proposal", phase: "Proposal", required: false, defaultFormat: "docx", promptMd: "Executive summary highlighting qualifications and approach." },
  { code: "SCOPE_NARRATIVE", title: "Scope Narrative", category: "Proposal", phase: "Proposal", required: true, defaultFormat: "docx", promptMd: "Detailed scope narrative addressing SOW requirements and methodology." },
  { code: "PRICING_SHEET", title: "Pricing Sheet (Master)", category: "Estimating", phase: "Estimate", required: true, defaultFormat: "xlsx", promptMd: "Master pricing sheet with line items, quantities, unit prices, and totals." },
  { code: "BID_FORMS", title: "Bid Forms (Completed)", category: "Proposal", phase: "Submission", required: true, defaultFormat: "pdf", promptMd: "Official bid forms from solicitation, completed with pricing and certifications." },
  { code: "BONDING_LETTER", title: "Bonding Letter / Bid Bond", category: "Compliance", phase: "Submission", required: true, defaultFormat: "pdf", promptMd: "Surety bonding letter confirming capacity for bid, performance, and payment bonds." },
  { code: "INSURANCE_CERTS", title: "Insurance Certificates", category: "Compliance", phase: "Submission", required: true, defaultFormat: "pdf", promptMd: "Certificate of Insurance showing GL, WC, auto, and umbrella coverage." },
  { code: "SAFETY_PACKAGE", title: "Safety Package (EMR/OSHA/Program)", category: "Compliance", phase: "Submission", required: false, defaultFormat: "pdf", promptMd: "Safety program docs including EMR, OSHA logs, and safety manual." },
  { code: "SUB_QUOTES_COMPILATION", title: "Subcontractor Quotes (Compilation)", category: "Subs", phase: "Estimate", required: true, defaultFormat: "pdf", promptMd: "Compiled subcontractor quotations organized by trade division." },
  { code: "POST_AWARD_HANDOFF", title: "Post-Award Handoff Packet", category: "Closeout", phase: "Award", required: false, defaultFormat: "pdf", promptMd: "Handoff packet for transition from pursuit to project execution." },
];

const CHECKLIST_TEMPLATE_SEEDS = [
  // CAPTURE (C01–C15)
  { code: "C01", title: "Identify opportunity and confirm fit (NAICS, scope, location)", phase: "Capture", sortOrder: 1, priority: "p0", requiredArtifactCodes: [] },
  { code: "C02", title: "Confirm bid type (sealed, negotiated, IDIQ, task order)", phase: "Capture", sortOrder: 2, priority: "p1", requiredArtifactCodes: [] },
  { code: "C03", title: "Record SAM notice ID / solicitation number", phase: "Capture", sortOrder: 3, priority: "p0", requiredArtifactCodes: ["SAM_SOLICITATION"] },
  { code: "C04", title: "Download solicitation and verify all sections present", phase: "Capture", sortOrder: 4, priority: "p0", requiredArtifactCodes: ["SAM_SOLICITATION"] },
  { code: "C05", title: "Pull attachments package and store", phase: "Capture", sortOrder: 5, priority: "p0", requiredArtifactCodes: ["SAM_ATTACHMENTS_PACKAGE"] },
  { code: "C06", title: "Confirm bid due date/time/timezone and submission method", phase: "Capture", sortOrder: 6, priority: "p0", requiredArtifactCodes: ["SAM_SUBMISSION_RULES"] },
  { code: "C07", title: "Create bid project / bid jacket in Sentinel", phase: "Capture", sortOrder: 7, priority: "p0", requiredArtifactCodes: [] },
  { code: "C08", title: "Assign pursuit owner and estimator", phase: "Capture", sortOrder: 8, priority: "p1", requiredArtifactCodes: [] },
  { code: "C09", title: "Create internal kickoff meeting and agenda", phase: "Capture", sortOrder: 9, priority: "p1", requiredArtifactCodes: [] },
  { code: "C10", title: "Identify likely subs/trades required", phase: "Capture", sortOrder: 10, priority: "p1", requiredArtifactCodes: [] },
  { code: "C11", title: "Identify site constraints, access, security/badging", phase: "Capture", sortOrder: 11, priority: "p2", requiredArtifactCodes: [] },
  { code: "C12", title: "Identify bonding/insurance requirements", phase: "Capture", sortOrder: 12, priority: "p0", requiredArtifactCodes: ["BONDING_LETTER", "INSURANCE_CERTS"] },
  { code: "C13", title: "Identify wage determination applicability", phase: "Capture", sortOrder: 13, priority: "p1", requiredArtifactCodes: ["SAM_WAGE_DETERMINATION"] },
  { code: "C14", title: "Identify proposal volumes / required forms list", phase: "Capture", sortOrder: 14, priority: "p0", requiredArtifactCodes: ["BID_FORMS"] },
  { code: "C15", title: "Create compliance matrix (what is required vs optional)", phase: "Capture", sortOrder: 15, priority: "p0", requiredArtifactCodes: [] },

  // PREBID (P01–P15)
  { code: "P01", title: "Review drawings/specs completeness", phase: "PreBid", sortOrder: 16, priority: "p0", requiredArtifactCodes: ["SAM_DRAWINGS_SPECS"] },
  { code: "P02", title: "Review PWS/SOW line-by-line and mark clarifications", phase: "PreBid", sortOrder: 17, priority: "p0", requiredArtifactCodes: ["SAM_PWS_SOW"] },
  { code: "P03", title: "Review Q&A and amendments weekly", phase: "PreBid", sortOrder: 18, priority: "p1", requiredArtifactCodes: ["SAM_AMENDMENTS"] },
  { code: "P04", title: "Confirm site visit requirements and RSVP", phase: "PreBid", sortOrder: 19, priority: "p1", requiredArtifactCodes: ["SAM_SITE_VISIT"] },
  { code: "P05", title: "Create bidder questions list (RFIs)", phase: "PreBid", sortOrder: 20, priority: "p1", requiredArtifactCodes: [] },
  { code: "P06", title: "Send bidder questions before deadline", phase: "PreBid", sortOrder: 21, priority: "p0", requiredArtifactCodes: [] },
  { code: "P07", title: "Update compliance matrix based on amendments", phase: "PreBid", sortOrder: 22, priority: "p0", requiredArtifactCodes: [] },
  { code: "P08", title: "Determine required alternates/options", phase: "PreBid", sortOrder: 23, priority: "p1", requiredArtifactCodes: [] },
  { code: "P09", title: "Identify subcontractor scope packages", phase: "PreBid", sortOrder: 24, priority: "p1", requiredArtifactCodes: [] },
  { code: "P10", title: "Issue bid requests to subs", phase: "PreBid", sortOrder: 25, priority: "p1", requiredArtifactCodes: [] },
  { code: "P11", title: "Setup document control folder structure (plans/specs/addenda)", phase: "PreBid", sortOrder: 26, priority: "p1", requiredArtifactCodes: [] },
  { code: "P12", title: "Confirm submission formatting (pdf sizes, naming, portal rules)", phase: "PreBid", sortOrder: 27, priority: "p0", requiredArtifactCodes: ["SAM_SUBMISSION_RULES"] },
  { code: "P13", title: "Confirm bid bond amount and form", phase: "PreBid", sortOrder: 28, priority: "p0", requiredArtifactCodes: ["BONDING_LETTER"] },
  { code: "P14", title: "Confirm insurance limits and special endorsements", phase: "PreBid", sortOrder: 29, priority: "p0", requiredArtifactCodes: ["INSURANCE_CERTS"] },
  { code: "P15", title: "Build initial schedule assumptions and constraints", phase: "PreBid", sortOrder: 30, priority: "p2", requiredArtifactCodes: [] },

  // SITE VISIT (S01–S10)
  { code: "S01", title: "Attend site visit / prebid meeting", phase: "SiteVisit", sortOrder: 31, priority: "p1", requiredArtifactCodes: [] },
  { code: "S02", title: "Record attendance, notes, and photos", phase: "SiteVisit", sortOrder: 32, priority: "p1", requiredArtifactCodes: [] },
  { code: "S03", title: "Confirm existing conditions and access routes", phase: "SiteVisit", sortOrder: 33, priority: "p1", requiredArtifactCodes: [] },
  { code: "S04", title: "Verify utilities tie-in locations and constraints", phase: "SiteVisit", sortOrder: 34, priority: "p2", requiredArtifactCodes: [] },
  { code: "S05", title: "Verify staging areas and laydown", phase: "SiteVisit", sortOrder: 35, priority: "p2", requiredArtifactCodes: [] },
  { code: "S06", title: "Verify hazardous materials indicators", phase: "SiteVisit", sortOrder: 36, priority: "p1", requiredArtifactCodes: [] },
  { code: "S07", title: "Verify security/badging requirements", phase: "SiteVisit", sortOrder: 37, priority: "p2", requiredArtifactCodes: [] },
  { code: "S08", title: "Confirm working hours and noise restrictions", phase: "SiteVisit", sortOrder: 38, priority: "p2", requiredArtifactCodes: [] },
  { code: "S09", title: "Update takeoff assumptions based on site", phase: "SiteVisit", sortOrder: 39, priority: "p1", requiredArtifactCodes: [] },
  { code: "S10", title: "Log site visit outcomes as internal artifact note", phase: "SiteVisit", sortOrder: 40, priority: "p2", requiredArtifactCodes: [] },

  // TAKEOFF (T01–T15)
  { code: "T01", title: "Setup takeoff items in system (by CSI division)", phase: "Takeoff", sortOrder: 41, priority: "p1", requiredArtifactCodes: [] },
  { code: "T02", title: "Validate drawings revision/addenda set", phase: "Takeoff", sortOrder: 42, priority: "p0", requiredArtifactCodes: ["SAM_DRAWINGS_SPECS"] },
  { code: "T03", title: "Perform quantity takeoff (civil/site)", phase: "Takeoff", sortOrder: 43, priority: "p1", requiredArtifactCodes: [] },
  { code: "T04", title: "Perform quantity takeoff (structural)", phase: "Takeoff", sortOrder: 44, priority: "p1", requiredArtifactCodes: [] },
  { code: "T05", title: "Perform quantity takeoff (architectural)", phase: "Takeoff", sortOrder: 45, priority: "p1", requiredArtifactCodes: [] },
  { code: "T06", title: "Perform quantity takeoff (MEP)", phase: "Takeoff", sortOrder: 46, priority: "p1", requiredArtifactCodes: [] },
  { code: "T07", title: "Perform quantity takeoff (specialties)", phase: "Takeoff", sortOrder: 47, priority: "p2", requiredArtifactCodes: [] },
  { code: "T08", title: "Identify long lead items and procurement risks", phase: "Takeoff", sortOrder: 48, priority: "p1", requiredArtifactCodes: [] },
  { code: "T09", title: "Identify scope gaps / clarifications", phase: "Takeoff", sortOrder: 49, priority: "p1", requiredArtifactCodes: [] },
  { code: "T10", title: "Create allowances list", phase: "Takeoff", sortOrder: 50, priority: "p2", requiredArtifactCodes: [] },
  { code: "T11", title: "Create alternates list", phase: "Takeoff", sortOrder: 51, priority: "p2", requiredArtifactCodes: [] },
  { code: "T12", title: "Verify unit assumptions and waste factors", phase: "Takeoff", sortOrder: 52, priority: "p1", requiredArtifactCodes: [] },
  { code: "T13", title: "Create takeoff summary and internal review", phase: "Takeoff", sortOrder: 53, priority: "p1", requiredArtifactCodes: [] },
  { code: "T14", title: "Export takeoff to estimate/pricing workbook", phase: "Takeoff", sortOrder: 54, priority: "p1", requiredArtifactCodes: ["PRICING_SHEET"] },
  { code: "T15", title: "Lock takeoff baseline and change log", phase: "Takeoff", sortOrder: 55, priority: "p1", requiredArtifactCodes: [] },

  // ESTIMATING (E01–E18)
  { code: "E01", title: "Build estimate WBS/CSI structure", phase: "Estimating", sortOrder: 56, priority: "p1", requiredArtifactCodes: [] },
  { code: "E02", title: "Load labor rates and productivity assumptions", phase: "Estimating", sortOrder: 57, priority: "p1", requiredArtifactCodes: [] },
  { code: "E03", title: "Load equipment costs and rentals", phase: "Estimating", sortOrder: 58, priority: "p2", requiredArtifactCodes: [] },
  { code: "E04", title: "Solicit and receive subcontractor quotes", phase: "Estimating", sortOrder: 59, priority: "p1", requiredArtifactCodes: ["SUB_QUOTES_COMPILATION"] },
  { code: "E05", title: "Normalize subcontractor quotes scope and exclusions", phase: "Estimating", sortOrder: 60, priority: "p1", requiredArtifactCodes: [] },
  { code: "E06", title: "Perform self-perform pricing for key trades", phase: "Estimating", sortOrder: 61, priority: "p1", requiredArtifactCodes: [] },
  { code: "E07", title: "Add GC general conditions and staffing", phase: "Estimating", sortOrder: 62, priority: "p1", requiredArtifactCodes: [] },
  { code: "E08", title: "Add temporary facilities, mobilization, logistics", phase: "Estimating", sortOrder: 63, priority: "p2", requiredArtifactCodes: [] },
  { code: "E09", title: "Add safety, QC, and closeout costs", phase: "Estimating", sortOrder: 64, priority: "p2", requiredArtifactCodes: ["SAFETY_PACKAGE"] },
  { code: "E10", title: "Add permits/fees and testing/inspection", phase: "Estimating", sortOrder: 65, priority: "p2", requiredArtifactCodes: [] },
  { code: "E11", title: "Add contingency and risk allowances", phase: "Estimating", sortOrder: 66, priority: "p1", requiredArtifactCodes: [] },
  { code: "E12", title: "Build schedule-driven cost impacts (phasing, OT)", phase: "Estimating", sortOrder: 67, priority: "p2", requiredArtifactCodes: [] },
  { code: "E13", title: "Validate bonding and insurance cost impacts", phase: "Estimating", sortOrder: 68, priority: "p1", requiredArtifactCodes: ["BONDING_LETTER", "INSURANCE_CERTS"] },
  { code: "E14", title: "Create bid day reconciliation sheet", phase: "Estimating", sortOrder: 69, priority: "p0", requiredArtifactCodes: ["PRICING_SHEET"] },
  { code: "E15", title: "Internal estimate review meeting (estimating + ops)", phase: "Estimating", sortOrder: 70, priority: "p0", requiredArtifactCodes: [] },
  { code: "E16", title: "Executive approval to submit", phase: "Estimating", sortOrder: 71, priority: "p0", requiredArtifactCodes: [] },
  { code: "E17", title: "Finalize pricing sheet for submission", phase: "Estimating", sortOrder: 72, priority: "p0", requiredArtifactCodes: ["PRICING_SHEET"] },
  { code: "E18", title: "Freeze estimate version and archive backup", phase: "Estimating", sortOrder: 73, priority: "p1", requiredArtifactCodes: [] },

  // PROPOSAL (R01–R15)
  { code: "R01", title: "Create proposal outline/volumes per solicitation", phase: "Proposal", sortOrder: 74, priority: "p0", requiredArtifactCodes: [] },
  { code: "R02", title: "Draft cover sheet and company info", phase: "Proposal", sortOrder: 75, priority: "p1", requiredArtifactCodes: ["BID_COVER_SHEET"] },
  { code: "R03", title: "Draft executive summary (project approach)", phase: "Proposal", sortOrder: 76, priority: "p2", requiredArtifactCodes: ["BID_EXEC_SUMMARY"] },
  { code: "R04", title: "Draft scope narrative (methodology + inclusions/exclusions)", phase: "Proposal", sortOrder: 77, priority: "p0", requiredArtifactCodes: ["SCOPE_NARRATIVE"] },
  { code: "R05", title: "Draft schedule narrative and milestones", phase: "Proposal", sortOrder: 78, priority: "p2", requiredArtifactCodes: [] },
  { code: "R06", title: "Draft staffing plan and org chart", phase: "Proposal", sortOrder: 79, priority: "p2", requiredArtifactCodes: [] },
  { code: "R07", title: "Draft safety narrative and attachments", phase: "Proposal", sortOrder: 80, priority: "p2", requiredArtifactCodes: ["SAFETY_PACKAGE"] },
  { code: "R08", title: "Complete forms package (reps/certs)", phase: "Proposal", sortOrder: 81, priority: "p0", requiredArtifactCodes: ["BID_FORMS"] },
  { code: "R09", title: "Compile subcontractor support letters if required", phase: "Proposal", sortOrder: 82, priority: "p2", requiredArtifactCodes: [] },
  { code: "R10", title: "Verify all solicitation instructions satisfied", phase: "Proposal", sortOrder: 83, priority: "p0", requiredArtifactCodes: ["SAM_SUBMISSION_RULES"] },
  { code: "R11", title: "QA review: spelling, naming, formatting, page limits", phase: "Proposal", sortOrder: 84, priority: "p1", requiredArtifactCodes: [] },
  { code: "R12", title: "Compliance review vs matrix (100% check)", phase: "Proposal", sortOrder: 85, priority: "p0", requiredArtifactCodes: [] },
  { code: "R13", title: "Insert final pricing into proposal", phase: "Proposal", sortOrder: 86, priority: "p0", requiredArtifactCodes: ["PRICING_SHEET"] },
  { code: "R14", title: "Convert to final PDFs, validate file size limits", phase: "Proposal", sortOrder: 87, priority: "p0", requiredArtifactCodes: [] },
  { code: "R15", title: "Final executive sign-off to submit", phase: "Proposal", sortOrder: 88, priority: "p0", requiredArtifactCodes: [] },

  // SUBMISSION (U01–U10)
  { code: "U01", title: "Confirm submission portal access/logins", phase: "Submission", sortOrder: 89, priority: "p0", requiredArtifactCodes: [] },
  { code: "U02", title: "Upload test file if allowed / verify portal behavior", phase: "Submission", sortOrder: 90, priority: "p2", requiredArtifactCodes: [] },
  { code: "U03", title: "Submit final package ahead of deadline", phase: "Submission", sortOrder: 91, priority: "p0", requiredArtifactCodes: [] },
  { code: "U04", title: "Save proof of submission / receipt", phase: "Submission", sortOrder: 92, priority: "p0", requiredArtifactCodes: [] },
  { code: "U05", title: "Verify amendments after submission (if allowed)", phase: "Submission", sortOrder: 93, priority: "p1", requiredArtifactCodes: [] },
  { code: "U06", title: "If resubmission needed, repeat compliance pass", phase: "Submission", sortOrder: 94, priority: "p0", requiredArtifactCodes: [] },
  { code: "U07", title: "Update pipeline status and forecast", phase: "Submission", sortOrder: 95, priority: "p1", requiredArtifactCodes: [] },
  { code: "U08", title: "Notify internal team submission complete", phase: "Submission", sortOrder: 96, priority: "p1", requiredArtifactCodes: [] },
  { code: "U09", title: "Create post-submission follow-up schedule", phase: "Submission", sortOrder: 97, priority: "p2", requiredArtifactCodes: [] },
  { code: "U10", title: "Archive final submission bundle", phase: "Submission", sortOrder: 98, priority: "p1", requiredArtifactCodes: [] },

  // AWARD / EXECUTION / CLOSEOUT (A01–A17)
  { code: "A01", title: "If awarded, create award handoff meeting", phase: "Award", sortOrder: 99, priority: "p0", requiredArtifactCodes: ["POST_AWARD_HANDOFF"] },
  { code: "A02", title: "Convert bid jacket artifacts into project documents", phase: "Award", sortOrder: 100, priority: "p1", requiredArtifactCodes: [] },
  { code: "A03", title: "Create project workspace and assign PM", phase: "Award", sortOrder: 101, priority: "p0", requiredArtifactCodes: [] },
  { code: "A04", title: "Setup contract execution checklist (bonding/insurance)", phase: "Award", sortOrder: 102, priority: "p0", requiredArtifactCodes: [] },
  { code: "A05", title: "Setup baseline schedule", phase: "Award", sortOrder: 103, priority: "p1", requiredArtifactCodes: [] },
  { code: "A06", title: "Setup subcontracts and purchase orders workflow", phase: "Execution", sortOrder: 104, priority: "p1", requiredArtifactCodes: [] },
  { code: "A07", title: "Setup RFIs process and log", phase: "Execution", sortOrder: 105, priority: "p1", requiredArtifactCodes: [] },
  { code: "A08", title: "Setup submittals process and log", phase: "Execution", sortOrder: 106, priority: "p1", requiredArtifactCodes: [] },
  { code: "A09", title: "Setup daily logs and timesheets process", phase: "Execution", sortOrder: 107, priority: "p2", requiredArtifactCodes: [] },
  { code: "A10", title: "Setup change order log and budget baseline", phase: "Execution", sortOrder: 108, priority: "p1", requiredArtifactCodes: [] },
  { code: "A11", title: "Setup progress billing schedule and owner invoice cadence", phase: "Execution", sortOrder: 109, priority: "p1", requiredArtifactCodes: [] },
  { code: "A12", title: "Setup closeout binder requirements", phase: "Closeout", sortOrder: 110, priority: "p2", requiredArtifactCodes: [] },
  { code: "A13", title: "Maintain as-builts and O&M collection plan", phase: "Closeout", sortOrder: 111, priority: "p2", requiredArtifactCodes: [] },
  { code: "A14", title: "Substantial completion checklist", phase: "Closeout", sortOrder: 112, priority: "p1", requiredArtifactCodes: [] },
  { code: "A15", title: "Final punchlist completion checklist", phase: "Closeout", sortOrder: 113, priority: "p1", requiredArtifactCodes: [] },
  { code: "A16", title: "Closeout docs delivered and accepted", phase: "Closeout", sortOrder: 114, priority: "p1", requiredArtifactCodes: [] },
  { code: "A17", title: "Final payment and retention release", phase: "Closeout", sortOrder: 115, priority: "p1", requiredArtifactCodes: [] },
];

export async function seedArtifactTemplates(): Promise<number> {
  let count = 0;
  for (const tpl of ARTIFACT_TEMPLATE_SEEDS) {
    await db.insert(artifactTemplates)
      .values(tpl)
      .onConflictDoUpdate({
        target: artifactTemplates.code,
        set: {
          title: tpl.title,
          category: tpl.category,
          phase: tpl.phase,
          required: tpl.required,
          defaultFormat: tpl.defaultFormat,
          promptMd: tpl.promptMd,
          updatedAt: new Date(),
        },
      });
    count++;
  }
  return count;
}

export async function seedChecklistTemplates(): Promise<number> {
  let count = 0;
  for (const item of CHECKLIST_TEMPLATE_SEEDS) {
    await db.insert(bidJacketChecklistTemplates)
      .values(item)
      .onConflictDoUpdate({
        target: bidJacketChecklistTemplates.code,
        set: {
          title: item.title,
          phase: item.phase,
          sortOrder: item.sortOrder,
          priority: item.priority,
          requiredArtifactCodes: item.requiredArtifactCodes,
          updatedAt: new Date(),
        },
      });
    count++;
  }
  return count;
}

export async function runBidJacketSeeds(): Promise<void> {
  try {
    const artifactCount = await seedArtifactTemplates();
    const checklistCount = await seedChecklistTemplates();
    console.log(`[bid-jacket-seeds] Seeded ${artifactCount} artifact templates, ${checklistCount} checklist templates`);
  } catch (error) {
    console.error("[bid-jacket-seeds] Seed error:", error);
  }
}
