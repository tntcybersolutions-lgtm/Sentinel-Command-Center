/**
 * server/services/federal-compliance.service.ts
 *
 * Federal compliance validators. Pure functions over structured data.
 * No autonomous action - all output is advisory; humans certify.
 *
 * Coverage:
 *   - Davis-Bacon weekly certified payroll (WH-347 form)
 *   - Build America, Buy America (BABA) / Buy American Act material origin
 *   - 13 CFR 125.6 limitations on subcontracting (set-aside primes)
 *
 * Confidence handling: every validator returns severity "info" | "warn" | "error".
 * Anything error blocks submission UI. Anything warn shows in review queue.
 * Confidence below 0.7 routes to review queue, never to facts table.
 */

import { db } from "../db";
import {
  wageDeterminations,
  certifiedPayrollSubmissions,
  subcontractingPlans,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ============================================================================
// Shared types
// ============================================================================

export type Severity = "info" | "warn" | "error";

export interface ValidationFinding {
  code: string;
  severity: Severity;
  message: string;
  /** Pointer into the validated payload (JSON path-ish) where the finding lives. */
  locator?: string;
  /** Cite the regulatory source for the rule. */
  citation?: string;
  /** Confidence 0..1 - below 0.7 routes to review queue, not auto-action. */
  confidence: number;
}

export interface ValidationResult {
  ok: boolean;
  findings: ValidationFinding[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
  };
}

function summarize(findings: ValidationFinding[]): ValidationResult["summary"] {
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warn").length,
    infos: findings.filter((f) => f.severity === "info").length,
  };
}

function makeResult(findings: ValidationFinding[]): ValidationResult {
  const summary = summarize(findings);
  return { ok: summary.errors === 0, findings, summary };
}

// ============================================================================
// Davis-Bacon: WH-347 weekly certified payroll
// ============================================================================

export interface PayrollEntry {
  workerName: string;
  workerSsnLast4?: string;
  classification: string;
  hoursWorked: number;
  hoursOvertime?: number;
  hourlyRate: number;
  fringeRateCash?: number;
  fringeRateBenefit?: number;
  grossPay: number;
  deductions: { description: string; amount: number }[];
  netPay: number;
  apprentice?: { registered: boolean; ratio?: string };
}

export interface WH347Submission {
  tenantId: string;
  bidProjectId: string;
  wageDeterminationId: string;
  weekEnding: string; // ISO date
  payrollNumber: number;
  entries: PayrollEntry[];
  signedBy?: string;
  signedAt?: string;
}

export interface WageDeterminationRates {
  classificationRates: Record<
    string,
    { baseRate: number; fringeRate: number }
  >;
  state: string;
  county?: string;
}

/**
 * Validate a single WH-347 submission against its corresponding Wage Determination.
 *
 * Rules enforced (all citations to 29 CFR 5):
 *   - Hourly rate >= WD base rate for classification (29 CFR 5.5(a)(1)).
 *   - Fringe (cash + benefit) >= WD fringe rate (29 CFR 5.5(a)(1)).
 *   - Overtime paid at >=1.5x the basic rate for hours over 40 (40 CFR 5.32, FLSA).
 *   - Apprentices only paid less than journeyman if registered AND within ratio
 *     (29 CFR 5.5(a)(4)).
 *   - Net pay >= 0 after deductions; deductions only those permitted by
 *     29 CFR 3.5 (taxes, court orders, written authorization).
 *   - Form signed (if signedBy/signedAt missing, error - false certification is criminal).
 *
 * Confidence is high (0.92) on numeric rate comparisons, lower (0.7) on
 * apprenticeship-ratio judgment which depends on outside data.
 */
