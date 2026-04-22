import { db } from "../db";
import { opportunityScores, scoreExplanations, scoringModels, fitProfiles, opportunities } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { auditService } from "./audit.service";

export interface ScoringSignal {
  key: string;
  weight: number;
  contribution: number;
  details: Record<string, unknown>;
}

export interface ScoringResult {
  score: number;
  recommendedAction: "ignore" | "watch" | "bid" | "priority_bid";
  signals: ScoringSignal[];
}

export interface FitProfile {
  naicsAllowlist: string[];
  naicsBlocklist: string[];
  geoRules: { states?: string[]; radius?: number };
  bondingLimit: number;
  contractSizeRange: { min: number; max: number };
  setAsidePreferences: string[];
  keywordsInclude: string[];
  keywordsExclude: string[];
}

export class ScoringService {
  async scoreOpportunity(
    tenantId: string,
    opportunityId: string,
    fitProfileId: string,
    scoringModelId: string
  ): Promise<ScoringResult> {
    const [opp] = await db.select()
      .from(opportunities)
      .where(eq(opportunities.id, opportunityId));

    if (!opp) {
      throw new Error(`Opportunity ${opportunityId} not found`);
    }

    const [profile] = await db.select()
      .from(fitProfiles)
      .where(eq(fitProfiles.id, fitProfileId));

    const [model] = await db.select()
      .from(scoringModels)
      .where(eq(scoringModels.id, scoringModelId));

    if (!profile || !model) {
      throw new Error("Fit profile or scoring model not found");
    }

    const fitConfig = profile.profileJson as unknown as FitProfile;
    const weights = model.weightsJson as Record<string, number>;
    
    const signals: ScoringSignal[] = [];
    let totalScore = 0;

    const naicsMatch = this.scoreNaicsMatch(opp, fitConfig, weights.naics || 25);
    signals.push(naicsMatch);
    totalScore += naicsMatch.contribution;

    const geoMatch = this.scoreGeoMatch(opp, fitConfig, weights.geo || 20);
    signals.push(geoMatch);
    totalScore += geoMatch.contribution;

    const keywordMatch = this.scoreKeywords(opp, fitConfig, weights.keywords || 20);
    signals.push(keywordMatch);
    totalScore += keywordMatch.contribution;

    const sizeMatch = this.scoreSizeMatch(opp, fitConfig, weights.size || 15);
    signals.push(sizeMatch);
    totalScore += sizeMatch.contribution;

    const setAsideMatch = this.scoreSetAside(opp, fitConfig, weights.setAside || 10);
    signals.push(setAsideMatch);
    totalScore += setAsideMatch.contribution;

    const deadlineScore = this.scoreDeadline(opp, weights.deadline || 10);
    signals.push(deadlineScore);
    totalScore += deadlineScore.contribution;

    const normalizedScore = Math.min(100, Math.max(0, totalScore));
    const recommendedAction = this.determineAction(normalizedScore);

    const [scoreRecord] = await db.insert(opportunityScores).values({
      tenantId,
      opportunityId,
      fitProfileId,
      scoringModelId,
      score: normalizedScore,
      recommendedAction,
    }).returning({ id: opportunityScores.id });

    for (const signal of signals) {
      await db.insert(scoreExplanations).values({
        tenantId,
        opportunityScoreId: scoreRecord.id,
        signalKey: signal.key,
        weight: signal.weight.toString(),
        contribution: signal.contribution.toString(),
        detailsJson: signal.details,
      });
    }

    await auditService.logEvent({
      tenantId,
      eventType: "opportunity_scored",
      actor: "system",
      entityType: "opportunity",
      entityId: opportunityId,
      afterJson: {
        score: normalizedScore,
        recommendedAction,
        signals: signals.map(s => ({ key: s.key, contribution: s.contribution })),
      },
    });

    return {
      score: normalizedScore,
      recommendedAction,
      signals,
    };
  }

  private scoreNaicsMatch(opp: any, profile: FitProfile, maxWeight: number): ScoringSignal {
    const oppNaics = (opp.naicsCodes as string[]) || [];
    const allowlist = profile.naicsAllowlist || [];
    const blocklist = profile.naicsBlocklist || [];

    if (oppNaics.some(code => blocklist.includes(code))) {
      return { key: "naics", weight: maxWeight, contribution: 0, details: { match: false, blocked: true } };
    }

    const matches = oppNaics.filter(code => allowlist.includes(code));
    const contribution = matches.length > 0 ? maxWeight : maxWeight * 0.3;
    
    return { key: "naics", weight: maxWeight, contribution, details: { matchedCodes: matches } };
  }

