// Phase 1 Feature 6 main — Herbie tool registry.
//
// HERBIE.md prescribes 11 tools. This file is the seam between the
// LLM agent and the backend services it's allowed to invoke. Tools
// are registered with JSON schemas (OpenAI tool-calling format) so
// the orchestrator can hand them to the model, and each tool's
// handler dispatches to the corresponding service while enforcing
// Phase 1 rules (no external send without approval, confidence
// gating for facts, etc.).
//
// Not every tool is wired yet. Ones whose backing service already
// exists in this repo are implemented; the rest throw a
// clearly-named "not yet implemented" error with a pointer to the
// feature ticket that should land them.

import { recordFact, recordDecision } from "./herbie-facts.service";
import { draftRfi } from "./rfi-draft.service";
import { draftSubmittal } from "./submittal-draft.service";
import { db } from "../db";
import {
  herbieReviewQueue,
  docFiles,
  projectDocuments,
  bidJacketArtifacts,
} from "@shared/schema";
import {
  coisExpiringWithin,
  listForProject as listCoisForProject,
  partitionByTier as partitionCoisByTier,
} from "./coi.service";
import { upsertVoiceDailyLog } from "./voice-daily-log.service";
import { draftMessage } from "./outbound-message-draft.service";
import { createRAGService } from "./rag.service";
import { extractCoiFields } from "./extractors/coi-extractor";

export interface HerbieToolContext {
  tenantId: string;
  userId: string;
  projectId?: string;
}

export interface HerbieToolCall {
  tool: string;
  args: Record<string, any>;
}

export type HerbieToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string; code?: string }
  | { success: true; preview: true; would_have: { tool: string; args: Record<string, any> } };

/**
 * Write-capable tools blocked by HERBIE_PREVIEW_MODE.
 * Read-only tools (get_project_status, search_project, read_document,
 * extract_fields) are intentionally excluded — they never mutate state.
 */
export const WRITE_CAPABLE_TOOLS = new Set([
  "record_fact",
  "record_decision",
  "create_rfi",
  "create_submittal",
  "flag_for_review",
  "log_daily",
  "draft_message",
]);

/** Returns true when the orchestrator should block write-capable tools. */
export function isPreviewMode(): boolean {
  return process.env.HERBIE_PREVIEW_MODE === "true";
}