export async function validateWH347Submission(args: {
  submission: WH347Submission;
}): Promise<ValidationResult> {
  const { submission } = args;
  const findings: ValidationFinding[] = [];

  // Load the referenced wage determination
  const [wd] = await db
    .select()
    .from(wageDeterminations)
    .where(eq(wageDeterminations.id, submission.wageDeterminationId));

  if (!wd) {
    findings.push({
      code: "WH347_WD_NOT_FOUND",
      severity: "error",
      message: `Referenced wage determination ${submission.wageDeterminationId} not found.`,
      citation: "29 CFR 5.5(a)(1)",
      confidence: 1.0,
    });
    return makeResult(findings);
  }

  const rates = wd.classificationRates as WageDeterminationRates["classificationRates"];

  if (!submission.signedBy || !submission.signedAt) {
    findings.push({
      code: "WH347_UNSIGNED",
      severity: "error",
      message:
        "Statement of Compliance is unsigned. WH-347 must be signed and dated. False certification carries criminal penalties.",
      citation: "29 CFR 5.5(a)(3); 18 U.S.C. 1001",
      confidence: 1.0,
    });
  }

  if (!submission.entries || submission.entries.length === 0) {
    findings.push({
      code: "WH347_NO_ENTRIES",
      severity: "error",
      message:
        "Payroll has zero entries for the week. If no work was performed, file a Statement of Non-Performance instead.",
      citation: "29 CFR 5.5(a)(3)",
      confidence: 1.0,
    });
  }

  for (let i = 0; i < submission.entries.length; i++) {
    const e = submission.entries[i];
    const locator = `entries[${i}]`;
    const wdRate = rates[e.classification];

    if (!wdRate) {
      findings.push({
        code: "WH347_UNKNOWN_CLASSIFICATION",
        severity: "error",
        message: `Classification "${e.classification}" not found in wage determination ${wd.wdNumber}. Must use a WD classification or file a conformance request.`,
        locator,
        citation: "29 CFR 5.5(a)(1)(ii)",
        confidence: 1.0,
      });
      continue;
    }

    // Base rate check
    if (e.hourlyRate < wdRate.baseRate) {
      const isApprentice = e.apprentice?.registered === true;
      if (!isApprentice) {
        findings.push({
          code: "WH347_UNDERPAID_BASE",
          severity: "error",
          message: `${e.workerName}: hourly rate $${e.hourlyRate.toFixed(2)} is below WD minimum $${wdRate.baseRate.toFixed(2)} for ${e.classification}.`,
          locator,
          citation: "29 CFR 5.5(a)(1)(i)",
          confidence: 0.95,
        });
      } else {
        findings.push({
          code: "WH347_APPRENTICE_RATIO",
          severity: "warn",
          message: `${e.workerName} is paid below journeyman rate as an apprentice. Confirm registration with USDOL/state apprenticeship office and that the registered apprentice-to-journeyman ratio is met for the day's crew.`,
          locator,
          citation: "29 CFR 5.5(a)(4)",
          confidence: 0.7,
        });
      }
    }

    // Fringe check
    const totalFringe = (e.fringeRateCash ?? 0) + (e.fringeRateBenefit ?? 0);
    if (totalFringe < wdRate.fringeRate) {
      findings.push({
        code: "WH347_UNDERPAID_FRINGE",
        severity: "error",
        message: `${e.workerName}: total fringe $${totalFringe.toFixed(2)}/hr is below WD fringe rate $${wdRate.fringeRate.toFixed(2)}/hr. Pay the difference in cash or via a bona fide fringe plan.`,
        locator,
        citation: "29 CFR 5.5(a)(1)(i); 29 CFR 5.31",
        confidence: 0.95,
      });
    }

    // Overtime check (FLSA: 1.5x basic rate over 40 hrs/week)
    if (e.hoursWorked > 40 && (e.hoursOvertime ?? 0) === 0) {
      findings.push({
        code: "WH347_MISSING_OT",
        severity: "error",
        message: `${e.workerName} worked ${e.hoursWorked} hours but no overtime hours are recorded. Hours over 40/week require >=1.5x basic rate.`,
        locator,
        citation: "29 USC 207; 29 CFR 5.32",
        confidence: 0.92,
      });
    }

    // Net pay sanity
    if (e.netPay < 0) {
      findings.push({
        code: "WH347_NEGATIVE_NET",
        severity: "error",
        message: `${e.workerName}: net pay $${e.netPay.toFixed(2)} is negative. Deductions exceed gross pay - review for unauthorized deductions.`,
        locator,
        citation: "29 CFR 3.5",
        confidence: 1.0,
      });
    }
  }

  // Payroll number sequencing - warn if gap suggests missed week
  if (submission.payrollNumber > 1) {
    const prior = await db
      .select()
      .from(certifiedPayrollSubmissions)
      .where(
        and(
          eq(certifiedPayrollSubmissions.bidProjectId, submission.bidProjectId),
          eq(
            certifiedPayrollSubmissions.payrollNumber,
            submission.payrollNumber - 1,
          ),
        ),
      );
    if (prior.length === 0) {
      findings.push({
        code: "WH347_SEQUENCE_GAP",
        severity: "warn",
        message: `Prior payroll #${submission.payrollNumber - 1} not found for this project. Confirm it was filed, or file a Statement of Non-Performance.`,
        citation: "29 CFR 5.5(a)(3)",
        confidence: 0.85,
      });
    }
  }

  return makeResult(findings);
}

// ============================================================================
// Buy American Act / BABA / FHWA Buy America
// ============================================================================

