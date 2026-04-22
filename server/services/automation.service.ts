import { db } from "../db";
import {
  automationRules, automationRuns, captureChangeEvents, pipelineItems,
  highergovRawArchive, entityEmbeddings, partnerRecommendations,
  partnerShortlist, agencyProfiles, competitorPressure, winProbability,
  aiArtifacts, captureActivityLog,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export async function ensureDefaultRules(tenantId: string = DEFAULT_TENANT_ID) {
  const existing = await db.select({ count: sql<number>`count(*)::int` })
    .from(automationRules)
    .where(eq(automationRules.tenantId, tenantId));

  if ((existing[0]?.count || 0) > 0) return;

  const defaultRules = [
    {
      tenantId,
      name: "Auto-Score on Sync",
      description: "Automatically score new opportunities when synced from HigherGov. Creates an action feed card with the AI score.",
      triggerType: "on_sync",
      triggerConfig: { sourceType: "opportunity", changeType: "new" },
      actionType: "auto_score",
      actionConfig: { createFeedCard: true },
      enabled: true,
    },
    {
      tenantId,
      name: "Auto-Capture Plan on Stage Change",
      description: "When a pipeline item moves to Capture stage, automatically generate a capture plan and partner recommendations.",
      triggerType: "on_stage_change",
      triggerConfig: { targetStage: "capture" },
      actionType: "auto_capture_plan",
      actionConfig: { generatePartnerRecs: true },
      enabled: true,
    },
    {
      tenantId,
      name: "Stale Pursuit Nudge",
      description: "When a pursuit has no activity for 10+ days, automatically generate next best action tasks and send a nudge notification.",
      triggerType: "on_stale_pursuit",
      triggerConfig: { staleDays: 10 },
      actionType: "auto_nba_tasks",
      actionConfig: { createTasks: true, sendNudge: true },
      enabled: true,
    },
  ];

  for (const rule of defaultRules) {
    await db.insert(automationRules).values(rule);
  }
}

export async function listRules(tenantId: string = DEFAULT_TENANT_ID) {
  await ensureDefaultRules(tenantId);
  return db.select().from(automationRules)
    .where(eq(automationRules.tenantId, tenantId))
    .orderBy(automationRules.createdAt);
}

export async function toggleRule(ruleId: string, tenantId: string = DEFAULT_TENANT_ID) {
  const rule = await db.select().from(automationRules)
    .where(and(eq(automationRules.id, ruleId), eq(automationRules.tenantId, tenantId)))
    .limit(1);

  if (!rule.length) throw new Error("Rule not found");

  const updated = await db.update(automationRules)
    .set({ enabled: !rule[0].enabled, updatedAt: new Date() })
    .where(eq(automationRules.id, ruleId))
    .returning();

  return updated[0];
}

export async function logRun(tenantId: string, ruleId: string, entityType: string, entityId: string, status: string, result?: any, error?: string) {
  const run = await db.insert(automationRuns).values({
    tenantId,
    ruleId,
    triggerEntityType: entityType,
    triggerEntityId: entityId,
    status,
    resultJson: result || null,
    errorMessage: error || null,
    completedAt: status === "completed" || status === "failed" ? new Date() : null,
  }).returning();

  await db.update(automationRules)
    .set({ runCount: sql`${automationRules.runCount} + 1`, lastRunAt: new Date() })
    .where(eq(automationRules.id, ruleId));

  return run[0];
}

export async function listRuns(tenantId: string = DEFAULT_TENANT_ID, limit: number = 50) {
  return db.select({
    id: automationRuns.id,
    ruleId: automationRuns.ruleId,
    ruleName: automationRules.name,
    triggerEntityType: automationRuns.triggerEntityType,
    triggerEntityId: automationRuns.triggerEntityId,
    status: automationRuns.status,
    resultJson: automationRuns.resultJson,
    errorMessage: automationRuns.errorMessage,
    startedAt: automationRuns.startedAt,
    completedAt: automationRuns.completedAt,
  })
  .from(automationRuns)
  .leftJoin(automationRules, eq(automationRuns.ruleId, automationRules.id))
  .where(eq(automationRuns.tenantId, tenantId))
  .orderBy(desc(automationRuns.startedAt))
  .limit(limit);
}

export async function resetDemoData(tenantId: string = DEFAULT_TENANT_ID) {
  const tables = [
    { table: captureChangeEvents, name: "captureChangeEvents" },
    { table: pipelineItems, name: "pipelineItems" },
    { table: aiArtifacts, name: "aiArtifacts" },
    { table: entityEmbeddings, name: "entityEmbeddings" },
    { table: partnerRecommendations, name: "partnerRecommendations" },
    { table: partnerShortlist, name: "partnerShortlist" },
    { table: agencyProfiles, name: "agencyProfiles" },
    { table: competitorPressure, name: "competitorPressure" },
    { table: winProbability, name: "winProbability" },
    { table: automationRuns, name: "automationRuns" },
    { table: captureActivityLog, name: "captureActivityLog" },
  ];

  const counts: Record<string, number> = {};

  for (const { table, name } of tables) {
    try {
      const deleted = await db.delete(table).where(eq((table as any).tenantId, tenantId)).returning();
      counts[name] = deleted.length;
    } catch {
      counts[name] = 0;
    }
  }

  await db.delete(highergovRawArchive).where(eq(highergovRawArchive.tenantId, tenantId));
  counts["highergovRawArchive"] = 0;

  return { message: "Demo data reset complete", deletedCounts: counts };
}
