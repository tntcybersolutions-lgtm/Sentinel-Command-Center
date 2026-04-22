import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import {
  auditEvents,
  entityEmbeddings,
  insertEntityEmbeddingSchema,
  orgMemoryItems,
  orgMemoryApprovals,
} from "../../../shared/schema";

type EmbedJob = {
  tenantId: string;
  entityType: string;
  entityId: string;
  embeddingText: string;
};

async function writeEmbedding(job: EmbedJob) {
  const parsed = insertEntityEmbeddingSchema.parse({
    tenantId: job.tenantId,
    entityType: job.entityType,
    entityId: job.entityId,
    embeddingText: job.embeddingText,
    embeddingVector: null,
  });

  await db.insert(entityEmbeddings).values(parsed).onConflictDoUpdate({
    target: [entityEmbeddings.tenantId, entityEmbeddings.entityType, entityEmbeddings.entityId],
    set: { embeddingText: job.embeddingText },
  });
}

function buildSearchText(item: { title: string; summary: string; body: string; category: string; tagsJson: any }): string {
  const tags = Array.isArray(item.tagsJson) ? item.tagsJson.join(" ") : "";
  return [item.title, item.summary, item.body, item.category, tags].filter(Boolean).join("\n").slice(0, 50000);
}

function buildEmbeddingText(item: any): string {
  const tags = Array.isArray(item.tagsJson) ? item.tagsJson.join(", ") : "";
  const meta = item.metaJson ? JSON.stringify(item.metaJson) : "";
  return `TITLE: ${item.title}\nCATEGORY: ${item.category}\nSENSITIVITY: ${item.sensitivity}\nTAGS: ${tags}\nSUMMARY: ${item.summary}\nBODY:\n${item.body}\nMETA:${meta}`.slice(0, 50000);
}

export async function orgMemoryOnCreate(params: {
  tenantId: string;
  actorId: string;
  memoryItemId: string;
}) {
  const { tenantId, actorId, memoryItemId } = params;

  const row = await db
    .select()
    .from(orgMemoryItems)
    .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
    .limit(1);

  if (!row[0]) return;

  const searchText = buildSearchText(row[0] as any);
  await db
    .update(orgMemoryItems)
    .set({ searchText, updatedAt: new Date(), updatedBy: actorId })
    .where(eq(orgMemoryItems.id, memoryItemId));

  await db.insert(auditEvents).values({
    tenantId,
    eventType: "org_memory",
    actor: actorId,
    actorType: "user",
    entityType: "org_memory_item",
    entityId: memoryItemId,
    action: "created",
    beforeJson: null,
    afterJson: row[0],
    metaJson: {},
    createdAt: new Date(),
  });
}

export async function orgMemoryOnApprove(params: {
  tenantId: string;
  actorId: string;
  memoryItemId: string;
  approvalId: string;
}) {
  const { tenantId, actorId, memoryItemId, approvalId } = params;

  const approval = await db
    .select()
    .from(orgMemoryApprovals)
    .where(and(eq(orgMemoryApprovals.tenantId, tenantId), eq(orgMemoryApprovals.id, approvalId)))
    .limit(1);

  if (!approval[0]) throw new Error("Approval not found");

  const before = await db
    .select()
    .from(orgMemoryItems)
    .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
    .limit(1);

  const a = approval[0] as any;
  await db.update(orgMemoryItems).set({
    title: a.proposedTitle,
    summary: a.proposedSummary,
    body: a.proposedBody,
    category: a.proposedCategory,
    sensitivity: a.proposedSensitivity,
    tagsJson: a.proposedTagsJson,
    metaJson: a.proposedMetaJson,
    status: "approved",
    approvedAt: new Date(),
    approvedBy: actorId,
    updatedAt: new Date(),
    updatedBy: actorId,
    searchText: buildSearchText({
      title: a.proposedTitle,
      summary: a.proposedSummary,
      body: a.proposedBody,
      category: a.proposedCategory,
      tagsJson: a.proposedTagsJson,
    } as any),
  }).where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)));

  await db.update(orgMemoryApprovals).set({
    status: "approved",
    reviewedAt: new Date(),
    reviewedBy: actorId,
  }).where(and(eq(orgMemoryApprovals.tenantId, tenantId), eq(orgMemoryApprovals.id, approvalId)));

  const after = await db
    .select()
    .from(orgMemoryItems)
    .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
    .limit(1);

  await db.insert(auditEvents).values({
    tenantId,
    eventType: "org_memory",
    actor: actorId,
    actorType: "user",
    entityType: "org_memory_item",
    entityId: memoryItemId,
    action: "approved",
    beforeJson: before[0] ?? null,
    afterJson: after[0] ?? null,
    metaJson: { approvalId },
    createdAt: new Date(),
  });

  const embeddingText = buildEmbeddingText(after[0] as any);
  await writeEmbedding({
    tenantId,
    entityType: "org_memory_item",
    entityId: memoryItemId,
    embeddingText,
  });
}

export async function orgMemoryOnReject(params: {
  tenantId: string;
  actorId: string;
  memoryItemId: string;
  approvalId: string;
  reviewerNote?: string;
}) {
  const { tenantId, actorId, memoryItemId, approvalId, reviewerNote } = params;

  await db.update(orgMemoryApprovals).set({
    status: "rejected",
    reviewedAt: new Date(),
    reviewedBy: actorId,
    reviewerNote: reviewerNote || null,
  }).where(and(eq(orgMemoryApprovals.tenantId, tenantId), eq(orgMemoryApprovals.id, approvalId)));

  await db.update(orgMemoryItems).set({
    status: "rejected",
    updatedAt: new Date(),
    updatedBy: actorId,
  }).where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)));

  await db.insert(auditEvents).values({
    tenantId,
    eventType: "org_memory",
    actor: actorId,
    actorType: "user",
    entityType: "org_memory_item",
    entityId: memoryItemId,
    action: "rejected",
    beforeJson: null,
    afterJson: { approvalId, reviewerNote },
    metaJson: {},
    createdAt: new Date(),
  });
}
