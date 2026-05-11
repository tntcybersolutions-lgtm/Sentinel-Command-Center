import { db } from "../db";
import { bidProjects, bidDecisions, bidTasks, bidArtifacts, bidSubmissions, bidOutcomes, opportunities } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { auditService } from "./audit.service";
import { approvalService } from "./approval.service";

export type BidStatus = "draft" | "in_progress" | "ready_for_review" | "approved" | "submitted" | "won" | "lost" | "cancelled";

export interface CreateBidProjectInput {
  tenantId: string;
  opportunityId: string;
  ownerUserId: string;
}

export interface BidDecisionInput {
  tenantId: string;
  bidProjectId: string;
  decision: "bid" | "no_bid";
  decidedBy: string;
  rationale: string;
}

export class BidService {
  async createBidProject(input: CreateBidProjectInput): Promise<string> {
    const [project] = await db.insert(bidProjects).values({
      tenantId: input.tenantId,
      opportunityId: input.opportunityId,
      ownerUserId: input.ownerUserId,
      status: "draft",
    }).returning({ id: bidProjects.id });

    await db.update(opportunities)
      .set({ status: "approved_to_bid" })
      .where(eq(opportunities.id, input.opportunityId));

    const defaultTasks = [
      { type: "proposal_draft", title: "Draft Proposal Narrative" },
      { type: "compliance_review", title: "Complete Compliance Checklist" },
      { type: "pricing", title: "Prepare Pricing Schedule" },
      { type: "capability_statement", title: "Update Capability Statement" },
      { type: "past_performance", title: "Compile Past Performance References" },
      { type: "technical_review", title: "Technical Review" },
      { type: "final_review", title: "Final Review & QC" },
    ];

    for (const task of defaultTasks) {
      await db.insert(bidTasks).values({
        tenantId: input.tenantId,
        bidProjectId: project.id,
        taskType: task.type,
        title: task.title,
        status: "pending",
      });
    }

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: "bid_project_created",
      actor: input.ownerUserId,
      entityType: "bid_project",
      entityId: project.id,
      afterJson: input as unknown as Record<string, unknown>,
    });

    return project.id;
  }

  async recordBidDecision(input: BidDecisionInput): Promise<string> {
    const [decision] = await db.insert(bidDecisions).values({
      tenantId: input.tenantId,
      bidProjectId: input.bidProjectId,
      decision: input.decision,
      decidedBy: input.decidedBy,
      rationaleJson: { rationale: input.rationale },
      decidedAt: new Date(),
    }).returning({ id: bidDecisions.id });

    const newStatus = input.decision === "bid" ? "in_progress" : "cancelled";
    await db.update(bidProjects)
      .set({ status: newStatus })
      .where(eq(bidProjects.id, input.bidProjectId));

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: `bid_decision_${input.decision}`,
      actor: input.decidedBy,
      entityType: "bid_project",
      entityId: input.bidProjectId,
      afterJson: input as unknown as Record<string, unknown>,
    });

    return decision.id;
  }

  async createArtifact(
    tenantId: string,
    bidProjectId: string,
    artifactType: string,
    content: string,
    createdBy: string
  ): Promise<string> {
    const existing = await db.select()
      .from(bidArtifacts)
      .where(and(
        eq(bidArtifacts.bidProjectId, bidProjectId),
        eq(bidArtifacts.artifactType, artifactType)
      ))
      .orderBy(desc(bidArtifacts.version))
      .limit(1);

    const nextVersion = existing.length > 0 ? existing[0].version + 1 : 1;
    const contentHash = await this.hashContent(content);

    const [artifact] = await db.insert(bidArtifacts).values({
      tenantId,
      bidProjectId,
      artifactType,
      version: nextVersion,
      status: "draft",
      content,
      contentHash,
    }).returning({ id: bidArtifacts.id });

    await auditService.logEvent({
      tenantId,
      eventType: "bid_artifact_created",
      actor: createdBy,
      entityType: "bid_artifact",
      entityId: artifact.id,
      afterJson: { artifactType, version: nextVersion },
    });

    return artifact.id;
  }

  async submitBid(
    tenantId: string,
    bidProjectId: string,
    submittedBy: string,
    method: string,
    confirmationData: Record<string, unknown>
  ): Promise<string> {
    await approvalService.requireApproval(
      tenantId,
      "bid_project",
      bidProjectId,
      "bid_submission",
      submittedBy
    );

    const [submission] = await db.insert(bidSubmissions).values({
      tenantId,
      bidProjectId,
      submittedAt: new Date(),
      method,
      confirmationJson: confirmationData,
    }).returning({ id: bidSubmissions.id });

    await db.update(bidProjects)
      .set({ status: "submitted" })
      .where(eq(bidProjects.id, bidProjectId));

    await auditService.logEvent({
      tenantId,
      eventType: "bid_submitted",
      actor: submittedBy,
      entityType: "bid_project",
      entityId: bidProjectId,
      afterJson: { method, submissionId: submission.id },
    });

    return submission.id;
  }

  async recordOutcome(
    tenantId: string,
    bidProjectId: string,
    outcome: "won" | "lost",
    recordedBy: string,
    debriefData?: Record<string, unknown>
  ): Promise<string> {
    const [outcomeRecord] = await db.insert(bidOutcomes).values({
      tenantId,
      bidProjectId,
      outcome,
      decidedAt: new Date(),
      debriefJson: debriefData,
    }).returning({ id: bidOutcomes.id });

    await db.update(bidProjects)
      .set({ status: outcome })
      .where(eq(bidProjects.id, bidProjectId));

    await auditService.logEvent({
      tenantId,
      eventType: `bid_outcome_${outcome}`,
      actor: recordedBy,
      entityType: "bid_project",
      entityId: bidProjectId,
      afterJson: { outcome, debriefData },
    });

    return outcomeRecord.id;
  }

  async updateTaskStatus(
    tenantId: string,
    taskId: string,
    status: string,
    updatedBy: string
  ): Promise<void> {
    await db.update(bidTasks)
      .set({ status })
      .where(eq(bidTasks.id, taskId));

    await auditService.logEvent({
      tenantId,
      eventType: "bid_task_updated",
      actor: updatedBy,
      entityType: "bid_task",
      entityId: taskId,
      afterJson: { status },
    });
  }

  async getBidProject(tenantId: string, projectId: string) {
    const [project] = await db.select()
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        eq(bidProjects.id, projectId)
      ));
    return project;
  }

  async getBidTasks(tenantId: string, projectId: string) {
    return db.select()
      .from(bidTasks)
      .where(and(
        eq(bidTasks.tenantId, tenantId),
        eq(bidTasks.bidProjectId, projectId)
      ));
  }

  async getBidArtifacts(tenantId: string, projectId: string) {
    return db.select()
      .from(bidArtifacts)
      .where(and(
        eq(bidArtifacts.tenantId, tenantId),
        eq(bidArtifacts.bidProjectId, projectId)
      ))
      .orderBy(desc(bidArtifacts.version));
  }

  async getActiveBidProjects(tenantId: string) {
    return db.select()
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        sql`COALESCE(LOWER(${bidProjects.status}), '') NOT IN ('submitted', 'won', 'lost', 'declined', 'cancelled', 'archived')`
      ));
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }
}

export const bidService = new BidService();
