import { db } from "../db";
import { 
  opportunities, 
  complianceRequirements, 
  companyCertifications,
  agentActivities
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

const COMMON_FAR_CLAUSES = [
  { number: "FAR 52.204-7", title: "System for Award Management", type: "FAR", mandatory: true },
  { number: "FAR 52.212-1", title: "Instructions to Offerors—Commercial Products", type: "FAR", mandatory: true },
  { number: "FAR 52.212-3", title: "Offeror Representations and Certifications", type: "FAR", mandatory: true },
  { number: "FAR 52.219-1", title: "Small Business Program Representations", type: "FAR", mandatory: false },
  { number: "FAR 52.219-27", title: "Notice of Service-Disabled Veteran-Owned Small Business Set-Aside", type: "FAR", mandatory: false },
  { number: "FAR 52.222-3", title: "Convict Labor", type: "FAR", mandatory: true },
  { number: "FAR 52.222-21", title: "Prohibition of Segregated Facilities", type: "FAR", mandatory: true },
  { number: "FAR 52.222-26", title: "Equal Opportunity", type: "FAR", mandatory: true },
  { number: "FAR 52.222-36", title: "Equal Opportunity for Workers with Disabilities", type: "FAR", mandatory: true },
  { number: "FAR 52.223-6", title: "Drug-Free Workplace", type: "FAR", mandatory: true },
  { number: "FAR 52.225-1", title: "Buy American-Supplies", type: "FAR", mandatory: false },
  { number: "FAR 52.232-33", title: "Payment by Electronic Funds Transfer", type: "FAR", mandatory: true },
];

const DFARS_CLAUSES = [
  { number: "DFARS 252.204-7012", title: "Safeguarding Covered Defense Information", type: "DFARS", mandatory: false },
  { number: "DFARS 252.225-7001", title: "Buy American and Balance of Payments Program", type: "DFARS", mandatory: false },
  { number: "DFARS 252.225-7012", title: "Preference for Certain Domestic Commodities", type: "DFARS", mandatory: false },
  { number: "DFARS 252.232-7003", title: "Electronic Submission of Payment Requests", type: "DFARS", mandatory: false },
  { number: "DFARS 252.247-7023", title: "Transportation of Supplies by Sea", type: "DFARS", mandatory: false },
];

export interface ComplianceCheckResult {
  opportunityId: string;
  totalClauses: number;
  compliantClauses: number;
  gapClauses: number;
  inProgressClauses: number;
  overallReadiness: number;
  gaps: Array<{
    clauseNumber: string;
    clauseTitle: string;
    gapDescription: string;
    remediationSteps: string;
    priority: "high" | "medium" | "low";
  }>;
  recommendations: string[];
}

export class LegalOpsAgent {
  private tenantId: string;

  constructor(tenantId: string = DEFAULT_TENANT_ID) {
    this.tenantId = tenantId;
  }

  async analyzeOpportunityCompliance(opportunityId: string): Promise<ComplianceCheckResult> {
    const startTime = Date.now();

    try {
      const [opp] = await db.select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1);

      if (!opp) {
        throw new Error(`Opportunity ${opportunityId} not found`);
      }

      const applicableClauses = await this.identifyApplicableClauses(opp);
      const companyCerts = await this.getCompanyCertifications();
      const gaps: ComplianceCheckResult["gaps"] = [];
      let compliantCount = 0;

      for (const clause of applicableClauses) {
        const status = await this.checkClauseCompliance(clause, companyCerts, opp);
        
        await db.insert(complianceRequirements).values({
          tenantId: this.tenantId,
          opportunityId,
          clauseNumber: clause.number,
          clauseTitle: clause.title,
          clauseType: clause.type,
          isMandatory: clause.mandatory,
          companyStatus: status.status,
          gapDescription: status.gapDescription,
          remediationSteps: status.remediationSteps,
        }).onConflictDoNothing();

        if (status.status === "compliant") {
          compliantCount++;
        } else if (status.status === "gap") {
          gaps.push({
            clauseNumber: clause.number,
            clauseTitle: clause.title,
            gapDescription: status.gapDescription || "Compliance verification needed",
            remediationSteps: status.remediationSteps || "Review and document compliance",
            priority: clause.mandatory ? "high" : "medium",
          });
        }
      }

      const overallReadiness = Math.round((compliantCount / applicableClauses.length) * 100);
      const recommendations = await this.generateRecommendations(opp, gaps);

      const result: ComplianceCheckResult = {
        opportunityId,
        totalClauses: applicableClauses.length,
        compliantClauses: compliantCount,
        gapClauses: gaps.length,
        inProgressClauses: applicableClauses.length - compliantCount - gaps.length,
        overallReadiness,
        gaps,
        recommendations,
      };

      await this.logActivity("compliance_check", "opportunity", opportunityId, {
        totalClauses: applicableClauses.length,
        compliantClauses: compliantCount,
        gapClauses: gaps.length,
        overallReadiness,
      }, "success", Date.now() - startTime);

      return result;
    } catch (error) {
      await this.logActivity("compliance_check", "opportunity", opportunityId, {
        error: (error as Error).message,
      }, "error", Date.now() - startTime);
      throw error;
    }
  }

  private async identifyApplicableClauses(opp: typeof opportunities.$inferSelect) {
    const clauses = [...COMMON_FAR_CLAUSES];
    
    const locationJson = opp.locationJson as { agency?: string } | null;
    const agencyName = locationJson?.agency?.toLowerCase() || "";
    if (agencyName.includes("defense") || 
        agencyName.includes("dod") ||
        agencyName.includes("army") ||
        agencyName.includes("navy") ||
        agencyName.includes("air force")) {
      clauses.push(...DFARS_CLAUSES);
    }

    const setAside = opp.setAside?.toUpperCase() || "";
    if (setAside.includes("SDVOSB")) {
      clauses.push({
        number: "FAR 52.219-27",
        title: "Notice of SDVOSB Set-Aside",
        type: "FAR",
        mandatory: true,
      });
    }

    if (setAside.includes("8A")) {
      clauses.push({
        number: "FAR 52.219-11",
        title: "Special 8(a) Contract Conditions",
        type: "FAR",
        mandatory: true,
      });
    }

    return clauses;
  }

  private async getCompanyCertifications() {
    return await db.select()
      .from(companyCertifications)
      .where(and(
        eq(companyCertifications.tenantId, this.tenantId),
        eq(companyCertifications.status, "active")
      ));
  }

  private async checkClauseCompliance(
    clause: { number: string; title: string; type: string; mandatory: boolean },
    companyCerts: typeof companyCertifications.$inferSelect[],
    opp: typeof opportunities.$inferSelect
  ): Promise<{ status: string; gapDescription?: string; remediationSteps?: string }> {
    if (clause.number === "FAR 52.204-7") {
      return { status: "compliant" };
    }

    if (clause.number === "FAR 52.212-3") {
      return { status: "compliant" };
    }

    if (clause.number.includes("52.219-27") || clause.number.includes("52.219-11")) {
      const hasCert = companyCerts.some(c => 
        c.certificationCode === "SDVOSB" || c.certificationCode === "8A"
      );
      
      if (hasCert) {
        return { status: "compliant" };
      } else {
        return { 
          status: "gap",
          gapDescription: "Required small business certification not on file",
          remediationSteps: "Verify certification status and upload current certificate"
        };
      }
    }

    if (clause.number.includes("252.204-7012")) {
      return {
        status: "in_progress",
        gapDescription: "CMMC/NIST 800-171 compliance assessment needed",
        remediationSteps: "Complete cybersecurity assessment and document compliance"
      };
    }

    if (clause.mandatory) {
      return { status: "compliant" };
    }

    return { status: "compliant" };
  }

  private async generateRecommendations(
    opp: typeof opportunities.$inferSelect,
    gaps: ComplianceCheckResult["gaps"]
  ): Promise<string[]> {
    const recommendations: string[] = [];

    const highPriorityGaps = gaps.filter(g => g.priority === "high");
    if (highPriorityGaps.length > 0) {
      recommendations.push(`Address ${highPriorityGaps.length} high-priority compliance gap(s) before bid submission`);
    }

    if (gaps.some(g => g.clauseNumber.includes("DFARS"))) {
      recommendations.push("Ensure CMMC/NIST 800-171 documentation is current for DoD submission");
    }

    const setAside = opp.setAside?.toUpperCase() || "";
    if (setAside.includes("SDVOSB") || setAside.includes("8A")) {
      recommendations.push("Verify small business certification is current and properly registered in SAM.gov");
    }

    if (recommendations.length === 0) {
      recommendations.push("All major compliance requirements appear to be met");
    }

    return recommendations;
  }

  async parseDocumentForClauses(documentText: string): Promise<Array<{ number: string; title: string; type: string }>> {
    const prompt = `Extract all FAR and DFARS clause references from this solicitation text. Return as JSON array with format: [{"number": "FAR 52.XXX-XX", "title": "Clause Title", "type": "FAR or DFARS"}]

Document excerpt:
${documentText.substring(0, 4000)}

Return only the JSON array, no other text.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      return parsed.clauses || [];
    } catch (error) {
      console.error("[LegalOps] Clause parsing failed:", error);
      return [];
    }
  }

  async getComplianceStatus(opportunityId: string): Promise<ComplianceCheckResult | null> {
    const requirements = await db.select()
      .from(complianceRequirements)
      .where(and(
        eq(complianceRequirements.tenantId, this.tenantId),
        eq(complianceRequirements.opportunityId, opportunityId)
      ));

    if (requirements.length === 0) return null;

    const compliantCount = requirements.filter(r => r.companyStatus === "compliant").length;
    const gapCount = requirements.filter(r => r.companyStatus === "gap").length;
    const inProgressCount = requirements.filter(r => r.companyStatus === "in_progress").length;

    const gaps = requirements
      .filter(r => r.companyStatus === "gap")
      .map(r => ({
        clauseNumber: r.clauseNumber,
        clauseTitle: r.clauseTitle || "",
        gapDescription: r.gapDescription || "",
        remediationSteps: r.remediationSteps || "",
        priority: r.isMandatory ? "high" as const : "medium" as const,
      }));

    return {
      opportunityId,
      totalClauses: requirements.length,
      compliantClauses: compliantCount,
      gapClauses: gapCount,
      inProgressClauses: inProgressCount,
      overallReadiness: Math.round((compliantCount / requirements.length) * 100),
      gaps,
      recommendations: [],
    };
  }

  private async logActivity(
    actionType: string,
    entityType: string,
    entityId: string,
    outputJson: Record<string, unknown>,
    status: "success" | "error" | "pending",
    durationMs: number
  ): Promise<void> {
    await db.insert(agentActivities).values({
      tenantId: this.tenantId,
      agentName: "legalops",
      actionType,
      entityType,
      entityId,
      outputJson,
      status,
      durationMs,
    });
  }
}

export const legalOpsAgent = new LegalOpsAgent();
