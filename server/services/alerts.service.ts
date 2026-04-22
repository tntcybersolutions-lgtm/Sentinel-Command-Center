import { db } from "../db";
import { notifications, notificationPreferences, users, tenantSettings } from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { auditService } from "./audit.service";

export type AlertType =
  | "new_critical_doc"
  | "doc_modified_after_approval"
  | "missing_docs"
  | "compliance_expiry_30"
  | "compliance_expiry_14"
  | "compliance_expiry_7"
  | "duplicate_detected";

export type AlertPriority = "low" | "normal" | "high" | "critical";

export interface CreateAlertInput {
  tenantId: string;
  userId?: string;
  alertType: AlertType;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  priority?: AlertPriority;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertNotificationChannels {
  inApp: boolean;
  email: boolean;
  teamsWebhook: boolean;
}

const ALERT_PRIORITY_MAP: Record<AlertType, AlertPriority> = {
  new_critical_doc: "high",
  doc_modified_after_approval: "high",
  missing_docs: "normal",
  compliance_expiry_30: "normal",
  compliance_expiry_14: "high",
  compliance_expiry_7: "critical",
  duplicate_detected: "normal",
};

const ALERT_TITLE_MAP: Record<AlertType, string> = {
  new_critical_doc: "New Critical Document Uploaded",
  doc_modified_after_approval: "Document Modified After Approval",
  missing_docs: "Missing Required Documents",
  compliance_expiry_30: "Compliance Document Expiring in 30 Days",
  compliance_expiry_14: "Compliance Document Expiring in 14 Days",
  compliance_expiry_7: "URGENT: Compliance Document Expiring in 7 Days",
  duplicate_detected: "Duplicate Document Detected",
};

export class AlertsService {
  async createAlert(input: CreateAlertInput): Promise<string> {
    const priority = input.priority || ALERT_PRIORITY_MAP[input.alertType] || "normal";
    const title = input.title || ALERT_TITLE_MAP[input.alertType] || "System Alert";

    const [notification] = await db.insert(notifications).values({
      tenantId: input.tenantId,
      userId: input.userId || null,
      type: input.alertType,
      title,
      message: input.message || null,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      priority,
      read: false,
      actionUrl: input.actionUrl || null,
    }).returning({ id: notifications.id });

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: "alert_created",
      actor: "system",
      entityType: "notification",
      entityId: notification.id,
      afterJson: { alertType: input.alertType, title, priority },
    });

    const channels = await this.getNotificationChannels(
      input.tenantId,
      input.userId,
      input.alertType
    );

    if (channels.email) {
      await this.sendEmailAlert(input.tenantId, notification.id, input);
    }

    if (channels.teamsWebhook) {
      await this.sendTeamsWebhook(input.tenantId, input);
    }

