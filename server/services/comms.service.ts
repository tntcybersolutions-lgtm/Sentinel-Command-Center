import { db } from "../db";
import { emailMessages, emailSequences, sequenceEnrollments, calendarEvents, notifications } from "@shared/schema";
import { eq, and, lte, desc } from "drizzle-orm";
import { auditService } from "./audit.service";
import { approvalService } from "./approval.service";
import { queueService } from "../queue/queue.service";

export interface EmailDraftInput {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  subject: string;
  bodyHtml: string;
  direction?: "outbound" | "inbound";
  createdBy: string;
}

export interface CalendarEventInput {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  location?: string;
  eventType: string;
  createdBy: string;
}

export class CommsService {
  async createEmailDraft(input: EmailDraftInput): Promise<string> {
    const [message] = await db.insert(emailMessages).values({
      tenantId: input.tenantId,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      direction: input.direction,
      status: "draft",
      subject: input.subject,
      bodyHtml: input.bodyHtml,
    }).returning({ id: emailMessages.id });

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: "email_draft_created",
      actor: input.createdBy,
      entityType: "email_message",
      entityId: message.id,
      afterJson: { subject: input.subject },
    });

    return message.id;
  }

  async sendEmail(
    tenantId: string,
    messageId: string,
    senderUserId: string
  ): Promise<{ sent: boolean; approvalRequired: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      tenantId,
      "email_message",
      messageId,
      "email_send"
    );

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId,
        entityType: "email_message",
        entityId: messageId,
        actionType: "email_send",
        requestedBy: senderUserId,
      });

      return { sent: false, approvalRequired: true, requestId };
    }

    await queueService.enqueue({
      tenantId,
      jobType: "send_email",
      payload: { messageId, senderUserId },
      idempotencyKey: `send-email-${messageId}`,
    });

    await db.update(emailMessages)
      .set({ status: "queued" })
      .where(eq(emailMessages.id, messageId));

    return { sent: true, approvalRequired: false };
  }

  async createCalendarEvent(input: CalendarEventInput): Promise<{ eventId: string; approvalRequired: boolean; requestId?: string }> {
    const approval = await approvalService.checkApproval(
      input.tenantId,
      "calendar_event",
      input.entityId || "general",
      "calendar_publish"
    );

    const [event] = await db.insert(calendarEvents).values({
      tenantId: input.tenantId,
      entityType: input.entityType || null,
      entityId: input.entityId || null,
      title: input.title,
      description: input.description || null,
      startAt: input.startAt,
      endAt: input.endAt,
      location: input.location || null,
      eventType: input.eventType,
      status: approval.approved ? "pending_sync" : "pending_approval",
    }).returning({ id: calendarEvents.id });

    if (!approval.approved) {
      const requestId = await approvalService.createRequest({
        tenantId: input.tenantId,
        entityType: "calendar_event",
        entityId: event.id,
        actionType: "calendar_publish",
        requestedBy: input.createdBy,
      });

      await auditService.logEvent({
        tenantId: input.tenantId,
        eventType: "calendar_event_pending_approval",
        actor: input.createdBy,
        entityType: "calendar_event",
        entityId: event.id,
        afterJson: { title: input.title, requestId },
      });

      return { eventId: event.id, approvalRequired: true, requestId };
    }

    await queueService.enqueue({
      tenantId: input.tenantId,
      jobType: "create_calendar_event",
      payload: { eventId: event.id },
      idempotencyKey: `calendar-event-${event.id}`,
    });

    await auditService.logEvent({
      tenantId: input.tenantId,
      eventType: "calendar_event_created",
      actor: input.createdBy,
      entityType: "calendar_event",
      entityId: event.id,
      afterJson: { title: input.title },
    });

    return { eventId: event.id, approvalRequired: false };
  }

  async enrollInSequence(
    tenantId: string,
    sequenceId: string,
    entityType: string,
    entityId: string,
    enrolledBy: string
  ): Promise<string> {
    const [sequence] = await db.select()
      .from(emailSequences)
      .where(and(
        eq(emailSequences.id, sequenceId),
        eq(emailSequences.tenantId, tenantId),
        eq(emailSequences.enabled, true)
      ));

    if (!sequence) {
      throw new Error(`Sequence ${sequenceId} not found or inactive`);
    }

    const sequenceConfig = sequence.stepsJson as { steps: Array<{ delayHours: number }> };
    const firstStepDelay = sequenceConfig.steps?.[0]?.delayHours || 24;
    const nextStepAt = new Date(Date.now() + firstStepDelay * 60 * 60 * 1000);

    const [enrollment] = await db.insert(sequenceEnrollments).values({
      tenantId,
      sequenceId,
      entityType,
      entityId,
      status: "active",
      currentStep: 0,
      nextStepAt,
    }).returning({ id: sequenceEnrollments.id });

    await auditService.logEvent({
      tenantId,
      eventType: "sequence_enrollment_created",
      actor: enrolledBy,
      entityType: "sequence_enrollment",
      entityId: enrollment.id,
      afterJson: { sequenceId, entityType, entityId },
    });

    return enrollment.id;
  }

  async processSequenceStep(enrollmentId: string): Promise<void> {
    const [enrollment] = await db.select()
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.id, enrollmentId));

    if (!enrollment || enrollment.status !== "active") {
      return;
    }

    const [sequence] = await db.select()
      .from(emailSequences)
      .where(eq(emailSequences.id, enrollment.sequenceId));

    if (!sequence) {
      return;
    }

    const sequenceConfig = sequence.stepsJson as { 
      steps: Array<{ 
        delayHours: number;
        templateId: string;
        action: string;
      }> 
    };
    
    const currentStep = sequenceConfig.steps?.[enrollment.currentStep];
    if (!currentStep) {
      await db.update(sequenceEnrollments)
        .set({ status: "completed" })
        .where(eq(sequenceEnrollments.id, enrollmentId));
      return;
    }

    const nextStepIndex = enrollment.currentStep + 1;
    const nextStep = sequenceConfig.steps?.[nextStepIndex];
    
    if (nextStep) {
      const nextStepAt = new Date(Date.now() + nextStep.delayHours * 60 * 60 * 1000);
      await db.update(sequenceEnrollments)
        .set({ 
          currentStep: nextStepIndex,
          nextStepAt,
        })
        .where(eq(sequenceEnrollments.id, enrollmentId));
    } else {
      await db.update(sequenceEnrollments)
        .set({ status: "completed" })
        .where(eq(sequenceEnrollments.id, enrollmentId));
    }
  }

  async createNotification(
    tenantId: string,
    type: "email" | "teams" | "in_app",
    title: string,
    message?: string
  ): Promise<string> {
    const [notification] = await db.insert(notifications).values({
      tenantId,
      type,
      title,
      message,
    }).returning({ id: notifications.id });

    return notification.id;
  }

  async getUpcomingEvents(tenantId: string, daysAhead = 7) {
    const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    
    return db.select()
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.tenantId, tenantId),
        lte(calendarEvents.startAt, futureDate)
      ))
      .orderBy(calendarEvents.startAt);
  }

  async getEmailsByEntity(tenantId: string, entityType: string, entityId: string) {
    return db.select()
      .from(emailMessages)
      .where(and(
        eq(emailMessages.tenantId, tenantId),
        eq(emailMessages.entityType, entityType),
        eq(emailMessages.entityId, entityId)
      ))
      .orderBy(desc(emailMessages.createdAt));
  }
}

export const commsService = new CommsService();
