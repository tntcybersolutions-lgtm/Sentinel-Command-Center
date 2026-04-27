import { db } from "../db";
import { jobs, jobRuns, distributedLocks, idempotencyKeys, deadLetterQueue } from "@shared/schema";
import { eq, and, lte, isNull, desc, sql } from "drizzle-orm";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "dead_lettered";
export type JobType = 
  | "samgov_ingest"
  | "opportunity_score"
  | "send_email"
  | "create_calendar_event"
  | "generate_bid_draft"
  | "daily_digest"
  | "deadline_monitor"
  | "followup_sequence"
  | "sync_documents"
  | "herbie_autonomous"
  | "ciobot_analysis"
  | "legalops_compliance"
  | "foreman_monitor"
  | "doc_ai_process"
  | "compliance_expiry_check"
  | "duplicate_detection"
  | "egnyte_delta_sync"
  | "jacket_integrity_sweep"
  | "storage_orphan_sweep"
  | "document_ingestion"
  | "document_ingestion_retry"
  | "document_ingestion_cycle"
  | "coi_expiry_monitor";

export interface JobPayload {
  [key: string]: unknown;
}

export interface CreateJobInput {
  tenantId: string;
  jobType: JobType;
  payload: JobPayload;
  priority?: number;
  runAt?: Date;
  maxAttempts?: number;
  idempotencyKey?: string;
}

export class QueueService {
  async enqueue(input: CreateJobInput): Promise<string | null> {
    if (input.idempotencyKey) {
      const existing = await db.select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, input.idempotencyKey))
        .limit(1);

      if (existing.length > 0) {
        console.log(`Idempotency key ${input.idempotencyKey} already exists, skipping`);
        return null;
      }

      await db.insert(idempotencyKeys).values({
        key: input.idempotencyKey,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    const [job] = await db.insert(jobs).values({
      tenantId: input.tenantId,
      jobType: input.jobType,
      payloadJson: input.payload,
      priority: input.priority || 0,
      scheduledAt: input.runAt || new Date(),
      status: "pending",
      attempts: 0,
      maxAttempts: input.maxAttempts || 3,
    }).returning({ id: jobs.id });

    console.log(`Enqueued job ${job.id} of type ${input.jobType}`);
    return job.id;
  }

  async dequeue(workerId: string): Promise<{ id: string; jobType: string; payload: JobPayload } | null> {
    const now = new Date();
    
    const pendingJobs = await db.select()
      .from(jobs)
      .where(and(
        eq(jobs.status, "pending"),
        lte(jobs.scheduledAt, now)
      ))
      .orderBy(desc(jobs.priority), jobs.scheduledAt)
      .limit(1);

    if (pendingJobs.length === 0) {
      return null;
    }

    const job = pendingJobs[0];

    const lockAcquired = await this.acquireLock(`job:${job.id}`, workerId, 300);
    if (!lockAcquired) {
      return null;
    }

    await db.update(jobs)
      .set({ 
        status: "running",
        attempts: job.attempts + 1,
        startedAt: now,
      })
      .where(eq(jobs.id, job.id));

    await db.insert(jobRuns).values({
      jobId: job.id,
      attempt: job.attempts + 1,
      startedAt: now,
      status: "running",
    });

    return {
      id: job.id,
      jobType: job.jobType,
      payload: job.payloadJson as JobPayload,
    };
  }

  async complete(jobId: string, workerId: string): Promise<void> {
    await db.update(jobs)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(jobs.id, jobId));

    await db.update(jobRuns)
      .set({ 
        status: "completed",
        endedAt: new Date(),
      })
      .where(and(
        eq(jobRuns.jobId, jobId),
        isNull(jobRuns.endedAt)
      ));

    await this.releaseLock(`job:${jobId}`, workerId);
    console.log(`Job ${jobId} completed successfully`);
  }

  async fail(jobId: string, workerId: string, error: Error): Promise<void> {
    const [job] = await db.select()
      .from(jobs)
      .where(eq(jobs.id, jobId));

    if (!job) return;

    const shouldDeadLetter = job.attempts >= job.maxAttempts;
    const newStatus = shouldDeadLetter ? "dead_lettered" : "pending";
    const backoffMs = Math.min(30000, 1000 * Math.pow(2, job.attempts));
    const nextScheduledAt = new Date(Date.now() + backoffMs);

    await db.update(jobs)
      .set({ 
        status: newStatus,
        scheduledAt: shouldDeadLetter ? job.scheduledAt : nextScheduledAt,
        lastError: error.message,
      })
      .where(eq(jobs.id, jobId));

    await db.update(jobRuns)
      .set({ 
        status: "failed",
        endedAt: new Date(),
      })
      .where(and(
        eq(jobRuns.jobId, jobId),
        isNull(jobRuns.endedAt)
      ));

    if (shouldDeadLetter) {
      await db.insert(deadLetterQueue).values({
        originalJobId: job.id,
        jobType: job.jobType,
        payloadJson: job.payloadJson,
        failedAt: new Date(),
        errorJson: { message: error.message, attempts: job.attempts },
      });
      console.log(`Job ${jobId} dead-lettered after ${job.attempts} attempts`);
    } else {
      console.log(`Job ${jobId} failed, will retry at ${nextScheduledAt}`);
    }

    await this.releaseLock(`job:${jobId}`, workerId);
  }

  async acquireLock(lockKey: string, lockedBy: string, ttlSeconds: number): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

    try {
      await db.delete(distributedLocks)
        .where(lte(distributedLocks.expiresAt, now));

      await db.insert(distributedLocks).values({
        lockKey,
        lockedBy,
        lockedAt: now,
        expiresAt,
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  async releaseLock(lockKey: string, lockedBy: string): Promise<void> {
    await db.delete(distributedLocks)
      .where(and(
        eq(distributedLocks.lockKey, lockKey),
        eq(distributedLocks.lockedBy, lockedBy)
      ));
  }

  async getJobStatus(jobId: string) {
    const [job] = await db.select()
      .from(jobs)
      .where(eq(jobs.id, jobId));
    return job;
  }

  async getPendingJobCount(tenantId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(and(
        eq(jobs.tenantId, tenantId),
        eq(jobs.status, "pending")
      ));
    return result[0]?.count || 0;
  }

  async getDeadLetterQueue() {
    return db.select()
      .from(deadLetterQueue)
      .orderBy(desc(deadLetterQueue.failedAt));
  }

  async retryDeadLetter(dlqId: string, tenantId: string): Promise<string | null> {
    const [dlq] = await db.select()
      .from(deadLetterQueue)
      .where(eq(deadLetterQueue.id, dlqId));

    if (!dlq) return null;

    const jobId = await this.enqueue({
      tenantId,
      jobType: dlq.jobType as JobType,
      payload: dlq.payloadJson as JobPayload,
    });

    await db.delete(deadLetterQueue)
      .where(eq(deadLetterQueue.id, dlqId));

    return jobId;
  }
}

export const queueService = new QueueService();