  private scoreGeoMatch(opp: any, profile: FitProfile, maxWeight: number): ScoringSignal {
    const preferredStates = profile.geoRules?.states || [];
    if (preferredStates.length === 0) {
      return { key: "geo", weight: maxWeight, contribution: maxWeight, details: { noPreference: true } };
    }

    const oppLocation = opp.locationState;
    const match = preferredStates.includes(oppLocation);
    
    return {
      key: "geo",
      weight: maxWeight,
      contribution: match ? maxWeight : maxWeight * 0.2,
      details: { oppLocation, preferredStates, match },
    };
  }

  private scoreKeywords(opp: any, profile: FitProfile, maxWeight: number): ScoringSignal {
    const title = (opp.title || "").toLowerCase();
    const synopsis = (opp.synopsis || "").toLowerCase();
    const text = `${title} ${synopsis}`;

    const includeWords = profile.keywordsInclude || [];
    const excludeWords = profile.keywordsExclude || [];

    const hasExcluded = excludeWords.some(word => text.includes(word.toLowerCase()));
    if (hasExcluded) {
      return { key: "keywords", weight: maxWeight, contribution: 0, details: { excluded: true } };
    }

    const matchedInclude = includeWords.filter(word => text.includes(word.toLowerCase()));
    const matchRatio = includeWords.length > 0 ? matchedInclude.length / includeWords.length : 1;
    
    return {
      key: "keywords",
      weight: maxWeight,
      contribution: maxWeight * matchRatio,
      details: { matchedInclude },
    };
  }

  private scoreSizeMatch(opp: any, profile: FitProfile, maxWeight: number): ScoringSignal {
    const estimatedValue = opp.estimatedValue || 0;
    const range = profile.contractSizeRange || { min: 0, max: Infinity };

    if (estimatedValue >= range.min && estimatedValue <= range.max) {
      return { key: "size", weight: maxWeight, contribution: maxWeight, details: { inRange: true, estimatedValue } };
    }
    
    return { key: "size", weight: maxWeight, contribution: maxWeight * 0.3, details: { inRange: false, estimatedValue } };
  }

  private scoreSetAside(opp: any, profile: FitProfile, maxWeight: number): ScoringSignal {
    const setAside = opp.setAsideCode;
    const preferences = profile.setAsidePreferences || [];

    if (preferences.length === 0 || preferences.includes(setAside)) {
      return { key: "setAside", weight: maxWeight, contribution: maxWeight, details: { match: true, setAside } };
    }
    
    return { key: "setAside", weight: maxWeight, contribution: maxWeight * 0.5, details: { match: false, setAside } };
  }

  private scoreDeadline(opp: any, maxWeight: number): ScoringSignal {
    const dueAt = opp.responseDueAt ? new Date(opp.responseDueAt) : null;
    if (!dueAt) {
      return { key: "deadline", weight: maxWeight, contribution: maxWeight * 0.5, details: { noDeadline: true } };
    }

    const daysRemaining = Math.ceil((dueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    if (daysRemaining < 3) {
      return { key: "deadline", weight: maxWeight, contribution: maxWeight * 0.3, details: { daysRemaining, tooSoon: true } };
    }
    if (daysRemaining > 30) {
      return { key: "deadline", weight: maxWeight, contribution: maxWeight, details: { daysRemaining, ample: true } };
    }
    
    return { key: "deadline", weight: maxWeight, contribution: maxWeight * 0.7, details: { daysRemaining } };
  }

  private determineAction(score: number): "ignore" | "watch" | "bid" | "priority_bid" {
    if (score >= 85) return "priority_bid";
    if (score >= 70) return "bid";
    if (score >= 50) return "watch";
    return "ignore";
  }

  async getScoreHistory(tenantId: string, opportunityId: string) {
    return db.select()
      .from(opportunityScores)
      .where(and(
        eq(opportunityScores.tenantId, tenantId),
        eq(opportunityScores.opportunityId, opportunityId)
      ))
      .orderBy(desc(opportunityScores.createdAt));
  }

  async getActiveProfiles(tenantId: string) {
    return db.select()
      .from(fitProfiles)
      .where(and(
        eq(fitProfiles.tenantId, tenantId),
        eq(fitProfiles.enabled, true)
      ));
  }

  async getActiveModels(tenantId: string) {
    return db.select()
      .from(scoringModels)
      .where(and(
        eq(scoringModels.tenantId, tenantId),
        eq(scoringModels.active, true)
      ));
  }
}

export const scoringService = new ScoringService();