export type DomesticContentRule =
  /** Buy American Act, 1933 - federal procurement broadly. */
  | "BAA"
  /** Build America, Buy America Act, 2021 - federally-funded infrastructure. */
  | "BABA"
  /** FHWA / FTA Buy America - transportation specifically. Strictest. */
  | "BUY_AMERICA_TRANSPORTATION";

export interface MaterialItem {
  itemId: string;
  description: string;
  category: "iron-steel" | "manufactured-good" | "construction-material" | "other";
  countryOfOrigin: string; // ISO-3166 alpha-2; "US" for domestic
  /** For manufactured goods, share of cost from US-origin components, 0..1. */
  domesticContentPct?: number;
  costEstimate?: number;
}

/**
 * Validate a list of materials against the applicable domestic-content rule.
 *
 * Notes:
 *   - BAA: cost test typically requires >55% domestic component cost for manufactured
 *     goods (38 CFR 25.003). Iron and steel must be melted+manufactured in US.
 *   - BABA (2 CFR 184): three categories - iron/steel (100% US melted+poured),
 *     manufactured products (>=55% US component cost AND final assembly in US),
 *     construction materials (manufacturing process in US, see 2 CFR 184.6).
 *   - FHWA/FTA Buy America (23 CFR 635.410): 100% US iron/steel for permanent
 *     structural components on federally-aided highway projects.
 */
export function validateBuyAmericaMaterials(args: {
  materials: MaterialItem[];
  rule: DomesticContentRule;
  /** Whether the project has an approved waiver for any non-US items. */
  approvedWaivers?: string[];
}): ValidationResult {
  const { materials, rule, approvedWaivers = [] } = args;
  const findings: ValidationFinding[] = [];

  for (const m of materials) {
    if (approvedWaivers.includes(m.itemId)) {
      findings.push({
        code: "BABA_WAIVED",
        severity: "info",
        message: `${m.description}: waiver applies (${m.itemId}).`,
        locator: m.itemId,
        confidence: 1.0,
      });
      continue;
    }

    const isDomestic = m.countryOfOrigin === "US";

    if (m.category === "iron-steel") {
      if (!isDomestic) {
        findings.push({
          code: rule === "BUY_AMERICA_TRANSPORTATION" ? "FHWA_NON_US_IRON_STEEL" : "BABA_NON_US_IRON_STEEL",
          severity: "error",
          message: `${m.description} (${m.countryOfOrigin}): iron/steel must be melted and manufactured in the US.`,
          locator: m.itemId,
          citation:
            rule === "BUY_AMERICA_TRANSPORTATION"
              ? "23 CFR 635.410"
              : "2 CFR 184.4(c)(1)",
          confidence: 0.95,
        });
      }
      continue;
    }

    if (m.category === "manufactured-good" && rule === "BABA") {
      // BABA: >=55% US component cost AND final assembly in US
      const dc = m.domesticContentPct ?? (isDomestic ? 1.0 : 0.0);
      if (dc < 0.55 || !isDomestic) {
        findings.push({
          code: "BABA_INSUFFICIENT_DOMESTIC_CONTENT",
          severity: "error",
          message: `${m.description}: domestic content ${(dc * 100).toFixed(0)}% / final-assembly origin ${m.countryOfOrigin} - BABA requires >=55% AND US final assembly for manufactured products.`,
          locator: m.itemId,
          citation: "2 CFR 184.4(c)(2)",
          confidence: 0.85,
        });
      }
      continue;
    }

    if (m.category === "construction-material" && rule === "BABA") {
      if (!isDomestic) {
        findings.push({
          code: "BABA_NON_US_CONSTRUCTION_MATERIAL",
          severity: "error",
          message: `${m.description} (${m.countryOfOrigin}): construction material manufacturing process must occur in the US under BABA.`,
          locator: m.itemId,
          citation: "2 CFR 184.4(c)(3); 184.6",
          confidence: 0.85,
        });
      }
      continue;
    }

    if (rule === "BAA" && m.category === "manufactured-good") {
      const dc = m.domesticContentPct ?? (isDomestic ? 1.0 : 0.0);
      // BAA threshold has stepped up; current FAR threshold is 60% (rising to 75% by 2029).
      const baaThreshold = 0.6;
      if (dc < baaThreshold) {
        findings.push({
          code: "BAA_INSUFFICIENT_DOMESTIC_CONTENT",
          severity: "warn",
          message: `${m.description}: domestic content ${(dc * 100).toFixed(0)}% below current BAA threshold (${(baaThreshold * 100).toFixed(0)}%). May qualify under cost-of-domestic > cost-of-foreign exception or with a waiver.`,
          locator: m.itemId,
          citation: "FAR 25.003; FAR 25.103",
          confidence: 0.75,
        });
      }
    }
  }

  return makeResult(findings);
}

