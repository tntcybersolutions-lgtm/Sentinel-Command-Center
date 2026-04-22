import { db } from "../db";
import { events, eventOutbox, type InsertEvent, type OpsEvent, type EventType } from "@shared/schema";
import { eq, and, sql, desc, inArray } from "drizzle-orm";

type EventHandler = ((event: OpsEvent) => Promise<void>) & { handlerName?: string };

const handlerRegistry: Map<string, EventHandler[]> = new Map();

function resolveHandlerName(handler: EventHandler, eventType: string): string {
  return handler.handlerName || handler.name || `handler_${eventType}`;
}

export function registerHandler(eventType: string, handler: EventHandler): void {
  const existing = handlerRegistry.get(eventType) || [];
  existing.push(handler);
  handlerRegistry.set(eventType, existing);
}

export async function emitEvent(data: InsertEvent): Promise<OpsEvent> {
  const [event] = await db.insert(events).values(data).returning();

  const handlers = handlerRegistry.get(data.eventType) || [];
  for (const handler of handlers) {
    const handlerName = resolveHandlerName(handler, data.eventType);
    await db.insert(eventOutbox).values({
      eventId: event.id,
      handlerName,
      status: "pending",
      attempts: 0,
    });
  }

  setImmediate(() => processOutbox(event.id).catch(console.error));

  return event;
}

export async function processOutbox(eventId?: string): Promise<void> {
  const conditions = [eq(eventOutbox.status, "pending")];
  if (eventId) {
    conditions.push(eq(eventOutbox.eventId, eventId));
  }

  const pending = await db.select().from(eventOutbox)
    .where(and(...conditions))
    .limit(50);

  for (const entry of pending) {
    const [event] = await db.select().from(events).where(eq(events.id, entry.eventId));
    if (!event) continue;

    const handlers = handlerRegistry.get(event.eventType) || [];
    const handler = handlers.find(h => resolveHandlerName(h, event.eventType) === entry.handlerName);

    if (!handler) {
      await db.update(eventOutbox)
        .set({ status: "skipped", lastError: "Handler not found", processedAt: new Date() })
        .where(eq(eventOutbox.id, entry.id));
      await markEventProcessedIfAllDone(event.id);
      continue;
    }

    try {
      await handler(event);
      await db.update(eventOutbox)
        .set({ status: "completed", processedAt: new Date(), attempts: entry.attempts + 1 })
        .where(eq(eventOutbox.id, entry.id));
      await markEventProcessedIfAllDone(event.id);
    } catch (err: any) {
      const newAttempts = entry.attempts + 1;
      await db.update(eventOutbox)
        .set({
          status: newAttempts >= 3 ? "failed" : "pending",
          lastError: err.message || String(err),
          attempts: newAttempts,
        })
        .where(eq(eventOutbox.id, entry.id));
    }
  }
}

async function markEventProcessedIfAllDone(eventId: string): Promise<void> {
  const entries = await db.select().from(eventOutbox)
    .where(eq(eventOutbox.eventId, eventId));

  const allDone = entries.every(e => e.status === "completed" || e.status === "skipped");
  if (allDone && entries.length > 0) {
    await db.update(events)
      .set({ processedAt: new Date() })
      .where(eq(events.id, eventId));
  }
}

export async function getEventsForEntity(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 50
): Promise<OpsEvent[]> {
  return db.select().from(events)
    .where(and(
      eq(events.tenantId, tenantId),
      eq(events.entityType, entityType),
      eq(events.entityId, entityId),
    ))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function getEventsByType(
  tenantId: string,
  eventType: string,
  limit = 50
): Promise<OpsEvent[]> {
  return db.select().from(events)
    .where(and(
      eq(events.tenantId, tenantId),
      eq(events.eventType, eventType),
    ))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function getOutboxStatus(eventId: string) {
  return db.select().from(eventOutbox)
    .where(eq(eventOutbox.eventId, eventId));
}

export async function retryFailedOutbox(): Promise<number> {
  const failed = await db.select().from(eventOutbox)
    .where(eq(eventOutbox.status, "failed"))
    .limit(20);

  if (failed.length === 0) return 0;

  await db.update(eventOutbox)
    .set({ status: "pending", attempts: 0 })
    .where(inArray(eventOutbox.id, failed.map(f => f.id)));

  for (const entry of failed) {
    await processOutbox(entry.eventId);
  }

  return failed.length;
}

export async function sweepPendingOutbox(): Promise<number> {
  const pendingEntries = await db.select().from(eventOutbox)
    .where(eq(eventOutbox.status, "pending"))
    .limit(100);

  if (pendingEntries.length === 0) return 0;

  const eventIds = [...new Set(pendingEntries.map(e => e.eventId))];
  for (const eid of eventIds) {
    await processOutbox(eid);
  }

  return pendingEntries.length;
}

export const eventBus = {
  emit: emitEvent,
  register: registerHandler,
  getEventsForEntity,
  getEventsByType,
  getOutboxStatus,
  retryFailedOutbox,
  processOutbox,
  sweepPendingOutbox,
};
