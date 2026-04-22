import { sql } from "drizzle-orm";
import { db } from "../../db";
import { sourceRunTouches, artifactIngestionJobs } from "@shared/schema";

const DEFAULT_TENANT_ID = "blackhawk-default";

export async function tryAcquireJobLock(opts: {
  tenantId?: string;
  jobName: string;
  ttlSeconds: number;
  lockedBy?: string;
}): Promise<boolean> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;
  const until = new Date(Date.now() + opts.ttlSeconds * 1000);
  const lockedBy = opts.lockedBy ?? null;

  const result = await db.execute(sql`
    INSERT INTO job_locks (id, tenant_id, job_name, locked_until, locked_by, created_at, updated_at)
    VALUES (gen_random_uuid(), ${tenantId}, ${opts.jobName}, ${until}, ${lockedBy}, NOW(), NOW())
    ON CONFLICT (tenant_id, job_name)
    DO UPDATE SET
      locked_until = EXCLUDED.locked_until,
      locked_by = EXCLUDED.locked_by,
      updated_at = NOW()
    WHERE job_locks.locked_until < NOW()
    RETURNING tenant_id;
  `);

  const rows = (result as any)?.rows ?? [];
  return rows.length > 0;
}

export async function releaseJobLock(opts: { tenantId?: string; jobName: string }) {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;
  await db.execute(sql`
    UPDATE job_locks
    SET locked_until = NOW(), updated_at = NOW()
    WHERE tenant_id = ${tenantId} AND job_name = ${opts.jobName};
  `);
}

export async function recordSourceRunTouch(opts: {
  tenantId?: string;
  sourceRunId: string;
  sourceSystemId: string;
  entityType: string;
  entityId: string;
  action: "created" | "updated";
}) {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;

  await db.insert(sourceRunTouches).values({
    tenantId,
    sourceRunId: opts.sourceRunId,
    sourceSystemId: opts.sourceSystemId,
    entityType: opts.entityType,
    entityId: opts.entityId,
    action: opts.action,
  }).onConflictDoNothing();
}

export async function enqueueArtifactIngestionJob(opts: {
  tenantId?: string;
  bidProjectId: string;
  sourceType: "samgov" | "highergov" | "internal";
  sourceUrl?: string | null;
  priority?: "normal" | "high";
}) {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;

  await db.insert(artifactIngestionJobs).values({
    tenantId,
    entityType: "bid_project",
    entityId: opts.bidProjectId,
    sourceType: opts.sourceType,
    sourceUrl: opts.sourceUrl ?? null,
    status: "queued",
    priority: opts.priority ?? "normal",
    attempts: 0,
    nextAttemptAt: new Date(),
  }).onConflictDoNothing();
}

export async function getImpactedBidProjectIdsForRun(opts: {
  tenantId?: string;
  sourceRunId: string;
}): Promise<string[]> {
  const tenantId = opts.tenantId ?? DEFAULT_TENANT_ID;

  const rows = await db.execute(sql`
    SELECT DISTINCT bp.id AS bid_project_id
    FROM source_run_touches t
    JOIN bid_projects bp ON bp.opportunity_id = t.entity_id
    WHERE t.tenant_id = ${tenantId}
      AND t.source_run_id = ${opts.sourceRunId}
      AND t.entity_type = 'opportunity';
  `);

  return ((rows as any)?.rows ?? []).map((r: any) => String(r.bid_project_id));
}
