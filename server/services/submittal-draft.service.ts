// Roadmap Feature 5 — Submittal drafting with approval-gated send.
// Mirrors rfi-draft.service.ts. Separate file because the entity
// shape and number series differ; keeping them distinct avoids
// dispatcher cross-wiring and makes future per-entity evolution
// (different draft prompts, different reviewer rules) trivial.

import { db } from "../db";
import { submittals, approvalRequests } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  approvalService,
  registerApprovalDispatcher,
  type ApprovalDispatcher,
} from "./approval.service";

export const SUBMITTAL_DRAFT_STATUS = "draft_pending_approval";
export const SUBMITTAL_SUBMITTED_STATUS = "submitted";

export interface DraftSubmittalInput {
  tenantId: string;
  projectId: string;
  submittalNumber?: string;
  name: string;
  submittalType?: string;
  description?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  managerName?: string;
  contractorName?: string;
  approvers?: string;
  reference?: string;
  attachmentsJson?: unknown;
  draftedBy?: string;
}

export interface DraftSubmittalResult {
  submittalId: string;
  submittalNumber: string;
  approvalRequestId: string;
}

export async function draftSubmittal(
  input: DraftSubmittalInput,
): Promise<DraftSubmittalResult> {
  const submittalNumber =
    input.submittalNumber ?? (await nextSubmittalNumber(input.tenantId, input.projectId));

  const [inserted] = await db
    .insert(submittals)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      submittalNumber,
      name: input.name,
      submittalType: input.submittalType ?? null,
      description: input.description ?? null,
      status: SUBMITTAL_DRAFT_STATUS,
      priority: input.priority ?? "medium",
      managerName: input.managerName ?? null,
      contractorName: input.contractorName ?? null,
      approvers: input.approvers ?? null,
      reference: input.reference ?? null,
      attachmentsJson: input.attachmentsJson ?? null,
    })
    .returning({ id: submittals.id });

  const approvalRequestId = await approvalService.createRequest({
    tenantId: input.tenantId,
    entityType: "submittal",
    entityId: inserted.id,
    actionType: "draft_submittal",
    requestedBy: input.draftedBy ?? "herbie",
    metadata: {
      submittalNumber,
      name: input.name,
      projectId: input.projectId,
    },
  });

  return {
    submittalId: inserted.id,
    submittalNumber,
    approvalRequestId,
  };
}

export const submittalApprovalDispatcher: ApprovalDispatcher = async (ctx) => {
  const [req] = await db
    .select({
      entityType: approvalRequests.entityType,
      entityId: approvalRequests.entityId,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.id, ctx.requestId))
    .limit(1);
  if (!req || req.entityType !== "submittal") return;

  await db
    .update(submittals)
    .set({
      status: SUBMITTAL_SUBMITTED_STATUS,
      submittedAt: new Date(),
    })
    .where(
      and(eq(submittals.tenantId, ctx.tenantId), eq(submittals.id, req.entityId)),
    );
};

export function registerSubmittalDispatcher(): void {
  registerApprovalDispatcher("draft_submittal", submittalApprovalDispatcher);
}

async function nextSubmittalNumber(
  tenantId: string,
  projectId: string,
): Promise<string> {
  const rows = await db
    .select({ submittalNumber: submittals.submittalNumber })
    .from(submittals)
    .where(and(eq(submittals.tenantId, tenantId), eq(submittals.projectId, projectId)))
    .orderBy(desc(submittals.createdAt))
    .limit(50);
  const nums = rows
    .map((r) => {
      const m = r.submittalNumber.match(/(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `SUB-${String(next).padStart(4, "0")}`;
}
