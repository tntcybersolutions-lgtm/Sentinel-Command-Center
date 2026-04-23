// Roadmap Feature 10 / HERBIE.md draft_message tool.
//
// Creates a stored outbound-message draft + files an approval request
// with actionType="draft_external_message". Phase 1 never actually
// sends externally — the dispatcher registered below records the
// message as "approved_to_send" so the PM's existing outbound
// tooling (email client, portal UI, whatever ships) can pick it up.
// Actual delivery stays user-initiated.
//
// We store the draft in conversation_memory (already tenant-scoped,
// already has a jsonb value) under memoryType="herbie_outbound_draft"
// and memoryKey=<approval_request_id>. This avoids adding a new
// table for what is fundamentally a transient record the PM acts on
// once. If this category grows, graduate to a dedicated table.

import { db } from "../db";
import { conversationMemory, approvalRequests } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import {
  approvalService,
  registerApprovalDispatcher,
  type ApprovalDispatcher,
} from "./approval.service";

export type OutboundChannel = "email" | "sms" | "portal";

export interface DraftMessageInput {
  tenantId: string;
  projectId?: string;
  recipient: string;
  channel: OutboundChannel;
  subject?: string;
  body: string;
  draftedBy?: string;
}

export interface DraftMessageResult {
  draftId: string; // equal to the approval_request_id for lookup simplicity
  approvalRequestId: string;
}

const DRAFT_MEMORY_TYPE = "herbie_outbound_draft";
const SENT_MEMORY_TYPE = "herbie_outbound_approved";

export async function draftMessage(
  input: DraftMessageInput,
): Promise<DraftMessageResult> {
  const approvalRequestId = await approvalService.createRequest({
    tenantId: input.tenantId,
    entityType: "outbound_message",
    // The "entity" for an outbound message is the draft itself; we
    // use the approval request's id as the entity id so the
    // dispatcher can find the body by approvalRequestId alone.
    entityId: "pending", // overwritten below after we know the id
    actionType: "draft_external_message",
    requestedBy: input.draftedBy ?? "herbie",
    metadata: {
      projectId: input.projectId,
      recipient: input.recipient,
      channel: input.channel,
      subject: input.subject,
    },
  });

  // Patch the approval request so entityId == id (simplifies the
  // dispatcher). We accept one extra round-trip in exchange for not
  // adding a dedicated outbound_messages table.
  await db
    .update(approvalRequests)
    .set({ entityId: approvalRequestId })
    .where(eq(approvalRequests.id, approvalRequestId));

  await db.insert(conversationMemory).values({
    tenantId: input.tenantId,
    memoryType: DRAFT_MEMORY_TYPE,
    memoryKey: approvalRequestId,
    memoryValue: {
      recipient: input.recipient,
      channel: input.channel,
      subject: input.subject ?? null,
      body: input.body,
      projectId: input.projectId ?? null,
      draftedBy: input.draftedBy ?? "herbie",
    },
    context: "herbie_outbound_draft",
  });

  return { draftId: approvalRequestId, approvalRequestId };
}

export async function getMessageDraft(
  tenantId: string,
  approvalRequestId: string,
): Promise<{
  recipient: string;
  channel: OutboundChannel;
  subject: string | null;
  body: string;
  projectId: string | null;
} | undefined> {
  const rows = await db
    .select()
    .from(conversationMemory)
    .where(
      and(
        eq(conversationMemory.tenantId, tenantId),
        eq(conversationMemory.memoryType, DRAFT_MEMORY_TYPE),
        eq(conversationMemory.memoryKey, approvalRequestId),
      ),
    )
    .limit(1);
  if (!rows[0]) return undefined;
  const v = rows[0].memoryValue as any;
  return {
    recipient: v?.recipient ?? "",
    channel: (v?.channel as OutboundChannel) ?? "email",
    subject: v?.subject ?? null,
    body: v?.body ?? "",
    projectId: v?.projectId ?? null,
  };
}

/**
 * Dispatcher hook: when the PM approves a draft_external_message,
 * promote the draft record from "draft" memory to "approved-to-send".
 * This is the Phase 1 contract — the actual outbound delivery
 * happens outside this service, triggered by the PM's UI or a
 * downstream integration reading from the approved store.
 */
export const outboundMessageDispatcher: ApprovalDispatcher = async (ctx) => {
  const draft = await getMessageDraft(ctx.tenantId, ctx.requestId);
  if (!draft) return;

  await db.insert(conversationMemory).values({
    tenantId: ctx.tenantId,
    memoryType: SENT_MEMORY_TYPE,
    memoryKey: ctx.requestId,
    memoryValue: {
      ...draft,
      approvedBy: ctx.actor,
      approvedAt: new Date().toISOString(),
      approvalNotes: ctx.notes ?? null,
    },
    context: "herbie_outbound_approved",
  });
};

export function registerOutboundMessageDispatcher(): void {
  registerApprovalDispatcher(
    "draft_external_message",
    outboundMessageDispatcher,
  );
}
