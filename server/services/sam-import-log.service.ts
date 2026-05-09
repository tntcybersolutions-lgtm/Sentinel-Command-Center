import { sql } from "drizzle-orm";
import { db } from "../db";
import { randomUUID } from "crypto";

export type SamImportTrigger = "manual" | "approval-event" | "cron" | "system";

export async function startSamImportLog(p: {
  tenantId: string; bidProjectId: string; opportunityId: string | null; noticeId: string | null;
  triggerSource: SamImportTrigger; triggeredByUserId: string | null;
}): Promise<string> {
  const id = randomUUID();
  await db.execute(sql`INSERT INTO sam_import_log (id, tenant_id, bid_project_id, opportunity_id, notice_id, trigger_source, triggered_by_user_id, status) VALUES (${id}, ${p.tenantId}, ${p.bidProjectId}, ${p.opportunityId}, ${p.noticeId}, ${p.triggerSource}, ${p.triggeredByUserId}, 'running')`);
  return id;
}

export async function finishSamImportLog(id: string, p: {
  status: "success" | "partial" | "failed";
  filesAttempted: number; filesImported: number; filesSkippedDuplicate: number;
  bytesImported: number; durationMs: number; errors: { url: string; reason: string }[];
}) {
  await db.execute(sql`UPDATE sam_import_log SET finished_at = now(), status = ${p.status}, files_attempted = ${p.filesAttempted}, files_imported = ${p.filesImported}, files_skipped_duplicate = ${p.filesSkippedDuplicate}, bytes_imported = ${p.bytesImported}, errors_json = ${JSON.stringify(p.errors)}::jsonb, duration_ms = ${p.durationMs} WHERE id = ${id}`);
}

export async function getLatestSamImportLog(tenantId: string, bidProjectId: string): Promise<any | null> {
  const r: any = await db.execute(sql`SELECT * FROM sam_import_log WHERE tenant_id = ${tenantId} AND bid_project_id = ${bidProjectId} ORDER BY started_at DESC LIMIT 1`);
  const rows = r.rows || r || [];
  return rows[0] || null;
}

export async function getRecentSamImportLogs(tenantId: string, limit = 50): Promise<any[]> {
  const r: any = await db.execute(sql`SELECT * FROM sam_import_log WHERE tenant_id = ${tenantId} ORDER BY started_at DESC LIMIT ${limit}`);
  return r.rows || r || [];
}
