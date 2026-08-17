import OpenAI from "openai";
import { lazyOpenAI } from "../lib/lazy-openai";
import { db } from "../db";
import { opportunities, bidProjects, bidArtifacts, subcontractorBids, vendors, bidFormLineItems, projectEstimates, opportunityScores } from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { auditService } from "../services/audit.service";

const openai = lazyOpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

export interface PreconRiskFlag {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  message: string;
  action: string;
}

export interface MarginScenario {
  label: string;
  margin: number;
  bidAmount: number;
  profit: number;
}

export interface SubLevelingResult {
  scope: string;
  bids: Array<{ vendor: string; amount: number; deviation: number }>;
  median: number;
  anomalies: string[];
  recommendation: string;
}

export interface PreconReport {
  opportunityId: string;
  bidProjectId: string | null;
  opportunityTitle: string;
  estimatedValue: number;
  fitScore: number | null;
  bidRecommendation: "pursue" | "consider" | "pass";
  bidRecommendationReason: string;
  riskFlags: PreconRiskFlag[];
  marginScenarios: MarginScenario[];
  subLeveling: SubLevelingResult[];
  scopeGaps: string[];
  valueEngineeringSuggestions: string[];
  narrative: string;
  generatedAt: string;
}

const CSI_CORE_DIVISIONS = [
  "02 - Site Work",
  "03 - Concrete",
  "04 - Masonry",
  "05 - Metals",
  "06 - Wood & Plastics",
  "07 - Thermal & Moisture Protection",
  "08 - Doors & Windows",
  "09 - Finishes",
  "10 - Specialties",
  "15 - Mechanical",
  "16 - Electrical",
  "22 - Plumbing",
  "23 - HVAC",
  "26 - Electrical",
  "31 - Earthwork",
  "32 - Exterior Improvements",
];

function computeMarginScenarios(baseEstimate: number): MarginScenario[] {
  const margins = [0.05, 0.08, 0.10, 0.12, 0.15, 0.20];
  return margins.map(m => {
    const profit = baseEstimate * m;
    return {
      label: `${(m * 100).toFixed(0)}% margin`,
      margin: m,
      bidAmount: Math.round(baseEstimate + profit),
      profit: Math.round(profit),
    };
  });
}

function detectSubAnomalies(bids: Array<{ vendor: string; amount: number }>): { median: number; anomalies: string[] } {
  if (bids.length === 0) return { median: 0, anomalies: [] };
  const sorted = [...bids].sort((a, b) => a.amount - b.amount);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1].amount + sorted[mid].amount) / 2
    : sorted[mid].amount;

  const anomalies: string[] = [];
  for (const bid of bids) {
    const deviation = ((bid.amount - median) / median) * 100;
    if (Math.abs(deviation) > 20) {
      anomalies.push(`${bid.vendor}: $${bid.amount.toLocaleString()} (${deviation > 0 ? "+" : ""}${deviation.toFixed(0)}% from median)`);
    }
  }
  return { median, anomalies };
}

