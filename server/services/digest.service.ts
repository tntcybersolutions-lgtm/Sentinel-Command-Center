import { db } from "../db";
import { opportunities, bidProjects, approvalRequests, calendarEvents, sourceRuns, integrationHealth } from "@shared/schema";
import { eq, and, gte, lte, desc, count, sql, notInArray } from "drizzle-orm";
import { auditService } from "./audit.service";
import { queueService } from "../queue/queue.service";

export interface ExecutiveDigest {
  generatedAt: Date;
  tenantId: string;
  summary: {
    pipelineValue: number;
    activeOpportunities: number;
    pendingApprovals: number;
    upcomingDeadlines: number;
    activeBids: number;
    integrationsHealthy: number;
    integrationsUnhealthy: number;
  };
  topOpportunities: Array<{
    id: string;
    title: string;
    estimatedValue: number;
    dueAt: Date | null;
    score: number;
    recommendedAction: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    entityType: string;
    actionType: string;
    requestedBy: string;
    createdAt: Date;
    hoursWaiting: number;
  }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueAt: Date;
    daysRemaining: number;
    status: string;
  }>;
  activeBids: Array<{
    id: string;
    opportunityTitle: string;
    status: string;
    tasksCompleted: number;
    totalTasks: number;
  }>;
  exceptions: Array<{
    type: string;
    severity: "warning" | "error";
    message: string;
    entityType?: string;
    entityId?: string;
  }>;
  recentIngestionStats: {
    lastRunAt: Date | null;
    opportunitiesCreated: number;
    opportunitiesUpdated: number;
    errors: number;
  };
}

