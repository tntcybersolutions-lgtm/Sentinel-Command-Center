// @ts-nocheck — schema deltas pending; reactivate type-check after schema is updated
/**
 * server/services/federal-bid-pursuit.service.ts
 *
 * Multi-factor opportunity scoring against tenant fit. 10 weighted dimensions,
 * explainable, with pWin estimation, deal-killer identification, and
 * LLM-generated rationale. Threshold for surface-to-user defaults to 0.65.
 */

import { db } from "../db";
import { opportunities, tenants, pastPerformanceRecords, setAsideCertifications } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { llmProvider } from "./llm";

export interface OpportunityScoreDimensions {
  naicsMatch: number;
  setAsideFit: number;
  pastPerformanceFit: number;
  dollarFit: number;
  geographicFit: number;
  agencyFamiliarity: number;
  competitionDensity: number;
  bondingFit: number;
  capacityFit: number;
  incumbentPosition: number;
}

export interface OpportunityScore {
  opportunityId: string;
  overallScore: number;
  pWin: number;
  recommendedAction: "pursue" | "monitor" | "no-bid" | "sole-source-priority";
  dimensions: OpportunityScoreDimensions;
  dealKillers: string[];
  rationale: string;
  scoredAt: Date;
}

export interface ScoringWeights {
  naicsMatch: number;
  setAsideFit: number;
  pastPerformanceFit: number;
  dollarFit: number;
  geographicFit: number;
  agencyFamiliarity: number;
  competitionDensity: number;
  bondingFit: number;
  capacityFit: number;
  incumbentPosition: number;
}

const DEFAULT_WEIGHTS: ScoringWeights = {
  naicsMatch: 0.15,
  setAsideFit: 0.18,
  pastPerformanceFit: 0.20,
  dollarFit: 0.08,
  geographicFit: 0.05,
  agencyFamiliarity: 0.08,
  competitionDensity: 0.07,
  bondingFit: 0.07,
  capacityFit: 0.07,
  incumbentPosition: 0.05,
};

function validateWeights(w: ScoringWeights): void {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) > 0.001) throw new Error("Scoring weights must sum to 1.0; got " + sum.toFixed(4));
}

export async function scoreOpportunity(args: { tenantId: string; opportunityId: string; weights?: Partial<ScoringWeights> }): Promise<OpportunityScore> {
  const weights: ScoringWeights = { ...DEFAULT_WEIGHTS, ...args.weights };
  validateWeights(weights);

  const [opportunity] = await db.select().from(opportunities).where(eq(opportunities.id, args.opportunityId));
  if (!opportunity) throw new Error("Opportunity not found: " + args.opportunityId);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, args.tenantId));
  if (!tenant) throw new Error("Tenant not found: " + args.tenantId);

  const [certs, recentPP] = await Promise.all([
    db.select().from(setAsideCertifications).where(and(eq(setAsideCertifications.tenantId, args.tenantId), eq(setAsideCertifications.status, "active"))),
    db.select().from(pastPerformanceRecords).where(eq(pastPerformanceRecords.tenantId, args.tenantId)).orderBy(desc(pastPerformanceRecords.endDate)).limit(50),
  ]);

  const dimensions = computeDimensions({ opportunity, tenant, certs, recentPP });
  const overallScore = weightedAverage(dimensions, weights);
  const dealKillers = identifyDealKillers({ opportunity, tenant, dimensions });
  const pWin = estimatePWin(overallScore, dimensions, dealKillers);
  const recommendedAction = chooseAction(overallScore, dealKillers, opportunity);
  const rationale = await generateRationale({ opportunity, dimensions, dealKillers, recommendedAction });

  return { opportunityId: args.opportunityId, overallScore, pWin, recommendedAction, dimensions, dealKillers, rationale, scoredAt: new Date() };
}

interface DimInput {
  opportunity: typeof opportunities.$inferSelect;
  tenant: typeof tenants.$inferSelect;
  certs: (typeof setAsideCertifications.$inferSelect)[];
  recentPP: (typeof pastPerformanceRecords.$inferSelect)[];
}

