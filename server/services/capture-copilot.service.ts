import OpenAI from "openai";
import { db } from "../db";
import { 
  opportunities, capturePlans, captureTasks, outreachDrafts, 
  captureActivityLog, pipelineItems 
} from "@shared/schema";
import { eq, and, sql, desc, lt } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export interface OpportunitySummary {
  executiveSummary: string;
  keyRequirements: string[];
  criticalDates: { label: string; date: string }[];
  competitiveFactors: string[];
  riskAssessment: string;
  recommendedAction: string;
}

export interface CaptureScore {
  overall: number;
  breakdown: {
    naicsMatch: number;
    setAsideMatch: number;
    geographicFit: number;
    valueRange: number;
    timelineFeasibility: number;
    competitivePosition: number;
    pastPerformance: number;
  };
  rationale: string;
  recommendation: "pursue" | "consider" | "pass";
}

export interface GeneratedCapturePlan {
  strategyNarrative: string;
  phases: {
    name: string;
    objectives: string[];
    tasks: { title: string; description: string; dueOffsetDays: number; priority: string }[];
  }[];
  teamingStrategy: string;
  pricingApproach: string;
  winThemes: string[];
  discriminators: string[];
}

export interface OutreachDraft {
  subject: string;
  body: string;
  recipientType: string;
  callToAction: string;
  talkingPoints: string[];
}

export async function summarizeOpportunity(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<OpportunitySummary> {
  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const prompt = `You are an expert federal construction capture manager specializing in military and VA projects for a Service-Disabled Veteran-Owned Small Business (SDVOSB) general contractor based in the Midwest.

Analyze this federal construction opportunity and provide a structured assessment:

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
Sub-Agency: ${locationData.subAgency || "N/A"}
Synopsis: ${o.synopsis || "N/A"}
Description: ${o.description || "N/A"}
NAICS: ${(o.naicsCodes || []).join(", ")}
Set-Aside: ${o.setAside || "Full & Open"}
Estimated Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Place of Performance: ${locationData.placeOfPerformance || "Unknown"}
Response Deadline: ${o.dueAt ? new Date(o.dueAt).toLocaleDateString() : "Unknown"}
Contract Type: ${locationData.contractType || "Unknown"}
Solicitation Number: ${locationData.solicitationNumber || "N/A"}

Provide your response as JSON with these fields:
- executiveSummary: 2-3 sentence summary of the opportunity
- keyRequirements: array of 4-6 key technical requirements extracted from the description
- criticalDates: array of {label, date} for important milestones
- competitiveFactors: array of factors that will determine the winner
- riskAssessment: brief risk assessment paragraph
- recommendedAction: specific recommended next step`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}") as OpportunitySummary;

  await db.insert(captureActivityLog).values({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    actionType: "ai_summary",
    actorType: "system",
    detailsJson: { type: "summarize", model: "gpt-4o-mini" },
  });

  return result;
}

export async function scoreOpportunity(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<CaptureScore> {
  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};
  const blackhawkNaics = ["236220", "238220", "238210", "238290", "236210", "561210", "238160", "238150", "238110"];
  const midwestStates = ["KS", "NE", "MO", "IA", "OK", "CO", "SD", "ND", "MN", "WI"];

  const prompt = `You are a capture scoring engine for a federal construction SDVOSB contractor (BlackHawk Construction, Midwest USA). Score this opportunity 0-100 on each dimension.

COMPANY PROFILE:
- SDVOSB general contractor based in Midwest (NE/KS/MO/IA)
- Core NAICS: ${blackhawkNaics.join(", ")}
- Specialties: Military construction, VA healthcare facilities, HVAC/mechanical, electrical, fire suppression
- Sweet spot: $1M - $15M projects
- Geographic strength: ${midwestStates.join(", ")}
- Past performance: Military barracks, VA clinics, Air Force hangars

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
NAICS: ${(o.naicsCodes || []).join(", ")}
Set-Aside: ${o.setAside || "Full & Open"}
Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Location: ${locationData.placeOfPerformance || "Unknown"}
Deadline: ${o.dueAt ? new Date(o.dueAt).toLocaleDateString() : "Unknown"}
Description: ${(o.description || "").substring(0, 500)}

Score each dimension 0-100:
- naicsMatch: How well do the NAICS codes match the company's capabilities?
- setAsideMatch: Does the set-aside align? (SDVOSB = 100, SB = 70, Full & Open = 40)
- geographicFit: How close is the work to the company's base area?
- valueRange: Is the contract value in the company's sweet spot?
- timelineFeasibility: Is there enough time to prepare a quality proposal?
- competitivePosition: How strong is the company's competitive position?
- pastPerformance: How relevant is the company's past work?

Respond as JSON:
{
  "breakdown": { "naicsMatch": N, "setAsideMatch": N, "geographicFit": N, "valueRange": N, "timelineFeasibility": N, "competitivePosition": N, "pastPerformance": N },
  "rationale": "Brief explanation of scoring",
  "recommendation": "pursue" | "consider" | "pass"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const breakdown = parsed.breakdown || {};
  const weights = { naicsMatch: 0.20, setAsideMatch: 0.15, geographicFit: 0.15, valueRange: 0.10, timelineFeasibility: 0.10, competitivePosition: 0.15, pastPerformance: 0.15 };

  const overall = Math.round(
    (breakdown.naicsMatch || 0) * weights.naicsMatch +
    (breakdown.setAsideMatch || 0) * weights.setAsideMatch +
    (breakdown.geographicFit || 0) * weights.geographicFit +
    (breakdown.valueRange || 0) * weights.valueRange +
    (breakdown.timelineFeasibility || 0) * weights.timelineFeasibility +
    (breakdown.competitivePosition || 0) * weights.competitivePosition +
    (breakdown.pastPerformance || 0) * weights.pastPerformance
  );

  const result: CaptureScore = {
    overall,
    breakdown,
    rationale: parsed.rationale || "",
    recommendation: parsed.recommendation || (overall >= 70 ? "pursue" : overall >= 50 ? "consider" : "pass"),
  };

  await db.insert(captureActivityLog).values({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    actionType: "ai_score",
    actorType: "system",
    detailsJson: { type: "score", overall: result.overall, recommendation: result.recommendation },
  });

  return result;
}

export async function generateCapturePlan(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID): Promise<GeneratedCapturePlan> {
  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};
  const daysUntilDue = o.dueAt ? Math.ceil((new Date(o.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 30;

  const prompt = `You are a senior federal construction capture manager. Create a detailed capture plan for this opportunity.

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Set-Aside: ${o.setAside || "Full & Open"}
Location: ${locationData.placeOfPerformance || "Unknown"}
Deadline: ${o.dueAt ? new Date(o.dueAt).toLocaleDateString() : "Unknown"} (${daysUntilDue} days)
Contract Type: ${locationData.contractType || "Unknown"}
Description: ${(o.description || "").substring(0, 800)}

COMPANY: BlackHawk Construction, SDVOSB general contractor, Midwest USA

Create a capture plan with:
1. strategyNarrative: 2-3 paragraph overall capture strategy
2. phases: Array of capture phases, each with name, objectives, and tasks. Each task has title, description, dueOffsetDays (days from now), and priority (critical/high/medium/low).
3. teamingStrategy: Recommended teaming approach
4. pricingApproach: Pricing strategy recommendation
5. winThemes: 3-5 win themes
6. discriminators: 3-5 competitive discriminators

Respond as JSON.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}") as GeneratedCapturePlan;

  await db.insert(captureActivityLog).values({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    actionType: "ai_capture_plan",
    actorType: "system",
    detailsJson: { type: "capture_plan_generation", model: "gpt-4o-mini" },
  });

  return result;
}