export interface HerbieToolSpec {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * OpenAI-style tool specs. Safe to serialize directly to a model's
 * tool list. Descriptions are written in Herbie's voice — they're
 * also part of what the model reads when deciding when to call.
 */
export const HERBIE_TOOL_SPECS: HerbieToolSpec[] = [
  {
    name: "record_fact",
    description:
      "Persist an atomic fact about an entity (vendor, project, coi, submittal, etc.). Confidence < 0.7 routes to the review queue instead of herbie_facts. Every fact needs a source.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project this fact is about. Omit for cross-project facts." },
        subjectType: { type: "string", description: "e.g. vendor, project, coi, submittal" },
        subjectId: { type: "string" },
        predicate: { type: "string", description: "e.g. coi_expires_at, gc_name, concrete_spec" },
        object: { type: "string", description: "Plain-text value" },
        sourceType: {
          type: "string",
          enum: ["document", "message", "user", "herbie_extraction"],
        },
        sourceId: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["subjectType", "predicate", "sourceType", "confidence"],
    },
  },
  {
    name: "record_decision",
    description:
      "Append a project decision with rationale and decidedBy. Decisions are append-only — never edited, never deleted.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        summary: { type: "string" },
        rationale: { type: "string" },
        decidedBy: { type: "string", description: "user_id or literal 'herbie'" },
        relatedEntityType: { type: "string" },
        relatedEntityId: { type: "string" },
      },
      required: ["summary", "decidedBy"],
    },
  },
  {
    name: "create_rfi",
    description:
      "Draft an RFI. Creates rfis row in draft_pending_approval and files an approval request. PM approves in the queue to submit.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        subject: { type: "string" },
        question: { type: "string" },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "urgent"],
        },
        assignedToUserId: { type: "string" },
      },
      required: ["projectId", "subject", "question"],
    },
  },
  {
    name: "create_submittal",
    description:
      "Draft a submittal. Creates submittals row in draft_pending_approval and files an approval request.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        submittalType: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
      },
      required: ["projectId", "name"],
    },
  },
  {
    name: "flag_for_review",
    description:
      "Raise something for the PM's attention. Use when confidence is low, when values conflict, or when a proactive monitor trips.",
    parameters: {
      type: "object",
      properties: {
        reviewType: {
          type: "string",
          description:
            "classification | extraction | filing | binder_inclusion | company_match | fact_extraction | monitor_alert",
        },
        actionProposed: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasoningText: { type: "string" },
        priority: { type: "number", description: "Lower number = higher priority. Default 100." },
      },
      required: ["reviewType", "actionProposed", "confidence"],
    },
  },
  {
    name: "get_project_status",
    description:
      "Snapshot of the project: open RFIs, pending submittals, overdue tasks, COI status rollup.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "log_daily",
    description:
      "Create a structured daily log entry from a transcript. Upserts by (project, date).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        logDate: { type: "string", description: "ISO date. Defaults to today." },
        transcript: { type: "string", description: "Raw voice transcript to parse." },
      },
      required: ["projectId", "transcript"],
    },
  },
  // Placeholder specs for tools whose backing service isn't yet wired
  // at this layer. Kept in the spec list so the model sees the
  // intended capability; handlers below return a clear "not yet
  // implemented" error that Herbie can relay to the PM.
  {
    name: "read_document",
    description:
      "Fetch a document's bytes + OCR text by id. (Not yet wired at the tool layer — pending Feature 2 main integration.)",
    parameters: {
      type: "object",
      properties: { documentId: { type: "string" } },
      required: ["documentId"],
    },
  },
  {
    name: "extract_fields",
    description:
      "Structured extraction from a document. (Not yet wired at the tool layer — pending Feature 2 main integration.)",
    parameters: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        category: { type: "string", description: "GC artifact category" },
      },
      required: ["documentId"],
    },
  },
  {
    name: "search_project",
    description:
      "Semantic + keyword search scoped to a project. (Not yet wired at the tool layer — pending Feature 6 RAG integration.)",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        query: { type: "string" },
      },
      required: ["projectId", "query"],
    },
  },
  {
    name: "draft_message",
    description:
      "Draft an external communication. Always files an approval request with actionType=draft_external_message — no external send without a human approval in Phase 1.",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        recipient: { type: "string" },
        channel: {
          type: "string",
          enum: ["email", "sms", "portal"],
        },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["recipient", "channel", "body"],
    },
  },
];

export function getHerbieToolSpec(name: string): HerbieToolSpec | undefined {
  return HERBIE_TOOL_SPECS.find((s) => s.name === name);
}

/**
 * Execute a tool call on behalf of Herbie. Validates that the tool
 * exists and dispatches to its handler. Returns a structured result
 * the orchestrator can hand back to the model.
 */
