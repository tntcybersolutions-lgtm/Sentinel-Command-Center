import { db } from "../db";
import { 
  employees, credentials,
  trainingCourses, trainingRecords, safetyIncidents, safetyBriefings,
  onboardingTasks, performanceReviews, users
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, or } from "drizzle-orm";
import { auditService } from "./audit.service";

interface OnboardingProgress {
  employeeId: string;
  employeeName: string;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  overdueTasks: number;
  completionPercentage: number;
}

class HRService {
  async listEmployees(tenantId: string, filters?: {
    status?: string;
    department?: string;
    employmentType?: string;
  }) {
    let conditions = [eq(employees.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(employees.status, filters.status));
    }
    if (filters?.department) {
      conditions.push(eq(employees.department, filters.department));
    }
    if (filters?.employmentType) {
      conditions.push(eq(employees.employmentType, filters.employmentType));
    }

    return db.select()
      .from(employees)
      .where(and(...conditions))
      .orderBy(employees.lastName, employees.firstName);
  }

  async getEmployee(tenantId: string, employeeId: string) {
    const [employee] = await db.select()
      .from(employees)
      .where(and(
        eq(employees.tenantId, tenantId),
        eq(employees.id, employeeId)
      ));
    return employee;
  }

  async createEmployee(tenantId: string, data: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    department?: string;
    jobTitle?: string;
    employmentType?: string;
    hireDate?: Date;
    supervisorId?: string;
    hourlyRate?: string;
    userId?: string;
  }, actorId?: string) {
    const [employee] = await db.insert(employees)
      .values({
        tenantId,
        ...data,
        status: "active",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "employee.created",
      actor: actorId || "system",
      entityType: "employee",
      entityId: employee.id,
      afterJson: employee as Record<string, unknown>,
    });

    await this.createDefaultOnboardingTasks(tenantId, employee.id);

    return employee;
  }

  async updateEmployee(tenantId: string, employeeId: string, data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    department: string;
    jobTitle: string;
    employmentType: string;
    supervisorId: string;
    hourlyRate: string;
    status: string;
    terminationDate: Date;
    terminationReason: string;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(employees)
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)));

    const [employee] = await db.update(employees)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "employee.updated",
      actor: actorId || "system",
      entityType: "employee",
      entityId: employeeId,
      beforeJson: before as Record<string, unknown>,
      afterJson: employee as Record<string, unknown>,
    });

    return employee;
  }

  async terminateEmployee(tenantId: string, employeeId: string, data: {
    terminationDate: Date;
    terminationReason?: string;
    actorId?: string;
  }) {
    return this.updateEmployee(tenantId, employeeId, {
      status: "terminated",
      terminationDate: data.terminationDate,
      terminationReason: data.terminationReason,
    }, data.actorId);
  }

  async createDefaultOnboardingTasks(tenantId: string, employeeId: string) {
    const defaultTasks = [
      { taskType: "document", taskName: "Complete I-9 Form", description: "Employment eligibility verification" },
      { taskType: "document", taskName: "Complete W-4 Form", description: "Federal tax withholding" },
      { taskType: "document", taskName: "Sign Employee Handbook Acknowledgment", description: "Acknowledge receipt of employee handbook" },
      { taskType: "document", taskName: "Emergency Contact Information", description: "Provide emergency contact details" },
      { taskType: "document", taskName: "Direct Deposit Form", description: "Set up payroll direct deposit" },
      { taskType: "training", taskName: "Complete Safety Orientation", description: "General workplace safety training" },
      { taskType: "training", taskName: "Complete OSHA Training", description: "Required OSHA safety training" },
      { taskType: "equipment", taskName: "Issue PPE", description: "Personal protective equipment issuance" },
      { taskType: "access", taskName: "Set Up System Access", description: "Create login credentials and access cards" },
      { taskType: "orientation", taskName: "Complete Department Orientation", description: "Meet team and learn procedures" },
    ];

    for (const task of defaultTasks) {
      await db.insert(onboardingTasks)
        .values({
          tenantId,
          employeeId,
          ...task,
          status: "pending",
          dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
    }
  }

  async getOnboardingProgress(tenantId: string, employeeId?: string): Promise<OnboardingProgress[]> {
    let conditions = [eq(onboardingTasks.tenantId, tenantId)];
    if (employeeId) {
      conditions.push(eq(onboardingTasks.employeeId, employeeId));
    }

    const tasks = await db.select({
      task: onboardingTasks,
      employee: employees,
    })
      .from(onboardingTasks)
      .innerJoin(employees, eq(onboardingTasks.employeeId, employees.id))
      .where(and(...conditions));

    const grouped = new Map<string, { employee: typeof employees.$inferSelect; tasks: (typeof onboardingTasks.$inferSelect)[] }>();
    
    for (const row of tasks) {
      const existing = grouped.get(row.employee.id);
      if (existing) {
        existing.tasks.push(row.task);
      } else {
        grouped.set(row.employee.id, { employee: row.employee, tasks: [row.task] });
      }
    }

    const now = new Date();
    const result: OnboardingProgress[] = [];

    for (const [id, data] of Array.from(grouped.entries())) {
      const completed = data.tasks.filter((t: typeof onboardingTasks.$inferSelect) => t.status === "completed").length;
      const overdue = data.tasks.filter((t: typeof onboardingTasks.$inferSelect) => t.status === "pending" && t.dueAt && t.dueAt < now).length;

      result.push({
        employeeId: id,
        employeeName: `${data.employee.firstName} ${data.employee.lastName}`,
        totalTasks: data.tasks.length,
        completedTasks: completed,
        pendingTasks: data.tasks.length - completed,
        overdueTasks: overdue,
        completionPercentage: data.tasks.length > 0 ? (completed / data.tasks.length) * 100 : 0,
      });
    }

    return result;
  }

  async completeOnboardingTask(tenantId: string, taskId: string, data: {
    completedByUserId?: string;
    documentUrl?: string;
  }) {
    const [task] = await db.update(onboardingTasks)
      .set({
        status: "completed",
        completedAt: new Date(),
        completedByUserId: data.completedByUserId,
        documentUrl: data.documentUrl,
      })
      .where(and(eq(onboardingTasks.tenantId, tenantId), eq(onboardingTasks.id, taskId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "onboarding_task.completed",
      actor: data.completedByUserId || "system",
      entityType: "onboarding_task",
      entityId: taskId,
      afterJson: task as Record<string, unknown>,
    });

    return task;
  }

  async getEmployeeCredentials(tenantId: string, employeeId: string) {
    return db.select()
      .from(credentials)
      .where(and(
        eq(credentials.tenantId, tenantId),
        eq(credentials.employeeId, employeeId)
      ))
      .orderBy(desc(credentials.createdAt));
  }

  async addEmployeeCredential(tenantId: string, data: {
    employeeId: string;
    credentialType: string;
    credentialName: string;
    issuingAuthority?: string;
    credentialNumber?: string;
    issuedAt?: Date;
    expiresAt?: Date;
    documentUrl?: string;
  }, actorId?: string) {
    const [cred] = await db.insert(credentials)
      .values({
        tenantId,
        ...data,
        status: "active",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "credential.added",
      actor: actorId || "system",
      entityType: "credential",
      entityId: cred.id,
      afterJson: cred as Record<string, unknown>,
    });

    return cred;
  }

  async getExpiringCredentials(tenantId: string, daysAhead: number = 30) {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    return db.select({
      credential: credentials,
      employee: employees,
    })
      .from(credentials)
      .innerJoin(employees, eq(credentials.employeeId, employees.id))
      .where(and(
        eq(credentials.tenantId, tenantId),
        eq(credentials.status, "active"),
        lte(credentials.expiresAt, futureDate),
        gte(credentials.expiresAt, new Date())
      ))
      .orderBy(credentials.expiresAt);
  }

  async listTrainingCourses(tenantId: string, filters?: {
    category?: string;
    isRequired?: boolean;
  }) {
    let conditions = [eq(trainingCourses.tenantId, tenantId)];
    
    if (filters?.category) {
      conditions.push(eq(trainingCourses.category, filters.category));
    }
    if (filters?.isRequired !== undefined) {
      conditions.push(eq(trainingCourses.isRequired, filters.isRequired));
    }

    return db.select()
      .from(trainingCourses)
      .where(and(...conditions))
      .orderBy(trainingCourses.name);
  }

  async getEmployeeTrainingRecords(tenantId: string, employeeId: string) {
    return db.select({
      record: trainingRecords,
      course: trainingCourses,
    })
      .from(trainingRecords)
      .innerJoin(trainingCourses, eq(trainingRecords.courseId, trainingCourses.id))
      .where(and(
        eq(trainingRecords.tenantId, tenantId),
        eq(trainingRecords.employeeId, employeeId)
      ))
      .orderBy(desc(trainingRecords.createdAt));
  }

  async enrollInTraining(tenantId: string, data: {
    employeeId: string;
    courseId: string;
  }, actorId?: string) {
    const [record] = await db.insert(trainingRecords)
      .values({
        tenantId,
        ...data,
        status: "not_started",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "training.enrolled",
      actor: actorId || "system",
      entityType: "training_record",
      entityId: record.id,
      afterJson: record as Record<string, unknown>,
    });

    return record;
  }

  async completeTraining(tenantId: string, recordId: string, data: {
    score?: number;
    passed?: boolean;
    certificateUrl?: string;
  }, actorId?: string) {
    const [before] = await db.select({
      record: trainingRecords,
      course: trainingCourses,
    })
      .from(trainingRecords)
      .innerJoin(trainingCourses, eq(trainingRecords.courseId, trainingCourses.id))
      .where(and(eq(trainingRecords.tenantId, tenantId), eq(trainingRecords.id, recordId)));

    let expiresAt: Date | undefined;
    if (before.course.recertificationMonths) {
      expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + before.course.recertificationMonths);
    }

    const [record] = await db.update(trainingRecords)
      .set({
        status: "completed",
        completedAt: new Date(),
        score: data.score,
        passed: data.passed ?? true,
        certificateUrl: data.certificateUrl,
        expiresAt,
      })
      .where(and(eq(trainingRecords.tenantId, tenantId), eq(trainingRecords.id, recordId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "training.completed",
      actor: actorId || "system",
      entityType: "training_record",
      entityId: recordId,
      beforeJson: before.record as Record<string, unknown>,
      afterJson: record as Record<string, unknown>,
    });

    return record;
  }

  async createSafetyIncident(tenantId: string, data: {
    incidentNumber: string;
    incidentType: string;
    severity?: string;
    projectId?: string;
    locationDescription?: string;
    gpsLat?: string;
    gpsLng?: string;
    occurredAt: Date;
    description?: string;
    injuredEmployeesJson?: unknown;
    witnessesJson?: unknown;
    oshaReportable?: boolean;
    reportedByUserId?: string;
  }) {
    const [incident] = await db.insert(safetyIncidents)
      .values({
        tenantId,
        ...data,
        status: "reported",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "safety_incident.reported",
      actor: data.reportedByUserId || "system",
      entityType: "safety_incident",
      entityId: incident.id,
      afterJson: incident as Record<string, unknown>,
    });

    return incident;
  }

  async updateSafetyIncident(tenantId: string, incidentId: string, data: Partial<{
    status: string;
    rootCauseJson: unknown;
    correctiveActionsJson: unknown;
    closedAt: Date;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(safetyIncidents)
      .where(and(eq(safetyIncidents.tenantId, tenantId), eq(safetyIncidents.id, incidentId)));

    const [incident] = await db.update(safetyIncidents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(safetyIncidents.tenantId, tenantId), eq(safetyIncidents.id, incidentId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "safety_incident.updated",
      actor: actorId || "system",
      entityType: "safety_incident",
      entityId: incidentId,
      beforeJson: before as Record<string, unknown>,
      afterJson: incident as Record<string, unknown>,
    });

    return incident;
  }

  async listSafetyIncidents(tenantId: string, filters?: {
    status?: string;
    severity?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    let conditions = [eq(safetyIncidents.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(safetyIncidents.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(safetyIncidents.severity, filters.severity));
    }
    if (filters?.projectId) {
      conditions.push(eq(safetyIncidents.projectId, filters.projectId));
    }
    if (filters?.startDate) {
      conditions.push(gte(safetyIncidents.occurredAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(safetyIncidents.occurredAt, filters.endDate));
    }

    return db.select()
      .from(safetyIncidents)
      .where(and(...conditions))
      .orderBy(desc(safetyIncidents.occurredAt));
  }

  async createSafetyBriefing(tenantId: string, data: {
    projectId?: string;
    briefingType: string;
    topic: string;
    content?: string;
    conductedByUserId?: string;
    conductedAt: Date;
    attendeesJson?: unknown;
    signatureDataJson?: unknown;
  }) {
    const [briefing] = await db.insert(safetyBriefings)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "safety_briefing.created",
      actor: data.conductedByUserId || "system",
      entityType: "safety_briefing",
      entityId: briefing.id,
      afterJson: briefing as Record<string, unknown>,
    });

    return briefing;
  }

  async createPerformanceReview(tenantId: string, data: {
    employeeId: string;
    reviewPeriodStart: Date;
    reviewPeriodEnd: Date;
    reviewerUserId?: string;
  }, actorId?: string) {
    const [review] = await db.insert(performanceReviews)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "performance_review.created",
      actor: actorId || "system",
      entityType: "performance_review",
      entityId: review.id,
      afterJson: review as Record<string, unknown>,
    });

    return review;
  }

  async submitPerformanceReview(tenantId: string, reviewId: string, data: {
    overallRating: number;
    ratingsJson?: unknown;
    strengthsJson?: unknown;
    improvementsJson?: unknown;
    goalsJson?: unknown;
  }, actorId?: string) {
    const [before] = await db.select()
      .from(performanceReviews)
      .where(and(eq(performanceReviews.tenantId, tenantId), eq(performanceReviews.id, reviewId)));

    const [review] = await db.update(performanceReviews)
      .set({
        ...data,
        status: "submitted",
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(performanceReviews.tenantId, tenantId), eq(performanceReviews.id, reviewId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "performance_review.submitted",
      actor: actorId || "system",
      entityType: "performance_review",
      entityId: reviewId,
      beforeJson: before as Record<string, unknown>,
      afterJson: review as Record<string, unknown>,
    });

    return review;
  }

  async getEmployeePerformanceReviews(tenantId: string, employeeId: string) {
    return db.select()
      .from(performanceReviews)
      .where(and(
        eq(performanceReviews.tenantId, tenantId),
        eq(performanceReviews.employeeId, employeeId)
      ))
      .orderBy(desc(performanceReviews.reviewPeriodEnd));
  }
}

export const hrService = new HRService();
