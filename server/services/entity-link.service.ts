import { db } from "../db";
import { entityLinks, type InsertEntityLink, type EntityLink } from "@shared/schema";
import { eq, and, or, desc } from "drizzle-orm";

export async function createLink(data: InsertEntityLink): Promise<EntityLink> {
  const [link] = await db.insert(entityLinks)
    .values(data)
    .onConflictDoNothing()
    .returning();
  return link;
}

export async function getLinksForEntity(
  tenantId: string,
  entityType: string,
  entityId: string
): Promise<EntityLink[]> {
  return db.select().from(entityLinks)
    .where(and(
      eq(entityLinks.tenantId, tenantId),
      or(
        and(eq(entityLinks.sourceType, entityType), eq(entityLinks.sourceId, entityId)),
        and(eq(entityLinks.targetType, entityType), eq(entityLinks.targetId, entityId)),
      )
    ))
    .orderBy(desc(entityLinks.createdAt));
}

export async function deleteLink(id: string): Promise<void> {
  await db.delete(entityLinks).where(eq(entityLinks.id, id));
}

export async function getLinkedEntitiesOfType(
  tenantId: string,
  entityType: string,
  entityId: string,
  linkedType: string
): Promise<string[]> {
  const links = await db.select().from(entityLinks)
    .where(and(
      eq(entityLinks.tenantId, tenantId),
      or(
        and(
          eq(entityLinks.sourceType, entityType),
          eq(entityLinks.sourceId, entityId),
          eq(entityLinks.targetType, linkedType),
        ),
        and(
          eq(entityLinks.targetType, entityType),
          eq(entityLinks.targetId, entityId),
          eq(entityLinks.sourceType, linkedType),
        ),
      )
    ));

  return links.map(l =>
    l.sourceType === linkedType ? l.sourceId : l.targetId
  );
}

export const entityLinkService = {
  createLink,
  getLinksForEntity,
  deleteLink,
  getLinkedEntitiesOfType,
};
