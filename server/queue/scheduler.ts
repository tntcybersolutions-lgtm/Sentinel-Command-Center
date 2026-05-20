// server/queue/scheduler.ts
//
// 2026-05-20 update: samgov_ingest moved from every-10-minutes to twice daily
// (06:00 and 18:00 server-local). The previous setInterval-only scheduler
// couldn't pin to wall-clock times, so we added `runAtHours?: number[]`. When
// present, the job is scheduled with a self-rescheduling setTimeout chain that
// always targets the next configured hour. setInterval is still the default for
// everything else.

import { queueService, JobType } from "./queue.service";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

interface ScheduleConfig {
  jobType: JobType;
  cronPattern: string;
  /** Used by setInterval when runAtHours is not provided. */
  intervalMs: number;
  /**
   * When present, the job fires at these wall-clock hours (server-local time)
   * each day and intervalMs is ignored for scheduling (still used for the
   * idempotency time slot to dedupe within a day).
   */
  runAtHours?: number[];
  description: string;
}

const SCHEDULES: ScheduleConfig[] = [
  {
    jobType: "samgov_ingest",
    cronPattern: "0 6,18 * * *",
    intervalMs: 12 * 60 * 60 * 1000, // 12h slot for idempotency key
    runAtHours: [6, 18],
    description: "SAM.gov opportunity ingestion at 06:00 and 18:00 daily",
  },
  {
    jobType: "herbie_autonomous",
    cronPattern: "*/5 * * * *",
    intervalMs: 5 * 60 * 1000,
    description: "HERBIE autonomous opportunity evaluation every 5 minutes",
  },
  {
    jobType: "ciobot_analysis",
    cronPattern: "*/10 * * * *",
    intervalMs: 10 * 60 * 1000,
    description: "CIO-Bot Pwin analysis for scored opportunities every 10 minutes",
  },
  {
    jobType: "legalops_compliance",
    cronPattern: "*/15 * * * *",
    intervalMs: 15 * 60 * 1000,
    description: "LegalOps compliance check for pending bids every 15 minutes",
  },
  {
    jobType: "foreman_monitor",
    cronPattern: "*/15 * * * *",
    intervalMs: 15 * 60 * 1000,
    description: "Foreman-Bot award and amendment monitoring every 15 minutes",
  },
  {
    jobType: "deadline_monitor",
    cronPattern: "*/15 * * * *",
    intervalMs: 15 * 60 * 1000,
    description: "Deadline monitoring every 15 minutes",
  },
  {
    jobType: "daily_digest",
    cronPattern: "0 6 * * *",
    intervalMs: 24 * 60 * 60 * 1000,
    description: "Daily executive digest at 06:00",
  },
  {
    jobType: "followup_sequence",
    cronPattern: "0 * * * *",
    intervalMs: 60 * 60 * 1000,
    description: "Process follow-up sequences hourly",
  },
  {
    jobType: "doc_ai_process",
    cronPattern: "*/5 * * * *",
    intervalMs: 5 * 60 * 1000,
    description: "HERBIE Document AI processing every 5 minutes",
  },
  {
    jobType: "compliance_expiry_check",
    cronPattern: "0 8 * * *",
    intervalMs: 24 * 60 * 60 * 1000,
    description: "Compliance document expiry check daily at 08:00",
  },
  {
    jobType: "egnyte_delta_sync",
    cronPattern: "*/10 * * * *",
    intervalMs: 10 * 60 * 1000,
    description: "Egnyte delta sync every 10 minutes",
  },
  {
    jobType: "jacket_integrity_sweep",
    cronPattern: "0 2 * * *",
    intervalMs: 24 * 60 * 60 * 1000,
    description: "Nightly jacket integrity sweep at 02:00",
  },
  {
    jobType: "storage_orphan_sweep",
    cronPattern: "0 3 * * *",
    intervalMs: 24 * 60 * 60 * 1000,
    description: "Nightly storage orphan sweep at 03:00 — marks docs missing from object storage",
  },
  {
    jobType: "document_ingestion_cycle",
    cronPattern: "*/5 * * * *",
    intervalMs: 5 * 60 * 1000,
    description: "Document ingestion SKIP LOCKED cycle every 5 minutes",
  },
];

class Scheduler {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;

