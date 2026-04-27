// Roadmap Feature 5 — Herbie LLM-backed RFI / Submittal drafting.
//
// Wraps the deterministic draftRfi / draftSubmittal services with an LLM
// pre-step that writes the draft body Herbie thinks should be sent. The
// approval row carries:
//   • contextJson.draftBody  — the editable body the PM sees in the
//     Approval Center (textarea pre-fill).
//   • contextJson.sourceFacts — the small slice of project memory Herbie
//     used to draft the body. Surfaced as a "Herbie knew:" expandable
//     so the PM can audit Herbie's reasoning before pressing Approve.
//
// Both wrappers are network-graceful: if no LLM key is configured, we
// fall back to a deterministic stub body so the demo flow still works
// end-to-end without external dependencies.

import { db } from "../db";
import {
  approvalRequests,
  herbieFacts,
  herbieDecisions,
  notifications,
  projects,
} from "@shared/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { draftRfi } from "./rfi-draft.service";
import { draftSubmittal } from "./submittal-draft.service";

export interface HerbieDraftContext {
  tenantId: string;
  projectId: string;
  /** user_id of the human who triggered Herbie, or "herbie" if autonomous. */
  draftedBy?: string;
}

export interface HerbieRfiResult {
  rfiId: string;
  rfiNumber: string;
  approvalRequestId: string;
  draftBody: string;
  sourceFacts: SourceFact[];
}

export interface HerbieSubmittalResult {
  submittalId: string;
  submittalNumber: string;
  approvalRequestId: string;
  draftBody: string;
  sourceFacts: SourceFact[];
}

export interface SourceFact {
  predicate: string;
  value: string;
  source: string;
  confidence: number;
}

const RFI_SYSTEM_PROMPT = `You are Herbie, a construction PM's AI assistant. Draft a single RFI body in plain professional English. Cite specific details from the project context (drawings, specs, prior decisions) when relevant. Never invent facts. If a critical detail is missing, ask for it. Output ONLY the body text — no salutation, no signature, no markdown.`;

const SUBMITTAL_SYSTEM_PROMPT = `You are Herbie, a construction PM's AI assistant. Draft a single submittal cover memo in plain professional English describing what is being submitted, the spec section it satisfies, and any deviations or open questions. Output ONLY the memo body — no salutation, no signature, no markdown.`;

/**
 * Draft an RFI through Herbie. Persists via draftRfi (which creates the
 * rfis row + approval_request), then attaches `draftBody` and
 * `sourceFacts` to the approval's contextJson and drops a notification
 * pointing the PM at /approvals.
 */
export async function draftRFI(
  ctx: HerbieDraftContext,
  prompt: string,
): Promise<HerbieRfiResult> {
  const memory = await loadProjectMemory(ctx.tenantId, ctx.projectId);
  const userPrompt = buildUserPrompt(prompt, memory);
  const llmBody = await callLLM(RFI_SYSTEM_PROMPT, userPrompt);
  const draftBody = llmBody.trim() || stubRfiBody(prompt);

  // Best-effort first-line subject extraction; fall back to a generic.
  const subject = deriveSubjectFromPrompt(prompt) || "RFI";

  const result = await draftRfi({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    subject,
    question: draftBody,
    draftedBy: ctx.draftedBy ?? "herbie",
  });

  const sourceFacts = memory.facts.map(toSourceFact);

  await annotateApproval(result.approvalRequestId, {
    draftBody,
    sourceFacts,
    prompt,
    subject,
    rfiNumber: result.rfiNumber,
    drafted_by_herbie: true,
  });

  await markRfiDraftedByHerbie(ctx.tenantId, result.rfiId);

  await dropNotification({
    tenantId: ctx.tenantId,
    title: `Herbie drafted ${result.rfiNumber}`,
    message: `Awaiting your review in the Approval Center.`,
    entityType: "approval_request",
    entityId: result.approvalRequestId,
    actionUrl: "/approvals",
  });

  return {
    rfiId: result.rfiId,
    rfiNumber: result.rfiNumber,
    approvalRequestId: result.approvalRequestId,
    draftBody,
    sourceFacts,
  };
}

/**
 * Draft a Submittal through Herbie. See draftRFI for the shape of the
 * approval annotation and notification drop.
 */
export async function draftSubmittalWithHerbie(
  ctx: HerbieDraftContext,
  prompt: string,
): Promise<HerbieSubmittalResult> {
  const memory = await loadProjectMemory(ctx.tenantId, ctx.projectId);
  const userPrompt = buildUserPrompt(prompt, memory);
  const llmBody = await callLLM(SUBMITTAL_SYSTEM_PROMPT, userPrompt);
  const draftBody = llmBody.trim() || stubSubmittalBody(prompt);
  const name = deriveSubjectFromPrompt(prompt) || "Submittal";

  const result = await draftSubmittal({
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    name,
    description: draftBody,
    draftedBy: ctx.draftedBy ?? "herbie",
  });

  const sourceFacts = memory.facts.map(toSourceFact);

  await annotateApproval(result.approvalRequestId, {
    draftBody,
    sourceFacts,
    prompt,
    name,
    submittalNumber: result.submittalNumber,
    drafted_by_herbie: true,
  });

  await markSubmittalDraftedByHerbie(ctx.tenantId, result.submittalId);

  await dropNotification({
    tenantId: ctx.tenantId,
    title: `Herbie drafted ${result.submittalNumber}`,
    message: `Awaiting your review in the Approval Center.`,
    entityType: "approval_request",
    entityId: result.approvalRequestId,
    actionUrl: "/approvals",
  });

  return {
    submittalId: result.submittalId,
    submittalNumber: result.submittalNumber,
    approvalRequestId: result.approvalRequestId,
    draftBody,
    sourceFacts,
  };
}