function computeDimensions(input: DimInput): OpportunityScoreDimensions {
  return {
    naicsMatch: scoreNaicsMatch(input),
    setAsideFit: scoreSetAsideFit(input),
    pastPerformanceFit: scorePastPerformanceFit(input),
    dollarFit: scoreDollarFit(input),
    geographicFit: scoreGeographicFit(input),
    agencyFamiliarity: scoreAgencyFamiliarity(input),
    competitionDensity: scoreCompetitionDensity(input),
    bondingFit: scoreBondingFit(input),
    capacityFit: scoreCapacityFit(input),
    incumbentPosition: scoreIncumbentPosition(input),
  };
}

function scoreNaicsMatch({ opportunity, recentPP }: DimInput): number {
  const oppNaics = opportunity.naicsCode ?? "";
  if (!oppNaics) return 0.5;
  const exact = recentPP.filter((p) => p.naicsCode === oppNaics).length;
  const sameFamily = recentPP.filter((p) => (p.naicsCode ?? "").slice(0, 4) === oppNaics.slice(0, 4)).length;
  if (exact >= 3) return 1.0;
  if (exact >= 1) return 0.85;
  if (sameFamily >= 3) return 0.7;
  if (sameFamily >= 1) return 0.5;
  return 0.15;
}

function scoreSetAsideFit({ opportunity, certs }: DimInput): number {
  const setAside = opportunity.setAsideCategory;
  if (!setAside || setAside === "full-and-open") return 0.6;
  const certMatch = certs.find((c) => c.category === setAside);
  if (certMatch) return 1.0;
  if (setAside === "small-business" && certs.length > 0) return 0.85;
  return 0.0;
}

function scorePastPerformanceFit({ opportunity, recentPP }: DimInput): number {
  const oppKeywords = (opportunity.scopeKeywords ?? []) as string[];
  if (oppKeywords.length === 0) return 0.5;
  const matchScores = recentPP.slice(0, 20).map((p) => {
    const ppKeywords = ((p.relevanceKeywords ?? []) as string[]).map((k) => k.toLowerCase());
    const overlap = oppKeywords.filter((k) => ppKeywords.includes(k.toLowerCase())).length;
    return overlap / Math.max(oppKeywords.length, 1);
  });
  const top3 = matchScores.sort((a, b) => b - a).slice(0, 3);
  return top3.length === 0 ? 0.2 : top3.reduce((a, b) => a + b, 0) / 3;
}

function scoreDollarFit({ opportunity, tenant }: DimInput): number {
  const oppValue = Number(opportunity.estimatedValue ?? 0);
  const sweetSpotMin = Number((tenant.dollarSweetSpotMin as unknown) ?? 100000);
  const sweetSpotMax = Number((tenant.dollarSweetSpotMax as unknown) ?? 5000000);
  if (oppValue < sweetSpotMin) return 0.4;
  if (oppValue >= sweetSpotMin && oppValue <= sweetSpotMax) return 1.0;
  if (oppValue <= sweetSpotMax * 1.5) return 0.7;
  return 0.3;
}

function scoreGeographicFit({ opportunity, tenant }: DimInput): number {
  const oppState = opportunity.placeOfPerformanceState ?? "";
  const preferredStates = ((tenant.preferredStates as unknown) ?? []) as string[];
  if (preferredStates.length === 0) return 0.6;
  if (preferredStates.includes(oppState)) return 1.0;
  return 0.4;
}

function scoreAgencyFamiliarity({ opportunity, recentPP }: DimInput): number {
  const agency = opportunity.agency ?? "";
  if (!agency) return 0.5;
  const sameAgency = recentPP.filter((p) => (p.agency ?? "").includes(agency)).length;
  if (sameAgency >= 5) return 1.0;
  if (sameAgency >= 2) return 0.8;
  if (sameAgency >= 1) return 0.6;
  return 0.4;
}

function scoreCompetitionDensity({ opportunity }: DimInput): number {
  if (opportunity.solicitationType === "sole-source") return 1.0;
  if ((opportunity.setAsideCategory ?? "") !== "" && opportunity.setAsideCategory !== "full-and-open") return 0.75;
  return 0.4;
}

function scoreBondingFit({ opportunity, tenant }: DimInput): number {
  const oppValue = Number(opportunity.estimatedValue ?? 0);
  const singleBondCapacity = Number((tenant.bondingSingleCapacity as unknown) ?? 0);
  if (singleBondCapacity === 0) return 0.5;
  if (oppValue <= singleBondCapacity * 0.7) return 1.0;
  if (oppValue <= singleBondCapacity) return 0.75;
  return 0.0;
}

