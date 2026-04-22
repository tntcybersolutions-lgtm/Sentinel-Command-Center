import { auditService } from "../../services/audit.service";
import { approvalService } from "../../services/approval.service";

interface TeamsAdaptiveCard {
  type: "message";
  attachments: Array<{
    contentType: "application/vnd.microsoft.card.adaptive";
    content: {
      type: "AdaptiveCard";
      version: string;
      body: Array<{
        type: string;
        text?: string;
        weight?: string;
        size?: string;
        wrap?: boolean;
        columns?: Array<{
          type: string;
          width?: string;
          items?: unknown[];
        }>;
        facts?: Array<{ title: string; value: string }>;
      }>;
      actions?: Array<{
        type: string;
        title: string;
        url?: string;
        data?: unknown;
      }>;
    };
  }>;
}

interface TeamsTextMessage {
  text: string;
}

interface TeamsMentionMessage {
  body: {
    contentType: "html";
    content: string;
  };
  mentions?: Array<{
    id: number;
    mentionText: string;
    mentioned: {
      user: {
        displayName: string;
        id: string;
        userIdentityType: string;
      };
    };
  }>;
}

export class TeamsWebhookClient {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async sendTextMessage(text: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  async sendAdaptiveCard(card: TeamsAdaptiveCard): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(card),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  static createAlertCard(
    title: string,
    message: string,
    severity: "info" | "warning" | "critical",
    actionUrl?: string,
    facts?: Array<{ title: string; value: string }>
  ): TeamsAdaptiveCard {
    const severityColors: Record<string, string> = {
      info: "default",
      warning: "warning",
      critical: "attention",
    };

    const card: TeamsAdaptiveCard = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: `[${severity.toUpperCase()}] ${title}`,
                weight: "bolder",
                size: "large",
              },
              {
                type: "TextBlock",
                text: message,
                wrap: true,
              },
            ],
            actions: [],
          },
        },
      ],
    };

    if (facts && facts.length > 0) {
      card.attachments[0].content.body.push({
        type: "FactSet",
        facts,
      });
    }

    if (actionUrl) {
      card.attachments[0].content.actions = [
        {
          type: "Action.OpenUrl",
          title: "View Details",
          url: actionUrl,
        },
      ];
    }

    return card;
  }

  static createOpportunityCard(
    opportunityTitle: string,
    noticeId: string,
    dueDate: string,
    contractValue: string,
    setAside?: string,
    naicsCode?: string,
    actionUrl?: string
  ): TeamsAdaptiveCard {
    const facts: Array<{ title: string; value: string }> = [
      { title: "Notice ID", value: noticeId },
      { title: "Due Date", value: dueDate },
      { title: "Contract Value", value: contractValue },
    ];

    if (setAside) facts.push({ title: "Set-Aside", value: setAside });
    if (naicsCode) facts.push({ title: "NAICS", value: naicsCode });

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: "New Federal Opportunity",
                weight: "bolder",
                size: "medium",
              },
              {
                type: "TextBlock",
                text: opportunityTitle,
                weight: "bolder",
                size: "large",
                wrap: true,
              },
              {
                type: "FactSet",
                facts,
              },
            ],
            actions: actionUrl
              ? [
                  {
                    type: "Action.OpenUrl",
                    title: "View in SENTINEL",
                    url: actionUrl,
                  },
                ]
              : [],
          },
        },
      ],
    };
  }

  static createApprovalCard(
    title: string,
    description: string,
    requestedBy: string,
    entityType: string,
    approvalId: string,
    approvalUrl?: string
  ): TeamsAdaptiveCard {
    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: "Approval Required",
                weight: "bolder",
                size: "medium",
              },
              {
                type: "TextBlock",
                text: title,
                weight: "bolder",
                size: "large",
                wrap: true,
              },
              {
                type: "TextBlock",
                text: description,
                wrap: true,
              },
              {
                type: "FactSet",
                facts: [
                  { title: "Requested By", value: requestedBy },
                  { title: "Type", value: entityType },
                  { title: "Approval ID", value: approvalId },
                ],
              },
            ],
            actions: approvalUrl
              ? [
                  {
                    type: "Action.OpenUrl",
                    title: "Review & Approve",
                    url: approvalUrl,
                  },
                ]
              : [],
          },
        },
      ],
    };
  }

  static createDeadlineCard(
    title: string,
    entityType: string,
    dueDate: string,
    daysRemaining: number,
    actionUrl?: string
  ): TeamsAdaptiveCard {
    const urgency = daysRemaining <= 1 ? "URGENT" : daysRemaining <= 3 ? "WARNING" : "REMINDER";

    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: `[${urgency}] Deadline Approaching`,
                weight: "bolder",
                size: "medium",
              },
              {
                type: "TextBlock",
                text: title,
                weight: "bolder",
                size: "large",
                wrap: true,
              },
              {
                type: "FactSet",
                facts: [
                  { title: "Type", value: entityType },
                  { title: "Due Date", value: dueDate },
                  { title: "Days Remaining", value: daysRemaining.toString() },
                ],
              },
            ],
            actions: actionUrl
              ? [
                  {
                    type: "Action.OpenUrl",
                    title: "View Details",
                    url: actionUrl,
                  },
                ]
              : [],
          },
        },
      ],
    };
  }

  static createDailyDigestCard(
    date: string,
    stats: {
      newOpportunities: number;
      pendingApprovals: number;
      upcomingDeadlines: number;
      activeBids: number;
    },
    dashboardUrl?: string
  ): TeamsAdaptiveCard {
    return {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            type: "AdaptiveCard",
            version: "1.4",
            body: [
              {
                type: "TextBlock",
                text: `BLACKHAWK SENTINEL Daily Briefing - ${date}`,
                weight: "bolder",
                size: "large",
              },
              {
                type: "ColumnSet",
                columns: [
                  {
                    type: "Column",
                    width: "stretch",
                    items: [
                      { type: "TextBlock", text: stats.newOpportunities.toString(), size: "extraLarge", weight: "bolder" },
                      { type: "TextBlock", text: "New Opportunities", size: "small" },
                    ],
                  },
                  {
                    type: "Column",
                    width: "stretch",
                    items: [
                      { type: "TextBlock", text: stats.pendingApprovals.toString(), size: "extraLarge", weight: "bolder" },
                      { type: "TextBlock", text: "Pending Approvals", size: "small" },
                    ],
                  },
                  {
                    type: "Column",
                    width: "stretch",
                    items: [
                      { type: "TextBlock", text: stats.upcomingDeadlines.toString(), size: "extraLarge", weight: "bolder" },
                      { type: "TextBlock", text: "Deadlines This Week", size: "small" },
                    ],
                  },
                  {
                    type: "Column",
                    width: "stretch",
                    items: [
                      { type: "TextBlock", text: stats.activeBids.toString(), size: "extraLarge", weight: "bolder" },
                      { type: "TextBlock", text: "Active Bids", size: "small" },
                    ],
                  },
                ],
              },
            ],
            actions: dashboardUrl
              ? [
                  {
                    type: "Action.OpenUrl",
                    title: "Open Dashboard",
                    url: dashboardUrl,
                  },
                ]
              : [],
          },
        },
      ],
    };
  }
}

