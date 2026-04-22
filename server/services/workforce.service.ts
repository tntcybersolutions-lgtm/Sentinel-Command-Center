import { db } from "../db";
import { 
  timeEntries, crewAssignments, gpsLocations, employees, projects
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { auditService } from "./audit.service";

interface LaborCostSummary {
  employeeId: string;
  employeeName: string;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalDoubleTimeHours: number;
  regularCost: number;
  overtimeCost: number;
  doubleTimeCost: number;
  totalCost: number;
}

interface CrewAvailability {
  employeeId: string;
  employeeName: string;
  status: string;
  currentAssignment?: {
    projectId: string;
    projectName: string;
    role: string;
  };
  nextAvailable?: Date;
}

class WorkforceService {
  async clockIn(tenantId: string, data: {
    employeeId: string;
    projectId?: string;
    costCodeId?: string;
    clockInMethod?: string;
    gpsLat?: string;
    gpsLng?: string;
    notes?: string;
  }) {
    const now = new Date();
    const entryDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [existing] = await db.select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.employeeId, data.employeeId),
        eq(timeEntries.entryDate, entryDate),
        sql`${timeEntries.clockOutAt} IS NULL`
      ));

    if (existing) {
      return { success: false, message: "Employee already clocked in", entry: existing };
    }

    const [entry] = await db.insert(timeEntries)
      .values({
        tenantId,
        employeeId: data.employeeId,
        projectId: data.projectId,
        costCodeId: data.costCodeId,
        entryDate,
        clockInAt: now,
        clockInMethod: data.clockInMethod,
        clockInGpsLat: data.gpsLat,
        clockInGpsLng: data.gpsLng,
        notes: data.notes,
        status: "pending",
      })
      .returning();

    if (data.gpsLat && data.gpsLng) {
      await this.recordGPSLocation(tenantId, "employee", data.employeeId, data.gpsLat, data.gpsLng);
    }

    await auditService.logEvent({
      tenantId,
      eventType: "time.clock_in",
      actor: data.employeeId,
      entityType: "time_entry",
      entityId: entry.id,
      afterJson: entry as Record<string, unknown>,
    });

    return { success: true, entry };
  }

  async clockOut(tenantId: string, data: {
    employeeId: string;
    gpsLat?: string;
    gpsLng?: string;
    notes?: string;
  }) {
    const now = new Date();
    const entryDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [existing] = await db.select()
      .from(timeEntries)
      .where(and(
        eq(timeEntries.tenantId, tenantId),
        eq(timeEntries.employeeId, data.employeeId),
        eq(timeEntries.entryDate, entryDate),
        sql`${timeEntries.clockOutAt} IS NULL`
      ));

    if (!existing) {
      return { success: false, message: "No active clock-in found" };
    }

    const clockInTime = existing.clockInAt!;
    const hoursWorked = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);
    const breakMinutes = existing.breakMinutes || 0;
    const netHours = hoursWorked - (breakMinutes / 60);

    const regularHours = Math.min(netHours, 8);
    const overtimeHours = netHours > 8 ? Math.min(netHours - 8, 4) : 0;
    const doubleTimeHours = netHours > 12 ? netHours - 12 : 0;

    const [entry] = await db.update(timeEntries)
      .set({
        clockOutAt: now,
        clockOutGpsLat: data.gpsLat,
        clockOutGpsLng: data.gpsLng,
        regularHours: regularHours.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        doubleTimeHours: doubleTimeHours.toFixed(2),
        notes: data.notes ? `${existing.notes || ""} | Clock out: ${data.notes}` : existing.notes,
        updatedAt: now,
      })
      .where(eq(timeEntries.id, existing.id))
      .returning();

    if (data.gpsLat && data.gpsLng) {
      await this.recordGPSLocation(tenantId, "employee", data.employeeId, data.gpsLat, data.gpsLng);
    }

    await auditService.logEvent({
      tenantId,
      eventType: "time.clock_out",
      actor: data.employeeId,
      entityType: "time_entry",
      entityId: entry.id,
      beforeJson: existing as Record<string, unknown>,
      afterJson: entry as Record<string, unknown>,
    });

    return { success: true, entry };
  }

  async addBreak(tenantId: string, entryId: string, breakMinutes: number) {
    const [entry] = await db.update(timeEntries)
      .set({
        breakMinutes: sql`COALESCE(${timeEntries.breakMinutes}, 0) + ${breakMinutes}`,
        updatedAt: new Date(),
      })
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, entryId)))
      .returning();

    return entry;
  }

  async getTimeEntries(tenantId: string, filters: {
    employeeId?: string;
    projectId?: string;
    startDate: Date;
    endDate: Date;
    status?: string;
  }) {
    let conditions = [
      eq(timeEntries.tenantId, tenantId),
      gte(timeEntries.entryDate, filters.startDate),
      lte(timeEntries.entryDate, filters.endDate),
    ];

    if (filters.employeeId) {
      conditions.push(eq(timeEntries.employeeId, filters.employeeId));
    }
    if (filters.projectId) {
      conditions.push(eq(timeEntries.projectId, filters.projectId));
    }
    if (filters.status) {
      conditions.push(eq(timeEntries.status, filters.status));
    }

    return db.select({
      entry: timeEntries,
      employee: employees,
    })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(desc(timeEntries.entryDate));
  }

  async approveTimeEntries(tenantId: string, entryIds: string[], approvedByUserId: string) {
    const now = new Date();

    for (const entryId of entryIds) {
      const [before] = await db.select()
        .from(timeEntries)
        .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, entryId)));

      await db.update(timeEntries)
        .set({
          status: "approved",
          approvedByUserId,
          approvedAt: now,
          updatedAt: now,
        })
        .where(eq(timeEntries.id, entryId));

      await auditService.logEvent({
        tenantId,
        eventType: "time.approved",
        actor: approvedByUserId,
        entityType: "time_entry",
        entityId: entryId,
        beforeJson: before as Record<string, unknown>,
        afterJson: { ...before, status: "approved", approvedByUserId, approvedAt: now } as Record<string, unknown>,
      });
    }

    return { success: true, approvedCount: entryIds.length };
  }

  async rejectTimeEntry(tenantId: string, entryId: string, data: {
    rejectedByUserId: string;
    reason: string;
  }) {
    const [before] = await db.select()
      .from(timeEntries)
      .where(and(eq(timeEntries.tenantId, tenantId), eq(timeEntries.id, entryId)));

    const [entry] = await db.update(timeEntries)
      .set({
        status: "rejected",
        notes: `${before.notes || ""} | Rejected: ${data.reason}`,
        updatedAt: new Date(),
      })
      .where(eq(timeEntries.id, entryId))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "time.rejected",
      actor: data.rejectedByUserId,
      entityType: "time_entry",
      entityId: entryId,
      beforeJson: before as Record<string, unknown>,
      afterJson: entry as Record<string, unknown>,
    });

    return entry;
  }

  async getLaborCostSummary(tenantId: string, filters: {
    startDate: Date;
    endDate: Date;
    projectId?: string;
  }): Promise<LaborCostSummary[]> {
    const entries = await db.select({
      entry: timeEntries,
      employee: employees,
    })
      .from(timeEntries)
      .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
      .where(and(
        eq(timeEntries.tenantId, tenantId),
        gte(timeEntries.entryDate, filters.startDate),
        lte(timeEntries.entryDate, filters.endDate),
        eq(timeEntries.status, "approved"),
        filters.projectId ? eq(timeEntries.projectId, filters.projectId) : sql`1=1`
      ));

    const grouped = new Map<string, {
      employee: typeof employees.$inferSelect;
      regularHours: number;
      overtimeHours: number;
      doubleTimeHours: number;
    }>();

    for (const row of entries) {
      const existing = grouped.get(row.employee.id);
      const regular = parseFloat(row.entry.regularHours || "0");
      const overtime = parseFloat(row.entry.overtimeHours || "0");
      const doubleTime = parseFloat(row.entry.doubleTimeHours || "0");

      if (existing) {
        existing.regularHours += regular;
        existing.overtimeHours += overtime;
        existing.doubleTimeHours += doubleTime;
      } else {
        grouped.set(row.employee.id, {
          employee: row.employee,
          regularHours: regular,
          overtimeHours: overtime,
          doubleTimeHours: doubleTime,
        });
      }
    }

    const results: LaborCostSummary[] = [];

    for (const [id, data] of Array.from(grouped.entries())) {
      const hourlyRate = parseFloat(data.employee.hourlyRate || "0");
      const regularCost = data.regularHours * hourlyRate;
      const overtimeCost = data.overtimeHours * hourlyRate * 1.5;
      const doubleTimeCost = data.doubleTimeHours * hourlyRate * 2;

      results.push({
        employeeId: id,
        employeeName: `${data.employee.firstName} ${data.employee.lastName}`,
        totalRegularHours: data.regularHours,
        totalOvertimeHours: data.overtimeHours,
        totalDoubleTimeHours: data.doubleTimeHours,
        regularCost,
        overtimeCost,
        doubleTimeCost,
        totalCost: regularCost + overtimeCost + doubleTimeCost,
      });
    }

    return results.sort((a, b) => b.totalCost - a.totalCost);
  }

  async createCrewAssignment(tenantId: string, data: {
    employeeId: string;
    projectId: string;
    assignmentDate: Date;
    role?: string;
    shiftStart?: Date;
    shiftEnd?: Date;
    assignedByUserId?: string;
    notes?: string;
  }) {
    const [assignment] = await db.insert(crewAssignments)
      .values({
        tenantId,
        ...data,
        status: "scheduled",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "crew.assigned",
      actor: data.assignedByUserId || "system",
      entityType: "crew_assignment",
      entityId: assignment.id,
      afterJson: assignment as Record<string, unknown>,
    });

    return assignment;
  }

  async getCrewAssignments(tenantId: string, filters: {
    projectId?: string;
    employeeId?: string;
    date?: Date;
    startDate?: Date;
    endDate?: Date;
  }) {
    let conditions = [eq(crewAssignments.tenantId, tenantId)];

    if (filters.projectId) {
      conditions.push(eq(crewAssignments.projectId, filters.projectId));
    }
    if (filters.employeeId) {
      conditions.push(eq(crewAssignments.employeeId, filters.employeeId));
    }
    if (filters.date) {
      conditions.push(eq(crewAssignments.assignmentDate, filters.date));
    }
    if (filters.startDate && filters.endDate) {
      conditions.push(gte(crewAssignments.assignmentDate, filters.startDate));
      conditions.push(lte(crewAssignments.assignmentDate, filters.endDate));
    }

    return db.select({
      assignment: crewAssignments,
      employee: employees,
    })
      .from(crewAssignments)
      .innerJoin(employees, eq(crewAssignments.employeeId, employees.id))
      .where(and(...conditions))
      .orderBy(crewAssignments.assignmentDate, crewAssignments.shiftStart);
  }

  async confirmCrewAssignment(tenantId: string, assignmentId: string, employeeId: string) {
    const [assignment] = await db.update(crewAssignments)
      .set({
        status: "confirmed",
        confirmedAt: new Date(),
      })
      .where(and(
        eq(crewAssignments.tenantId, tenantId),
        eq(crewAssignments.id, assignmentId)
      ))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "crew.confirmed",
      actor: employeeId,
      entityType: "crew_assignment",
      entityId: assignmentId,
      afterJson: assignment as Record<string, unknown>,
    });

    return assignment;
  }

  async getCrewAvailability(tenantId: string, date: Date): Promise<CrewAvailability[]> {
    const allEmployees = await db.select()
      .from(employees)
      .where(and(
        eq(employees.tenantId, tenantId),
        eq(employees.status, "active")
      ));

    const assignments = await db.select({
      assignment: crewAssignments,
      project: projects,
    })
      .from(crewAssignments)
      .innerJoin(projects, eq(crewAssignments.projectId, projects.id))
      .where(and(
        eq(crewAssignments.tenantId, tenantId),
        eq(crewAssignments.assignmentDate, date),
        eq(crewAssignments.status, "confirmed")
      ));

    const assignmentMap = new Map<string, { projectId: string; projectName: string; role: string }>();
    for (const row of assignments) {
      assignmentMap.set(row.assignment.employeeId, {
        projectId: row.project.id,
        projectName: row.project.name,
        role: row.assignment.role || "Worker",
      });
    }

    return allEmployees.map(emp => ({
      employeeId: emp.id,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      status: assignmentMap.has(emp.id) ? "assigned" : "available",
      currentAssignment: assignmentMap.get(emp.id),
    }));
  }

  async recordGPSLocation(tenantId: string, entityType: string, entityId: string, gpsLat: string, gpsLng: string, accuracy?: string) {
    await db.insert(gpsLocations)
      .values({
        tenantId,
        entityType,
        entityId,
        gpsLat,
        gpsLng,
        accuracy,
        recordedAt: new Date(),
      });
  }

  async getEmployeeLocationHistory(tenantId: string, employeeId: string, startDate: Date, endDate: Date) {
    return db.select()
      .from(gpsLocations)
      .where(and(
        eq(gpsLocations.tenantId, tenantId),
        eq(gpsLocations.entityType, "employee"),
        eq(gpsLocations.entityId, employeeId),
        gte(gpsLocations.recordedAt, startDate),
        lte(gpsLocations.recordedAt, endDate)
      ))
      .orderBy(gpsLocations.recordedAt);
  }

  async getDynamicCrewRecommendations(tenantId: string, projectId: string, date: Date, requiredSkills?: string[]) {
    const availability = await this.getCrewAvailability(tenantId, date);
    const available = availability.filter(a => a.status === "available");

    if (available.length === 0) {
      return [];
    }

    const employeeIds = available.map(a => a.employeeId);
    const employeeDetails = await db.select()
      .from(employees)
      .where(and(
        eq(employees.tenantId, tenantId),
        sql`${employees.id} IN (${sql.join(employeeIds.map(id => sql`${id}`), sql`, `)})`
      ));

    const recommendations = employeeDetails.map(emp => {
      const empSkills = (emp.skillsJson as string[]) || [];
      const matchScore = requiredSkills 
        ? requiredSkills.filter(s => empSkills.includes(s)).length / requiredSkills.length
        : 1;

      return {
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        jobTitle: emp.jobTitle,
        skills: empSkills,
        skillMatchScore: matchScore,
        hourlyRate: emp.hourlyRate,
      };
    });

    return recommendations.sort((a, b) => b.skillMatchScore - a.skillMatchScore);
  }
}

export const workforceService = new WorkforceService();
