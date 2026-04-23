import { db } from "../../db";
import { documentTextChunks } from "../../../db/schema/herbie";
import { eq, and, sql, ilike, or } from "drizzle-orm";
import { getLLMProvider } from "../llm";
import type { LLMMessage } from "../llm";
import {
  HERBIE_TOOL_SPECS,
  executeHerbieTool,
  type HerbieToolContext,
} from "../herbie-tools";

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
  /**
   * When true, the orchestrator runs the full agentic loop: passes
   * HERBIE_TOOL_SPECS to Claude, executes any tool calls, feeds
   * results back, and repeats until stop_reason === "end_turn".
   * Default: true when tenantId is provided (Herbie can only safely
   * call tools when tenant scoping is known).
   */
  withTools?: boolean;
  /** Hard cap on agentic loop iterations. Default 6. */
  maxIterations?: number;
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
  toolCalls: Array<{ tool: string; input: unknown; result: unknown }>;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  };
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

import { getHerbieIdentityPrompt } from "../herbie-identity.service";
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

    // Per HERBIE.md "System-prompt assembly": identity is slot [1]
    // (stable, ~7KB — textbook cache candidate). Project memory is
    // slot [2] (volatile per-project, not cached). Passing them as
    // two blocks lets the provider mark only the identity block
    // cacheable, so multi-turn conversations hit the cache on
    // identity but always re-render the memory block.
    const identity = getHerbieIdentityPrompt();
    const projectMemoryBlock =
      input.tenantId && input.projectId
        ? await formatProjectMemoryBlock(input.tenantId, input.projectId)
        : undefined;

    const system: Array<{ type: "text"; text: string; cacheable?: boolean }> = [
      { type: "text", text: identity, cacheable: true },
    ];
    if (projectMemoryBlock) {
      system.push({
        type: "text",
        text: "\n\n---\n\n[Project Memory]\n" + projectMemoryBlock,
      });
    }

    // Decide whether to run the agentic loop. Default: yes when
    // tenant is known (tools need tenantId to scope DB writes).
    const withTools =
      input.withTools ?? Boolean(input.tenantId);
    const maxIterations = input.maxIterations ?? 6;

    const provider = getLLMProvider();
    const messages: LLMMessage[] = [
      { role: "user", content: userPrompt },
    ];
    const toolCalls: HerbieChatResponse["toolCalls"] = [];
    let usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    let model = "unknown";
    let finalText = "";

    const toolCtx: HerbieToolContext = {
      tenantId: input.tenantId ?? "blackhawk-default",
      userId: input.userId,
      projectId: input.projectId,
    };

    for (let iter = 0; iter < maxIterations; iter++) {
      const response = await provider.chat({
        system,
        messages,
        tools: withTools ? HERBIE_TOOL_SPECS : undefined,
        tier: "orchestration",
        maxTokens: 4096,
      });
      usage.inputTokens += response.usage.inputTokens;
      usage.outputTokens += response.usage.outputTokens;
      usage.cacheReadTokens += response.usage.cacheReadTokens;
      usage.cacheCreationTokens += response.usage.cacheCreationTokens;
      model = response.model;
      finalText = response.text;

      // If the model stopped without calling a tool, we're done.
      if (response.toolCalls.length === 0) break;

      // Append the assistant turn verbatim so the model sees its own
      // tool_use blocks alongside the results we're about to feed in.
      const assistantContent: Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
      > = [];
      if (response.text) {
        assistantContent.push({ type: "text", text: response.text });
      }
      for (const call of response.toolCalls) {
        assistantContent.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.input,
        });
      }
      messages.push({ role: "assistant", content: assistantContent });

      // Execute each tool call and prepare the corresponding
      // tool_result blocks for the next user turn.
      const results: Array<{
        type: "tool_result";
        tool_use_id: string;
        content: string;
        is_error?: boolean;
      }> = [];
      for (const call of response.toolCalls) {
        const result = await executeHerbieTool(
          { tool: call.name, args: call.input },
          toolCtx,
        );
        toolCalls.push({
          tool: call.name,
          input: call.input,
          result,
        });
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: result.success
            ? JSON.stringify(result.data).slice(0, 8_000)
            : `ERROR ${result.code ?? "UNKNOWN"}: ${result.error}`,
          is_error: !result.success,
        });
      }
      messages.push({ role: "user", content: results });
    }

    return {
      text: finalText,
      blocks: [],
      sources: chunks,
      toolCalls,
      model,
      usage,
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