export async function executeHerbieTool(
  call: HerbieToolCall,
  ctx: HerbieToolContext,
): Promise<HerbieToolResult> {
  const spec = getHerbieToolSpec(call.tool);
  if (!spec) {
    return { success: false, error: `Unknown tool: ${call.tool}`, code: "UNKNOWN_TOOL" };
  }

  if (isPreviewMode() && WRITE_CAPABLE_TOOLS.has(call.tool)) {
    return {
      success: true,
      preview: true,
      would_have: { tool: call.tool, args: call.args },
    };
  }

  try {
    switch (call.tool) {
      case "record_fact":
        return {
          success: true,
          data: await recordFact({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId ?? ctx.projectId ?? null,
            subjectType: call.args.subjectType,
            subjectId: call.args.subjectId ?? null,
            predicate: call.args.predicate,
            object: call.args.object ?? null,
            objectJson: call.args.objectJson ?? null,
            sourceType: call.args.sourceType,
            sourceId: call.args.sourceId ?? null,
            confidence: Number(call.args.confidence),
            extractedAt: call.args.extractedAt ? new Date(call.args.extractedAt) : undefined,
          }),
        };
      case "record_decision":
        return {
          success: true,
          data: await recordDecision({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId ?? ctx.projectId ?? null,
            summary: call.args.summary,
            rationale: call.args.rationale ?? null,
            decidedBy: call.args.decidedBy,
            relatedEntityType: call.args.relatedEntityType ?? null,
            relatedEntityId: call.args.relatedEntityId ?? null,
            metadataJson: call.args.metadataJson ?? null,
          }),
        };
      case "create_rfi":
        return {
          success: true,
          data: await draftRfi({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId,
            subject: call.args.subject,
            question: call.args.question,
            priority: call.args.priority,
            assignedToUserId: call.args.assignedToUserId,
            draftedBy: ctx.userId,
          }),
        };
      case "create_submittal":
        return {
          success: true,
          data: await draftSubmittal({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId,
            name: call.args.name,
            submittalType: call.args.submittalType,
            description: call.args.description,
            priority: call.args.priority,
            draftedBy: ctx.userId,
          }),
        };
      case "flag_for_review": {
        const [row] = await db
          .insert(herbieReviewQueue)
          .values({
            tenantId: ctx.tenantId,
            reviewType: call.args.reviewType,
            actionProposed: call.args.actionProposed,
            confidence: Number(call.args.confidence).toFixed(2),
            reasoningText: call.args.reasoningText ?? null,
            priority: call.args.priority ?? 100,
            status: "pending",
          })
          .returning({ id: herbieReviewQueue.id });
        return { success: true, data: { reviewQueueId: row.id } };
      }
      case "get_project_status":
        return {
          success: true,
          data: await assembleProjectStatus(ctx.tenantId, call.args.projectId),
        };
      case "log_daily":
        return {
          success: true,
          data: await upsertVoiceDailyLog({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId,
            logDate: call.args.logDate ? new Date(call.args.logDate) : new Date(),
            audio: { url: "" }, // unused on the text-only path
            transcriber: { transcribe: async () => ({ text: String(call.args.transcript ?? ""), stub: true }) },
          }),
        };
      case "draft_message":
        return {
          success: true,
          data: await draftMessage({
            tenantId: ctx.tenantId,
            projectId: call.args.projectId ?? ctx.projectId,
            recipient: call.args.recipient,
            channel: call.args.channel,
            subject: call.args.subject,
            body: call.args.body,
            draftedBy: ctx.userId,
          }),
        };
      case "search_project": {
        const rag = createRAGService(ctx.tenantId);
        const limit = typeof call.args.limit === "number" ? call.args.limit : 5;
        const results = await rag.search(String(call.args.query ?? ""), limit);
        // rag.search returns tenant-scoped results, not project-
        // scoped. Until the RAG index grows a projectId facet, we
        // filter in memory when the model asks for a specific
        // project — dropping any hit whose source is tagged with a
        // different project.
        const projectId = call.args.projectId;
        const filtered = projectId
          ? results.filter((r: any) => {
              const p = r?.metadata?.projectId ?? r?.projectId;
              return !p || p === projectId;
            })
          : results;
        return { success: true, data: { results: filtered } };
      }
      case "read_document": {
        const docId = String(call.args.documentId ?? "");
        if (!docId) {
          return { success: false, error: "documentId is required", code: "BAD_ARGS" };
        }
        const doc = await lookupDocument(ctx.tenantId, docId);
        if (!doc) {
          return { success: false, error: "Document not found", code: "NOT_FOUND" };
        }
        return { success: true, data: doc };
      }
      case "extract_fields": {
        const category = String(call.args.category ?? "").toLowerCase();
        const text = typeof call.args.text === "string" ? call.args.text : "";
        const fileName = typeof call.args.fileName === "string" ? call.args.fileName : "";
        // If we have a documentId but no inline text, look it up and
        // use the stored name + any text field. Full OCR text fetch
        // is Feature 2 main scope.
        let effectiveText = text;
        let effectiveFileName = fileName;
        if (!effectiveText && call.args.documentId) {
          const doc = await lookupDocument(ctx.tenantId, String(call.args.documentId));
          if (doc) effectiveFileName = doc.name ?? effectiveFileName;
        }
        if (category === "coi") {
          const extraction = extractCoiFields({
            text: effectiveText || undefined,
            fileName: effectiveFileName || undefined,
          });
          return { success: true, data: { category: "coi", ...extraction } };
        }
        return {
          success: false,
          error:
            `extract_fields has a COI extractor wired; other categories (category='${category}') depend on Feature 2 main. For now, use read_document + record_fact.`,
          code: "NOT_IMPLEMENTED",
        };
      }
      default:
        return {
          success: false,
          error: `Unhandled tool: ${call.tool}`,
          code: "UNHANDLED",
        };
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message ?? "tool handler threw",
      code: "HANDLER_ERROR",
    };
  }
}