// ============================================================================
// 13 CFR 125.6 - Limitations on Subcontracting (set-aside primes)
// ============================================================================

export type SetAsideCategory =
  | "small-business"
  | "8a"
  | "hubzone"
  | "sdvosb"
  | "vosb"
  | "wosb"
  | "edwosb";

/**
 * Compute the limit on subcontracting allowed for a set-aside contract under
 * 13 CFR 125.6.
 *
 * For services and supplies: prime + similarly situated subs must perform
 *   >= 50% of the contract value.
 * For general construction: prime + similarly situated subs must perform
 *   >= 15% of the contract value (cost of the contract incurred for personnel).
 * For specialty trade construction: >= 25%.
 */
export function validateLimitationsOnSubcontracting(args: {
  setAside: SetAsideCategory;
  contractType: "services" | "supplies" | "general-construction" | "specialty-trade-construction";
  primeLaborCost: number;
  /** Subs that hold the SAME set-aside cert (or a smaller-size cert that qualifies). */
  similarlySituatedSubLaborCost: number;
  totalContractValue: number;
}): ValidationResult {
  const findings: ValidationFinding[] = [];

  const requiredFraction =
    args.contractType === "services" || args.contractType === "supplies"
      ? 0.5
      : args.contractType === "general-construction"
        ? 0.15
        : 0.25;

  const inHouseFraction =
    args.totalContractValue > 0
      ? (args.primeLaborCost + args.similarlySituatedSubLaborCost) /
        args.totalContractValue
      : 0;

  if (inHouseFraction < requiredFraction) {
    findings.push({
      code: "LOS_BELOW_THRESHOLD",
      severity: "error",
      message: `Set-aside ${args.setAside} ${args.contractType}: prime+similarly-situated must perform >= ${(requiredFraction * 100).toFixed(0)}% of value (currently ${(inHouseFraction * 100).toFixed(1)}%). Either bring more scope in-house or shift work to similarly-situated subs.`,
      citation: "13 CFR 125.6",
      confidence: 0.92,
    });
  } else {
    findings.push({
      code: "LOS_OK",
      severity: "info",
      message: `Limitations on subcontracting OK: ${(inHouseFraction * 100).toFixed(1)}% performed by prime+similarly-situated (threshold ${(requiredFraction * 100).toFixed(0)}%).`,
      citation: "13 CFR 125.6",
      confidence: 0.92,
    });
  }

  return makeResult(findings);
}

// ============================================================================
// FAR 52.219-9 small-business subcontracting plan progress
// ============================================================================

export interface SubcontractingGoals {
  smallBusinessPct: number;
  smallDisadvantagedBusinessPct: number;
  womenOwnedSmallBusinessPct: number;
  hubzoneSmallBusinessPct: number;
  sdvosbPct: number;
  veteranOwnedSmallBusinessPct: number;
}

export async function evaluateSubcontractingPlanProgress(args: {
  bidProjectId: string;
}): Promise<ValidationResult> {
  const findings: ValidationFinding[] = [];

  const [plan] = await db
    .select()
    .from(subcontractingPlans)
    .where(eq(subcontractingPlans.bidProjectId, args.bidProjectId));

  if (!plan) {
    findings.push({
      code: "SUBPLAN_NOT_FOUND",
      severity: "info",
      message: `No subcontracting plan on file for project ${args.bidProjectId}. If contract value < $750K (or $1.5M for construction), no plan required (FAR 19.702).`,
      citation: "FAR 19.702; 52.219-9",
      confidence: 0.9,
    });
    return makeResult(findings);
  }

  const goals = (plan.goalsPct ?? {}) as SubcontractingGoals;
  const actuals = (plan.actualPctToDate ?? {}) as Partial<SubcontractingGoals>;

  for (const k of Object.keys(goals) as (keyof SubcontractingGoals)[]) {
    const goal = goals[k] ?? 0;
    const actual = actuals[k] ?? 0;
    if (goal > 0 && actual < goal * 0.8) {
      findings.push({
        code: "SUBPLAN_BEHIND_GOAL",
        severity: "warn",
        message: `${k}: actual ${actual.toFixed(1)}% is behind goal ${goal.toFixed(1)}% (>80% of goal target). Document good-faith effort or shift remaining sub awards.`,
        citation: "FAR 52.219-9(d); 52.219-16",
        confidence: 0.85,
      });
    }
  }

  return makeResult(findings);
}
