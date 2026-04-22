import { db } from "../db";
import { 
  opportunities, 
  pwinAnalyses, 
  bidHistory,
  agentActivities,
  companyCertifications
} from "@shared/schema";
import { eq, and, sql, count, avg, desc, inArray } from "drizzle-orm";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

export interface PwinAnalysisResult {
  opportunityId: string;
  pwinPercent: number;
  roiEstimate: number;
  riskScore: number;
  competitionDensity: number;
  bidEffortHours: number;
  bidEffortCost: number;
  recommendedAction: "pursue" | "consider" | "pass";
  aiReasoning: string;
  factors: {
    historicalWinRate: number;
    setAsideAdvantage: number;
    naicsExperience: number;
    agencyRelationship: number;
    competitionLevel: number;
    timelineRisk: number;
    complianceReadiness: number;
    valueAlignment: number;
  };
}

export class CioBotAgent {
  private tenantId: string;

  constructor(tenantId: string = DEFAULT_TENANT_ID) {
    this.tenantId = tenantId;
  }

  async analyzeOpportunity(opportunityId: string): Promise<PwinAnalysisResult> {
    const startTime = Date.now();
    
    try {
      const [opp] = await db.select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1);

      if (!opp) {
        throw new Error(`Opportunity ${opportunityId} not found`);
      }

      const factors = await this.calculatePwinFactors(opp);
      const pwinPercent = this.calculateOverallPwin(factors);
      const roiEstimate = await this.calculateROI(opp, pwinPercent);
      const riskScore = this.calculateRiskScore(opp, factors);
      const { bidEffortHours, bidEffortCost } = this.estimateBidEffort(opp);
      const competitionDensity = await this.estimateCompetition(opp);
      
      const recommendedAction = this.determineAction(pwinPercent, riskScore, roiEstimate);
      const aiReasoning = await this.generateAIReasoning(opp, factors, pwinPercent, recommendedAction);

      const result: PwinAnalysisResult = {
        opportunityId,
        pwinPercent,
        roiEstimate,
        riskScore,
        competitionDensity,
        bidEffortHours,
        bidEffortCost,
        recommendedAction,
        aiReasoning,
        factors,
      };

      await db.insert(pwinAnalyses).values({
        tenantId: this.tenantId,
        opportunityId,
        pwinPercent: pwinPercent.toString(),
        roiEstimate: roiEstimate.toString(),
        riskScore,
        competitionDensity,
        bidEffortHours,
        bidEffortCost: bidEffortCost.toString(),
        recommendedAction,
        aiReasoning,
        analysisJson: factors as unknown as Record<string, unknown>,
      });

      await this.logActivity("pwin_analysis", "opportunity", opportunityId, {
        pwinPercent,
        recommendedAction,
        riskScore,
      }, "success", Date.now() - startTime);

      return result;
    } catch (error) {
      await this.logActivity("pwin_analysis", "opportunity", opportunityId, {
        error: (error as Error).message,
      }, "error", Date.now() - startTime);
      throw error;
    }
  }

  private async calculatePwinFactors(opp: typeof opportunities.$inferSelect): Promise<PwinAnalysisResult["factors"]> {
    const historicalWinRate = await this.getHistoricalWinRate(opp.naicsCodes || []);
    const setAsideAdvantage = this.calculateSetAsideAdvantage(opp.setAside);
    const naicsExperience = await this.getNaicsExperience(opp.naicsCodes || []);
    const agencyRelationship = await this.getAgencyRelationship(opp.buyerId || "");
    const competitionLevel = await this.estimateCompetitionLevel(opp);
    const timelineRisk = this.calculateTimelineRisk(opp.dueAt);
    const complianceReadiness = await this.checkComplianceReadiness(opp);
    const valueAlignment = this.calculateValueAlignment(opp.contractValue);

    return {
      historicalWinRate,
      setAsideAdvantage,
      naicsExperience,
      agencyRelationship,
      competitionLevel,
      timelineRisk,
      complianceReadiness,
      valueAlignment,
    };
  }

  private async getHistoricalWinRate(naicsCodes: string[]): Promise<number> {
    if (naicsCodes.length === 0) return 25;

    const history = await db.select({
      total: count(),
      wins: sql<number>`COUNT(*) FILTER (WHERE outcome = 'win')`,
    })
      .from(bidHistory)
      .where(and(
        eq(bidHistory.tenantId, this.tenantId),
        inArray(bidHistory.naicsCode, naicsCodes)
      ));

    const { total, wins } = history[0] || { total: 0, wins: 0 };
    if (total === 0) return 25;
    return Math.round((wins / total) * 100);
  }

  private calculateSetAsideAdvantage(setAside: string | null): number {
    if (!setAside) return 0;
    
    const setAsideUpper = setAside.toUpperCase();
    
    if (setAsideUpper.includes("SDVOSB")) return 35;
    if (setAsideUpper.includes("8A")) return 30;
    if (setAsideUpper.includes("HUBZONE")) return 28;
    if (setAsideUpper.includes("WOSB") || setAsideUpper.includes("EDWOSB")) return 25;
    if (setAsideUpper.includes("SBA") || setAsideUpper.includes("SMALL")) return 20;
    
    return 0;
  }

  private async getNaicsExperience(naicsCodes: string[]): Promise<number> {
    if (naicsCodes.length === 0) return 20;

    const [result] = await db.select({ count: count() })
      .from(bidHistory)
      .where(and(
        eq(bidHistory.tenantId, this.tenantId),
        eq(bidHistory.outcome, "win"),
        inArray(bidHistory.naicsCode, naicsCodes)
      ));

    const winCount = result?.count || 0;
    
    if (winCount >= 10) return 100;
    if (winCount >= 5) return 80;
    if (winCount >= 3) return 60;
    if (winCount >= 1) return 40;
    return 20;
  }

  private async getAgencyRelationship(agencyName: string): Promise<number> {
    if (!agencyName) return 30;

    const [result] = await db.select({ count: count() })
      .from(bidHistory)
      .where(and(
        eq(bidHistory.tenantId, this.tenantId),
        eq(bidHistory.outcome, "win"),
        sql`LOWER(agency_name) LIKE LOWER(${`%${agencyName}%`})`
      ));

    const priorWins = result?.count || 0;
    
    if (priorWins >= 5) return 100;
    if (priorWins >= 3) return 80;
    if (priorWins >= 1) return 60;
    return 30;
  }

  private async estimateCompetitionLevel(opp: typeof opportunities.$inferSelect): Promise<number> {
    const setAside = opp.setAside?.toUpperCase() || "";
    
    if (setAside.includes("SOLE SOURCE")) return 90;
    if (setAside.includes("SDVOSB") || setAside.includes("8A")) return 70;
    if (setAside.includes("SMALL")) return 50;
    if (!opp.setAside || opp.setAside === "Full and Open Competition") return 30;
    return 40;
  }

  private calculateTimelineRisk(dueAt: Date | null): number {
    if (!dueAt) return 50;
    
    const daysRemaining = Math.floor((new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining >= 30) return 90;
    if (daysRemaining >= 21) return 80;
    if (daysRemaining >= 14) return 60;
    if (daysRemaining >= 7) return 40;
    if (daysRemaining >= 3) return 20;
    return 10;
  }

  private async checkComplianceReadiness(opp: typeof opportunities.$inferSelect): Promise<number> {
    const certs = await db.select()
      .from(companyCertifications)
      .where(and(
        eq(companyCertifications.tenantId, this.tenantId),
        eq(companyCertifications.status, "active")
      ));

    let score = 50;
    
    const setAside = opp.setAside?.toUpperCase() || "";
    
    for (const cert of certs) {
      if (setAside.includes(cert.certificationCode)) {
        score += 30;
        break;
      }
    }
    
    if (certs.length > 0) score += 20;
    
    return Math.min(100, score);
  }

  private calculateValueAlignment(contractValue: string | null): number {
    if (!contractValue) return 50;
    
    const value = parseFloat(contractValue);
    
    if (value >= 1000000 && value <= 10000000) return 100;
    if (value >= 500000 && value < 1000000) return 90;
    if (value >= 100000 && value < 500000) return 70;
    if (value >= 10000000 && value < 50000000) return 60;
    if (value < 100000) return 40;
    return 30;
  }

  private calculateOverallPwin(factors: PwinAnalysisResult["factors"]): number {
    const weights = {
      historicalWinRate: 0.20,
      setAsideAdvantage: 0.20,
      naicsExperience: 0.15,
      agencyRelationship: 0.10,
      competitionLevel: 0.15,
      timelineRisk: 0.05,
      complianceReadiness: 0.10,
      valueAlignment: 0.05,
    };

    let pwin = 0;
    for (const [key, weight] of Object.entries(weights)) {
      pwin += (factors[key as keyof typeof factors] || 0) * weight;
    }

    return Math.round(Math.min(95, Math.max(5, pwin)));
  }

  private async calculateROI(opp: typeof opportunities.$inferSelect, pwin: number): Promise<number> {
    const value = parseFloat(opp.contractValue?.toString() || "0");
    if (value === 0) return 0;

    const { bidEffortCost } = this.estimateBidEffort(opp);
    const expectedProfit = value * 0.10;
    const expectedValue = expectedProfit * (pwin / 100);
    const roi = ((expectedValue - bidEffortCost) / bidEffortCost) * 100;
    
    return Math.round(roi);
  }

  private calculateRiskScore(opp: typeof opportunities.$inferSelect, factors: PwinAnalysisResult["factors"]): number {
    let risk = 5;
    
    if (factors.timelineRisk < 50) risk += 2;
    if (factors.complianceReadiness < 60) risk += 1;
    if (factors.competitionLevel < 40) risk += 1;
    if (factors.naicsExperience < 40) risk += 1;
    
    const value = parseFloat(opp.contractValue?.toString() || "0");
    if (value > 10000000) risk += 2;
    if (value > 50000000) risk += 2;
    
    return Math.min(10, Math.max(1, risk));
  }

  private estimateBidEffort(opp: typeof opportunities.$inferSelect): { bidEffortHours: number; bidEffortCost: number } {
    const value = parseFloat(opp.contractValue?.toString() || "0");
    
    let hours = 40;
    if (value > 100000) hours = 80;
    if (value > 500000) hours = 120;
    if (value > 1000000) hours = 200;
    if (value > 5000000) hours = 400;
    if (value > 10000000) hours = 600;

    const hourlyRate = 125;
    const cost = hours * hourlyRate;

    return { bidEffortHours: hours, bidEffortCost: cost };
  }

  private async estimateCompetition(opp: typeof opportunities.$inferSelect): Promise<number> {
    const setAside = opp.setAside?.toUpperCase() || "";
    
    if (setAside.includes("SOLE SOURCE")) return 1;
    if (setAside.includes("SDVOSB")) return 3;
    if (setAside.includes("8A")) return 4;
    if (setAside.includes("HUBZONE")) return 5;
    if (setAside.includes("SMALL")) return 8;
    if (!opp.setAside || setAside === "FULL AND OPEN") return 15;
    return 10;
  }

  private determineAction(pwin: number, risk: number, roi: number): "pursue" | "consider" | "pass" {
    if (pwin >= 50 && risk <= 6 && roi >= 100) return "pursue";
    if (pwin >= 30 && risk <= 8 && roi >= 50) return "consider";
    return "pass";
  }

  private async generateAIReasoning(
    opp: typeof opportunities.$inferSelect,
    factors: PwinAnalysisResult["factors"],
    pwin: number,
    action: string
  ): Promise<string> {
    const prompt = `Analyze this opportunity for BlackHawk Construction and provide a 2-3 sentence executive summary:

Opportunity: ${opp.title}
Pwin: ${pwin}%
Recommendation: ${action}
Set-Aside: ${opp.setAside || "Full and Open"}
Contract Value: ${opp.contractValue ? `$${Number(opp.contractValue).toLocaleString()}` : "Unknown"}
Key Factors:
- Historical Win Rate Score: ${factors.historicalWinRate}/100
- Set-Aside Advantage: ${factors.setAsideAdvantage}/100
- NAICS Experience: ${factors.naicsExperience}/100
- Agency Relationship: ${factors.agencyRelationship}/100
- Competition Level: ${factors.competitionLevel}/100 (higher = less competition)
- Timeline Risk: ${factors.timelineRisk}/100 (higher = more time)
- Compliance Readiness: ${factors.complianceReadiness}/100

Provide concise reasoning for the ${action} recommendation.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      });

      return completion.choices[0]?.message?.content || `CIO-Bot recommends to ${action} based on ${pwin}% Pwin.`;
    } catch (error) {
      return `CIO-Bot analysis: ${pwin}% probability of win. Recommendation: ${action}. Risk assessment and competitive positioning factored into analysis.`;
    }
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
      agentName: "cio-bot",
      actionType,
      entityType,
      entityId,
      outputJson,
      status,
      durationMs,
    });
  }

  async getLatestAnalysis(opportunityId: string): Promise<PwinAnalysisResult | null> {
    const [analysis] = await db.select()
      .from(pwinAnalyses)
      .where(and(
        eq(pwinAnalyses.tenantId, this.tenantId),
        eq(pwinAnalyses.opportunityId, opportunityId)
      ))
      .orderBy(desc(pwinAnalyses.createdAt))
      .limit(1);

    if (!analysis) return null;

    return {
      opportunityId: analysis.opportunityId,
      pwinPercent: parseFloat(analysis.pwinPercent),
      roiEstimate: parseFloat(analysis.roiEstimate || "0"),
      riskScore: analysis.riskScore || 5,
      competitionDensity: analysis.competitionDensity || 10,
      bidEffortHours: analysis.bidEffortHours || 80,
      bidEffortCost: parseFloat(analysis.bidEffortCost || "10000"),
      recommendedAction: (analysis.recommendedAction as "pursue" | "consider" | "pass") || "consider",
      aiReasoning: analysis.aiReasoning || "",
      factors: (analysis.analysisJson as PwinAnalysisResult["factors"]) || {
        historicalWinRate: 25,
        setAsideAdvantage: 0,
        naicsExperience: 20,
        agencyRelationship: 30,
        competitionLevel: 40,
        timelineRisk: 50,
        complianceReadiness: 50,
        valueAlignment: 50,
      },
    };
  }
}

export const cioBotAgent = new CioBotAgent();
