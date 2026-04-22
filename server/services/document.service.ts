import { db } from "../db";
import { contacts } from "@shared/schema";
import { eq, and, desc, ilike, or } from "drizzle-orm";
import { auditService } from "./audit.service";

class DocumentService {
  async listContacts(tenantId: string, filters?: {
    buyerId?: string;
    searchQuery?: string;
  }) {
    let conditions = [eq(contacts.tenantId, tenantId)];
    
    if (filters?.buyerId) {
      conditions.push(eq(contacts.buyerId, filters.buyerId));
    }

    const baseQuery = db.select()
      .from(contacts)
      .where(and(...conditions))
      .orderBy(contacts.lastName, contacts.firstName);

    if (filters?.searchQuery) {
      return db.select()
        .from(contacts)
        .where(and(
          eq(contacts.tenantId, tenantId),
          or(
            ilike(contacts.firstName, `%${filters.searchQuery}%`),
            ilike(contacts.lastName, `%${filters.searchQuery}%`),
            ilike(contacts.email, `%${filters.searchQuery}%`)
          )
        ))
        .orderBy(contacts.lastName, contacts.firstName);
    }

    return baseQuery;
  }

  async getContact(tenantId: string, contactId: string) {
    const [contact] = await db.select()
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.id, contactId)
      ));
    return contact;
  }

  async createContact(tenantId: string, data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
    department?: string;
    buyerId?: string;
    notesJson?: unknown;
  }, actorId?: string) {
    const [contact] = await db.insert(contacts)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "contact.created",
      actor: actorId || "system",
      entityType: "contact",
      entityId: contact.id,
      afterJson: contact as Record<string, unknown>,
    });

    return contact;
  }

  async updateContact(tenantId: string, contactId: string, data: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title: string;
    department: string;
    buyerId: string;
    notesJson: unknown;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    const [contact] = await db.update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "contact.updated",
      actor: actorId || "system",
      entityType: "contact",
      entityId: contactId,
      beforeJson: before as Record<string, unknown>,
      afterJson: contact as Record<string, unknown>,
    });

    return contact;
  }

  async deleteContact(tenantId: string, contactId: string, actorId?: string) {
    const [before] = await db.select()
      .from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    await db.delete(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.id, contactId)));

    await auditService.logEvent({
      tenantId,
      eventType: "contact.deleted",
      actor: actorId || "system",
      entityType: "contact",
      entityId: contactId,
      beforeJson: before as Record<string, unknown>,
    });

    return { success: true };
  }

  async getContactsByBuyer(tenantId: string, buyerId: string) {
    return db.select()
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenantId),
        eq(contacts.buyerId, buyerId)
      ))
      .orderBy(contacts.lastName, contacts.firstName);
  }
}

export const documentService = new DocumentService();
