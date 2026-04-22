import { db } from "../db";
import { 
  tickets, ticketComments, ticketAttachments,
  slaRules, users, employees
} from "@shared/schema";
import { eq, and, lt, sql, desc, gte, lte, or, isNull } from "drizzle-orm";
import { auditService } from "./audit.service";

interface SLAMetrics {
  totalTickets: number;
  resolvedOnTime: number;
  resolvedLate: number;
  breachRate: number;
  avgResponseTimeMinutes: number;
  avgResolutionTimeMinutes: number;
}

class TicketingService {
  async listTickets(tenantId: string, filters?: {
    status?: string;
    priority?: string;
    assignedToUserId?: string;
    categoryId?: string;
    projectId?: string;
  }) {
    let conditions = [eq(tickets.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(tickets.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(tickets.priority, filters.priority));
    }
    if (filters?.assignedToUserId) {
      conditions.push(eq(tickets.assignedToUserId, filters.assignedToUserId));
    }
    if (filters?.categoryId) {
      conditions.push(eq(tickets.categoryId, filters.categoryId));
    }
    if (filters?.projectId) {
      conditions.push(eq(tickets.projectId, filters.projectId));
    }

    return db.select()
      .from(tickets)
      .where(and(...conditions))
      .orderBy(desc(tickets.createdAt));
  }

  async getTicket(tenantId: string, ticketId: string) {
    const [ticket] = await db.select()
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        eq(tickets.id, ticketId)
      ));
    return ticket;
  }

  async createTicket(tenantId: string, data: {
    ticketNumber: string;
    subject: string;
    description?: string;
    categoryId?: string;
    priority?: string;
    source?: string;
    projectId?: string;
    reportedByUserId?: string;
    reportedByEmail?: string;
  }) {
    const slaRule = await this.getSLARule(tenantId, data.priority || "normal");
    
    let responseDeadline: Date | undefined;
    let resolutionDeadline: Date | undefined;

    if (slaRule) {
      if (slaRule.responseTimeMinutes) {
        responseDeadline = new Date(Date.now() + slaRule.responseTimeMinutes * 60 * 1000);
      }
      if (slaRule.resolutionTimeMinutes) {
        resolutionDeadline = new Date(Date.now() + slaRule.resolutionTimeMinutes * 60 * 1000);
      }
    }

    const [ticket] = await db.insert(tickets)
      .values({
        tenantId,
        ticketNumber: data.ticketNumber,
        subject: data.subject,
        description: data.description,
        categoryId: data.categoryId,
        priority: data.priority || "normal",
        source: data.source || "web",
        projectId: data.projectId,
        reportedByUserId: data.reportedByUserId,
        reportedByEmail: data.reportedByEmail,
        slaRuleId: slaRule?.id,
        responseDeadline,
        resolutionDeadline,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.created",
      actor: data.reportedByUserId || "system",
      entityType: "ticket",
      entityId: ticket.id,
      afterJson: ticket as Record<string, unknown>,
    });

    if (data.priority === "urgent" || data.priority === "critical") {
      await this.autoAssignTicket(tenantId, ticket.id);
    }

    return ticket;
  }

  async updateTicket(tenantId: string, ticketId: string, data: Partial<{
    subject: string;
    description: string;
    categoryId: string;
    priority: string;
    status: string;
    assignedToUserId: string;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));

    const updateData: Record<string, unknown> = { ...data, updatedAt: new Date() };

    if (data.status === "in_progress" && !before.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }
    if (data.status === "resolved" || data.status === "closed") {
      updateData.resolvedAt = new Date();
    }

    const [ticket] = await db.update(tickets)
      .set(updateData)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.updated",
      actor: actorId || "system",
      entityType: "ticket",
      entityId: ticketId,
      beforeJson: before as Record<string, unknown>,
      afterJson: ticket as Record<string, unknown>,
    });

    return ticket;
  }

  async closeTicket(tenantId: string, ticketId: string, actorId?: string) {
    const [before] = await db.select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));

    const [ticket] = await db.update(tickets)
      .set({
        status: "closed",
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.closed",
      actor: actorId || "system",
      entityType: "ticket",
      entityId: ticketId,
      beforeJson: before as Record<string, unknown>,
      afterJson: ticket as Record<string, unknown>,
    });

    return ticket;
  }

  async assignTicket(tenantId: string, ticketId: string, assignedToUserId: string, actorId?: string) {
    const [before] = await db.select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));

    const [ticket] = await db.update(tickets)
      .set({
        assignedToUserId,
        status: before.status === "open" ? "assigned" : before.status,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.assigned",
      actor: actorId || "system",
      entityType: "ticket",
      entityId: ticketId,
      beforeJson: before as Record<string, unknown>,
      afterJson: ticket as Record<string, unknown>,
    });

    return ticket;
  }

  async autoAssignTicket(tenantId: string, ticketId: string) {
    const ticket = await this.getTicket(tenantId, ticketId);
    if (!ticket || ticket.assignedToUserId) return ticket;

    const availableUsers = await db.select({
      userId: users.id,
      openTickets: sql<number>`COUNT(${tickets.id})`.as("open_tickets"),
    })
      .from(users)
      .leftJoin(tickets, and(
        eq(tickets.assignedToUserId, users.id),
        eq(tickets.tenantId, tenantId),
        or(eq(tickets.status, "open"), eq(tickets.status, "assigned"), eq(tickets.status, "in_progress"))
      ))
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.status, "active")
      ))
      .groupBy(users.id)
      .orderBy(sql`COUNT(${tickets.id}) ASC`)
      .limit(1);

    if (availableUsers.length > 0) {
      return this.assignTicket(tenantId, ticketId, availableUsers[0].userId, "system");
    }

    return ticket;
  }

  async addComment(tenantId: string, ticketId: string, data: {
    content: string;
    isInternal?: boolean;
    authorUserId?: string;
  }) {
    const [comment] = await db.insert(ticketComments)
      .values({
        tenantId,
        ticketId,
        content: data.content,
        isInternal: data.isInternal || false,
        authorUserId: data.authorUserId,
      })
      .returning();

    await db.update(tickets)
      .set({ updatedAt: new Date() })
      .where(eq(tickets.id, ticketId));

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.comment.added",
      actor: data.authorUserId || "system",
      entityType: "ticket_comment",
      entityId: comment.id,
      afterJson: comment as Record<string, unknown>,
    });

    return comment;
  }

  async getComments(tenantId: string, ticketId: string) {
    return db.select()
      .from(ticketComments)
      .where(and(
        eq(ticketComments.tenantId, tenantId),
        eq(ticketComments.ticketId, ticketId)
      ))
      .orderBy(ticketComments.createdAt);
  }

  async resolveTicket(tenantId: string, ticketId: string, data: {
    resolutionNotes?: string;
    resolvedByUserId?: string;
  }) {
    const [before] = await db.select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));

    const now = new Date();
    let slaBreached = false;

    if (before.resolutionDeadline && now > before.resolutionDeadline) {
      slaBreached = true;
    }

    const [ticket] = await db.update(tickets)
      .set({
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.resolved",
      actor: data.resolvedByUserId || "system",
      entityType: "ticket",
      entityId: ticketId,
      beforeJson: before as Record<string, unknown>,
      afterJson: { ...ticket, slaBreached } as Record<string, unknown>,
    });

    return ticket;
  }

  async escalateTicket(tenantId: string, ticketId: string, data: {
    escalationReason: string;
    escalateToUserId?: string;
    actorId?: string;
  }) {
    const [before] = await db.select()
      .from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)));

    const newPriority = before.priority === "normal" ? "high" : 
                        before.priority === "high" ? "urgent" : "critical";
    const newEscalationLevel = (before.escalationLevel || 0) + 1;

    const [ticket] = await db.update(tickets)
      .set({
        priority: newPriority,
        escalationLevel: newEscalationLevel,
        assignedToUserId: data.escalateToUserId || before.assignedToUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.id, ticketId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "ticket.escalated",
      actor: data.actorId || "system",
      entityType: "ticket",
      entityId: ticketId,
      beforeJson: before as Record<string, unknown>,
      afterJson: ticket as Record<string, unknown>,
      metadata: { reason: data.escalationReason },
    });

    return ticket;
  }

  async getSLARule(tenantId: string, priority: string) {
    const [rule] = await db.select()
      .from(slaRules)
      .where(and(
        eq(slaRules.tenantId, tenantId),
        eq(slaRules.priority, priority),
        eq(slaRules.enabled, true)
      ))
      .limit(1);

    return rule;
  }

  async checkSLABreaches(tenantId: string) {
    const now = new Date();

    const responseBreaches = await db.select()
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        isNull(tickets.firstResponseAt),
        lt(tickets.responseDeadline, now),
        or(eq(tickets.status, "open"), eq(tickets.status, "assigned"))
      ));

    const resolutionBreaches = await db.select()
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        isNull(tickets.resolvedAt),
        lt(tickets.resolutionDeadline, now),
        or(
          eq(tickets.status, "open"),
          eq(tickets.status, "assigned"),
          eq(tickets.status, "in_progress")
        )
      ));

    for (const ticket of [...responseBreaches, ...resolutionBreaches]) {
      await auditService.logEvent({
        tenantId,
        eventType: "ticket.sla_breach",
        actor: "system",
        entityType: "ticket",
        entityId: ticket.id,
        afterJson: { ticket, breachType: responseBreaches.includes(ticket) ? "response" : "resolution" },
      });
    }

    return {
      responseBreaches: responseBreaches.length,
      resolutionBreaches: resolutionBreaches.length,
    };
  }

  async getSLAMetrics(tenantId: string, startDate?: Date, endDate?: Date): Promise<SLAMetrics> {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const ticketList = await db.select()
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenantId),
        gte(tickets.createdAt, start),
        lte(tickets.createdAt, end)
      ));

    const resolved = ticketList.filter(t => t.resolvedAt);
    const resolvedOnTime = resolved.filter(t => 
      !t.resolutionDeadline || t.resolvedAt! <= t.resolutionDeadline
    );
    const resolvedLate = resolved.filter(t => 
      t.resolutionDeadline && t.resolvedAt! > t.resolutionDeadline
    );

    let totalResponseTime = 0;
    let responseCount = 0;
    let totalResolutionTime = 0;
    let resolutionCount = 0;

    for (const ticket of ticketList) {
      if (ticket.firstResponseAt && ticket.createdAt) {
        totalResponseTime += (ticket.firstResponseAt.getTime() - ticket.createdAt.getTime()) / 60000;
        responseCount++;
      }
      if (ticket.resolvedAt && ticket.createdAt) {
        totalResolutionTime += (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60000;
        resolutionCount++;
      }
    }

    return {
      totalTickets: ticketList.length,
      resolvedOnTime: resolvedOnTime.length,
      resolvedLate: resolvedLate.length,
      breachRate: ticketList.length > 0 ? (resolvedLate.length / ticketList.length) * 100 : 0,
      avgResponseTimeMinutes: responseCount > 0 ? totalResponseTime / responseCount : 0,
      avgResolutionTimeMinutes: resolutionCount > 0 ? totalResolutionTime / resolutionCount : 0,
    };
  }

  async createSLARule(tenantId: string, data: {
    name: string;
    priority: string;
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
    escalationRulesJson?: unknown;
    enabled?: boolean;
  }, actorId?: string) {
    const [rule] = await db.insert(slaRules)
      .values({
        tenantId,
        ...data,
        enabled: data.enabled ?? true,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "sla_rule.created",
      actor: actorId || "system",
      entityType: "sla_rule",
      entityId: rule.id,
      afterJson: rule as Record<string, unknown>,
    });

    return rule;
  }
}

export const ticketingService = new TicketingService();