export class DigestService {
  async generateExecutiveDigest(tenantId: string): Promise<ExecutiveDigest> {
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const activeOpps = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.status, "open")
      ));

    const pipelineValue = activeOpps.reduce((sum, opp) => sum + Number(opp.contractValue || 0), 0);

    const upcomingDeadlineOpps = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.status, "open"),
        gte(opportunities.dueAt, now),
        lte(opportunities.dueAt, sevenDaysFromNow)
      ))
      .orderBy(opportunities.dueAt)
      .limit(10);

    const pendingApprovalRequests = await db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.status, "pending")
      ))
      .orderBy(approvalRequests.createdAt);

    const activeBidProjects = await db.select()
      .from(bidProjects)
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        notInArray(bidProjects.status, ["won", "lost", "cancelled", "no_bid"])
      ));

    const healthRecords = await db.select()
      .from(integrationHealth)
      .where(eq(integrationHealth.tenantId, tenantId));

    const healthyCount = healthRecords.filter(h => h.status === "ok").length;
    const unhealthyCount = healthRecords.filter(h => h.status !== "ok").length;

    const recentRuns = await db.select()
      .from(sourceRuns)
      .where(and(
        eq(sourceRuns.tenantId, tenantId),
        gte(sourceRuns.startedAt, twentyFourHoursAgo)
      ))
      .orderBy(desc(sourceRuns.startedAt));

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    
    for (const run of recentRuns) {
      const counts = run.countsJson as { created?: number; updated?: number; errors?: number } | null;
      if (counts) {
        totalCreated += counts.created || 0;
        totalUpdated += counts.updated || 0;
        totalErrors += counts.errors || 0;
      }
    }

    const exceptions: ExecutiveDigest["exceptions"] = [];

    for (const approval of pendingApprovalRequests) {
      const hoursWaiting = (now.getTime() - new Date(approval.createdAt!).getTime()) / (1000 * 60 * 60);
      if (hoursWaiting > 24) {
        exceptions.push({
          type: "approval_stalled",
          severity: hoursWaiting > 48 ? "error" : "warning",
          message: `Approval request pending for ${Math.floor(hoursWaiting)} hours`,
          entityType: "approval_request",
          entityId: approval.id,
        });
      }
    }

    for (const opp of upcomingDeadlineOpps) {
      if (opp.dueAt) {
        const daysRemaining = Math.ceil((new Date(opp.dueAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 3) {
          exceptions.push({
            type: "deadline_imminent",
            severity: daysRemaining <= 1 ? "error" : "warning",
            message: `"${opp.title}" due in ${daysRemaining} days`,
            entityType: "opportunity",
            entityId: opp.id,
          });
        }
      }
    }

    for (const health of healthRecords) {
      if (health.status === "error") {
        exceptions.push({
          type: "integration_failure",
          severity: "error",
          message: `${health.integrationKey} integration is unhealthy`,
          entityType: "integration",
          entityId: health.integrationKey,
        });
      }
    }

    const digest: ExecutiveDigest = {
      generatedAt: now,
      tenantId,
      summary: {
        pipelineValue,
        activeOpportunities: activeOpps.length,
        pendingApprovals: pendingApprovalRequests.length,
        upcomingDeadlines: upcomingDeadlineOpps.length,
        activeBids: activeBidProjects.length,
        integrationsHealthy: healthyCount,
        integrationsUnhealthy: unhealthyCount,
      },
      topOpportunities: activeOpps
        .sort((a, b) => Number(b.contractValue || 0) - Number(a.contractValue || 0))
        .slice(0, 5)
        .map(opp => ({
          id: opp.id,
          title: opp.title,
          estimatedValue: Number(opp.contractValue || 0),
          dueAt: opp.dueAt,
          score: 0,
          recommendedAction: "review",
        })),
      pendingApprovals: pendingApprovalRequests.map(approval => ({
        id: approval.id,
        entityType: approval.entityType,
        actionType: approval.actionType,
        requestedBy: approval.requestedBy || "unknown",
        createdAt: new Date(approval.createdAt!),
        hoursWaiting: Math.floor((now.getTime() - new Date(approval.createdAt!).getTime()) / (1000 * 60 * 60)),
      })),
      upcomingDeadlines: upcomingDeadlineOpps.map(opp => ({
        id: opp.id,
        title: opp.title,
        dueAt: opp.dueAt!,
        daysRemaining: Math.ceil((new Date(opp.dueAt!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        status: opp.status,
      })),
      activeBids: activeBidProjects.map(bid => ({
        id: bid.id,
        opportunityTitle: "TBD",
        status: bid.status,
        tasksCompleted: 0,
        totalTasks: 0,
      })),
      exceptions,
      recentIngestionStats: {
        lastRunAt: recentRuns[0]?.startedAt || null,
        opportunitiesCreated: totalCreated,
        opportunitiesUpdated: totalUpdated,
        errors: totalErrors,
      },
    };

    await auditService.logEvent({
      tenantId,
      eventType: "executive_digest_generated",
      actor: "system",
      entityType: "digest",
      entityId: now.toISOString(),
      afterJson: { 
        summaryStats: digest.summary,
        exceptionsCount: exceptions.length,
      },
    });

    return digest;
  }

  async scheduleDigestDelivery(tenantId: string): Promise<string | null> {
    return queueService.enqueue({
      tenantId,
      jobType: "daily_digest",
      payload: { tenantId },
      idempotencyKey: `daily-digest-${tenantId}-${new Date().toISOString().split('T')[0]}`,
    });
  }

  async getExceptionReport(tenantId: string): Promise<ExecutiveDigest["exceptions"]> {
    const digest = await this.generateExecutiveDigest(tenantId);
    return digest.exceptions;
  }

  async getDeadlineAlerts(tenantId: string, daysThreshold = 7) {
    const now = new Date();
    const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);

    return db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        eq(opportunities.status, "open"),
        gte(opportunities.dueAt, now),
        lte(opportunities.dueAt, thresholdDate)
      ))
      .orderBy(opportunities.dueAt);
  }

  async monitorDeadlines(tenantId: string): Promise<void> {
    const alerts = await this.getDeadlineAlerts(tenantId, 3);

    for (const opp of alerts) {
      if (opp.dueAt) {
        const daysRemaining = Math.ceil(
          (new Date(opp.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        if (daysRemaining <= 1) {
          await auditService.logEvent({
            tenantId,
            eventType: "deadline_alert_critical",
            actor: "system",
            entityType: "opportunity",
            entityId: opp.id,
            afterJson: { 
              title: opp.title,
              dueAt: opp.dueAt,
              daysRemaining,
            },
          });
        }
      }
    }
  }
}

export const digestService = new DigestService();
