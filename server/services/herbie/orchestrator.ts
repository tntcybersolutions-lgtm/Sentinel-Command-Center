import OpenAI from "openai";
import { db } from "../../db";
import { documentTextChunks } from "../../../db/schema/herbie";
import { eq, and, sql, ilike, or } from "drizzle-orm";

export interface HerbieChatInput {
  bidId: string;
  userId: string;
  message: string;
  screenContext?: string;
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

    // Identity layer from HERBIE.md. See HERBIE.md "System-prompt
    // assembly" — this is slot [1]; project memory / preferences /
    // recency would be slots [2]-[5] when wired into the combined
    // context assembler.
    const systemPrompt = buildHerbieSystemPrompt();

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
