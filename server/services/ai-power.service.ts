import OpenAI from "openai";
import { db } from "../db";
import {
  opportunities, entityEmbeddings, partnerRecommendations, partnerShortlist,
  agencyProfiles, competitorPressure, winProbability, pipelineItems,
  aiArtifacts, outreachDrafts, captureActivityLog,
} from "@shared/schema";
import { eq, and, desc, ne, sql, inArray } from "drizzle-orm";
import { persistArtifact } from "./ai-artifact.service";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

async function getOrCreateEmbedding(entityType: string, entityId: string, text: string, tenantId: string): Promise<number[]> {
  const existing = await db.select().from(entityEmbeddings)
    .where(and(
      eq(entityEmbeddings.tenantId, tenantId),
      eq(entityEmbeddings.entityType, entityType),
      eq(entityEmbeddings.entityId, entityId)
    )).limit(1);

  if (existing.length > 0 && existing[0].embeddingVector) {
    return existing[0].embeddingVector as number[];
  }

  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text.substring(0, 8000),
    });
    const vector = response.data[0].embedding;

    if (existing.length > 0) {
      await db.update(entityEmbeddings)
        .set({ embeddingVector: vector as any, embeddingText: text.substring(0, 2000), modelVersion: "text-embedding-3-small" })
        .where(eq(entityEmbeddings.id, existing[0].id));
    } else {
      await db.insert(entityEmbeddings).values({
        tenantId,
        entityType,
        entityId,
        embeddingText: text.substring(0, 2000),
        embeddingVector: vector as any,
        modelVersion: "text-embedding-3-small",
      });
    }
    return vector;
  } catch {
    return [];
  }
}

export async function findSimilarOpportunities(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};
  const embeddingText = `${o.title} ${o.synopsis || ""} ${(o.naicsCodes || []).join(" ")} ${o.setAside || ""} ${locationData.agency || ""} ${locationData.placeOfPerformance || ""}`;

  const sourceVector = await getOrCreateEmbedding("opportunity", opportunityId, embeddingText, tenantId);

  const allOpps = await db.select().from(opportunities)
    .where(and(eq(opportunities.tenantId, tenantId), ne(opportunities.id, opportunityId)))
    .limit(100);

  const similarities: { id: string; title: string; score: number; reasons: string[]; setAside: string | null; agency: string; value: string | null }[] = [];

  for (const other of allOpps) {
    const otherLocation = (other.locationJson as any) || {};
    const otherText = `${other.title} ${other.synopsis || ""} ${(other.naicsCodes || []).join(" ")} ${other.setAside || ""} ${otherLocation.agency || ""} ${otherLocation.placeOfPerformance || ""}`;

    const otherVector = await getOrCreateEmbedding("opportunity", other.id, otherText, tenantId);

    let score = 0;
    const reasons: string[] = [];

    if (sourceVector.length > 0 && otherVector.length > 0) {
      const cosine = cosineSimilarity(sourceVector, otherVector);
      score = Math.round(cosine * 60);
    }

    const naicsOverlap = (o.naicsCodes || []).filter(n => (other.naicsCodes || []).includes(n));
    if (naicsOverlap.length > 0) {
      score += 15;
      reasons.push(`Shared NAICS: ${naicsOverlap.join(", ")}`);
    }

    if (o.setAside && other.setAside && o.setAside === other.setAside) {
      score += 10;
      reasons.push(`Same set-aside: ${o.setAside}`);
    }

    if (locationData.agency && otherLocation.agency && locationData.agency === otherLocation.agency) {
      score += 15;
      reasons.push(`Same agency: ${locationData.agency}`);
    }

    if (score > 20) {
      similarities.push({
        id: other.id,
        title: other.title,
        score: Math.min(score, 100),
        reasons,
        setAside: other.setAside,
        agency: otherLocation.agency || "Unknown",
        value: other.contractValue,
      });
    }
  }

  similarities.sort((a, b) => b.score - a.score);
  const top10 = similarities.slice(0, 10);

  await persistArtifact({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    artifactType: "similarity_analysis",
    payload: { similar: top10, totalCandidates: allOpps.length },
    evidence: { algorithm: "cosine_similarity+rule_matching" },
    confidence: 75,
  });

  return { similar: top10, totalCandidates: allOpps.length };
}

