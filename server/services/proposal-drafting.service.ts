/**
 * server/services/proposal-drafting.service.ts
 *
 * Federal proposal drafting service. Two narrow surfaces:
 *   - generateCapabilityStatement({ tenantId, opportunityId })
 *   - generatePastPerformanceWriteup({ tenantId, oppNaics, oppKeywords })
 *
 * Both pull from setAsideCertifications + pastPerformanceRecords, call the
 * orchestration-tier LLM (Opus), and persist the output to proposalDrafts
 * with status="draft". Submission is always a human keystroke — Herbie does
 * NOT autonomously file federal proposals (see govt-public-works module
 * "What Herbie does NOT do here" rules).
 */

import { db } from "../db";
import {
  opportunities,
  tenants,
  pastPerformanceRecords,
  setAsideCertifications,
  proposalDrafts,
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getLLMProvider } from "./llm";

export interface ProposalDraftRecord {
  id: string;
  artifactType: string;
  title: string;
  body: string;
}

/**
 * Generate a 1-page capability statement tailored to the opportunity.
 * Persists as proposalDrafts.artifactType = "capability-statement".
 */
export async function generateCapabilityStatement(args: {
  tenantId: string;
  opportunityId: string;
}): Promise<ProposalDraftRecord> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, args.tenantId));
  if (!tenant) throw new Error("Tenant not found: " + args.tenantId);

  const [opportunity] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, args.opportunityId));
  if (!opportunity) throw new Error("Opportunity not found: " + args.opportunityId);

  const [certs, recentPP] = await Promise.all([
    db
      .select()
      .from(setAsideCertifications)
      .where(
        and(
          eq(setAsideCertifications.tenantId, args.tenantId),
          eq(setAsideCertifications.status, "active"),
        ),
      ),
    db
      .select()
      .from(pastPerformanceRecords)
      .where(eq(pastPerformanceRecords.tenantId, args.tenantId))
      .orderBy(desc(pastPerformanceRecords.endDate))
      .limit(10),
  ]);

  const certLines = certs.length
    ? certs.map((c) => `- ${c.category}${c.certNumber ? " (#" + c.certNumber + ")" : ""}`).join("\n")
    : "- (no active set-aside certifications on file)";

  const ppLines = recentPP.length
    ? recentPP
        .map(
          (p) =>
            `- ${p.contractNumber} | ${p.agency ?? "agency n/a"} | $${p.currentValue ?? p.initialValue ?? "?"} | ${p.scopeSummary ?? ""}`,
        )
        .join("\n")
    : "- (no past performance records on file)";

  const prompt = `Write a 1-page capability statement for ${tenant.legalName} (DBA: ${tenant.dbaName ?? "n/a"}) tailored to this federal opportunity:

Opportunity: ${opportunity.title}
Agency: ${opportunity.agency ?? "n/a"}
NAICS: ${opportunity.naicsCode ?? (opportunity.naicsCodes?.[0] ?? "n/a")}
Set-aside: ${opportunity.setAsideCategory ?? opportunity.setAside ?? "full-and-open"}
Estimated value: ${opportunity.estimatedValue ?? "n/a"}
Place of performance: ${opportunity.placeOfPerformanceState ?? "n/a"}
Scope keywords: ${((opportunity.scopeKeywords as unknown) as string[] | null)?.join(", ") ?? "n/a"}

Active set-aside certifications:
${certLines}

Recent relevant past performance:
${ppLines}

Required sections (use these headings exactly):
1. Core Competencies — bullet list, 4-6 items, NAICS-aligned.
2. Differentiators — what sets this firm apart for THIS opportunity.
3. Past Performance Snapshot — 3 most-relevant projects from above.
4. Certifications & Codes — list certs above, plus UEI/CAGE if implied.
5. Contact — placeholder line: "[Capture Manager contact details]"

Tone: federal-procurement formal, evidence-led, no marketing fluff. Cite NAICS + dollar values explicitly. Hard cap: 600 words.`;

  const response = await getLLMProvider().chat({
    tier: "orchestration",
    system:
      "You draft federal capability statements. Output formatted markdown only — no preamble, no apologies, no closing remarks.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 1500,
  });

  const body = response.text ?? "";
  const title = `Capability Statement — ${opportunity.title}`;

  const [row] = await db
    .insert(proposalDrafts)
    .values({
      tenantId: args.tenantId,
      opportunityId: args.opportunityId,
      artifactType: "capability-statement",
      title,
      body,
      status: "draft",
      createdByHerbie: true,
      metadata: {
        model: response.model,
        usage: response.usage,
        certCount: certs.length,
        ppCount: recentPP.length,
      },
    })
    .returning();

  return { id: row.id, artifactType: "capability-statement", title, body };
}