export class TeamsService {
  private defaultWebhook: TeamsWebhookClient | null = null;
  private channelWebhooks: Map<string, TeamsWebhookClient> = new Map();
  private appTenantId: string;

  constructor(appTenantId: string) {
    this.appTenantId = appTenantId;

    const defaultWebhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (defaultWebhookUrl) {
      this.defaultWebhook = new TeamsWebhookClient(defaultWebhookUrl);
    }

    const alertsWebhookUrl = process.env.TEAMS_ALERTS_WEBHOOK_URL;
    if (alertsWebhookUrl) {
      this.channelWebhooks.set("alerts", new TeamsWebhookClient(alertsWebhookUrl));
    }

    const approvalsWebhookUrl = process.env.TEAMS_APPROVALS_WEBHOOK_URL;
    if (approvalsWebhookUrl) {
      this.channelWebhooks.set("approvals", new TeamsWebhookClient(approvalsWebhookUrl));
    }

    const opportunitiesWebhookUrl = process.env.TEAMS_OPPORTUNITIES_WEBHOOK_URL;
    if (opportunitiesWebhookUrl) {
      this.channelWebhooks.set("opportunities", new TeamsWebhookClient(opportunitiesWebhookUrl));
    }
  }

  isConfigured(): boolean {
    return this.defaultWebhook !== null || this.channelWebhooks.size > 0;
  }

  private getWebhook(channel?: string): TeamsWebhookClient | null {
    if (channel && this.channelWebhooks.has(channel)) {
      return this.channelWebhooks.get(channel)!;
    }
    return this.defaultWebhook;
  }