/**
 * Look up a document across the three tables that store uploaded
 * files in this repo. Returns a normalized shape Herbie can reason
 * about without caring which table it came from.
 */
async function lookupDocument(
  tenantId: string,
  documentId: string,
): Promise<
  | {
      source: "project_document" | "doc_file" | "bid_jacket_artifact";
      id: string;
      name: string | null;
      category: string | null;
      mimeType: string | null;
      storageKey: string | null;
      projectId: string | null;
      createdAt: Date | null;
    }
  | undefined
> {
  const { eq, and } = await import("drizzle-orm");
  // project_documents — the GC-facing Phase 1 target.
  const pdRows = await db
    .select()
    .from(projectDocuments)
    .where(
      and(
        eq(projectDocuments.tenantId, tenantId),
        eq(projectDocuments.id, documentId),
      ),
    )
    .limit(1);
  if (pdRows[0]) {
    const r: any = pdRows[0];
    return {
      source: "project_document",
      id: r.id,
      name: r.fileName ?? r.name ?? null,
      category: r.category ?? r.folder ?? null,
      mimeType: r.mimeType ?? null,
      storageKey: r.storageKey ?? r.storagePath ?? null,
      projectId: r.projectId ?? null,
      createdAt: r.createdAt ?? null,
    };
  }
  // doc_files — the older cross-module document table.
  const dfRows = await db
    .select()
    .from(docFiles)
    .where(and(eq(docFiles.tenantId, tenantId), eq(docFiles.id, documentId)))
    .limit(1);
  if (dfRows[0]) {
    const r: any = dfRows[0];
    return {
      source: "doc_file",
      id: r.id,
      name: r.name ?? r.fileName ?? null,
      category: r.category ?? null,
      mimeType: r.mimeType ?? null,
      storageKey: r.storageKey ?? null,
      projectId: r.projectId ?? null,
      createdAt: r.createdAt ?? null,
    };
  }
  // bid_jacket_artifacts — federal-bidding side, here for
  // completeness while both surfaces coexist in Phase 1.
  const bjaRows = await db
    .select()
    .from(bidJacketArtifacts)
    .where(
      and(
        eq(bidJacketArtifacts.tenantId, tenantId),
        eq(bidJacketArtifacts.id, documentId),
      ),
    )
    .limit(1);
  if (bjaRows[0]) {
    const r: any = bjaRows[0];
    return {
      source: "bid_jacket_artifact",
      id: r.id,
      name: r.title ?? r.templateCode ?? null,
      category: r.folder ?? r.templateCode ?? null,
      mimeType: null,
      storageKey: r.sourceUrl ?? null,
      projectId: null,
      createdAt: r.createdAt ?? null,
    };
  }
  return undefined;
}

/**
 * Inlined assembly of the get_project_status snapshot. Kept here
 * (rather than calling the cockpit HTTP route) so Herbie doesn't
 * have to go out over HTTP to its own server.
 */
async function assembleProjectStatus(
  tenantId: string,
  projectId: string,
): Promise<{
  projectId: string;
  coi: { total: number; expired: number; critical: number; warning: number; ok: number };
  coisExpiringSoon: Array<{ id: string; policyType: string; expiryDate: Date }>;
}> {
  const cois = await listCoisForProject(tenantId, projectId);
  const buckets = partitionCoisByTier(cois);
  const expiringSoon = await coisExpiringWithin(tenantId, 30);
  return {
    projectId,
    coi: {
      total: cois.length,
      expired: buckets.expired.length,
      critical: buckets.critical_1d.length + buckets.critical_7d.length,
      warning: buckets.warning_14d.length + buckets.warning_30d.length,
      ok: buckets.ok.length,
    },
    coisExpiringSoon: expiringSoon
      .filter((c) => !c.projectId || c.projectId === projectId)
      .slice(0, 10)
      .map((c) => ({
        id: c.id,
        policyType: c.policyType,
        expiryDate: c.expiryDate,
      })),
  };
}