export async function generateOutreachDraft(
  opportunityId: string,
  recipientType: "teaming_partner" | "agency_contact" | "subcontractor" | "mentor_protege",
  tenantId: string = DEFAULT_TENANT_ID
): Promise<OutreachDraft> {
  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const recipientDescriptions: Record<string, string> = {
    teaming_partner: "a potential teaming partner (large business prime or complementary small business) to propose a teaming arrangement",
    agency_contact: "the contracting officer or program manager to request clarification or express interest in the opportunity",
    subcontractor: "a potential subcontractor with specialized capabilities needed for this project",
    mentor_protege: "a mentor firm under an SBA Mentor-Protege agreement to discuss joint venture opportunity",
  };

  const prompt = `You are a business development specialist for a federal construction SDVOSB contractor (BlackHawk Construction). Draft a professional outreach communication.

PURPOSE: Draft an email to ${recipientDescriptions[recipientType]}

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Set-Aside: ${o.setAside || "Full & Open"}
Location: ${locationData.placeOfPerformance || "Unknown"}
Solicitation: ${locationData.solicitationNumber || "N/A"}

Respond as JSON:
{
  "subject": "Email subject line",
  "body": "Full email body (professional, concise, action-oriented)",
  "recipientType": "${recipientType}",
  "callToAction": "Specific next step requested",
  "talkingPoints": ["3-5 key talking points for a follow-up call"]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}") as OutreachDraft;

  await db.insert(captureActivityLog).values({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    actionType: "ai_outreach_draft",
    actorType: "system",
    detailsJson: { type: "outreach_draft", recipientType, model: "gpt-4o-mini" },
  });

  return result;
}

export async function detectStalePursuits(tenantId: string = DEFAULT_TENANT_ID): Promise<{
  stale: { pipelineItemId: string; opportunityTitle: string; stage: string; daysSinceActivity: number; recommendation: string }[];
  total: number;
}> {
  const staleDays = 14;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);

  const staleItems = await db
    .select({
      id: pipelineItems.id,
      stage: pipelineItems.stage,
      lastActivityAt: pipelineItems.lastActivityAt,
      entityId: pipelineItems.entityId,
    })
    .from(pipelineItems)
    .where(
      and(
        eq(pipelineItems.tenantId, tenantId),
        lt(pipelineItems.lastActivityAt, cutoff)
      )
    );

  const results = [];
  for (const item of staleItems) {
    let oppTitle = "Unknown";
    if (item.entityId) {
      const opp = await db.select({ title: opportunities.title }).from(opportunities).where(eq(opportunities.id, item.entityId)).limit(1);
      if (opp.length) oppTitle = opp[0].title;
    }

    const daysSince = Math.floor((Date.now() - new Date(item.lastActivityAt!).getTime()) / (1000 * 60 * 60 * 24));
    let recommendation = "Review and update status";
    if (daysSince > 30) recommendation = "Consider archiving or reassigning";
    else if (daysSince > 21) recommendation = "Escalate - pursuit is at risk of missing deadline";

    results.push({
      pipelineItemId: item.id,
      opportunityTitle: oppTitle,
      stage: item.stage,
      daysSinceActivity: daysSince,
      recommendation,
    });
  }

  return { stale: results, total: results.length };
}