// ---------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------

interface ProjectMemory {
  projectName: string | null;
  facts: Array<{
    predicate: string;
    object: string | null;
    sourceType: string;
    confidence: string | number;
  }>;
  decisions: Array<{ summary: string; decidedAt: Date | null }>;
}

async function loadProjectMemory(
  tenantId: string,
  projectId: string,
): Promise<ProjectMemory> {
  const [proj] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)))
    .limit(1);

  // Last 5 current (non-superseded) facts for the project. Cap at 5 to
  // keep the prompt — and the "Herbie knew:" UI list — readable.
  const facts = await db
    .select({
      predicate: herbieFacts.predicate,
      object: herbieFacts.object,
      sourceType: herbieFacts.sourceType,
      confidence: herbieFacts.confidence,
    })
    .from(herbieFacts)
    .where(
      and(
        eq(herbieFacts.tenantId, tenantId),
        eq(herbieFacts.projectId, projectId),
        isNull(herbieFacts.supersededById),
      ),
    )
    .orderBy(desc(herbieFacts.extractedAt))
    .limit(5);

  // Last 3 decisions provide PM-of-record posture.
  const decisions = await db
    .select({ summary: herbieDecisions.summary, decidedAt: herbieDecisions.decidedAt })
    .from(herbieDecisions)
    .where(
      and(
        eq(herbieDecisions.tenantId, tenantId),
        eq(herbieDecisions.projectId, projectId),
      ),
    )
    .orderBy(desc(herbieDecisions.decidedAt))
    .limit(3);

  return {
    projectName: proj?.name ?? null,
    facts,
    decisions,
  };
}

function buildUserPrompt(prompt: string, memory: ProjectMemory): string {
  const factsBlock = memory.facts.length
    ? memory.facts
        .map(
          (f) =>
            `- ${f.predicate}: ${f.object ?? "(no value)"} (source: ${f.sourceType}, confidence: ${f.confidence})`,
        )
        .join("\n")
    : "(no recorded facts)";

  const decisionsBlock = memory.decisions.length
    ? memory.decisions.map((d) => `- ${d.summary}`).join("\n")
    : "(no recent decisions)";

  return [
    memory.projectName ? `Project: ${memory.projectName}` : "Project: (unnamed)",
    "",
    "Known project facts:",
    factsBlock,
    "",
    "Recent project decisions:",
    decisionsBlock,
    "",
    "PM request:",
    prompt,
  ].join("\n");
}

async function callLLM(system: string, user: string): Promise<string> {
  try {
    const { getLLMProvider } = await import("./llm");
    const provider = getLLMProvider();
    if (provider.stub) return "";
    const res = await provider.chat({
      system,
      messages: [{ role: "user", content: user }],
      tier: "extraction",
      maxTokens: 1_024,
    });
    return res.text ?? "";
  } catch (err) {
    console.warn(
      "[herbie-draft] LLM call failed, falling back to stub:",
      err instanceof Error ? err.message : err,
    );
    return "";
  }
}

function stubRfiBody(prompt: string): string {
  return `Per the project record, please clarify the following:\n\n${prompt.trim()}\n\nResponse needed to maintain schedule. — Herbie (stub draft, no LLM key configured)`;
}

function stubSubmittalBody(prompt: string): string {
  return `Submittal cover memo:\n\n${prompt.trim()}\n\nReview against the relevant spec section and confirm acceptance. — Herbie (stub draft, no LLM key configured)`;
}

function deriveSubjectFromPrompt(prompt: string): string | null {
  const firstLine = prompt.split(/\r?\n/)[0]?.trim();
  if (!firstLine) return null;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function toSourceFact(f: ProjectMemory["facts"][number]): SourceFact {
  return {
    predicate: f.predicate,
    value: f.object ?? "",
    source: f.sourceType,
    confidence: typeof f.confidence === "string" ? Number(f.confidence) : f.confidence,
  };
}

/**
 * Merge our annotation block into the existing contextJson on the
 * approval_request created by draftRfi/draftSubmittal. Preserves any
 * keys the underlying service already stamped (rfiNumber, projectId,
 * etc.) so the PM-side UI keeps its existing context cards.
 */
async function annotateApproval(
  approvalRequestId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const [row] = await db
    .select({ context: approvalRequests.contextJson })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, approvalRequestId))
    .limit(1);
  const merged = { ...((row?.context as Record<string, unknown>) || {}), ...patch };
  await db
    .update(approvalRequests)
    .set({ contextJson: merged })
    .where(eq(approvalRequests.id, approvalRequestId));
}

async function markRfiDraftedByHerbie(tenantId: string, rfiId: string): Promise<void> {
  const { rfis } = await import("@shared/schema");
  await db
    .update(rfis)
    .set({ draftedByHerbie: true })
    .where(and(eq(rfis.tenantId, tenantId), eq(rfis.id, rfiId)));
}

async function markSubmittalDraftedByHerbie(
  tenantId: string,
  submittalId: string,
): Promise<void> {
  const { submittals } = await import("@shared/schema");
  await db
    .update(submittals)
    .set({ draftedByHerbie: true })
    .where(and(eq(submittals.tenantId, tenantId), eq(submittals.id, submittalId)));
}

async function dropNotification(input: {
  tenantId: string;
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  actionUrl: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      tenantId: input.tenantId,
      userId: null,
      type: "herbie_draft_pending",
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      priority: "normal",
      read: false,
      actionUrl: input.actionUrl,
    });
  } catch (err) {
    // Notification drop is best-effort; the approval row is the source
    // of truth and is already persisted.
    console.warn(
      "[herbie-draft] notification insert failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