export async function runPreconAnalysis(
  tenantId: string,
  targetId: string
): Promise<PreconReport> {
  const now = new Date();

  const oppRows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.tenantId, tenantId), eq(opportunities.id, targetId)))
    .limit(1);

  let opp = oppRows[0];
  let bidProject: any = null;

  if (!opp) {
    const bpRows = await db
      .select()
      .from(bidProjects)
      .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.id, targetId)))
      .limit(1);
    bidProject = bpRows[0];
    if (bidProject?.opportunityId) {
      const oppRows2 = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, bidProject.opportunityId))
        .limit(1);
      opp = oppRows2[0];
    }
  } else {
    const bpRows = await db
      .select()
      .from(bidProjects)
      .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.opportunityId, opp.id)))
      .limit(1);
    bidProject = bpRows[0];
  }

  if (!opp) {
    return {
      opportunityId: targetId,
      bidProjectId: null,
      opportunityTitle: "Unknown",
      estimatedValue: 0,
      fitScore: null,
      bidRecommendation: "pass",
      bidRecommendationReason: "Opportunity not found in database",
      riskFlags: [{ severity: "critical", category: "data", message: "Opportunity not found", action: "Verify the opportunity ID" }],
      marginScenarios: [],
      subLeveling: [],
      scopeGaps: [],
      valueEngineeringSuggestions: [],
      narrative: "Unable to analyze — opportunity not found.",
      generatedAt: now.toISOString(),
    };
  }

  const estimatedValue = parseFloat(opp.contractValue || "0");

  const scoreRows = await db
    .select()
    .from(opportunityScores)
    .where(eq(opportunityScores.opportunityId, opp.id))
    .orderBy(desc(opportunityScores.createdAt))
    .limit(1);
  const fitScore = scoreRows[0]?.score ?? null;

  let subBids: Array<{ vendor: string; amount: number; scope: string }> = [];
  if (bidProject) {
    const subRows = await db
      .select({
        bidAmount: subcontractorBids.bidAmount,
        scopeDescription: subcontractorBids.scopeDescription,
        vendorName: vendors.companyName,
      })
      .from(subcontractorBids)
      .leftJoin(vendors, eq(subcontractorBids.vendorId, vendors.id))
      .where(eq(subcontractorBids.bidProjectId, bidProject.id));

    subBids = subRows.map(r => ({
      vendor: r.vendorName || "Unknown Sub",
      amount: parseFloat(r.bidAmount || "0"),
      scope: r.scopeDescription || "General",
    }));
  }

  const scopesByScope = new Map<string, Array<{ vendor: string; amount: number }>>();
  for (const bid of subBids) {
    const key = bid.scope;
    if (!scopesByScope.has(key)) scopesByScope.set(key, []);
    scopesByScope.get(key)!.push({ vendor: bid.vendor, amount: bid.amount });
  }

  const subLeveling: SubLevelingResult[] = [];
  for (const [scope, bids] of scopesByScope) {
    const { median, anomalies } = detectSubAnomalies(bids);
    subLeveling.push({
      scope,
      bids: bids.map(b => ({
        vendor: b.vendor,
        amount: b.amount,
        deviation: median > 0 ? Math.round(((b.amount - median) / median) * 100) : 0,
      })),
      median: Math.round(median),
      anomalies,
      recommendation: anomalies.length > 0
        ? `Review anomalous bids — ${anomalies.length} bid(s) deviate >20% from median`
        : `${bids.length} bid(s) received, pricing is consistent`,
    });
  }

  const riskFlags: PreconRiskFlag[] = [];

  if (opp.dueAt) {
    const deadline = new Date(opp.dueAt);
    const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) {
      riskFlags.push({ severity: "critical", category: "deadline", message: `Response deadline passed ${Math.abs(daysUntil)} days ago`, action: "Confirm if late submissions accepted" });
    } else if (daysUntil <= 3) {
      riskFlags.push({ severity: "critical", category: "deadline", message: `Only ${daysUntil} day(s) until deadline`, action: "Prioritize bid completion immediately" });
    } else if (daysUntil <= 7) {
      riskFlags.push({ severity: "high", category: "deadline", message: `${daysUntil} days until deadline`, action: "Ensure all sub quotes and estimates are finalized" });
    }
  }

  if (estimatedValue > 5_000_000) {
    riskFlags.push({ severity: "high", category: "bonding", message: `High-value opportunity ($${(estimatedValue / 1_000_000).toFixed(1)}M) — verify bonding capacity`, action: "Confirm surety can support this bond amount" });
  }

  if (subBids.length === 0 && bidProject) {
    riskFlags.push({ severity: "high", category: "coverage", message: "No subcontractor bids received yet", action: "Send bid invitations to qualified subcontractors" });
  }

  for (const level of subLeveling) {
    if (level.bids.length < 3) {
      riskFlags.push({ severity: "medium", category: "coverage", message: `Only ${level.bids.length} bid(s) for scope: ${level.scope}`, action: "Solicit additional quotes for competitive pricing" });
    }
  }

  if (!bidProject) {
    riskFlags.push({ severity: "medium", category: "process", message: "No bid project created yet", action: "Create a bid project to track pursuit" });
  }

  const naics = opp.naicsCodes || [];
  const scopeGaps: string[] = [];
  if (typeof naics === "object" && Array.isArray(naics)) {
    const constructionNaics = naics.filter((n: string) => n.startsWith("23") || n.startsWith("56"));
    if (constructionNaics.length > 0 && subBids.length > 0) {
      const coveredScopes = new Set(subBids.map(b => b.scope.toLowerCase()));
      for (const div of CSI_CORE_DIVISIONS.slice(0, 8)) {
        const divName = div.split(" - ")[1].toLowerCase();
        if (!coveredScopes.has(divName) && !Array.from(coveredScopes).some(s => s.includes(divName))) {
          scopeGaps.push(`Potential gap: ${div} — no sub coverage identified`);
        }
      }
    }
  }

  const marginScenarios = computeMarginScenarios(estimatedValue > 0 ? estimatedValue : 1_000_000);

  let bidRecommendation: "pursue" | "consider" | "pass" = "consider";
  let bidRecommendationReason = "";

  const compositeScore = fitScore ?? 50;
  if (compositeScore >= 70 && riskFlags.filter(r => r.severity === "critical").length === 0) {
    bidRecommendation = "pursue";
    bidRecommendationReason = `Strong fit score (${compositeScore}/100) with manageable risks`;
  } else if (compositeScore < 40 || riskFlags.filter(r => r.severity === "critical").length >= 2) {
    bidRecommendation = "pass";
    bidRecommendationReason = compositeScore < 40
      ? `Low fit score (${compositeScore}/100) — does not align with company strengths`
      : `Multiple critical risks identified (${riskFlags.filter(r => r.severity === "critical").length} critical flags)`;
  } else {
    bidRecommendationReason = `Moderate fit (${compositeScore}/100) — review risks before committing resources`;
  }

  const vesSuggestions: string[] = [];
  if (estimatedValue > 2_000_000) {
    vesSuggestions.push("Consider phased construction to spread mobilization costs");
    vesSuggestions.push("Evaluate prefabrication options for repetitive elements to reduce field labor");
  }
  if (subBids.length > 0) {
    vesSuggestions.push("Negotiate scope bundling with top-performing subs for volume discounts");
  }
  vesSuggestions.push("Review specification allowances for approved-equal substitutions");

  let narrative = `Preconstruction analysis for "${opp.title || "Untitled"}" ($${estimatedValue.toLocaleString()}). `;
  narrative += `Recommendation: ${bidRecommendation.toUpperCase()}. ${bidRecommendationReason}. `;
  narrative += `${riskFlags.length} risk flag(s) identified. `;
  if (subBids.length > 0) narrative += `${subBids.length} sub bid(s) received across ${subLeveling.length} scope(s). `;
  if (scopeGaps.length > 0) narrative += `${scopeGaps.length} potential scope gap(s) detected. `;

  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 800,
        messages: [{
          role: "system",
          content: "You are a senior construction estimator and preconstruction manager. Write a concise executive narrative (3-5 paragraphs) summarizing the preconstruction analysis. Focus on actionable insights. Use construction industry terminology. Do not invent facts — only reference the data provided."
        }, {
          role: "user",
          content: JSON.stringify({
            opportunity: opp.title,
            value: estimatedValue,
            fitScore,
            recommendation: bidRecommendation,
            riskFlags: riskFlags.map(r => `[${r.severity}] ${r.message}`),
            subBidCount: subBids.length,
            scopeGaps,
            marginRange: `${marginScenarios[0].label} to ${marginScenarios[marginScenarios.length - 1].label}`,
          })
        }],
      });
      narrative = aiResponse.choices[0]?.message?.content || narrative;
    } catch (err) {
      console.error("Precon AI narrative error:", err);
    }
  }

  await auditService.logEvent({
    tenantId,
    eventType: "agent_run",
    actor: "HERBIE_PRECON",
    entityType: "agent_report",
    entityId: opp.id,
    afterJson: { agent: "precon", recommendation: bidRecommendation, riskCount: riskFlags.length, subBidCount: subBids.length },
  });

  return {
    opportunityId: opp.id,
    bidProjectId: bidProject?.id || null,
    opportunityTitle: opp.title || "Untitled",
    estimatedValue,
    fitScore,
    bidRecommendation,
    bidRecommendationReason,
    riskFlags,
    marginScenarios,
    subLeveling,
    scopeGaps,
    valueEngineeringSuggestions: vesSuggestions,
    narrative,
    generatedAt: now.toISOString(),
  };
}
