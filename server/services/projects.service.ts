import { db } from "../db";
import { 
  projects, projectMilestones, dailyLogs, rfis, changeOrders,
  payApplications, costCodes, submittals, projectTasks
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, count } from "drizzle-orm";
import { auditService } from "./audit.service";
import { ensureDefaultProjectFolders } from "./project-documents.seed";
import { importBidJacketArtifactsToProjectDocuments } from "./bid-jacket-to-project-documents.service";

class ProjectsService {
  async listProjects(tenantId: string, filters?: {
    status?: string;
    projectManagerId?: string;
    clientId?: string;
  }) {
    let conditions = [eq(projects.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(projects.status, filters.status));
    }
    if (filters?.projectManagerId) {
      conditions.push(eq(projects.projectManagerId, filters.projectManagerId));
    }
    if (filters?.clientId) {
      conditions.push(eq(projects.clientId, filters.clientId));
    }

    return db.select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));
  }

  async getProject(tenantId: string, projectId: string) {
    const [project] = await db.select()
      .from(projects)
      .where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.id, projectId)
      ));
    return project;
  }

  async createProject(tenantId: string, data: {
    projectNumber: string;
    name: string;
    description?: string;
    clientId?: string;
    opportunityId?: string;
    bidProjectId?: string;
    projectManagerId?: string;
    type?: string;
    contractType?: string;
    contractValue?: string;
    startDate?: Date;
    expectedEndDate?: Date;
    addressJson?: unknown;
    gpsLat?: string;
    gpsLng?: string;
  }, actorId?: string) {
    const [project] = await db.insert(projects)
      .values({
        tenantId,
        ...data,
        status: "planning",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "project.created",
      actor: actorId || "system",
      entityType: "project",
      entityId: project.id,
      afterJson: project as Record<string, unknown>,
    });

    await ensureDefaultProjectFolders(tenantId, project.id);

    if (project.bidProjectId) {
      await importBidJacketArtifactsToProjectDocuments({
        tenantId,
        projectId: project.id,
        bidProjectId: project.bidProjectId,
      });
    }

    return project;
  }

  async updateProject(tenantId: string, projectId: string, data: Partial<{
    name: string;
    description: string;
    status: string;
    projectManagerId: string;
    contractValue: string;
    expectedEndDate: Date;
    actualEndDate: Date;
    completionPercentage: number;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)));

    const [project] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "project.updated",
      actor: actorId || "system",
      entityType: "project",
      entityId: projectId,
      beforeJson: before as Record<string, unknown>,
      afterJson: project as Record<string, unknown>,
    });

    return project;
  }

  async getMilestones(tenantId: string, projectId: string) {
    return db.select()
      .from(projectMilestones)
      .where(and(
        eq(projectMilestones.tenantId, tenantId),
        eq(projectMilestones.projectId, projectId)
      ))
      .orderBy(projectMilestones.sequenceOrder);
  }

  async createMilestone(tenantId: string, data: {
    projectId: string;
    name: string;
    description?: string;
    dueDate?: Date;
    paymentAmount?: string;
    sequenceOrder?: number;
  }, actorId?: string) {
    const [milestone] = await db.insert(projectMilestones)
      .values({
        tenantId,
        ...data,
        status: "pending",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "milestone.created",
      actor: actorId || "system",
      entityType: "project_milestone",
      entityId: milestone.id,
      afterJson: milestone as Record<string, unknown>,
    });

    return milestone;
  }

  async completeMilestone(tenantId: string, milestoneId: string, actorId?: string) {
    const [before] = await db.select()
      .from(projectMilestones)
      .where(and(eq(projectMilestones.tenantId, tenantId), eq(projectMilestones.id, milestoneId)));

    const [milestone] = await db.update(projectMilestones)
      .set({
        status: "completed",
        completedDate: new Date(),
      })
      .where(and(eq(projectMilestones.tenantId, tenantId), eq(projectMilestones.id, milestoneId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "milestone.completed",
      actor: actorId || "system",
      entityType: "project_milestone",
      entityId: milestoneId,
      beforeJson: before as Record<string, unknown>,
      afterJson: milestone as Record<string, unknown>,
    });

    return milestone;
  }

  async getDailyLogs(tenantId: string, projectId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    let conditions = [
      eq(dailyLogs.tenantId, tenantId),
      eq(dailyLogs.projectId, projectId),
    ];

    if (filters?.startDate) {
      conditions.push(gte(dailyLogs.logDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(dailyLogs.logDate, filters.endDate));
    }

    return db.select()
      .from(dailyLogs)
      .where(and(...conditions))
      .orderBy(desc(dailyLogs.logDate));
  }

  async createDailyLog(tenantId: string, data: {
    projectId: string;
    logDate: Date;
    authorUserId?: string;
    weatherJson?: unknown;
    workPerformedJson?: unknown;
    laborJson?: unknown;
    equipmentJson?: unknown;
    materialsJson?: unknown;
    visitorsJson?: unknown;
    issuesJson?: unknown;
    safetyNotesJson?: unknown;
    photosJson?: unknown;
    notes?: string;
  }) {
    const [log] = await db.insert(dailyLogs)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "daily_log.created",
      actor: data.authorUserId || "system",
      entityType: "daily_log",
      entityId: log.id,
      afterJson: log as Record<string, unknown>,
    });

    return log;
  }

  async submitDailyLog(tenantId: string, logId: string, actorId?: string) {
    const [log] = await db.update(dailyLogs)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(dailyLogs.tenantId, tenantId), eq(dailyLogs.id, logId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "daily_log.submitted",
      actor: actorId || "system",
      entityType: "daily_log",
      entityId: logId,
      afterJson: log as Record<string, unknown>,
    });

    return log;
  }

  async listRFIs(tenantId: string, projectId: string) {
    return db.select()
      .from(rfis)
      .where(and(
        eq(rfis.tenantId, tenantId),
        eq(rfis.projectId, projectId)
      ))
      .orderBy(desc(rfis.createdAt));
  }

  async createRFI(tenantId: string, data: {
    projectId: string;
    rfiNumber: string;
    subject: string;
    question: string;
    priority?: string;
    submittedByUserId?: string;
    assignedToUserId?: string;
    dueDate?: Date;
  }) {
    const [rfi] = await db.insert(rfis)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "rfi.created",
      actor: data.submittedByUserId || "system",
      entityType: "rfi",
      entityId: rfi.id,
      afterJson: rfi as Record<string, unknown>,
    });

    return rfi;
  }

  async answerRFI(tenantId: string, rfiId: string, data: {
    answer: string;
    answeredByUserId?: string;
  }) {
    const [rfi] = await db.update(rfis)
      .set({
        answer: data.answer,
        answeredByUserId: data.answeredByUserId,
        answeredAt: new Date(),
        status: "answered",
        updatedAt: new Date(),
      })
      .where(and(eq(rfis.tenantId, tenantId), eq(rfis.id, rfiId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "rfi.answered",
      actor: data.answeredByUserId || "system",
      entityType: "rfi",
      entityId: rfiId,
      afterJson: rfi as Record<string, unknown>,
    });

    return rfi;
  }

  async listChangeOrders(tenantId: string, projectId: string) {
    return db.select()
      .from(changeOrders)
      .where(and(
        eq(changeOrders.tenantId, tenantId),
        eq(changeOrders.projectId, projectId)
      ))
      .orderBy(desc(changeOrders.createdAt));
  }

  async createChangeOrder(tenantId: string, data: {
    projectId: string;
    coNumber: string;
    title: string;
    description?: string;
    changeType: string;
    amount?: string;
    daysImpact?: number;
    submittedByUserId?: string;
  }) {
    const [co] = await db.insert(changeOrders)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "change_order.created",
      actor: data.submittedByUserId || "system",
      entityType: "change_order",
      entityId: co.id,
      afterJson: co as Record<string, unknown>,
    });

    return co;
  }

  async approveChangeOrder(tenantId: string, coId: string, approvedByUserId: string) {
    const [co] = await db.update(changeOrders)
      .set({
        status: "approved",
        approvedByUserId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.id, coId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "change_order.approved",
      actor: approvedByUserId,
      entityType: "change_order",
      entityId: coId,
      afterJson: co as Record<string, unknown>,
    });

    return co;
  }

  async listPayApplications(tenantId: string, projectId: string) {
    return db.select()
      .from(payApplications)
      .where(and(
        eq(payApplications.tenantId, tenantId),
        eq(payApplications.projectId, projectId)
      ))
      .orderBy(desc(payApplications.payAppNumber));
  }

  async createPayApplication(tenantId: string, data: {
    projectId: string;
    payAppNumber: number;
    periodStart: Date;
    periodEnd: Date;
    scheduledValues?: string;
    previouslyBilled?: string;
    currentBilled?: string;
    retainageHeld?: string;
    retainageReleased?: string;
    netPayable?: string;
  }, actorId?: string) {
    const [payApp] = await db.insert(payApplications)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "pay_application.created",
      actor: actorId || "system",
      entityType: "pay_application",
      entityId: payApp.id,
      afterJson: payApp as Record<string, unknown>,
    });

    return payApp;
  }

  async getProjectSummary(tenantId: string, projectId: string) {
    const project = await this.getProject(tenantId, projectId);
    if (!project) return null;

    const milestones = await this.getMilestones(tenantId, projectId);
    const rfiList = await this.listRFIs(tenantId, projectId);
    const coList = await this.listChangeOrders(tenantId, projectId);

    const completedMilestones = milestones.filter(m => m.status === "completed").length;
    const openRFIs = rfiList.filter(r => r.status !== "answered" && r.status !== "closed").length;
    const pendingCOs = coList.filter(c => c.status === "pending" || c.status === "submitted").length;
    const approvedCOValue = coList
      .filter(c => c.status === "approved")
      .reduce((sum, c) => sum + parseFloat(c.amount || "0"), 0);

    return {
      project,
      milestonesTotal: milestones.length,
      milestonesCompleted: completedMilestones,
      milestonesProgress: milestones.length > 0 ? (completedMilestones / milestones.length) * 100 : 0,
      openRFIs,
      pendingChangeOrders: pendingCOs,
      approvedChangeOrderValue: approvedCOValue,
    };
  }

  async listSubmittals(tenantId: string, projectId: string) {
    return db.select()
      .from(submittals)
      .where(and(
        eq(submittals.tenantId, tenantId),
        eq(submittals.projectId, projectId)
      ))
      .orderBy(desc(submittals.createdAt));
  }

  async createSubmittal(tenantId: string, data: {
    projectId: string;
    submittalNumber: string;
    name: string;
    submittalType?: string;
    description?: string;
    priority?: string;
  }) {
    const [sub] = await db.insert(submittals)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "submittal.created",
      actor: "system",
      entityType: "submittal",
      entityId: sub.id,
      afterJson: sub as Record<string, unknown>,
    });

    return sub;
  }

  async listProjectTasks(tenantId: string, projectId: string) {
    return db.select()
      .from(projectTasks)
      .where(and(
        eq(projectTasks.tenantId, tenantId),
        eq(projectTasks.projectId, projectId)
      ))
      .orderBy(desc(projectTasks.createdAt));
  }

  async createProjectTask(tenantId: string, data: {
    projectId: string;
    name: string;
    description?: string;
    assignees?: string;
    priority?: string;
    dueDate?: Date;
    source?: string;
  }) {
    const [task] = await db.insert(projectTasks)
      .values({
        tenantId,
        ...data,
        status: "not_started",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "project_task.created",
      actor: "system",
      entityType: "project_task",
      entityId: task.id,
      afterJson: task as Record<string, unknown>,
    });

    return task;
  }

  async autoNumberRFI(tenantId: string, projectId: string): Promise<string> {
    const result = await db.select({ cnt: count() })
      .from(rfis)
      .where(and(eq(rfis.tenantId, tenantId), eq(rfis.projectId, projectId)));
    const n = (result[0]?.cnt ?? 0) + 1;
    return `RFI-${String(n).padStart(3, "0")}`;
  }

  async autoNumberSubmittal(tenantId: string, projectId: string): Promise<string> {
    const result = await db.select({ cnt: count() })
      .from(submittals)
      .where(and(eq(submittals.tenantId, tenantId), eq(submittals.projectId, projectId)));
    const n = (result[0]?.cnt ?? 0) + 1;
    return `SUB-${String(n).padStart(3, "0")}`;
  }
}

export const projectsService = new ProjectsService();
