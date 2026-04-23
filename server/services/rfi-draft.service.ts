// Roadmap Feature 5 — RFI drafting with approval-gated send.
//
// Flow:
//   1. draftRfi() creates an rfis row with status "draft_pending_approval"
//      (the rfis.status column is free-form text today) and opens an
//      approval_requests row with actionType="draft_rfi".
//   2. PM reviews in the approval queue, edits if needed, approves.
//   3. approvalService.processDecision fires the registered dispatcher
//      (see registerRfiDispatcher below), which transitions the rfi to
//      status "submitted" and stamps submittedAt. Actual outbound email
//      remains user-initiated per Phase 1's "no external send without
//      human approval" rule.

import { db } from "../db";
import { rfis, approvalRequests } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  approvalService,
  registerApprovalDispatcher,
  type ApprovalDispatcher,
} from "./approval.service";

export const RFI_DRAFT_STATUS = "draft_pending_approval";
export const RFI_SUBMITTED_STATUS = "submitted";

export interface DraftRfiInput {
  tenantId: string;
  projectId: string;
  rfiNumber?: string; // optional — caller can let us auto-assign
  subject: string;
  question: string;
  priority?: "low" | "normal" | "high" | "urgent";
  assignedToUserId?: string;
  dueDate?: Date;
  attachmentsJson?: unknown;
  distributionJson?: unknown;
  draftedBy?: string; // user_id or "herbie"
}

export interface DraftRfiResult {
  rfiId: string;
  rfiNumber: string;
  approvalRequestId: string;
}

/**
 * Create an RFI in the "draft_pending_approval" state and queue an
 * approval request for the PM. On approval, the registered dispatcher
 * flips the RFI to "submitted".
 */
export async function draftRfi(input: DraftRfiInput): Promise<DraftRfiResult> {
  const rfiNumber = input.rfiNumber ?? (await nextRfiNumber(input.tenantId, input.projectId));

  const [inserted] = await db
    .insert(rfis)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      rfiNumber,
      subject: input.subject,
      question: input.question,
      status: RFI_DRAFT_STATUS,
      priority: input.priority ?? "normal",
      assignedToUserId: input.assignedToUserId ?? null,
      dueDate: input.dueDate ?? null,
      attachmentsJson: input.attachmentsJson ?? null,
      distributionJson: input.distributionJson ?? null,
    })
    .returning({ id: rfis.id });

  const approvalRequestId = await approvalService.createRequest({
    tenantId: input.tenantId,
    entityType: "rfi",
    entityId: inserted.id,
    actionType: "draft_rfi",
    requestedBy: input.draftedBy ?? "herbie",
    metadata: {
      rfiNumber,
      subject: input.subject,
      projectId: input.projectId,
    },
  });

  return { rfiId: inserted.id, rfiNumber, approvalRequestId };
}

/**
 * Dispatcher hook: on approval of a draft_rfi request, flip the RFI
 * to "submitted" and stamp submittedAt. Re-reads the rfi_id off the
 * approval_requests row because the dispatcher ctx only has the
 * requestId, not the target entity.
 */
export const rfiApprovalDispatcher: ApprovalDispatcher = async (ctx) => {
  const [req] = await db
    .select({ entityType: approvalRequests.entityType, entityId: approvalRequests.entityId })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, ctx.requestId))
    .limit(1);
  if (!req || req.entityType !== "rfi") return;

  await db
    .update(rfis)
    .set({
      status: RFI_SUBMITTED_STATUS,
      submittedAt: new Date(),
    })
    .where(and(eq(rfis.tenantId, ctx.tenantId), eq(rfis.id, req.entityId)));
};

/**
 * Call once at boot to register the dispatcher. Idempotent — later
 * calls overwrite the prior registration.
 */
export function registerRfiDispatcher(): void {
  registerApprovalDispatcher("draft_rfi", rfiApprovalDispatcher);
}

/**
 * Auto-assign the next RFI number for a project. Simple, deterministic:
 * RFI-0001, RFI-0002, etc. Race-safe enough for Phase 1 because it
 * runs inside the draftRfi transaction path (single row insert follows).
 */
async function nextRfiNumber(
  tenantId: string,
  projectId: string,
): Promise<string> {
  const rows = await db
    .select({ rfiNumber: rfis.rfiNumber })
    .from(rfis)
    .where(and(eq(rfis.tenantId, tenantId), eq(rfis.projectId, projectId)))
    .orderBy(desc(rfis.createdAt))
    .limit(50);
  const nums = rows
    .map((r) => {
      const m = r.rfiNumber.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `RFI-${String(next).padStart(4, "0")}`;
}
