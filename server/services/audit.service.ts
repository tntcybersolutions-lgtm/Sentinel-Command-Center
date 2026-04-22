import { db } from "../db";
import { auditEvents, entitySnapshots } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface AuditEventInput {
  tenantId: string;
  correlationId?: string;
  eventType: string;
  actor: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  async logEvent(input: AuditEventInput): Promise<string> {
    const [event] = await db.insert(auditEvents).values({
      tenantId: input.tenantId,
      eventType: input.eventType,
      actor: input.actor,
      actorType: "user",
      action: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: input.beforeJson || null,
      afterJson: input.afterJson || null,
    }).returning({ id: auditEvents.id });
    return event.id;
  }

  async createSnapshot(
    tenantId: string,
    entityType: string,
    entityId: string,
    snapshotJson: Record<string, unknown>
  ): Promise<string> {
    const existingSnapshots = await db.select()
      .from(entitySnapshots)
      .where(and(
        eq(entitySnapshots.tenantId, tenantId),
        eq(entitySnapshots.entityType, entityType),
        eq(entitySnapshots.entityId, entityId)
      ))
      .orderBy(desc(entitySnapshots.version))
      .limit(1);
    
    const nextVersion = existingSnapshots.length > 0 ? existingSnapshots[0].version + 1 : 1;
    
    const [snapshot] = await db.insert(entitySnapshots).values({
      tenantId,
      entityType,
      entityId,
      version: nextVersion,
      snapshotJson,
    }).returning({ id: entitySnapshots.id });
    return snapshot.id;
  }

  async getEntityHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
    limit = 50
  ) {
    return db.select()
      .from(auditEvents)
      .where(and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.entityType, entityType),
        eq(auditEvents.entityId, entityId)
      ))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }

  async getRecentEvents(tenantId: string, limit = 100) {
    return db.select()
      .from(auditEvents)
      .where(eq(auditEvents.tenantId, tenantId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }
}

export const auditService = new AuditService();
