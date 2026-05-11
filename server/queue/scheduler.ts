import { queueService, JobType } from "./queue.service";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

interface ScheduleConfig {
  jobType: JobType;
  cronPattern: string;
  intervalMs: number;
  description: string;
}

const SCHEDULES: ScheduleConfig[] = [
  {
    jobType: "samgov_ingest",
    cronPattern: "*/10 * * * *",
    intervalMs: 10 * 60 * 1000,
    description: "SAM.gov opportunity ingestion every 10 minutes",
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
      console.log(`Stopped scheduled job: ${key}`);
    }
    
    this.timers.clear();
    console.log("Scheduler stopped");
  }

  private async scheduleJob(config: ScheduleConfig): Promise<void> {
    const runJob = async () => {
      if (!this.running) return;

      try {
        const allTenants = await db.select()
          .from(tenants)
          .where(eq(tenants.status, "active"));

        for (const tenant of allTenants) {
          const idempotencyKey = `${config.jobType}-${tenant.id}-${this.getTimeSlot(config.intervalMs)}`;

          await queueService.enqueue({
            tenantId: tenant.id,
            jobType: config.jobType,
            payload: { tenantId: tenant.id, scheduledAt: new Date().toISOString() },
            idempotencyKey,
          });
        }

        console.log(`Enqueued ${config.jobType} for ${allTenants.length} tenants`);
      } catch (error) {
        console.error(`Failed to schedule ${config.jobType}:`, error);
      }
    };

    await runJob();

    const timer = setInterval(runJob, config.intervalMs);
    this.timers.set(config.jobType, timer);
    
    console.log(`Scheduled ${config.jobType}: ${config.description}`);
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

  getScheduleInfo(): Array<{ jobType: string; intervalMs: number; description: string }> {
    return SCHEDULES.map(s => ({
      jobType: s.jobType,
      intervalMs: s.intervalMs,
      description: s.description,
    }));
  }
}

export const scheduler = new Scheduler();
