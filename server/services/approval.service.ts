import { db } from "../db";
import { approvalRequests, approvalActions, policyViolations, approvalPolicies } from "@shared/schema";
import { eq, and, desc, or } from "drizzle-orm";
import { auditService } from "./audit.service";

export type ApprovalActionType = 
  | "bid_decision"
  | "email_send"
  | "calendar_publish"
  | "bid_submission"
  | "document_release"
  | "external_commitment"
  | "document_upload"
  | "document_delete"
  | "share_link_create"
  | "teams_message"
  | "teams_channel_create"
  | "create_po"
  | "hire_employee"
  | "terminate_employee"
  | "create_project"
  | "close_project"
  | "deactivate_vendor"
  | "update_control_status"
  | "create_campaign"
  | "launch_campaign"
  | "void_invoice"
  | "pay_invoice"
  | "invoice_create"
  | "invoice_send"
  | "payment_record"
  | "bill_create"
  | "expense_create";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRequestInput {
  tenantId: string;
  entityType: string;
  entityId: string;
  actionType: ApprovalActionType;
  requestedBy: string;
  requestedFrom?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ApprovalDecision {
  requestId: string;
  actor: string;
  decision: "approved" | "denied";
  notes?: string;
}

export class ApprovalService {
  async createRequest(input: ApprovalRequestInput): Promise<string> {
    const [request] = await db.insert(approvalRequests).values({
      tenantId: input.tenantId,
      entityType: input.entityType,
      entityId: input.entityId,
      actionType: input.actionType,
      requestedBy: input.requestedBy,
      requestedFrom: input.requestedFrom,
      status: "pending",
      expiresAt: input.expiresAt,
    }).returning({ id: approvalRequests.id });

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: "approval_request_created",
      actor: input.requestedBy,
      entityType: "approval_request",
      entityId: request.id,
      afterJson: input as unknown as Record<string, unknown>,
    });

    return request.id;
  }

  async processDecision(decision: ApprovalDecision, tenantId: string): Promise<boolean> {
    // Idempotent: if an action already exists for this request, return
    // that prior outcome without writing a second row. Without this
    // guard, double-submit of a decision (network retry, rapid clicks,
    // dispatcher replays) would duplicate approval_actions rows and
    // re-fire the audit event.
    const prior = await db.select({
      id: approvalActions.id,
      decision: approvalActions.decision,
    })
      .from(approvalActions)
      .where(and(
        eq(approvalActions.tenantId, tenantId),
        eq(approvalActions.approvalRequestId, decision.requestId),
      ))
      .limit(1);

    if (prior.length > 0) {
      return prior[0].decision === "approved";
    }

    await db.insert(approvalActions).values({
      tenantId,
      approvalRequestId: decision.requestId,
      actor: decision.actor,
      decision: decision.decision,
      notes: decision.notes,
      decidedAt: new Date(),
    }).returning({ id: approvalActions.id });

    await db.update(approvalRequests)
      .set({ status: decision.decision })
      .where(eq(approvalRequests.id, decision.requestId));

    await auditService.logEvent({
      tenantId,
      eventType: `approval_${decision.decision}`,
      actor: decision.actor,
      entityType: "approval_request",
      entityId: decision.requestId,
      afterJson: decision as unknown as Record<string, unknown>,
    });

    return decision.decision === "approved";
  }

  async checkApproval(
    tenantId: string,
    entityType: string,
    entityId: string,
    actionType: ApprovalActionType
  ): Promise<{ approved: boolean; requestId?: string }> {
    const existing = await db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId, entityId),
        eq(approvalRequests.actionType, actionType),
        eq(approvalRequests.status, "approved")
      ))
      .limit(1);

    if (existing.length > 0) {
      return { approved: true, requestId: existing[0].id };
    }
    return { approved: false };
  }

  async requireApproval(
    tenantId: string,
    entityType: string,
    entityId: string,
    actionType: ApprovalActionType,
    actor: string
  ): Promise<void> {
    const check = await this.checkApproval(tenantId, entityType, entityId, actionType);
    
    if (!check.approved) {
      await db.insert(policyViolations).values({
        tenantId,
        policyKey: `require_approval_${actionType}`,
        entityType,
        entityId,
        attemptedAction: actionType,
        blockedReason: "Approval required but not granted",
      });

      throw new Error(`Approval required for ${actionType} on ${entityType}:${entityId}`);
    }
  }

  async getPendingApprovals(tenantId: string, userId?: string) {
    let query = db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.status, "pending")
      ))
      .orderBy(desc(approvalRequests.createdAt));

    return query;
  }

  async getApprovalHistory(tenantId: string, entityType: string, entityId: string) {
    return db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.entityType, entityType),
        eq(approvalRequests.entityId, entityId)
      ))
      .orderBy(desc(approvalRequests.createdAt));
  }
}

export const approvalService = new ApprovalService();