  async sendAlert(
    title: string,
    message: string,
    severity: "info" | "warning" | "critical",
    actor: string,
    options: {
      channel?: string;
      actionUrl?: string;
      facts?: Array<{ title: string; value: string }>;
    } = {}
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook(options.channel || "alerts");
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const card = TeamsWebhookClient.createAlertCard(
      title,
      message,
      severity,
      options.actionUrl,
      options.facts
    );

    const result = await webhook.sendAdaptiveCard(card);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_alert_sent",
        actor,
        entityType: "teams_notification",
        entityId: `alert_${Date.now()}`,
        afterJson: { title, severity, channel: options.channel },
      });
    }

    return result;
  }

  async sendOpportunityNotification(
    opportunity: {
      title: string;
      noticeId: string;
      dueDate: string;
      contractValue: string;
      setAside?: string;
      naicsCode?: string;
    },
    actor: string,
    actionUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook("opportunities");
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const card = TeamsWebhookClient.createOpportunityCard(
      opportunity.title,
      opportunity.noticeId,
      opportunity.dueDate,
      opportunity.contractValue,
      opportunity.setAside,
      opportunity.naicsCode,
      actionUrl
    );

    const result = await webhook.sendAdaptiveCard(card);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_opportunity_notification",
        actor,
        entityType: "opportunity",
        entityId: opportunity.noticeId,
        afterJson: { title: opportunity.title },
      });
    }

    return result;
  }

  async sendApprovalRequest(
    approval: {
      title: string;
      description: string;
      requestedBy: string;
      entityType: string;
      approvalId: string;
    },
    actor: string,
    approvalUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook("approvals");
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const card = TeamsWebhookClient.createApprovalCard(
      approval.title,
      approval.description,
      approval.requestedBy,
      approval.entityType,
      approval.approvalId,
      approvalUrl
    );

    const result = await webhook.sendAdaptiveCard(card);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_approval_notification",
        actor,
        entityType: "approval_request",
        entityId: approval.approvalId,
        afterJson: { title: approval.title },
      });
    }

    return result;
  }

  async sendDeadlineReminder(
    deadline: {
      title: string;
      entityType: string;
      dueDate: string;
      daysRemaining: number;
    },
    actor: string,
    actionUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook("alerts");
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const card = TeamsWebhookClient.createDeadlineCard(
      deadline.title,
      deadline.entityType,
      deadline.dueDate,
      deadline.daysRemaining,
      actionUrl
    );

    const result = await webhook.sendAdaptiveCard(card);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_deadline_reminder",
        actor,
        entityType: deadline.entityType,
        entityId: `deadline_${Date.now()}`,
        afterJson: { title: deadline.title, daysRemaining: deadline.daysRemaining },
      });
    }

    return result;
  }

  async sendDailyDigest(
    stats: {
      newOpportunities: number;
      pendingApprovals: number;
      upcomingDeadlines: number;
      activeBids: number;
    },
    actor: string,
    dashboardUrl?: string
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook();
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const date = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const card = TeamsWebhookClient.createDailyDigestCard(date, stats, dashboardUrl);

    const result = await webhook.sendAdaptiveCard(card);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_daily_digest_sent",
        actor,
        entityType: "digest",
        entityId: `digest_${new Date().toISOString().split("T")[0]}`,
        afterJson: stats,
      });
    }

    return result;
  }

  async sendSimpleMessage(
    text: string,
    actor: string,
    channel?: string
  ): Promise<{ success: boolean; error?: string }> {
    const webhook = this.getWebhook(channel);
    if (!webhook) {
      return { success: false, error: "Teams webhook not configured" };
    }

    const result = await webhook.sendTextMessage(text);

    if (result.success) {
      await auditService.logEvent({
        tenantId: this.appTenantId,
        eventType: "teams_message_sent",
        actor,
        entityType: "teams_message",
        entityId: `msg_${Date.now()}`,
        afterJson: { text: text.substring(0, 200), channel },
      });
    }

    return result;
  }

  async sendApprovalGatedMessage(
    entityType: string,
    entityId: string,
    text: string,
    actor: string,
    channel?: string
  ): Promise<{ success: boolean; approvalRequired?: boolean; requestId?: string; error?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      entityType,
      entityId,
      "teams_message"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType,
        entityId,
        actionType: "teams_message",
        requestedBy: actor,
        metadata: { text, channel },
      });

      return { success: false, approvalRequired: true, requestId };
    }

    return this.sendSimpleMessage(text, actor, channel);
  }
}

export function createTeamsService(appTenantId: string): TeamsService {
  return new TeamsService(appTenantId);
}
