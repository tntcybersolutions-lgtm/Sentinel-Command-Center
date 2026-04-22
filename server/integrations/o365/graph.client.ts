import { approvalService } from "../../services/approval.service";
import { auditService } from "../../services/audit.service";

interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface OutlookCalendarEvent {
  subject: string;
  body?: {
    contentType: "text" | "html";
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: "required" | "optional";
  }>;
  reminderMinutesBeforeStart?: number;
}

interface OutlookEmailMessage {
  subject: string;
  body: {
    contentType: "text" | "html";
    content: string;
  };
  toRecipients: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
  }>;
}

export class MicrosoftGraphClient {
  private tenantId: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(tenantId: string, clientId: string, clientSecret: string) {
    this.tenantId = tenantId;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.accessToken;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;
    
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const data: GraphTokenResponse = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
    
    return this.accessToken;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const token = await this.getAccessToken();
    
    return fetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  }

  async createCalendarEvent(
    userId: string,
    event: OutlookCalendarEvent
  ): Promise<{ id: string; webLink: string }> {
    const response = await this.makeRequest(`/users/${userId}/calendar/events`, {
      method: "POST",
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create calendar event: ${error}`);
    }

    const data = await response.json();
    return { id: data.id, webLink: data.webLink };
  }

  async updateCalendarEvent(
    userId: string,
    eventId: string,
    updates: Partial<OutlookCalendarEvent>
  ): Promise<void> {
    const response = await this.makeRequest(`/users/${userId}/calendar/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update calendar event: ${error}`);
    }
  }

  async deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
    const response = await this.makeRequest(`/users/${userId}/calendar/events/${eventId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete calendar event: ${error}`);
    }
  }

  async sendEmail(
    userId: string,
    message: OutlookEmailMessage,
    saveToSentItems = true
  ): Promise<void> {
    const response = await this.makeRequest(`/users/${userId}/sendMail`, {
      method: "POST",
      body: JSON.stringify({
        message,
        saveToSentItems,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  async createDraftEmail(
    userId: string,
    message: OutlookEmailMessage
  ): Promise<{ id: string }> {
    const response = await this.makeRequest(`/users/${userId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        ...message,
        isDraft: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create draft email: ${error}`);
    }

    const data = await response.json();
    return { id: data.id };
  }

  async sendTeamsMessage(
    teamId: string,
    channelId: string,
    content: string
  ): Promise<void> {
    const response = await this.makeRequest(`/teams/${teamId}/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        body: {
          contentType: "html",
          content,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send Teams message: ${error}`);
    }
  }
}

export class O365Service {
  private client: MicrosoftGraphClient | null = null;
  private appTenantId: string;

  constructor(appTenantId: string) {
    this.appTenantId = appTenantId;
    
    const msTenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

    if (msTenantId && clientId && clientSecret) {
      this.client = new MicrosoftGraphClient(msTenantId, clientId, clientSecret);
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createApprovalGatedCalendarEvent(
    entityType: string,
    entityId: string,
    userId: string,
    event: {
      subject: string;
      body: string;
      startTime: Date;
      endTime: Date;
      location?: string;
      attendees?: string[];
    },
    requestedBy: string
  ): Promise<{ eventId?: string; approvalRequired: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      entityType,
      entityId,
      "calendar_publish"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType,
        entityId,
        actionType: "calendar_publish",
        requestedBy,
        metadata: { event },
      });

      return { approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("Microsoft Graph client not configured");
    }

    const outlookEvent: OutlookCalendarEvent = {
      subject: event.subject,
      body: {
        contentType: "html",
        content: event.body,
      },
      start: {
        dateTime: event.startTime.toISOString(),
        timeZone: "America/New_York",
      },
      end: {
        dateTime: event.endTime.toISOString(),
        timeZone: "America/New_York",
      },
      location: event.location ? { displayName: event.location } : undefined,
      attendees: event.attendees?.map(email => ({
        emailAddress: { address: email },
        type: "required" as const,
      })),
    };

    const result = await this.client.createCalendarEvent(userId, outlookEvent);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "calendar_event_created",
      actor: requestedBy,
      entityType,
      entityId,
      afterJson: { eventId: result.id, subject: event.subject },
    });

    return { eventId: result.id, approvalRequired: false };
  }

  async sendApprovalGatedEmail(
    entityType: string,
    entityId: string,
    userId: string,
    email: {
      subject: string;
      body: string;
      to: string[];
      cc?: string[];
    },
    requestedBy: string
  ): Promise<{ sent: boolean; approvalRequired: boolean; requestId?: string; draftId?: string }> {
    const approval = await approvalService.checkApproval(
      this.appTenantId,
      entityType,
      entityId,
      "email_send"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: this.appTenantId,
        entityType,
        entityId,
        actionType: "email_send",
        requestedBy,
        metadata: { email },
      });

      if (this.client) {
        const draft = await this.client.createDraftEmail(userId, {
          subject: email.subject,
          body: { contentType: "html", content: email.body },
          toRecipients: email.to.map(addr => ({ emailAddress: { address: addr } })),
          ccRecipients: email.cc?.map(addr => ({ emailAddress: { address: addr } })),
        });

        return { sent: false, approvalRequired: true, requestId, draftId: draft.id };
      }

      return { sent: false, approvalRequired: true, requestId };
    }

    if (!this.client) {
      throw new Error("Microsoft Graph client not configured");
    }

    await this.client.sendEmail(userId, {
      subject: email.subject,
      body: { contentType: "html", content: email.body },
      toRecipients: email.to.map(addr => ({ emailAddress: { address: addr } })),
      ccRecipients: email.cc?.map(addr => ({ emailAddress: { address: addr } })),
    });

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "email_sent",
      actor: requestedBy,
      entityType,
      entityId,
      afterJson: { subject: email.subject, to: email.to },
    });

    return { sent: true, approvalRequired: false };
  }

  async sendTeamsAlert(
    teamId: string,
    channelId: string,
    content: string,
    actor: string
  ): Promise<void> {
    if (!this.client) {
      console.warn("Microsoft Graph client not configured, Teams alert not sent");
      return;
    }

    await this.client.sendTeamsMessage(teamId, channelId, content);

    await auditService.logEvent({
      tenantId: this.appTenantId,
      eventType: "teams_alert_sent",
      actor,
      entityType: "teams_notification",
      entityId: `${teamId}/${channelId}`,
      afterJson: { content: content.substring(0, 200) },
    });
  }
}

export function createO365Service(appTenantId: string): O365Service {
  return new O365Service(appTenantId);
}