  async start(): Promise<void> {
    if (this.running) {
      console.log("Scheduler already running");
      return;
    }

    this.running = true;
    console.log("Starting scheduler...");

    for (const schedule of SCHEDULES) {
      await this.scheduleJob(schedule);
    }

    console.log(`Scheduler started with ${SCHEDULES.length} scheduled jobs`);
  }

  async stop(): Promise<void> {
    this.running = false;

    for (const [key, timer] of Array.from(this.timers)) {
      clearInterval(timer);
      clearTimeout(timer);
      console.log(`Stopped scheduled job: ${key}`);
    }

    this.timers.clear();
    console.log("Scheduler stopped");
  }

  private async scheduleJob(config: ScheduleConfig): Promise<void> {
    const runJob = async () => {
      if (!this.running) return;

      try {
        const allTenants = await db
          .select()
          .from(tenants)
          .where(eq(tenants.status, "active"));

        for (const tenant of allTenants) {
          const idempotencyKey = `${config.jobType}-${tenant.id}-${this.getTimeSlot(config.intervalMs)}`;

          await queueService.enqueue({
            tenantId: tenant.id,
            jobType: config.jobType,
            payload: {
              tenantId: tenant.id,
              scheduledAt: new Date().toISOString(),
            },
            idempotencyKey,
          });
        }

        console.log(
          `Enqueued ${config.jobType} for ${allTenants.length} tenants`,
        );
      } catch (error) {
        console.error(`Failed to schedule ${config.jobType}:`, error);
      }
    };

    if (config.runAtHours && config.runAtHours.length > 0) {
      // Wall-clock scheduling: self-rescheduling setTimeout chain.
      this.scheduleAtHours(config, runJob);
      console.log(
        `Scheduled ${config.jobType} at hours [${config.runAtHours.join(", ")}] server-local — ${config.description}`,
      );
    } else {
      // Interval scheduling: run once at startup, then every intervalMs.
      await runJob();
      const timer = setInterval(runJob, config.intervalMs);
      this.timers.set(config.jobType, timer);
      console.log(`Scheduled ${config.jobType}: ${config.description}`);
    }
  }

  /**
   * Schedule a job to fire at each wall-clock hour in `config.runAtHours`
   * (server-local). On startup, if the most recent target hour has already
   * passed today by more than 5 minutes, we DON'T fire immediately (we wait
   * for the next slot) to avoid surprise jobs on every deploy.
   */
  private scheduleAtHours(
    config: ScheduleConfig,
    runJob: () => Promise<void>,
  ): void {
    const hours = [...(config.runAtHours ?? [])].sort((a, b) => a - b);
    if (hours.length === 0) return;

    const scheduleNext = () => {
      if (!this.running) return;
      const now = new Date();
      const next = this.computeNextFireTime(now, hours);
      const delay = Math.max(1000, next.getTime() - now.getTime());
      console.log(
        `[scheduler] next ${config.jobType} fire at ${next.toISOString()} (in ${Math.round(delay / 1000)}s)`,
      );
      const t = setTimeout(async () => {
        try {
          await runJob();
        } catch (e) {
          console.error(`[scheduler] ${config.jobType} run error:`, e);
        }
        scheduleNext();
      }, delay);
      this.timers.set(config.jobType, t);
    };

    scheduleNext();
  }

  /** Next Date in the future whose hour matches one of `hours` (sorted asc). */
  private computeNextFireTime(now: Date, hours: number[]): Date {
    for (const h of hours) {
      const candidate = new Date(now);
      candidate.setHours(h, 0, 0, 0);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
    // All today's slots are past — first hour tomorrow.
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(hours[0], 0, 0, 0);
    return tomorrow;
  }

  private getTimeSlot(intervalMs: number): string {
    const now = Date.now();
    const slot = Math.floor(now / intervalMs) * intervalMs;
    return new Date(slot).toISOString();
  }

  async runJobNow(jobType: JobType, tenantId: string): Promise<string | null> {
    return queueService.enqueue({
      tenantId,
      jobType,
      payload: { tenantId, manualTrigger: true },
    });
  }

  getScheduleInfo(): Array<{
    jobType: string;
    intervalMs: number;
    description: string;
    runAtHours?: number[];
  }> {
    return SCHEDULES.map((s) => ({
      jobType: s.jobType,
      intervalMs: s.intervalMs,
      description: s.description,
      runAtHours: s.runAtHours,
    }));
  }
}

export const scheduler = new Scheduler();
