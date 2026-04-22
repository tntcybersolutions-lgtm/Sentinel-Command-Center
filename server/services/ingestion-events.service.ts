import { db } from "../db";
import { ingestionEvents } from "../../shared/schema";

export async function logIngestionEvent(e: {
  tenantId: string;
  projectId?: string | null;
  bidProjectId?: string | null;
  runId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  message?: string | null;
  detailsJson?: any | null;
}) {
  await db.insert(ingestionEvents).values({
    tenantId: e.tenantId,
    projectId: e.projectId ?? null,
    bidProjectId: e.bidProjectId ?? null,
    runId: e.runId ?? null,
    eventType: e.eventType,
    entityType: e.entityType ?? null,
    entityId: e.entityId ?? null,
    message: e.message ?? null,
    detailsJson: e.detailsJson ?? null,
  });
}