/**
 * Generate a past-performance writeup pulling the most relevant prior projects
 * matched by NAICS + scope keywords. Persists as
 * proposalDrafts.artifactType = "past-performance".
 */
export async function generatePastPerformanceWriteup(args: {
  tenantId: string;
  oppNaics: string;
  oppKeywords: string[];
}): Promise<ProposalDraftRecord> {
  const recentPP = await db
    .select()
    .from(pastPerformanceRecords)
    .where(eq(pastPerformanceRecords.tenantId, args.tenantId))
    .orderBy(desc(pastPerformanceRecords.endDate))
    .limit(50);

  // Rank by relevance: exact NAICS > same NAICS family > keyword overlap.
  const oppKeywordsLower = (args.oppKeywords ?? []).map((k) => k.toLowerCase());
  const naicsFamily = (args.oppNaics ?? "").slice(0, 4);

  const ranked = recentPP
    .map((p) => {
      const ppKeywords = ((p.relevanceKeywords as unknown) as string[] | null)?.map((k) =>
        k.toLowerCase(),
      ) ?? [];
      const overlap = oppKeywordsLower.filter((k) => ppKeywords.includes(k)).length;
      const naicsScore =
        p.naicsCode === args.oppNaics
          ? 1.0
          : (p.naicsCode ?? "").slice(0, 4) === naicsFamily
            ? 0.6
            : 0.0;
      const keywordScore = oppKeywordsLower.length === 0 ? 0 : overlap / oppKeywordsLower.length;
      return { record: p, score: naicsScore * 0.6 + keywordScore * 0.4 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const ppBlock = ranked
    .map(
      (r, i) =>
        `Project ${i + 1}:\n  Contract: ${r.record.contractNumber}\n  Agency: ${r.record.agency ?? "n/a"}\n  NAICS: ${r.record.naicsCode ?? "n/a"}\n  Period: ${r.record.startDate?.toISOString?.().slice(0, 10) ?? "?"} to ${r.record.endDate?.toISOString?.().slice(0, 10) ?? "?"}\n  Final value: $${r.record.currentValue ?? r.record.initialValue ?? "?"}\n  Scope: ${r.record.scopeSummary ?? "n/a"}\n  Keywords: ${(((r.record.relevanceKeywords as unknown) as string[] | null) ?? []).join(", ")}\n  Relevance score: ${r.score.toFixed(2)}`,
    )
    .join("\n\n");

  const prompt = `Write a past-performance writeup for a federal proposal.

Target opportunity NAICS: ${args.oppNaics}
Target opportunity scope keywords: ${oppKeywordsLower.join(", ") || "(none specified)"}

Most-relevant past performance records (already ranked by relevance):

${ppBlock || "(no records on file)"}

Format requirements:
- One narrative paragraph per project, max 5 projects.
- Lead each paragraph with the contract # and agency.
- Quantify outcomes (dollars, schedule, CPARS rating if available in scope).
- Explicitly tie each to the target NAICS or scope keywords.
- Hard cap: 800 words.
- No preamble, no closing — just the writeup.`;

  const response = await getLLMProvider().chat({
    tier: "orchestration",
    system:
      "You draft federal past-performance writeups. Evidence-led, quantified, no fluff.",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 2000,
  });

  const body = response.text ?? "";
  const title = `Past Performance — NAICS ${args.oppNaics}`;

  const [row] = await db
    .insert(proposalDrafts)
    .values({
      tenantId: args.tenantId,
      artifactType: "past-performance",
      title,
      body,
      status: "draft",
      createdByHerbie: true,
      metadata: {
        model: response.model,
        usage: response.usage,
        oppNaics: args.oppNaics,
        oppKeywords: oppKeywordsLower,
        rankedCount: ranked.length,
      },
    })
    .returning();

  return { id: row.id, artifactType: "past-performance", title, body };
}