export async function getPartnerSuggestions(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const existing = await db.select().from(partnerRecommendations)
    .where(and(eq(partnerRecommendations.tenantId, tenantId), eq(partnerRecommendations.opportunityId, opportunityId)))
    .orderBy(desc(partnerRecommendations.relevanceScore));

  if (existing.length > 0) {
    const shortlisted = await db.select().from(partnerShortlist)
      .where(and(eq(partnerShortlist.tenantId, tenantId), eq(partnerShortlist.opportunityId, opportunityId)));
    return { recommendations: existing, shortlist: shortlisted };
  }

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const prompt = `You are a federal construction teaming strategist for BlackHawk Construction (SDVOSB, Midwest USA).

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
NAICS: ${(o.naicsCodes || []).join(", ")}
Set-Aside: ${o.setAside || "Full & Open"}
Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Location: ${locationData.placeOfPerformance || "Unknown"}

Suggest 5-8 types of potential teaming partners, including specific company profiles that would complement BlackHawk's capabilities. For each partner, provide the partner type, capabilities, and a relevance score (0-100).

Respond as JSON:
{
  "partners": [
    {
      "partnerName": "Specific company name or profile description",
      "partnerType": "prime_contractor|subcontractor|jv_partner|mentor|specialty_sub",
      "capabilities": ["capability1", "capability2"],
      "relevanceScore": 85,
      "rationale": "Why this partner makes sense"
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || '{"partners":[]}');
  const partners = parsed.partners || [];

  const inserted = [];
  for (const p of partners) {
    const rec = await db.insert(partnerRecommendations).values({
      tenantId,
      opportunityId,
      partnerName: p.partnerName,
      partnerType: p.partnerType,
      capabilities: p.capabilities || [],
      relevanceScore: p.relevanceScore || 50,
      rationale: p.rationale || "",
      aiGenerated: true,
    }).returning();
    inserted.push(rec[0]);
  }

  await persistArtifact({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    artifactType: "partner_suggestions",
    payload: { partners: inserted },
    confidence: 70,
  });

  return { recommendations: inserted, shortlist: [] };
}

export async function addToShortlist(opportunityId: string, partnerName: string, recommendationId?: string, tenantId: string = DEFAULT_TENANT_ID) {
  const inserted = await db.insert(partnerShortlist).values({
    tenantId,
    opportunityId,
    partnerName,
    recommendationId: recommendationId || null,
    status: "shortlisted",
  }).onConflictDoNothing().returning();

  return inserted[0] || { message: "Already shortlisted" };
}

export async function generatePartnerOutreach(opportunityId: string, partnerId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const rec = await db.select().from(partnerRecommendations).where(eq(partnerRecommendations.id, partnerId)).limit(1);
  if (!rec.length) throw new Error("Partner recommendation not found");

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const partner = rec[0];
  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const prompt = `Draft a professional teaming outreach email from BlackHawk Construction (SDVOSB) to ${partner.partnerName} (${partner.partnerType}) regarding:

OPPORTUNITY: ${o.title}
AGENCY: ${locationData.agency || "Unknown"}
VALUE: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
PARTNER CAPABILITIES: ${(partner.capabilities || []).join(", ")}

Respond as JSON: { "subject": "...", "body": "...", "callToAction": "..." }`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const draft = JSON.parse(completion.choices[0]?.message?.content || "{}");

  await persistArtifact({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    artifactType: "partner_outreach",
    payload: { ...draft, partnerName: partner.partnerName, partnerId },
    confidence: 72,
  });

  return draft;
}

export async function getAgencyProfile(agencyNameOrId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const existing = await db.select().from(agencyProfiles)
    .where(and(
      eq(agencyProfiles.tenantId, tenantId),
      eq(agencyProfiles.agencySlug, agencyNameOrId.toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    )).limit(1);

  if (existing.length > 0) return existing[0];

  const agencyOpps = await db.select().from(opportunities)
    .where(eq(opportunities.tenantId, tenantId))
    .limit(200);

  const matchingOpps = agencyOpps.filter(o => {
    const loc = (o.locationJson as any) || {};
    const agency = (loc.agency || "").toLowerCase();
    return agency.includes(agencyNameOrId.toLowerCase()) || agencyNameOrId.toLowerCase().includes(agency);
  });

  const agencyName = agencyNameOrId;
  const naicsCounts: Record<string, number> = {};
  const setAsideCounts: Record<string, number> = {};
  let totalValue = 0;

  for (const o of matchingOpps) {
    for (const n of (o.naicsCodes || [])) { naicsCounts[n] = (naicsCounts[n] || 0) + 1; }
    if (o.setAside) setAsideCounts[o.setAside] = (setAsideCounts[o.setAside] || 0) + 1;
    totalValue += Number(o.contractValue || 0);
  }

  const topNaics = Object.entries(naicsCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
  const slug = agencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const prompt = `Create a buying profile for federal agency "${agencyName}" based on ${matchingOpps.length} opportunities worth $${totalValue.toLocaleString()} total.

Top NAICS: ${topNaics.join(", ")}
Set-asides used: ${Object.entries(setAsideCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}

Respond as JSON:
{
  "summary": "Agency overview paragraph",
  "buyingPatterns": "How this agency typically procures construction",
  "preferredContractTypes": ["types"],
  "averageDealSize": "range",
  "keyPrograms": ["program areas"],
  "recommendations": "How BlackHawk (SDVOSB) should approach this agency"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const profile = JSON.parse(completion.choices[0]?.message?.content || "{}");

  const inserted = await db.insert(agencyProfiles).values({
    tenantId,
    agencyName,
    agencySlug: slug,
    profileJson: profile,
    topNaics,
    topVendors: null,
    spendingTrends: { totalValue, opportunityCount: matchingOpps.length, setAsideCounts },
    aiGenerated: true,
  }).onConflictDoNothing().returning();

  const result = inserted[0] || existing[0] || { agencyName, profileJson: profile, topNaics };

  await persistArtifact({
    tenantId,
    entityType: "agency",
    entityId: slug,
    artifactType: "agency_profile",
    payload: result,
    confidence: 65,
  });

  return result;
}

export async function getCompetitorPressure(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const existing = await db.select().from(competitorPressure)
    .where(and(eq(competitorPressure.tenantId, tenantId), eq(competitorPressure.opportunityId, opportunityId)))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const prompt = `Analyze competitive pressure for this federal construction opportunity from BlackHawk Construction's perspective (SDVOSB, Midwest):

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
NAICS: ${(o.naicsCodes || []).join(", ")}
Set-Aside: ${o.setAside || "Full & Open"}
Value: $${o.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Location: ${locationData.placeOfPerformance || "Unknown"}

Respond as JSON:
{
  "pressureLevel": "low|medium|high|critical",
  "pressureScore": 0-100,
  "competitorCount": estimated number of likely bidders,
  "topCompetitors": [{"name": "...", "threat": "low|medium|high", "strengths": ["..."]}],
  "analysis": "Competitive landscape analysis paragraph",
  "rationale": "Why this pressure level"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");

  const inserted = await db.insert(competitorPressure).values({
    tenantId,
    opportunityId,
    pressureLevel: parsed.pressureLevel || "medium",
    pressureScore: parsed.pressureScore || 50,
    competitorCount: parsed.competitorCount || 0,
    topCompetitors: parsed.topCompetitors || [],
    analysisJson: { analysis: parsed.analysis },
    rationale: parsed.rationale || "",
    aiGenerated: true,
  }).onConflictDoNothing().returning();

  const result = inserted[0] || { ...parsed, opportunityId };

  await persistArtifact({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    artifactType: "competitor_pressure",
    payload: result,
    confidence: 68,
  });

  return result;
}

export async function optimizePursuit(pipelineItemId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const item = await db.select().from(pipelineItems)
    .where(and(eq(pipelineItems.id, pipelineItemId), eq(pipelineItems.tenantId, tenantId)))
    .limit(1);

  if (!item.length) throw new Error("Pipeline item not found");
  const pi = item[0];

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, pi.entityId)).limit(1);
  const o = opp.length > 0 ? opp[0] : null;
  const locationData = o ? (o.locationJson as any) || {} : {};

  const prompt = `You are a federal construction capture optimization engine for BlackHawk Construction (SDVOSB, Midwest).

PIPELINE ITEM:
Stage: ${pi.stage}
Priority: ${pi.priority}
AI Score: ${pi.aiScore || "Not scored"}

OPPORTUNITY:
Title: ${o?.title || "Unknown"}
Agency: ${locationData.agency || "Unknown"}
Value: $${o?.contractValue ? Number(o.contractValue).toLocaleString() : "Unknown"}
Set-Aside: ${o?.setAside || "Full & Open"}
Deadline: ${o?.dueAt ? new Date(o.dueAt).toLocaleDateString() : "Unknown"}

Generate a win probability and 8 specific next best actions.

Respond as JSON:
{
  "probability": 0.0 to 1.0,
  "confidenceLevel": "low|medium|high",
  "factors": {
    "positive": ["factor1", "factor2"],
    "negative": ["factor1", "factor2"],
    "neutral": ["factor1"]
  },
  "nextActions": [
    {
      "title": "Action title",
      "description": "What to do",
      "type": "task|outreach|research|meeting|document",
      "priority": "critical|high|medium|low",
      "expectedLift": 0.01 to 0.15,
      "dueInDays": 3
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");

  const inserted = await db.insert(winProbability).values({
    tenantId,
    pipelineItemId,
    opportunityId: pi.entityId,
    probability: (parsed.probability || 0.5).toString(),
    confidenceLevel: parsed.confidenceLevel || "medium",
    factors: parsed.factors || {},
    nextActions: parsed.nextActions || [],
    expectedLift: parsed.nextActions?.map((a: any) => ({ action: a.title, lift: a.expectedLift })) || [],
    modelVersion: "gpt-4o-mini",
  }).returning();

  await persistArtifact({
    tenantId,
    entityType: "pipeline_item",
    entityId: pipelineItemId,
    artifactType: "win_probability",
    payload: { ...parsed, pipelineItemId },
    confidence: Math.round((parsed.probability || 0.5) * 100),
  });

  return { ...parsed, id: inserted[0]?.id, pipelineItemId };
}

export async function extractRequirements(opportunityId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const existingArtifact = await db.select().from(aiArtifacts)
    .where(and(
      eq(aiArtifacts.tenantId, tenantId),
      eq(aiArtifacts.entityType, "opportunity"),
      eq(aiArtifacts.entityId, opportunityId),
      eq(aiArtifacts.artifactType, "requirements_extraction")
    ))
    .orderBy(desc(aiArtifacts.createdAt))
    .limit(1);

  if (existingArtifact.length > 0) return existingArtifact[0].payloadJson;

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, opportunityId)).limit(1);
  if (!opp.length) throw new Error("Opportunity not found");

  const o = opp[0];
  const locationData = (o.locationJson as any) || {};

  const prompt = `Extract all requirements from this federal construction solicitation and convert them to a structured checklist.

OPPORTUNITY:
Title: ${o.title}
Agency: ${locationData.agency || "Unknown"}
Description: ${(o.description || "").substring(0, 2000)}
Synopsis: ${o.synopsis || "N/A"}
Set-Aside: ${o.setAside || "Full & Open"}

Respond as JSON:
{
  "requirements": [
    {
      "id": "REQ-001",
      "category": "technical|administrative|compliance|financial|past_performance|personnel",
      "requirement": "Requirement description",
      "priority": "mandatory|desirable|optional",
      "source": "Where in the solicitation this was found",
      "status": "not_started"
    }
  ],
  "checklist": [
    {
      "id": "CHK-001",
      "section": "Volume name or section",
      "item": "Checklist item description",
      "requirementIds": ["REQ-001"],
      "status": "pending",
      "assignee": "estimator|pm|exec|legal|safety"
    }
  ],
  "summary": "Brief overview of key requirements"
}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const result = JSON.parse(completion.choices[0]?.message?.content || "{}");

  await persistArtifact({
    tenantId,
    entityType: "opportunity",
    entityId: opportunityId,
    artifactType: "requirements_extraction",
    payload: result,
    evidence: { model: "gpt-4o-mini", sourceFields: ["description", "synopsis"] },
    confidence: 72,
  });

  return result;
}