    console.log(`[Alerts] Created alert ${notification.id} of type ${input.alertType}`);
    return notification.id;
  }

  async getAlerts(
    tenantId: string,
    userId?: string,
    options: {
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
      alertTypes?: AlertType[];
    } = {}
  ) {
    const { unreadOnly = false, limit = 50, offset = 0, alertTypes } = options;

    let query = db.select()
      .from(notifications)
      .where(eq(notifications.tenantId, tenantId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);

    const conditions = [eq(notifications.tenantId, tenantId)];

    if (userId) {
      conditions.push(eq(notifications.userId, userId));
    }

    if (unreadOnly) {
      conditions.push(eq(notifications.read, false));
    }

    if (alertTypes && alertTypes.length > 0) {
      conditions.push(inArray(notifications.type, alertTypes));
    }

    return db.select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async markRead(tenantId: string, alertId: string, userId?: string): Promise<boolean> {
    const conditions = [
      eq(notifications.tenantId, tenantId),
      eq(notifications.id, alertId),
    ];

    if (userId) {
      conditions.push(eq(notifications.userId, userId));
    }

    const [updated] = await db.update(notifications)
      .set({ read: true })
      .where(and(...conditions))
      .returning({ id: notifications.id });

    if (updated) {
      await auditService.logEvent({
        tenantId,
        eventType: "alert_read",
        actor: userId || "system",
        entityType: "notification",
        entityId: alertId,
      });
    }

    return !!updated;
  }

  async markAllRead(tenantId: string, userId: string): Promise<number> {
    const result = await db.update(notifications)
      .set({ read: true })
      .where(and(
        eq(notifications.tenantId, tenantId),
        eq(notifications.userId, userId),
        eq(notifications.read, false)
      ))
      .returning({ id: notifications.id });

    return result.length;
  }

  async sendEmailAlert(
    tenantId: string,
    notificationId: string,
    input: CreateAlertInput
  ): Promise<void> {
    try {
      if (!input.userId) {
        console.log(`[Alerts] No userId specified, skipping email for alert ${notificationId}`);
        return;
      }

      const [user] = await db.select()
        .from(users)
        .where(and(
          eq(users.tenantId, tenantId),
          eq(users.id, input.userId)
        ));

      if (!user || !user.email) {
        console.log(`[Alerts] No email found for user ${input.userId}`);
        return;
      }

      console.log(`[Alerts] Would send email to ${user.email}: ${input.title}`);
      
    } catch (error) {
      console.error(`[Alerts] Failed to send email alert:`, error);
    }
  }

  async sendTeamsWebhook(
    tenantId: string,
    input: CreateAlertInput
  ): Promise<void> {
    try {
      const webhookUrl = await this.getTeamsWebhookUrl(tenantId);
      
      if (!webhookUrl) {
        console.log(`[Alerts] No Teams webhook configured for tenant ${tenantId}`);
        return;
      }

      const priority = input.priority || ALERT_PRIORITY_MAP[input.alertType] || "normal";
      
      const themeColor = priority === "critical" ? "FF0000" :
        priority === "high" ? "FFA500" :
        priority === "normal" ? "0076D7" : "808080";

      const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor,
        summary: input.title,
        sections: [
          {
            activityTitle: input.title,
            activitySubtitle: `Alert Type: ${input.alertType.replace(/_/g, " ")}`,
            facts: [
              { name: "Priority", value: priority.toUpperCase() },
              ...(input.entityType ? [{ name: "Entity Type", value: input.entityType }] : []),
              ...(input.entityId ? [{ name: "Entity ID", value: input.entityId }] : []),
            ],
            text: input.message || "",
            markdown: true,
          },
        ],
        potentialAction: input.actionUrl ? [
          {
            "@type": "OpenUri",
            name: "View Details",
            targets: [{ os: "default", uri: input.actionUrl }],
          },
        ] : [],
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });

      if (!response.ok) {
        throw new Error(`Teams webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log(`[Alerts] Sent Teams webhook for alert: ${input.title}`);
    } catch (error) {
      console.error(`[Alerts] Failed to send Teams webhook:`, error);
    }
  }

  async getNotificationChannels(
    tenantId: string,
    userId?: string,
    alertType?: AlertType
  ): Promise<AlertNotificationChannels> {
    const defaults: AlertNotificationChannels = {
      inApp: true,
      email: true,
      teamsWebhook: false,
    };

    if (!userId || !alertType) {
      const webhookUrl = await this.getTeamsWebhookUrl(tenantId);
      defaults.teamsWebhook = !!webhookUrl;
      return defaults;
    }

    const [prefs] = await db.select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.notificationType, alertType)
      ));

    if (!prefs) {
      const webhookUrl = await this.getTeamsWebhookUrl(tenantId);
      defaults.teamsWebhook = !!webhookUrl;
      return defaults;
    }

    const webhookUrl = await this.getTeamsWebhookUrl(tenantId);

    return {
      inApp: prefs.inApp ?? true,
      email: prefs.email ?? true,
      teamsWebhook: !!webhookUrl,
    };
  }

  async getPreferences(tenantId: string, userId: string) {
    return db.select()
      .from(notificationPreferences)
      .where(and(
        eq(notificationPreferences.tenantId, tenantId),
        eq(notificationPreferences.userId, userId)
      ));
  }

  async updatePreferences(
    tenantId: string,
    userId: string,
    preferences: Array<{
      notificationType: AlertType;
      inApp?: boolean;
      email?: boolean;
      emailDigest?: "instant" | "daily" | "weekly";
    }>
  ): Promise<void> {
    for (const pref of preferences) {
      const existing = await db.select()
        .from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.userId, userId),
          eq(notificationPreferences.notificationType, pref.notificationType)
        ))
        .limit(1);

      if (existing.length > 0) {
        await db.update(notificationPreferences)
          .set({
            inApp: pref.inApp ?? existing[0].inApp,
            email: pref.email ?? existing[0].email,
            emailDigest: pref.emailDigest ?? existing[0].emailDigest,
          })
          .where(eq(notificationPreferences.id, existing[0].id));
      } else {
        await db.insert(notificationPreferences).values({
          tenantId,
          userId,
          notificationType: pref.notificationType,
          inApp: pref.inApp ?? true,
          email: pref.email ?? true,
          emailDigest: pref.emailDigest ?? "instant",
        });
      }
    }

    await auditService.logEvent({
      tenantId,
      eventType: "notification_preferences_updated",
      actor: userId,
      entityType: "user",
      entityId: userId,
      afterJson: { preferences },
    });
  }

  private async getTeamsWebhookUrl(tenantId: string): Promise<string | null> {
    const [setting] = await db.select()
      .from(tenantSettings)
      .where(and(
        eq(tenantSettings.tenantId, tenantId),
        eq(tenantSettings.key, "teams_webhook_url")
      ));

    if (!setting || !setting.valueJson) {
      return process.env.TEAMS_WEBHOOK_URL || null;
    }

    return (setting.valueJson as { url?: string }).url || null;
  }

  async checkComplianceExpiry(tenantId: string): Promise<{
    checked: number;
    alertsCreated: number;
  }> {
    const { jacketDocuments } = await import("@shared/schema");
    const { gte, lte, isNotNull } = await import("drizzle-orm");

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiringDocs = await db.select()
      .from(jacketDocuments)
      .where(and(
        eq(jacketDocuments.tenantId, tenantId),
        isNotNull(jacketDocuments.expirationDate),
        lte(jacketDocuments.expirationDate, in30Days),
        gte(jacketDocuments.expirationDate, now)
      ));

    let alertsCreated = 0;

    for (const doc of expiringDocs) {
      const expirationDate = new Date(doc.expirationDate!);
      const daysUntilExpiry = Math.ceil((expirationDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

      let alertType: AlertType;
      if (daysUntilExpiry <= 7) {
        alertType = "compliance_expiry_7";
      } else if (daysUntilExpiry <= 14) {
        alertType = "compliance_expiry_14";
      } else {
        alertType = "compliance_expiry_30";
      }

      await this.createAlert({
        tenantId,
        alertType,
        title: ALERT_TITLE_MAP[alertType],
        message: `Document "${doc.fileName}" (${doc.documentType}) expires on ${expirationDate.toLocaleDateString()}`,
        entityType: "jacket_document",
        entityId: doc.id,
        actionUrl: `/documents/${doc.id}`,
      });

      alertsCreated++;
    }

    console.log(`[Alerts] Compliance expiry check: ${expiringDocs.length} docs checked, ${alertsCreated} alerts created`);
    
    return {
      checked: expiringDocs.length,
      alertsCreated,
    };
  }

  async detectDuplicates(
    tenantId: string,
    documentId: string,
    contentHash: string
  ): Promise<{ duplicatesFound: number; alertCreated: boolean }> {
    const { jacketDocuments } = await import("@shared/schema");
    const { ne } = await import("drizzle-orm");

    const duplicates = await db.select()
      .from(jacketDocuments)
      .where(and(
        eq(jacketDocuments.tenantId, tenantId),
        eq((jacketDocuments as any).contentHash, contentHash),
        ne(jacketDocuments.id, documentId)
      ));

    if (duplicates.length === 0) {
      return { duplicatesFound: 0, alertCreated: false };
    }

    const [currentDoc] = await db.select()
      .from(jacketDocuments)
      .where(eq(jacketDocuments.id, documentId));

    const duplicateNames = duplicates.map(d => d.fileName).join(", ");

    await this.createAlert({
      tenantId,
      alertType: "duplicate_detected",
      title: "Duplicate Document Detected",
      message: `Document "${currentDoc?.fileName || documentId}" appears to be a duplicate of: ${duplicateNames}`,
      entityType: "jacket_document",
      entityId: documentId,
      actionUrl: `/documents/${documentId}`,
    });

    console.log(`[Alerts] Duplicate detection: ${duplicates.length} duplicates found for document ${documentId}`);

    return {
      duplicatesFound: duplicates.length,
      alertCreated: true,
    };
  }

  async createNewCriticalDocAlert(
    tenantId: string,
    documentId: string,
    documentName: string,
    documentType: string
  ): Promise<string> {
    return this.createAlert({
      tenantId,
      alertType: "new_critical_doc",
      title: "New Critical Document Uploaded",
      message: `A new ${documentType} document "${documentName}" has been uploaded and requires attention.`,
      entityType: "jacket_document",
      entityId: documentId,
      actionUrl: `/documents/${documentId}`,
    });
  }

  async createDocModifiedAfterApprovalAlert(
    tenantId: string,
    documentId: string,
    documentName: string,
    modifiedBy: string
  ): Promise<string> {
    return this.createAlert({
      tenantId,
      alertType: "doc_modified_after_approval",
      title: "Document Modified After Approval",
      message: `Document "${documentName}" was modified by ${modifiedBy} after being approved. Review required.`,
      entityType: "jacket_document",
      entityId: documentId,
      priority: "high",
      actionUrl: `/documents/${documentId}`,
    });
  }

  async createMissingDocsAlert(
    tenantId: string,
    vendorId: string,
    vendorName: string,
    missingDocTypes: string[]
  ): Promise<string> {
    return this.createAlert({
      tenantId,
      alertType: "missing_docs",
      title: "Missing Required Documents",
      message: `Vendor "${vendorName}" is missing required documents: ${missingDocTypes.join(", ")}`,
      entityType: "vendor",
      entityId: vendorId,
      actionUrl: `/vendors/${vendorId}`,
    });
  }
}

export const alertsService = new AlertsService();
