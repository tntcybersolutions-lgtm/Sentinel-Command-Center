import OpenAI from "openai";
import { db } from "../../db";
import { documentTextChunks } from "../../../db/schema/herbie";
import { eq, and, sql, ilike, or } from "drizzle-orm";

export interface HerbieChatInput {
  bidId: string;
  userId: string;
  message: string;
  screenContext?: string;
  // Phase 1 Feature 6 — when provided, Herbie pulls the three-layer
  // memory block (facts + decisions + relationships) for this project
  // into the system prompt per HERBIE.md's "System-prompt assembly"
  // rules. tenantId is required alongside so the read is scoped.
  projectId?: string;
  tenantId?: string;
}

export interface ChunkResult {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  metadata: unknown;
  score: number;
}

export interface HerbieChatResponse {
  text: string;
  blocks: unknown[];
  sources: ChunkResult[];
}

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return openaiClient;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "about", "it",
  "its", "this", "that", "these", "those", "i", "me", "my", "we", "our",
  "you", "your", "he", "him", "his", "she", "her", "they", "them", "their",
  "what", "which", "who", "when", "where", "how", "not", "no", "but",
  "or", "and", "if", "then", "so", "than", "too", "very", "just",
]);

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
}

export async function retrieveChunks(
  bidId: string,
  query: string,
  limit: number = 5,
): Promise<ChunkResult[]> {
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return [];

  const conditions = keywords.map(kw => ilike(documentTextChunks.content, `%${kw}%`));

  const scoreCases = keywords.map(
    kw => sql`CASE WHEN ${documentTextChunks.content} ILIKE ${"%" + kw + "%"} THEN 1 ELSE 0 END`
  );
  const scoreExpr = sql`(${sql.join(scoreCases, sql` + `)})`;

  const rows = await db
    .select({
      id: documentTextChunks.id,
      documentId: documentTextChunks.documentId,
      chunkIndex: documentTextChunks.chunkIndex,
      content: documentTextChunks.content,
      metadata: documentTextChunks.metadata,
      score: scoreExpr.as("score"),
    })
    .from(documentTextChunks)
    .where(and(eq(documentTextChunks.bidId, bidId), or(...conditions)))
    .orderBy(sql`score DESC`)
    .limit(limit);

  return rows.map(r => ({
    id: r.id,
    documentId: r.documentId,
    chunkIndex: r.chunkIndex,
    content: r.content,
    metadata: r.metadata,
    score: Number(r.score),
  }));
}

import { buildHerbieSystemPrompt } from "../herbie-identity.service";
import { getProjectMemoryBlock } from "../herbie-facts.service";

export class HerbieOrchestrator {
  async chat(input: HerbieChatInput): Promise<HerbieChatResponse> {
    const chunks = await retrieveChunks(input.bidId, input.message);

    let userPrompt = "";

    if (input.screenContext) {
      userPrompt += `[Context: user is viewing ${input.screenContext}]\n\n`;
    }

    if (chunks.length > 0) {
      const contextBlock = chunks
        .map((c, i) => `--- Document Chunk ${i + 1} (score: ${c.score}) ---\n${c.content}`)
        .join("\n\n");
      userPrompt += `[Document Context]\n${contextBlock}\n\n[End Document Context]\n\n`;
    }

    userPrompt += input.message;

    // Identity layer from HERBIE.md + optional project-memory block
    // (facts / decisions / relationships) when we know which project
    // the user is asking about. See HERBIE.md "System-prompt
    // assembly" for the intended ordering.
    const projectMemoryBlock =
      input.tenantId && input.projectId
        ? await formatProjectMemoryBlock(input.tenantId, input.projectId)
        : undefined;

    const systemPrompt = buildHerbieSystemPrompt({ projectMemoryBlock });

    const response = await getOpenAI().responses.create({
      model: "gpt-5.1",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return {
      text: response.output_text,
      blocks: [],
      sources: chunks,
    };
  }
}

/**
 * Render the three-layer memory block for a project into a plain-text
 * string suitable for inclusion in the system prompt. Keeps the
 * formatting consistent so Herbie sees the same shape on every call.
 *
 * Bounded by getProjectMemoryBlock's defaults (30 facts / 10
 * decisions / 20 relationships) — plenty for a Phase 1 demo and well
 * under the ~2k-token "project memory" slice of HERBIE.md's ~8k
 * context budget.
 */
export async function formatProjectMemoryBlock(
  tenantId: string,
  projectId: string,
): Promise<string | undefined> {
  try {
    const { facts, decisions, relationships } = await getProjectMemoryBlock({
      tenantId,
      projectId,
    });
    if (!facts.length && !decisions.length && !relationships.length) {
      return undefined;
    }
    const lines: string[] = [];
    if (facts.length) {
      lines.push("Facts:");
      for (const f of facts) {
        const subj = `${f.subjectType}${f.subjectId ? `:${f.subjectId}` : ""}`;
        const obj = f.object ?? JSON.stringify(f.objectJson ?? null);
        lines.push(
          `  • ${subj} ${f.predicate} = ${obj} (source: ${f.sourceType}, confidence: ${f.confidence})`,
        );
      }
    }
    if (decisions.length) {
      lines.push("");
      lines.push("Decisions:");
      for (const d of decisions) {
        lines.push(
          `  • ${d.decidedAt.toISOString().slice(0, 10)} — ${d.summary} (by ${d.decidedBy})` +
            (d.rationale ? ` — ${d.rationale}` : ""),
        );
      }
    }
    if (relationships.length) {
      lines.push("");
      lines.push("Relationships:");
      for (const r of relationships) {
        const target =
          r.contactId ? `contact:${r.contactId}` :
          r.vendorId  ? `vendor:${r.vendorId}` :
          r.companyId ? `company:${r.companyId}` : "unknown";
        lines.push(`  • ${target} — ${r.role} (${r.status})`);
      }
    }
    return lines.join("\n");
  } catch (err) {
    // Memory read failures should never block a chat. Log and skip
    // the block — Herbie still has identity + conversational context.
    console.error("formatProjectMemoryBlock failed:", err);
    return undefined;
  }
}
