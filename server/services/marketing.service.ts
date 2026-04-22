import { db } from "../db";
import { 
  marketingCampaigns, campaignRecipients, capabilityStatements,
  contacts
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { auditService } from "./audit.service";
import { approvalService } from "./approval.service";

class MarketingService {
  async listCampaigns(tenantId: string, filters?: {
    status?: string;
    campaignType?: string;
    channel?: string;
  }) {
    let conditions = [eq(marketingCampaigns.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(marketingCampaigns.status, filters.status));
    }
    if (filters?.campaignType) {
      conditions.push(eq(marketingCampaigns.campaignType, filters.campaignType));
    }
    if (filters?.channel) {
      conditions.push(eq(marketingCampaigns.channel, filters.channel));
    }

    return db.select()
      .from(marketingCampaigns)
      .where(and(...conditions))
      .orderBy(desc(marketingCampaigns.createdAt));
  }

  async getCampaign(tenantId: string, campaignId: string) {
    const [campaign] = await db.select()
      .from(marketingCampaigns)
      .where(and(
        eq(marketingCampaigns.tenantId, tenantId),
        eq(marketingCampaigns.id, campaignId)
      ));
    return campaign;
  }

  async createCampaign(tenantId: string, data: {
    name: string;
    description?: string;
    campaignType: string;
    channel: string;
    targetAudienceJson?: unknown;
    contentJson?: unknown;
    scheduledAt?: Date;
    budgetAmount?: string;
    goalsJson?: unknown;
    createdByUserId?: string;
  }) {
    const [campaign] = await db.insert(marketingCampaigns)
      .values({
        tenantId,
        ...data,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "campaign.created",
      actor: data.createdByUserId || "system",
      entityType: "marketing_campaign",
      entityId: campaign.id,
      afterJson: campaign as Record<string, unknown>,
    });

    return campaign;
  }

  async updateCampaign(tenantId: string, campaignId: string, data: Partial<{
    name: string;
    description: string;
    targetAudienceJson: unknown;
    contentJson: unknown;
    scheduledAt: Date;
    budgetAmount: string;
    goalsJson: unknown;
    status: string;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.tenantId, tenantId), eq(marketingCampaigns.id, campaignId)));

    const [campaign] = await db.update(marketingCampaigns)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(marketingCampaigns.tenantId, tenantId), eq(marketingCampaigns.id, campaignId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "campaign.updated",
      actor: actorId || "system",
      entityType: "marketing_campaign",
      entityId: campaignId,
      beforeJson: before as Record<string, unknown>,
      afterJson: campaign as Record<string, unknown>,
    });

    return campaign;
  }

  async launchCampaign(tenantId: string, campaignId: string, actorId: string) {
    const approval = await approvalService.checkApproval(
      tenantId, "marketing_campaign", campaignId, "external_commitment"
    );
    
    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId,
        entityType: "marketing_campaign",
        entityId: campaignId,
        actionType: "external_commitment",
        requestedBy: actorId,
      });
      return { success: false, message: "Campaign requires approval", requestId };
    }

    const [campaign] = await db.update(marketingCampaigns)
      .set({
        status: "active",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(marketingCampaigns.tenantId, tenantId), eq(marketingCampaigns.id, campaignId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "campaign.launched",
      actor: actorId,
      entityType: "marketing_campaign",
      entityId: campaignId,
      afterJson: campaign as Record<string, unknown>,
    });

    return { success: true, campaign };
  }

  async addRecipients(tenantId: string, campaignId: string, recipients: {
    contactId?: string;
    email?: string;
    phone?: string;
  }[]) {
    const inserted = [];
    
    for (const recipient of recipients) {
      const [rec] = await db.insert(campaignRecipients)
        .values({
          tenantId,
          campaignId,
          ...recipient,
          status: "pending",
        })
        .returning();
      inserted.push(rec);
    }

    return inserted;
  }

  async getRecipients(tenantId: string, campaignId: string) {
    return db.select({
      recipient: campaignRecipients,
      contact: contacts,
    })
      .from(campaignRecipients)
      .leftJoin(contacts, eq(campaignRecipients.contactId, contacts.id))
      .where(and(
        eq(campaignRecipients.tenantId, tenantId),
        eq(campaignRecipients.campaignId, campaignId)
      ));
  }

  async updateRecipientStatus(tenantId: string, recipientId: string, data: {
    status: string;
    sentAt?: Date;
    deliveredAt?: Date;
    openedAt?: Date;
    clickedAt?: Date;
    respondedAt?: Date;
    unsubscribedAt?: Date;
    bouncedAt?: Date;
    interactionsJson?: unknown;
  }) {
    const [recipient] = await db.update(campaignRecipients)
      .set(data)
      .where(and(eq(campaignRecipients.tenantId, tenantId), eq(campaignRecipients.id, recipientId)))
      .returning();

    return recipient;
  }

  async getCampaignMetrics(tenantId: string, campaignId: string) {
    const recipients = await db.select()
      .from(campaignRecipients)
      .where(and(
        eq(campaignRecipients.tenantId, tenantId),
        eq(campaignRecipients.campaignId, campaignId)
      ));

    const total = recipients.length;
    const sent = recipients.filter(r => r.sentAt).length;
    const delivered = recipients.filter(r => r.deliveredAt).length;
    const opened = recipients.filter(r => r.openedAt).length;
    const clicked = recipients.filter(r => r.clickedAt).length;
    const responded = recipients.filter(r => r.respondedAt).length;
    const bounced = recipients.filter(r => r.bouncedAt).length;
    const unsubscribed = recipients.filter(r => r.unsubscribedAt).length;

    return {
      totalRecipients: total,
      sent,
      delivered,
      opened,
      clicked,
      responded,
      bounced,
      unsubscribed,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      responseRate: delivered > 0 ? (responded / delivered) * 100 : 0,
    };
  }

  async listCapabilityStatements(tenantId: string) {
    return db.select()
      .from(capabilityStatements)
      .where(eq(capabilityStatements.tenantId, tenantId))
      .orderBy(desc(capabilityStatements.createdAt));
  }

  async createCapabilityStatement(tenantId: string, data: {
    name: string;
    contentJson?: unknown;
    naicsCodesJson?: unknown;
    pastPerformanceJson?: unknown;
    certificationsJson?: unknown;
    differentiatorsJson?: unknown;
    createdByUserId?: string;
  }) {
    const [statement] = await db.insert(capabilityStatements)
      .values({
        tenantId,
        ...data,
        version: 1,
        status: "draft",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "capability_statement.created",
      actor: data.createdByUserId || "system",
      entityType: "capability_statement",
      entityId: statement.id,
      afterJson: statement as Record<string, unknown>,
    });

    return statement;
  }

  async publishCapabilityStatement(tenantId: string, statementId: string, actorId?: string) {
    const [statement] = await db.update(capabilityStatements)
      .set({
        status: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(capabilityStatements.tenantId, tenantId), eq(capabilityStatements.id, statementId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "capability_statement.published",
      actor: actorId || "system",
      entityType: "capability_statement",
      entityId: statementId,
      afterJson: statement as Record<string, unknown>,
    });

    return statement;
  }

  async getMarketingDashboard(tenantId: string) {
    const campaigns = await this.listCampaigns(tenantId);
    const activeCampaigns = campaigns.filter(c => c.status === "active");
    const draftCampaigns = campaigns.filter(c => c.status === "draft");
    const completedCampaigns = campaigns.filter(c => c.status === "completed");

    const totalSpent = campaigns.reduce((sum, c) => sum + parseFloat(c.spentAmount || "0"), 0);
    const totalBudget = campaigns.reduce((sum, c) => sum + parseFloat(c.budgetAmount || "0"), 0);

    const statements = await this.listCapabilityStatements(tenantId);
    const publishedStatements = statements.filter(s => s.status === "published");

    return {
      totalCampaigns: campaigns.length,
      activeCampaigns: activeCampaigns.length,
      draftCampaigns: draftCampaigns.length,
      completedCampaigns: completedCampaigns.length,
      totalBudget,
      totalSpent,
      budgetUtilization: totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0,
      capabilityStatements: statements.length,
      publishedStatements: publishedStatements.length,
      recentCampaigns: campaigns.slice(0, 5),
    };
  }
}

export const marketingService = new MarketingService();