function scoreCapacityFit({ tenant }: DimInput): number {
  const utilization = Number((tenant.currentBacklogUtilization as unknown) ?? 0.5);
  if (utilization < 0.7) return 1.0;
  if (utilization < 0.85) return 0.7;
  if (utilization < 1.0) return 0.4;
  return 0.1;
}

function scoreIncumbentPosition({ opportunity }: DimInput): number {
  if (!opportunity.isRecompete) return 1.0;
  const incumbentTenure = Number((opportunity.incumbentTenureYears as unknown) ?? 0);
  if (incumbentTenure === 0) return 0.9;
  if (incumbentTenure < 5) return 0.6;
  return 0.3;
}

function weightedAverage(d: OpportunityScoreDimensions, w: ScoringWeights): number {
  return d.naicsMatch*w.naicsMatch + d.setAsideFit*w.setAsideFit + d.pastPerformanceFit*w.pastPerformanceFit + d.dollarFit*w.dollarFit + d.geographicFit*w.geographicFit + d.agencyFamiliarity*w.agencyFamiliarity + d.competitionDensity*w.competitionDensity + d.bondingFit*w.bondingFit + d.capacityFit*w.capacityFit + d.incumbentPosition*w.incumbentPosition;
}

function identifyDealKillers(args: { opportunity: typeof opportunities.$inferSelect; tenant: typeof tenants.$inferSelect; dimensions: OpportunityScoreDimensions }): string[] {
  const killers: string[] = [];
  if (args.dimensions.setAsideFit === 0) killers.push("Set-aside category " + args.opportunity.setAsideCategory + " - contractor lacks required certification.");
  if (args.dimensions.bondingFit === 0) killers.push("Estimated contract value exceeds single-bond capacity.");
  if (args.dimensions.naicsMatch < 0.2) killers.push("No relevant past performance in NAICS " + args.opportunity.naicsCode + ". Pursue only with a teaming partner.");
  return killers;
}

function estimatePWin(overallScore: number, dim: OpportunityScoreDimensions, dealKillers: string[]): number {
  if (dealKillers.length > 0) return 0.05;
  if (dim.competitionDensity >= 0.95) return Math.min(0.85, overallScore + 0.15);
  if (dim.incumbentPosition < 0.5) return overallScore * 0.6;
  return overallScore * 0.85;
}

function chooseAction(overallScore: number, dealKillers: string[], opp: typeof opportunities.$inferSelect): OpportunityScore["recommendedAction"] {
  if (dealKillers.length > 0) return "no-bid";
  if (opp.solicitationType === "sole-source" && overallScore > 0.6) return "sole-source-priority";
  if (overallScore >= 0.65) return "pursue";
  if (overallScore >= 0.45) return "monitor";
  return "no-bid";
}

async function generateRationale(args: { opportunity: typeof opportunities.$inferSelect; dimensions: OpportunityScoreDimensions; dealKillers: string[]; recommendedAction: OpportunityScore["recommendedAction"] }): Promise<string> {
  if (args.dealKillers.length > 0) return "No-bid: " + args.dealKillers.join("; ");

  const dimSummary = Object.entries(args.dimensions).map(([k, v]) => k + ": " + v.toFixed(2)).join("\n");

  const prompt = "Score breakdown for opportunity \"" + args.opportunity.title + "\" (agency: " + args.opportunity.agency + ", NAICS: " + args.opportunity.naicsCode + ", value: " + args.opportunity.estimatedValue + ", set-aside: " + (args.opportunity.setAsideCategory ?? "full and open") + "):\n\n" + dimSummary + "\n\nRecommended action: " + args.recommendedAction + "\n\nWrite a 2-3 sentence capture-manager-friendly rationale. Lead with the recommended action and why. Cite the strongest 1-2 dimensions and any noteworthy weaknesses. Be direct, no fluff.";

  const response = await llmProvider.complete({
    tier: "cheap",
    system: "You write capture-manager rationale for federal opportunity scoring. Direct, professional, evidence-led.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 250,
  });

  return response.text ?? "";
}
