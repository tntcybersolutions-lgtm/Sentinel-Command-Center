import { sql } from "drizzle-orm";
import { db } from "../db";
import {
  tryAcquireJobLock,
  releaseJobLock,
} from "../services/ingestion/ingestion.helpers";
import { runFullIngestion } from "../services/ingestion-pipeline.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

const BACKOFF_MINUTES = [5, 15, 60, 360];

function getBackoffMinutes(attempts: number): number {
  const idx = Math.min(attempts, BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[idx];
}

export type DocumentIngestionCycleResult =
  | { ok: true; processed: number; okCount: number; failCount: number }
  | { ok: true; skipped: true; reason: "lock-held" };

export async function runDocumentIngestionCycle(opts?: {
  tenantId?: string;
  batchSize?: number;
  lockedBy?: string;
}): Promise<DocumentIngestionCycleResult> {
  const tenantId = opts?.tenantId ?? DEFAULT_TENANT_ID;
  const batchSize = opts?.batchSize ?? 5;
  const lockedBy = opts?.lockedBy ?? `doc-ingest-${process.pid}`;

  const acquired = await tryAcquireJobLock({
    tenantId,
    jobName: "document_ingestion",
    ttlSeconds: 300,
    lockedBy,
  });

  if (!acquired) {
    console.log(`[DocumentIngestionWorker] Lock held, skipping cycle`);
    return { ok: true, skipped: true, reason: "lock-held" };
  }

  let processed = 0;
  let okCount = 0;
  let failCount = 0;

  try {
    const claimed = await db.execute(sql`
      WITH claimable AS (
        SELECT id
        FROM artifact_ingestion_jobs
        WHERE tenant_id = ${tenantId}
          AND status IN ('queued', 'failed')
          AND next_attempt_at <= NOW()
        ORDER BY
          CASE WHEN priority = 'high' THEN 0 ELSE 1 END,
          created_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE artifact_ingestion_jobs
      SET status = 'running',
          locked_at = NOW(),
          locked_by = ${lockedBy},
          updated_at = NOW()
      FROM claimable
      WHERE artifact_ingestion_jobs.id = claimable.id
      RETURNING artifact_ingestion_jobs.id,
                artifact_ingestion_jobs.entity_id,
                artifact_ingestion_jobs.entity_type,
                artifact_ingestion_jobs.source_type,
                artifact_ingestion_jobs.attempts;
    `);

    const jobs: Array<{
      id: string;
      entity_id: string;
      entity_type: string;
      source_type: string;
      attempts: number;
    }> = (claimed as any)?.rows ?? [];

    if (jobs.length === 0) {
      console.log(`[DocumentIngestionWorker] No jobs to process`);
      return { ok: true, processed: 0, okCount: 0, failCount: 0 };
    }

    console.log(`[DocumentIngestionWorker] Claimed ${jobs.length} jobs`);

    for (const job of jobs) {
      processed++;
      try {
        const result = await runFullIngestion(tenantId, job.entity_id);

        await db.execute(sql`
          UPDATE artifact_ingestion_jobs
          SET status = 'ok',
              last_attempt_at = NOW(),
              attempts = ${job.attempts + 1},
              locked_at = NULL,
              locked_by = NULL,
              error_json = NULL,
              updated_at = NOW()
          WHERE id = ${job.id};
        `);

        okCount++;
        console.log(
          `[DocumentIngestionWorker] Job ${job.id} (bidProject=${job.entity_id}) completed: discovered=${result.discovered}, downloaded=${result.downloaded}`
        );
      } catch (err: any) {
        failCount++;
        const newAttempts = job.attempts + 1;
        const backoffMin = getBackoffMinutes(newAttempts);
        const nextAttempt = new Date(Date.now() + backoffMin * 60 * 1000);
        const errorPayload = JSON.stringify({
          message: err?.message ?? "Unknown error",
          stack: err?.stack?.slice(0, 500) ?? null,
          attemptNumber: newAttempts,
          backoffMinutes: backoffMin,
        });

        await db.execute(sql`
          UPDATE artifact_ingestion_jobs
          SET status = 'failed',
              last_attempt_at = NOW(),
              attempts = ${newAttempts},
              next_attempt_at = ${nextAttempt},
              locked_at = NULL,
              locked_by = NULL,
              error_json = ${errorPayload}::jsonb,
              updated_at = NOW()
          WHERE id = ${job.id};
        `);

        console.error(
          `[DocumentIngestionWorker] Job ${job.id} failed (attempt ${newAttempts}, next retry in ${backoffMin}min): ${err?.message}`
        );
      }
    }
  } finally {
    await releaseJobLock({ tenantId, jobName: "document_ingestion" });
  }

  console.log(
    `[DocumentIngestionWorker] Cycle complete: processed=${processed} ok=${okCount} failed=${failCount}`
  );

  return { ok: true, processed, okCount, failCount };
}
