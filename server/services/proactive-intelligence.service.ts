import { db } from "../db";
import { dashboardTasks, bidJacketArtifacts, bidProjects, opportunities } from "@shared/schema";
import { eq, and, lt, sql, inArray, isNull, not } from "drizzle-orm";
import { eventStreamService } from "./event-stream.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

type ActionType =
  | "run_ingestion"
  | "retry_artifact"
  | "seed_checklist"
  | "create_bid_project"
  | "compliance_review"
  | "follow_up";

interface GeneratedTask {
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  dueAt?: Date | null;
  source: "ai" | "system";
  sourceEntityType?: string;
  sourceEntityId?: string;
  actionType: ActionType;
  actionPayload: Record<string, unknown>;
}

export async function runProactiveAnalysis(tenantId = DEFAULT_TENANT_ID): Promise<{ created: number; updated: number; tasks: any[] }> {
  const now = new Date();
  const tasks: GeneratedTask[] = [];

  const jacketAgg = await db
    .select({
      bidProjectId: bidJacketArtifacts.bidProjectId,
      total: sql<number>`count(*)::int`,
      missing: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'missing' then 1 else 0 end)::int`,
      failed: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'failed' then 1 else 0 end)::int`,
      ready: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'ready' then 1 else 0 end)::int`,
      filed: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'filed' then 1 else 0 end)::int`,
      downloaded: sql<number>`sum(case when ${bidJacketArtifacts.storageKey} is not null then 1 else 0 end)::int`,
    })
    .from(bidJacketArtifacts)
    .where(eq(bidJacketArtifacts.tenantId, tenantId))
    .groupBy(bidJacketArtifacts.bidProjectId);

  const bpIds = jacketAgg.map(j => j.bidProjectId);
  const bidRows = bpIds.length ? await db
    .select({
      id: bidProjects.id,
      opportunityId: bidProjects.opportunityId,
      status: bidProjects.status,
      oppTitle: opportunities.title,
      oppDueAt: opportunities.dueAt,
    })
    .from(bidProjects)
    .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
    .where(and(eq(bidProjects.tenantId, tenantId), inArray(bidProjects.id, bpIds)))
    : [];

  const bidMap = new Map(bidRows.map(r => [r.id, r]));

  for (const jacket of jacketAgg) {
    const bid = bidMap.get(jacket.bidProjectId);
    const oppTitle = bid?.oppTitle ?? "Untitled Project";
    const dueAt = bid?.oppDueAt ? new Date(bid.oppDueAt) : null;
    const daysUntilDue = dueAt ? Math.ceil((dueAt.getTime() - now.getTime()) / 86400000) : null;

    if (jacket.missing > 0) {
      const pct = Math.round(((jacket.total - jacket.missing) / jacket.total) * 100);
      let priority: "critical" | "high" | "medium" | "low" = "medium";
      if (daysUntilDue !== null && daysUntilDue <= 3) priority = "critical";
      else if (daysUntilDue !== null && daysUntilDue <= 7) priority = "high";
      else if (jacket.missing > jacket.total * 0.5) priority = "high";

      tasks.push({
        title: `${jacket.missing} missing documents — ${oppTitle}`,
        description: `Bid jacket is ${pct}% complete (${jacket.total - jacket.missing}/${jacket.total} artifacts).${daysUntilDue !== null ? ` Deadline in ${daysUntilDue} days.` : ""} Run ingestion to auto-discover and download missing documents from SAM.gov and HigherGov.`,
        priority,
        dueAt,
        source: "ai",
        sourceEntityType: "bid_project",
        sourceEntityId: jacket.bidProjectId,
        actionType: "run_ingestion",
        actionPayload: { bidProjectId: jacket.bidProjectId, oppTitle },
      });
    }

    if (jacket.failed > 0) {
      tasks.push({
        title: `${jacket.failed} failed downloads — ${oppTitle}`,
        description: `${jacket.failed} artifact(s) failed to download. Retry to recover these documents before the bid deadline.`,
        priority: "high",
        dueAt,
        source: "system",
        sourceEntityType: "bid_project",
        sourceEntityId: jacket.bidProjectId,
        actionType: "run_ingestion",
        actionPayload: { bidProjectId: jacket.bidProjectId, oppTitle, retryFailed: true },
      });
    }

    if (daysUntilDue !== null && daysUntilDue <= 2 && daysUntilDue >= 0) {
      const completePct = jacket.total > 0 ? Math.round(((jacket.filed + jacket.downloaded) / jacket.total) * 100) : 0;
      tasks.push({
        title: `Deadline in ${daysUntilDue === 0 ? "TODAY" : `${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}`} — ${oppTitle}`,
        description: `Bid package is ${completePct}% complete. ${jacket.missing > 0 ? `Still missing ${jacket.missing} documents.` : "All documents collected."} Final compliance review recommended.`,
        priority: "critical",
        dueAt,
        source: "ai",
        sourceEntityType: "bid_project",
        sourceEntityId: jacket.bidProjectId,
        actionType: "compliance_review",
        actionPayload: { bidProjectId: jacket.bidProjectId, oppTitle },
      });
    }

    if (jacket.total > 0 && jacket.missing === jacket.total && (!daysUntilDue || daysUntilDue > 7)) {
      tasks.push({
        title: `Stale bid jacket — ${oppTitle}`,
        description: `All ${jacket.total} artifacts are still missing. Ingestion may not have been run yet.`,
        priority: "low",
        dueAt,
        source: "system",
        sourceEntityType: "bid_project",
        sourceEntityId: jacket.bidProjectId,
        actionType: "run_ingestion",
        actionPayload: { bidProjectId: jacket.bidProjectId, oppTitle },
      });
    }
  }

  const unconvertedOpps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      dueAt: opportunities.dueAt,
    })
    .from(opportunities)
    .where(and(
      eq(opportunities.tenantId, tenantId),
      eq(opportunities.status, "open"),
      not(
        sql`${opportunities.id} IN (SELECT opportunity_id FROM bid_projects WHERE tenant_id = ${tenantId})`
      )
    ))
    .limit(10);

  for (const opp of unconvertedOpps) {
    const daysUntilDue = opp.dueAt ? Math.ceil((new Date(opp.dueAt).getTime() - now.getTime()) / 86400000) : null;
    if (daysUntilDue !== null && daysUntilDue < 0) continue;

    tasks.push({
      title: `New opportunity needs bid project — ${opp.title || "Untitled"}`,
      description: `Open opportunity without a bid project.${daysUntilDue !== null ? ` Due in ${daysUntilDue} days.` : ""} Create a bid project to start tracking.`,
      priority: daysUntilDue !== null && daysUntilDue <= 7 ? "high" : "medium",
      dueAt: opp.dueAt,
      source: "ai",
      sourceEntityType: "opportunity",
      sourceEntityId: opp.id,
      actionType: "create_bid_project",
      actionPayload: { opportunityId: opp.id, oppTitle: opp.title },
    });
  }

  let created = 0;
  let updated = 0;
  const upserted: any[] = [];

  for (const task of tasks) {
    const existing = await db
      .select()
      .from(dashboardTasks)
      .where(and(
        eq(dashboardTasks.tenantId, tenantId),
        eq(dashboardTasks.sourceEntityType, task.sourceEntityType ?? ""),
        eq(dashboardTasks.sourceEntityId, task.sourceEntityId ?? ""),
        eq(dashboardTasks.actionType, task.actionType),
        inArray(dashboardTasks.status, ["pending", "in_progress", "snoozed"])
      ))
      .limit(1);

    if (existing.length > 0) {
      const [upd] = await db
        .update(dashboardTasks)
        .set({
          title: task.title,
          description: task.description,
          priority: task.priority,
          dueAt: task.dueAt,
          updatedAt: new Date(),
        })
        .where(eq(dashboardTasks.id, existing[0].id))
        .returning();
      updated++;
      upserted.push(upd);
    } else {
      const [ins] = await db
        .insert(dashboardTasks)
        .values({
          tenantId,
          title: task.title,
          description: task.description,
          priority: task.priority,
          status: "pending",
          dueAt: task.dueAt,
          position: 0,
          source: task.source,
          sourceEntityType: task.sourceEntityType,
          sourceEntityId: task.sourceEntityId,
          actionType: task.actionType,
          actionPayload: task.actionPayload,
        })
        .returning();
      created++;
      upserted.push(ins);
    }
  }

  const completedStale = await db
    .select({ id: dashboardTasks.id, sourceEntityId: dashboardTasks.sourceEntityId, actionType: dashboardTasks.actionType })
    .from(dashboardTasks)
    .where(and(
      eq(dashboardTasks.tenantId, tenantId),
      eq(dashboardTasks.source, "ai"),
      inArray(dashboardTasks.status, ["pending", "in_progress"]),
    ));

  for (const stale of completedStale) {
    if (stale.actionType === "run_ingestion" && stale.sourceEntityId) {
      const jacket = jacketAgg.find(j => j.bidProjectId === stale.sourceEntityId);
      if (jacket && jacket.missing === 0 && jacket.failed === 0) {
        await db.update(dashboardTasks)
          .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(dashboardTasks.id, stale.id));
        updated++;
      }
    }
  }

  eventStreamService.emit("DASHBOARD_UPDATED" as any, tenantId, {
    created, updated, totalTasks: upserted.length,
  });

  return { created, updated, tasks: upserted };
}
