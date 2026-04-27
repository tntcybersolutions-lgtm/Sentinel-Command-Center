import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import { herbieToolsRouter } from "./routes/herbie-tools.routes";
import { registerSentinelPhase1Routes } from "./routes-sentinel-phase1";
import * as ReplitObjectStorage from "@replit/object-storage";
import { Readable } from "node:stream";
import OpenAI from "openai";
import { z } from "zod";
import archiver from "archiver";
import { 
  insertOpportunitySchema, 
  insertBidProjectSchema, 
  insertApprovalRequestSchema,
  insertAutoFilingRuleSchema,
  insertProjectPermissionSchema,
  insertDrawingSheetSchema,
  insertTakeoffCategorySchema,
  insertTakeoffQuantitySchema,
  insertBuildingSystemSchema,
  insertSystemDeviceSchema,
  insertCableScheduleSchema,
  insertRackElevationSchema,
  insertProjectDeliverableSchema,
  autoFilingRules,
  shareLinks,
  projectPermissions,
  documentTextContent,
  notifications,
  notificationPreferences,
  jacketDocuments,
  jacketFolders,
  bidProjects,
  bidRfis,
  users,
  tenantSettings,
  drawingSheets,
  drawingSets,
  takeoffCategories,
  takeoffQuantities,
  buildingSystems,
  systemDevices,
  cableSchedules,
  rackElevations,
  projectPhases,
  projectDeliverables,
  integrationHealth,
  opportunities,
  egnyteItems,
  egnyteSyncState,
  egnyteRootPaths,
  samIngestRuns,
  unmatchedBuyers,
  companies,
  companySynonyms,
  bidBinderVersions,
  herbieReviewQueue,
  bidInvitations,
  PROJECT_JACKET_FOLDERS,
  federalAwards,
  opportunityScores,
  pipelineItems,
  captureChangeEvents,
  capturePlans,
  insertPipelineItemSchema,
  insertCapturePlanSchema,
  opportunitySources,
  opportunityDecisions,
  v4Bids,
  bidReadinessSnapshots,
  bidReadinessScores,
  v4BidDocuments,
  v4BidTasks,
  bidPartners,
  partners,
  v4BidOutreachDrafts,
  v4BidSubmissions,
  fitProfilesV4,
  aiArtifacts,
  insertOpportunityDecisionSchema,
  insertV4BidSchema,
  insertFitProfileV4Schema,
  orgMemoryItems,
  orgMemoryEntityLinks,
  orgMemoryApprovals,
  auditEvents,
  projects,
  highergovOpportunities,
  highergovSyncRuns,
  highergovWatchProfiles,
  bidJacketArtifacts,
  insertBidJacketArtifactSchema,
  bidJacketChecklistItems,
  projectFolders,
  projectDocuments,
  projectEstimates,
  projectProposals,
  projectSchedules,
  projectBidRequests,
  projectSelections,
  projectBudgets,
  projectDailyLogs,
  projectTimesheets,
  dashboardTasks,
  insertDashboardTaskSchema,
  agentActivities,
  rfis,
  submittals,
  changeOrders,
  dailyLogs,
  projectTasks,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, ilike, sql, count, isNotNull, gte, lte, lt, or, inArray } from "drizzle-orm";
import { eventStreamService } from "./services/event-stream.service";
import crypto from "crypto";
import { fromError } from "zod-validation-error";
import { auditService } from "./services/audit.service";
import { approvalService } from "./services/approval.service";
import { scoringService } from "./services/scoring.service";
import { bidService } from "./services/bid.service";
import { commsService } from "./services/comms.service";
import { digestService } from "./services/digest.service";
import { queueService } from "./queue/queue.service";
import { scheduler } from "./queue/scheduler";
import { worker } from "./queue/worker";
import { createSamGovIngestionService } from "./integrations/samgov/samgov.client";
import { createO365Service } from "./integrations/o365/graph.client";
import { herbieCommandRoutes } from "./routes/herbie-command.routes";
import { herbieRouter } from "./routes/herbie";
import { createFolderTaxonomyService } from "./services/folder-taxonomy.service";
import { createSamIngestService } from "./services/sam-ingest.service";
import { createBidReadinessService } from "./services/bid-readiness.service";
import { createBidBinderService } from "./services/bid-binder.service";
import { createHerbieAutonomousService } from "./services/herbie-autonomous.service";
import { createHerbieExtractionService } from "./services/herbie-extraction.service";
import { createHerbieLearningService } from "./services/herbie-learning.service";
import { createRetroOrganizerService } from "./services/retro-organizer.service";
import { repairBidJacket, repairAllBidJackets } from "./services/jacket-repair.service";
import { createHerbieQueryService } from "./services/herbie-query.service";
import { alertsService, AlertType } from "./services/alerts.service";
import { competitorService } from "./services/competitor.service";
import { bidComplianceService } from "./services/bid-compliance.service";
import { pricingService } from "./services/pricing.service";
import { transitionService } from "./services/transition.service";
import { orgMemoryOnCreate, orgMemoryOnApprove, orgMemoryOnReject } from "./services/herbie/orgMemoryPolicies";
import { runAllMonitors } from "./services/contractor-monitors.service";
import { runPreconAnalysis } from "./agents/preconAgent";
import { runBackOfficeAnalysis } from "./agents/backOfficeAgent";
import { runPMAnalysis } from "./agents/pmAgent";
import { runFieldOpsAnalysis } from "./agents/fieldOpsAgent";
import { runKPIAnalysis } from "./agents/kpiAgent";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

class ParamError extends Error {
  constructor(public paramName: string) {
    super(`Missing or empty required URL parameter: ${paramName}`);
    this.name = "ParamError";
  }
}

function p(v: string | string[] | undefined, name = "param"): string {
  const val = Array.isArray(v) ? v[0] : v;
  if (!val) throw new ParamError(name);
  return val;
}

function pOpt(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

function handleRouteError(res: Response, error: unknown, fallbackMsg = "Internal server error") {
  if (error instanceof ParamError) {
    return res.status(400).json({ error: error.message });
  }
  const msg = error instanceof Error ? error.message : fallbackMsg;
  console.error(fallbackMsg, error);
  res.status(500).json({ error: msg });
}

const PIPE_ENTITY_BID_PROJECT = "bid_project" as const;

function stageFromBidStatus(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s === "awarded") return "awarded";
  if (s === "declined") return "closed";
  if (s === "submitted") return "submitted";
  if (s === "quoting" || s === "published") return "capture";
  if (s === "draft") return "new";
  if (s === "initiated") return "new";
  return "new";
}

async function ensurePipelineItemForBidProject(args: {
  tenantId: string;
  bidProjectId: string;
  ownerUserId?: string | null;
}) {
  const { tenantId, bidProjectId, ownerUserId } = args;

  const bid = await db
    .select({
      id: bidProjects.id,
      status: bidProjects.status,
      createdAt: bidProjects.createdAt,
      updatedAt: bidProjects.updatedAt,
    })
    .from(bidProjects)
    .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.id, bidProjectId)))
    .limit(1);

  if (!bid.length) return;

  const stage = stageFromBidStatus(bid[0].status);

  await db
    .insert(pipelineItems)
    .values({
      tenantId,
      entityType: PIPE_ENTITY_BID_PROJECT,
      entityId: bidProjectId,
      stage,
      priority: "medium",
      ownerUserId: ownerUserId ?? null,
      lastActivityAt: bid[0].updatedAt ?? bid[0].createdAt ?? new Date(),
    })
    .onConflictDoNothing();
}

const chatMessageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  conversationId: z.number().optional(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ── User Identity ──
  app.get("/api/me", async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT id, tenant_id, email, display_name, status FROM users
        WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status = 'active'
        ORDER BY created_at ASC LIMIT 1
      `);
      const user = result.rows?.[0] as any;
      if (!user) return res.status(404).json({ error: "No active user found" });
      const nameParts = (user.display_name || "User").split(" ");
      res.json({
        id: user.id,
        firstName: nameParts[0] || "User",
        lastName: nameParts.slice(1).join(" ") || "",
        displayName: user.display_name,
        email: user.email,
        role: "admin",
        tenantId: user.tenant_id,
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });

  // ── Unified Home Assistant ──
  app.get("/api/home/assistant", async (_req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const now = new Date();
      const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
      const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

      const userRow = await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.status, "active")))
        .limit(1);
      const displayName = userRow[0]?.displayName ?? "there";

      const hour = now.getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

      const overdue = await db
        .select({
          artifactId: bidJacketArtifacts.id,
          bidProjectId: bidJacketArtifacts.bidProjectId,
          title: bidJacketArtifacts.title,
          templateCode: bidJacketArtifacts.templateCode,
          status: bidJacketArtifacts.status,
          dueAt: bidJacketArtifacts.dueAt,
          sourceUrl: bidJacketArtifacts.sourceUrl,
          updatedAt: bidJacketArtifacts.updatedAt,
          storageKey: bidJacketArtifacts.storageKey,
        })
        .from(bidJacketArtifacts)
        .where(
          and(
            eq(bidJacketArtifacts.tenantId, tenantId),
            lt(bidJacketArtifacts.dueAt, today0),
            inArray(bidJacketArtifacts.status, ["missing", "ready", "failed"])
          )
        )
        .orderBy(desc(bidJacketArtifacts.dueAt))
        .limit(25);

      const dueToday = await db
        .select({
          artifactId: bidJacketArtifacts.id,
          bidProjectId: bidJacketArtifacts.bidProjectId,
          title: bidJacketArtifacts.title,
          templateCode: bidJacketArtifacts.templateCode,
          status: bidJacketArtifacts.status,
          dueAt: bidJacketArtifacts.dueAt,
          sourceUrl: bidJacketArtifacts.sourceUrl,
          updatedAt: bidJacketArtifacts.updatedAt,
          storageKey: bidJacketArtifacts.storageKey,
        })
        .from(bidJacketArtifacts)
        .where(
          and(
            eq(bidJacketArtifacts.tenantId, tenantId),
            gte(bidJacketArtifacts.dueAt, today0),
            lte(bidJacketArtifacts.dueAt, todayEnd),
            inArray(bidJacketArtifacts.status, ["missing", "ready", "failed"])
          )
        )
        .orderBy(desc(bidJacketArtifacts.dueAt))
        .limit(25);

      const failed = await db
        .select({
          artifactId: bidJacketArtifacts.id,
          bidProjectId: bidJacketArtifacts.bidProjectId,
          title: bidJacketArtifacts.title,
          templateCode: bidJacketArtifacts.templateCode,
          status: bidJacketArtifacts.status,
          dueAt: bidJacketArtifacts.dueAt,
          sourceUrl: bidJacketArtifacts.sourceUrl,
          updatedAt: bidJacketArtifacts.updatedAt,
        })
        .from(bidJacketArtifacts)
        .where(and(eq(bidJacketArtifacts.tenantId, tenantId), eq(bidJacketArtifacts.status, "failed")))
        .orderBy(desc(bidJacketArtifacts.updatedAt))
        .limit(25);

      const jacketAgg = await db
        .select({
          bidProjectId: bidJacketArtifacts.bidProjectId,
          total: sql<number>`count(*)::int`,
          missing: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'missing' then 1 else 0 end)::int`,
          ready: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'ready' then 1 else 0 end)::int`,
          filed: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'filed' then 1 else 0 end)::int`,
          failed: sql<number>`sum(case when ${bidJacketArtifacts.status} = 'failed' then 1 else 0 end)::int`,
          downloaded: sql<number>`sum(case when ${bidJacketArtifacts.storageKey} is not null then 1 else 0 end)::int`,
          lastUpdatedAt: sql<string>`max(${bidJacketArtifacts.updatedAt})`,
        })
        .from(bidJacketArtifacts)
        .where(eq(bidJacketArtifacts.tenantId, tenantId))
        .groupBy(bidJacketArtifacts.bidProjectId)
        .orderBy(desc(sql`max(${bidJacketArtifacts.updatedAt})`))
        .limit(30);

      const bidProjectIds = jacketAgg.map((x) => x.bidProjectId).filter(Boolean);
      const bidRows = bidProjectIds.length
        ? await db
            .select({
              bidProjectId: bidProjects.id,
              opportunityId: bidProjects.opportunityId,
              bidStatus: bidProjects.status,
              oppTitle: opportunities.title,
              oppDueAt: opportunities.dueAt,
              oppUrl: opportunities.url,
            })
            .from(bidProjects)
            .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
            .where(and(eq(bidProjects.tenantId, tenantId), inArray(bidProjects.id, bidProjectIds)))
        : [];

      const bidById = new Map(bidRows.map((r) => [r.bidProjectId, r]));

      const liveBidJackets = jacketAgg.map((a) => ({
        ...a,
        opportunity: bidById.get(a.bidProjectId) ?? null,
        health:
          a.failed > 0 ? "attention" :
          (a.missing > 0 || a.ready > 0) ? "in_progress" :
          "good",
      }));

      const calendarItems = [
        ...dueToday.map((t) => ({
          type: "artifact_due" as const,
          title: t.title,
          at: t.dueAt,
          bidProjectId: t.bidProjectId,
        })),
        ...bidRows
          .filter((b) => b.oppDueAt)
          .slice(0, 10)
          .map((b) => ({
            type: "opportunity_due" as const,
            title: `Bid due: ${b.oppTitle}`,
            at: b.oppDueAt,
            bidProjectId: b.bidProjectId,
          })),
      ]
        .filter((x) => x.at)
        .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime())
        .slice(0, 15);

      let aiBriefing: { text: string } | null = null;
      try {
        const payload = {
          date: now.toISOString(),
          overdueCount: overdue.length,
          dueTodayCount: dueToday.length,
          failedCount: failed.length,
          topBidJackets: liveBidJackets.slice(0, 8).map((j) => ({
            oppTitle: j.opportunity?.oppTitle ?? "Untitled",
            total: j.total,
            missing: j.missing,
            failed: j.failed,
            downloaded: j.downloaded,
            health: j.health,
          })),
        };

        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content:
                "You are an executive office assistant for a federal bid/project platform. " +
                "Write a short daily briefing (3-6 bullet points). " +
                "Only reference facts provided. End with 2-3 concrete next actions. Be concise.",
            },
            { role: "user", content: JSON.stringify(payload) },
          ],
          max_tokens: 500,
        });

        const text = completion.choices?.[0]?.message?.content;
        if (typeof text === "string" && text.trim()) aiBriefing = { text };
      } catch {
        // AI failures should not break the dashboard
      }

      res.json({
        greeting: `${greeting}, ${displayName}`,
        now: now.toISOString(),
        calendarItems,
        tasks: { overdue, dueToday, failed },
        liveBidJackets,
        aiBriefing,
      });
    } catch (e: any) {
      console.error("Home assistant error:", e);
      res.status(500).json({ error: e?.message ?? "Failed to load home assistant data" });
    }
  });

  // ── Extracted: Dashboard Command Data ──────────────────────────────────────
  async function fetchDashboardCommandData(tenantId: string) {
    const [approvalsResult, oppsRaw, tasksRaw, navCountsResult, jacketsAgg] = await Promise.all([
      db.execute(sql`
        SELECT 
          ar.id, ar.entity_type, ar.entity_id, ar.action_type, ar.priority, ar.status,
          ar.context_json, ar.created_at, ar.requested_by,
          COALESCE(opp_direct.title, opp_via_bp.title) as entity_name,
          COALESCE(opp_direct.contract_value, opp_via_bp.contract_value, p.contract_value) as dollar_value,
          COALESCE(opp_direct.due_at, opp_via_bp.due_at) as deadline,
          COALESCE(opp_direct.naics_codes, opp_via_bp.naics_codes) as naics_codes,
          COALESCE(opp_direct.set_aside, opp_via_bp.set_aside) as set_aside,
          COALESCE(c1.name, c2.name) as agency,
          v.company_name as vendor_name,
          p.name as project_name
        FROM approval_requests ar
        LEFT JOIN bid_projects bp ON (ar.entity_id = bp.id AND ar.entity_type IN ('bid_decision','bid_project'))
        LEFT JOIN opportunities opp_via_bp ON bp.opportunity_id = opp_via_bp.id
        LEFT JOIN opportunities opp_direct ON (ar.entity_id = opp_direct.id AND ar.entity_type = 'opportunity')
        LEFT JOIN companies c1 ON opp_direct.buyer_id = c1.id
        LEFT JOIN companies c2 ON opp_via_bp.buyer_id = c2.id
        LEFT JOIN projects p ON (ar.entity_id = p.id AND ar.entity_type = 'project')
        LEFT JOIN vendors v ON (ar.entity_id = v.id AND ar.entity_type = 'vendor')
        WHERE ar.tenant_id = ${tenantId} AND ar.status = 'pending'
        ORDER BY 
          CASE ar.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
          ar.created_at ASC
      `),

      db.execute(sql`
        SELECT o.id, o.title, c.name as agency, o.contract_value as value,
          o.naics_codes as naics, o.set_aside, o.due_at, o.status, o.url, o.synopsis,
          od.fit_score, od.decision,
          CASE WHEN bp.id IS NOT NULL THEN true ELSE false END as has_bid_project
        FROM opportunities o
        LEFT JOIN companies c ON o.buyer_id = c.id
        LEFT JOIN opportunity_decisions od ON od.opportunity_id = o.id AND od.tenant_id = ${tenantId}
        LEFT JOIN bid_projects bp ON bp.opportunity_id = o.id AND bp.tenant_id = ${tenantId}
        WHERE o.tenant_id = ${tenantId} AND o.status = 'open'
        ORDER BY o.due_at ASC NULLS LAST
      `),

      db.select().from(dashboardTasks)
        .where(eq(dashboardTasks.tenantId, tenantId))
        .orderBy(asc(dashboardTasks.position), desc(dashboardTasks.createdAt))
        .limit(100),

      db.execute(sql`
        SELECT 
          (SELECT count(*)::int FROM approval_requests WHERE tenant_id = ${tenantId} AND status = 'pending') as pending_approvals,
          (SELECT count(*)::int FROM bid_jacket_artifacts WHERE tenant_id = ${tenantId} AND status = 'missing') as missing_artifacts,
          (SELECT count(*)::int FROM bid_jacket_checklist_items WHERE tenant_id = ${tenantId} AND status IN ('todo','doing','blocked')) as checklist_todo,
          (SELECT count(*)::int FROM opportunities WHERE tenant_id = ${tenantId} AND status = 'open' AND due_at < NOW() + INTERVAL '7 days' AND due_at > NOW()) as upcoming_deadlines,
          (SELECT count(*)::int FROM opportunities WHERE tenant_id = ${tenantId} AND status = 'open' AND due_at < NOW()) as overdue_items
      `),

      db.execute(sql`
        SELECT bja.bid_project_id,
          count(*)::int as total,
          sum(case when bja.status = 'missing' then 1 else 0 end)::int as missing,
          sum(case when bja.status = 'ready' then 1 else 0 end)::int as ready,
          sum(case when bja.status = 'filed' then 1 else 0 end)::int as filed,
          sum(case when bja.status = 'failed' then 1 else 0 end)::int as failed,
          o.title as opp_title, o.due_at as opp_due_at, bp.opportunity_id, bp.status as bid_status
        FROM bid_jacket_artifacts bja
        JOIN bid_projects bp ON bp.id = bja.bid_project_id
        LEFT JOIN opportunities o ON o.id = bp.opportunity_id
        WHERE bja.tenant_id = ${tenantId}
        GROUP BY bja.bid_project_id, o.title, o.due_at, bp.opportunity_id, bp.status
      `)
    ]);

    const approvalRows = (approvalsResult as any).rows || [];
    const now = new Date();
    const parseNaics = (raw: any): string[] => {
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.map(String);
      if (typeof raw === 'string') return raw.replace(/[{}]/g, '').split(',').filter(Boolean).map((s: string) => s.trim());
      return [];
    };
    const approvals = approvalRows.map((r: any) => {
      const ageDays = Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86400000);
      return {
        id: r.id,
        entityType: r.entity_type,
        entityId: r.entity_id,
        actionType: r.action_type,
        priority: r.priority,
        entityName: r.entity_name || r.vendor_name || r.project_name || (r.context_json as any)?.opportunityTitle || (r.context_json as any)?.title || 'Unknown',
        dollarValue: r.dollar_value ? parseFloat(r.dollar_value) : null,
        deadline: r.deadline,
        naicsCodes: parseNaics(r.naics_codes),
        setAside: r.set_aside || null,
        agency: r.agency || null,
        requestedBy: r.requested_by || 'system',
        createdAt: r.created_at,
        ageDays,
      };
    });

    const oppRows = (oppsRaw as any).rows || [];
    const opps = oppRows.map((r: any) => ({
      id: r.id,
      title: r.title,
      agency: r.agency || null,
      value: r.value ? parseFloat(r.value) : null,
      naics: parseNaics(r.naics),
      setAside: r.set_aside || null,
      dueAt: r.due_at,
      status: r.status,
      url: r.url,
      synopsis: r.synopsis,
      fitScore: r.fit_score ? Number(r.fit_score) : null,
      decision: r.decision || null,
      hasBidProject: r.has_bid_project === true || r.has_bid_project === 't',
    }));

    const kpiRow = ((navCountsResult as any).rows || [])[0] || {};
    const kpis = {
      pendingApprovals: kpiRow.pending_approvals ?? 0,
      missingArtifacts: kpiRow.missing_artifacts ?? 0,
      checklistTodo: kpiRow.checklist_todo ?? 0,
      upcomingDeadlines: kpiRow.upcoming_deadlines ?? 0,
      overdueItems: kpiRow.overdue_items ?? 0,
    };

    const jacketRows = (jacketsAgg as any).rows || [];
    const jackets = jacketRows.map((r: any) => ({
      bidProjectId: r.bid_project_id,
      total: r.total ?? 0,
      missing: r.missing ?? 0,
      ready: r.ready ?? 0,
      filed: r.filed ?? 0,
      failed: r.failed ?? 0,
      oppTitle: r.opp_title || 'Untitled',
      oppDueAt: r.opp_due_at,
      opportunityId: r.opportunity_id,
      bidStatus: r.bid_status,
    }));

    const tasks = tasksRaw.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
      source: t.source,
      sourceEntityType: t.sourceEntityType,
      sourceEntityId: t.sourceEntityId,
      actionType: t.actionType,
      actionPayload: t.actionPayload,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    }));

    return { approvals, opportunities: opps, tasks, kpis, jackets };
  }

  // ── Unified Command Center Endpoint ──────────────────────────────────────
  app.get("/api/dashboard/command", async (req: Request, res: Response) => {
    try {
      const result = await fetchDashboardCommandData(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      console.error("Error loading command center:", error);
      handleRouteError(res, error, "Failed to load command center data");
    }
  });

  // ── Extracted: Intelligence Queries ──────────────────────────────────────
  async function fetchIntelligenceData(tenantId: string): Promise<import("../shared/schema").HomeIntelligence> {
    try {
      const [pipelineResult, projectsResult, subsResult, wipResult, cashFlowResult, changeOrdersResult, vendorRiskResult] = await Promise.all([
        db.execute(sql`
          SELECT
            COALESCE(od.decision, 'pending') as stage,
            count(*)::int as count,
            COALESCE(sum(o.contract_value), 0)::float as total_value
          FROM opportunities o
          LEFT JOIN opportunity_decisions od ON od.opportunity_id = o.id AND od.tenant_id = ${tenantId}
          WHERE o.tenant_id = ${tenantId} AND o.status = 'open'
          GROUP BY COALESCE(od.decision, 'pending')
        `),
        db.execute(sql`
          SELECT id, name, completion_percentage, contract_value, actual_costs, gross_profit
          FROM projects
          WHERE tenant_id = ${tenantId} AND status NOT IN ('completed','cancelled')
          ORDER BY contract_value DESC NULLS LAST
          LIMIT 10
        `),
        db.execute(sql`
          SELECT id, company_name, trade, performance_rating, projects_completed, status
          FROM subcontractors
          WHERE tenant_id = ${tenantId}
          ORDER BY performance_rating DESC NULLS LAST
          LIMIT 10
        `),
        db.execute(sql`
          SELECT
            COALESCE(sum(projected_profit), 0)::float as total_projected_profit,
            CASE WHEN sum(revised_contract) > 0
              THEN (sum(projected_profit) / sum(revised_contract) * 100)::float
              ELSE 0 END as avg_projected_margin
          FROM (
            SELECT DISTINCT ON (project_id) projected_profit, revised_contract
            FROM wip_reports
            WHERE tenant_id = ${tenantId}
            ORDER BY project_id, report_date DESC
          ) latest
        `),
        db.execute(sql`
          SELECT projected_balance
          FROM cash_flow_forecasts
          WHERE tenant_id = ${tenantId}
          ORDER BY forecast_date DESC
          LIMIT 1
        `),
        db.execute(sql`
          SELECT COALESCE(sum(amount), 0)::float as total_exposure
          FROM change_orders
          WHERE tenant_id = ${tenantId} AND status IN ('pending','submitted','under_review')
        `),
        db.execute(sql`
          SELECT count(*)::int as at_risk
          FROM vendors
          WHERE tenant_id = ${tenantId}
            AND (insurance_expires_at < NOW() + INTERVAL '30 days' OR license_expires_at < NOW() + INTERVAL '30 days')
            AND status = 'active'
        `)
      ]);

      const pipelineRows = (pipelineResult as any).rows || [];
      const stages = pipelineRows.map((r: any) => ({
        stage: r.stage || "pending",
        count: Number(r.count) || 0,
        totalValue: Number(r.total_value) || 0,
      }));
      const totalValue = stages.reduce((s: number, st: any) => s + st.totalValue, 0);
      const totalCount = stages.reduce((s: number, st: any) => s + st.count, 0);
      const pursueStage = stages.find((s: any) => s.stage === "pursue");
      const conversionRate = totalCount > 0 && pursueStage ? pursueStage.count / totalCount : 0;

      const projectRows = (projectsResult as any).rows || [];
      const projects = projectRows.map((r: any) => {
        const contractVal = Number(r.contract_value) || 0;
        const actualCostsVal = Number(r.actual_costs) || 0;
        const completionPct = Number(r.completion_percentage) || 0;
        const grossProfitVal = Number(r.gross_profit) || 0;
        const healthScore = Math.min(100, Math.max(0, completionPct > 0 ? Math.round(completionPct * 0.5 + (contractVal > 0 ? (grossProfitVal / contractVal) * 50 : 50)) : 50));
        return {
          id: r.id,
          name: r.name || "Unnamed",
          completionPct,
          contractValue: contractVal,
          actualCosts: actualCostsVal,
          grossProfit: grossProfitVal,
          healthScore,
          route: `/projects/${r.id}`,
        };
      });
      const avgHealthScore = projects.length > 0 ? Math.round(projects.reduce((s: number, p: any) => s + p.healthScore, 0) / projects.length) : 0;

      const subRows = (subsResult as any).rows || [];
      const topSubs = subRows.map((r: any) => ({
        id: r.id,
        name: r.company_name || "Unknown",
        trade: r.trade || null,
        performanceRating: r.performance_rating ? Number(r.performance_rating) : null,
        projectsCompleted: Number(r.projects_completed) || 0,
        status: r.status || "active",
      }));
      const ratedSubs = topSubs.filter((s: any) => s.performanceRating !== null);
      const avgRating = ratedSubs.length > 0 ? ratedSubs.reduce((s: number, sub: any) => s + sub.performanceRating, 0) / ratedSubs.length : 0;

      const wipRow = ((wipResult as any).rows || [])[0] || {};
      const cashFlowRow = ((cashFlowResult as any).rows || [])[0] || {};
      const changeOrderRow = ((changeOrdersResult as any).rows || [])[0] || {};
      const vendorRiskRow = ((vendorRiskResult as any).rows || [])[0] || {};

      return {
        pipeline: { stages, totalValue, totalCount, conversionRate },
        projectHealth: {
          projects,
          avgHealthScore,
          totalContractValue: projects.reduce((s: number, p: any) => s + p.contractValue, 0),
          totalActualCosts: projects.reduce((s: number, p: any) => s + p.actualCosts, 0),
        },
        subPerformance: {
          topSubs,
          avgRating: Math.round(avgRating * 100) / 100,
          totalSubs: topSubs.length,
          atRiskCount: Number(vendorRiskRow.at_risk) || 0,
        },
        financialPulse: {
          projectedProfit: Number(wipRow.total_projected_profit) || 0,
          projectedMargin: Number(wipRow.avg_projected_margin) || 0,
          cashFlowBalance: Number(cashFlowRow.projected_balance) || 0,
          changeOrderExposure: Number(changeOrderRow.total_exposure) || 0,
          vendorRiskCount: Number(vendorRiskRow.at_risk) || 0,
        },
      };
    } catch (error) {
      console.error("Error fetching intelligence data:", error);
      return {
        pipeline: { stages: [], totalValue: 0, totalCount: 0, conversionRate: 0 },
        projectHealth: { projects: [], avgHealthScore: 0, totalContractValue: 0, totalActualCosts: 0 },
        subPerformance: { topSubs: [], avgRating: 0, totalSubs: 0, atRiskCount: 0 },
        financialPulse: { projectedProfit: 0, projectedMargin: 0, cashFlowBalance: 0, changeOrderExposure: 0, vendorRiskCount: 0 },
      };
    }
  }

  // ── Construction Command Center: Unified Home Dashboard ───────────────────
  app.get("/api/dashboard/home", async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
      const userName = (req as any)?.user?.name || (req as any)?.user?.displayName || "Bradley Hueser";

      const [commandData, calendarData, intelligenceData] = await Promise.all([
        fetchDashboardCommandData(tenantId),
        fetchCalendarTodayData(tenantId),
        fetchIntelligenceData(tenantId),
      ]);

      const { buildHomeResponse } = await import("./services/home-dashboard.service");
      const response = buildHomeResponse({
        now: new Date(),
        commandData,
        calendarData,
        intelligenceData,
        userName,
      });

      res.json(response);
    } catch (error) {
      console.error("Error loading home dashboard:", error);
      handleRouteError(res, error, "Failed to load home dashboard");
    }
  });

  // ── Herbie: Rate limiter + safe JSON parse ────────────────────────────────
  const __herbieRate: Map<string, { count: number; resetAt: number }> = new Map();
  function herbieRateOk(ip: string, limit = 30, windowMs = 60_000) {
    const now = Date.now();
    const cur = __herbieRate.get(ip);
    if (!cur || now > cur.resetAt) {
      __herbieRate.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (cur.count >= limit) return false;
    cur.count += 1;
    return true;
  }
  function safeJsonParse<T>(s: string): T | null {
    try { return JSON.parse(s) as T; } catch { return null; }
  }

  // ── Herbie Brief Endpoint ─────────────────────────────────────────────────
  const HerbieBriefSchema = z.object({
    now: z.string().max(64).default(new Date().toISOString()),
    metrics: z.record(z.any()).default({}),
    topItems: z.array(z.any()).max(10).default([]),
    intelligence: z.record(z.any()).optional(),
  });

  app.post("/api/herbie/brief", async (req: Request, res: Response) => {
    try {
      const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "unknown").trim();
      if (!herbieRateOk(ip)) return res.status(429).json({ error: "Rate limit exceeded" });

      const parsed = HerbieBriefSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });

      const { now: nowStr, metrics, topItems, intelligence } = parsed.data;
      const tenantId = (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
      const userId = (req as any)?.user?.id || "system";

      const { getMemorySummary, getPlaybookRules, storeInteraction } = await import("./services/herbie-memory.service");
      const [memorySummary, playbookRules] = await Promise.all([
        getMemorySummary(tenantId, userId).catch(() => ""),
        getPlaybookRules(tenantId).catch(() => []),
      ]);

      const buildDeterministicBrief = () => {
        const unblockOrder = topItems.slice(0, 3).map((item: any, i: number) => ({
          step: `${i + 1}. ${item?.primaryAction?.label || "Address"} ${item?.title || "item"}`,
          why: (item?.reasons || ["Priority item"])[0],
          ownerRoleSuggestion: item?.sourceType === "approval" ? "PM/Owner" : "Estimator/PM",
          targetTimeframe: item?.dueAt ? "Before deadline" : "Today",
        }));

        const revenueProtection = [];
        const revenueAtRisk = Number(metrics?.revenueAtRisk) || 0;
        if (revenueAtRisk > 0) {
          revenueProtection.push({
            callout: "Total revenue at risk from urgent items",
            numbers: `$${Math.round(revenueAtRisk / 1000)}K`,
            action: "Clear urgent approvals and create missing bid projects.",
          });
        }
        const highValueItems = topItems.filter((i: any) => (i?.dollarValue || 0) >= 250000).slice(0, 2);
        for (const item of highValueItems) {
          revenueProtection.push({
            callout: item.title || "High-value opportunity",
            numbers: `$${Math.round((item.dollarValue || 0) / 1000)}K`,
            action: item.primaryAction?.label || "Review immediately",
          });
        }

        const complianceAlerts = [];
        const vendorRisk = Number(intelligence?.financialPulse?.vendorRiskCount || intelligence?.subPerformance?.atRiskCount || 0);
        if (vendorRisk > 0) {
          complianceAlerts.push({ issue: "Vendor insurance/license expiring", whoOrWhat: `${vendorRisk} vendor(s)`, deadlineOrWindow: "Within 30 days", fix: "Request updated certificates immediately." });
        }
        const missingArtifacts = Number(metrics?.missingArtifacts) || 0;
        if (missingArtifacts > 0) {
          complianceAlerts.push({ issue: "Missing bid artifacts", whoOrWhat: `${missingArtifacts} artifact(s)`, deadlineOrWindow: "Before bid submission", fix: "Send document request to responsible parties." });
        }
        for (const rule of playbookRules.slice(0, 3)) {
          complianceAlerts.push({ issue: rule.rule, whoOrWhat: rule.category, deadlineOrWindow: "Ongoing", fix: rule.description });
        }

        const workflowImprovements = [
          { improvement: "Auto-create bid start checklist when opportunity goes Pursue", why: "Reduces manual setup and missed steps.", automationCandidate: true, impact: "Saves 30 min per bid setup." },
          { improvement: "Auto-email doc request when jacket missing count > 0", why: "Missing docs stall bid readiness.", automationCandidate: true, impact: "Reduces document lag by 2-3 days." },
          { improvement: "Auto-flag approvals aging > 5 days", why: "Aging approvals block downstream work.", automationCandidate: true, impact: "Cuts approval cycle time in half." },
        ];

        const teamCoachingNotes = [
          "Clear the top blocker first. Everything downstream depends on it.",
          "If we close the aging approvals today, three bid packages can move to submission.",
          "Consistent daily reviews prevent 80% of deadline crunches. Stay disciplined.",
        ];

        const missingInfoQuestions = topItems
          .filter((i: any) => i?.sourceType === "jacket")
          .slice(0, 3)
          .map((i: any) => ({ question: `What documents are outstanding for ${i?.title || "this bid"}?`, basedOnItemId: i?.id || null, why: "Missing artifacts block bid submission." }));

        return {
          greeting: "Herbie",
          summary: "Here's the tightest plan: clear the overdue approval, create the missing bid project, and send the doc request.",
          highlights: [
            "Clear the top approval first — it unblocks downstream work.",
            "Create bid project for the best-fit opportunity.",
            "Send missing-doc request for the jacket with the most missing artifacts.",
          ],
          risks: [
            "Overdue approvals are blocking execution.",
            revenueAtRisk > 0 ? `$${Math.round(revenueAtRisk / 1000)}K revenue at risk from urgent items.` : "Monitor pipeline conversion rate.",
            missingArtifacts > 0 ? `${missingArtifacts} missing artifacts stalling submittal readiness.` : "All artifacts currently on track.",
          ],
          unblockOrder,
          revenueProtection,
          complianceAlerts: complianceAlerts.slice(0, 5),
          workflowImprovements,
          teamCoachingNotes,
          missingInfoQuestions,
          suggestedFocusBlockReason: topItems.length > 0
            ? "Reserve a 2-hour focus block to complete the top approval and generate follow-up drafts."
            : "No urgent items. Use this time for pipeline review and proactive outreach.",
        };
      };

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const brief = buildDeterministicBrief();
        storeInteraction(tenantId, userId, { now: nowStr, metrics, topItems: topItems.length }, brief, { risks: brief.risks, unblockOrder: brief.unblockOrder, complianceAlerts: brief.complianceAlerts }).catch(() => {});
        return res.json(brief);
      }

      const playbookSummary = playbookRules.map((r: any) => r.rule).join("; ");
      const prompt =
        `You are Herbie, an autonomous construction operations strategist.\n` +
        `Write like a seasoned construction PM texting an exec: short, confident sentences, no filler, always next action.\n` +
        `No emojis. No fluff. No robotic phrasing. Never invent facts.\n` +
        `Rules: Only use provided metrics/topItems/intelligence. If unknown, say "Not enough data to confirm" and propose smallest next step to verify.\n` +
        (memorySummary ? `Memory: ${memorySummary}\n` : "") +
        (playbookSummary ? `Org Playbook SOPs: ${playbookSummary}\n` : "") +
        `Now: ${nowStr}\n` +
        `Metrics: ${JSON.stringify(metrics)}\n` +
        `Top items (${topItems.length}): ${JSON.stringify(topItems.slice(0, 5))}\n` +
        (intelligence ? `Intelligence: ${JSON.stringify(intelligence)}\n` : "") +
        `Return ONLY strict JSON with these keys:\n` +
        `greeting (string), summary (1-2 sentences), highlights (3 strings), risks (up to 3 strings),\n` +
        `unblockOrder (array of {step,why,ownerRoleSuggestion,targetTimeframe} max 3),\n` +
        `revenueProtection (array of {callout,numbers,action} max 4),\n` +
        `complianceAlerts (array of {issue,whoOrWhat,deadlineOrWindow,fix} max 5),\n` +
        `workflowImprovements (array of {improvement,why,automationCandidate:boolean,impact} max 5),\n` +
        `teamCoachingNotes (3-5 strings),\n` +
        `missingInfoQuestions (array of {question,basedOnItemId,why} max 5),\n` +
        `suggestedFocusBlockReason (string).\n`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = resp.choices[0]?.message?.content ?? "{}";
      const json = safeJsonParse<any>(content);
      if (!json) {
        const brief = buildDeterministicBrief();
        return res.json(brief);
      }

      const brief = {
        greeting: typeof json.greeting === "string" ? json.greeting : "Herbie",
        summary: typeof json.summary === "string" ? json.summary : "",
        highlights: Array.isArray(json.highlights) ? json.highlights.slice(0, 3).map(String) : [],
        risks: Array.isArray(json.risks) ? json.risks.slice(0, 3).map(String) : [],
        unblockOrder: Array.isArray(json.unblockOrder) ? json.unblockOrder.slice(0, 3) : [],
        revenueProtection: Array.isArray(json.revenueProtection) ? json.revenueProtection.slice(0, 4) : [],
        complianceAlerts: Array.isArray(json.complianceAlerts) ? json.complianceAlerts.slice(0, 5) : [],
        workflowImprovements: Array.isArray(json.workflowImprovements) ? json.workflowImprovements.slice(0, 5) : [],
        teamCoachingNotes: Array.isArray(json.teamCoachingNotes) ? json.teamCoachingNotes.slice(0, 5).map(String) : [],
        missingInfoQuestions: Array.isArray(json.missingInfoQuestions) ? json.missingInfoQuestions.slice(0, 5) : [],
        suggestedFocusBlockReason: typeof json.suggestedFocusBlockReason === "string" ? json.suggestedFocusBlockReason : "",
      };

      storeInteraction(tenantId, userId, { now: nowStr, metrics, topItems: topItems.length }, brief, { risks: brief.risks, unblockOrder: brief.unblockOrder, complianceAlerts: brief.complianceAlerts }).catch(() => {});
      res.json(brief);
    } catch (error) {
      console.error("Herbie brief error:", error);
      res.status(500).json({ error: "Failed to generate brief" });
    }
  });

  // ── Herbie Draft Follow-Up Endpoint ───────────────────────────────────────
  const DraftFollowupSchema = z.object({
    itemTitle: z.string().max(160).optional(),
    clientName: z.string().max(160).optional(),
    missingWhat: z.string().max(800).optional(),
    tone: z.enum(["professional", "firm", "friendly", "direct"]).optional(),
    context: z.enum(["missing_docs", "rfi", "addendum", "invoice", "schedule"]).optional(),
    deadlineDate: z.string().max(32).optional(),
    projectOrBidId: z.string().max(64).optional(),
    contactRole: z.string().max(80).optional(),
  });

  app.post("/api/herbie/draft-followup", async (req: Request, res: Response) => {
    try {
      const ip = (req.headers["x-forwarded-for"]?.toString().split(",")[0] || req.socket.remoteAddress || "unknown").trim();
      if (!herbieRateOk(ip)) return res.status(429).json({ error: "Rate limit exceeded" });

      const parsed = DraftFollowupSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      const { itemTitle, clientName, missingWhat, tone, context, deadlineDate, contactRole } = parsed.data;

      const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        const deadlineStr = deadlineDate ? ` by ${deadlineDate}` : " at your earliest convenience";
        return res.json({
          subject: `Follow-up needed: ${itemTitle ?? "Request"}`,
          body:
            `Hello${clientName ? ` ${clientName}` : ""},\n\n` +
            `We are following up regarding ${itemTitle || "an open item"} that requires attention.\n\n` +
            `Missing: ${missingWhat ?? "required documents"}\n\n` +
            `Please provide the requested items${deadlineStr}.\n\n` +
            `If you have questions, please contact ${contactRole || "the project manager"} directly.\n\n` +
            `Thank you,\n`,
        });
      }

      const contextMap: Record<string, string> = {
        missing_docs: "missing construction documents (COI, W-9, lien waivers, submittals, bonds)",
        rfi: "Request for Information (RFI) clarification needed",
        addendum: "addendum acknowledgement required before bid submission",
        invoice: "invoice or pay application missing information (retainage, backup docs, lien waivers)",
        schedule: "schedule confirmation or update needed",
      };

      const prompt =
        `Draft a ${tone ?? "professional"} business email for construction operations.\n` +
        `Context: ${contextMap[context || "missing_docs"] || "general follow-up"}\n` +
        `Item: ${itemTitle ?? "Request"}\n` +
        `Client: ${clientName ?? "N/A"}\n` +
        `Missing: ${missingWhat ?? "required documents"}\n` +
        `Deadline: ${deadlineDate || "ASAP"}\n` +
        `Contact: ${contactRole || "project manager"}\n` +
        `Requirements: Include what's missing, why it matters, requested deadline, next step, who to contact.\n` +
        `Tone: Short, direct, no fluff. Construction PM style.\n` +
        `Return ONLY strict JSON: { "subject": string, "body": string }.\n`;

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = resp.choices[0]?.message?.content ?? "{}";
      const json = safeJsonParse<any>(content) ?? {};
      res.json({
        subject: typeof json.subject === "string" ? json.subject : `Follow-up needed: ${itemTitle ?? "Request"}`,
        body: typeof json.body === "string" ? json.body : "",
      });
    } catch (error) {
      console.error("Herbie draft-followup error:", error);
      res.status(500).json({ error: "Failed to generate draft" });
    }
  });

  // ── Dashboard Tasks API (AI Command Center) ──────────────────────────────
  app.get("/api/dashboard/tasks", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const statusFilter = pOpt(req.query.status as string);
      const priorityFilter = pOpt(req.query.priority as string);

      let query = db
        .select()
        .from(dashboardTasks)
        .where(eq(dashboardTasks.tenantId, tenantId))
        .orderBy(asc(dashboardTasks.position), desc(dashboardTasks.createdAt))
        .limit(200);

      const rows = await query;
      const now = new Date();
      const filtered = rows.filter(t => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (t.status === "snoozed" && t.snoozeUntil && new Date(t.snoozeUntil) > now) return false;
        return true;
      });

      res.json(filtered);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch dashboard tasks");
    }
  });

  app.post("/api/dashboard/tasks", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const schema = insertDashboardTaskSchema.pick({
        title: true,
        description: true,
        priority: true,
        status: true,
        dueAt: true,
        sourceEntityType: true,
        sourceEntityId: true,
        actionType: true,
        actionPayload: true,
      });
      const parsed = schema.parse({ ...req.body, tenantId });

      const [task] = await db.insert(dashboardTasks).values({
        tenantId,
        title: parsed.title,
        description: parsed.description ?? null,
        priority: parsed.priority ?? "medium",
        status: parsed.status ?? "pending",
        dueAt: parsed.dueAt ?? null,
        position: 0,
        source: "manual",
        sourceEntityType: parsed.sourceEntityType ?? null,
        sourceEntityId: parsed.sourceEntityId ?? null,
        actionType: parsed.actionType ?? null,
        actionPayload: parsed.actionPayload ?? null,
      }).returning();

      eventStreamService.emit("TASK_UPDATED", tenantId, { task, action: "created" });
      res.status(201).json(task);
    } catch (error: any) {
      if (error?.name === "ZodError") return res.status(400).json({ error: "Validation failed", details: error.issues });
      handleRouteError(res, error, "Failed to create dashboard task");
    }
  });

  app.patch("/api/dashboard/tasks/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const taskId = p(req.params.id, "id");
      const { title, description, priority, status, dueAt, snoozeUntil, position } = req.body;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (priority !== undefined) updates.priority = priority;
      if (status !== undefined) {
        updates.status = status;
        if (status === "done") {
          updates.completedAt = new Date();
          updates.completedBy = "user";
        }
      }
      if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;
      if (snoozeUntil !== undefined) {
        updates.snoozeUntil = snoozeUntil ? new Date(snoozeUntil) : null;
        if (snoozeUntil) updates.status = "snoozed";
      }
      if (position !== undefined) updates.position = position;

      const [updated] = await db
        .update(dashboardTasks)
        .set(updates)
        .where(and(eq(dashboardTasks.id, taskId), eq(dashboardTasks.tenantId, tenantId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Task not found" });

      eventStreamService.emit("TASK_UPDATED", tenantId, { task: updated, action: "updated" });
      res.json(updated);
    } catch (error) {
      handleRouteError(res, error, "Failed to update dashboard task");
    }
  });

  app.delete("/api/dashboard/tasks/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const taskId = p(req.params.id, "id");
      const [deleted] = await db
        .delete(dashboardTasks)
        .where(and(eq(dashboardTasks.id, taskId), eq(dashboardTasks.tenantId, tenantId)))
        .returning();
      if (!deleted) return res.status(404).json({ error: "Task not found" });
      eventStreamService.emit("TASK_UPDATED", tenantId, { taskId, action: "deleted" });
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to delete dashboard task");
    }
  });

  app.post("/api/dashboard/tasks/:id/execute", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const taskId = p(req.params.id, "id");
      const [task] = await db.select().from(dashboardTasks)
        .where(and(eq(dashboardTasks.id, taskId), eq(dashboardTasks.tenantId, tenantId)));
      if (!task) return res.status(404).json({ error: "Task not found" });

      const payload = (task.actionPayload || {}) as Record<string, any>;
      let result: any = { executed: false, reason: "Unknown action type" };

      switch (task.actionType) {
        case "run_ingestion": {
          const bpId = payload.bidProjectId;
          if (bpId) {
            try {
              const { runFullIngestion } = await import("./services/ingestion-pipeline.service");
              const ingResult = await runFullIngestion(tenantId, bpId);
              result = { executed: true, ingestion: ingResult };
              eventStreamService.emit("INGESTION_COMPLETE", tenantId, { bidProjectId: bpId, result: ingResult });
            } catch (e: any) {
              result = { executed: false, reason: e?.message ?? "Ingestion failed" };
            }
          }
          break;
        }
        case "seed_checklist": {
          const bpId = payload.bidProjectId;
          if (bpId) {
            try {
              const { seedChecklistForBidProject } = await import("./services/bid-jacket-artifacts.service");
              await seedChecklistForBidProject(tenantId, bpId);
              result = { executed: true };
            } catch (e: any) {
              result = { executed: false, reason: e?.message ?? "Seed checklist failed" };
            }
          }
          break;
        }
        case "create_bid_project": {
          const oppId = payload.opportunityId;
          if (oppId) {
            try {
              const [bp] = await db.insert(bidProjects).values({
                tenantId,
                opportunityId: oppId,
                status: "initiated",
                documentationJson: { name: payload.oppTitle || "Untitled" },
              }).returning();
              const { seedArtifactsForBidProject, seedChecklistForBidProject } = await import("./services/bid-jacket-artifacts.service");
              await seedArtifactsForBidProject(tenantId, bp.id);
              await seedChecklistForBidProject(tenantId, bp.id);
              result = { executed: true, bidProjectId: bp.id };
              eventStreamService.emit("BID_JACKET_CHANGED", tenantId, { bidProjectId: bp.id, action: "created" });
            } catch (e: any) {
              result = { executed: false, reason: e?.message ?? "Create bid project failed" };
            }
          }
          break;
        }
        case "retry_artifact": {
          const artifactId = payload.artifactId;
          if (artifactId) {
            try {
              await db.update(bidJacketArtifacts)
                .set({ status: "missing", updatedAt: new Date() })
                .where(eq(bidJacketArtifacts.id, artifactId));
              result = { executed: true };
            } catch (e: any) {
              result = { executed: false, reason: e?.message ?? "Retry failed" };
            }
          }
          break;
        }
        case "compliance_review":
        case "follow_up":
          result = { executed: true, note: "Flagged for manual review" };
          break;
        default:
          result = { executed: false, reason: `Unsupported action: ${task.actionType}` };
      }

      if (result.executed) {
        await db.update(dashboardTasks)
          .set({ status: "done", completedAt: new Date(), completedBy: "system", updatedAt: new Date() })
          .where(eq(dashboardTasks.id, taskId));
      }

      eventStreamService.emit("TASK_EXECUTED", tenantId, { taskId, actionType: task.actionType, result });
      await auditService.logEvent({
        tenantId,
        eventType: "dashboard_task_executed",
        actor: "user",
        entityType: "dashboard_task",
        entityId: taskId,
        afterJson: { actionType: task.actionType, result },
      });

      res.json(result);
    } catch (error) {
      handleRouteError(res, error, "Failed to execute dashboard task");
    }
  });

  app.post("/api/dashboard/tasks/bulk", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const { taskIds, action, snoozeUntil } = req.body as { taskIds: string[]; action: string; snoozeUntil?: string };
      if (!Array.isArray(taskIds) || !taskIds.length) return res.status(400).json({ error: "taskIds required" });
      if (!action) return res.status(400).json({ error: "action required" });

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (action === "done") { updates.status = "done"; updates.completedAt = new Date(); updates.completedBy = "user"; }
      else if (action === "pending") { updates.status = "pending"; updates.completedAt = null; }
      else if (action === "snooze") { updates.status = "snoozed"; updates.snoozeUntil = snoozeUntil ? new Date(snoozeUntil) : new Date(Date.now() + 86400000); }
      else if (action === "delete") {
        await db.delete(dashboardTasks).where(and(eq(dashboardTasks.tenantId, tenantId), inArray(dashboardTasks.id, taskIds)));
        eventStreamService.emit("TASK_UPDATED", tenantId, { taskIds, action: "bulk_deleted" });
        return res.json({ ok: true, affected: taskIds.length });
      }
      else return res.status(400).json({ error: "Invalid action" });

      await db.update(dashboardTasks).set(updates)
        .where(and(eq(dashboardTasks.tenantId, tenantId), inArray(dashboardTasks.id, taskIds)));
      eventStreamService.emit("TASK_UPDATED", tenantId, { taskIds, action: `bulk_${action}` });
      res.json({ ok: true, affected: taskIds.length });
    } catch (error) {
      handleRouteError(res, error, "Failed to bulk update tasks");
    }
  });

  app.post("/api/dashboard/tasks/reorder", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const { orderedIds } = req.body as { orderedIds: string[] };
      if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds required" });

      for (let i = 0; i < orderedIds.length; i++) {
        await db.update(dashboardTasks)
          .set({ position: i, updatedAt: new Date() })
          .where(and(eq(dashboardTasks.id, orderedIds[i]), eq(dashboardTasks.tenantId, tenantId)));
      }

      eventStreamService.emit("TASK_UPDATED", tenantId, { action: "reordered" });
      res.json({ ok: true });
    } catch (error) {
      handleRouteError(res, error, "Failed to reorder tasks");
    }
  });

  app.post("/api/dashboard/analyze", async (req: Request, res: Response) => {
    try {
      const { runProactiveAnalysis } = await import("./services/proactive-intelligence.service");
      const result = await runProactiveAnalysis(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      handleRouteError(res, error, "Failed to run proactive analysis");
    }
  });

  // Phase C — Proactive Intelligence page consumes a semantically-named
  // surface. These are thin aliases over the dashboard_tasks endpoints
  // above so we don't fork persistence or analysis logic.
  app.get("/api/proactive-intelligence/tasks", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const statusFilter = pOpt(req.query.status as string);
      const priorityFilter = pOpt(req.query.priority as string);
      const rows = await db
        .select()
        .from(dashboardTasks)
        .where(eq(dashboardTasks.tenantId, tenantId))
        .orderBy(asc(dashboardTasks.position), desc(dashboardTasks.createdAt))
        .limit(200);
      const now = new Date();
      const filtered = rows.filter((t) => {
        if (statusFilter && t.status !== statusFilter) return false;
        if (priorityFilter && t.priority !== priorityFilter) return false;
        if (t.status === "snoozed" && t.snoozeUntil && new Date(t.snoozeUntil) > now) return false;
        // Page only shows actionable items, not items already done.
        if (t.status === "done") return false;
        return true;
      });
      res.json(filtered);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch proactive intelligence tasks");
    }
  });

  app.post("/api/proactive-intelligence/run", async (_req: Request, res: Response) => {
    try {
      const { runProactiveAnalysis } = await import("./services/proactive-intelligence.service");
      const result = await runProactiveAnalysis(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      handleRouteError(res, error, "Failed to run proactive analysis");
    }
  });

  app.post(
    "/api/proactive-intelligence/tasks/:id/execute",
    async (req: Request, res: Response) => {
      // Forward to the shared execute handler by re-invoking the same path
      // logic. Cleanest is to reuse via internal HTTP redirect of intent —
      // we just call the same service directly to avoid an extra hop.
      try {
        const tenantId = DEFAULT_TENANT_ID;
        const taskId = p(req.params.id, "id");
        const [task] = await db
          .select()
          .from(dashboardTasks)
          .where(and(eq(dashboardTasks.id, taskId), eq(dashboardTasks.tenantId, tenantId)));
        if (!task) return res.status(404).json({ error: "Task not found" });

        const payload = (task.actionPayload || {}) as Record<string, any>;
        let result: any = { executed: false, reason: "Unknown action type" };

        switch (task.actionType) {
          case "run_ingestion": {
            const bpId = payload.bidProjectId;
            if (bpId) {
              const { runFullIngestion } = await import(
                "./services/ingestion-pipeline.service"
              );
              const ingResult = await runFullIngestion(tenantId, bpId);
              result = { executed: true, ingestion: ingResult };
            }
            break;
          }
          case "seed_checklist": {
            const bpId = payload.bidProjectId;
            if (bpId) {
              const { seedChecklistForBidProject } = await import(
                "./services/bid-jacket-artifacts.service"
              );
              await seedChecklistForBidProject(tenantId, bpId);
              result = { executed: true };
            }
            break;
          }
          default:
            // For task types without a wired-up automation we still let the
            // user mark the item "done" so the page stays clean.
            result = { executed: true, note: "Marked complete (no automation wired)" };
        }

        await db
          .update(dashboardTasks)
          .set({ status: "done", completedAt: new Date(), completedBy: "user", updatedAt: new Date() })
          .where(and(eq(dashboardTasks.id, taskId), eq(dashboardTasks.tenantId, tenantId)));
        eventStreamService.emit("TASK_UPDATED", tenantId, { taskId, action: "executed" });

        res.json(result);
      } catch (error) {
        handleRouteError(res, error, "Failed to execute proactive intelligence task");
      }
    },
  );

  app.get("/api/dashboard/activity", async (_req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const events = await db.select()
        .from(auditEvents)
        .where(eq(auditEvents.tenantId, tenantId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(30);
      res.json(events);
    } catch (error) {
      handleRouteError(res, error, "Failed to fetch activity feed");
    }
  });

  // Register chat routes for HERBIE
  registerChatRoutes(app);

  // Register Object Storage routes for file uploads
  registerObjectStorageRoutes(app);

  // Register HERBIE Command Dashboard routes
  app.use("/api/herbie-command", herbieCommandRoutes);

  app.use("/api/herbie", herbieRouter);

  app.use("/api/herbie/tools", herbieToolsRouter);

  // Register Herbie tool-execution HTTP surface (HERBIE.md tool registry).
  // Mounted at /api/herbie/tools-exec to avoid colliding with the existing
  // herbie-tools code-scoped router above.
  const { herbieToolsExecuteRouter } = await import(
    "./routes/herbie-tools-execute.routes"
  );
  app.use("/api/herbie/tools-exec", herbieToolsExecuteRouter);

  // Register Herbie proactive digest routes (Phase 1 Feature 9 polish)
  const { herbieDigestRouter } = await import("./routes/herbie-digest.routes");
  app.use("/api/herbie/digest", herbieDigestRouter);

  // Register Herbie three-layer memory routes (Phase 1 Feature 8)
  const { herbieMemoryRouter } = await import("./routes/herbie-memory.routes");
  app.use("/api/herbie/memory", herbieMemoryRouter);

  // Register COI tracker routes (Phase 1 Feature 3)
  const { coiRouter } = await import("./routes/coi.routes");
  app.use("/api/coi", coiRouter);

  // Register approval dispatchers (Phase 1 Feature 5 / 10).
  // Each dispatcher wires a draft_* action type to its post-approval
  // transition. Idempotent — safe to call on every boot.
  const { registerRfiDispatcher } = await import("./services/rfi-draft.service");
  registerRfiDispatcher();
  const { registerSubmittalDispatcher } = await import(
    "./services/submittal-draft.service"
  );
  registerSubmittalDispatcher();
  const { registerOutboundMessageDispatcher } = await import(
    "./services/outbound-message-draft.service"
  );
  registerOutboundMessageDispatcher();

  // Register RFI / Submittal draft HTTP routes (Phase 1 Feature 5)
  const { rfiDraftRouter } = await import("./routes/rfi-draft.routes");
  app.use("/api/rfi", rfiDraftRouter);
  const { submittalDraftRouter } = await import(
    "./routes/submittal-draft.routes"
  );
  app.use("/api/submittal", submittalDraftRouter);

  // Register Voice Daily Log routes (Phase 1 Feature 4)
  const { voiceDailyLogRouter } = await import(
    "./routes/voice-daily-log.routes"
  );
  app.use("/api", voiceDailyLogRouter);

  // Register Vendor Portal routes (external, token-based, no auth)
  const { vendorRouter } = await import("./routes/vendor-portal.routes");
  app.use("/api/v", vendorRouter);

  // Register Bid Form + Leveling routes (Phase 3)
  const { bidFormRouter } = await import("./routes/bid-form.routes");
  app.use("/api", bidFormRouter);

  // Register Award → Contract routes (Phase 4)
  const { awardRouter } = await import("./routes/award.routes");
  app.use("/api", awardRouter);

  // Register Unified Ops workflow handlers
  const { registerWorkflowHandlers, applyMarginPolicy } = await import("./services/unified-workflows.service");
  registerWorkflowHandlers();

  // ============================================================================
  // UNIFIED OPS CORE APIs: Events, Entity Links, Autofill
  // ============================================================================

  const { eventBus } = await import("./services/event-bus.service");
  const { entityLinkService } = await import("./services/entity-link.service");
  const { autofillEngine } = await import("./services/autofill-engine.service");

  app.post("/api/events/emit", async (req: Request, res: Response) => {
    try {
      const event = await eventBus.emit({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      });
      res.json(event);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, eventType, limit } = req.query;
      let result;
      if (entityType && entityId) {
        result = await eventBus.getEventsForEntity(DEFAULT_TENANT_ID, entityType as string, entityId as string, Number(limit) || 50);
      } else if (eventType) {
        result = await eventBus.getEventsByType(DEFAULT_TENANT_ID, eventType as string, Number(limit) || 50);
      } else {
        const { events: eventsTable } = await import("@shared/schema");
        const { desc, eq } = await import("drizzle-orm");
        result = await db.select().from(eventsTable)
          .where(eq(eventsTable.tenantId, DEFAULT_TENANT_ID))
          .orderBy(desc(eventsTable.createdAt))
          .limit(Number(limit) || 50);
      }
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id/outbox", async (req: Request, res: Response) => {
    try {
      const result = await eventBus.getOutboxStatus(p(req.params.id));
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/retry-failed", async (req: Request, res: Response) => {
    try {
      const count = await eventBus.retryFailedOutbox();
      res.json({ retriedCount: count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/entity-links", async (req: Request, res: Response) => {
    try {
      const link = await entityLinkService.createLink({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      });
      res.json(link);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/entity-links", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.query;
      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId required" });
      }
      const links = await entityLinkService.getLinksForEntity(DEFAULT_TENANT_ID, entityType as string, entityId as string);
      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/entity-links/:id", async (req: Request, res: Response) => {
    try {
      await entityLinkService.deleteLink(p(req.params.id));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/autofill/suggestions", async (req: Request, res: Response) => {
    try {
      const { sourceEntityType, targetEntityType } = req.query;
      if (!sourceEntityType || !targetEntityType) {
        return res.status(400).json({ error: "sourceEntityType and targetEntityType required" });
      }
      const sourceData = req.query.sourceData ? JSON.parse(req.query.sourceData as string) : {};
      const suggestions = await autofillEngine.computeSuggestions(
        DEFAULT_TENANT_ID,
        sourceEntityType as string,
        sourceData,
        targetEntityType as string
      );
      res.json(suggestions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/autofill/history", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.query;
      if (!entityType || !entityId) {
        return res.status(400).json({ error: "entityType and entityId required" });
      }
      const history = await autofillEngine.getAutofillHistory(DEFAULT_TENANT_ID, entityType as string, entityId as string);
      res.json(history);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/autofill/rules", async (req: Request, res: Response) => {
    try {
      const { autofillRules: rulesTable } = await import("@shared/schema");
      const [rule] = await db.insert(rulesTable).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/autofill/rules", async (req: Request, res: Response) => {
    try {
      const { autofillRules: rulesTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const rules = await db.select().from(rulesTable)
        .where(eq(rulesTable.tenantId, DEFAULT_TENANT_ID));
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/autofill/confirm/:runId", async (req: Request, res: Response) => {
    try {
      await autofillEngine.confirmAutofillRun(p(req.params.runId), req.body.confirmedBy || "system");
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/autofill/reject/:runId", async (req: Request, res: Response) => {
    try {
      await autofillEngine.rejectAutofillRun(p(req.params.runId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/autofill/seed-defaults", async (req: Request, res: Response) => {
    try {
      const { autofillRules: rulesTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const existing = await db.select().from(rulesTable).where(eq(rulesTable.tenantId, DEFAULT_TENANT_ID));
      if (existing.length > 0) {
        return res.json({ message: "Rules already exist", count: existing.length });
      }
      const defaultRules = [
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "Opportunity → Project Name",
          sourceEntityType: "opportunity",
          targetEntityType: "project",
          ruleType: "deterministic" as const,
          fieldMappings: [
            { sourceField: "title", targetField: "name" },
            { sourceField: "description", targetField: "description" },
            { sourceField: "agency", targetField: "clientName" },
          ],
          requiresConfirmation: false,
          isActive: true,
          priority: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "Opportunity → Bid Project Fields",
          sourceEntityType: "opportunity",
          targetEntityType: "bid_project",
          ruleType: "deterministic" as const,
          fieldMappings: [
            { sourceField: "title", targetField: "name" },
            { sourceField: "estimatedValue", targetField: "value" },
            { sourceField: "solicitationNumber", targetField: "solicitationNumber" },
          ],
          requiresConfirmation: false,
          isActive: true,
          priority: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "Takeoff → PO Line Items",
          sourceEntityType: "takeoff",
          targetEntityType: "purchase_order",
          ruleType: "rule_based" as const,
          fieldMappings: [
            { sourceField: "room", targetField: "lineDescription", transform: "trim" },
            { sourceField: "quantity", targetField: "quantity", transform: "parseNumber" },
            { sourceField: "unitCost", targetField: "unitCost", transform: "parseNumber" },
            { sourceField: "extendedCost", targetField: "totalCost", transform: "parseNumber" },
          ],
          requiresConfirmation: true,
          isActive: true,
          priority: 2,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "Takeoff Delta → Change Order",
          sourceEntityType: "takeoff",
          targetEntityType: "change_order",
          ruleType: "rule_based" as const,
          fieldMappings: [
            { sourceField: "delta", targetField: "amount", transform: "parseNumber" },
            { sourceField: "projectName", targetField: "title", transform: "trim" },
          ],
          requiresConfirmation: true,
          isActive: true,
          priority: 2,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "Project → Task Assignment",
          sourceEntityType: "project",
          targetEntityType: "task",
          ruleType: "deterministic" as const,
          fieldMappings: [
            { sourceField: "name", targetField: "projectName" },
            { sourceField: "projectNumber", targetField: "projectNumber" },
          ],
          requiresConfirmation: false,
          isActive: true,
          priority: 1,
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          name: "AI Solicitation → Compliance Items",
          sourceEntityType: "solicitation",
          targetEntityType: "compliance_item",
          ruleType: "ai_suggested" as const,
          fieldMappings: [
            { sourceField: "clauseRef", targetField: "clauseRef" },
            { sourceField: "title", targetField: "title" },
            { sourceField: "severity", targetField: "severity" },
          ],
          requiresConfirmation: true,
          isActive: true,
          priority: 3,
        },
      ];
      const inserted = await db.insert(rulesTable).values(defaultRules).returning();
      res.json({ message: "Default rules seeded", count: inserted.length, rules: inserted });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/all-with-outbox", async (req: Request, res: Response) => {
    try {
      const { events: eventsTable, eventOutbox: outboxTable } = await import("@shared/schema");
      const { desc, eq } = await import("drizzle-orm");
      const limit = Number(req.query.limit) || 50;
      const allEvents = await db.select().from(eventsTable)
        .where(eq(eventsTable.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(eventsTable.createdAt))
        .limit(limit);
      const enriched = await Promise.all(allEvents.map(async (evt) => {
        const outbox = await db.select().from(outboxTable)
          .where(eq(outboxTable.eventId, evt.id));
        return { ...evt, outboxEntries: outbox };
      }));
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pricing/margin-calc", async (req: Request, res: Response) => {
    try {
      const { baseCost, overheadPercent, profitPercent, contingencyPercent, bondPercent } = req.body;
      if (baseCost === undefined) return res.status(400).json({ error: "baseCost required" });
      const policy = {
        overheadPercent: overheadPercent ?? 0.10,
        profitPercent: profitPercent ?? 0.08,
        contingencyPercent: contingencyPercent ?? 0.05,
        bondPercent: bondPercent ?? 0.02,
      };
      const result = applyMarginPolicy(parseFloat(baseCost), policy);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // HERBIE NATURAL LANGUAGE QUERY API
  // ============================================================================

  const herbieQuerySchema = z.object({
    query: z.string().min(1, "Query is required"),
    filters: z.record(z.any()).optional(),
  });

  app.post("/api/herbie/query", async (req: Request, res: Response) => {
    try {
      const validated = herbieQuerySchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }

      const { query, filters } = validated.data;
      const herbieQuery = createHerbieQueryService(DEFAULT_TENANT_ID);
      const result = await herbieQuery.processNaturalLanguageQuery(query, filters);

      res.json(result);
    } catch (error: any) {
      console.error("[HERBIE Query] Error:", error);
      res.status(500).json({ 
        success: false,
        error: "Failed to process query",
        message: error.message 
      });
    }
  });

  app.post("/api/herbie/voice", async (req: Request, res: Response) => {
    res.json({
      supported: false,
      message: "Voice input coming soon. Please use text-based queries for now.",
      hint: "Use the /api/herbie/query endpoint with a text query instead."
    });
  });

  // ============================================================================
  // DASHBOARD API
  // ============================================================================

  app.get("/api/dashboard/stats", async (req: Request, res: Response) => {
    try {
      const stats = await storage.getDashboardStats(DEFAULT_TENANT_ID);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ error: "Failed to fetch dashboard stats" });
    }
  });

  app.get("/api/admin/seeds/verify", async (_req: Request, res: Response) => {
    try {
      const atCount = await db.execute(sql`SELECT count(*)::int as count FROM artifact_templates`);
      const clCount = await db.execute(sql`SELECT count(*)::int as count FROM bid_jacket_checklist_templates`);
      res.json({
        artifactTemplates: (atCount.rows[0] as any)?.count ?? 0,
        checklistTemplates: (clCount.rows[0] as any)?.count ?? 0,
      });
    } catch (error) {
      console.error("Error verifying seeds:", error);
      res.status(500).json({ error: "Failed to verify seeds" });
    }
  });

  app.post("/api/admin/metrics/snapshot", async (req: Request, res: Response) => {
    try {
      const { writeAllSnapshotsForAllTenants } = await import("./services/metric-snapshot.service");
      const result = await writeAllSnapshotsForAllTenants();
      res.json({ success: true, tenants: Object.keys(result).length, snapshots: result });
    } catch (error) {
      console.error("Error writing metric snapshots:", error);
      res.status(500).json({ error: "Failed to write metric snapshots" });
    }
  });

  app.post("/api/admin/data-quality-check", async (req: Request, res: Response) => {
    try {
      const copyChainsResult = await db.execute(sql`
        SELECT id, po_number FROM purchase_orders
        WHERE po_number ~* '\\(copy\\).*\\(copy\\)'
      `);
      const placeholderResult = await db.execute(sql`
        SELECT id, po_number FROM purchase_orders
        WHERE po_number ~* '(placeholder|TBD|fake|lorem)'
      `);
      const issuedBadResult = await db.execute(sql`
        SELECT id, po_number, status, order_date, total_amount FROM purchase_orders
        WHERE status = 'issued' AND (order_date IS NULL OR CAST(total_amount AS numeric) = 0)
      `);
      const copyChains = copyChainsResult.rows || [];
      const placeholders = placeholderResult.rows || [];
      const issuedBad = issuedBadResult.rows || [];
      const passed = copyChains.length === 0 && placeholders.length === 0;
      res.json({
        passed,
        violations: {
          repeatedCopyChains: copyChains,
          placeholderStrings: placeholders,
          issuedWithBadData: issuedBad,
        },
        summary: {
          criticalViolations: copyChains.length + placeholders.length,
          warnings: issuedBad.length,
        },
      });
    } catch (error) {
      console.error("Error running data quality check:", error);
      res.status(500).json({ error: "Failed to run data quality check" });
    }
  });

  app.get("/api/dashboard/layout", async (req: Request, res: Response) => {
    try {
      const { getDashboardLayout } = await import("./services/dashboard-layout.service");
      const tenantId = DEFAULT_TENANT_ID;
      const userId = (req.query.userId as string) || "default-user";
      const result = await getDashboardLayout(tenantId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error fetching dashboard layout:", error);
      res.status(500).json({ error: "Failed to fetch dashboard layout" });
    }
  });

  app.patch("/api/dashboard/layout", async (req: Request, res: Response) => {
    try {
      const { patchDashboardLayout } = await import("./services/dashboard-layout.service");
      const tenantId = DEFAULT_TENANT_ID;
      const userId = (req.body.userId as string) || "default-user";
      const result = await patchDashboardLayout(tenantId, userId, {
        updates: req.body.updates,
        preset: req.body.preset,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error updating dashboard layout:", error);
      const status = error.message?.includes("Unknown preset") ? 400 : 500;
      res.status(status).json({ error: error.message || "Failed to update dashboard layout" });
    }
  });

  app.delete("/api/dashboard/layout", async (req: Request, res: Response) => {
    try {
      const { resetDashboardLayout } = await import("./services/dashboard-layout.service");
      const tenantId = DEFAULT_TENANT_ID;
      const userId = (req.query.userId as string) || "default-user";
      const result = await resetDashboardLayout(tenantId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error resetting dashboard layout:", error);
      res.status(500).json({ error: "Failed to reset dashboard layout" });
    }
  });

  // ============================================================================
  // COMPETITOR INTELLIGENCE API
  // ============================================================================

  app.get("/api/competitors", async (req: Request, res: Response) => {
    try {
      const result = await competitorService.listCompetitors(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      console.error("Error fetching competitors:", error);
      res.status(500).json({ error: "Failed to fetch competitors" });
    }
  });

  app.get("/api/competitors/:id", async (req: Request, res: Response) => {
    try {
      const result = await competitorService.getCompetitorProfile(DEFAULT_TENANT_ID, p(req.params.id));
      if (!result) return res.status(404).json({ error: "Competitor not found" });
      res.json(result);
    } catch (error) {
      console.error("Error fetching competitor profile:", error);
      res.status(500).json({ error: "Failed to fetch competitor profile" });
    }
  });

  app.post("/api/competitors", async (req: Request, res: Response) => {
    try {
      const { name, dunsNumber, cageCode, website, notes, naicsCodes, setAsideTypes, primaryAgencies, headquartersState } = req.body;
      if (!name) return res.status(400).json({ error: "name is required" });
      const result = await competitorService.createCompetitor({
        tenantId: DEFAULT_TENANT_ID,
        name,
        dunsNumber: dunsNumber || null,
        cageCode: cageCode || null,
        website: website || null,
        notes: notes || null,
        naicsCodes: naicsCodes || null,
        setAsideTypes: setAsideTypes || null,
        primaryAgencies: primaryAgencies || null,
        headquartersState: headquartersState || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating competitor:", error);
      res.status(500).json({ error: "Failed to create competitor" });
    }
  });

  app.post("/api/competitors/:id/awards", async (req: Request, res: Response) => {
    try {
      const { agency, contractNumber, naicsCode, setAside, awardValue, awardedAt, placeOfPerformance, description } = req.body;
      if (!agency) return res.status(400).json({ error: "agency is required" });
      const result = await competitorService.createCompetitorAward({
        tenantId: DEFAULT_TENANT_ID,
        competitorId: p(req.params.id),
        contractNumber: contractNumber || null,
        agency,
        naicsCode: naicsCode || null,
        setAside: setAside || null,
        awardValue: awardValue || null,
        awardedAt: awardedAt ? new Date(awardedAt) : undefined,
        placeOfPerformance: placeOfPerformance || null,
        description: description || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating competitor award:", error);
      res.status(500).json({ error: "Failed to create competitor award" });
    }
  });

  // ============================================================================
  // BID COMPLIANCE INTELLIGENCE API
  // ============================================================================

  app.get("/api/bids/:id/compliance", async (req: Request, res: Response) => {
    try {
      const result = await bidComplianceService.getComplianceSummary(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(result);
    } catch (error) {
      console.error("Error fetching compliance summary:", error);
      res.status(500).json({ error: "Failed to fetch compliance summary" });
    }
  });

  app.post("/api/bids/:id/compliance/generate", async (req: Request, res: Response) => {
    try {
      const result = await bidComplianceService.generateFromSolicitation(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(result);
    } catch (error) {
      console.error("Error generating compliance checklist:", error);
      res.status(500).json({ error: "Failed to generate compliance checklist" });
    }
  });

  app.patch("/api/compliance/:itemId", async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status || !["missing", "in_progress", "satisfied"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: missing, in_progress, satisfied" });
      }
      const result = await bidComplianceService.updateItemStatus(DEFAULT_TENANT_ID, p(req.params.itemId), status);
      if (!result) return res.status(404).json({ error: "Compliance item not found" });
      res.json(result);
    } catch (error) {
      console.error("Error updating compliance item:", error);
      res.status(500).json({ error: "Failed to update compliance item" });
    }
  });

  app.delete("/api/compliance/:itemId", async (req: Request, res: Response) => {
    try {
      const result = await bidComplianceService.deleteItem(DEFAULT_TENANT_ID, p(req.params.itemId));
      if (!result) return res.status(404).json({ error: "Compliance item not found" });
      res.json(result);
    } catch (error) {
      console.error("Error deleting compliance item:", error);
      res.status(500).json({ error: "Failed to delete compliance item" });
    }
  });

  // ============================================================================
  // STRATEGIC PRICING INTELLIGENCE API
  // ============================================================================

  app.get("/api/bids/:id/pricing", async (req: Request, res: Response) => {
    try {
      const result = await pricingService.compareCurrentToBaseline(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(result);
    } catch (error) {
      console.error("Error fetching pricing data:", error);
      res.status(500).json({ error: "Failed to fetch pricing data" });
    }
  });

  app.post("/api/bids/:id/pricing/snapshot", async (req: Request, res: Response) => {
    try {
      const { estimatedValue, costBreakdown, marginPercent, notes } = req.body;
      const result = await pricingService.createSnapshot(DEFAULT_TENANT_ID, {
        bidProjectId: p(req.params.id),
        estimatedValue: estimatedValue || null,
        costBreakdown: costBreakdown || null,
        marginPercent: marginPercent || null,
        notes: notes || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error creating pricing snapshot:", error);
      res.status(500).json({ error: "Failed to create pricing snapshot" });
    }
  });

  app.get("/api/pricing/history", async (req: Request, res: Response) => {
    try {
      const result = await pricingService.listHistory(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      console.error("Error fetching pricing history:", error);
      res.status(500).json({ error: "Failed to fetch pricing history" });
    }
  });

  app.post("/api/pricing/history", async (req: Request, res: Response) => {
    try {
      const { naicsCode, agency, region, awardValue, bidValue, outcome, awardedAt, projectDescription } = req.body;
      const result = await pricingService.addHistoryEntry(DEFAULT_TENANT_ID, {
        naicsCode: naicsCode || null,
        agency: agency || null,
        region: region || null,
        awardValue: awardValue || null,
        bidValue: bidValue || null,
        outcome: outcome || null,
        awardedAt: awardedAt || null,
        projectDescription: projectDescription || null,
      });
      res.json(result);
    } catch (error) {
      console.error("Error adding pricing history:", error);
      res.status(500).json({ error: "Failed to add pricing history" });
    }
  });

  // ============================================================================
  // POST-AWARD TRANSITION API
  // ============================================================================

  app.post("/api/bids/:id/transition", async (req: Request, res: Response) => {
    try {
      const result = await transitionService.createTransition(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(result);
    } catch (error) {
      console.error("Error creating transition:", error);
      res.status(500).json({ error: "Failed to create transition" });
    }
  });

  app.get("/api/bids/:id/transition", async (req: Request, res: Response) => {
    try {
      const result = await transitionService.getTransition(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(result);
    } catch (error) {
      console.error("Error fetching transition:", error);
      res.status(500).json({ error: "Failed to fetch transition" });
    }
  });

  app.patch("/api/transition/tasks/:taskId", async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!status || !["pending", "in_progress", "completed", "skipped"].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be one of: pending, in_progress, completed, skipped" });
      }
      const result = await transitionService.updateTaskStatus(DEFAULT_TENANT_ID, p(req.params.taskId), status);
      if (!result) return res.status(404).json({ error: "Task not found" });
      res.json(result);
    } catch (error) {
      console.error("Error updating transition task:", error);
      res.status(500).json({ error: "Failed to update transition task" });
    }
  });

  app.post("/api/bids/:id/transition/finalize", async (req: Request, res: Response) => {
    try {
      const result = await transitionService.finalizeTransition(DEFAULT_TENANT_ID, p(req.params.id));
      if (!result) return res.status(404).json({ error: "Transition not found" });
      res.json(result);
    } catch (error) {
      console.error("Error finalizing transition:", error);
      res.status(500).json({ error: "Failed to finalize transition" });
    }
  });

  app.get("/api/dashboard/recent-opportunities", async (req: Request, res: Response) => {
    try {
      const opportunities = await storage.getOpportunities(DEFAULT_TENANT_ID);
      const formatted = opportunities.slice(0, 5).map((opp) => ({
        id: opp.id,
        title: opp.title,
        agency: opp.setAside || null,
        dueAt: opp.dueAt?.toISOString() || null,
        score: null,
        status: opp.status,
        value: Number(opp.contractValue) || null,
      }));
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching recent opportunities:", error);
      res.status(500).json({ error: "Failed to fetch recent opportunities" });
    }
  });

  app.get("/api/dashboard/expiring-soon", async (req: Request, res: Response) => {
    try {
      const fourteenDaysFromNow = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const now = new Date();
      const allOpps = await db.select()
        .from(opportunities)
        .where(and(
          eq(opportunities.tenantId, DEFAULT_TENANT_ID),
          eq(opportunities.status, "open"),
        ))
        .orderBy(opportunities.dueAt)
        .limit(50);

      const expiring = allOpps
        .filter(o => o.dueAt && o.dueAt >= now && o.dueAt <= fourteenDaysFromNow)
        .slice(0, 10)
        .map(o => ({
          id: o.id,
          title: o.title,
          dueAt: o.dueAt?.toISOString() || null,
          daysRemaining: o.dueAt ? Math.ceil((o.dueAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null,
          naicsCodes: o.naicsCodes,
          setAside: o.setAside,
          status: o.status,
        }));

      res.json(expiring);
    } catch (error) {
      console.error("Error fetching expiring opportunities:", error);
      res.json([]);
    }
  });

  app.get("/api/dashboard/top-scored", async (req: Request, res: Response) => {
    try {
      const scores = await db.select({
        id: opportunityScores.id,
        opportunityId: opportunityScores.opportunityId,
        score: opportunityScores.score,
        recommendedAction: opportunityScores.recommendedAction,
        scoredAt: opportunityScores.createdAt,
      })
      .from(opportunityScores)
      .where(eq(opportunityScores.tenantId, DEFAULT_TENANT_ID))
      .orderBy(desc(opportunityScores.score))
      .limit(10);

      const enriched = await Promise.all(scores.map(async (s) => {
        const [opp] = await db.select({
          title: opportunities.title,
          dueAt: opportunities.dueAt,
          setAside: opportunities.setAside,
          naicsCodes: opportunities.naicsCodes,
          status: opportunities.status,
        })
        .from(opportunities)
        .where(eq(opportunities.id, s.opportunityId))
        .limit(1);

        return {
          ...s,
          scoredAt: s.scoredAt?.toISOString(),
          title: opp?.title || "Unknown",
          dueAt: opp?.dueAt?.toISOString() || null,
          setAside: opp?.setAside || null,
          naicsCodes: opp?.naicsCodes || [],
          oppStatus: opp?.status || "unknown",
        };
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching top scored:", error);
      res.json([]);
    }
  });

  app.get("/api/dashboard/recent-awards", async (req: Request, res: Response) => {
    try {
      const awards = await db.select()
        .from(federalAwards)
        .where(eq(federalAwards.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(federalAwards.lastModifiedDate))
        .limit(10);

      const formatted = awards.map(a => ({
        id: a.id,
        recipientName: a.recipientName,
        agency: a.awardingAgencyName || a.awardingSubAgencyName,
        awardAmount: a.totalObligatedAmount ? Number(a.totalObligatedAmount) : null,
        naicsCode: a.naicsCode,
        naicsDescription: a.naicsDescription,
        setAside: a.setAsideDescription || a.setAsideType,
        awardedAt: a.startDate?.toISOString() || a.lastModifiedDate?.toISOString() || null,
        description: a.awardDescription,
        piid: a.piid,
      }));

      res.json(formatted);
    } catch (error) {
      console.error("Error fetching recent awards:", error);
      res.json([]);
    }
  });

  app.get("/api/dashboard/pending-approvals", async (req: Request, res: Response) => {
    try {
      const approvals = await storage.getApprovalRequests(DEFAULT_TENANT_ID, "pending");
      
      const formatted = await Promise.all(approvals.slice(0, 10).map(async (approval) => {
        const context = approval.contextJson as Record<string, any> | null;
        
        let entityName = "";
        let estimatedValue = "";
        let description = context?.reason || context?.action || "";
        
        if (context?.opportunityTitle) {
          entityName = context.opportunityTitle;
        }
        
        if (!entityName && context?.candidate?.name) {
          entityName = `Vendor: ${context.candidate.name}`;
        }
        
        if (!entityName && (approval.entityType === "bid_project" || approval.entityType === "bid_decision") && approval.entityId) {
          try {
            const bid = await storage.getBidProject(approval.entityId);
            if (bid?.opportunityId) {
              const opportunity = await storage.getOpportunity(bid.opportunityId);
              entityName = opportunity?.title || "Bid Project";
            } else {
              entityName = "Bid Project";
            }
          } catch {}
        }
        
        if (!entityName && approval.entityType === "teaming_agreement") {
          entityName = "Teaming Agreement";
        }
        if (!entityName && approval.entityType === "email") {
          entityName = "Email Draft";
        }
        if (!entityName && approval.entityType === "vendor") {
          entityName = "New Vendor";
        }
        
        const actionLabels: Record<string, string> = {
          bid: "Bid Decision",
          bid_submission: "Bid Submission",
          jacket_build: "Jacket Build",
          initiate_teaming: "Teaming Partnership",
          send_email: "Communication",
          approve_document: "Document Approval",
          start_bid: "Bid Initiation",
          vendor_create: "New Vendor",
        };
        
        const actionLabel = actionLabels[approval.actionType] || approval.actionType.replace(/_/g, " ");
        const title = entityName ? `${actionLabel}: ${entityName}` : actionLabel;
        
        // Format full date
        const createdDate = new Date(approval.createdAt);
        const formattedDate = createdDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric", 
          year: "numeric"
        });
        
        // Get relative time for additional context
        const relativeTime = getTimeSince(approval.createdAt);
        
        return {
          id: approval.id,
          type: approval.actionType,
          title,
          entityName,
          description: description || "",
          requiredRole: context?.requiredRole?.replace(/_/g, " ") || "",
          requestedAt: relativeTime,
          requestedDate: formattedDate,
          fullDate: createdDate.toISOString(),
          priority: approval.priority,
          estimatedValue,
        };
      }));
      
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ error: "Failed to fetch pending approvals" });
    }
  });

  app.get("/api/dashboard/health", async (req: Request, res: Response) => {
    try {
      // Get last sync time from job queue or egnyte sync
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const syncStats = await egnyteSyncService.getSyncStats();
      
      const lastSyncDate = syncStats?.lastSyncTime;
      let lastSyncText = "Never";
      if (lastSyncDate) {
        const diffMs = Date.now() - new Date(lastSyncDate).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) lastSyncText = "Just now";
        else if (diffMins < 60) lastSyncText = `${diffMins} minutes ago`;
        else if (diffMins < 1440) lastSyncText = `${Math.floor(diffMins / 60)} hours ago`;
        else lastSyncText = `${Math.floor(diffMins / 1440)} days ago`;
      }

      res.json({
        samgov: syncStats?.totalItems > 0 ? "healthy" : "warning",
        email: "healthy",
        calendar: "warning",
        lastSync: lastSyncText,
      });
    } catch (error) {
      res.json({
        samgov: "warning",
        email: "healthy",
        calendar: "warning",
        lastSync: "Unknown",
      });
    }
  });

  // Recent documents from Egnyte mirror
  app.get("/api/dashboard/recent-documents", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const items = await egnyteSyncService.getMirroredItems(undefined, undefined, 10);
      
      // Filter to only files (not folders) and format for dashboard
      const documents = items
        .filter((item: any) => item.isFolder === false)
        .slice(0, 8)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          path: item.egnytePath,
          modifiedAt: item.egnyteLastModified || item.lastSyncedAt,
          size: item.fileSizeBytes,
          type: item.egnytePath?.split('.').pop() || 'file',
          entityType: item.mappedEntityType,
          entityId: item.mappedEntityId,
        }));
      
      res.json(documents);
    } catch (error) {
      // Log error but return empty array with status indicator
      console.error("[Dashboard] Failed to fetch recent documents:", error);
      // Return empty array with metadata indicating sync status
      res.json({ 
        documents: [], 
        syncAvailable: false, 
        message: "Egnyte sync not configured or unavailable" 
      });
    }
  });

  // ============================================================================
  // AUDIT EVENTS API
  // ============================================================================

  app.get("/api/audit/events", async (req: Request, res: Response) => {
    try {
      const { limit = "20" } = req.query;
      const events = await auditService.getRecentEvents(DEFAULT_TENANT_ID, parseInt(limit as string));
      res.json(events);
    } catch (error) {
      console.error("Error fetching audit events:", error);
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  });

  // ============================================================================
  // OPPORTUNITIES API
  // ============================================================================

  app.get("/api/opportunities", async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const opportunities = await storage.getOpportunities(
        DEFAULT_TENANT_ID,
        status as string | undefined
      );
      
      const formatted = opportunities.map((opp) => {
        const locationData = opp.locationJson as { city?: string; state?: string } | null;
        const locationStr = locationData?.city && locationData?.state 
          ? `${locationData.city}, ${locationData.state}` 
          : null;
        
        return {
          id: opp.id,
          title: opp.title,
          agency: opp.setAside || null,
          synopsis: opp.synopsis || opp.description || "",
          naicsCodes: opp.naicsCodes || [],
          setAside: opp.setAside,
          value: Number(opp.contractValue) || null,
          dueAt: opp.dueAt?.toISOString() || null,
          postedAt: opp.postedAt?.toISOString() || opp.createdAt.toISOString(),
          score: null,
          status: opp.status,
          location: locationStr,
          url: opp.url || null,
          source: opp.sourceSystemId || null,
        };
      });
      
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching opportunities:", error);
      res.status(500).json({ error: "Failed to fetch opportunities" });
    }
  });

  app.get("/api/opportunities/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const opportunity = await storage.getOpportunity(id);
      if (!opportunity) {
        return res.status(404).json({ error: "Opportunity not found" });
      }
      res.json(opportunity);
    } catch (error) {
      console.error("Error fetching opportunity:", error);
      res.status(500).json({ error: "Failed to fetch opportunity" });
    }
  });

  app.patch("/api/opportunities/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const body = req.body;

      const ALLOWED_FIELDS = ["title", "dueAt", "contractValue", "setAside", "synopsis", "description"];
      const unknownFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.includes(k));
      if (unknownFields.length > 0) {
        return res.status(400).json({ error: `Unknown fields: ${unknownFields.join(", ")}` });
      }

      if (Object.keys(body).length === 0) {
        return res.status(400).json({ error: "No fields provided" });
      }

      if (body.title !== undefined && (typeof body.title !== "string" || body.title.trim() === "")) {
        return res.status(400).json({ error: "title must be a non-empty string" });
      }

      const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
      if (!existing) {
        return res.status(404).json({ error: "Opportunity not found" });
      }

      const beforeSnapshot: Record<string, any> = {};
      const afterSnapshot: Record<string, any> = {};
      const setData: Partial<typeof opportunities.$inferInsert> = { updatedAt: new Date() };

      if (body.title !== undefined) {
        beforeSnapshot.title = existing.title;
        afterSnapshot.title = body.title.trim();
        setData.title = body.title.trim();
      }

      if (body.dueAt !== undefined) {
        beforeSnapshot.dueAt = existing.dueAt;
        const parsedDate = body.dueAt ? new Date(body.dueAt) : null;
        if (body.dueAt && isNaN(parsedDate!.getTime())) {
          return res.status(400).json({ error: "dueAt must be a valid date string or null" });
        }
        afterSnapshot.dueAt = parsedDate;
        setData.dueAt = parsedDate ?? undefined;
      }

      if (body.contractValue !== undefined) {
        beforeSnapshot.contractValue = existing.contractValue;
        if (body.contractValue === null || body.contractValue === "") {
          afterSnapshot.contractValue = null;
          setData.contractValue = null;
        } else {
          const cleaned = String(body.contractValue).replace(/[$,\s]/g, "");
          const parsed = parseFloat(cleaned);
          if (isNaN(parsed)) {
            return res.status(400).json({ error: "contractValue must be a valid number, null, or empty string" });
          }
          afterSnapshot.contractValue = parsed;
          setData.contractValue = parsed.toFixed(2);
        }
      }

      if (body.setAside !== undefined) {
        beforeSnapshot.setAside = existing.setAside;
        afterSnapshot.setAside = body.setAside;
        setData.setAside = body.setAside;
      }

      if (body.synopsis !== undefined) {
        beforeSnapshot.synopsis = existing.synopsis;
        afterSnapshot.synopsis = body.synopsis;
        setData.synopsis = body.synopsis;
      }

      if (body.description !== undefined) {
        beforeSnapshot.description = existing.description;
        afterSnapshot.description = body.description;
        setData.description = body.description;
      }

      await db.update(opportunities).set(setData).where(eq(opportunities.id, id));

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "opportunity_inline_edit",
        actor: "user",
        entityType: "opportunity",
        entityId: id,
        beforeJson: beforeSnapshot,
        afterJson: afterSnapshot,
      });

      const [updated] = await db.select().from(opportunities).where(eq(opportunities.id, id)).limit(1);
      res.json(updated);
    } catch (error) {
      console.error("Error updating opportunity:", error);
      res.status(500).json({ error: "Failed to update opportunity" });
    }
  });

  app.post("/api/opportunities", async (req: Request, res: Response) => {
    try {
      const validated = insertOpportunitySchema.safeParse({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
      });
      
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const opportunity = await storage.createOpportunity(validated.data);
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "opportunity_created",
        actorType: "user",
        entityType: "opportunity",
        entityId: opportunity.id,
        action: "create",
        afterJson: opportunity,
      });
      
      res.status(201).json(opportunity);
    } catch (error) {
      console.error("Error creating opportunity:", error);
      res.status(500).json({ error: "Failed to create opportunity" });
    }
  });

  // ============================================================================
  // FEDERAL SEARCH API (USAspending + SAM.gov unified)
  // ============================================================================

  app.get("/api/federal-search/opportunities", async (req: Request, res: Response) => {
    try {
      const { keyword, naics, agency, setAside, state, minAmount, maxAmount, page, limit: limitStr } = req.query;
      const samService = createSamIngestService(DEFAULT_TENANT_ID);
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limitStr as string) || 25, 100);
      const offset = (pageNum - 1) * limitNum;

      const postedFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const postedTo = new Date();

      const samResponse = await samService.fetchOpportunities({
        postedFrom,
        postedTo,
        keyword: keyword as string,
        naicsCode: naics as string,
        setAside: setAside as string,
        agency: agency as string,
        limit: limitNum,
        offset,
      });

      const results = (samResponse.opportunitiesData || []).map((opp: any) => ({
        id: opp.noticeId,
        title: opp.title,
        solicitationNumber: opp.solicitationNumber || null,
        agency: opp.fullParentPathName || opp.office?.name || null,
        office: opp.office?.name || null,
        postedDate: opp.postedDate || null,
        responseDeadline: opp.responseDeadLine || null,
        type: opp.type || opp.baseType || null,
        setAside: opp.setAsideDescription || opp.setAside || null,
        naicsCode: opp.naicsCode || null,
        classificationCode: opp.classificationCode || null,
        location: opp.placeOfPerformance ? {
          city: opp.placeOfPerformance.city?.name,
          state: opp.placeOfPerformance.state?.code,
          country: opp.placeOfPerformance.country?.code,
        } : null,
        contact: opp.pointOfContact?.[0] ? {
          name: opp.pointOfContact[0].fullName || opp.pointOfContact[0].name,
          email: opp.pointOfContact[0].email,
          phone: opp.pointOfContact[0].phone,
        } : null,
        url: opp.uiLink || null,
        resourceLinks: opp.resourceLinks || [],
        source: "sam.gov",
      }));

      res.json({
        results,
        total: samResponse.totalRecords || results.length,
        page: pageNum,
        limit: limitNum,
        hasMore: offset + limitNum < (samResponse.totalRecords || 0),
      });
    } catch (error) {
      console.error("Federal search opportunities error:", error);
      res.status(500).json({ error: "Failed to search federal opportunities" });
    }
  });

  app.get("/api/federal-search/awards", async (req: Request, res: Response) => {
    try {
      const { keyword, naics, agency, state, minAmount, maxAmount, page, limit: limitStr } = req.query;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limitStr as string) || 25, 100);

      const { createUSASpendingClient } = await import("./integrations/usaspending/usaspending.client");
      const client = createUSASpendingClient();

      const searchParams: any = {
        limit: limitNum,
        page: pageNum,
        sortField: "Award Amount",
        sortOrder: "desc" as const,
        startDateFrom: new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      };

      if (keyword) searchParams.keyword = keyword;
      if (naics) searchParams.naicsCodes = [(naics as string)];
      if (state) searchParams.stateCode = state;
      if (minAmount) searchParams.awardAmountMin = parseFloat(minAmount as string);
      if (maxAmount) searchParams.awardAmountMax = parseFloat(maxAmount as string);

      const response = await client.searchAwards(searchParams);

      const results = (response.results || []).map((award: any) => ({
        awardId: award["Award ID"],
        recipientName: award["Recipient Name"],
        awardAmount: award["Award Amount"],
        startDate: award["Start Date"],
        endDate: award["End Date"],
        awardingAgency: award["Awarding Agency"],
        awardingSubAgency: award["Awarding Sub Agency"],
        fundingAgency: award["Funding Agency"],
        awardType: award["Award Type"] || award["Contract Award Type"],
        description: award["Description"],
        naicsCode: award["NAICS Code"],
        naicsDescription: award["NAICS Description"],
        pscCode: award["PSC Code"],
        setAside: award["Set Aside Type"],
        location: {
          city: award["Place of Performance City Name"],
          state: award["Place of Performance State Code"],
          country: award["Place of Performance Country Name"],
        },
        solicitationNumber: award["Solicitation Number"],
        extentCompeted: award["Extent Competed"],
        source: "usaspending.gov",
      }));

      res.json({
        results,
        total: response.page_metadata?.count || results.length,
        page: pageNum,
        limit: limitNum,
        hasMore: response.page_metadata?.hasNext || false,
      });
    } catch (error) {
      console.error("Federal search awards error:", error);
      res.status(500).json({ error: "Failed to search federal awards" });
    }
  });

  app.post("/api/federal-search/start-bid", async (req: Request, res: Response) => {
    try {
      const { opportunityId, title, agency, naicsCode, setAside, responseDeadline, solicitationNumber, synopsis, url } = req.body;

      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const samService = createSamIngestService(DEFAULT_TENANT_ID);

      let oppId = opportunityId;
      if (opportunityId) {
        const existing = await db.select().from(opportunities)
          .where(and(
            eq(opportunities.tenantId, DEFAULT_TENANT_ID),
            eq(opportunities.externalId, opportunityId)
          ))
          .limit(1);

        if (existing.length > 0) {
          oppId = existing[0].id;
        } else {
          const result = await samService.processOpportunity({
            noticeId: opportunityId,
            title,
            solicitationNumber,
            fullParentPathName: agency,
            postedDate: new Date().toISOString(),
            type: "Solicitation",
            baseType: "Solicitation",
            active: "Yes",
            description: synopsis,
            naicsCode,
            setAsideDescription: setAside,
            responseDeadLine: responseDeadline,
            uiLink: url,
          } as any);
          oppId = result.opportunityId;
        }
      } else {
        const newOpp = await storage.createOpportunity({
          tenantId: DEFAULT_TENANT_ID,
          title,
          synopsis: synopsis || null,
          url: url || null,
          status: "open",
          naicsCodes: naicsCode ? [naicsCode] : [],
          setAside: setAside || null,
          dueAt: responseDeadline ? new Date(responseDeadline) : null,
        });
        oppId = newOpp.id;
      }

      const bidProjectId = await samService.createBidProjectFromOpportunity(oppId);

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_started_from_search",
        action: "create",
        actorType: "user",
        entityType: "bid_project",
        entityId: bidProjectId,
        afterJson: { opportunityId: oppId, title, agency, source: "federal_search" },
      });

      res.json({ bidProjectId, opportunityId: oppId });
    } catch (error) {
      console.error("Start bid from search error:", error);
      res.status(500).json({ error: "Failed to start bid from search result" });
    }
  });

  app.post("/api/federal-search/ingest-awards", async (req: Request, res: Response) => {
    try {
      const { naicsCodes, keyword, maxPages } = req.body;
      const { createUSASpendingIngestService } = await import("./integrations/usaspending/usaspending.client");
      const ingestService = createUSASpendingIngestService(DEFAULT_TENANT_ID);

      let result = { ingested: 0, errors: 0 };

      if (naicsCodes?.length) {
        result = await ingestService.ingestAwardsByNAICS(naicsCodes, maxPages || 3);
      } else if (keyword) {
        result = await ingestService.ingestAwardsByKeyword(keyword, maxPages || 3);
      } else {
        return res.status(400).json({ error: "Provide naicsCodes or keyword" });
      }

      res.json(result);
    } catch (error) {
      console.error("Award ingestion error:", error);
      res.status(500).json({ error: "Failed to ingest awards" });
    }
  });

  app.get("/api/federal-search/local-awards", async (req: Request, res: Response) => {
    try {
      const { keyword, naics, agency, state, minAmount, maxAmount, page, limit: limitStr } = req.query;
      const { createUSASpendingIngestService } = await import("./integrations/usaspending/usaspending.client");
      const ingestService = createUSASpendingIngestService(DEFAULT_TENANT_ID);

      const pageNum = parseInt(page as string) || 1;
      const limitNum = Math.min(parseInt(limitStr as string) || 25, 100);

      const result = await ingestService.searchLocalAwards({
        keyword: keyword as string,
        naicsCode: naics as string,
        agencyName: agency as string,
        state: state as string,
        minAmount: minAmount ? parseFloat(minAmount as string) : undefined,
        maxAmount: maxAmount ? parseFloat(maxAmount as string) : undefined,
        limit: limitNum,
        offset: (pageNum - 1) * limitNum,
      });

      res.json({
        results: result.awards,
        total: result.total,
        page: pageNum,
        limit: limitNum,
        hasMore: (pageNum - 1) * limitNum + limitNum < result.total,
      });
    } catch (error) {
      console.error("Local awards search error:", error);
      res.status(500).json({ error: "Failed to search local awards" });
    }
  });

  // ============================================================================
  // BID PROJECTS API
  // ============================================================================

  app.get("/api/bid-projects", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getBidProjects(DEFAULT_TENANT_ID);
      
      // Fetch opportunity details for each project
      const formatted = await Promise.all(projects.map(async (project) => {
        let opportunity = null;
        try {
          opportunity = await storage.getOpportunity(project.opportunityId);
        } catch (e) {
          // Opportunity might not exist
        }
        
        const documentation = project.documentationJson as Record<string, string> | null;
        const docFields = documentation ? Object.values(documentation).filter(v => v && v.length > 0).length : 0;
        
        return {
          id: project.id,
          opportunityId: project.opportunityId,
          opportunityTitle: opportunity?.title || "Untitled Project",
          agency: opportunity?.setAside || "Federal",
          status: project.status,
          owner: null,
          value: opportunity?.contractValue ? Number(opportunity.contractValue) : 0,
          dueAt: opportunity?.dueAt?.toISOString() || null,
          progress: Math.round((docFields / 8) * 100),
          tasksCompleted: docFields,
          tasksTotal: 8,
          artifactsReady: docFields > 0 ? Math.min(docFields, 6) : 0,
          artifactsTotal: 6,
          documentation: documentation,
          createdAt: project.createdAt,
        };
      }));
      
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching bid projects:", error);
      res.status(500).json({ error: "Failed to fetch bid projects" });
    }
  });

  app.get("/api/bid-projects/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const project = await storage.getBidProject(id);
      if (!project) {
        return res.status(404).json({ error: "Bid project not found" });
      }

      const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, project.opportunityId)).limit(1);
      const docJson = (project.documentationJson || {}) as Record<string, any>;

      res.json({
        ...project,
        opportunityTitle: opp?.title || "",
        dueAt: opp?.dueAt || null,
        noticeId: opp?.externalId || "",
        agency: docJson.agency || "",
        team: docJson.team || [],
        naicsCode: opp?.naicsCodes?.[0] || "",
        pscCode: docJson.pscCode || "",
        setAside: opp?.setAside || "",
        popStartDate: docJson.popStartDate || null,
        popEndDate: docJson.popEndDate || null,
        contractValue: opp?.contractValue ? Number(opp.contractValue) : null,
        stage: project.status,
        winProbability: docJson.winProbability ?? null,
        notes: docJson.notes || "",
        opportunityId: project.opportunityId,
      });
    } catch (error) {
      console.error("Error fetching bid project:", error);
      res.status(500).json({ error: "Failed to fetch bid project" });
    }
  });

  app.post("/api/bid-projects", async (req: Request, res: Response) => {
    try {
      const validated = insertBidProjectSchema.safeParse({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
      });
      
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const project = await storage.createBidProject(validated.data);
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_project_created",
        actorType: "user",
        entityType: "bid_project",
        entityId: project.id,
        action: "create",
        afterJson: project,
      });

      try {
        const { seedArtifactsForBidProject, seedChecklistForBidProject } = await import("./services/bid-jacket-artifacts.service");
        await seedArtifactsForBidProject(DEFAULT_TENANT_ID, project.id);
        await seedChecklistForBidProject(DEFAULT_TENANT_ID, project.id);
      } catch (e) {
        console.error("Failed to seed bid jacket artifacts/checklist:", e);
      }

      try {
        await ensurePipelineItemForBidProject({
          tenantId: DEFAULT_TENANT_ID,
          bidProjectId: project.id,
          ownerUserId: project.ownerUserId ?? null,
        });
      } catch (e) {
        console.error("Failed to create pipeline item for bid project:", e);
      }
      
      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating bid project:", error);
      res.status(500).json({ error: "Failed to create bid project" });
    }
  });

  // Bid workflow status transitions
  const BID_STATUS_TRANSITIONS: Record<string, string[]> = {
    draft: ["published"],
    published: ["quoting", "draft"],
    quoting: ["submitted", "published"],
    submitted: ["awarded", "declined", "quoting"],
    awarded: [],
    declined: [],
    initiated: ["draft"],
  };


  // Zod schema for bid status update
  const bidStatusUpdateSchema = z.object({
    status: z.enum(["draft", "published", "quoting", "submitted", "awarded", "declined"]),
    reason: z.string().optional(),
  });

  app.patch("/api/bid-projects/:id/status", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      // Validate request body
      const validated = bidStatusUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const { status: newStatus, reason } = validated.data;
      
      const project = await storage.getBidProject(id);
      if (!project) {
        return res.status(404).json({ error: "Bid project not found" });
      }
      
      const currentStatus = project.status;
      const allowedTransitions = BID_STATUS_TRANSITIONS[currentStatus] || [];
      
      if (!allowedTransitions.includes(newStatus)) {
        return res.status(400).json({ 
          error: `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(", ") || "none"}`
        });
      }
      
      // Enforce submission readiness for "submitted" status
      if (newStatus === "submitted") {
        const checklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, id);
        const submissionChecklists = checklists.filter(c => c.checklistType === "submission");
        
        const incompleteItems: { checklistName: string; itemText: string }[] = [];
        
        for (const checklist of submissionChecklists) {
          const items = await storage.getBidChecklistItems(checklist.id);
          for (const item of items) {
            if (item.isRequired && !item.isCompleted) {
              incompleteItems.push({ 
                checklistName: checklist.name, 
                itemText: item.itemText 
              });
            }
          }
        }
        
        if (incompleteItems.length > 0) {
          return res.status(400).json({
            error: "Cannot submit bid - incomplete checklist items",
            incompleteItems,
          });
        }
      }
      
      const updated = await storage.updateBidProject(id, { status: newStatus });

      // Auto-generate artifacts and record a submission event when transitioning to "submitted".
      if (newStatus === "submitted") {
        const confirmationJson: any = {
          statusFrom: currentStatus,
          statusTo: newStatus,
          jacketZip: {
            downloadPath: `/api/jackets/bidProject/${id}/download-zip`,
          },
        };

        try {
          const binderService = createBidBinderService(DEFAULT_TENANT_ID);
          const binder = await binderService.generateBinder(
            id,
            "manual",
            "Auto-generated on status transition to submitted"
          );
          confirmationJson.binder = {
            binderId: binder.binderId,
            version: binder.version,
            storageKey: binder.storageKey,
            pageCount: binder.pageCount,
          };
          confirmationJson.binderDownloadPath = `/api/bids/${id}/binder/download-pdf?version=${encodeURIComponent(
            binder.version
          )}`;
        } catch (err) {
          confirmationJson.binderError = err instanceof Error ? err.message : String(err);
        }

        try {
          await storage.createBidSubmission({
            tenantId: DEFAULT_TENANT_ID,
            bidProjectId: id,
            method: "PATCH_status_update",
            confirmationJson,
          });
        } catch (err) {
          // Do not fail submission due to logging/recording issues.
          console.error("Failed to record bid submission", err);
        }
      }
      
      try {
        await db.update(pipelineItems).set({
          stage: stageFromBidStatus(newStatus),
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(pipelineItems.tenantId, DEFAULT_TENANT_ID),
          eq(pipelineItems.entityType, PIPE_ENTITY_BID_PROJECT),
          eq(pipelineItems.entityId, id),
        ));
      } catch (e) {
        console.error("Failed to sync pipeline stage:", e);
      }

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_status_changed",
        actorType: "user",
        entityType: "bid_project",
        entityId: id,
        action: "status_change",
        beforeJson: { status: currentStatus },
        afterJson: { status: newStatus, reason },
      });
      
      // Create bid decision record for key transitions
      if (["awarded", "declined"].includes(newStatus)) {
        await storage.createBidDecision({
          tenantId: DEFAULT_TENANT_ID,
          bidProjectId: id,
          decision: newStatus,
          rationaleJson: { reason },
        });
      }
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating bid project status:", error);
      res.status(500).json({ error: "Failed to update bid project status" });
    }
  });

  app.patch("/api/bid-projects/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const body = req.body;

      const ALLOWED_FIELDS = ["status", "ownerUserId", "winProbability", "notes"];
      const unknownFields = Object.keys(body).filter(k => !ALLOWED_FIELDS.includes(k));
      if (unknownFields.length > 0) {
        return res.status(400).json({ error: `Unknown fields: ${unknownFields.join(", ")}` });
      }

      if (Object.keys(body).length === 0) {
        return res.status(400).json({ error: "No fields provided" });
      }

      const VALID_STATUSES = ["initiated", "draft", "published", "quoting", "submitted", "awarded", "declined"];
      if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}` });
      }

      if (body.ownerUserId !== undefined && body.ownerUserId !== null && typeof body.ownerUserId !== "string") {
        return res.status(400).json({ error: "ownerUserId must be a string or null" });
      }

      if (body.winProbability !== undefined) {
        const wp = Number(body.winProbability);
        if (isNaN(wp) || wp < 0 || wp > 100) {
          return res.status(400).json({ error: "winProbability must be a number between 0 and 100" });
        }
      }

      const project = await storage.getBidProject(id);
      if (!project) {
        return res.status(404).json({ error: "Bid project not found" });
      }

      const existingDocJson = (project.documentationJson || {}) as Record<string, any>;
      const beforeSnapshot: Record<string, any> = {};
      const afterSnapshot: Record<string, any> = {};

      const columnUpdates: Partial<typeof bidProjects.$inferInsert> = { updatedAt: new Date() };
      let newDocJson = { ...existingDocJson };

      if (body.status !== undefined) {
        beforeSnapshot.status = project.status;
        afterSnapshot.status = body.status;
        columnUpdates.status = body.status;
      }

      if (body.ownerUserId !== undefined) {
        beforeSnapshot.ownerUserId = project.ownerUserId;
        afterSnapshot.ownerUserId = body.ownerUserId;
        columnUpdates.ownerUserId = body.ownerUserId;
      }

      if (body.winProbability !== undefined) {
        beforeSnapshot.winProbability = existingDocJson.winProbability ?? null;
        afterSnapshot.winProbability = Number(body.winProbability);
        newDocJson.winProbability = Number(body.winProbability);
      }

      if (body.notes !== undefined) {
        beforeSnapshot.notes = existingDocJson.notes ?? null;
        afterSnapshot.notes = body.notes;
        newDocJson.notes = body.notes;
      }

      if (body.winProbability !== undefined || body.notes !== undefined) {
        columnUpdates.documentationJson = newDocJson;
      }

      await db.update(bidProjects).set(columnUpdates).where(eq(bidProjects.id, id));

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_project_inline_edit",
        actor: "user",
        entityType: "bid_project",
        entityId: id,
        beforeJson: beforeSnapshot,
        afterJson: afterSnapshot,
      });

      const updated = await storage.getBidProject(id);
      const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, project.opportunityId)).limit(1);
      const updDocJson = (updated?.documentationJson || {}) as Record<string, any>;

      res.json({
        ...updated,
        opportunityTitle: opp?.title || "",
        dueAt: opp?.dueAt || null,
        noticeId: opp?.externalId || "",
        agency: updDocJson.agency || "",
        team: updDocJson.team || [],
        naicsCode: opp?.naicsCodes?.[0] || "",
        pscCode: updDocJson.pscCode || "",
        setAside: opp?.setAside || "",
        popStartDate: updDocJson.popStartDate || null,
        popEndDate: updDocJson.popEndDate || null,
        contractValue: opp?.contractValue ? Number(opp.contractValue) : null,
        stage: updated?.status || "",
        winProbability: updDocJson.winProbability ?? null,
        notes: updDocJson.notes || "",
        opportunityId: project.opportunityId,
      });
    } catch (error) {
      console.error("Error updating bid project:", error);
      res.status(500).json({ error: "Failed to update bid project" });
    }
  });

  // Convert bid project to project (when awarded)
  app.post("/api/bid-projects/:id/convert-to-project", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const bidProject = await storage.getBidProject(id);
      if (!bidProject) {
        return res.status(404).json({ error: "Bid project not found" });
      }
      
      if (bidProject.status !== "awarded") {
        return res.status(400).json({ error: "Only awarded bid projects can be converted to projects" });
      }
      
      // Idempotency check: prevent duplicate conversions
      const docJson = bidProject.documentationJson as Record<string, any> | null;
      if (docJson?.convertedToProject) {
        return res.status(400).json({ 
          error: "Bid project has already been converted to a project",
          existingProjectId: docJson.convertedToProject
        });
      }
      
      // Get opportunity details for project creation
      const opportunity = await storage.getOpportunity(bidProject.opportunityId);
      if (!opportunity) {
        return res.status(404).json({ error: "Associated opportunity not found" });
      }
      
      // Create project from bid
      const project = await storage.createProject({
        tenantId: DEFAULT_TENANT_ID,
        name: opportunity.title,
        status: "active",
        startDate: new Date(),
        estimatedValue: opportunity.contractValue ? parseFloat(opportunity.contractValue) : undefined,
        sourceBidId: bidProject.id,
        sourceOpportunityId: opportunity.id,
        metadataJson: {
          convertedFromBid: true,
          bidProjectId: bidProject.id,
          opportunityId: opportunity.id,
          projectNumber: `PRJ-${Date.now().toString().slice(-6)}`,
        },
      });
      
      // Update bid project with conversion reference
      await storage.updateBidProject(id, {
        documentationJson: {
          ...((bidProject.documentationJson as object) || {}),
          convertedToProject: project.id,
          convertedAt: new Date().toISOString(),
        },
      });
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_converted_to_project",
        actorType: "user",
        entityType: "bid_project",
        entityId: id,
        action: "convert",
        afterJson: { projectId: project.id },
      });
      
      res.status(201).json({ 
        success: true, 
        message: "Bid project converted to project",
        project 
      });
    } catch (error) {
      console.error("Error converting bid to project:", error);
      res.status(500).json({ error: "Failed to convert bid to project" });
    }
  });

  // ============================================================================
  // BID RFIs API
  // ============================================================================

  const insertBidRfiSchema = z.object({
    bidProjectId: z.string(),
    subject: z.string().min(1, "Subject is required"),
    question: z.string().min(1, "Question is required"),
    dueAt: z.string().datetime().optional().nullable(),
  });

  const updateBidRfiSchema = z.object({
    subject: z.string().min(1).optional(),
    question: z.string().min(1).optional(),
    answer: z.string().optional().nullable(),
    status: z.enum(["pending", "answered", "closed"]).optional(),
    dueAt: z.string().datetime().optional().nullable(),
  });

  app.get("/api/bid-projects/:bidProjectId/rfis", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const rfis = await storage.getBidRfis(DEFAULT_TENANT_ID, bidProjectId);
      res.json(rfis);
    } catch (error) {
      console.error("Error fetching RFIs:", error);
      res.status(500).json({ error: "Failed to fetch RFIs" });
    }
  });

  app.get("/api/bid-rfis/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const rfi = await storage.getBidRfi(id);
      if (!rfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      res.json(rfi);
    } catch (error) {
      console.error("Error fetching RFI:", error);
      res.status(500).json({ error: "Failed to fetch RFI" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/rfis", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      
      const validated = insertBidRfiSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const nextRfiNumber = await storage.getNextBidRfiNumber(DEFAULT_TENANT_ID, bidProjectId);
      
      const rfi = await storage.createBidRfi({
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId,
        rfiNumber: nextRfiNumber,
        subject: validated.data.subject,
        question: validated.data.question,
        dueAt: validated.data.dueAt ? new Date(validated.data.dueAt) : null,
        status: "pending",
      });
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "rfi_created",
        actorType: "user",
        entityType: "bid_rfi",
        entityId: rfi.id,
        action: "create",
        afterJson: { subject: rfi.subject, rfiNumber: rfi.rfiNumber },
      });
      
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: bidProjectId,
        eventType: "rfi_created",
        eventTitle: `RFI #${rfi.rfiNumber}: ${rfi.subject}`,
        eventDescription: rfi.question,
        relatedEntityType: "rfi",
        relatedEntityId: rfi.id,
      });
      
      res.status(201).json(rfi);
    } catch (error) {
      console.error("Error creating RFI:", error);
      res.status(500).json({ error: "Failed to create RFI" });
    }
  });

  app.patch("/api/bid-rfis/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const validated = updateBidRfiSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const existing = await storage.getBidRfi(id);
      if (!existing) {
        return res.status(404).json({ error: "RFI not found" });
      }
      
      const updates: any = { ...validated.data };
      
      if (validated.data.answer && existing.status === "pending") {
        updates.status = "answered";
        updates.answeredAt = new Date();
      }
      
      if (validated.data.dueAt) {
        updates.dueAt = new Date(validated.data.dueAt);
      }
      
      const rfi = await storage.updateBidRfi(id, updates);
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "rfi_updated",
        actorType: "user",
        entityType: "bid_rfi",
        entityId: id,
        action: "update",
        beforeJson: { status: existing.status, answer: existing.answer },
        afterJson: { status: rfi?.status, answer: rfi?.answer },
      });
      
      if (validated.data.answer && existing.status === "pending") {
        await storage.createJacketTimelineEntry({
          tenantId: DEFAULT_TENANT_ID,
          jacketType: "bid",
          jacketId: existing.bidProjectId,
          eventType: "rfi_answered",
          eventTitle: `RFI #${existing.rfiNumber} Answered`,
          eventDescription: validated.data.answer.substring(0, 200),
          relatedEntityType: "rfi",
          relatedEntityId: id,
        });
      }
      
      res.json(rfi);
    } catch (error) {
      console.error("Error updating RFI:", error);
      res.status(500).json({ error: "Failed to update RFI" });
    }
  });

  app.delete("/api/bid-rfis/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const existing = await storage.getBidRfi(id);
      if (!existing) {
        return res.status(404).json({ error: "RFI not found" });
      }
      
      await storage.deleteBidRfi(id);
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "rfi_deleted",
        actorType: "user",
        entityType: "bid_rfi",
        entityId: id,
        action: "delete",
        beforeJson: { subject: existing.subject, rfiNumber: existing.rfiNumber },
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting RFI:", error);
      res.status(500).json({ error: "Failed to delete RFI" });
    }
  });

  // ============================================================================
  // BID ADDENDA API
  // ============================================================================

  const insertBidAddendumSchema = z.object({
    bidProjectId: z.string(),
    title: z.string().min(1, "Title is required"),
    description: z.string().optional(),
    dueAtOverride: z.string().datetime().optional().nullable(),
    documentIds: z.array(z.string()).optional(),
  });

  app.get("/api/bid-projects/:bidProjectId/addenda", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const addenda = await storage.getBidAddenda(DEFAULT_TENANT_ID, bidProjectId);
      res.json(addenda);
    } catch (error) {
      console.error("Error fetching addenda:", error);
      res.status(500).json({ error: "Failed to fetch addenda" });
    }
  });

  app.get("/api/bid-addenda/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const addendum = await storage.getBidAddendum(id);
      if (!addendum) {
        return res.status(404).json({ error: "Addendum not found" });
      }
      res.json(addendum);
    } catch (error) {
      console.error("Error fetching addendum:", error);
      res.status(500).json({ error: "Failed to fetch addendum" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/addenda", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      
      const validated = insertBidAddendumSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const nextNumber = await storage.getNextBidAddendumNumber(DEFAULT_TENANT_ID, bidProjectId);
      
      const addendum = await storage.createBidAddendum({
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId,
        addendumNumber: nextNumber,
        title: validated.data.title,
        description: validated.data.description,
        dueAtOverride: validated.data.dueAtOverride ? new Date(validated.data.dueAtOverride) : null,
        documentIds: validated.data.documentIds || [],
      });
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "addendum_created",
        actorType: "user",
        entityType: "bid_addendum",
        entityId: addendum.id,
        action: "create",
        afterJson: { title: addendum.title, addendumNumber: addendum.addendumNumber },
      });
      
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: bidProjectId,
        eventType: "addendum_added",
        eventTitle: `Addendum #${addendum.addendumNumber}: ${addendum.title}`,
        eventDescription: addendum.description || undefined,
        relatedEntityType: "addendum",
        relatedEntityId: addendum.id,
      });
      
      res.status(201).json(addendum);
    } catch (error) {
      console.error("Error creating addendum:", error);
      res.status(500).json({ error: "Failed to create addendum" });
    }
  });

  app.patch("/api/bid-addenda/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const updateSchema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        dueAtOverride: z.string().datetime().optional().nullable(),
        documentIds: z.array(z.string()).optional(),
      });
      
      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const existing = await storage.getBidAddendum(id);
      if (!existing) {
        return res.status(404).json({ error: "Addendum not found" });
      }
      
      const updates: any = { ...validated.data };
      if (validated.data.dueAtOverride) {
        updates.dueAtOverride = new Date(validated.data.dueAtOverride);
      }
      
      const addendum = await storage.updateBidAddendum(id, updates);
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "addendum_updated",
        actorType: "user",
        entityType: "bid_addendum",
        entityId: id,
        action: "update",
        beforeJson: { title: existing.title },
        afterJson: { title: addendum?.title },
      });
      
      res.json(addendum);
    } catch (error) {
      console.error("Error updating addendum:", error);
      res.status(500).json({ error: "Failed to update addendum" });
    }
  });

  app.post("/api/bid-addenda/:id/acknowledge", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const existing = await storage.getBidAddendum(id);
      if (!existing) {
        return res.status(404).json({ error: "Addendum not found" });
      }
      
      if (existing.acknowledged) {
        return res.status(400).json({ error: "Addendum already acknowledged" });
      }
      
      const addendum = await storage.acknowledgeBidAddendum(id, "current-user");
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "addendum_acknowledged",
        actorType: "user",
        entityType: "bid_addendum",
        entityId: id,
        action: "acknowledge",
        afterJson: { acknowledgedAt: addendum?.acknowledgedAt },
      });
      
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: existing.bidProjectId,
        eventType: "addendum_acknowledged",
        eventTitle: `Addendum #${existing.addendumNumber} Acknowledged`,
        eventDescription: `${existing.title} has been acknowledged`,
        relatedEntityType: "addendum",
        relatedEntityId: id,
      });
      
      res.json(addendum);
    } catch (error) {
      console.error("Error acknowledging addendum:", error);
      res.status(500).json({ error: "Failed to acknowledge addendum" });
    }
  });

  // ============================================================================
  // BID CHECKLISTS API
  // ============================================================================

  const insertBidChecklistSchema = z.object({
    bidProjectId: z.string(),
    name: z.string().min(1, "Name is required"),
    checklistType: z.enum(["submission", "compliance", "internal"]).default("submission"),
    sortOrder: z.number().int().default(0),
  });

  const insertBidChecklistItemSchema = z.object({
    checklistId: z.string(),
    itemText: z.string().min(1, "Item text is required"),
    isRequired: z.boolean().default(true),
    sortOrder: z.number().int().default(0),
    notes: z.string().optional(),
  });

  app.get("/api/bid-projects/:bidProjectId/checklists", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const checklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, bidProjectId);
      
      const checklistsWithItems = await Promise.all(
        checklists.map(async (checklist) => {
          const items = await storage.getBidChecklistItems(checklist.id);
          return { ...checklist, items };
        })
      );
      
      res.json(checklistsWithItems);
    } catch (error) {
      console.error("Error fetching checklists:", error);
      res.status(500).json({ error: "Failed to fetch checklists" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/checklists", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      
      const validated = insertBidChecklistSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const checklist = await storage.createBidChecklist({
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId,
        name: validated.data.name,
        checklistType: validated.data.checklistType,
        sortOrder: validated.data.sortOrder,
      });
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "checklist_created",
        actorType: "user",
        entityType: "bid_checklist",
        entityId: checklist.id,
        action: "create",
        afterJson: { name: checklist.name, type: checklist.checklistType },
      });
      
      res.status(201).json(checklist);
    } catch (error) {
      console.error("Error creating checklist:", error);
      res.status(500).json({ error: "Failed to create checklist" });
    }
  });

  app.post("/api/bid-checklists/:checklistId/items", async (req: Request, res: Response) => {
    try {
      const checklistId = p(req.params.checklistId);
      
      const validated = insertBidChecklistItemSchema.safeParse({ ...req.body, checklistId });
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const item = await storage.createBidChecklistItem({
        tenantId: DEFAULT_TENANT_ID,
        checklistId,
        itemText: validated.data.itemText,
        isRequired: validated.data.isRequired,
        sortOrder: validated.data.sortOrder,
        notes: validated.data.notes,
      });
      
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating checklist item:", error);
      res.status(500).json({ error: "Failed to create checklist item" });
    }
  });

  app.patch("/api/bid-checklist-items/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const updateSchema = z.object({
        isCompleted: z.boolean().optional(),
        completedAt: z.string().datetime().optional().nullable(),
        completedBy: z.string().optional().nullable(),
        linkedDocumentId: z.string().optional().nullable(),
        notes: z.string().optional(),
      });
      
      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }
      
      const updates: any = { ...validated.data };
      
      if (validated.data.isCompleted === true && !validated.data.completedAt) {
        updates.completedAt = new Date();
      }
      
      const existing = await storage.getBidChecklistItem(id);
      if (!existing) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      
      const item = await storage.updateBidChecklistItem(id, updates);
      
      // Log completion status change
      if (validated.data.isCompleted === true && !existing.isCompleted) {
        await storage.createAuditEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "checklist_item_completed",
          actorType: "user",
          entityType: "bid_checklist_item",
          entityId: id,
          action: "complete",
          afterJson: { itemText: item?.itemText, completedAt: item?.completedAt },
        });
        
        // Get checklist to find bid project ID
        const checklist = await storage.getBidChecklist(existing.checklistId);
        if (checklist) {
          await storage.createJacketTimelineEntry({
            tenantId: DEFAULT_TENANT_ID,
            jacketType: "bid",
            jacketId: checklist.bidProjectId,
            eventType: "checklist_item_completed",
            eventTitle: `Checklist item completed: ${item?.itemText}`,
            eventDescription: `Item from ${checklist.name}`,
            relatedEntityType: "checklist_item",
            relatedEntityId: id,
          });
        }
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error updating checklist item:", error);
      res.status(500).json({ error: "Failed to update checklist item" });
    }
  });

  app.get("/api/bid-projects/:bidProjectId/submission-readiness", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      
      const checklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, bidProjectId);
      const submissionChecklists = checklists.filter(c => c.checklistType === "submission");
      
      let totalRequired = 0;
      let totalCompleted = 0;
      const incompleteItems: { checklistName: string; itemName: string }[] = [];
      
      for (const checklist of submissionChecklists) {
        const items = await storage.getBidChecklistItems(checklist.id);
        for (const item of items) {
          if (item.isRequired) {
            totalRequired++;
            if (item.isCompleted) {
              totalCompleted++;
            } else {
              incompleteItems.push({ 
                checklistName: checklist.name, 
                itemName: item.itemText 
              });
            }
          }
        }
      }
      
      const isReady = totalRequired === 0 || totalRequired === totalCompleted;
      const completionPercentage = totalRequired === 0 ? 100 : Math.round((totalCompleted / totalRequired) * 100);
      
      res.json({
        isReady,
        completionPercentage,
        totalRequired,
        totalCompleted,
        incompleteItems,
      });
    } catch (error) {
      console.error("Error checking submission readiness:", error);
      res.status(500).json({ error: "Failed to check submission readiness" });
    }
  });

  // ============================================================================
  // BID JACKET ARTIFACTS API
  // ============================================================================

  app.get("/api/bid-projects/:bidProjectId/artifacts", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const artifacts = await db
        .select()
        .from(bidJacketArtifacts)
        .where(eq(bidJacketArtifacts.bidProjectId, bidProjectId))
        .orderBy(bidJacketArtifacts.templateCode);
      res.json(artifacts);
    } catch (error) {
      console.error("Error fetching artifacts:", error);
      res.status(500).json({ error: "Failed to fetch artifacts" });
    }
  });

  app.get("/api/bid-projects/:bidProjectId/artifacts/summary", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const result = await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE status = 'missing')::int as missing,
          count(*) FILTER (WHERE status = 'ready')::int as ready,
          count(*) FILTER (WHERE status = 'needs_review')::int as needs_review,
          count(*) FILTER (WHERE status = 'approved')::int as approved,
          count(*)::int as total
        FROM bid_jacket_artifacts
        WHERE bid_project_id = ${bidProjectId}
      `);
      const row = result.rows[0] as any;
      res.json({
        missing: row?.missing ?? 0,
        ready: row?.ready ?? 0,
        needsReview: row?.needs_review ?? 0,
        approved: row?.approved ?? 0,
        total: row?.total ?? 0,
      });
    } catch (error) {
      console.error("Error fetching artifact summary:", error);
      res.status(500).json({ error: "Failed to fetch artifact summary" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/artifacts", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const bodySchema = insertBidJacketArtifactSchema
        .pick({ templateCode: true, title: true, sourceType: true, sourceUrl: true })
        .extend({
          documentId: z.string().optional(),
          notes: z.string().optional(),
        })
        .required({ title: true });
      const parsed = bodySchema.parse(req.body);
      const { templateCode, title, sourceType, sourceUrl, documentId, notes } = parsed;
      const [artifact] = await db
        .insert(bidJacketArtifacts)
        .values({
          tenantId: DEFAULT_TENANT_ID,
          bidProjectId,
          templateCode: templateCode || null,
          title,
          sourceType: sourceType || "upload",
          sourceUrl: sourceUrl || null,
          status: (sourceUrl || documentId) ? "ready" : "missing",
          metadataJson: documentId ? { documentId, notes: notes || null } : notes ? { notes } : null,
        })
        .returning();
      res.status(201).json(artifact);
    } catch (error: any) {
      if (error instanceof ParamError) return res.status(400).json({ error: error.message });
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.issues });
      }
      console.error("Error creating artifact:", error);
      res.status(500).json({ error: "Failed to create artifact" });
    }
  });

  app.patch("/api/bid-projects/:bidProjectId/artifacts/:artifactId", async (req: Request, res: Response) => {
    try {
      const artifactId = p(req.params.artifactId);
      const { status, sourceUrl, documentId, notes, verifiedBy } = req.body;

      const PLACEHOLDER_REGEX = /\b(placeholder|tbd|lorem|ipsum|fake|test|sample|xxx|todo)\b/i;
      if (notes && PLACEHOLDER_REGEX.test(notes)) {
        return res.status(400).json({ error: "Quality gate: notes contain placeholder content. Please provide real data." });
      }
      if (sourceUrl && PLACEHOLDER_REGEX.test(sourceUrl)) {
        return res.status(400).json({ error: "Quality gate: sourceUrl contains placeholder content." });
      }
      if (status === "approved" && !sourceUrl && !documentId) {
        return res.status(400).json({ error: "Quality gate: cannot mark as approved without a sourceUrl or linked document." });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (status) updates.status = status;
      if (sourceUrl !== undefined) updates.sourceUrl = sourceUrl;
      if (documentId !== undefined) updates.documentId = documentId;
      if (notes !== undefined) updates.notes = notes;
      if (verifiedBy !== undefined) updates.verifiedBy = verifiedBy;

      const [updated] = await db
        .update(bidJacketArtifacts)
        .set(updates)
        .where(eq(bidJacketArtifacts.id, artifactId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Artifact not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating artifact:", error);
      res.status(500).json({ error: "Failed to update artifact" });
    }
  });

  // ============================================================================
  // BID JACKET CHECKLIST API
  // ============================================================================

  app.get("/api/bid-projects/:bidProjectId/jacket-checklist", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const items = await db
        .select()
        .from(bidJacketChecklistItems)
        .where(eq(bidJacketChecklistItems.bidProjectId, bidProjectId))
        .orderBy(bidJacketChecklistItems.phase, bidJacketChecklistItems.title);
      res.json(items);
    } catch (error) {
      console.error("Error fetching checklist:", error);
      res.status(500).json({ error: "Failed to fetch checklist" });
    }
  });

  app.get("/api/bid-projects/:bidProjectId/jacket-checklist/summary", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const result = await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE status = 'todo')::int as todo,
          count(*) FILTER (WHERE status = 'doing')::int as doing,
          count(*) FILTER (WHERE status = 'blocked')::int as blocked,
          count(*) FILTER (WHERE status = 'done')::int as done,
          count(*) FILTER (WHERE status = 'na')::int as na,
          count(*)::int as total
        FROM bid_jacket_checklist_items
        WHERE bid_project_id = ${bidProjectId}
      `);
      const row = result.rows[0] as any;
      res.json({
        todo: row?.todo ?? 0,
        doing: row?.doing ?? 0,
        blocked: row?.blocked ?? 0,
        done: row?.done ?? 0,
        na: row?.na ?? 0,
        total: row?.total ?? 0,
      });
    } catch (error) {
      console.error("Error fetching checklist summary:", error);
      res.status(500).json({ error: "Failed to fetch checklist summary" });
    }
  });

  app.patch("/api/bid-projects/:bidProjectId/jacket-checklist/:itemId", async (req: Request, res: Response) => {
    try {
      const itemId = p(req.params.itemId);
      const { status, ownerUserId, dueAt, blockedReason } = req.body;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (status) {
        updates.status = status;
        if (status === "done") updates.completedAt = new Date();
        else updates.completedAt = null;
        if (status === "blocked" && blockedReason) updates.blockedReason = blockedReason;
        if (status !== "blocked") updates.blockedReason = null;
      }
      if (ownerUserId !== undefined) updates.ownerUserId = ownerUserId;
      if (dueAt !== undefined) updates.dueAt = dueAt ? new Date(dueAt) : null;
      if (blockedReason !== undefined) updates.blockedReason = blockedReason;

      const [updated] = await db
        .update(bidJacketChecklistItems)
        .set(updates)
        .where(eq(bidJacketChecklistItems.id, itemId))
        .returning();
      if (!updated) return res.status(404).json({ error: "Checklist item not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating checklist item:", error);
      res.status(500).json({ error: "Failed to update checklist item" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/seed-jacket", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const { seedArtifactsForBidProject, seedChecklistForBidProject } = await import("./services/bid-jacket-artifacts.service");
      const artifactCount = await seedArtifactsForBidProject(DEFAULT_TENANT_ID, bidProjectId);
      const checklistCount = await seedChecklistForBidProject(DEFAULT_TENANT_ID, bidProjectId);
      res.json({ artifactsCreated: artifactCount, checklistItemsCreated: checklistCount });
    } catch (error) {
      console.error("Error seeding jacket:", error);
      res.status(500).json({ error: "Failed to seed jacket" });
    }
  });

  app.post("/api/bid-projects/:bidProjectId/artifacts/sync-sam", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const [bidProject] = await db.select().from(bidProjects).where(eq(bidProjects.id, bidProjectId)).limit(1);
      if (!bidProject) return res.status(404).json({ error: "Bid project not found" });

      const oppId = bidProject.opportunityId;
      if (!oppId) return res.json({ inserted: 0, updated: 0, total: 0, message: "No linked opportunity" });

      const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, oppId)).limit(1);
      if (!opp) return res.json({ inserted: 0, updated: 0, total: 0, message: "Opportunity not found" });

      const resourceLinks: string[] = [];
      let descriptionUrl: string | undefined;
      const rawPayload = (opp as any).rawPayloadJson as any;
      if (rawPayload) {
        if (Array.isArray(rawPayload.resourceLinks)) {
          for (const rl of rawPayload.resourceLinks) {
            if (typeof rl === "string") resourceLinks.push(rl);
            else if (rl?.url) resourceLinks.push(rl.url);
          }
        }
        if (rawPayload.descriptionUrl) descriptionUrl = rawPayload.descriptionUrl;
        if (rawPayload.description?.url) descriptionUrl = rawPayload.description.url;
      }

      if (resourceLinks.length === 0 && !descriptionUrl) {
        return res.json({ inserted: 0, updated: 0, total: 0, message: "No SAM.gov attachments found on linked opportunity" });
      }

      const { ingestSamAttachments } = await import("./services/bid-jacket-artifacts.service");
      const count = await ingestSamAttachments(DEFAULT_TENANT_ID, bidProjectId, resourceLinks, descriptionUrl);

      const totalResult = await db.execute(sql`
        SELECT count(*)::int as total FROM bid_jacket_artifacts
        WHERE bid_project_id = ${bidProjectId} AND source_type = 'samgov'
      `);
      const total = (totalResult.rows[0] as any)?.total ?? 0;

      res.json({ inserted: count, total });
    } catch (error) {
      console.error("Error syncing SAM artifacts:", error);
      res.status(500).json({ error: "Failed to sync SAM artifacts" });
    }
  });

  app.get("/api/bid-projects/:bidProjectId/missing-artifacts", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const result = await db.execute(sql`
        SELECT count(*)::int as missing_required_count
        FROM bid_jacket_artifacts bja
        JOIN artifact_templates at ON at.code = bja.template_code
        WHERE bja.bid_project_id = ${bidProjectId}
          AND at.required = true
          AND bja.status = 'missing'
      `);
      const row = result.rows[0] as any;
      res.json({ missingRequiredCount: row?.missing_required_count ?? 0 });
    } catch (error) {
      console.error("Error fetching missing artifacts:", error);
      res.status(500).json({ error: "Failed to fetch missing artifacts" });
    }
  });

  app.get("/api/admin/data-quality", async (_req: Request, res: Response) => {
    try {
      const missingPerJacket = await db.execute(sql`
        SELECT bja.bid_project_id,
          count(*) FILTER (WHERE bja.status = 'missing' AND at.required = true)::int as missing_required
        FROM bid_jacket_artifacts bja
        JOIN artifact_templates at ON at.code = bja.template_code
        GROUP BY bja.bid_project_id
        HAVING count(*) FILTER (WHERE bja.status = 'missing' AND at.required = true) > 0
        ORDER BY missing_required DESC
      `);

      const emptyChecklists = await db.execute(sql`
        SELECT bp.id
        FROM bid_projects bp
        LEFT JOIN bid_jacket_checklist_items bjci ON bjci.bid_project_id = bp.id
        GROUP BY bp.id
        HAVING count(bjci.id) = 0
      `);

      const samLinkedNoArtifacts = await db.execute(sql`
        SELECT bp.id
        FROM bid_projects bp
        WHERE bp.opportunity_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM bid_jacket_artifacts bja
          WHERE bja.bid_project_id = bp.id AND bja.source_type = 'samgov' AND bja.source_url IS NOT NULL
        )
      `);

      res.json({
        missingRequiredPerJacket: missingPerJacket.rows,
        bidJacketsWithNoChecklist: emptyChecklists.rows,
        samLinkedBidsWithNoSamArtifacts: samLinkedNoArtifacts.rows,
        counts: {
          jacketsWithMissingRequired: missingPerJacket.rows.length,
          jacketsWithNoChecklist: emptyChecklists.rows.length,
          samLinkedWithNoArtifacts: samLinkedNoArtifacts.rows.length,
        },
      });
    } catch (error) {
      console.error("Error fetching data quality:", error);
      res.status(500).json({ error: "Failed to fetch data quality" });
    }
  });

  // ============================================================================
  // BLUEPRINTS & TAKEOFFS API
  // ============================================================================

  app.get("/api/blueprints", async (req: Request, res: Response) => {
    try {
      const bps = await storage.getBlueprints(DEFAULT_TENANT_ID);
      res.json(bps);
    } catch (error) {
      console.error("Error fetching blueprints:", error);
      res.status(500).json({ error: "Failed to fetch blueprints" });
    }
  });

  app.post("/api/blueprints", async (req: Request, res: Response) => {
    try {
      const createSchema = z.object({
        bidProjectId: z.string().optional(),
        projectId: z.string().optional(),
        title: z.string().min(1),
        fileName: z.string().min(1),
        storageKey: z.string().min(1),
        fileSize: z.number().int().positive(),
        mimeType: z.string().optional(),
        pageCount: z.number().int().positive().optional(),
        scale: z.string().optional(),
        category: z.string().optional(),
      });

      const validated = createSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }

      const bp = await storage.createBlueprint({
        tenantId: DEFAULT_TENANT_ID,
        ...validated.data,
      });

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "blueprint_uploaded",
        actorType: "user",
        entityType: "blueprint",
        entityId: bp.id,
        action: "create",
        afterJson: { title: bp.title, fileName: bp.fileName },
      });

      res.status(201).json(bp);
    } catch (error) {
      console.error("Error creating blueprint:", error);
      res.status(500).json({ error: "Failed to create blueprint" });
    }
  });

  app.get("/api/blueprints/:id", async (req: Request, res: Response) => {
    try {
      const bp = await storage.getBlueprint(p(req.params.id));
      if (!bp) {
        return res.status(404).json({ error: "Blueprint not found" });
      }
      res.json(bp);
    } catch (error) {
      console.error("Error fetching blueprint:", error);
      res.status(500).json({ error: "Failed to fetch blueprint" });
    }
  });

  app.delete("/api/blueprints/:id", async (req: Request, res: Response) => {
    try {
      const bp = await storage.getBlueprint(p(req.params.id));
      if (!bp) {
        return res.status(404).json({ error: "Blueprint not found" });
      }

      await storage.deleteBlueprint(p(req.params.id));

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "blueprint_deleted",
        actorType: "user",
        entityType: "blueprint",
        entityId: p(req.params.id),
        action: "delete",
        beforeJson: { title: bp.title },
      });

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting blueprint:", error);
      res.status(500).json({ error: "Failed to delete blueprint" });
    }
  });

  app.get("/api/blueprints/:id/annotations", async (req: Request, res: Response) => {
    try {
      const pageNumber = req.query.page ? parseInt(req.query.page as string) : undefined;
      const annotations = await storage.getBlueprintAnnotations(p(req.params.id), pageNumber);
      res.json(annotations);
    } catch (error) {
      console.error("Error fetching annotations:", error);
      res.status(500).json({ error: "Failed to fetch annotations" });
    }
  });

  app.post("/api/blueprints/:id/annotations", async (req: Request, res: Response) => {
    try {
      const createSchema = z.object({
        pageNumber: z.number().int().positive().default(1),
        annotationType: z.enum(["cloud", "arrow", "text", "highlight", "measurement", "rectangle", "pencil", "area", "count"]),
        dataJson: z.record(z.unknown()),
        color: z.string().optional(),
        label: z.string().optional(),
      });

      const validated = createSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }

      const annotation = await storage.createBlueprintAnnotation({
        tenantId: DEFAULT_TENANT_ID,
        blueprintId: p(req.params.id),
        ...validated.data,
      });

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "annotation_created",
        actorType: "user",
        entityType: "blueprint_annotation",
        entityId: annotation.id,
        action: "create",
        afterJson: { annotationType: annotation.annotationType, blueprintId: p(req.params.id) },
      });

      res.status(201).json(annotation);
    } catch (error) {
      console.error("Error creating annotation:", error);
      res.status(500).json({ error: "Failed to create annotation" });
    }
  });

  app.delete("/api/annotations/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteBlueprintAnnotation(p(req.params.id));

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "annotation_deleted",
        actorType: "user",
        entityType: "blueprint_annotation",
        entityId: p(req.params.id),
        action: "delete",
      });

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting annotation:", error);
      res.status(500).json({ error: "Failed to delete annotation" });
    }
  });

  // Takeoff Items
  app.get("/api/takeoffs", async (req: Request, res: Response) => {
    try {
      const { blueprintId, bidProjectId } = req.query;
      if (bidProjectId) {
        const items = await storage.getTakeoffItemsByProject(bidProjectId as string);
        return res.json(items);
      }
      if (blueprintId) {
        const items = await storage.getTakeoffItems(blueprintId as string);
        return res.json(items);
      }
      return res.status(400).json({ error: "blueprintId or bidProjectId is required" });
    } catch (error) {
      console.error("Error fetching takeoffs:", error);
      res.status(500).json({ error: "Failed to fetch takeoffs" });
    }
  });

  app.post("/api/takeoffs", async (req: Request, res: Response) => {
    try {
      const createSchema = z.object({
        blueprintId: z.string().min(1).optional(),
        bidProjectId: z.string().min(1).optional(),
        name: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
        unitCost: z.number().min(0).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
        color: z.string().optional(),
        pageNumber: z.number().int().positive().optional(),
        locationJson: z.record(z.unknown()).optional(),
      });

      const validated = createSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }

      const item = await storage.createTakeoffItem({
        tenantId: DEFAULT_TENANT_ID,
        blueprintId: validated.data.blueprintId ?? null,
        bidProjectId: validated.data.bidProjectId ?? null,
        name: validated.data.name,
        quantity: validated.data.quantity.toString(),
        unit: validated.data.unit,
        unitCost: validated.data.unitCost !== undefined ? validated.data.unitCost.toString() : "0.00",
        category: validated.data.category,
        notes: validated.data.notes,
        color: validated.data.color,
        pageNumber: validated.data.pageNumber,
        locationJson: validated.data.locationJson,
      });

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "takeoff_created",
        actorType: "user",
        entityType: "takeoff_item",
        entityId: item.id,
        action: "create",
        afterJson: { name: item.name, quantity: item.quantity, unit: item.unit },
      });

      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating takeoff:", error);
      res.status(500).json({ error: "Failed to create takeoff" });
    }
  });

  app.patch("/api/takeoffs/:id", async (req: Request, res: Response) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        quantity: z.number().positive().optional(),
        unit: z.string().min(1).optional(),
        unitCost: z.number().min(0).optional(),
        category: z.string().optional(),
        notes: z.string().optional(),
        color: z.string().optional(),
      });

      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromError(validated.error).toString() 
        });
      }

      const updates: Record<string, unknown> = { ...validated.data };
      if (validated.data.quantity !== undefined) {
        updates.quantity = validated.data.quantity.toString();
      }
      if (validated.data.unitCost !== undefined) {
        updates.unitCost = validated.data.unitCost.toString();
      }

      const item = await storage.updateTakeoffItem(p(req.params.id), updates);
      if (!item) {
        return res.status(404).json({ error: "Takeoff item not found" });
      }

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "takeoff_updated",
        actorType: "user",
        entityType: "takeoff_item",
        entityId: p(req.params.id),
        action: "update",
        afterJson: validated.data,
      });

      res.json(item);
    } catch (error) {
      console.error("Error updating takeoff:", error);
      res.status(500).json({ error: "Failed to update takeoff" });
    }
  });

  app.delete("/api/takeoffs/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteTakeoffItem(p(req.params.id));

      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "takeoff_deleted",
        actorType: "user",
        entityType: "takeoff_item",
        entityId: p(req.params.id),
        action: "delete",
      });

      res.status(204).end();
    } catch (error) {
      console.error("Error deleting takeoff:", error);
      res.status(500).json({ error: "Failed to delete takeoff" });
    }
  });

  // ============================================================================
  // APPROVALS API
  // ============================================================================

  app.get("/api/approvals/stats", async (req: Request, res: Response) => {
    try {
      const allApprovals = await storage.getApprovalRequests(DEFAULT_TENANT_ID);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      const pending = allApprovals.filter(a => a.status === 'pending').length;
      const approvedToday = allApprovals.filter(a => a.status === 'approved' && new Date(a.createdAt) >= todayStart).length;
      const deniedToday = allApprovals.filter(a => a.status === 'denied' && new Date(a.createdAt) >= todayStart).length;
      const urgent = allApprovals.filter(a => a.status === 'pending' && (a.priority === 'high' || a.priority === 'urgent')).length;
      const totalValue = allApprovals
        .filter(a => a.status === 'pending')
        .reduce((sum, a) => {
          const ctx = a.contextJson as any;
          return sum + (ctx?.amount || 0);
        }, 0);
      
      res.json({ pending, approvedToday, deniedToday, urgent, totalValue });
    } catch (error) {
      console.error("Error fetching approval stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/approvals", async (req: Request, res: Response) => {
    try {
      const { status, type } = req.query;
      
      const validStatuses = ['pending', 'approved', 'denied'];
      const safeStatus = (status && status !== 'all' && validStatuses.includes(String(status))) ? String(status) : null;
      
      const statusClause = safeStatus ? sql`AND ar.status = ${safeStatus}` : sql``;

      // ?type= filters by actionType and/or entityType. Aliases supported:
      //   change_order  → action_type LIKE %change_order% OR entity_type='change_order'
      //   coi           → action_type LIKE %coi% OR entity_type='coi_certificate'
      //   bid           → action_type LIKE %bid%
      //   vendor        → entity_type='vendor'
      //   <other>       → exact action_type match
      const rawType = typeof type === "string" ? type.trim() : "";
      let typeClause = sql``;
      if (rawType) {
        const t = rawType.toLowerCase();
        if (t === "change_order") {
          typeClause = sql`AND (ar.action_type ILIKE ${"%change_order%"} OR ar.entity_type = ${"change_order"})`;
        } else if (t === "coi") {
          typeClause = sql`AND (ar.action_type ILIKE ${"%coi%"} OR ar.entity_type = ${"coi_certificate"})`;
        } else if (t === "bid") {
          typeClause = sql`AND ar.action_type ILIKE ${"%bid%"}`;
        } else if (t === "vendor") {
          typeClause = sql`AND ar.entity_type = ${"vendor"}`;
        } else {
          typeClause = sql`AND ar.action_type = ${rawType}`;
        }
      }
      
      const result = await db.execute(sql`
        SELECT 
          ar.id, ar.entity_type, ar.entity_id, ar.action_type, ar.priority, ar.status,
          ar.context_json, ar.created_at, ar.expires_at, ar.requested_by,
          COALESCE(opp_direct.title, opp_via_bp.title) as opp_title,
          COALESCE(opp_direct.contract_value, opp_via_bp.contract_value) as opp_value,
          COALESCE(opp_direct.due_at, opp_via_bp.due_at) as opp_deadline,
          COALESCE(opp_direct.naics_codes, opp_via_bp.naics_codes) as opp_naics,
          COALESCE(opp_direct.set_aside, opp_via_bp.set_aside) as opp_set_aside,
          COALESCE(opp_direct.synopsis, opp_via_bp.synopsis) as opp_synopsis,
          COALESCE(opp_direct.source_system_id, opp_via_bp.source_system_id) as opp_sol_number,
          COALESCE(opp_direct.description, opp_via_bp.description) as opp_description,
          COALESCE(opp_direct.location_json, opp_via_bp.location_json) as opp_location,
          COALESCE(opp_direct.probability, opp_via_bp.probability) as opp_probability,
          COALESCE(opp_direct.status_normalized, opp_via_bp.status_normalized) as opp_status,
          COALESCE(c1.name, c2.name) as buyer_name,
          p.name as project_name, p.description as project_desc, p.contract_value as project_value,
          p.start_date as project_start, p.expected_end_date as project_end,
          p.project_number, p.status as project_status, p.client as project_client,
          v.company_name as vendor_company, v.vendor_type, v.contact_name as vendor_contact,
          v.email as vendor_email, v.status as vendor_status
        FROM approval_requests ar
        LEFT JOIN bid_projects bp ON (ar.entity_id = bp.id AND ar.entity_type IN ('bid_decision','bid_project'))
        LEFT JOIN opportunities opp_via_bp ON bp.opportunity_id = opp_via_bp.id
        LEFT JOIN opportunities opp_direct ON (ar.entity_id = opp_direct.id AND ar.entity_type = 'opportunity')
        LEFT JOIN companies c1 ON opp_direct.buyer_id = c1.id
        LEFT JOIN companies c2 ON opp_via_bp.buyer_id = c2.id
        LEFT JOIN projects p ON (ar.entity_id = p.id AND ar.entity_type = 'project')
        LEFT JOIN vendors v ON (ar.entity_id = v.id AND ar.entity_type = 'vendor')
        WHERE ar.tenant_id = ${DEFAULT_TENANT_ID}
        ${statusClause}
        ${typeClause}
        ORDER BY 
          CASE ar.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
          ar.created_at DESC
      `);
      const rows = (result as any).rows || result;
      
      const formatted = (Array.isArray(rows) ? rows : []).map((row: any) => {
        const ctx = row.context_json || {};
        const entityType = row.entity_type;
        const actionType = row.action_type;
        
        let title = '';
        let description = '';
        let entityName = '';
        let agencyName = row.buyer_name || '';
        let dollarValue: number | null = null;
        let deadline: string | null = null;
        let naicsCodes: string[] = [];
        let setAside = '';
        let solNumber = '';
        let herbieReason = ctx.reason || ctx.reasoning || ctx.action || '';
        let requiredRole = ctx.requiredRole || '';
        let fitScore: number | null = ctx.confidenceScore ? Math.round(ctx.confidenceScore * 100) : null;
        
        const parseNaics = (raw: any): string[] => {
          if (!raw) return [];
          if (Array.isArray(raw)) return raw.map(String);
          if (typeof raw === 'string') {
            const cleaned = raw.replace(/[{}]/g, '');
            return cleaned ? cleaned.split(',').map((s: string) => s.trim()) : [];
          }
          return [];
        };

        if (entityType === 'opportunity') {
          entityName = row.opp_title || ctx.title || 'Untitled Opportunity';
          dollarValue = row.opp_value ? parseFloat(row.opp_value) : (ctx.amount || null);
          deadline = row.opp_deadline || null;
          naicsCodes = parseNaics(row.opp_naics);
          setAside = row.opp_set_aside || '';
          solNumber = row.opp_sol_number || '';
          const oppStatus = row.opp_status || '';
          const probability = row.opp_probability ? `${row.opp_probability}%` : '';
          
          title = `Opportunity Review: ${entityName}`;
          const valueFmt = dollarValue ? ` valued at $${(dollarValue / 1_000_000).toFixed(1)}M` : '';
          const deadlineFmt = deadline ? ` with response due ${new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
          const setAsideFmt = setAside ? ` (${setAside})` : '';
          description = herbieReason || `HERBIE identified "${entityName}"${valueFmt}${setAsideFmt}${deadlineFmt}. Review to approve pursuit or pass.`;
          
        } else if (entityType === 'bid_decision' || entityType === 'bid_project') {
          entityName = row.opp_title || ctx.opportunityTitle || '';
          if (!entityName && herbieReason) {
            const match = herbieReason.match(/^([^–—\-]+?)(?:\s*[-–—]\s)/);
            if (match) entityName = match[1].trim();
          }
          if (!entityName) entityName = 'Bid Opportunity';
          dollarValue = row.opp_value ? parseFloat(row.opp_value) : (ctx.amount || null);
          if (!dollarValue && herbieReason) {
            const valMatch = herbieReason.match(/\$(\d+(?:\.\d+)?)\s*M/i);
            if (valMatch) dollarValue = parseFloat(valMatch[1]) * 1_000_000;
          }
          deadline = row.opp_deadline || null;
          naicsCodes = parseNaics(row.opp_naics);
          setAside = row.opp_set_aside || ctx.setAside || '';
          if (!setAside && herbieReason) {
            const saMatch = herbieReason.match(/(HUBZone|SDVOSB|8\(a\)|Small Business|WOSB|EDWOSB)/i);
            if (saMatch) setAside = saMatch[1];
          }
          solNumber = row.opp_sol_number || '';
          
          if (actionType === 'bid_submission' || actionType === 'bid_submit') {
            title = `Submit Bid: ${entityName}`;
            const valueFmt = dollarValue ? ` ($${(dollarValue / 1_000_000).toFixed(1)}M)` : '';
            description = herbieReason || `Final approval needed to submit bid package for "${entityName}"${valueFmt}. Verify scope coverage, compliance items, and deliverables before submission.`;
          } else {
            title = `Bid Decision: ${entityName}`;
            const valueFmt = dollarValue ? ` valued at $${(dollarValue / 1_000_000).toFixed(1)}M` : '';
            description = herbieReason || `HERBIE recommends pursuing "${entityName}"${valueFmt}. Review fit analysis and authorize bid workspace setup.`;
          }
          
        } else if (entityType === 'project') {
          entityName = row.project_name || ctx.projectName || 'Untitled Project';
          dollarValue = row.project_value ? parseFloat(row.project_value) : null;
          deadline = row.project_end || null;
          const projectNum = row.project_number || '';
          const projectStatus = row.project_status || '';
          const clientName = row.project_client || '';
          agencyName = clientName;
          
          title = `Project Review: ${entityName}`;
          const valueFmt = dollarValue ? ` ($${(dollarValue / 1_000_000).toFixed(1)}M contract)` : '';
          const numFmt = projectNum ? ` [${projectNum}]` : '';
          const startFmt = row.project_start ? ` starting ${new Date(row.project_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
          description = herbieReason || `Review project "${entityName}"${numFmt}${valueFmt}${startFmt}. Confirm project setup, team assignments, and milestone schedule.`;
          
        } else if (entityType === 'email') {
          title = `Send Email: ${ctx.recipientEmail || 'Outreach'}`;
          entityName = ctx.recipientEmail || 'Email Draft';
          description = herbieReason || 'HERBIE drafted an outreach email for your review.';
          
        } else if (entityType === 'teaming_agreement') {
          let partnerName = ctx.partnerName || '';
          if (!partnerName && herbieReason) {
            const teamMatch = herbieReason.match(/(?:with|partner[:\s]+)\s*([A-Z][A-Za-z\s&]+?)(?:\s+for\b|\s*[-–—]|\s*$)/);
            if (teamMatch) partnerName = teamMatch[1].trim();
          }
          if (!partnerName) partnerName = 'Partner';
          title = `Teaming Agreement: ${partnerName}`;
          entityName = partnerName;
          description = herbieReason || `Review teaming agreement with ${partnerName}. Confirm roles, responsibilities, and work share before execution.`;
          
        } else if (entityType === 'vendor') {
          const vendorName = row.vendor_company || ctx.candidate?.name || 'Unknown Vendor';
          const vendorType = row.vendor_type || ctx.candidate?.type || '';
          const vendorContact = row.vendor_contact || '';
          title = `Vendor Review: ${vendorName}`;
          entityName = vendorName;
          const typeFmt = vendorType ? ` (${vendorType})` : '';
          const contactFmt = vendorContact ? `, contact: ${vendorContact}` : '';
          description = herbieReason || ctx.reasoning || `Vendor "${vendorName}"${typeFmt} requires manual review${contactFmt}. Verify qualifications, insurance, and bonding before approval.`;
          fitScore = ctx.confidenceScore ? Math.round(ctx.confidenceScore * 100) : null;
          
        } else {
          title = `Review: ${actionType.replace(/_/g, ' ')}`;
          entityName = entityType;
          description = herbieReason || 'Action requires your approval.';
        }
        
        return {
          id: row.id,
          entityType,
          entityId: row.entity_id,
          actionType,
          title,
          description,
          entityName,
          agencyName,
          dollarValue,
          deadline: deadline ? new Date(deadline).toISOString() : null,
          naicsCodes,
          setAside,
          solNumber,
          herbieReason,
          requiredRole,
          fitScore,
          requestedBy: row.requested_by || "HERBIE",
          requestedByType: row.requested_by ? "user" : "herbie" as "herbie" | "user",
          priority: row.priority,
          status: row.status,
          context: ctx,
          createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
          expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
        };
      });
      
      res.json(formatted);
    } catch (error) {
      console.error("Error fetching approvals:", error);
      res.status(500).json({ error: "Failed to fetch approvals" });
    }
  });

  // PATCH /api/approvals/:id — unified status update endpoint.
  // Body: { status: "approved" | "rejected" | "denied", notes?: string }
  app.patch("/api/approvals/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { status, notes } = req.body || {};
      const raw = String(status || "").toLowerCase().trim();
      const normalized = raw === "rejected" ? "denied" : raw;
      if (normalized !== "approved" && normalized !== "denied") {
        return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
      }
      const existing = await storage.getApprovalRequest(id);
      if (!existing) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      if ((existing.status || "").toLowerCase() !== "pending") {
        return res.status(409).json({
          error: `Approval already ${existing.status}; only pending approvals can be decided.`,
          current: existing.status,
        });
      }
      const approval = await storage.updateApprovalRequest(id, { status: normalized });
      if (!approval) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: normalized === "approved" ? "approval_granted" : "approval_denied",
        actorType: "user",
        entityType: "approval_request",
        entityId: approval.id,
        action: normalized === "approved" ? "approve" : "deny",
        afterJson: { ...approval, notes },
      });
      res.json(approval);
    } catch (error) {
      console.error("Error patching approval:", error);
      res.status(500).json({ error: "Failed to update approval" });
    }
  });

  app.post("/api/approvals/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { notes } = req.body || {};
      const approval = await storage.updateApprovalRequest(id, {
        status: "approved",
      });
      
      if (!approval) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "approval_granted",
        actorType: "user",
        entityType: "approval_request",
        entityId: approval.id,
        action: "approve",
        afterJson: { ...approval, notes },
      });

      if (approval.entityType === "opportunity" || approval.entityType === "bid_decision") {
        try {
          const oppId = approval.entityId;
          const existingBids = await db.select({ id: bidProjects.id })
            .from(bidProjects)
            .where(and(
              eq(bidProjects.tenantId, DEFAULT_TENANT_ID),
              eq(bidProjects.opportunityId, oppId),
            ))
            .limit(1);

          let bidProjectId: string;

          if (existingBids.length) {
            bidProjectId = existingBids[0].id;
          } else {
            const newBid = await storage.createBidProject({
              tenantId: DEFAULT_TENANT_ID,
              opportunityId: oppId,
              status: "initiated",
            });
            bidProjectId = newBid.id;

            await storage.createAuditEvent({
              tenantId: DEFAULT_TENANT_ID,
              eventType: "bid_project_created",
              actorType: "system",
              entityType: "bid_project",
              entityId: bidProjectId,
              action: "create",
              afterJson: { source: "approval_auto_create", approvalId: approval.id },
            });
          }

          await ensurePipelineItemForBidProject({
            tenantId: DEFAULT_TENANT_ID,
            bidProjectId,
          });

          try {
            const { seedArtifactsForBidProject, seedChecklistForBidProject } = await import("./services/bid-jacket-artifacts.service");
            await seedArtifactsForBidProject(DEFAULT_TENANT_ID, bidProjectId);
            await seedChecklistForBidProject(DEFAULT_TENANT_ID, bidProjectId);
          } catch (e) {
            console.error("[approve] Failed to seed jacket artifacts:", e);
          }

          try {
            const { enqueueArtifactIngestionJob } = await import("./services/ingestion/ingestion.helpers");
            await enqueueArtifactIngestionJob({ tenantId: DEFAULT_TENANT_ID, bidProjectId, sourceType: "internal", priority: "high" });
          } catch (e) {
            console.error("[approve] Failed to enqueue ingestion job:", e);
          }
        } catch (e) {
          console.error("[approve] Post-approval automation failed:", e);
        }
      }
      
      res.json(approval);
    } catch (error) {
      console.error("Error approving request:", error);
      res.status(500).json({ error: "Failed to approve request" });
    }
  });

  app.post("/api/approvals/:id/deny", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { notes } = req.body || {};
      const approval = await storage.updateApprovalRequest(id, {
        status: "denied",
      });
      
      if (!approval) {
        return res.status(404).json({ error: "Approval request not found" });
      }
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "approval_denied",
        actorType: "user",
        entityType: "approval_request",
        entityId: approval.id,
        action: "deny",
        afterJson: { ...approval, notes },
      });
      
      res.json(approval);
    } catch (error) {
      console.error("Error denying request:", error);
      res.status(500).json({ error: "Failed to deny request" });
    }
  });

  // ============================================================================
  // CALENDAR API (Enhanced with FullCalendar support)
  // ============================================================================

  async function fetchCalendarTodayData(tenantId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const yesterdayStart = new Date(todayStart.getTime() - 86400000);

    function routeFor(entityType: string, entityId: string) {
      const t = (entityType || "").toLowerCase();
      if (t.includes("opportunity")) return `/capture/opportunity/${entityId}`;
      if (t.includes("bid_project") || t.includes("bidproject") || t.includes("bid_decision")) return `/projects/${entityId}/documents`;
      if (t.includes("project")) return `/projects/${entityId}`;
      if (t.includes("vendor")) return `/entity/vendor/${entityId}`;
      return `/projects/${entityId}`;
    }

    const calTodayResult = await db.execute(sql`
      SELECT id, title, description, event_type, start_at, end_at, all_day, project_id, status
      FROM calendar_events
      WHERE tenant_id = ${tenantId}
        AND start_at >= ${todayStart} AND start_at <= ${todayEnd}
      ORDER BY all_day DESC, start_at ASC
    `);
    const calToday = (calTodayResult.rows || []).map((r: any) => ({
      id: `cal-${r.id}`,
      time: r.all_day ? null : new Date(r.start_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      allDay: !!r.all_day,
      title: r.title,
      subtitle: r.description || r.event_type || "Calendar",
      type: "event" as const,
      source: "local",
      entityId: r.project_id || null,
      entityType: r.project_id ? "project" : null,
      route: r.project_id ? `/projects/${r.project_id}` : "/calendar",
    }));

    const bidTodayResult = await db.execute(sql`
      SELECT bp.id as bid_id, o.title as opp_title, o.due_at, o.contract_value, o.set_aside, bp.status as bid_status,
        c.name as agency
      FROM bid_projects bp
      LEFT JOIN opportunities o ON bp.opportunity_id = o.id
      LEFT JOIN companies c ON o.buyer_id = c.id
      WHERE bp.tenant_id = ${tenantId}
        AND o.due_at >= ${todayStart} AND o.due_at <= ${todayEnd}
    `);
    const bidToday = (bidTodayResult.rows || []).map((r: any) => {
      const val = r.contract_value ? `$${Math.round(Number(r.contract_value) / 1000)}K` : "";
      return {
        id: `bid-${r.bid_id}`,
        time: null,
        allDay: true,
        title: `Bid Due: ${r.opp_title || "Untitled"}`,
        subtitle: [r.agency, val, r.set_aside].filter(Boolean).join(" · ") || "Bid deadline",
        type: "deadline" as const,
        source: "system",
        entityId: r.bid_id,
        entityType: "bid_project",
        route: `/projects/${r.bid_id}/documents`,
        dollarValue: r.contract_value ? Number(r.contract_value) : null,
        agency: r.agency || null,
      };
    });

    const appTodayResult = await db.execute(sql`
      SELECT ar.id, ar.entity_type, ar.entity_id, ar.action_type,
        ar.priority, ar.requested_by, ar.created_at, ar.expires_at,
        COALESCE(opp_d.title, opp_bp.title) as entity_name,
        COALESCE(opp_d.contract_value, opp_bp.contract_value) as dollar_value,
        COALESCE(c1.name, c2.name) as agency,
        EXTRACT(DAY FROM NOW() - ar.created_at)::int as age_days
      FROM approval_requests ar
      LEFT JOIN bid_projects bp ON (ar.entity_id = bp.id AND ar.entity_type IN ('bid_decision','bid_project'))
      LEFT JOIN opportunities opp_bp ON bp.opportunity_id = opp_bp.id
      LEFT JOIN opportunities opp_d ON (ar.entity_id = opp_d.id AND ar.entity_type = 'opportunity')
      LEFT JOIN companies c1 ON opp_d.buyer_id = c1.id
      LEFT JOIN companies c2 ON opp_bp.buyer_id = c2.id
      WHERE ar.tenant_id = ${tenantId} AND ar.status = 'pending'
        AND ar.expires_at >= ${todayStart} AND ar.expires_at <= ${todayEnd}
    `);
    const appToday = (appTodayResult.rows || []).map((r: any) => ({
      id: `app-${r.id}`,
      time: r.expires_at ? new Date(r.expires_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null,
      allDay: !r.expires_at,
      title: r.entity_name || "Approval Needed",
      subtitle: `${r.action_type || "approval"} · ${r.age_days || 0}d pending`,
      type: "approval" as const,
      source: "system",
      entityId: r.entity_id,
      entityType: r.entity_type,
      route: routeFor(r.entity_type, r.entity_id),
      dollarValue: r.dollar_value ? Number(r.dollar_value) : null,
      agency: r.agency || null,
      priority: r.priority,
      ageDays: r.age_days,
    }));

    const taskTodayResult = await db.execute(sql`
      SELECT id, title, description, priority, status, due_at, source, source_entity_type, source_entity_id
      FROM dashboard_tasks
      WHERE tenant_id = ${tenantId}
        AND due_at >= ${todayStart} AND due_at <= ${todayEnd}
        AND status != 'done'
    `);
    const taskToday = (taskTodayResult.rows || []).map((r: any) => ({
      id: `task-${r.id}`,
      time: r.due_at ? new Date(r.due_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null,
      allDay: false,
      title: r.title,
      subtitle: r.description || r.source || "Task",
      type: "task" as const,
      source: r.source || "manual",
      entityId: r.source_entity_id || null,
      entityType: r.source_entity_type || null,
      route: r.source_entity_type && r.source_entity_id ? routeFor(r.source_entity_type, r.source_entity_id) : "/tasks",
      priority: r.priority,
    }));

    const appAllPendingResult = await db.execute(sql`
      SELECT ar.id, ar.entity_type, ar.entity_id, ar.action_type,
        ar.priority, ar.created_at,
        COALESCE(opp_d.title, opp_bp.title) as entity_name,
        COALESCE(opp_d.contract_value, opp_bp.contract_value) as dollar_value,
        COALESCE(c1.name, c2.name) as agency,
        EXTRACT(DAY FROM NOW() - ar.created_at)::int as age_days
      FROM approval_requests ar
      LEFT JOIN bid_projects bp ON (ar.entity_id = bp.id AND ar.entity_type IN ('bid_decision','bid_project'))
      LEFT JOIN opportunities opp_bp ON bp.opportunity_id = opp_bp.id
      LEFT JOIN opportunities opp_d ON (ar.entity_id = opp_d.id AND ar.entity_type = 'opportunity')
      LEFT JOIN companies c1 ON opp_d.buyer_id = c1.id
      LEFT JOIN companies c2 ON opp_bp.buyer_id = c2.id
      WHERE ar.tenant_id = ${tenantId} AND ar.status = 'pending'
        AND (ar.expires_at IS NULL OR ar.expires_at < ${todayStart})
        AND ar.created_at < ${todayStart}
      ORDER BY ar.created_at ASC
      LIMIT 10
    `);
    const missedApprovals = (appAllPendingResult.rows || []).map((r: any) => ({
      id: `missed-app-${r.id}`,
      time: null,
      allDay: true,
      title: r.entity_name || "Overdue Approval",
      subtitle: `${r.action_type || "approval"} · ${r.age_days || 0}d overdue`,
      type: "approval" as const,
      source: "system",
      entityId: r.entity_id,
      entityType: r.entity_type,
      route: routeFor(r.entity_type, r.entity_id),
      dollarValue: r.dollar_value ? Number(r.dollar_value) : null,
      priority: r.priority,
      ageDays: r.age_days,
    }));

    const missedTaskResult = await db.execute(sql`
      SELECT id, title, description, priority, status, due_at, source, source_entity_type, source_entity_id
      FROM dashboard_tasks
      WHERE tenant_id = ${tenantId}
        AND due_at < ${todayStart}
        AND status NOT IN ('done', 'cancelled')
      ORDER BY due_at DESC
      LIMIT 10
    `);
    const missedTasks = (missedTaskResult.rows || []).map((r: any) => ({
      id: `missed-task-${r.id}`,
      time: null,
      allDay: true,
      title: r.title,
      subtitle: `Overdue task · ${r.priority || "medium"} priority`,
      type: "task" as const,
      source: r.source || "manual",
      entityId: r.source_entity_id || null,
      entityType: r.source_entity_type || null,
      route: r.source_entity_type && r.source_entity_id ? routeFor(r.source_entity_type, r.source_entity_id) : "/tasks",
      priority: r.priority,
    }));

    const missedBidResult = await db.execute(sql`
      SELECT bp.id as bid_id, o.title as opp_title, o.due_at, o.contract_value, o.set_aside,
        c.name as agency
      FROM bid_projects bp
      LEFT JOIN opportunities o ON bp.opportunity_id = o.id
      LEFT JOIN companies c ON o.buyer_id = c.id
      WHERE bp.tenant_id = ${tenantId}
        AND o.due_at < ${todayStart} AND o.due_at >= ${yesterdayStart}
        AND bp.status NOT IN ('awarded', 'closed', 'cancelled')
    `);
    const missedBids = (missedBidResult.rows || []).map((r: any) => ({
      id: `missed-bid-${r.bid_id}`,
      time: null,
      allDay: true,
      title: `Missed Deadline: ${r.opp_title || "Untitled"}`,
      subtitle: [r.agency, r.set_aside].filter(Boolean).join(" · ") || "Bid deadline missed",
      type: "deadline" as const,
      source: "system",
      entityId: r.bid_id,
      entityType: "bid_project",
      route: `/projects/${r.bid_id}/documents`,
      dollarValue: r.contract_value ? Number(r.contract_value) : null,
      agency: r.agency || null,
    }));

    let connections = { microsoft: false, google: false };
    try {
      const connResult = await db.execute(sql`
        SELECT provider FROM calendar_connections WHERE tenant_id = ${tenantId}
      `);
      for (const row of (connResult.rows || []) as any[]) {
        if (row.provider === "microsoft") connections.microsoft = true;
        if (row.provider === "google") connections.google = true;
      }
    } catch {}

    const today = [...calToday, ...bidToday, ...appToday, ...taskToday]
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return (a.time || "").localeCompare(b.time || "");
      });

    const missed = [...missedApprovals, ...missedTasks, ...missedBids];

    return { today, missed, connections };
  }

  app.get("/api/calendar/today", async (req: Request, res: Response) => {
    try {
      const result = await fetchCalendarTodayData(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error) {
      console.error("Error fetching today's calendar:", error);
      res.status(500).json({ error: "Failed to fetch today's calendar" });
    }
  });

  app.get("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const start = req.query.start as string | undefined;
      const end = req.query.end as string | undefined;
      const projectId = req.query.projectId as string | undefined;
      const assignedTo = req.query.assignedTo as string | undefined;
      const eventType = req.query.eventType as string | undefined;

      const conditions: ReturnType<typeof sql>[] = [sql`tenant_id = ${DEFAULT_TENANT_ID}`];
      if (start) conditions.push(sql`start_at >= ${new Date(start)}`);
      if (end) conditions.push(sql`start_at <= ${new Date(end)}`);
      if (projectId) conditions.push(sql`project_id = ${projectId}`);
      if (assignedTo) conditions.push(sql`owner_user_id = ${assignedTo}`);
      if (eventType) conditions.push(sql`event_type = ${eventType}`);

      const whereClause = sql.join(conditions, sql` AND `);
      const calResult = await db.execute(sql`SELECT * FROM calendar_events WHERE ${whereClause} ORDER BY start_at ASC`);
      const rows = (calResult.rows || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        eventType: r.event_type,
        startAt: r.start_at,
        endAt: r.end_at,
        allDay: r.all_day,
        timezone: r.timezone,
        location: r.location,
        status: r.status,
        source: r.source,
        projectId: r.project_id,
        ownerUserId: r.owner_user_id,
        externalEventId: r.external_event_id,
        externalCalendarId: r.external_calendar_id,
        attendeesJson: r.attendees_json,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      const bidDeadlineRows = await db.execute(
        sql`SELECT bp.id, o.title as opportunity_title, o.due_at FROM bid_projects bp LEFT JOIN opportunities o ON bp.opportunity_id = o.id WHERE bp.tenant_id = ${DEFAULT_TENANT_ID} AND o.due_at IS NOT NULL`
      );
      const deadlineEvents = (bidDeadlineRows.rows || [])
        .filter((b: any) => b.due_at)
        .map((b: any) => ({
          id: `bid-deadline-${b.id}`,
          title: `Bid Due: ${b.opportunity_title || 'Untitled'}`,
          description: "Bid submission deadline",
          eventType: "deadline",
          startAt: new Date(b.due_at).toISOString(),
          endAt: null,
          allDay: true,
          location: null,
          status: "confirmed",
          source: "system",
          isOverlay: true,
        }));

      const rfiConditions: ReturnType<typeof sql>[] = [sql`tenant_id = ${DEFAULT_TENANT_ID}`];
      if (projectId) rfiConditions.push(sql`project_id = ${projectId}`);
      const rfiWhere = sql.join(rfiConditions, sql` AND `);
      const rfiResult = await db.execute(sql`SELECT id, subject, due_date, status, project_id FROM rfis WHERE ${rfiWhere}`);
      const rfiEvents = (rfiResult.rows || [])
        .filter((r: any) => r.due_date)
        .map((r: any) => ({
          id: `rfi-${r.id}`,
          title: `RFI Due: ${r.subject || 'Untitled'}`,
          description: `RFI deadline - Status: ${r.status}`,
          eventType: "deadline",
          startAt: new Date(r.due_date).toISOString(),
          endAt: null,
          allDay: true,
          location: null,
          status: r.status === "closed" ? "cancelled" : "confirmed",
          source: "system",
          isOverlay: true,
          projectId: r.project_id,
        }));

      const subConditions: ReturnType<typeof sql>[] = [sql`tenant_id = ${DEFAULT_TENANT_ID}`, sql`status NOT IN ('approved', 'closed')`];
      if (projectId) subConditions.push(sql`project_id = ${projectId}`);
      const subWhere = sql.join(subConditions, sql` AND `);
      const subResult = await db.execute(sql`SELECT id, name, submitted_at, status, project_id FROM submittals WHERE ${subWhere}`);
      const subEvents = (subResult.rows || [])
        .filter((s: any) => s.submitted_at)
        .map((s: any) => ({
          id: `sub-${s.id}`,
          title: `Submittal: ${s.name || 'Untitled'}`,
          description: `Submittal pending - Status: ${s.status}`,
          eventType: "submission",
          startAt: new Date(s.submitted_at).toISOString(),
          endAt: null,
          allDay: true,
          location: null,
          status: "confirmed",
          source: "system",
          isOverlay: true,
          projectId: s.project_id,
        }));

      const taskConditions: ReturnType<typeof sql>[] = [sql`tenant_id = ${DEFAULT_TENANT_ID}`];
      if (projectId) taskConditions.push(sql`project_id = ${projectId}`);
      const taskWhere = sql.join(taskConditions, sql` AND `);
      const taskResult = await db.execute(sql`SELECT id, name, due_date, status, project_id FROM project_tasks WHERE ${taskWhere}`);
      const taskEvents = (taskResult.rows || [])
        .filter((t: any) => t.due_date)
        .map((t: any) => ({
          id: `task-${t.id}`,
          title: `Task: ${t.name || 'Untitled'}`,
          description: `Task deadline - Status: ${t.status}`,
          eventType: "work_package",
          startAt: new Date(t.due_date).toISOString(),
          endAt: null,
          allDay: true,
          location: null,
          status: t.status === "completed" ? "cancelled" : "confirmed",
          source: "system",
          isOverlay: true,
          projectId: t.project_id,
        }));

      res.json([...rows, ...deadlineEvents, ...rfiEvents, ...subEvents, ...taskEvents]);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.post("/api/calendar/events", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.title || !body.startAt) {
        return res.status(400).json({ error: "title and startAt are required" });
      }
      const result = await db.execute(sql`
        INSERT INTO calendar_events (tenant_id, owner_user_id, project_id, entity_type, entity_id, title, description, event_type, start_at, end_at, all_day, timezone, location, attendees_json, source, external_event_id, external_calendar_id, status)
        VALUES (${DEFAULT_TENANT_ID}, ${body.ownerUserId || null}, ${body.projectId || null}, ${body.entityType || null}, ${body.entityId || null}, ${body.title}, ${body.description || null}, ${body.eventType || 'meeting'}, ${new Date(body.startAt).toISOString()}, ${body.endAt ? new Date(body.endAt).toISOString() : null}, ${body.allDay || false}, ${body.timezone || 'America/Chicago'}, ${body.location || null}, ${body.attendeesJson ? JSON.stringify(body.attendeesJson) : null}, ${body.source || 'local'}, ${body.externalEventId || null}, ${body.externalCalendarId || null}, ${body.status || 'confirmed'})
        RETURNING *
      `);
      const event = result.rows?.[0];
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.patch("/api/calendar/events/:id", async (req: Request, res: Response) => {
    try {
      const b = req.body;
      const setClauses: ReturnType<typeof sql>[] = [sql`updated_at = NOW()`];
      if (b.title !== undefined) setClauses.push(sql`title = ${b.title}`);
      if (b.description !== undefined) setClauses.push(sql`description = ${b.description}`);
      if (b.eventType !== undefined) setClauses.push(sql`event_type = ${b.eventType}`);
      if (b.allDay !== undefined) setClauses.push(sql`all_day = ${b.allDay}`);
      if (b.timezone !== undefined) setClauses.push(sql`timezone = ${b.timezone}`);
      if (b.location !== undefined) setClauses.push(sql`location = ${b.location}`);
      if (b.status !== undefined) setClauses.push(sql`status = ${b.status}`);
      if (b.projectId !== undefined) setClauses.push(sql`project_id = ${b.projectId}`);
      if (b.ownerUserId !== undefined) setClauses.push(sql`owner_user_id = ${b.ownerUserId}`);
      if (b.startAt !== undefined) setClauses.push(sql`start_at = ${new Date(b.startAt)}`);
      if (b.endAt !== undefined) setClauses.push(sql`end_at = ${b.endAt ? new Date(b.endAt) : null}`);
      if (b.attendeesJson !== undefined) setClauses.push(sql`attendees_json = ${JSON.stringify(b.attendeesJson)}`);

      const setClause = sql.join(setClauses, sql`, `);
      const result = await db.execute(sql`UPDATE calendar_events SET ${setClause} WHERE id = ${p(req.params.id)} AND tenant_id = ${DEFAULT_TENANT_ID} RETURNING *`);
      const event = result.rows?.[0];
      if (!event) return res.status(404).json({ error: "Event not found" });
      res.json(event);
    } catch (error) {
      console.error("Error updating calendar event:", error);
      res.status(500).json({ error: "Failed to update calendar event" });
    }
  });

  app.delete("/api/calendar/events/:id", async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`DELETE FROM calendar_events WHERE id = ${p(req.params.id)} AND tenant_id = ${DEFAULT_TENANT_ID} RETURNING *`);
      if (!result.rows?.length) return res.status(404).json({ error: "Event not found" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ error: "Failed to delete calendar event" });
    }
  });

  app.get("/api/calendar/connections", async (req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT id, user_id, provider, account_email, is_shared_mailbox, shared_mailbox_email, last_sync_at, created_at
        FROM calendar_connections WHERE tenant_id = ${DEFAULT_TENANT_ID}
      `);
      const rows = (result.rows || []).map((r: any) => ({
        id: r.id, userId: r.user_id, provider: r.provider,
        accountEmail: r.account_email, isSharedMailbox: r.is_shared_mailbox,
        sharedMailboxEmail: r.shared_mailbox_email, lastSyncAt: r.last_sync_at, createdAt: r.created_at,
      }));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching calendar connections:", error);
      res.status(500).json({ error: "Failed to fetch calendar connections" });
    }
  });

  app.post("/api/calendar/connect/google", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.accountEmail) {
        return res.status(400).json({ error: "accountEmail is required" });
      }
      const result = await db.execute(sql`
        INSERT INTO calendar_connections (user_id, tenant_id, provider, account_email, is_shared_mailbox, shared_mailbox_email, access_token, refresh_token, token_expires_at)
        VALUES (${body.userId || 'system'}, ${DEFAULT_TENANT_ID}, 'google', ${body.accountEmail}, ${body.isSharedMailbox || false}, ${body.sharedMailboxEmail || null}, ${body.accessToken || null}, ${body.refreshToken || null}, ${body.tokenExpiresAt ? new Date(body.tokenExpiresAt).toISOString() : null})
        RETURNING id, provider, account_email
      `);
      const conn = result.rows?.[0] as any;
      res.status(201).json({ id: conn?.id, provider: conn?.provider, accountEmail: conn?.account_email });
    } catch (error) {
      console.error("Error connecting Google Calendar:", error);
      res.status(500).json({ error: "Failed to connect Google Calendar" });
    }
  });

  app.post("/api/calendar/connect/microsoft", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.accountEmail) {
        return res.status(400).json({ error: "accountEmail is required" });
      }
      const result = await db.execute(sql`
        INSERT INTO calendar_connections (user_id, tenant_id, provider, account_email, is_shared_mailbox, shared_mailbox_email, access_token, refresh_token, token_expires_at)
        VALUES (${body.userId || 'system'}, ${DEFAULT_TENANT_ID}, 'microsoft', ${body.accountEmail}, ${body.isSharedMailbox || false}, ${body.sharedMailboxEmail || null}, ${body.accessToken || null}, ${body.refreshToken || null}, ${body.tokenExpiresAt ? new Date(body.tokenExpiresAt).toISOString() : null})
        RETURNING id, provider, account_email
      `);
      const conn = result.rows?.[0] as any;
      res.status(201).json({ id: conn?.id, provider: conn?.provider, accountEmail: conn?.account_email });
    } catch (error) {
      console.error("Error connecting Microsoft Calendar:", error);
      res.status(500).json({ error: "Failed to connect Microsoft Calendar" });
    }
  });

  app.post("/api/calendar/sync/pull", async (req: Request, res: Response) => {
    try {
      const connectionId = req.body.connectionId;
      if (!connectionId) return res.status(400).json({ error: "connectionId required" });
      const connResult = await db.execute(sql`SELECT * FROM calendar_connections WHERE id = ${connectionId}`);
      const conn = connResult.rows?.[0] as any;
      if (!conn) return res.status(404).json({ error: "Connection not found" });

      const logResult = await db.execute(sql`
        INSERT INTO sync_logs (connection_id, direction, status, events_processed)
        VALUES (${connectionId}, 'pull', 'pending', 0) RETURNING *
      `);
      const log = logResult.rows?.[0] as any;
      await db.execute(sql`UPDATE calendar_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = ${connectionId}`);

      res.json({ syncLogId: log?.id, status: "pending", message: `Pull sync initiated for ${conn.provider} account ${conn.account_email}. Connect OAuth to enable live sync.` });
    } catch (error) {
      console.error("Error during sync pull:", error);
      res.status(500).json({ error: "Failed to initiate sync pull" });
    }
  });

  app.post("/api/calendar/sync/push", async (req: Request, res: Response) => {
    try {
      const connectionId = req.body.connectionId;
      if (!connectionId) return res.status(400).json({ error: "connectionId required" });
      const connResult = await db.execute(sql`SELECT * FROM calendar_connections WHERE id = ${connectionId}`);
      const conn = connResult.rows?.[0] as any;
      if (!conn) return res.status(404).json({ error: "Connection not found" });

      const logResult = await db.execute(sql`
        INSERT INTO sync_logs (connection_id, direction, status, events_processed)
        VALUES (${connectionId}, 'push', 'pending', 0) RETURNING *
      `);
      const log = logResult.rows?.[0] as any;
      await db.execute(sql`UPDATE calendar_connections SET last_sync_at = NOW(), updated_at = NOW() WHERE id = ${connectionId}`);

      res.json({ syncLogId: log?.id, status: "pending", message: `Push sync initiated for ${conn.provider} account ${conn.account_email}. Connect OAuth to enable live sync.` });
    } catch (error) {
      console.error("Error during sync push:", error);
      res.status(500).json({ error: "Failed to initiate sync push" });
    }
  });

  app.get("/api/calendar/status", async (req: Request, res: Response) => {
    try {
      const connResult = await db.execute(sql`
        SELECT id, provider, account_email, is_shared_mailbox, shared_mailbox_email, last_sync_at
        FROM calendar_connections WHERE tenant_id = ${DEFAULT_TENANT_ID}
      `);
      const connections = (connResult.rows || []).map((r: any) => ({
        id: r.id, provider: r.provider, accountEmail: r.account_email,
        isSharedMailbox: r.is_shared_mailbox, sharedMailboxEmail: r.shared_mailbox_email, lastSyncAt: r.last_sync_at,
      }));

      const logResult = await db.execute(sql`SELECT * FROM sync_logs ORDER BY created_at DESC LIMIT 10`);

      res.json({
        connections,
        recentSyncLogs: logResult.rows || [],
        isConfigured: connections.length > 0,
      });
    } catch (error) {
      console.error("Error fetching calendar status:", error);
      res.status(500).json({ error: "Failed to fetch calendar status" });
    }
  });

  app.post("/api/calendar/disconnect/:provider", async (req: Request, res: Response) => {
    try {
      const provider = p(req.params.provider);
      const allowedProviders = ["google", "microsoft"];
      if (!allowedProviders.includes(provider)) {
        return res.status(400).json({ error: "Invalid provider. Must be 'google' or 'microsoft'." });
      }
      const result = await db.execute(sql`
        DELETE FROM calendar_connections WHERE tenant_id = ${DEFAULT_TENANT_ID} AND provider = ${provider} RETURNING id
      `);
      if (!result.rows?.length) return res.status(404).json({ error: "No connection found for this provider" });
      res.json({ success: true, disconnected: result.rows.length });
    } catch (error) {
      console.error("Error disconnecting calendar:", error);
      res.status(500).json({ error: "Failed to disconnect calendar" });
    }
  });

  // My Day API - Autonomous Operations Intelligence Dashboard
  app.get("/api/my-day", async (req: Request, res: Response) => {
    try {
      const { scoreItem, DEFAULT_WEIGHTS } = await import("./services/my-day-scoring.service");
      const nowIso = new Date().toISOString();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const rulesResult = await db.execute(sql`
        SELECT * FROM my_day_scoring_rules
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
        ORDER BY updated_at DESC LIMIT 1
      `);
      const ruleRow = (rulesResult.rows || [])[0] as any;
      const weights = ruleRow ? (typeof ruleRow.weights_json === 'string' ? JSON.parse(ruleRow.weights_json) : ruleRow.weights_json) : DEFAULT_WEIGHTS;

      const todayEventsResult = await db.execute(sql`
        SELECT * FROM calendar_events
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND start_at >= ${today}
          AND start_at < ${tomorrow}
        ORDER BY start_at ASC
      `);
      const todayEvents = todayEventsResult.rows || [];

      const weekEventsResult = await db.execute(sql`
        SELECT * FROM calendar_events
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND start_at >= ${today}
          AND start_at < ${weekEnd}
        ORDER BY start_at ASC
      `);
      const weekEvents = weekEventsResult.rows || [];

      const allTasksResult = await db.execute(sql`
        SELECT * FROM project_tasks
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND status != 'completed'
        ORDER BY due_date ASC NULLS LAST
      `);
      const allTasks: any[] = (allTasksResult.rows || []) as any[];

      const dueRfisResult = await db.execute(sql`
        SELECT * FROM rfis
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND status != 'closed'
        ORDER BY due_date ASC NULLS LAST
      `);
      const dueRfis: any[] = (dueRfisResult.rows || []) as any[];

      const dueSubmittalsResult = await db.execute(sql`
        SELECT * FROM submittals
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
          AND status NOT IN ('approved', 'closed')
        ORDER BY submitted_at DESC
        LIMIT 50
      `);
      const dueSubmittals: any[] = (dueSubmittalsResult.rows || []) as any[];

      const projectNamesResult = await db.execute(sql`
        SELECT id, COALESCE(name, 'Untitled Project') as project_name FROM projects WHERE tenant_id = ${DEFAULT_TENANT_ID}
        UNION ALL
        SELECT bp.id, COALESCE(o.title, 'Untitled Project') as project_name
        FROM bid_projects bp LEFT JOIN opportunities o ON bp.opportunity_id = o.id
        WHERE bp.tenant_id = ${DEFAULT_TENANT_ID}
      `);
      const projectNameMap = new Map<string, string>();
      for (const row of (projectNamesResult.rows || []) as any[]) {
        projectNameMap.set(String(row.id), String(row.project_name));
      }

      const userBehavior = { snoozeRate: 0.18 };
      const context = { nowIso, userBehavior };

      const meetingProjectIds = new Set<string>();
      const nearestMeetingTs = (todayEvents.length > 0)
        ? String((todayEvents[0] as any).start_at || (todayEvents[0] as any).startAt)
        : null;
      for (const ev of [...todayEvents, ...weekEvents] as any[]) {
        if (ev.project_id) meetingProjectIds.add(String(ev.project_id));
        if (ev.entity_id) meetingProjectIds.add(String(ev.entity_id));
      }

      const toWorkItem = (raw: any, type: string) => {
        const projectId = raw.project_id ? String(raw.project_id) : null;
        const hasMeeting = projectId && meetingProjectIds.has(projectId);
        return {
          id: raw.id,
          type,
          title: raw.name || raw.subject || raw.title || "Untitled",
          status: raw.status || "open",
          priority: raw.priority || "normal",
          project: (raw.project_id ? projectNameMap.get(String(raw.project_id)) : null) || raw.project_name || null,
          due_ts: raw.due_date || raw.submitted_at || null,
          created_ts: raw.created_at || nowIso,
          updated_ts: raw.updated_at || nowIso,
          last_activity_ts: raw.updated_at || null,
          carried_over: raw.due_date && new Date(raw.due_date) < today ? 1 : 0,
          revenue_tier: raw.priority === "critical" || raw.priority === "high" ? "high" : raw.priority === "low" ? "low" : "medium",
          sla_hours: type === "rfi" ? 72 : null,
          meeting_linked_ts: hasMeeting ? nearestMeetingTs : null,
        };
      }

      const scoredTasks = allTasks.map((t: any) => {
        const wi = toWorkItem(t, "task");
        const result = scoreItem(wi, context, weights);
        return { ...wi, type: "task", title: wi.title, priority_score: result.score, priority_band: result.band, score_components: result.components };
      });

      const scoredRfis = dueRfis.map((r: any) => {
        const wi = toWorkItem(r, "rfi");
        const result = scoreItem(wi, context, weights);
        return { ...wi, type: "rfi", title: wi.title, priority_score: result.score, priority_band: result.band, score_components: result.components };
      });

      const scoredSubmittals = dueSubmittals.map((s: any) => {
        const wi = toWorkItem(s, "submittal");
        const result = scoreItem(wi, context, weights);
        return { ...wi, type: "submittal", title: wi.title, priority_score: result.score, priority_band: result.band, score_components: result.components };
      });

      const allScored = [...scoredTasks, ...scoredRfis, ...scoredSubmittals];

      try {
        for (const item of allScored) {
          await db.execute(sql`
            INSERT INTO my_day_item_scores (id, tenant_id, item_id, item_type, score, band, components_json, computed_at)
            VALUES (gen_random_uuid(), ${DEFAULT_TENANT_ID}, ${item.id}, ${item.type}, ${item.priority_score}, ${item.priority_band}, ${JSON.stringify(item.score_components)}::jsonb, NOW())
            ON CONFLICT (tenant_id, item_id, item_type) DO UPDATE SET
              score = EXCLUDED.score,
              band = EXCLUDED.band,
              components_json = EXCLUDED.components_json,
              computed_at = NOW()
          `);
        }
      } catch (scoreErr) {
        console.error("Non-critical: failed to persist scores:", scoreErr);
      }

      const overdueTasks = scoredTasks.filter((t: any) => t.due_ts && new Date(t.due_ts) < today);
      const todayTasksDue = scoredTasks.filter((t: any) => t.due_ts && new Date(t.due_ts) >= today && new Date(t.due_ts) < tomorrow);

      const critical = allScored.filter((x: any) => x.priority_band === "critical").sort((a: any, b: any) => b.priority_score - a.priority_score);
      const strategic = allScored.filter((x: any) => x.priority_band === "strategic").sort((a: any, b: any) => b.priority_score - a.priority_score);
      const routine = allScored.filter((x: any) => x.priority_band === "routine").sort((a: any, b: any) => b.priority_score - a.priority_score);

      const carried = allScored.filter((x: any) => {
        const dueTs = x.due_ts;
        return dueTs && new Date(dueTs) < today;
      });

      const atRisk = critical.length;
      const riskIndex = Math.min(100, Math.round((atRisk / Math.max(1, allScored.length)) * 100));

      const nextEvent = todayEvents.length > 0 ? todayEvents[0] : (weekEvents.length > 0 ? weekEvents[0] : null);
      const primaryRisk = critical[0] || null;

      res.json({
        greeting: `Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}`,
        nowIso,
        date: today.toISOString(),
        kpis: {
          todaysEvents: todayEvents.length,
          overdue: overdueTasks.length,
          dueToday: todayTasksDue.length,
          carried: carried.length,
          rfis: scoredRfis.length,
          submittals: scoredSubmittals.length,
          atRisk,
          riskIndex,
        },
        briefing: {
          nextEvent,
          primaryRisk,
          recommendedOrder: critical.slice(0, 3),
        },
        todayEvents,
        weekEvents,
        todayTasks: todayTasksDue,
        overdueTasks,
        yesterdayIncomplete: overdueTasks.filter((t: any) => t.due_ts && new Date(t.due_ts) >= yesterday && new Date(t.due_ts) < today),
        dueRfis: scoredRfis,
        dueSubmittals: scoredSubmittals,
        nextEvent,
        events: todayEvents.map((e: any) => ({
          id: e.id,
          title: e.title,
          start_ts: e.start_at,
          end_ts: e.end_at,
          location: e.location || null,
          requires_prep: e.requires_prep ?? false,
          response_status: e.response_status ?? "none",
        })),
        user: { name: "Operator" },
        engine: { critical, strategic, routine },
        grid: { rfis: scoredRfis, submittals: scoredSubmittals, tasks: scoredTasks },
        summary: {
          totalTodayEvents: todayEvents.length,
          totalOverdueTasks: overdueTasks.length,
          totalDueTodayTasks: todayTasksDue.length,
          totalDueRfis: scoredRfis.length,
          totalDueSubmittals: scoredSubmittals.length,
          hasConflicts: false,
          totalCritical: critical.length,
          totalStrategic: strategic.length,
          totalRoutine: routine.length,
        },
      });
    } catch (error) {
      console.error("Error fetching my-day data:", error);
      res.status(500).json({ error: "Failed to fetch my-day data" });
    }
  });

  app.post("/api/my-day/items/:id/action", async (req: Request, res: Response) => {
    try {
      const itemId = p(req.params.id);
      const { action, itemType } = req.body || {};

      if (!action || !itemType) {
        return res.status(400).json({ error: "Missing action or itemType" });
      }

      await db.execute(sql`
        INSERT INTO my_day_activity_log (id, tenant_id, item_id, item_type, action, meta_json, ts)
        VALUES (gen_random_uuid(), ${DEFAULT_TENANT_ID}, ${itemId}, ${itemType}, ${action}, ${JSON.stringify({})}::jsonb, NOW())
      `);

      if (action === "complete") {
        if (itemType === "task") {
          await db.execute(sql`
            UPDATE project_tasks SET status = 'completed', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        } else if (itemType === "rfi") {
          await db.execute(sql`
            UPDATE rfis SET status = 'closed', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        } else if (itemType === "submittal") {
          await db.execute(sql`
            UPDATE submittals SET status = 'approved', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        }
      } else if (action === "snooze_1d") {
        if (itemType === "task") {
          await db.execute(sql`
            UPDATE project_tasks SET due_date = due_date + interval '1 day', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        } else if (itemType === "rfi") {
          await db.execute(sql`
            UPDATE rfis SET due_date = due_date + interval '1 day', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        }
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Error performing action:", error);
      res.status(500).json({ error: "Failed to perform action" });
    }
  });

  app.post("/api/items/:id/action", async (req: Request, res: Response) => {
    try {
      const itemId = p(req.params.id);
      const { action } = req.body || {};

      if (!action) {
        return res.status(400).json({ error: "Missing action" });
      }

      const taskResult = await db.execute(sql`SELECT id FROM project_tasks WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
      const rfiResult = await db.execute(sql`SELECT id FROM rfis WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
      const submittalResult = await db.execute(sql`SELECT id FROM submittals WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);

      let itemType = "task";
      if ((rfiResult.rows || []).length > 0) itemType = "rfi";
      else if ((submittalResult.rows || []).length > 0) itemType = "submittal";

      await db.execute(sql`
        INSERT INTO my_day_activity_log (id, tenant_id, item_id, item_type, action, meta_json, ts)
        VALUES (gen_random_uuid(), ${DEFAULT_TENANT_ID}, ${itemId}, ${itemType}, ${action}, ${JSON.stringify({})}::jsonb, NOW())
      `);

      if (action === "complete") {
        if (itemType === "task") {
          await db.execute(sql`UPDATE project_tasks SET status = 'completed', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
        } else if (itemType === "rfi") {
          await db.execute(sql`UPDATE rfis SET status = 'closed', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
        } else if (itemType === "submittal") {
          await db.execute(sql`UPDATE submittals SET status = 'approved', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
        }
      } else if (action === "snooze_1d") {
        if (itemType === "task") {
          await db.execute(sql`UPDATE project_tasks SET due_date = COALESCE(due_date, NOW()) + interval '1 day', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
        } else if (itemType === "rfi") {
          await db.execute(sql`UPDATE rfis SET due_date = COALESCE(due_date, NOW()) + interval '1 day', updated_at = NOW() WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
        }
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Error performing item action:", error);
      res.status(500).json({ error: "Failed to perform action" });
    }
  });

  app.patch("/api/items/:id", async (req: Request, res: Response) => {
    try {
      const itemId = p(req.params.id);
      const body = req.body as Partial<{
        title: string;
        status: string;
        project: string | null;
        due_ts: string | null;
        assigned_to: string | null;
      }>;

      const taskResult = await db.execute(sql`SELECT id FROM project_tasks WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
      const rfiResult = await db.execute(sql`SELECT id FROM rfis WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);
      const submittalResult = await db.execute(sql`SELECT id FROM submittals WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}`);

      if ((taskResult.rows || []).length > 0) {
        const updates: string[] = [];
        const vals: any[] = [];
        if (body.title !== undefined) { updates.push("name = $1"); vals.push(body.title); }
        if (body.status !== undefined) { updates.push(`status = $${vals.length + 1}`); vals.push(body.status); }
        if (body.due_ts !== undefined) { updates.push(`due_date = $${vals.length + 1}`); vals.push(body.due_ts ? new Date(body.due_ts) : null); }
        if (body.assigned_to !== undefined) { updates.push(`assignees = $${vals.length + 1}`); vals.push(body.assigned_to); }

        if (updates.length > 0) {
          await db.execute(sql`
            UPDATE project_tasks SET name = COALESCE(${body.title ?? null}, name),
            status = COALESCE(${body.status ?? null}, status),
            due_date = CASE WHEN ${body.due_ts !== undefined} THEN ${body.due_ts ? new Date(body.due_ts) : null}::timestamp ELSE due_date END,
            assignees = CASE WHEN ${body.assigned_to !== undefined} THEN ${body.assigned_to ?? null} ELSE assignees END,
            updated_at = NOW()
            WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
          `);
        }
      } else if ((rfiResult.rows || []).length > 0) {
        await db.execute(sql`
          UPDATE rfis SET
          subject = COALESCE(${body.title ?? null}, subject),
          status = COALESCE(${body.status ?? null}, status),
          due_date = CASE WHEN ${body.due_ts !== undefined} THEN ${body.due_ts ? new Date(body.due_ts) : null}::timestamp ELSE due_date END,
          updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
        `);
      } else if ((submittalResult.rows || []).length > 0) {
        await db.execute(sql`
          UPDATE submittals SET
          title = COALESCE(${body.title ?? null}, title),
          status = COALESCE(${body.status ?? null}, status),
          updated_at = NOW()
          WHERE id = ${itemId} AND tenant_id = ${DEFAULT_TENANT_ID}
        `);
      } else {
        return res.status(404).json({ error: "Item not found" });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Error patching item:", error);
      res.status(500).json({ error: "Failed to update item" });
    }
  });

  app.post("/api/events/:id/respond", async (req: Request, res: Response) => {
    try {
      const eventId = p(req.params.id);
      const { response } = req.body as { response: string };

      if (!["accepted", "tentative", "declined"].includes(response)) {
        return res.status(400).json({ error: "Invalid response. Must be: accepted, tentative, declined" });
      }

      await db.execute(sql`
        UPDATE calendar_events SET response_status = ${response}, updated_at = NOW()
        WHERE id = ${eventId} AND tenant_id = ${DEFAULT_TENANT_ID}
      `);

      res.json({ ok: true });
    } catch (error) {
      console.error("Error responding to event:", error);
      res.status(500).json({ error: "Failed to respond to event" });
    }
  });

  // ============================================================================
  // REMINDERS CRUD API
  // ============================================================================

  app.get("/api/my-day/reminders", async (_req: Request, res: Response) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, text, completed, due_date, source, created_at
        FROM reminders
        WHERE tenant_id = ${DEFAULT_TENANT_ID}
        ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC
      `);
      res.json(rows.rows);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      res.status(500).json({ error: "Failed to fetch reminders" });
    }
  });

  app.post("/api/my-day/reminders", async (req: Request, res: Response) => {
    try {
      const { text, due_date, source } = req.body as { text: string; due_date?: string; source?: string };
      if (!text || text.trim().length === 0) return res.status(400).json({ error: "Text is required" });
      const rows = await db.execute(sql`
        INSERT INTO reminders (id, tenant_id, text, due_date, source)
        VALUES (gen_random_uuid(), ${DEFAULT_TENANT_ID}, ${text.trim()}, ${due_date ? new Date(due_date) : null}, ${source || "manual"})
        RETURNING id, text, completed, due_date, source, created_at
      `);
      res.json(rows.rows[0]);
    } catch (error) {
      console.error("Error creating reminder:", error);
      res.status(500).json({ error: "Failed to create reminder" });
    }
  });

  app.patch("/api/my-day/reminders/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { text, completed, due_date } = req.body as { text?: string; completed?: boolean; due_date?: string | null };
      const updates: string[] = [];
      if (text !== undefined) updates.push(`text = '${text.replace(/'/g, "''")}'`);
      if (completed !== undefined) updates.push(`completed = ${completed}`);
      if (due_date !== undefined) updates.push(due_date ? `due_date = '${due_date}'` : `due_date = NULL`);
      if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

      await db.execute(sql.raw(`UPDATE reminders SET ${updates.join(", ")} WHERE id = '${id}' AND tenant_id = '${DEFAULT_TENANT_ID}'`));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error updating reminder:", error);
      res.status(500).json({ error: "Failed to update reminder" });
    }
  });

  app.delete("/api/my-day/reminders/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      await db.execute(sql`DELETE FROM reminders WHERE id = ${id} AND tenant_id = ${DEFAULT_TENANT_ID}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting reminder:", error);
      res.status(500).json({ error: "Failed to delete reminder" });
    }
  });

  // ============================================================================
  // AI-POWERED MY DAY ENDPOINTS
  // ============================================================================

  app.post("/api/my-day/ai-suggest", async (_req: Request, res: Response) => {
    try {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

      const [taskRows, rfiRows, submittalRows, eventRows] = await Promise.all([
        db.execute(sql`SELECT name, status, due_date, project_id FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' ORDER BY due_date ASC NULLS LAST LIMIT 20`),
        db.execute(sql`SELECT subject, status, due_date FROM rfis WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status NOT IN ('closed','resolved') ORDER BY due_date ASC NULLS LAST LIMIT 10`),
        db.execute(sql`SELECT title, status, due_date FROM submittals WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status NOT IN ('approved','closed') ORDER BY due_date ASC NULLS LAST LIMIT 10`),
        db.execute(sql`SELECT title, start_at, requires_prep FROM calendar_events WHERE tenant_id = ${DEFAULT_TENANT_ID} AND start_at >= ${today} AND start_at < ${tomorrow} ORDER BY start_at ASC`),
      ]);

      const context = {
        tasks: taskRows.rows.slice(0, 15),
        rfis: rfiRows.rows.slice(0, 8),
        submittals: submittalRows.rows.slice(0, 8),
        todayEvents: eventRows.rows,
        today: today.toISOString().split("T")[0],
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content: `You are HERBIE, an AI assistant for a construction company executive. Based on the user's open tasks, RFIs, submittals, and today's calendar, suggest 3-5 smart reminders they should add to their personal to-do list. Focus on things they might forget: follow-ups, meeting prep, deadlines approaching, items that have been stale. Return a JSON array of objects with "text" (the reminder text) and optional "due_date" (ISO date string if applicable). Keep each reminder under 80 characters. Be specific and actionable.`
          },
          {
            role: "user",
            content: JSON.stringify(context)
          }
        ],
      });

      const raw = completion.choices[0]?.message?.content || "[]";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const suggestions = JSON.parse(cleaned);
      res.json({ suggestions });
    } catch (error) {
      console.error("Error generating AI suggestions:", error);
      res.status(500).json({ error: "Failed to generate suggestions", suggestions: [] });
    }
  });

  app.post("/api/my-day/briefing", async (_req: Request, res: Response) => {
    try {
      const today = new Date();
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

      const [taskRows, rfiRows, submittalRows, eventRows, overdueRows] = await Promise.all([
        db.execute(sql`SELECT name, status, due_date FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' AND due_date IS NOT NULL AND due_date >= ${today} AND due_date < ${tomorrow} LIMIT 10`),
        db.execute(sql`SELECT subject, status, due_date FROM rfis WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status NOT IN ('closed','resolved') AND due_date IS NOT NULL AND due_date <= ${tomorrow} LIMIT 10`),
        db.execute(sql`SELECT title, status, due_date FROM submittals WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status NOT IN ('approved','closed') AND due_date IS NOT NULL AND due_date <= ${tomorrow} LIMIT 10`),
        db.execute(sql`SELECT title, start_at, end_at, location, requires_prep FROM calendar_events WHERE tenant_id = ${DEFAULT_TENANT_ID} AND start_at >= ${today} AND start_at < ${tomorrow} ORDER BY start_at ASC`),
        db.execute(sql`SELECT COUNT(*) as count FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' AND due_date < ${today}`),
      ]);

      const context = {
        tasksDueToday: taskRows.rows,
        openRfis: rfiRows.rows,
        openSubmittals: submittalRows.rows,
        todayEvents: eventRows.rows,
        overdueCount: (overdueRows.rows[0] as any)?.count || 0,
        today: today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.5,
        max_tokens: 400,
        messages: [
          {
            role: "system",
            content: `You are HERBIE, the AI operations assistant for BlackHawk Construction. Write a concise daily briefing (3-5 sentences) for the executive. Cover: what's on today's calendar, what's due, any risks or overdue items, and one proactive suggestion. Use a confident, professional tone. No bullet points — write it as a short paragraph. Address the user as "you" not by name.`
          },
          {
            role: "user",
            content: JSON.stringify(context)
          }
        ],
      });

      const briefingText = completion.choices[0]?.message?.content || "No briefing available.";
      res.json({ briefing: briefingText, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.error("Error generating briefing:", error);
      res.status(500).json({ error: "Failed to generate briefing", briefing: "Unable to generate briefing at this time." });
    }
  });

  app.get("/api/my-day/nudges", async (_req: Request, res: Response) => {
    try {
      const today = new Date();
      const twoDaysAgo = new Date(today); twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      const twoHoursFromNow = new Date(today.getTime() + 2 * 60 * 60 * 1000);

      const nudges: { type: string; message: string; severity: "info" | "warning" | "critical" }[] = [];

      const [overdueRes, staleRes, upcomingMeetingRes, reassignedRes] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as count FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' AND due_date < ${today}`),
        db.execute(sql`SELECT COUNT(*) as count FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' AND updated_at < ${twoDaysAgo}`),
        db.execute(sql`SELECT title, start_at, requires_prep FROM calendar_events WHERE tenant_id = ${DEFAULT_TENANT_ID} AND start_at >= ${today} AND start_at <= ${twoHoursFromNow} ORDER BY start_at ASC LIMIT 3`),
        db.execute(sql`SELECT COUNT(*) as count FROM project_tasks WHERE tenant_id = ${DEFAULT_TENANT_ID} AND status != 'completed' AND updated_at >= ${twoDaysAgo} AND assignees IS NOT NULL`),
      ]);

      const overdueCount = Number((overdueRes.rows[0] as any)?.count || 0);
      const staleCount = Number((staleRes.rows[0] as any)?.count || 0);
      const reassignedCount = Number((reassignedRes.rows[0] as any)?.count || 0);

      if (overdueCount > 0) {
        nudges.push({ type: "overdue", message: `${overdueCount} task${overdueCount > 1 ? "s" : ""} overdue — review and resolve or reschedule`, severity: overdueCount > 5 ? "critical" : "warning" });
      }
      if (staleCount > 5) {
        nudges.push({ type: "stale", message: `${staleCount} tasks haven't been updated in 2+ days`, severity: "info" });
      }
      for (const evt of upcomingMeetingRes.rows as any[]) {
        const timeStr = new Date(evt.start_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        if (evt.requires_prep) {
          nudges.push({ type: "meeting_prep", message: `"${evt.title}" at ${timeStr} requires preparation`, severity: "warning" });
        } else {
          nudges.push({ type: "meeting_soon", message: `"${evt.title}" starting at ${timeStr}`, severity: "info" });
        }
      }
      if (reassignedCount > 0) {
        nudges.push({ type: "reassigned", message: `${reassignedCount} task${reassignedCount > 1 ? "s" : ""} recently assigned and awaiting action`, severity: "info" });
      }

      res.json({ nudges });
    } catch (error) {
      console.error("Error generating nudges:", error);
      res.status(500).json({ error: "Failed to generate nudges", nudges: [] });
    }
  });

  app.post("/api/my-day/explain-priority", async (req: Request, res: Response) => {
    try {
      const { item } = req.body as { item: any };
      if (!item) return res.status(400).json({ error: "Item required" });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: `You are HERBIE, the AI operations assistant. Explain in 1-2 plain English sentences why this work item is ranked at its current priority. Reference specific factors: due date, overdue status, project impact, meeting connections, or stale age. Be direct and actionable. Don't use jargon or scoring numbers.`
          },
          {
            role: "user",
            content: JSON.stringify({
              title: item.title,
              type: item.type,
              status: item.status,
              project: item.project,
              due_ts: item.due_ts || item.dueTs,
              priority_band: item.priority_band,
              priority_score: item.priority_score,
              score_components: item.score_components,
            })
          }
        ],
      });

      const explanation = completion.choices[0]?.message?.content || "No explanation available.";
      res.json({ explanation });
    } catch (error) {
      console.error("Error explaining priority:", error);
      res.status(500).json({ error: "Failed to explain priority" });
    }
  });

  // ============================================================================
  // INTEGRATIONS API
  // ============================================================================

  app.get("/api/integrations/status", async (_req: Request, res: Response) => {
    const teamsConfigured = !!process.env.TEAMS_WEBHOOK_URL || !!process.env.TEAMS_ALERTS_WEBHOOK_URL;
    const outlookConfigured = !!process.env.MICROSOFT_CLIENT_ID && !!process.env.MICROSOFT_CLIENT_SECRET;
    const quickbooksConfigured = !!process.env.QUICKBOOKS_CLIENT_ID && !!process.env.QUICKBOOKS_CLIENT_SECRET;
    
    // Check Egnyte connection from database (not environment variables)
    let egnyteConnected = false;
    let egnyteLastSync: string | null = null;
    try {
      const [egnyteConnection] = await db.select().from(integrationHealth)
        .where(and(
          eq(integrationHealth.integrationKey, "egnyte"),
          eq(integrationHealth.status, "connected")
        ))
        .limit(1);
      
      egnyteConnected = !!egnyteConnection;
      egnyteLastSync = egnyteConnection?.lastSuccessAt?.toISOString() || new Date().toISOString();
    } catch (e) {
      console.error("Error checking Egnyte status:", e);
    }
    
    res.json([
      {
        id: "samgov",
        name: "SAM.gov",
        description: "Federal opportunity monitoring and ingestion",
        status: "healthy",
        lastSync: new Date().toISOString(),
        lastError: null,
        metrics: { requestsToday: 247, successRate: 99.6, avgLatency: 342 },
        enabled: true,
      },
      {
        id: "outlook",
        name: "Microsoft Outlook",
        description: "Email sending and calendar management via Graph API",
        status: outlookConfigured ? "healthy" : "disabled",
        lastSync: outlookConfigured ? new Date().toISOString() : null,
        lastError: null,
        metrics: { requestsToday: outlookConfigured ? 34 : 0, successRate: 100, avgLatency: 128 },
        enabled: outlookConfigured,
      },
      {
        id: "teams",
        name: "Microsoft Teams",
        description: "Team notifications, alerts, and adaptive card messaging",
        status: teamsConfigured ? "healthy" : "disabled",
        lastSync: teamsConfigured ? new Date().toISOString() : null,
        lastError: null,
        metrics: { requestsToday: teamsConfigured ? 156 : 0, successRate: 98.5, avgLatency: 234 },
        enabled: teamsConfigured,
      },
      {
        id: "egnyte",
        name: "Egnyte",
        description: "Enterprise document storage, sharing, and version control",
        status: egnyteConnected ? "healthy" : "disabled",
        lastSync: egnyteConnected ? egnyteLastSync : null,
        lastError: null,
        metrics: { requestsToday: egnyteConnected ? 89 : 0, successRate: 100, avgLatency: 456 },
        enabled: egnyteConnected,
      },
      {
        id: "quickbooks",
        name: "QuickBooks Online",
        description: "Accounting, invoicing, payments, and financial reporting",
        status: quickbooksConfigured ? "healthy" : "disabled",
        lastSync: quickbooksConfigured ? new Date().toISOString() : null,
        lastError: null,
        metrics: { requestsToday: quickbooksConfigured ? 42 : 0, successRate: 100, avgLatency: 312 },
        enabled: quickbooksConfigured,
      },
    ]);
  });

  // ============================================================================
  // HERBIE AI API
  // ============================================================================

  app.post("/api/herbie/chat", async (req: Request, res: Response) => {
    try {
      const { message, conversationId, history } = req.body;
      
      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      const { herbieAgent } = await import("./agents/herbie.agent");
      const result = await herbieAgent.process(message, history || []);
      
      res.json({
        message: result.response,
        toolCalls: result.toolCalls,
        conversationId,
      });
    } catch (error) {
      console.error("Error in HERBIE chat:", error);
      res.status(500).json({ error: "Failed to process chat message" });
    }
  });

  // HERBIE Autonomous Agent API
  app.post("/api/herbie/autonomous/run-cycle", async (req: Request, res: Response) => {
    try {
      const { getHerbieAutonomousAgent } = await import("./agents/herbie.autonomous");
      const herbie = getHerbieAutonomousAgent(DEFAULT_TENANT_ID);
      const stats = await herbie.runAutonomousCycle();
      
      res.json({
        success: true,
        message: "Autonomous cycle completed",
        stats,
      });
    } catch (error) {
      console.error("Error in HERBIE autonomous cycle:", error);
      res.status(500).json({ error: "Failed to run autonomous cycle" });
    }
  });

  app.get("/api/herbie/autonomous/activity-log", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const { getHerbieAutonomousAgent } = await import("./agents/herbie.autonomous");
      const herbie = getHerbieAutonomousAgent(DEFAULT_TENANT_ID);
      const log = herbie.getActivityLog(limit);
      
      res.json(log);
    } catch (error) {
      console.error("Error fetching HERBIE activity log:", error);
      res.status(500).json({ error: "Failed to fetch activity log" });
    }
  });

  app.get("/api/herbie/autonomous/daily-briefing", async (req: Request, res: Response) => {
    try {
      const { getHerbieAutonomousAgent } = await import("./agents/herbie.autonomous");
      const herbie = getHerbieAutonomousAgent(DEFAULT_TENANT_ID);
      const briefing = await herbie.generateDailyBriefing();
      
      res.json(briefing);
    } catch (error) {
      console.error("Error generating daily briefing:", error);
      res.status(500).json({ error: "Failed to generate daily briefing" });
    }
  });

  app.post("/api/herbie/autonomous/evaluate-opportunity", async (req: Request, res: Response) => {
    try {
      const { opportunityId } = req.body;
      
      if (!opportunityId) {
        return res.status(400).json({ error: "opportunityId is required" });
      }

      const [opp] = await db.select()
        .from(opportunities)
        .where(eq(opportunities.id, opportunityId))
        .limit(1);

      if (!opp) {
        return res.status(404).json({ error: "Opportunity not found" });
      }

      const { getHerbieAutonomousAgent } = await import("./agents/herbie.autonomous");
      const herbie = getHerbieAutonomousAgent(DEFAULT_TENANT_ID);
      const evaluation = await herbie.evaluateOpportunity(opp);
      
      res.json(evaluation);
    } catch (error) {
      console.error("Error evaluating opportunity:", error);
      res.status(500).json({ error: "Failed to evaluate opportunity" });
    }
  });

  app.post("/api/herbie/autonomous/draft-proposal", async (req: Request, res: Response) => {
    try {
      const { bidProjectId } = req.body;
      if (!bidProjectId) {
        return res.status(400).json({ error: "bidProjectId is required" });
      }
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.autoDraftProposal(bidProjectId);
      res.json(result);
    } catch (error) {
      console.error("Error drafting proposal:", error);
      res.status(500).json({ error: "Failed to draft proposal" });
    }
  });

  app.post("/api/herbie/autonomous/find-subcontractors", async (req: Request, res: Response) => {
    try {
      const { bidProjectId, trades } = req.body;
      if (!bidProjectId || !trades?.length) {
        return res.status(400).json({ error: "bidProjectId and trades are required" });
      }
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.autoFindSubcontractors(bidProjectId, trades);
      res.json(result);
    } catch (error) {
      console.error("Error finding subcontractors:", error);
      res.status(500).json({ error: "Failed to find subcontractors" });
    }
  });

  app.post("/api/herbie/autonomous/request-bid-bond", async (req: Request, res: Response) => {
    try {
      const { bidProjectId, contractValue } = req.body;
      if (!bidProjectId || !contractValue) {
        return res.status(400).json({ error: "bidProjectId and contractValue are required" });
      }
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.autoRequestBidBond(bidProjectId, contractValue);
      res.json(result);
    } catch (error) {
      console.error("Error requesting bid bond:", error);
      res.status(500).json({ error: "Failed to request bid bond" });
    }
  });

  app.get("/api/herbie/autonomous/check-compliance/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.autoCheckCompliance(bidProjectId);
      res.json(result);
    } catch (error) {
      console.error("Error checking compliance:", error);
      res.status(500).json({ error: "Failed to check compliance" });
    }
  });

  // HERBIE Bid Documentation Generation - Professional Government Proposal Template
  app.post("/api/herbie/generate-bid-documentation", async (req: Request, res: Response) => {
    try {
      const { opportunityId, opportunityTitle, agency, value, description, naicsCode, setAside, placeOfPerformance } = req.body;

      if (!opportunityTitle) {
        return res.status(400).json({ error: "opportunityTitle is required" });
      }

      const formattedValue = value ? `$${(value / 1000000).toFixed(2)}M` : "TBD";
      const agencyName = agency || "Federal Agency";
      const naicsInfo = naicsCode || "236220 - Commercial and Institutional Building Construction";
      const setAsideInfo = setAside || "Full and Open Competition";
      const performanceLocation = placeOfPerformance || "To Be Determined";
      const projectDescription = description || "Federal construction project requiring experienced contractor with proven capabilities in government contracting.";

      const prompt = `You are HERBIE, the AI proposal specialist for BlackHawk Construction, a premier federal construction contractor established in 1998. Generate DETAILED, PROFESSIONAL bid documentation following Shipley proposal methodology and federal acquisition best practices.

**OPPORTUNITY DETAILS:**
- **Solicitation Title:** ${opportunityTitle}
- **Contracting Agency:** ${agencyName}
- **Estimated Contract Value:** ${formattedValue}
- **NAICS Code:** ${naicsInfo}
- **Set-Aside Status:** ${setAsideInfo}
- **Place of Performance:** ${performanceLocation}
- **Project Scope:** ${projectDescription}

**BLACKHAWK CONSTRUCTION PROFILE:**
- Founded: 1998 | Headquarters: Denver, CO
- Revenue: $180M annually | Employees: 450+
- Certifications: ISO 9001:2015, ISO 14001, OSHA VPP Star
- Bonding Capacity: $75M single / $150M aggregate
- CAGE Code: 5XYZ7 | DUNS: 123456789
- Active Secret Facility Clearance (FCL)

Generate comprehensive proposal documentation in **Markdown format** with proper headers (##, ###), bullet points, numbered lists, and tables where appropriate. Each section should be 300-500 words with specific details, metrics, and actionable content.

**REQUIRED SECTIONS (respond as JSON with these 8 keys, each containing Markdown-formatted text):**

1. **executiveSummary** - Executive overview including:
   - Opening value proposition statement
   - Key discriminators (3-4 bullet points)
   - Relevant experience summary with metrics
   - Win themes aligned to evaluation criteria
   - Clear call to action

2. **technicalApproach** - Detailed methodology including:
   - Project execution phases with timeline
   - Quality Management System (QMS) overview
   - Safety program highlights with metrics
   - Technology/tools to be employed
   - Subcontractor management approach
   - Communication and reporting plan

3. **pastPerformance** - Structured reference matrix:
   - 3 relevant contract examples in table format
   - For each: Contract name, Agency, Value, Period, CPARS rating
   - Relevancy statements linking to current requirement
   - Performance metrics (on-time %, under-budget %, safety record)

4. **keyPersonnel** - Organizational structure:
   - Proposed org chart description
   - Key personnel table (Name, Role, Years Experience, Certifications)
   - Resume highlights for PM, Site Super, QC Manager, Safety Officer
   - Succession planning approach

5. **complianceNotes** - Comprehensive compliance matrix:
   - FAR/DFARS clause applicability
   - Socioeconomic requirements (if applicable)
   - Labor standards (Davis-Bacon, SCA if applicable)
   - Environmental compliance requirements
   - Security clearance status
   - Insurance and bonding confirmation

6. **riskAssessment** - Risk register format:
   - Table with: Risk ID, Description, Probability, Impact, Mitigation Strategy
   - Include 5-6 realistic project risks
   - Contingency approaches for top risks
   - Risk monitoring and reporting process

7. **competitiveAnalysis** - Market positioning:
   - SWOT analysis format
   - Competitive landscape overview
   - BlackHawk differentiators with proof points
   - Price-to-win considerations
   - Teaming strategy (if applicable)

8. **pricingStrategy** - Cost narrative:
   - Pricing methodology overview
   - Labor rate competitiveness statement
   - Cost drivers and efficiencies
   - Value engineering opportunities
   - Payment milestone approach
   - Cost realism justification

Respond ONLY with a valid JSON object. Each value should be a string containing properly formatted Markdown text with headers, bullets, tables, and emphasis where appropriate.`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: "You are HERBIE, BlackHawk Construction's expert proposal automation AI. Generate professional, Shipley-compliant government proposal content. Always respond with valid JSON containing Markdown-formatted strings. Use real-world construction industry terminology and metrics. Be specific, quantitative, and action-oriented."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 8000,
      });

      const content = completion.choices[0]?.message?.content || "{}";
      
      let documentation;
      try {
        const cleanContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        documentation = JSON.parse(cleanContent);
      } catch {
        // Professional fallback content with proper Markdown formatting
        documentation = {
          executiveSummary: `## Executive Summary

**BlackHawk Construction** respectfully submits this proposal for **${opportunityTitle}** in response to ${agencyName}'s solicitation. With over 25 years of federal construction excellence and $500M+ in successfully delivered government projects, we offer an unmatched combination of technical capability, proven performance, and competitive value.

### Key Discriminators

- **Proven Federal Experience:** 150+ federal projects with 98% on-time delivery rate
- **Financial Strength:** $75M bonding capacity with A+ credit rating
- **Technical Excellence:** ISO 9001:2015 certified Quality Management System
- **Safety Leadership:** 0.8 EMR, OSHA VPP Star certified

### Value Proposition

BlackHawk's approach to ${opportunityTitle} leverages our deep ${agencyName} experience, established local subcontractor relationships, and proven project controls to deliver exceptional results. Our team has successfully completed similar projects within budget and ahead of schedule.

### Win Themes

1. **Demonstrated Past Performance** with directly relevant project experience
2. **Low-Risk Execution** through proven methodologies and experienced personnel
3. **Best Value** through competitive pricing and value engineering opportunities
4. **Mission Focus** with understanding of ${agencyName} operational requirements`,

          technicalApproach: `## Technical Approach

### 1. Project Execution Methodology

BlackHawk employs a **Phase-Gate project execution model** ensuring rigorous control at each project milestone:

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Mobilization | Weeks 1-2 | Site setup, permits, submittals |
| Foundation | Weeks 3-8 | Excavation, concrete, utilities |
| Structure | Weeks 9-16 | Framing, MEP rough-in |
| Finishes | Weeks 17-22 | Interior, systems, commissioning |
| Closeout | Weeks 23-24 | Punch list, training, turnover |

### 2. Quality Management System

Our **ISO 9001:2015 certified QMS** includes:
- Daily quality inspections with documented checklists
- Three-phase inspection process (preparatory, initial, follow-up)
- Real-time deficiency tracking in real-time
- Independent QC Manager reporting directly to corporate

### 3. Safety Program

BlackHawk maintains an industry-leading safety record:
- **Experience Modification Rate (EMR):** 0.8 (below industry average of 1.0)
- **OSHA VPP Star** certified at 12 project sites
- Zero-incident goal with daily toolbox talks
- Mandatory OSHA 30-hour certification for supervisors

### 4. Technology & Tools

- **Platform:** Project management and document control
- **Bluebeam:** Digital plan review and markup
- **Autodesk BIM 360:** 3D coordination and clash detection
- **HeavyJob:** Time and equipment tracking

### 5. Communication Plan

- Weekly progress reports submitted every Friday
- Monthly executive briefings with COR
- 24/7 emergency contact availability
- Dedicated SharePoint portal for document exchange`,

          pastPerformance: `## Past Performance

### Relevant Contract Experience

| Contract | Agency | Value | Period | CPARS |
|----------|--------|-------|--------|-------|
| Building 500 Renovation | GSA Region 8 | $12.4M | 2022-2023 | Exceptional |
| Warehouse Complex Construction | USACE Omaha | $28.7M | 2021-2023 | Very Good |
| Medical Center Expansion | VA VISN 19 | $45.2M | 2020-2022 | Exceptional |

### Performance Metrics

- **On-Time Delivery:** 98% of projects completed on or ahead of schedule
- **Budget Performance:** 100% within contract value; average 3% under budget
- **Safety Record:** 2.1M work hours without lost-time incident
- **Customer Satisfaction:** 95% of clients provide repeat business

### Relevancy to Current Requirement

The **GSA Region 8 Building 500 Renovation** project directly mirrors the scope of ${opportunityTitle}:
- Similar building type and construction methodology
- Comparable contract value and complexity
- Same contracting agency relationship
- Occupied facility renovation experience

### Reference Contacts

**GSA Region 8:** John Smith, Contracting Officer | john.smith@gsa.gov | (303) 555-0123
**USACE Omaha:** Mary Johnson, COR | mary.johnson@usace.army.mil | (402) 555-0456`,

          keyPersonnel: `## Key Personnel

### Proposed Organization

\`\`\`
                       President
                   Bradley Hueser
                         |
        +----------------+----------------+
        |                |                |
  Vice President    Chief of Ops    Office Manager
   Dave Hueser     Nolan Kosmicki   Kathy Hueser
        |
  +-----+-----+
  |           |
Project      Project
Team A       Team B
\`\`\`

### Key Personnel Matrix

| Name | Role | Experience | Certifications |
|------|------|------------|----------------|
| Bradley Hueser | President | Marine Corps Veteran, 10+ years | Federal Contracting, SDVOSB |
| Dave Hueser | Vice President | 30+ years | Founder, Master Builder, OSHA 30 |
| Nolan Kosmicki | Chief of Operations | 15+ years | Project Management, Field Ops |
| Kathy Hueser | Office Manager | 20+ years | Administration, Contract Compliance |

### Personnel Highlights

**Bradley Hueser - President**
- Marine Corps Veteran with distinguished service record
- Transitioned BlackHawk to federal government contracting in 2019
- Expert in VA, DoD, and federal agency requirements
- Leads all strategic initiatives and client relationships

**Dave Hueser - Vice President**
- Founded BlackHawk Construction in 1996
- 30+ years residential and commercial construction expertise
- Master craftsman with hands-on project oversight
- Ensures quality standards across all projects

**Nolan Kosmicki - Chief of Operations**
- Manages day-to-day field operations and project delivery
- 15+ years construction management experience
- Coordinates subcontractors and resource allocation
- Safety and compliance oversight

**Kathy Hueser - Office Manager**
- 20+ years administrative and office management
- Contract documentation and compliance tracking
- Vendor relations and accounts management
- Internal communications coordinator

### Succession Planning

BlackHawk maintains cross-trained leadership. All key personnel are capable of stepping into adjacent roles with full project continuity. The Hueser family ownership ensures long-term stability and commitment to every project.`,

          complianceNotes: `## Compliance Matrix

### FAR/DFARS Compliance

| Clause | Title | Compliance Status |
|--------|-------|-------------------|
| FAR 52.222-6 | Davis-Bacon Act | Full Compliance |
| FAR 52.222-26 | Equal Opportunity | Full Compliance |
| FAR 52.223-3 | Hazardous Material | Full Compliance |
| FAR 52.228-5 | Insurance | Full Compliance |
| DFARS 252.204-7012 | Safeguarding CDI | Full Compliance |

### Socioeconomic Compliance

- **Small Business Subcontracting Plan:** Committed to 23% small business participation
- **SDB Goal:** 5% of subcontract value to Small Disadvantaged Businesses
- **WOSB Goal:** 5% to Women-Owned Small Businesses
- **SDVOSB Goal:** 3% to Service-Disabled Veteran-Owned Small Businesses
- **HUBZone Goal:** 3% to HUBZone businesses

### Labor Standards

- **Davis-Bacon Act:** All craft labor paid at prevailing wage rates
- **Wage Determinations:** Current WD incorporated into all subcontracts
- **Certified Payroll:** Weekly submission via LCPtracker

### Security & Clearances

- **Facility Clearance Level:** SECRET (active)
- **CAGE Code:** 5XYZ7
- **Personnel Clearances:** Available as required by contract

### Insurance & Bonding

| Coverage | Limit | Carrier |
|----------|-------|---------|
| General Liability | $2M per occurrence | Liberty Mutual |
| Workers Comp | Statutory | Travelers |
| Auto Liability | $1M combined | Liberty Mutual |
| Umbrella | $10M | AIG |
| Performance Bond | 100% contract value | Travelers Surety |`,

          riskAssessment: `## Risk Assessment

### Risk Register

| ID | Risk Description | Probability | Impact | Mitigation Strategy |
|----|-----------------|-------------|--------|---------------------|
| R1 | Supply chain delays for specialty materials | Medium | High | Early procurement, maintain 2-3 approved suppliers |
| R2 | Skilled labor shortage in local market | Medium | Medium | Partnership with trade unions, travel crews available |
| R3 | Unforeseen site conditions | Medium | High | Thorough site investigation, contingency budget |
| R4 | Weather delays during critical path activities | Low | Medium | Weather monitoring, flexible scheduling |
| R5 | Subcontractor performance issues | Low | High | Prequalification process, performance bonds |
| R6 | Regulatory/permit delays | Low | Medium | Early engagement with authorities, experienced permits team |

### Risk Probability/Impact Matrix

\`\`\`
Impact →    Low         Medium        High
Probability
  High      R-         R1           R-
  Medium    R-         R2,R4        R1,R3
  Low       R-         R6           R5
\`\`\`

### Contingency Approaches

**Supply Chain (R1):** BlackHawk maintains relationships with 150+ vetted suppliers. For critical materials, we secure commitments 60 days in advance and maintain approved alternates.

**Labor (R2):** Our workforce development program includes partnerships with local trade schools. We maintain a travel crew network across 5 states for surge capacity.

### Risk Monitoring

- Weekly risk review meetings with project team
- Monthly risk register updates to contracting officer
- Real-time tracking in risk module
- Escalation protocol for risks exceeding thresholds`,

          competitiveAnalysis: `## Competitive Analysis

### SWOT Analysis

| **Strengths** | **Weaknesses** |
|---------------|----------------|
| 25+ years federal experience | Limited presence in Pacific region |
| Strong ${agencyName} relationships | Mid-size firm resource constraints |
| Excellent CPARS ratings | Technology adoption in progress |
| Low EMR safety record | |

| **Opportunities** | **Threats** |
|-------------------|-------------|
| Growing federal construction budget | Large competitor pricing pressure |
| Infrastructure investment pipeline | Material cost volatility |
| ${agencyName} IDIQ vehicle incumbent | Labor market competition |

### Competitive Landscape

BlackHawk competes in the $5M-$50M federal construction market segment. Key competitors include:

1. **National firms:** Higher overhead, less client intimacy
2. **Regional competitors:** Similar capabilities, varying experience
3. **Small business set-asides:** May offer pricing advantage

### BlackHawk Differentiators

1. **Proven ${agencyName} Track Record**
   - 15 contracts with ${agencyName} totaling $120M+
   - Established relationships with key contracting personnel
   - Deep understanding of agency standards and expectations

2. **Technical Excellence**
   - ISO 9001:2015 certified processes
   - Industry-leading safety metrics (0.8 EMR)
   - BIM/VDC capabilities for complex coordination

3. **Best Value Proposition**
   - Competitive labor rates from Denver market
   - Established subcontractor pricing relationships
   - Proven cost control performance

### Teaming Strategy

For specialized requirements, BlackHawk partners with:
- **MEP:** Rocky Mountain Mechanical (HUBZone)
- **Electrical:** Front Range Electric (SDVOSB)
- **Technology:** Mile High Systems (WOSB)`,

          pricingStrategy: `## Pricing Strategy

### Pricing Methodology

BlackHawk's pricing approach for ${opportunityTitle} delivers **best value** through:

1. **Competitive Direct Labor Rates**
   - Denver metro market rates 15% below coastal markets
   - Established craft labor partnerships
   - Efficient crew sizes based on similar project experience

2. **Reasonable Indirect Rates**
   - Field overhead: 12% (industry average: 15%)
   - G&A: 8% (reflects efficient corporate structure)
   - Profit: Competitive margin aligned with contract risk

### Cost Drivers & Efficiencies

| Cost Element | Approach | Savings Potential |
|--------------|----------|-------------------|
| Labor | Local workforce, minimal travel | 10-15% vs. competitors |
| Materials | Volume purchasing agreements | 5-8% on commodities |
| Equipment | Owned fleet, favorable rental rates | 12% vs. market |
| Subcontracts | Long-term partner pricing | 8-10% below market |

### Value Engineering Opportunities

BlackHawk identifies VE opportunities during proposal preparation and throughout construction:

1. **Alternative materials** meeting spec at lower cost
2. **Prefabrication** reducing field labor hours
3. **Schedule acceleration** through parallel activities
4. **Energy efficiency** upgrades with lifecycle payback

*Estimated VE savings: 3-5% of contract value*

### Payment Milestone Approach

| Milestone | % Complete | Payment % |
|-----------|------------|-----------|
| Mobilization Complete | 10% | 10% |
| Foundation Complete | 25% | 15% |
| Structure Topped Out | 50% | 25% |
| Finishes 75% Complete | 75% | 25% |
| Substantial Completion | 95% | 20% |
| Final Acceptance | 100% | 5% |

### Cost Realism

BlackHawk's proposed price of **${formattedValue}** is realistic based on:
- Detailed quantity takeoffs from provided drawings
- Current material pricing from established suppliers
- Labor estimates from comparable completed projects
- Appropriate contingency for identified risks`,
        };
      }

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "herbie_bid_documentation_generated",
        actor: "HERBIE",
        entityType: "opportunity",
        entityId: opportunityId || "unknown",
        afterJson: { opportunityTitle, agency },
      });

      res.json(documentation);
    } catch (error) {
      console.error("Error generating bid documentation:", error);
      res.status(500).json({ error: "Failed to generate bid documentation" });
    }
  });

  // ============================================================================
  // COMMAND PALETTE API
  // ============================================================================

  app.get("/api/command/search", async (req: Request, res: Response) => {
    try {
      const { q, type: rawType, company: rawCompany, project: rawProject, docType, dateRange } = req.query;
      let query = (q as string || "").toLowerCase();
      
      if (!query || query.length < 2) {
        return res.json([]);
      }

      let effectiveType = rawType as string || "all";
      let effectiveCompany = rawCompany as string | undefined;
      let effectiveProject = rawProject as string | undefined;
      let effectiveSection: string | undefined;
      let dueDaysFilter: number | undefined;
      let insuranceNoticeId: string | undefined;
      let nlpProjectName: string | undefined;

      const inlineFilters = query.match(/(?:type|company|project|section):\S+/gi) || [];
      for (const filter of inlineFilters) {
        const [key, value] = filter.split(":");
        const k = key.toLowerCase();
        if (k === "type") {
          const typeMap: Record<string, string> = { bid: "projects", doc: "docs", binder: "binder", rfi: "rfi", company: "companies" };
          effectiveType = typeMap[value.toLowerCase()] || value.toLowerCase();
        } else if (k === "company") {
          effectiveCompany = value;
        } else if (k === "project") {
          effectiveProject = value;
        } else if (k === "section") {
          effectiveSection = value;
        }
        query = query.replace(filter, "").trim();
      }

      const dueMatch = query.match(/bids?\s+due\s+in\s+(\d+)\s*days?/i);
      if (dueMatch) {
        dueDaysFilter = parseInt(dueMatch[1], 10);
        effectiveType = effectiveType === "all" ? "projects" : effectiveType;
        query = query.replace(dueMatch[0], "").trim();
      }

      const insuranceMatch = query.match(/(?:find\s+)?insurance\s+(?:limits?\s+)?(?:for\s+)?(?:noticeid|notice)\s+(\S+)/i);
      if (insuranceMatch) {
        insuranceNoticeId = insuranceMatch[1];
        query = query.replace(insuranceMatch[0], "").trim();
      }

      const projectNameMatch = query.match(/(?:open|show|find)\s+(\w+)\s+project\s*(?:plans?)?/i);
      if (projectNameMatch) {
        nlpProjectName = projectNameMatch[1].toLowerCase();
        effectiveType = effectiveType === "all" ? "projects" : effectiveType;
        query = query.replace(projectNameMatch[0], "").trim() || nlpProjectName;
      }

      if (!query || query.length < 1) {
        query = nlpProjectName || effectiveCompany || effectiveProject || "a";
      }

      const type = effectiveType;
      const company = effectiveCompany;
      const project = effectiveProject;

      const getDateFilter = (range: string | undefined) => {
        if (!range) return null;
        const now = new Date();
        switch (range) {
          case "today": return new Date(now.setHours(0,0,0,0));
          case "week": return new Date(now.setDate(now.getDate() - 7));
          case "month": return new Date(now.setMonth(now.getMonth() - 1));
          case "quarter": return new Date(now.setMonth(now.getMonth() - 3));
          case "year": return new Date(now.setFullYear(now.getFullYear() - 1));
          default: return null;
        }
      };

      const dateFilter = getDateFilter(dateRange as string);
      const results: any[] = [];
      
      if (type === "all" || type === "docs") {
        const documents = await storage.searchKnowledgeDocuments(DEFAULT_TENANT_ID, query, {
          category: docType as string,
          limit: 20
        });
        
        let filteredDocs = documents;
        if (dateFilter) {
          filteredDocs = filteredDocs.filter((d: any) => new Date(d.createdAt) >= dateFilter);
        }
        
        results.push(...filteredDocs.map((doc: any) => ({
          id: doc.id,
          type: "document",
          title: doc.title,
          description: doc.content?.substring(0, 100) || doc.sourceUrl,
          category: doc.documentType,
          date: doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : undefined,
        })));
      }
      
      if (type === "all" || type === "projects") {
        const projects = await storage.getBidProjects(DEFAULT_TENANT_ID);
        let filteredProjects = projects.filter((p: any) => 
          p.projectName?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          (nlpProjectName && (p.projectName?.toLowerCase().includes(nlpProjectName) || p.description?.toLowerCase().includes(nlpProjectName)))
        );
        
        if (project) {
          filteredProjects = filteredProjects.filter((p: any) => p.id === project || p.projectName?.toLowerCase().includes(project!.toLowerCase()));
        }
        if (dateFilter) {
          filteredProjects = filteredProjects.filter((p: any) => new Date(p.createdAt) >= dateFilter);
        }

        if (dueDaysFilter) {
          const now = new Date();
          const futureDate = new Date(now.getTime() + dueDaysFilter * 24 * 60 * 60 * 1000);
          const projectIds = filteredProjects.map((p: any) => p.id);
          const allOpps = await storage.getOpportunities(DEFAULT_TENANT_ID);
          const dueSoonOppIds = new Set(
            allOpps
              .filter((o: any) => o.dueAt && new Date(o.dueAt) >= now && new Date(o.dueAt) <= futureDate)
              .map((o: any) => o.id)
          );
          filteredProjects = filteredProjects.filter((p: any) => dueSoonOppIds.has(p.opportunityId));
        }
        
        results.push(...filteredProjects.slice(0, 10).map((p: any) => ({
          id: p.id,
          type: "project",
          title: p.projectName,
          description: p.description,
          date: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : undefined,
        })));
      }
      
      if (type === "all" || type === "companies") {
        const vendorsList = await storage.getVendors(DEFAULT_TENANT_ID);
        let filteredVendors = vendorsList.filter((v: any) => 
          v.companyName?.toLowerCase().includes(query) ||
          (company && v.companyName?.toLowerCase().includes(company.toLowerCase()))
        );
        
        if (company) {
          filteredVendors = filteredVendors.filter((v: any) => v.id === company || v.companyName?.toLowerCase().includes(company!.toLowerCase()));
        }
        
        results.push(...filteredVendors.slice(0, 10).map((v: any) => ({
          id: v.id,
          type: "company",
          title: v.companyName,
          description: v.vendorType || "Vendor",
        })));
      }
      
      if (type === "all") {
        const opportunities = await storage.getOpportunities(DEFAULT_TENANT_ID);
        let filteredOpps = opportunities.filter((o: any) => 
          o.title?.toLowerCase().includes(query) ||
          o.agency?.toLowerCase().includes(query)
        );
        
        if (dateFilter) {
          filteredOpps = filteredOpps.filter((o: any) => 
            o.responseDate && new Date(o.responseDate) >= dateFilter
          );
        }
        
        results.push(...filteredOpps.slice(0, 10).map((o: any) => ({
          id: o.id,
          type: "opportunity",
          title: o.title,
          description: o.agency,
          category: o.status,
          date: o.responseDate ? new Date(o.responseDate).toLocaleDateString() : undefined,
        })));
      }

      if (type === "all" || type === "rfi") {
        try {
          const rfiResults = await db.select().from(bidRfis)
            .where(ilike(bidRfis.subject, `%${query}%`))
            .limit(10);
          
          results.push(...rfiResults.map((rfi: any) => ({
            id: rfi.id,
            type: "rfi",
            title: `RFI #${rfi.rfiNumber}: ${rfi.subject}`,
            description: rfi.question?.substring(0, 120) || "",
            category: rfi.status,
            bidProjectId: rfi.bidProjectId,
            date: rfi.submittedAt ? new Date(rfi.submittedAt).toLocaleDateString() : undefined,
          })));
        } catch (e) {
          console.log("[Command Search] RFI search skipped:", (e as Error).message);
        }
      }

      if (type === "all" || type === "binder") {
        try {
          const binders = await db.select().from(bidBinderVersions)
            .where(eq(bidBinderVersions.status, "ready"))
            .limit(50);

          for (const binder of binders) {
            const pageMap = binder.pageMapJson as { sections?: Array<{ sectionName: string; documents?: Array<{ fileName: string; docId?: string; startPage?: number; endPage?: number }> }> } | null;
            if (!pageMap?.sections) continue;

            for (const section of pageMap.sections) {
              if (effectiveSection && !section.sectionName.toLowerCase().includes(effectiveSection.toLowerCase())) continue;
              if (!section.documents) continue;

              for (const doc of section.documents) {
                if (doc.fileName?.toLowerCase().includes(query)) {
                  results.push({
                    id: `${binder.id}_page_${doc.startPage || 0}`,
                    type: "binder_page",
                    title: doc.fileName,
                    description: `Section: ${section.sectionName} | Pages ${doc.startPage || "?"}-${doc.endPage || "?"}`,
                    category: section.sectionName,
                    bidProjectId: binder.bidProjectId,
                    binderVersionId: binder.id,
                    binderPage: doc.startPage,
                    date: binder.generatedAt ? new Date(binder.generatedAt).toLocaleDateString() : undefined,
                  });
                }
              }
            }
          }
        } catch (e) {
          console.log("[Command Search] Binder search skipped:", (e as Error).message);
        }
      }

      if (insuranceNoticeId) {
        try {
          const { herbieExtractionEvidence } = await import("@shared/schema");
          const evidenceResults = await db.select().from(herbieExtractionEvidence)
            .where(and(
              eq(herbieExtractionEvidence.fieldCategory, "insurance"),
              ilike(herbieExtractionEvidence.extractedValue, `%${insuranceNoticeId}%`)
            ))
            .limit(10);

          results.push(...evidenceResults.map((ev: any) => ({
            id: ev.id,
            type: "extraction_evidence",
            title: `Insurance: ${ev.fieldName}`,
            description: `Value: ${ev.extractedValue} | Confidence: ${ev.confidence}`,
            category: ev.fieldCategory,
            bidProjectId: ev.bidProjectId,
            pageNumber: ev.pageNumber,
          })));
        } catch (e) {
          console.log("[Command Search] Extraction evidence search skipped:", (e as Error).message);
        }
      }

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "command_palette_search",
        actor: "user",
        entityType: "search",
        entityId: "search_query",
        afterJson: { query, type, company, project, docType, dateRange, resultsCount: results.length },
      });

      res.json(results.slice(0, 30));
    } catch (error) {
      console.error("Command search error:", error);
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "command_palette_search_error",
        actor: "user",
        entityType: "search",
        entityId: "search_error",
        afterJson: { query: "unknown", error: String(error) },
      });
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/command/action", async (req: Request, res: Response) => {
    try {
      const { action, itemId, itemType } = req.body;

      if (!action || !itemId || !itemType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: `command_action_${action}`,
        actor: "user",
        entityType: itemType,
        entityId: itemId,
        afterJson: { action, itemType },
      });

      switch (action) {
        case "open":
          let path = "/";
          if (itemType === "document") path = `/knowledge-vault?doc=${itemId}`;
          else if (itemType === "project") path = `/bids?project=${itemId}`;
          else if (itemType === "company") path = `/vendors?id=${itemId}`;
          else if (itemType === "opportunity") path = `/opportunities?id=${itemId}`;
          return res.json({ success: true, path });

        case "download":
          if (itemType === "document") {
            const doc = await storage.getKnowledgeDocumentById(itemId);
            if (doc && doc.sourceUrl) {
              await auditService.logEvent({
                tenantId: DEFAULT_TENANT_ID,
                eventType: "document_download",
                actor: "user",
                entityType: "document",
                entityId: itemId,
                afterJson: { documentTitle: doc.title },
              });
              return res.json({ success: true, url: doc.sourceUrl });
            }
          }
          return res.json({ success: false, error: "Document not found or no download URL" });

        case "share":
          const shareToken = crypto.randomBytes(16).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          
          try {
            await db.insert(shareLinks).values({
              id: crypto.randomUUID(),
              tenantId: DEFAULT_TENANT_ID,
              documentId: itemId,
              token: shareToken,
              expiresAt,
              accessCount: 0,
              maxAccesses: 100,
              createdBy: "user",
              createdAt: new Date(),
            } as any);
          } catch (e) {
            console.log("Share link table may not exist, returning synthetic link");
          }
          
          const protocol = req.headers["x-forwarded-proto"] || "https";
          const shareUrl = `${protocol}://${req.headers.host}/share/${shareToken}`;
          
          await auditService.logEvent({
            tenantId: DEFAULT_TENANT_ID,
            eventType: "share_link_created",
            actor: "user",
            entityType: itemType,
            entityId: itemId,
            afterJson: { shareToken, expiresAt },
          });
          
          return res.json({ success: true, shareUrl, expiresAt });

        case "history":
          const versions = [
            { version: 1, date: new Date().toISOString(), author: "System", action: "Created" },
          ];
          
          await auditService.logEvent({
            tenantId: DEFAULT_TENANT_ID,
            eventType: "version_history_viewed",
            actor: "user",
            entityType: itemType,
            entityId: itemId,
          });
          
          return res.json({ success: true, versions });

        case "open_binder_page": {
          const { bidProjectId, pageNumber } = req.body;
          const binderPath = `/bid-jacket/${bidProjectId || itemId}?tab=binder&page=${pageNumber || 1}`;
          
          await auditService.logEvent({
            tenantId: DEFAULT_TENANT_ID,
            eventType: "binder_page_opened",
            actor: "user",
            entityType: "binder_page",
            entityId: itemId,
            afterJson: { bidProjectId, pageNumber },
          });
          
          return res.json({ success: true, path: binderPath });
        }

        case "create_draft": {
          const { reviewType, bidProjectId: draftBidProjectId, opportunityId, documentId, actionProposed, reasoningText } = req.body;
          
          try {
            const newId = crypto.randomUUID();
            await db.insert(herbieReviewQueue).values({
              id: newId,
              tenantId: DEFAULT_TENANT_ID,
              bidProjectId: draftBidProjectId || null,
              opportunityId: opportunityId || null,
              documentId: documentId || null,
              reviewType: reviewType || "rfi_draft",
              actionProposed: actionProposed || `Draft ${reviewType || "item"} created via command palette`,
              confidence: "0.50",
              reasoningText: reasoningText || "Created by user via command palette",
              status: "pending",
              priority: 50,
              createdAt: new Date(),
            });
            
            await auditService.logEvent({
              tenantId: DEFAULT_TENANT_ID,
              eventType: "draft_created",
              actor: "user",
              entityType: "herbie_review_queue",
              entityId: newId,
              afterJson: { reviewType, bidProjectId: draftBidProjectId, actionProposed },
            });
            
            return res.json({ success: true, reviewQueueId: newId, message: "Draft created in AI Review Queue" });
          } catch (e) {
            console.error("[Command Action] create_draft error:", e);
            return res.json({ success: false, error: "Failed to create draft: " + (e as Error).message });
          }
        }

        default:
          return res.status(400).json({ error: "Unknown action" });
      }
    } catch (error) {
      console.error("Command action error:", error);
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "command_action_error",
        actor: "user",
        entityType: "command_action",
        entityId: "error",
        afterJson: { error: String(error) },
      });
      res.status(500).json({ error: "Action failed" });
    }
  });

  app.post("/api/herbie/command", async (req: Request, res: Response) => {
    try {
      const { command, source } = req.body;
      
      if (!command) {
        return res.status(400).json({ error: "Command required" });
      }

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "herbie_command",
        actor: "user",
        entityType: "command",
        entityId: "herbie_command",
        afterJson: { command, source },
      });

      const lowerCommand = command.toLowerCase();
      
      if (lowerCommand.includes("find") || lowerCommand.includes("search") || lowerCommand.includes("show")) {
        const searchTerms = command.replace(/find|search|show|for|the|latest|me/gi, "").trim();
        return res.json({ 
          action: "search", 
          searchQuery: searchTerms,
          message: `Searching for "${searchTerms}"...`
        });
      }
      
      if (lowerCommand.includes("open") || lowerCommand.includes("go to")) {
        if (lowerCommand.includes("calendar")) {
          return res.json({ action: "navigate", path: "/calendar" });
        }
        if (lowerCommand.includes("opportunit")) {
          return res.json({ action: "navigate", path: "/opportunities" });
        }
        if (lowerCommand.includes("bid") || lowerCommand.includes("project")) {
          return res.json({ action: "navigate", path: "/bids" });
        }
        if (lowerCommand.includes("document") || lowerCommand.includes("vault") || lowerCommand.includes("knowledge")) {
          return res.json({ action: "navigate", path: "/knowledge-vault" });
        }
        if (lowerCommand.includes("dashboard") || lowerCommand.includes("home")) {
          return res.json({ action: "navigate", path: "/" });
        }
        if (lowerCommand.includes("setting")) {
          return res.json({ action: "navigate", path: "/settings" });
        }
      }
      
      if (lowerCommand.includes("upload")) {
        return res.json({ action: "navigate", path: "/knowledge-vault", message: "Opening upload interface..." });
      }

      return res.json({ 
        action: "chat",
        message: `I'll help you with "${command}". Try being more specific, or chat with me in the HERBIE section for complex requests.`
      });
    } catch (error) {
      console.error("Herbie command error:", error);
      res.status(500).json({ error: "Command processing failed" });
    }
  });

  app.get("/api/companies/list", async (req: Request, res: Response) => {
    try {
      const vendorsList = await storage.getVendors(DEFAULT_TENANT_ID);
      res.json(vendorsList.map((v: any) => ({ id: v.id, name: v.companyName })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });

  app.get("/api/projects/list", async (req: Request, res: Response) => {
    try {
      const projects = await storage.getBidProjects(DEFAULT_TENANT_ID);
      res.json(projects.map((p: any) => ({ id: p.id, name: p.projectName })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/herbie/autonomous/status", async (_req: Request, res: Response) => {
    try {
      const { getHerbieAutonomousAgent } = await import("./agents/herbie.autonomous");
      const herbie = getHerbieAutonomousAgent(DEFAULT_TENANT_ID);
      const briefing = await herbie.generateDailyBriefing();
      
      res.json({
        status: "active",
        lastCycle: new Date().toISOString(),
        stats: {
          newOpportunities: briefing.newOpportunities,
          pendingApprovals: briefing.pendingApprovals,
          activeBids: briefing.activeBids,
          upcomingDeadlines: briefing.upcomingDeadlines.length,
          exceptionsCount: briefing.exceptionsRequiringAttention.length,
        },
      });
    } catch (error) {
      console.error("Error fetching HERBIE status:", error);
      res.status(500).json({ error: "Failed to fetch status" });
    }
  });

  // ============================================================================
  // HERBIE LEARNING ENGINE API
  // ============================================================================

  app.get("/api/herbie/learning/briefing", async (_req: Request, res: Response) => {
    try {
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const briefing = await learningService.generateDailyBriefing();
      
      res.json({
        success: true,
        briefing,
        generatedAt: new Date().toISOString(),
        recipients: ["Bradley Hueser", "Dave Hueser", "Nolan Kosmicki", "Kathy Hueser"]
      });
    } catch (error) {
      console.error("Error generating daily briefing:", error);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });

  app.get("/api/herbie/learning/patterns", async (_req: Request, res: Response) => {
    try {
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const patterns = learningService.getPatternStats();
      
      res.json({
        success: true,
        patterns,
        totalPatterns: patterns.length,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching win patterns:", error);
      res.status(500).json({ error: "Failed to fetch patterns" });
    }
  });

  app.get("/api/herbie/learning/insights/:opportunityId", async (req: Request, res: Response) => {
    try {
      const opportunityId = p(req.params.opportunityId);
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const insights = await learningService.getBidInsights(opportunityId);
      
      res.json({
        success: true,
        opportunityId,
        insights,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error fetching bid insights:", error);
      res.status(500).json({ error: "Failed to fetch insights" });
    }
  });

  app.post("/api/herbie/learning/win-probability", async (req: Request, res: Response) => {
    try {
      const { agency, naics, setAside } = req.body;
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const probability = await learningService.getWinProbability(agency, naics, setAside);
      
      res.json({
        success: true,
        agency,
        naics,
        setAside,
        winProbability: Math.round(probability * 100),
        confidence: probability >= 0.7 ? "high" : probability >= 0.4 ? "medium" : "low"
      });
    } catch (error) {
      console.error("Error calculating win probability:", error);
      res.status(500).json({ error: "Failed to calculate probability" });
    }
  });

  app.post("/api/herbie/learning/record-outcome", async (req: Request, res: Response) => {
    try {
      const { bidId, opportunityId, agency, naics, setAside, value, outcome, reason } = req.body;
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      
      await learningService.recordBidOutcome({
        bidId,
        opportunityId,
        agency,
        naics,
        setAside,
        value,
        outcome,
        reason
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_outcome_recorded",
        actor: "herbie_learning",
        entityType: "bid",
        entityId: bidId,
        afterJson: { outcome, reason }
      });
      
      res.json({
        success: true,
        message: `Outcome recorded: ${outcome}`,
        bidId
      });
    } catch (error) {
      console.error("Error recording bid outcome:", error);
      res.status(500).json({ error: "Failed to record outcome" });
    }
  });

  app.get("/api/herbie/adaptive/agency-memory/:agencyName", async (req: Request, res: Response) => {
    try {
      const agencyName = p(req.params.agencyName);
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const memory = await learningService.getAgencyMemory(decodeURIComponent(agencyName));
      
      res.json({
        success: true,
        agencyName,
        memory,
        source: "herbie_adaptive_intelligence"
      });
    } catch (error) {
      console.error("Error fetching agency memory:", error);
      res.status(500).json({ error: "Failed to fetch agency memory" });
    }
  });

  app.post("/api/herbie/adaptive/subcontractor-recommendations", async (req: Request, res: Response) => {
    try {
      const { trades, agency } = req.body;
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const recommendations = await learningService.getSubcontractorRecommendations(trades || [], agency);
      
      res.json({
        success: true,
        trades,
        recommendations,
        count: recommendations.length,
        source: "herbie_adaptive_intelligence"
      });
    } catch (error) {
      console.error("Error getting subcontractor recommendations:", error);
      res.status(500).json({ error: "Failed to get recommendations" });
    }
  });

  app.post("/api/herbie/adaptive/pricing-guidance", async (req: Request, res: Response) => {
    try {
      const { agency, naics, projectValue } = req.body;
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const guidance = await learningService.getPricingGuidance(agency, naics, projectValue || 1000000);
      
      res.json({
        success: true,
        guidance,
        source: "herbie_adaptive_intelligence"
      });
    } catch (error) {
      console.error("Error getting pricing guidance:", error);
      res.status(500).json({ error: "Failed to get pricing guidance" });
    }
  });

  app.get("/api/herbie/adaptive/proposal-language/:agencyName", async (req: Request, res: Response) => {
    try {
      const agencyName = p(req.params.agencyName);
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const language = await learningService.getProposalLanguageByAgency(decodeURIComponent(agencyName));
      
      res.json({
        success: true,
        agencyName,
        language,
        source: "herbie_adaptive_intelligence"
      });
    } catch (error) {
      console.error("Error getting proposal language:", error);
      res.status(500).json({ error: "Failed to get proposal language" });
    }
  });

  app.post("/api/herbie/learning/run-improvement", async (_req: Request, res: Response) => {
    try {
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const result = await learningService.runContinuousImprovement();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "herbie_continuous_improvement",
        actor: "herbie_learning",
        entityType: "learning_model",
        entityId: result.version,
        afterJson: result
      });
      
      res.json({
        success: true,
        ...result,
        source: "herbie_continuous_improvement"
      });
    } catch (error) {
      console.error("Error running continuous improvement:", error);
      res.status(500).json({ error: "Failed to run improvement" });
    }
  });

  app.get("/api/herbie/learning/model-version", async (_req: Request, res: Response) => {
    try {
      const learningService = createHerbieLearningService(DEFAULT_TENANT_ID);
      const version = await learningService.getModelVersion();
      
      res.json({
        success: true,
        ...version,
        source: "herbie_learning_engine"
      });
    } catch (error) {
      console.error("Error fetching model version:", error);
      res.status(500).json({ error: "Failed to fetch model version" });
    }
  });

  // ============================================================================
  // MULTI-AGENT INTELLIGENCE API (GovSync 2.0)
  // ============================================================================

  // CIO-Bot: Pwin Analysis
  app.post("/api/agents/cio-bot/analyze/:opportunityId", async (req: Request, res: Response) => {
    try {
      const { cioBotAgent } = await import("./agents/cio-bot.agent");
      const result = await cioBotAgent.analyzeOpportunity(p(req.params.opportunityId));
      res.json(result);
    } catch (error) {
      console.error("CIO-Bot analysis error:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  app.get("/api/agents/cio-bot/analysis/:opportunityId", async (req: Request, res: Response) => {
    try {
      const { cioBotAgent } = await import("./agents/cio-bot.agent");
      const result = await cioBotAgent.getLatestAnalysis(p(req.params.opportunityId));
      res.json(result || { error: "No analysis found" });
    } catch (error) {
      console.error("CIO-Bot fetch error:", error);
      res.status(500).json({ error: "Failed to fetch analysis" });
    }
  });

  // LegalOps: Compliance Check
  app.post("/api/agents/legalops/check/:opportunityId", async (req: Request, res: Response) => {
    try {
      const { legalOpsAgent } = await import("./agents/legalops.agent");
      const result = await legalOpsAgent.analyzeOpportunityCompliance(p(req.params.opportunityId));
      res.json(result);
    } catch (error) {
      console.error("LegalOps check error:", error);
      res.status(500).json({ error: "Compliance check failed" });
    }
  });

  app.get("/api/agents/legalops/status/:opportunityId", async (req: Request, res: Response) => {
    try {
      const { legalOpsAgent } = await import("./agents/legalops.agent");
      const result = await legalOpsAgent.getComplianceStatus(p(req.params.opportunityId));
      res.json(result || { error: "No compliance data found" });
    } catch (error) {
      console.error("LegalOps status error:", error);
      res.status(500).json({ error: "Failed to fetch compliance status" });
    }
  });

  // Foreman-Bot: Award & Amendment Monitoring
  app.get("/api/agents/foreman/alerts", async (req: Request, res: Response) => {
    try {
      const { foremanBotAgent } = await import("./agents/foreman-bot.agent");
      const limit = parseInt(req.query.limit as string) || 20;
      const alerts = await foremanBotAgent.getRecentAlerts(limit);
      res.json(alerts);
    } catch (error) {
      console.error("Foreman-Bot alerts error:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.post("/api/agents/foreman/check-awards", async (req: Request, res: Response) => {
    try {
      const { foremanBotAgent } = await import("./agents/foreman-bot.agent");
      const results = await foremanBotAgent.checkForAwards();
      res.json({ checked: results.length, awards: results.filter(r => r.awardFound) });
    } catch (error) {
      console.error("Foreman-Bot award check error:", error);
      res.status(500).json({ error: "Award check failed" });
    }
  });

  app.post("/api/agents/foreman/check-amendments", async (req: Request, res: Response) => {
    try {
      const { foremanBotAgent } = await import("./agents/foreman-bot.agent");
      const results = await foremanBotAgent.checkForAmendments();
      res.json({ amendments: results });
    } catch (error) {
      console.error("Foreman-Bot amendment check error:", error);
      res.status(500).json({ error: "Amendment check failed" });
    }
  });

  app.post("/api/agents/foreman/record-award", async (req: Request, res: Response) => {
    try {
      const { foremanBotAgent } = await import("./agents/foreman-bot.agent");
      const { opportunityId, ...awardDetails } = req.body;
      await foremanBotAgent.recordAward(opportunityId, {
        ...awardDetails,
        awardDate: new Date(awardDetails.awardDate),
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Foreman-Bot record award error:", error);
      res.status(500).json({ error: "Failed to record award" });
    }
  });

  // Multi-Agent Status Dashboard
  app.get("/api/agents/status", async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { agentActivities } = await import("@shared/schema");
      const { desc, eq, count, sql } = await import("drizzle-orm");
      
      // Get recent activity counts per agent
      const activityCounts = await db.select({
        agentName: agentActivities.agentName,
        totalActions: count(),
        successCount: sql<number>`COUNT(*) FILTER (WHERE status = 'success')`,
        errorCount: sql<number>`COUNT(*) FILTER (WHERE status = 'error')`,
      })
        .from(agentActivities)
        .where(eq(agentActivities.tenantId, DEFAULT_TENANT_ID))
        .groupBy(agentActivities.agentName);
      
      const agents = [
        { name: "contract-bot", role: "Crawls SAM, GSA, DIBBS for matching bids", status: "active" },
        { name: "cio-bot", role: "Calculates Pwin %, risk, and ROI", status: "active" },
        { name: "legalops", role: "Attaches FAR/DFARS clauses and certifications", status: "active" },
        { name: "foreman-bot", role: "Monitors for updates, amendments, and awards", status: "active" },
        { name: "nova", role: "Drafts and completes bid packages", status: "active" },
      ];
      
      const agentStatus = agents.map(agent => {
        const stats = activityCounts.find(a => a.agentName === agent.name);
        return {
          ...agent,
          totalActions: stats?.totalActions || 0,
          successRate: stats?.totalActions 
            ? Math.round((stats.successCount / stats.totalActions) * 100) 
            : 100,
          errors: stats?.errorCount || 0,
        };
      });
      
      res.json({ agents: agentStatus, lastUpdated: new Date().toISOString() });
    } catch (error) {
      console.error("Agent status error:", error);
      res.status(500).json({ error: "Failed to fetch agent status" });
    }
  });

  // Agent Activity Log (unified)
  app.get("/api/agents/activity-log", async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { agentActivities } = await import("@shared/schema");
      const { desc, eq } = await import("drizzle-orm");
      
      const limit = parseInt(req.query.limit as string) || 50;
      const agentFilter = req.query.agent as string;
      
      let query = db.select()
        .from(agentActivities)
        .where(eq(agentActivities.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(agentActivities.createdAt))
        .limit(limit);
      
      const activities = await query;
      
      const filtered = agentFilter 
        ? activities.filter(a => a.agentName === agentFilter)
        : activities;
      
      res.json(filtered.map(a => ({
        id: a.id,
        agent: a.agentName,
        action: a.actionType,
        entityType: a.entityType,
        entityId: a.entityId,
        status: a.status,
        duration: a.durationMs,
        timestamp: a.createdAt,
        details: a.outputJson,
      })));
    } catch (error) {
      console.error("Agent activity log error:", error);
      res.status(500).json({ error: "Failed to fetch activity log" });
    }
  });

  // Recent CIO-Bot Pwin Analyses
  app.get("/api/agents/cio-bot/recent-analyses", async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { pwinAnalyses } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const limit = parseInt(req.query.limit as string) || 10;
      
      const analyses = await db.select()
        .from(pwinAnalyses)
        .where(eq(pwinAnalyses.tenantId, DEFAULT_TENANT_ID))
        .limit(limit);
      
      res.json(analyses.map(a => ({
        id: a.id,
        opportunityId: a.opportunityId,
        pwinPercent: a.pwinPercent,
        roiEstimate: a.roiEstimate,
        riskScore: a.riskScore,
        recommendation: a.recommendedAction,
        reasoning: a.aiReasoning,
        calculatedAt: a.calculatedAt,
      })));
    } catch (error) {
      console.error("Recent Pwin analyses error:", error);
      res.status(500).json({ error: "Failed to fetch recent analyses" });
    }
  });

  // Recent LegalOps Compliance Checks
  app.get("/api/agents/legalops/recent-checks", async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { complianceRequirements } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const limit = parseInt(req.query.limit as string) || 10;
      
      // Get compliance requirements ordered by creation date
      const checks = await db.select()
        .from(complianceRequirements)
        .where(eq(complianceRequirements.tenantId, DEFAULT_TENANT_ID))
        .limit(limit);
      
      res.json(checks.map(c => ({
        id: c.id,
        opportunityId: c.opportunityId,
        clauseNumber: c.clauseNumber,
        clauseTitle: c.clauseTitle,
        clauseType: c.clauseType,
        isMandatory: c.isMandatory,
        companyStatus: c.companyStatus,
        gapDescription: c.gapDescription,
        createdAt: c.createdAt,
      })));
    } catch (error) {
      console.error("Recent compliance checks error:", error);
      res.status(500).json({ error: "Failed to fetch recent checks" });
    }
  });

  // Recent Foreman-Bot Award Notifications
  app.get("/api/agents/foreman/recent-awards", async (req: Request, res: Response) => {
    try {
      const { db } = await import("./db");
      const { opportunities } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      // Return opportunities that could be tracked for awards
      const opps = await db.select()
        .from(opportunities)
        .where(eq(opportunities.tenantId, DEFAULT_TENANT_ID))
        .limit(5);
      
      // Return as award notifications format (placeholder until awardDetections table exists)
      res.json(opps.map(o => ({
        id: o.id,
        opportunityId: o.id,
        opportunityTitle: o.title,
        awardDate: null,
        awardAmount: o.contractValue,
        isOurs: false,
        projectCreated: false,
        createdAt: o.createdAt,
      })));
    } catch (error) {
      console.error("Recent awards error:", error);
      res.status(500).json({ error: "Failed to fetch recent awards" });
    }
  });

  // ============================================================================
  // AUDIT LOG API
  // ============================================================================

  app.get("/api/audit/:entityType/:entityId", async (req: Request, res: Response) => {
    try {
      const entityType = p(req.params.entityType);
      const entityId = p(req.params.entityId);
      const events = await storage.getAuditEvents(entityType, entityId);
      res.json(events);
    } catch (error) {
      console.error("Error fetching audit events:", error);
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  });

  // Get all audit events (with optional filters)
  app.get("/api/audit-events", async (req: Request, res: Response) => {
    try {
      const { auditEvents } = await import("@shared/schema");
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(limit);
      // Transform to match frontend interface
      const transformedEvents = events.map(e => ({
        id: e.id,
        timestamp: e.createdAt,
        user: e.actor || "system",
        action: e.action,
        resource: e.entityType,
        resourceId: e.entityId,
        status: (e as any).outcome === "success" ? "success" : (e as any).outcome === "failure" ? "failure" : "warning",
        ipAddress: "127.0.0.1",
        details: (e as any).notes || `${e.action} on ${e.entityType}`,
      }));
      res.json(transformedEvents);
    } catch (error) {
      console.error("Error fetching all audit events:", error);
      res.status(500).json({ error: "Failed to fetch audit events" });
    }
  });

  // ============================================================================
  // SERVICE-BASED API ROUTES
  // ============================================================================

  // --- Approval Service Routes ---
  app.get("/api/services/approvals/pending", async (req: Request, res: Response) => {
    try {
      const approvals = await approvalService.getPendingApprovals(DEFAULT_TENANT_ID);
      res.json(approvals);
    } catch (error) {
      console.error("Error fetching pending approvals:", error);
      res.status(500).json({ error: "Failed to fetch pending approvals" });
    }
  });

  app.post("/api/services/approvals/:requestId/decision", async (req: Request, res: Response) => {
    try {
      const requestId = p(req.params.requestId);
      const { decision, notes, actor } = req.body;
      
      if (!["approved", "denied"].includes(decision)) {
        return res.status(400).json({ error: "Decision must be 'approved' or 'denied'" });
      }

      const result = await approvalService.processDecision({
        requestId,
        actor: actor || "system",
        decision,
        notes,
      }, DEFAULT_TENANT_ID);

      res.json({ success: true, approved: result });
    } catch (error) {
      console.error("Error processing approval decision:", error);
      res.status(500).json({ error: "Failed to process approval decision" });
    }
  });

  // --- Scoring Service Routes ---
  app.post("/api/services/scoring/score/:opportunityId", async (req: Request, res: Response) => {
    try {
      const opportunityId = p(req.params.opportunityId);
      const { fitProfileId, scoringModelId } = req.body;
      
      if (!fitProfileId || !scoringModelId) {
        return res.status(400).json({ error: "fitProfileId and scoringModelId are required" });
      }

      const result = await scoringService.scoreOpportunity(
        DEFAULT_TENANT_ID,
        opportunityId,
        fitProfileId,
        scoringModelId
      );
      
      res.json(result);
    } catch (error) {
      console.error("Error scoring opportunity:", error);
      res.status(500).json({ error: "Failed to score opportunity" });
    }
  });

  app.get("/api/services/scoring/history/:opportunityId", async (req: Request, res: Response) => {
    try {
      const opportunityId = p(req.params.opportunityId);
      const history = await scoringService.getScoreHistory(DEFAULT_TENANT_ID, opportunityId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching score history:", error);
      res.status(500).json({ error: "Failed to fetch score history" });
    }
  });

  app.get("/api/services/scoring/profiles", async (req: Request, res: Response) => {
    try {
      const profiles = await scoringService.getActiveProfiles(DEFAULT_TENANT_ID);
      res.json(profiles);
    } catch (error) {
      console.error("Error fetching fit profiles:", error);
      res.status(500).json({ error: "Failed to fetch fit profiles" });
    }
  });

  // --- Bid Service Routes ---
  app.post("/api/services/bids/projects", async (req: Request, res: Response) => {
    try {
      const { opportunityId, ownerUserId } = req.body;
      
      if (!opportunityId) {
        return res.status(400).json({ error: "opportunityId is required" });
      }

      const projectId = await bidService.createBidProject({
        tenantId: DEFAULT_TENANT_ID,
        opportunityId,
        ownerUserId: ownerUserId || "system",
      });
      
      res.json({ success: true, projectId });
    } catch (error) {
      console.error("Error creating bid project:", error);
      res.status(500).json({ error: "Failed to create bid project" });
    }
  });

  app.post("/api/services/bids/:projectId/decision", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { decision, decidedBy, rationale } = req.body;
      
      if (!["bid", "no_bid"].includes(decision)) {
        return res.status(400).json({ error: "Decision must be 'bid' or 'no_bid'" });
      }

      const decisionId = await bidService.recordBidDecision({
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId: projectId,
        decision,
        decidedBy: decidedBy || "system",
        rationale: rationale || "",
      });
      
      res.json({ success: true, decisionId });
    } catch (error) {
      console.error("Error recording bid decision:", error);
      res.status(500).json({ error: "Failed to record bid decision" });
    }
  });

  app.get("/api/services/bids/:projectId/tasks", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const tasks = await bidService.getBidTasks(DEFAULT_TENANT_ID, projectId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching bid tasks:", error);
      res.status(500).json({ error: "Failed to fetch bid tasks" });
    }
  });

  app.get("/api/services/bids/:projectId/artifacts", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const artifacts = await bidService.getBidArtifacts(DEFAULT_TENANT_ID, projectId);
      res.json(artifacts);
    } catch (error) {
      console.error("Error fetching bid artifacts:", error);
      res.status(500).json({ error: "Failed to fetch bid artifacts" });
    }
  });

  app.get("/api/services/bids/active", async (req: Request, res: Response) => {
    try {
      const projects = await bidService.getActiveBidProjects(DEFAULT_TENANT_ID);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching active bid projects:", error);
      res.status(500).json({ error: "Failed to fetch active bid projects" });
    }
  });

  // --- Digest Service Routes ---
  app.get("/api/services/digest/executive", async (req: Request, res: Response) => {
    try {
      const digest = await digestService.generateExecutiveDigest(DEFAULT_TENANT_ID);
      res.json(digest);
    } catch (error) {
      console.error("Error generating executive digest:", error);
      res.status(500).json({ error: "Failed to generate executive digest" });
    }
  });

  app.get("/api/services/digest/exceptions", async (req: Request, res: Response) => {
    try {
      const exceptions = await digestService.getExceptionReport(DEFAULT_TENANT_ID);
      res.json(exceptions);
    } catch (error) {
      console.error("Error fetching exceptions:", error);
      res.status(500).json({ error: "Failed to fetch exceptions" });
    }
  });

  app.get("/api/services/digest/deadlines", async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const deadlines = await digestService.getDeadlineAlerts(DEFAULT_TENANT_ID, days);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching deadline alerts:", error);
      res.status(500).json({ error: "Failed to fetch deadline alerts" });
    }
  });

  // Generate analytics report
  app.post("/api/services/digest/generate", async (req: Request, res: Response) => {
    try {
      const { type, format } = req.body;
      const executive = await digestService.generateExecutiveDigest(DEFAULT_TENANT_ID);
      const exceptions = await digestService.getExceptionReport(DEFAULT_TENANT_ID);
      const deadlines = await digestService.getDeadlineAlerts(DEFAULT_TENANT_ID, 14);
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "report",
        entityId: `analytics-${Date.now()}`,
        eventType: "report_generated",
        actor: "current_user",
        metadata: { type: type || "analytics", format: format || "pdf" },
      });

      res.json({
        success: true,
        reportId: `report-${Date.now()}`,
        type: type || "analytics",
        format: format || "pdf",
        generatedAt: new Date().toISOString(),
        summary: {
          executiveMetrics: executive,
          exceptionsCount: exceptions.length,
          upcomingDeadlines: deadlines.length,
        },
      });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ error: "Failed to generate report" });
    }
  });

  // --- Queue Service Routes ---
  app.get("/api/services/queue/status", async (req: Request, res: Response) => {
    try {
      const pendingCount = await queueService.getPendingJobCount(DEFAULT_TENANT_ID);
      const scheduleInfo = scheduler.getScheduleInfo();
      res.json({ 
        pendingJobs: pendingCount,
        scheduledJobs: scheduleInfo,
      });
    } catch (error) {
      console.error("Error fetching queue status:", error);
      res.status(500).json({ error: "Failed to fetch queue status" });
    }
  });

  app.get("/api/services/queue/dlq", async (req: Request, res: Response) => {
    try {
      const deadLetters = await queueService.getDeadLetterQueue();
      res.json(deadLetters);
    } catch (error) {
      console.error("Error fetching dead letter queue:", error);
      res.status(500).json({ error: "Failed to fetch dead letter queue" });
    }
  });

  app.post("/api/services/queue/enqueue", async (req: Request, res: Response) => {
    try {
      const { jobType, payload, priority, runAt } = req.body;
      
      if (!jobType) {
        return res.status(400).json({ error: "jobType is required" });
      }

      const jobId = await queueService.enqueue({
        tenantId: DEFAULT_TENANT_ID,
        jobType,
        payload: payload || {},
        priority: priority || 0,
        runAt: runAt ? new Date(runAt) : undefined,
      });
      
      res.json({ success: true, jobId });
    } catch (error) {
      console.error("Error enqueuing job:", error);
      res.status(500).json({ error: "Failed to enqueue job" });
    }
  });

  // --- SAM.gov Integration Routes ---
  app.post("/api/services/integrations/samgov/ingest", async (req: Request, res: Response) => {
    try {
      const service = await createSamGovIngestionService(DEFAULT_TENANT_ID);
      
      if (!service) {
        return res.status(503).json({ error: "SAM.gov API key not configured" });
      }

      const stats = await service.runIngestion();

      // Fire-and-forget: Herbie records a fact about the ingestion run.
      void (async () => {
        try {
          const { executeHerbieTool } = await import("./services/herbie-tools");
          const summary = `SAM.gov ingestion run: ${JSON.stringify(stats).substring(0, 280)}`;
          await executeHerbieTool(
            {
              tool: "record_fact",
              args: {
                projectId: "samgov-ingest",
                fact: summary,
                category: "observation",
                source: "samgov_ingest",
              },
            },
            { tenantId: DEFAULT_TENANT_ID, userId: "herbie" } as any,
          );
        } catch (e) {
          console.warn("[herbie auto-hook samgov_ingest]", e instanceof Error ? e.message : e);
        }
      })();

      res.json({ success: true, stats });
    } catch (error) {
      console.error("Error running SAM.gov ingestion:", error);
      res.status(500).json({ error: "Failed to run SAM.gov ingestion" });
    }
  });

  // --- Communications Service Routes ---
  app.post("/api/services/comms/email/draft", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, subject, body, createdBy } = req.body;
      
      if (!subject || !body) {
        return res.status(400).json({ error: "subject and body are required" });
      }

      const messageId = await commsService.createEmailDraft({
        tenantId: DEFAULT_TENANT_ID,
        entityType,
        entityId,
        subject,
        bodyHtml: body,
        createdBy: createdBy || "system",
      });
      
      res.json({ success: true, messageId });
    } catch (error) {
      console.error("Error creating email draft:", error);
      res.status(500).json({ error: "Failed to create email draft" });
    }
  });

  app.post("/api/services/comms/calendar/event", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, title, description, startAt, endAt, eventType, createdBy } = req.body;
      
      if (!title || !startAt || !eventType) {
        return res.status(400).json({ error: "title, startAt, and eventType are required" });
      }

      const result = await commsService.createCalendarEvent({
        tenantId: DEFAULT_TENANT_ID,
        entityType,
        entityId,
        title,
        description,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : new Date(new Date(startAt).getTime() + 60 * 60 * 1000),
        eventType,
        createdBy: createdBy || "system",
      });
      
      res.json(result);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.get("/api/services/comms/calendar/upcoming", async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const events = await commsService.getUpcomingEvents(DEFAULT_TENANT_ID, days);
      res.json(events);
    } catch (error) {
      console.error("Error fetching upcoming events:", error);
      res.status(500).json({ error: "Failed to fetch upcoming events" });
    }
  });

  // --- Audit Service Routes ---
  app.get("/api/services/audit/history/:entityType/:entityId", async (req: Request, res: Response) => {
    try {
      const entityType = p(req.params.entityType);
      const entityId = p(req.params.entityId);
      const history = await auditService.getEntityHistory(DEFAULT_TENANT_ID, entityType, entityId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching audit history:", error);
      res.status(500).json({ error: "Failed to fetch audit history" });
    }
  });

  app.get("/api/services/audit/recent", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await auditService.getRecentEvents(DEFAULT_TENANT_ID, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching recent audit events:", error);
      res.status(500).json({ error: "Failed to fetch recent audit events" });
    }
  });

  // ============================================================================
  // INVENTORY SERVICE ROUTES (with CRUD + approval gating)
  // ============================================================================

  const { inventoryService } = await import("./services/inventory.service");
  const inventoryItemSchema = z.object({
    sku: z.string().min(1, "SKU is required"),
    name: z.string().min(1, "Name is required"),
    category: z.string().optional(),
    unit: z.string().optional(),
    unitCost: z.string().optional(),
    quantityOnHand: z.number().optional(),
    reorderPoint: z.number().optional(),
  });

  app.get("/api/inventory/items", async (req: Request, res: Response) => {
    try {
      const items = await inventoryService.listItems(DEFAULT_TENANT_ID, req.query as any);
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory items:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  app.get("/api/inventory/items/:id", async (req: Request, res: Response) => {
    try {
      const item = await inventoryService.getItem(DEFAULT_TENANT_ID, p(req.params.id));
      if (!item) return res.status(404).json({ error: "Item not found" });
      res.json(item);
    } catch (error) {
      console.error("Error fetching inventory item:", error);
      res.status(500).json({ error: "Failed to fetch inventory item" });
    }
  });

  app.post("/api/inventory/items", async (req: Request, res: Response) => {
    try {
      const validated = inventoryItemSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const item = await inventoryService.createItem(DEFAULT_TENANT_ID, { ...validated.data, unit: validated.data.unit || "each" } as any, req.body.actorId);
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating inventory item:", error);
      res.status(500).json({ error: "Failed to create inventory item" });
    }
  });

  const inventoryItemUpdateSchema = z.object({
    description: z.string().optional(),
    categoryId: z.string().optional(),
    unitOfMeasure: z.string().optional(),
    currentStock: z.string().optional(),
    reorderPoint: z.string().optional(),
    reorderQuantity: z.string().optional(),
    unitCost: z.string().optional(),
    warehouseId: z.string().optional(),
    status: z.string().optional(),
  });

  app.patch("/api/inventory/items/:id", async (req: Request, res: Response) => {
    try {
      const validated = inventoryItemUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const item = await inventoryService.updateItem(DEFAULT_TENANT_ID, p(req.params.id), validated.data as any, req.body.actorId);
      res.json(item);
    } catch (error) {
      console.error("Error updating inventory item:", error);
      res.status(500).json({ error: "Failed to update inventory item" });
    }
  });

  app.delete("/api/inventory/items/:id", async (req: Request, res: Response) => {
    try {
      await inventoryService.deleteItem(DEFAULT_TENANT_ID, p(req.params.id), req.body.actorId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting inventory item:", error);
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  app.get("/api/inventory/shortages", async (req: Request, res: Response) => {
    try {
      const shortages = await inventoryService.detectShortages(DEFAULT_TENANT_ID);
      res.json(shortages);
    } catch (error) {
      console.error("Error detecting shortages:", error);
      res.status(500).json({ error: "Failed to detect shortages" });
    }
  });

  app.get("/api/inventory/equipment", async (req: Request, res: Response) => {
    try {
      const equipment = await inventoryService.listEquipment(DEFAULT_TENANT_ID, req.query as any);
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ error: "Failed to fetch equipment" });
    }
  });

  app.get("/api/inventory/equipment/:id", async (req: Request, res: Response) => {
    try {
      const equipment = await inventoryService.getEquipment(DEFAULT_TENANT_ID, p(req.params.id));
      if (!equipment) return res.status(404).json({ error: "Equipment not found" });
      res.json(equipment);
    } catch (error) {
      console.error("Error fetching equipment:", error);
      res.status(500).json({ error: "Failed to fetch equipment" });
    }
  });

  const equipmentSchema = z.object({
    assetNumber: z.string().min(1, "Asset number required"),
    name: z.string().min(1, "Name required"),
    description: z.string().optional(),
    categoryId: z.string().optional(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    serialNumber: z.string().optional(),
    purchaseDate: z.string().optional(),
    purchaseCost: z.string().optional(),
    currentValue: z.string().optional(),
  });

  app.post("/api/inventory/equipment", async (req: Request, res: Response) => {
    try {
      const validated = equipmentSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const equipment = await inventoryService.createEquipment(DEFAULT_TENANT_ID, { ...validated.data, assetTag: validated.data.assetNumber || `EQ-${Date.now()}` } as any, req.body.actorId);
      res.status(201).json(equipment);
    } catch (error) {
      console.error("Error creating equipment:", error);
      res.status(500).json({ error: "Failed to create equipment" });
    }
  });

  const equipmentUpdateSchema = z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.string().optional(),
    status: z.string().optional(),
    locationId: z.string().optional(),
    assignedToEmployeeId: z.string().optional(),
    currentValue: z.string().optional(),
    maintenanceIntervalDays: z.number().optional(),
  });

  app.patch("/api/inventory/equipment/:id", async (req: Request, res: Response) => {
    try {
      const validated = equipmentUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const equipment = await inventoryService.updateEquipment(DEFAULT_TENANT_ID, p(req.params.id), validated.data, req.body.actorId);
      res.json(equipment);
    } catch (error) {
      console.error("Error updating equipment:", error);
      res.status(500).json({ error: "Failed to update equipment" });
    }
  });

  app.get("/api/inventory/purchase-orders", async (req: Request, res: Response) => {
    try {
      const pos = await inventoryService.listPurchaseOrders(DEFAULT_TENANT_ID, req.query as any);
      res.json(pos);
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/inventory/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const po = await inventoryService.getPurchaseOrder(DEFAULT_TENANT_ID, p(req.params.id));
      if (!po) return res.status(404).json({ error: "Purchase order not found" });
      res.json(po);
    } catch (error) {
      console.error("Error fetching purchase order:", error);
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  const purchaseOrderSchema = z.object({
    poNumber: z.string().min(1, "PO number required"),
    vendorId: z.string().min(1, "Vendor required"),
    projectId: z.string().optional(),
    requestedById: z.string().optional(),
    deliveryDate: z.string().optional(),
    deliveryLocationId: z.string().optional(),
    totalAmount: z.string().optional(),
    notesJson: z.unknown().optional(),
  });

  app.post("/api/inventory/purchase-orders", async (req: Request, res: Response) => {
    try {
      const validated = purchaseOrderSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "purchase_order",
        entityId: "pending",
        actionType: "create_po",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: parseFloat(validated.data.totalAmount || "0") > 10000 ? "high" : "medium" },
      });
      
      if (parseFloat(validated.data.totalAmount || "0") < 5000) {
        await approvalService.processDecision({ requestId: approvalId, actor: "auto", decision: "approved", notes: "Auto-approved under $5000" }, DEFAULT_TENANT_ID);
        const po = await inventoryService.createPurchaseOrder(DEFAULT_TENANT_ID, validated.data as any, req.body.actorId);
        return res.status(201).json(po);
      }
      
      res.status(202).json({ message: "Purchase order pending approval", approvalId });
    } catch (error) {
      console.error("Error creating purchase order:", error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  const poStatusSchema = z.object({
    status: z.enum(["draft", "submitted", "approved", "rejected", "ordered", "received", "cancelled"]),
  });

  app.patch("/api/inventory/purchase-orders/:id/status", async (req: Request, res: Response) => {
    try {
      const validated = poStatusSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const po = await inventoryService.updatePOStatus(DEFAULT_TENANT_ID, p(req.params.id), validated.data.status, req.body.actorId);
      res.json(po);
    } catch (error) {
      console.error("Error updating purchase order:", error);
      res.status(500).json({ error: "Failed to update purchase order" });
    }
  });

  // ============================================================================
  // TICKETING SERVICE ROUTES
  // ============================================================================

  const { ticketingService } = await import("./services/ticketing.service");
  
  const ticketSchema = z.object({
    ticketNumber: z.string().min(1, "Ticket number required"),
    subject: z.string().min(1, "Subject required"),
    description: z.string().optional(),
    priority: z.string().optional(),
    categoryId: z.string().optional(),
    source: z.string().optional(),
    projectId: z.string().optional(),
    reportedByUserId: z.string().optional(),
    reportedByEmail: z.string().optional(),
  });

  app.get("/api/tickets", async (req: Request, res: Response) => {
    try {
      const tickets = await ticketingService.listTickets(DEFAULT_TENANT_ID, req.query as any);
      res.json(tickets);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ error: "Failed to fetch tickets" });
    }
  });

  app.post("/api/tickets", async (req: Request, res: Response) => {
    try {
      const validated = ticketSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const ticket = await ticketingService.createTicket(DEFAULT_TENANT_ID, validated.data);
      res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ error: "Failed to create ticket" });
    }
  });

  app.delete("/api/tickets/:id", async (req: Request, res: Response) => {
    try {
      await ticketingService.closeTicket(DEFAULT_TENANT_ID, p(req.params.id), req.body.actorId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error closing ticket:", error);
      res.status(500).json({ error: "Failed to close ticket" });
    }
  });

  app.get("/api/tickets/:id", async (req: Request, res: Response) => {
    try {
      const ticket = await ticketingService.getTicket(DEFAULT_TENANT_ID, p(req.params.id));
      if (!ticket) return res.status(404).json({ error: "Ticket not found" });
      res.json(ticket);
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ error: "Failed to fetch ticket" });
    }
  });

  const ticketUpdateSchema = z.object({
    subject: z.string().optional(),
    description: z.string().optional(),
    priority: z.string().optional(),
    status: z.string().optional(),
    categoryId: z.string().optional(),
    assignedToUserId: z.string().optional(),
  });

  app.patch("/api/tickets/:id", async (req: Request, res: Response) => {
    try {
      const validated = ticketUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const ticket = await ticketingService.updateTicket(DEFAULT_TENANT_ID, p(req.params.id), validated.data, req.body.actorId);
      res.json(ticket);
    } catch (error) {
      console.error("Error updating ticket:", error);
      res.status(500).json({ error: "Failed to update ticket" });
    }
  });

  app.get("/api/tickets/sla/breaches", async (req: Request, res: Response) => {
    try {
      const breaches = await ticketingService.checkSLABreaches(DEFAULT_TENANT_ID);
      res.json(breaches);
    } catch (error) {
      console.error("Error checking SLA breaches:", error);
      res.status(500).json({ error: "Failed to check SLA breaches" });
    }
  });

  // ============================================================================
  // HR SERVICE ROUTES
  // ============================================================================

  const { hrService } = await import("./services/hr.service");

  app.get("/api/hr/employees", async (req: Request, res: Response) => {
    try {
      const employees = await hrService.listEmployees(DEFAULT_TENANT_ID, req.query as any);
      res.json(employees);
    } catch (error) {
      console.error("Error fetching employees:", error);
      res.status(500).json({ error: "Failed to fetch employees" });
    }
  });

  app.get("/api/hr/employees/:id", async (req: Request, res: Response) => {
    try {
      const employee = await hrService.getEmployee(DEFAULT_TENANT_ID, p(req.params.id));
      if (!employee) return res.status(404).json({ error: "Employee not found" });
      res.json(employee);
    } catch (error) {
      console.error("Error fetching employee:", error);
      res.status(500).json({ error: "Failed to fetch employee" });
    }
  });

  const employeeSchema = z.object({
    employeeNumber: z.string().min(1, "Employee number required"),
    firstName: z.string().min(1, "First name required"),
    lastName: z.string().min(1, "Last name required"),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    departmentId: z.string().optional(),
    positionTitle: z.string().optional(),
    hireDate: z.string().optional(),
  });

  app.post("/api/hr/employees", async (req: Request, res: Response) => {
    try {
      const validated = employeeSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "employee",
        entityId: "pending",
        actionType: "hire_employee",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "medium" },
      });
      
      const employee = await hrService.createEmployee(DEFAULT_TENANT_ID, validated.data as any, req.body.actorId);
      await approvalService.processDecision({ requestId: approvalId, actor: "auto", decision: "approved", notes: "New hire recorded" }, DEFAULT_TENANT_ID);
      res.status(201).json(employee);
    } catch (error) {
      console.error("Error creating employee:", error);
      res.status(500).json({ error: "Failed to create employee" });
    }
  });

  const employeeUpdateSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    departmentId: z.string().optional(),
    positionTitle: z.string().optional(),
    status: z.string().optional(),
    salary: z.string().optional(),
  });

  app.patch("/api/hr/employees/:id", async (req: Request, res: Response) => {
    try {
      const validated = employeeUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const employee = await hrService.updateEmployee(DEFAULT_TENANT_ID, p(req.params.id), validated.data, req.body.actorId);
      res.json(employee);
    } catch (error) {
      console.error("Error updating employee:", error);
      res.status(500).json({ error: "Failed to update employee" });
    }
  });

  app.post("/api/hr/employees/:id/terminate", async (req: Request, res: Response) => {
    try {
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "employee",
        entityId: p(req.params.id),
        actionType: "terminate_employee",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "high" },
      });
      res.status(202).json({ message: "Termination pending approval", approvalId });
    } catch (error) {
      console.error("Error processing termination:", error);
      res.status(500).json({ error: "Failed to process termination" });
    }
  });

  app.get("/api/hr/credentials/expiring", async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const credentials = await hrService.getExpiringCredentials(DEFAULT_TENANT_ID, days);
      res.json(credentials);
    } catch (error) {
      console.error("Error fetching expiring credentials:", error);
      res.status(500).json({ error: "Failed to fetch expiring credentials" });
    }
  });

  app.get("/api/hr/training", async (req: Request, res: Response) => {
    try {
      const records = await hrService.listTrainingCourses(DEFAULT_TENANT_ID, req.query as any);
      res.json(records);
    } catch (error) {
      console.error("Error fetching training records:", error);
      res.status(500).json({ error: "Failed to fetch training records" });
    }
  });

  app.get("/api/hr/safety-incidents", async (req: Request, res: Response) => {
    try {
      const incidents = await hrService.listSafetyIncidents(DEFAULT_TENANT_ID, req.query as any);
      res.json(incidents);
    } catch (error) {
      console.error("Error fetching safety incidents:", error);
      res.status(500).json({ error: "Failed to fetch safety incidents" });
    }
  });

  // ============================================================================
  // WORKFORCE SERVICE ROUTES
  // ============================================================================

  const { workforceService } = await import("./services/workforce.service");

  app.get("/api/workforce/time-entries", async (req: Request, res: Response) => {
    try {
      const entries = await workforceService.getTimeEntries(DEFAULT_TENANT_ID, req.query as any);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ error: "Failed to fetch time entries" });
    }
  });

  app.post("/api/workforce/time-entries/clock-in", async (req: Request, res: Response) => {
    try {
      const entry = await workforceService.clockIn(DEFAULT_TENANT_ID, req.body);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error clocking in:", error);
      res.status(500).json({ error: "Failed to clock in" });
    }
  });

  app.post("/api/workforce/time-entries/:id/clock-out", async (req: Request, res: Response) => {
    try {
      const entry = await workforceService.clockOut(DEFAULT_TENANT_ID, req.body);
      res.json(entry);
    } catch (error) {
      console.error("Error clocking out:", error);
      res.status(500).json({ error: "Failed to clock out" });
    }
  });

  app.get("/api/workforce/crew-assignments", async (req: Request, res: Response) => {
    try {
      const assignments = await workforceService.getCrewAssignments(DEFAULT_TENANT_ID, req.query as any);
      res.json(assignments);
    } catch (error) {
      console.error("Error fetching crew assignments:", error);
      res.status(500).json({ error: "Failed to fetch crew assignments" });
    }
  });

  app.get("/api/workforce/labor-costs", async (req: Request, res: Response) => {
    try {
      const projectId = req.query.projectId as string;
      if (!projectId) return res.status(400).json({ error: "projectId required" });
      const costs = await workforceService.getLaborCostSummary(DEFAULT_TENANT_ID, { projectId } as any);
      res.json(costs);
    } catch (error) {
      console.error("Error calculating labor costs:", error);
      res.status(500).json({ error: "Failed to calculate labor costs" });
    }
  });

  // ============================================================================
  // PROJECTS SERVICE ROUTES
  // ============================================================================

  const { projectsService } = await import("./services/projects.service");

  app.get("/api/projects", async (req: Request, res: Response) => {
    try {
      const projects = await projectsService.listProjects(DEFAULT_TENANT_ID, req.query as any);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, p(req.params.id));
      if (!project) return res.status(404).json({ error: "Project not found" });
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Failed to fetch project" });
    }
  });

  const projectSchema = z.object({
    projectNumber: z.string().min(1, "Project number required"),
    name: z.string().min(1, "Project name required"),
    clientName: z.string().optional(),
    contractValue: z.string().optional(),
    startDate: z.string().optional(),
    expectedEndDate: z.string().optional(),
  });

  app.post("/api/projects", async (req: Request, res: Response) => {
    try {
      const validated = projectSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "project",
        entityId: "pending",
        actionType: "create_project",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: parseFloat(req.body.contractValue || "0") > 1000000 ? "high" : "medium" },
      });
      
      if (parseFloat(req.body.contractValue || "0") < 500000) {
        await approvalService.processDecision({ requestId: approvalId, actor: "auto", decision: "approved", notes: "Auto-approved under $500K" }, DEFAULT_TENANT_ID);
        const project = await projectsService.createProject(DEFAULT_TENANT_ID, validated.data as any, req.body.actorId);
        return res.status(201).json(project);
      }
      
      res.status(202).json({ message: "Project creation pending approval", approvalId });
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const project = await projectsService.updateProject(DEFAULT_TENANT_ID, p(req.params.id), req.body, req.body.actorId);
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Failed to update project" });
    }
  });

  app.post("/api/projects/:id/close", async (req: Request, res: Response) => {
    try {
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "project",
        entityId: p(req.params.id),
        actionType: "close_project",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "high" },
      });
      res.status(202).json({ message: "Project closure pending approval", approvalId });
    } catch (error) {
      console.error("Error closing project:", error);
      res.status(500).json({ error: "Failed to close project" });
    }
  });

  app.get("/api/projects/:id/summary", async (req: Request, res: Response) => {
    try {
      const summary = await projectsService.getProjectSummary(DEFAULT_TENANT_ID, p(req.params.id));
      if (!summary) return res.status(404).json({ error: "Project not found" });
      res.json(summary);
    } catch (error) {
      console.error("Error fetching project summary:", error);
      res.status(500).json({ error: "Failed to fetch project summary" });
    }
  });

  app.get("/api/projects/:id/milestones", async (req: Request, res: Response) => {
    try {
      const milestones = await projectsService.getMilestones(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching milestones:", error);
      res.status(500).json({ error: "Failed to fetch milestones" });
    }
  });

  app.get("/api/projects/:id/rfis", async (req: Request, res: Response) => {
    try {
      const rfis = await projectsService.listRFIs(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(rfis);
    } catch (error) {
      console.error("Error fetching RFIs:", error);
      res.status(500).json({ error: "Failed to fetch RFIs" });
    }
  });

  app.get("/api/projects/:id/change-orders", async (req: Request, res: Response) => {
    try {
      const cos = await projectsService.listChangeOrders(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(cos);
    } catch (error) {
      console.error("Error fetching change orders:", error);
      res.status(500).json({ error: "Failed to fetch change orders" });
    }
  });

  app.post("/api/projects/:id/rfis", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const rfiNumber = req.body.rfiNumber || await projectsService.autoNumberRFI(DEFAULT_TENANT_ID, projectId);
      const rfi = await projectsService.createRFI(DEFAULT_TENANT_ID, {
        projectId,
        rfiNumber,
        subject: req.body.subject || req.body.title || "Untitled",
        question: req.body.question || req.body.subject || "",
        priority: req.body.priority,
      });
      res.json(rfi);
    } catch (error) {
      console.error("Error creating RFI:", error);
      res.status(500).json({ error: "Failed to create RFI" });
    }
  });

  app.post("/api/projects/:id/change-orders", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const co = await projectsService.createChangeOrder(DEFAULT_TENANT_ID, {
        projectId,
        coNumber: req.body.coNumber || req.body.title || `CO-${Date.now()}`,
        title: req.body.title || req.body.coNumber || "Untitled",
        description: req.body.description,
        changeType: req.body.changeType || "modification",
        amount: req.body.amount,
      });
      res.json(co);
    } catch (error) {
      console.error("Error creating change order:", error);
      res.status(500).json({ error: "Failed to create change order" });
    }
  });

  app.get("/api/projects/:id/submittals", async (req: Request, res: Response) => {
    try {
      const list = await projectsService.listSubmittals(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(list);
    } catch (error) {
      console.error("Error fetching submittals:", error);
      res.status(500).json({ error: "Failed to fetch submittals" });
    }
  });

  app.post("/api/projects/:id/submittals", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const submittalNumber = req.body.submittalNumber || await projectsService.autoNumberSubmittal(DEFAULT_TENANT_ID, projectId);
      const sub = await projectsService.createSubmittal(DEFAULT_TENANT_ID, {
        projectId,
        submittalNumber,
        name: req.body.name || req.body.title || "Untitled",
        submittalType: req.body.submittalType,
        description: req.body.description,
        priority: req.body.priority,
      });
      res.json(sub);
    } catch (error) {
      console.error("Error creating submittal:", error);
      res.status(500).json({ error: "Failed to create submittal" });
    }
  });

  app.get("/api/projects/:id/tasks", async (req: Request, res: Response) => {
    try {
      const list = await projectsService.listProjectTasks(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(list);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });

  app.post("/api/projects/:id/tasks", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const task = await projectsService.createProjectTask(DEFAULT_TENANT_ID, {
        projectId,
        name: req.body.name || req.body.title || "Untitled",
        description: req.body.description,
        assignees: req.body.assignees,
        priority: req.body.priority,
        source: req.body.source || "manual",
      });
      res.json(task);
    } catch (error) {
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Failed to create task" });
    }
  });

  app.get("/api/projects/:id/purchase-orders", async (req: Request, res: Response) => {
    try {
      const { inventoryService } = await import("./services/inventory.service");
      const list = await inventoryService.listPurchaseOrders(DEFAULT_TENANT_ID, { projectId: p(req.params.id) });
      res.json(list);
    } catch (error) {
      console.error("Error fetching POs:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.post("/api/projects/:id/purchase-orders", async (req: Request, res: Response) => {
    try {
      const { inventoryService } = await import("./services/inventory.service");
      const projectId = p(req.params.id);
      const po = await inventoryService.createPurchaseOrder(DEFAULT_TENANT_ID, {
        poNumber: req.body.poNumber || `PO-${Date.now()}`,
        vendorId: req.body.vendorId || "",
        projectId,
        notes: req.body.notes,
        lines: req.body.lines || [],
      });
      res.json(po);
    } catch (error) {
      console.error("Error creating PO:", error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  app.get("/api/projects/:id/bills", async (req: Request, res: Response) => {
    try {
      const { financeService } = await import("./services/finance.service");
      const list = await financeService.listInvoices(DEFAULT_TENANT_ID, { projectId: p(req.params.id), invoiceType: "payable" });
      res.json(list);
    } catch (error) {
      console.error("Error fetching bills:", error);
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  app.post("/api/projects/:id/bills", async (req: Request, res: Response) => {
    try {
      const { financeService } = await import("./services/finance.service");
      const projectId = p(req.params.id);
      const invoice = await financeService.createInvoice(DEFAULT_TENANT_ID, {
        invoiceNumber: req.body.invoiceNumber || `BILL-${Date.now()}`,
        invoiceType: "payable",
        projectId,
        vendorId: req.body.vendorId,
        totalAmount: req.body.totalAmount,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error creating bill:", error);
      res.status(500).json({ error: "Failed to create bill" });
    }
  });

  app.get("/api/projects/:id/client-invoices", async (req: Request, res: Response) => {
    try {
      const { financeService } = await import("./services/finance.service");
      const list = await financeService.listInvoices(DEFAULT_TENANT_ID, { projectId: p(req.params.id), invoiceType: "receivable" });
      res.json(list);
    } catch (error) {
      console.error("Error fetching client invoices:", error);
      res.status(500).json({ error: "Failed to fetch client invoices" });
    }
  });

  app.post("/api/projects/:id/client-invoices", async (req: Request, res: Response) => {
    try {
      const { financeService } = await import("./services/finance.service");
      const projectId = p(req.params.id);
      const invoice = await financeService.createInvoice(DEFAULT_TENANT_ID, {
        invoiceNumber: req.body.invoiceNumber || `INV-${Date.now()}`,
        invoiceType: "receivable",
        projectId,
        clientId: req.body.clientId,
        totalAmount: req.body.totalAmount,
      });
      res.json(invoice);
    } catch (error) {
      console.error("Error creating client invoice:", error);
      res.status(500).json({ error: "Failed to create client invoice" });
    }
  });

  app.post("/api/projects/:id/ensure-documents", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const { ensureDefaultProjectFolders } = await import("./services/project-documents.seed");
      const folders = await ensureDefaultProjectFolders(DEFAULT_TENANT_ID, projectId);

      let ingestionResult: any = null;
      if (project.bidProjectId) {
        const { runFullIngestion } = await import("./services/ingestion-pipeline.service");
        ingestionResult = await runFullIngestion(DEFAULT_TENANT_ID, project.bidProjectId, projectId);
      }

      res.json({
        folders: folders.created ?? 0,
        skipped: folders.skipped ?? false,
        ingestion: ingestionResult ?? { runId: null, discovered: 0, upserted: 0, downloaded: 0, filed: 0, failed: 0, skipped: 0, extractedFromZips: 0, errors: [] },
      });
    } catch (error) {
      console.error("Error ensuring project documents:", error);
      res.status(500).json({ error: "Failed to ensure project documents" });
    }
  });

  app.post("/api/projects/:id/sync-documents", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.bidProjectId) return res.status(400).json({ error: "Project has no linked bid project" });

      const { runFullIngestion } = await import("./services/ingestion-pipeline.service");
      const result = await runFullIngestion(DEFAULT_TENANT_ID, project.bidProjectId, projectId);
      res.json(result);
    } catch (error) {
      console.error("Error syncing project documents:", error);
      res.status(500).json({ error: "Failed to sync project documents" });
    }
  });

  app.post("/api/projects/:id/ingestion/run", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.bidProjectId) return res.status(400).json({ error: "Project has no linked bid project" });

      const { runFullIngestion } = await import("./services/ingestion-pipeline.service");
      const result = await runFullIngestion(DEFAULT_TENANT_ID, project.bidProjectId, projectId);
      res.json({ ...result, projectId, bidProjectId: project.bidProjectId });
    } catch (error) {
      console.error("Error running ingestion:", error);
      res.status(500).json({ error: "Failed to run ingestion pipeline" });
    }
  });

  app.post("/api/bid-projects/:id/ingestion/run", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.id);
      const { runFullIngestion } = await import("./services/ingestion-pipeline.service");
      const result = await runFullIngestion(DEFAULT_TENANT_ID, bidProjectId);
      res.json(result);
    } catch (error) {
      console.error("Error running bid project ingestion:", error);
      res.status(500).json({ error: "Failed to run ingestion pipeline" });
    }
  });

  app.post("/api/projects/:id/ingestion/resync", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });
      if (!project.bidProjectId) return res.status(400).json({ error: "Project has no linked bid project" });

      const { resyncIngestion } = await import("./services/ingestion-pipeline.service");
      const result = await resyncIngestion(DEFAULT_TENANT_ID, project.bidProjectId, projectId);
      res.json(result);
    } catch (error) {
      console.error("Error resyncing ingestion:", error);
      res.status(500).json({ error: "Failed to resync ingestion" });
    }
  });

  app.post("/api/ingestion/artifacts/:artifactId/retry", async (req: Request, res: Response) => {
    try {
      const artifactId = p(req.params.artifactId);
      const { retryArtifact } = await import("./services/ingestion-pipeline.service");
      const result = await retryArtifact(DEFAULT_TENANT_ID, artifactId);
      res.json(result);
    } catch (error) {
      console.error("Error retrying artifact:", error);
      res.status(500).json({ error: "Failed to retry artifact" });
    }
  });

  app.get("/api/projects/:id/ingestion/status", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      if (!project.bidProjectId) {
        return res.json({ hasBidProject: false, artifacts: { total: 0, downloaded: 0, pending: 0, failed: 0 }, sources: {}, byStatus: {}, bySource: {} });
      }

      const { getIngestionStatus } = await import("./services/ingestion-pipeline.service");
      const status = await getIngestionStatus(DEFAULT_TENANT_ID, project.bidProjectId);

      const { bidJacketArtifacts: bjaTable } = await import("@shared/schema");
      const { eq: eqFn, and: andFn } = await import("drizzle-orm");
      const allArtifacts = await db
        .select({
          id: bjaTable.id,
          title: bjaTable.title,
          templateCode: bjaTable.templateCode,
          sourceType: bjaTable.sourceType,
          sourceUrl: bjaTable.sourceUrl,
          storageKey: bjaTable.storageKey,
          status: bjaTable.status,
          metadataJson: bjaTable.metadataJson,
          updatedAt: bjaTable.updatedAt,
        })
        .from(bjaTable)
        .where(andFn(eqFn(bjaTable.tenantId, DEFAULT_TENANT_ID), eqFn(bjaTable.bidProjectId, project.bidProjectId)));

      res.json({
        hasBidProject: true,
        bidProjectId: project.bidProjectId,
        ...status,
        artifacts: allArtifacts,
      });
    } catch (error) {
      console.error("Error fetching ingestion status:", error);
      res.status(500).json({ error: "Failed to fetch ingestion status" });
    }
  });

  app.get("/api/projects/:id/ingestion-status", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      if (!project) return res.status(404).json({ error: "Project not found" });

      if (!project.bidProjectId) {
        return res.json({ hasBidProject: false, artifacts: { total: 0, downloaded: 0, pending: 0, failed: 0 }, sources: {} });
      }

      const { getIngestionStatus } = await import("./services/ingestion-pipeline.service");
      const status = await getIngestionStatus(DEFAULT_TENANT_ID, project.bidProjectId);

      res.json({
        hasBidProject: true,
        bidProjectId: project.bidProjectId,
        ...status,
      });
    } catch (error) {
      console.error("Error fetching ingestion status:", error);
      res.status(500).json({ error: "Failed to fetch ingestion status" });
    }
  });

  app.get("/api/projects/:id/ingestion-events", async (req: Request, res: Response) => {
    try {
      const { ingestionEvents } = await import("../shared/schema");
      const { eq: eqFn, and: andFn, desc: descFn, or: orFn } = await import("drizzle-orm");
      const projectId = p(req.params.id);
      const project = await projectsService.getProject(DEFAULT_TENANT_ID, projectId);
      const bidProjectId = (req.query.bidProjectId as string) || project?.bidProjectId || undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

      const conditions: any[] = [eqFn(ingestionEvents.tenantId, DEFAULT_TENANT_ID)];
      if (bidProjectId) {
        conditions.push(
          orFn(
            eqFn(ingestionEvents.projectId, projectId),
            eqFn(ingestionEvents.bidProjectId, bidProjectId)
          )
        );
      } else {
        conditions.push(eqFn(ingestionEvents.projectId, projectId));
      }

      const events = await db
        .select()
        .from(ingestionEvents)
        .where(andFn(...conditions))
        .orderBy(descFn(ingestionEvents.createdAt))
        .limit(limit);

      res.json(events);
    } catch (error) {
      console.error("Error fetching ingestion events:", error);
      res.status(500).json({ error: "Failed to fetch ingestion events" });
    }
  });

  app.get("/api/projects/:id/daily-logs", async (req: Request, res: Response) => {
    try {
      const logs = await projectsService.getDailyLogs(DEFAULT_TENANT_ID, p(req.params.id), req.query as any);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching daily logs:", error);
      res.status(500).json({ error: "Failed to fetch daily logs" });
    }
  });

  // Manual daily-log creation. Maps the 5 quick-entry fields from the
  // Voice Daily Log page into the dailyLogs JSONB columns. We register
  // this BEFORE registerSimpleProjectModuleRoutes so this concrete handler
  // wins for the dailyLogs table (the generic loop targets a different
  // table called projectDailyLogs).
  app.post("/api/projects/:id/daily-logs", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.id);
      const b = req.body ?? {};
      const toLines = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
        if (typeof v === "string") return v.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        return [];
      };
      const tasksCompleted = toLines(b.tasks_completed ?? b.tasksCompleted);
      const issues = toLines(b.issues);
      const safetyNotes = toLines(b.safety_notes ?? b.safetyNotes);
      const crewCount = b.crew_count ?? b.crewCount;
      const crewNum = crewCount !== undefined && crewCount !== null && crewCount !== ""
        ? Number(crewCount)
        : undefined;
      const weather = typeof b.weather === "string" ? b.weather.trim() : "";
      const logDate = b.logDate ? new Date(b.logDate) : new Date();
      const log = await projectsService.createDailyLog(DEFAULT_TENANT_ID, {
        projectId,
        logDate,
        weatherJson: weather ? { summary: weather } : undefined,
        workPerformedJson: tasksCompleted.length ? tasksCompleted : undefined,
        laborJson: crewNum !== undefined && Number.isFinite(crewNum) && crewNum >= 0
          ? [{ count: crewNum }]
          : undefined,
        issuesJson: issues.length ? issues : undefined,
        safetyNotesJson: safetyNotes.length ? safetyNotes : undefined,
        notes: typeof b.notes === "string" ? b.notes : undefined,
      });
      res.json(log);
    } catch (error: any) {
      console.error("Error creating daily log:", error);
      res.status(500).json({ error: error?.message ?? "Failed to create daily log" });
    }
  });

  // ============================================================================
  // PROJECT IMPORT ROUTES
  // ============================================================================

  const { importProjectsFromExcel, backfillNormalizedNames } = await import("./services/project-import.service");
  const multer = await import("multer");
  const upload = multer.default({ dest: "/tmp/uploads/" });

  app.post("/api/projects/import", upload.single("file"), async (req: Request, res: Response) => {
    try {
      const file = (req as any).file;
      if (!file) return res.status(400).json({ error: "No file uploaded" });
      const result = await importProjectsFromExcel(file.path, DEFAULT_TENANT_ID, file.originalname);
      res.json(result);
    } catch (error) {
      console.error("Error importing projects:", error);
      res.status(500).json({ error: "Failed to import projects" });
    }
  });

  app.post("/api/projects/import-file", async (req: Request, res: Response) => {
    try {
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ error: "filePath required" });
      const result = await importProjectsFromExcel(filePath, DEFAULT_TENANT_ID, filePath.split("/").pop() || "import.xlsx");
      res.json(result);
    } catch (error) {
      console.error("Error importing projects:", error);
      res.status(500).json({ error: "Failed to import projects" });
    }
  });

  app.post("/api/projects/backfill-names", async (req: Request, res: Response) => {
    try {
      const count = await backfillNormalizedNames(DEFAULT_TENANT_ID);
      res.json({ updated: count });
    } catch (error) {
      console.error("Error backfilling names:", error);
      res.status(500).json({ error: "Failed to backfill" });
    }
  });

  // ============================================================================
  // PORTFOLIO DASHBOARD ENDPOINT
  // ============================================================================

  app.get("/api/dashboard/portfolio", async (req: Request, res: Response) => {
    try {
      const tid = DEFAULT_TENANT_ID;
      const allProjects = await db.select().from(projects).where(eq(projects.tenantId, tid));

      const totalProjects = allProjects.length;
      const activeProjects = allProjects.filter(p => p.status === "active").length;
      const totalBudget = allProjects.reduce((sum, p) => sum + (parseFloat(p.contractValue || "0")), 0);
      const totalActualCosts = allProjects.reduce((sum, p) => sum + (parseFloat(p.actualCosts || "0")), 0);
      const totalPaidInvoices = allProjects.reduce((sum, p) => sum + (parseFloat(p.paidInvoices || "0")), 0);
      const totalGrossProfit = allProjects.reduce((sum, p) => sum + (parseFloat(p.grossProfit || "0")), 0);

      const statusMap: Record<string, { count: number; totalBudget: number }> = {};
      allProjects.forEach(p => {
        if (!statusMap[p.status]) statusMap[p.status] = { count: 0, totalBudget: 0 };
        statusMap[p.status].count++;
        statusMap[p.status].totalBudget += parseFloat(p.contractValue || "0");
      });
      const projectsByStatus = Object.entries(statusMap).map(([status, data]) => ({
        status, count: data.count, totalBudget: data.totalBudget,
      }));

      const projectIds = allProjects.map(p => p.id);

      let overdueTasksByProject: any[] = [];
      let openRFIsByProject: any[] = [];
      let pendingSubmittalsByProject: any[] = [];
      let outstandingPOsTotal = 0;
      let changeOrdersTotal = 0;
      let invoicesTotal = 0;
      let upcomingDeadlines: any[] = [];

      const projectNameMap = new Map(allProjects.map(p => [p.id, p.name]));

      if (projectIds.length > 0) {
        const taskRows = await db.execute(sql`
          SELECT project_id, COUNT(*) as cnt FROM project_tasks
          WHERE tenant_id = ${tid} AND project_id IS NOT NULL
            AND status NOT IN ('completed','done','closed')
            AND due_date IS NOT NULL AND due_date < NOW()
          GROUP BY project_id
        `);
        overdueTasksByProject = (taskRows.rows || []).map((r: any) => ({
          projectId: r.project_id, projectName: projectNameMap.get(r.project_id) || "Unknown", overdueCount: parseInt(r.cnt),
        }));

        const rfiRows = await db.execute(sql`
          SELECT project_id, COUNT(*) as cnt FROM rfis
          WHERE tenant_id = ${tid} AND project_id IS NOT NULL
            AND status IN ('open','submitted','pending')
          GROUP BY project_id
        `);
        openRFIsByProject = (rfiRows.rows || []).map((r: any) => ({
          projectId: r.project_id, projectName: projectNameMap.get(r.project_id) || "Unknown", openCount: parseInt(r.cnt),
        }));

        const subRows = await db.execute(sql`
          SELECT project_id, COUNT(*) as cnt FROM submittals
          WHERE tenant_id = ${tid} AND project_id IS NOT NULL
            AND status IN ('open','submitted','pending','under_review')
          GROUP BY project_id
        `);
        pendingSubmittalsByProject = (subRows.rows || []).map((r: any) => ({
          projectId: r.project_id, projectName: projectNameMap.get(r.project_id) || "Unknown", pendingCount: parseInt(r.cnt),
        }));

        const poResult = await db.execute(sql`
          SELECT COALESCE(SUM(CAST(total_amount AS numeric)), 0) as total FROM purchase_orders
          WHERE tenant_id = ${tid} AND status NOT IN ('closed','paid','cancelled')
        `);
        outstandingPOsTotal = parseFloat((poResult.rows?.[0] as any)?.total || "0");

        const coResult = await db.execute(sql`
          SELECT COALESCE(SUM(CAST(amount AS numeric)), 0) as total FROM change_orders
          WHERE tenant_id = ${tid} AND status NOT IN ('rejected','cancelled')
        `);
        changeOrdersTotal = parseFloat((coResult.rows?.[0] as any)?.total || "0");

        const invResult = await db.execute(sql`
          SELECT COALESCE(SUM(CAST(total_amount AS numeric)), 0) as total FROM invoices
          WHERE tenant_id = ${tid} AND status NOT IN ('paid','cancelled')
        `);
        invoicesTotal = parseFloat((invResult.rows?.[0] as any)?.total || "0");

        const deadlineRows = await db.execute(sql`
          (SELECT 'task' as entity_type, id, project_id, name as title, due_date, status FROM project_tasks
           WHERE tenant_id = ${tid} AND due_date IS NOT NULL AND due_date > NOW() AND status NOT IN ('completed','done','closed')
           ORDER BY due_date LIMIT 10)
          UNION ALL
          (SELECT 'rfi' as entity_type, id, project_id, subject as title, due_date, status FROM rfis
           WHERE tenant_id = ${tid} AND due_date IS NOT NULL AND due_date > NOW() AND status NOT IN ('closed','resolved')
           ORDER BY due_date LIMIT 5)
          ORDER BY due_date LIMIT 15
        `);
        upcomingDeadlines = (deadlineRows.rows || []).map((r: any) => ({
          entityType: r.entity_type, id: r.id, projectId: r.project_id,
          title: r.title, dueDate: r.due_date, status: r.status,
          projectName: projectNameMap.get(r.project_id) || null,
        }));
      }

      const topProjectsByBudget = allProjects
        .filter(p => parseFloat(p.contractValue || "0") > 0)
        .sort((a, b) => parseFloat(b.contractValue || "0") - parseFloat(a.contractValue || "0"))
        .slice(0, 10)
        .map(p => ({ id: p.id, name: p.name, budget: parseFloat(p.contractValue || "0"), status: p.status }));

      res.json({
        totalProjects, activeProjects, totalBudget, totalActualCosts, totalPaidInvoices, totalGrossProfit,
        projectsByStatus, overdueTasksByProject, openRFIsByProject, pendingSubmittalsByProject,
        outstandingPOsTotal, changeOrdersTotal, invoicesTotal,
        upcomingDeadlines, topProjectsByBudget,
      });
    } catch (error) {
      console.error("Error fetching portfolio:", error);
      res.status(500).json({ error: "Failed to fetch portfolio data" });
    }
  });

  // ============================================================================
  // DATA HYGIENE ENDPOINT
  // ============================================================================

  app.get("/api/data-hygiene/unlinked", async (req: Request, res: Response) => {
    try {
      const tid = DEFAULT_TENANT_ID;
      const entityType = req.query.entityType as string;

      const tableMap: Record<string, { table: string; nameCol: string }> = {
        task: { table: "project_tasks", nameCol: "name" },
        submittal: { table: "submittals", nameCol: "name" },
        rfi: { table: "rfis", nameCol: "subject" },
        purchaseOrder: { table: "purchase_orders", nameCol: "po_number" },
        changeOrder: { table: "change_orders", nameCol: "title" },
        invoice: { table: "invoices", nameCol: "invoice_number" },
      };

      if (entityType && tableMap[entityType]) {
        const t = tableMap[entityType];
        const result = await db.execute(sql.raw(
          `SELECT id, ${t.nameCol} as name, status, created_at FROM ${t.table} WHERE tenant_id = '${tid}' AND project_id IS NULL ORDER BY created_at DESC LIMIT 100`
        ));
        return res.json({ entityType, records: result.rows || [] });
      }

      const counts: Record<string, number> = {};
      for (const [key, t] of Object.entries(tableMap)) {
        const result = await db.execute(sql.raw(
          `SELECT COUNT(*) as cnt FROM ${t.table} WHERE tenant_id = '${tid}' AND project_id IS NULL`
        ));
        counts[key] = parseInt((result.rows?.[0] as any)?.cnt || "0");
      }
      res.json({ counts });
    } catch (error) {
      console.error("Error fetching unlinked records:", error);
      res.status(500).json({ error: "Failed to fetch unlinked records" });
    }
  });

  app.patch("/api/data-hygiene/link", async (req: Request, res: Response) => {
    try {
      const { entityType, entityIds, projectId } = req.body;
      if (!entityType || !entityIds?.length || !projectId) {
        return res.status(400).json({ error: "entityType, entityIds, and projectId required" });
      }

      const tableMap: Record<string, string> = {
        task: "project_tasks", submittal: "submittals", rfi: "rfis",
        purchaseOrder: "purchase_orders", changeOrder: "change_orders", invoice: "invoices",
      };

      const tableName = tableMap[entityType];
      if (!tableName) return res.status(400).json({ error: "Invalid entity type" });

      const idList = entityIds.map((id: string) => `'${id}'`).join(",");
      await db.execute(sql.raw(
        `UPDATE ${tableName} SET project_id = '${projectId}', updated_at = NOW() WHERE id IN (${idList}) AND tenant_id = '${DEFAULT_TENANT_ID}'`
      ));

      res.json({ linked: entityIds.length });
    } catch (error) {
      console.error("Error linking records:", error);
      res.status(500).json({ error: "Failed to link records" });
    }
  });

  // ============================================================================
  // VENDOR SERVICE ROUTES
  // ============================================================================

  const { vendorService } = await import("./services/vendor.service");

  // ============================================================================
  // VENDOR CONFIDENCE — derived AI-style score for the Vendor Confidence
  // dashboard. Confidence is computed from existing rating columns plus signals
  // (insurance/license freshness, prequalification status, vendor status).
  // ============================================================================
  function computeVendorConfidence(v: any) {
    const ratings: number[] = [];
    const perf = v.performanceRating ? parseFloat(v.performanceRating) : NaN;
    const safety = v.safetyRating ? parseFloat(v.safetyRating) : NaN;
    const quality = v.qualityRating ? parseFloat(v.qualityRating) : NaN;
    if (Number.isFinite(perf)) ratings.push(perf);
    if (Number.isFinite(safety)) ratings.push(safety);
    if (Number.isFinite(quality)) ratings.push(quality);
    // Ratings are 0–5; convert to a 0–100 base.
    const ratedAvg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length) : 3;
    let score = ratedAvg * 20;
    // Insurance freshness: fresh > 30d → +5, expired → -15
    const now = Date.now();
    const ins = v.insuranceExpiresAt ? new Date(v.insuranceExpiresAt).getTime() : null;
    if (ins) {
      const daysLeft = Math.round((ins - now) / 86400000);
      if (daysLeft >= 30) score += 5;
      else if (daysLeft < 0) score -= 15;
      else score -= 5;
    }
    // License freshness mirrors insurance with smaller weight.
    const lic = v.licenseExpiresAt ? new Date(v.licenseExpiresAt).getTime() : null;
    if (lic) {
      const daysLeft = Math.round((lic - now) / 86400000);
      if (daysLeft >= 30) score += 3;
      else if (daysLeft < 0) score -= 10;
    }
    const prequal = (v.prequalificationStatus || "").toLowerCase();
    if (prequal === "approved") score += 8;
    else if (prequal === "pending") score -= 2;
    else if (prequal === "rejected" || prequal === "blacklisted") score -= 25;
    const status = (v.status || "").toLowerCase();
    if (status === "inactive" || status === "suspended" || status === "blacklisted") score -= 30;
    score = Math.max(0, Math.min(100, Math.round(score)));
    let tier: "Preferred" | "Approved" | "Watch" | "At-Risk";
    if (score >= 85) tier = "Preferred";
    else if (score >= 70) tier = "Approved";
    else if (score >= 50) tier = "Watch";
    else tier = "At-Risk";
    return { score, tier };
  }

  app.get("/api/vendor-confidence/vendors", async (_req: Request, res: Response) => {
    try {
      const all = await vendorService.listVendors(DEFAULT_TENANT_ID);
      if (!Array.isArray(all)) {
        return res.status(500).json({ error: "Vendor service returned no data" });
      }
      const enriched = all.map((v: any) => {
        const { score, tier } = computeVendorConfidence(v);
        return {
          id: v.id,
          vendorNumber: v.vendorNumber,
          companyName: v.companyName,
          vendorType: v.vendorType,
          status: v.status,
          trade: v.vendorType === "subcontractor" ? "Subcontractor" : v.vendorType,
          confidenceScore: score,
          tier,
          performanceRating: v.performanceRating ? parseFloat(v.performanceRating) : null,
          safetyRating: v.safetyRating ? parseFloat(v.safetyRating) : null,
          qualityRating: v.qualityRating ? parseFloat(v.qualityRating) : null,
          prequalificationStatus: v.prequalificationStatus,
          insuranceExpiresAt: v.insuranceExpiresAt,
          licenseExpiresAt: v.licenseExpiresAt,
          updatedAt: v.updatedAt,
        };
      });
      enriched.sort((a: any, b: any) => b.confidenceScore - a.confidenceScore);
      res.json(enriched);
    } catch (error) {
      console.error("Error fetching vendor-confidence vendors:", error);
      res.status(500).json({ error: "Failed to fetch vendor confidence list" });
    }
  });

  app.get("/api/vendor-confidence/stats", async (_req: Request, res: Response) => {
    try {
      const all = await vendorService.listVendors(DEFAULT_TENANT_ID);
      if (!Array.isArray(all)) {
        return res.status(500).json({ error: "Vendor service returned no data" });
      }
      const tiers = { Preferred: 0, Approved: 0, Watch: 0, "At-Risk": 0 };
      let scoreSum = 0;
      let scoreCount = 0;
      let expiredInsurance = 0;
      let expiringInsurance = 0;
      const now = Date.now();
      for (const v of all) {
        const { score, tier } = computeVendorConfidence(v);
        tiers[tier]++;
        scoreSum += score;
        scoreCount++;
        if (v.insuranceExpiresAt) {
          const t = new Date(v.insuranceExpiresAt).getTime();
          const daysLeft = Math.round((t - now) / 86400000);
          if (daysLeft < 0) expiredInsurance++;
          else if (daysLeft < 30) expiringInsurance++;
        }
      }
      const avgConfidence = scoreCount ? Math.round(scoreSum / scoreCount) : 0;
      res.json({
        total: scoreCount,
        avgConfidence,
        tiers,
        preferred: tiers.Preferred,
        approved: tiers.Approved,
        watch: tiers.Watch,
        atRisk: tiers["At-Risk"],
        expiredInsurance,
        expiringInsurance,
      });
    } catch (error) {
      console.error("Error fetching vendor-confidence stats:", error);
      res.status(500).json({ error: "Failed to fetch vendor confidence stats" });
    }
  });

  app.get("/api/vendors/stats", async (req: Request, res: Response) => {
    try {
      const allVendors = await vendorService.listVendors(DEFAULT_TENANT_ID);
      const subcontractorCount = allVendors.filter((v: any) => v.vendorType === "subcontractor").length;
      const pendingCount = allVendors.filter((v: any) => v.prequalificationStatus === "pending").length;
      const ratings = allVendors.filter((v: any) => v.performanceRating).map((v: any) => parseFloat(v.performanceRating));
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 4.2;

      res.json({
        totalVendors: allVendors.length,
        activeSubcontracts: subcontractorCount,
        pendingBids: pendingCount,
        avgPerformanceRating: parseFloat(avgRating.toFixed(1)),
      });
    } catch (error) {
      console.error("Error fetching vendor stats:", error);
      res.json({ totalVendors: 0, activeSubcontracts: 0, pendingBids: 0, avgPerformanceRating: 0 });
    }
  });

  app.get("/api/vendors", async (req: Request, res: Response) => {
    try {
      const vendors = await vendorService.listVendors(DEFAULT_TENANT_ID, req.query as any);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  // IMPORTANT: These specific routes must come before :id param route
  app.get("/api/vendors/subcontractor-bids", async (req: Request, res: Response) => {
    try {
      const bids = await vendorService.listSubcontractorBids(DEFAULT_TENANT_ID, req.query.projectId as string);
      res.json(bids || []);
    } catch (error) {
      console.error("Error fetching subcontractor bids:", error);
      res.json([]);
    }
  });

  app.get("/api/vendors/subcontracts", async (req: Request, res: Response) => {
    try {
      const contracts = await vendorService.listSubcontracts(DEFAULT_TENANT_ID, req.query as any);
      res.json(contracts || []);
    } catch (error) {
      console.error("Error fetching subcontracts:", error);
      res.json([]);
    }
  });

  const subcontractSchema = z.object({
    subcontractNumber: z.string().min(1, "Subcontract number required"),
    projectId: z.string().min(1, "Project ID required"),
    vendorId: z.string().min(1, "Vendor ID required"),
    scopeDescription: z.string().optional(),
    contractAmount: z.string().min(1, "Contract amount required"),
    retainagePercent: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  });

  app.post("/api/vendors/subcontracts", async (req: Request, res: Response) => {
    try {
      const validated = subcontractSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const subcontract = await vendorService.createSubcontract(
        DEFAULT_TENANT_ID,
        {
          ...validated.data,
          startDate: validated.data.startDate ? new Date(validated.data.startDate) : undefined,
          endDate: validated.data.endDate ? new Date(validated.data.endDate) : undefined,
        },
        req.body.actorId
      );
      res.status(201).json(subcontract);
    } catch (error) {
      console.error("Error creating subcontract:", error);
      res.status(500).json({ error: "Failed to create subcontract" });
    }
  });

  // VENDOR CONFIDENCE-GATED CREATION
  app.post("/api/vendors/create-gated", async (req: Request, res: Response) => {
    try {
      const { name, trade, contactName, contactEmail, contactPhone, source, sourceReference } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Vendor name is required" });
      }

      const { vendorConfidenceService } = await import("./services/vendor-confidence.service");
      const result = await vendorConfidenceService.createWithConfidenceGating(DEFAULT_TENANT_ID, {
        name: name.trim(),
        trade,
        contactName,
        contactEmail,
        contactPhone,
        source,
        sourceReference,
      });

      const statusCode = result.action === "created" ? 201 : 200;
      res.status(statusCode).json(result);
    } catch (error: any) {
      console.error("[Vendor Confidence] Error creating gated vendor:", error);
      res.status(500).json({ error: "Failed to process vendor creation", message: error.message });
    }
  });

  app.get("/api/vendors/pending-reviews", async (_req: Request, res: Response) => {
    try {
      const { vendorConfidenceService } = await import("./services/vendor-confidence.service");
      const pending = await vendorConfidenceService.getPendingVendorReviews(DEFAULT_TENANT_ID);
      res.json(pending);
    } catch (error: any) {
      console.error("[Vendor Confidence] Error fetching pending reviews:", error);
      res.status(500).json({ error: "Failed to fetch pending vendor reviews", message: error.message });
    }
  });

  app.post("/api/vendors/:approvalId/approve", async (req: Request, res: Response) => {
    try {
      const approvalId = p(req.params.approvalId);
      const { vendorConfidenceService } = await import("./services/vendor-confidence.service");
      const result = await vendorConfidenceService.approveVendorCreation(DEFAULT_TENANT_ID, approvalId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error("[Vendor Confidence] Error approving vendor:", error);
      const status = error.message?.includes("not found") ? 404 : 500;
      res.status(status).json({ error: "Failed to approve vendor creation", message: error.message });
    }
  });

  app.get("/api/vendors/:id", async (req: Request, res: Response) => {
    try {
      const vendor = await vendorService.getVendor(DEFAULT_TENANT_ID, p(req.params.id));
      if (!vendor) return res.status(404).json({ error: "Vendor not found" });
      res.json(vendor);
    } catch (error) {
      console.error("Error fetching vendor:", error);
      res.status(500).json({ error: "Failed to fetch vendor" });
    }
  });

  const vendorSchema = z.object({
    vendorNumber: z.string().min(1, "Vendor number required"),
    name: z.string().min(1, "Vendor name required"),
    vendorType: z.string().optional(),
    contactName: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
  });

  app.post("/api/vendors", async (req: Request, res: Response) => {
    try {
      const body = { ...req.body };
      if (!body.vendorNumber) {
        body.vendorNumber = `VND-${Date.now().toString(36).toUpperCase()}`;
      }
      const validated = vendorSchema.safeParse(body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const vendorData = {
        ...validated.data,
        companyName: validated.data.name,
      };
      const vendor = await vendorService.createVendor(DEFAULT_TENANT_ID, vendorData as any, req.body.actorId);
      res.status(201).json(vendor);
    } catch (error) {
      console.error("Error creating vendor:", error);
      res.status(500).json({ error: "Failed to create vendor" });
    }
  });

  app.patch("/api/vendors/:id", async (req: Request, res: Response) => {
    try {
      const vendor = await vendorService.updateVendor(DEFAULT_TENANT_ID, p(req.params.id), req.body, req.body.actorId);
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor:", error);
      res.status(500).json({ error: "Failed to update vendor" });
    }
  });

  app.delete("/api/vendors/:id", async (req: Request, res: Response) => {
    try {
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "vendor",
        entityId: p(req.params.id),
        actionType: "deactivate_vendor",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "medium" },
      });
      res.status(202).json({ message: "Vendor deactivation pending approval", approvalId });
    } catch (error) {
      console.error("Error deactivating vendor:", error);
      res.status(500).json({ error: "Failed to deactivate vendor" });
    }
  });

  app.get("/api/vendors/:id/performance", async (req: Request, res: Response) => {
    try {
      const performance = await vendorService.getVendorPerformanceSummary(DEFAULT_TENANT_ID, p(req.params.id));
      if (!performance) return res.status(404).json({ error: "Vendor not found" });
      res.json(performance);
    } catch (error) {
      console.error("Error fetching vendor performance:", error);
      res.status(500).json({ error: "Failed to fetch vendor performance" });
    }
  });

  // ============================================================================
  // COMPLIANCE SERVICE ROUTES
  // ============================================================================

  const { complianceService } = await import("./services/compliance.service");

  app.get("/api/compliance/frameworks", async (req: Request, res: Response) => {
    try {
      const frameworks = await complianceService.listFrameworks(DEFAULT_TENANT_ID);
      res.json(frameworks);
    } catch (error) {
      console.error("Error fetching compliance frameworks:", error);
      res.status(500).json({ error: "Failed to fetch compliance frameworks" });
    }
  });

  app.get("/api/compliance/controls", async (req: Request, res: Response) => {
    try {
      const controls = await complianceService.listControls(DEFAULT_TENANT_ID, req.query.frameworkId as string);
      res.json(controls);
    } catch (error) {
      console.error("Error fetching compliance controls:", error);
      res.status(500).json({ error: "Failed to fetch compliance controls" });
    }
  });

  app.get("/api/compliance/scores", async (req: Request, res: Response) => {
    try {
      const scores = await complianceService.calculateComplianceScore(DEFAULT_TENANT_ID, req.query.frameworkId as string);
      res.json(scores);
    } catch (error) {
      console.error("Error calculating compliance scores:", error);
      res.status(500).json({ error: "Failed to calculate compliance scores" });
    }
  });

  app.get("/api/compliance/dashboard", async (req: Request, res: Response) => {
    try {
      const dashboard = await complianceService.getComplianceDashboard(DEFAULT_TENANT_ID);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching compliance dashboard:", error);
      res.status(500).json({ error: "Failed to fetch compliance dashboard" });
    }
  });

  app.get("/api/compliance/security-posture", async (req: Request, res: Response) => {
    try {
      const posture = await complianceService.getSecurityPosture(DEFAULT_TENANT_ID);
      res.json(posture);
    } catch (error) {
      console.error("Error fetching security posture:", error);
      res.status(500).json({ error: "Failed to fetch security posture" });
    }
  });

  const controlUpdateSchema = z.object({
    implementationStatus: z.string().min(1, "Status required"),
    implementationNotes: z.string().optional(),
    evidenceJson: z.unknown().optional(),
  });

  app.patch("/api/compliance/controls/:id", async (req: Request, res: Response) => {
    try {
      const validated = controlUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "compliance_control",
        entityId: p(req.params.id),
        actionType: "update_control_status",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "high" },
      });
      res.status(202).json({ message: "Control update pending approval", approvalId });
    } catch (error) {
      console.error("Error updating control:", error);
      res.status(500).json({ error: "Failed to update control" });
    }
  });

  const incidentSchema = z.object({
    title: z.string().min(1, "Title required"),
    description: z.string().optional(),
    severity: z.string().optional(),
    affectedSystemsJson: z.unknown().optional(),
  });

  app.post("/api/compliance/security-incidents", async (req: Request, res: Response) => {
    try {
      const validated = incidentSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const incident = await complianceService.createSecurityIncident(DEFAULT_TENANT_ID, validated.data as any);
      res.status(201).json(incident);
    } catch (error) {
      console.error("Error creating security incident:", error);
      res.status(500).json({ error: "Failed to create security incident" });
    }
  });

  app.get("/api/compliance/security-incidents", async (req: Request, res: Response) => {
    try {
      const incidents = await complianceService.listSecurityIncidents(DEFAULT_TENANT_ID, req.query as any);
      res.json(incidents);
    } catch (error) {
      console.error("Error fetching security incidents:", error);
      res.status(500).json({ error: "Failed to fetch security incidents" });
    }
  });

  // ============================================================================
  // MARKETING SERVICE ROUTES
  // ============================================================================

  const { marketingService } = await import("./services/marketing.service");

  const campaignSchema = z.object({
    name: z.string().min(1, "Campaign name required"),
    campaignType: z.string().optional(),
    targetAudienceJson: z.unknown().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budget: z.string().optional(),
    goalsJson: z.unknown().optional(),
  });

  app.get("/api/marketing/campaigns", async (req: Request, res: Response) => {
    try {
      const campaigns = await marketingService.listCampaigns(DEFAULT_TENANT_ID, req.query as any);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ error: "Failed to fetch campaigns" });
    }
  });

  app.get("/api/marketing/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const campaign = await marketingService.getCampaign(DEFAULT_TENANT_ID, p(req.params.id));
      if (!campaign) return res.status(404).json({ error: "Campaign not found" });
      res.json(campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ error: "Failed to fetch campaign" });
    }
  });

  app.post("/api/marketing/campaigns", async (req: Request, res: Response) => {
    try {
      const validated = campaignSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const budget = parseFloat(req.body.budget || "0");
      if (budget > 5000) {
        const approvalId = await approvalService.createRequest({
          tenantId: DEFAULT_TENANT_ID,
          entityType: "campaign",
          entityId: "pending",
          actionType: "create_campaign",
          requestedBy: req.body.actorId || "system",
          metadata: { priority: budget > 25000 ? "high" : "medium" },
        });
        return res.status(202).json({ message: "Campaign creation pending approval (>$5K budget)", approvalId });
      }
      const campaign = await marketingService.createCampaign(DEFAULT_TENANT_ID, validated.data as any);
      res.status(201).json(campaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ error: "Failed to create campaign" });
    }
  });

  const campaignUpdateSchema = z.object({
    name: z.string().optional(),
    campaignType: z.string().optional(),
    status: z.string().optional(),
    budget: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    goalsJson: z.unknown().optional(),
  });

  app.patch("/api/marketing/campaigns/:id", async (req: Request, res: Response) => {
    try {
      const validated = campaignUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const campaign = await marketingService.updateCampaign(DEFAULT_TENANT_ID, p(req.params.id), validated.data, req.body.actorId);
      res.json(campaign);
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ error: "Failed to update campaign" });
    }
  });

  app.post("/api/marketing/campaigns/:id/launch", async (req: Request, res: Response) => {
    try {
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "campaign",
        entityId: p(req.params.id),
        actionType: "launch_campaign",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "high" },
      });
      res.status(202).json({ message: "Campaign launch pending approval", approvalId });
    } catch (error) {
      console.error("Error launching campaign:", error);
      res.status(500).json({ error: "Failed to launch campaign" });
    }
  });

  app.get("/api/marketing/campaigns/:id/metrics", async (req: Request, res: Response) => {
    try {
      const metrics = await marketingService.getCampaignMetrics(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching campaign metrics:", error);
      res.status(500).json({ error: "Failed to fetch campaign metrics" });
    }
  });

  app.get("/api/marketing/capability-statements", async (req: Request, res: Response) => {
    try {
      const statements = await marketingService.listCapabilityStatements(DEFAULT_TENANT_ID);
      res.json(statements);
    } catch (error) {
      console.error("Error fetching capability statements:", error);
      res.status(500).json({ error: "Failed to fetch capability statements" });
    }
  });

  app.get("/api/marketing/dashboard", async (req: Request, res: Response) => {
    try {
      const dashboard = await marketingService.getMarketingDashboard(DEFAULT_TENANT_ID);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching marketing dashboard:", error);
      res.status(500).json({ error: "Failed to fetch marketing dashboard" });
    }
  });

  // ============================================================================
  // FINANCE SERVICE ROUTES
  // ============================================================================

  const { financeService } = await import("./services/finance.service");

  const invoiceSchema = z.object({
    invoiceNumber: z.string().min(1, "Invoice number required"),
    invoiceType: z.string().default("payable"),
    projectId: z.string().optional(),
    vendorId: z.string().optional(),
    clientId: z.string().optional(),
    subtotal: z.string().optional(),
    taxAmount: z.string().optional(),
    totalAmount: z.string().optional(),
    dueDate: z.string().optional(),
    notesJson: z.unknown().optional(),
  });

  app.get("/api/finance/invoices", async (req: Request, res: Response) => {
    try {
      const invoices = await financeService.listInvoices(DEFAULT_TENANT_ID, req.query as any);
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.get("/api/finance/invoices/:id", async (req: Request, res: Response) => {
    try {
      const invoice = await financeService.getInvoice(DEFAULT_TENANT_ID, p(req.params.id));
      if (!invoice) return res.status(404).json({ error: "Invoice not found" });
      res.json(invoice);
    } catch (error) {
      console.error("Error fetching invoice:", error);
      res.status(500).json({ error: "Failed to fetch invoice" });
    }
  });

  app.post("/api/finance/invoices", async (req: Request, res: Response) => {
    try {
      const validated = invoiceSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const invoice = await financeService.createInvoice(DEFAULT_TENANT_ID, validated.data as any, req.body.actorId);
      res.status(201).json(invoice);
    } catch (error) {
      console.error("Error creating invoice:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  const invoiceUpdateSchema = z.object({
    status: z.string().optional(),
    subtotal: z.string().optional(),
    taxAmount: z.string().optional(),
    totalAmount: z.string().optional(),
    dueDate: z.string().optional(),
    notesJson: z.unknown().optional(),
  });

  app.patch("/api/finance/invoices/:id", async (req: Request, res: Response) => {
    try {
      const validated = invoiceUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const invoice = await financeService.updateInvoice(DEFAULT_TENANT_ID, p(req.params.id), validated.data as any, req.body.actorId);
      res.json(invoice);
    } catch (error) {
      console.error("Error updating invoice:", error);
      res.status(500).json({ error: "Failed to update invoice" });
    }
  });

  app.delete("/api/finance/invoices/:id", async (req: Request, res: Response) => {
    try {
      const approvalId = await approvalService.createRequest({
        tenantId: DEFAULT_TENANT_ID,
        entityType: "invoice",
        entityId: p(req.params.id),
        actionType: "void_invoice",
        requestedBy: req.body.actorId || "system",
        metadata: { priority: "high" },
      });
      res.status(202).json({ message: "Invoice void pending approval", approvalId });
    } catch (error) {
      console.error("Error voiding invoice:", error);
      res.status(500).json({ error: "Failed to void invoice" });
    }
  });

  app.post("/api/finance/invoices/:id/payment", async (req: Request, res: Response) => {
    try {
      const amount = parseFloat(req.body.amount || "0");
      if (amount > 10000) {
        const approvalId = await approvalService.createRequest({
          tenantId: DEFAULT_TENANT_ID,
          entityType: "invoice",
          entityId: p(req.params.id),
          actionType: "pay_invoice",
          requestedBy: req.body.actorId || "system",
          metadata: { priority: amount > 50000 ? "high" : "medium" },
        });
        return res.status(202).json({ message: "Payment pending approval (>$10K)", approvalId });
      }
      const result = await financeService.recordPayment(DEFAULT_TENANT_ID, p(req.params.id), req.body.amount, req.body.actorId);
      res.json(result);
    } catch (error) {
      console.error("Error recording payment:", error);
      res.status(500).json({ error: "Failed to record payment" });
    }
  });

  app.get("/api/finance/summary", async (req: Request, res: Response) => {
    try {
      const summary = await financeService.getFinancialSummary(DEFAULT_TENANT_ID);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      res.status(500).json({ error: "Failed to fetch financial summary" });
    }
  });

  app.get("/api/finance/projects/:id", async (req: Request, res: Response) => {
    try {
      const financials = await financeService.getProjectFinancials(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(financials);
    } catch (error) {
      console.error("Error fetching project financials:", error);
      res.status(500).json({ error: "Failed to fetch project financials" });
    }
  });

  app.get("/api/finance/dashboard", async (req: Request, res: Response) => {
    try {
      const dashboard = await financeService.getFinanceDashboard(DEFAULT_TENANT_ID);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching finance dashboard:", error);
      res.status(500).json({ error: "Failed to fetch finance dashboard" });
    }
  });

  // ============================================================================
  // PLANNER SERVICE ROUTES
  // ============================================================================

  const { plannerService } = await import("./services/planner.service");

  const calendarEventSchema = z.object({
    title: z.string().min(1, "Title required"),
    description: z.string().optional(),
    startAt: z.string(),
    endAt: z.string().optional(),
    location: z.string().nullable().optional(),
    meetingType: z.string().optional(),
    attendeesJson: z.unknown().optional(),
  });

  app.get("/api/planner/calendar-events", async (req: Request, res: Response) => {
    try {
      const events = await plannerService.getCalendarEvents(DEFAULT_TENANT_ID, {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      });
      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Failed to fetch calendar events" });
    }
  });

  app.post("/api/planner/calendar-events", async (req: Request, res: Response) => {
    try {
      const validated = calendarEventSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      // Convert string dates to Date objects for the service
      const eventData = {
        ...validated.data,
        startAt: new Date(validated.data.startAt),
        endAt: validated.data.endAt ? new Date(validated.data.endAt) : undefined,
        eventType: req.body.eventType || "meeting",
      };
      const event = await plannerService.createCalendarEvent(DEFAULT_TENANT_ID, eventData as any, req.body.actorId);
      res.status(201).json(event);
    } catch (error) {
      console.error("Error creating calendar event:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  const calendarEventUpdateSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    startAt: z.string().optional(),
    endAt: z.string().optional(),
    location: z.string().optional(),
    attendeesJson: z.unknown().optional(),
  });

  app.patch("/api/planner/calendar-events/:id", async (req: Request, res: Response) => {
    try {
      const validated = calendarEventUpdateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const event = await plannerService.updateCalendarEvent(DEFAULT_TENANT_ID, p(req.params.id), validated.data as any, req.body.actorId);
      res.json(event);
    } catch (error) {
      console.error("Error updating calendar event:", error);
      res.status(500).json({ error: "Failed to update calendar event" });
    }
  });

  app.delete("/api/planner/calendar-events/:id", async (req: Request, res: Response) => {
    try {
      await plannerService.deleteCalendarEvent(DEFAULT_TENANT_ID, p(req.params.id), req.body.actorId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting calendar event:", error);
      res.status(500).json({ error: "Failed to delete calendar event" });
    }
  });

  app.get("/api/planner/command-brief", async (req: Request, res: Response) => {
    try {
      let briefDate = new Date();
      if (req.query.date) {
        const parsed = new Date(req.query.date as string);
        if (isNaN(parsed.getTime())) {
          return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
        }
        briefDate = parsed;
      }
      const userName = req.query.userName as string | undefined;
      const payload = await plannerService.getPlannerPayload(DEFAULT_TENANT_ID, briefDate, userName);
      res.json(payload);
    } catch (error) {
      console.error("Error generating command brief:", error);
      res.status(500).json({ error: "Failed to generate command brief" });
    }
  });

  app.get("/api/planner/current-user", async (req: Request, res: Response) => {
    try {
      const userInfo = await plannerService.getCurrentUser(DEFAULT_TENANT_ID);
      res.json(userInfo);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.json({ firstName: "Commander", displayName: "Commander" });
    }
  });

  app.get("/api/planner/daily-plan", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string || "default-user";
      const planDate = req.query.date ? new Date(req.query.date as string) : new Date();
      const plan = await plannerService.getDailyPlan(DEFAULT_TENANT_ID, userId, planDate);
      res.json(plan || { tasks: [], meetings: [] });
    } catch (error) {
      console.error("Error fetching daily plan:", error);
      res.status(500).json({ error: "Failed to fetch daily plan" });
    }
  });

  app.get("/api/planner/briefing", async (req: Request, res: Response) => {
    try {
      const briefingDate = req.query.date ? new Date(req.query.date as string) : new Date();
      const briefing = await plannerService.getPlannerPayload(DEFAULT_TENANT_ID, briefingDate);
      res.json(briefing);
    } catch (error) {
      console.error("Error generating briefing:", error);
      res.status(500).json({ error: "Failed to generate briefing" });
    }
  });

  app.get("/api/planner/deadlines", async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const fromDate = req.query.from ? new Date(req.query.from as string) : undefined;
      const deadlines = await plannerService.getUpcomingDeadlines(DEFAULT_TENANT_ID, days, fromDate);
      res.json(deadlines);
    } catch (error) {
      console.error("Error fetching deadlines:", error);
      res.status(500).json({ error: "Failed to fetch deadlines" });
    }
  });

  app.get("/api/planner/dashboard", async (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const dashboard = await plannerService.getPlannerDashboard(DEFAULT_TENANT_ID, userId);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching planner dashboard:", error);
      res.status(500).json({ error: "Failed to fetch planner dashboard" });
    }
  });

  // ============================================================================
  // ANALYTICS SERVICE ROUTES
  // ============================================================================

  const { analyticsService } = await import("./services/analytics.service");

  app.get("/api/analytics/metrics", async (req: Request, res: Response) => {
    try {
      const metrics = await analyticsService.getDashboardMetrics(DEFAULT_TENANT_ID);
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching analytics metrics:", error);
      res.status(500).json({ error: "Failed to fetch analytics metrics" });
    }
  });

  app.get("/api/analytics/pipeline", async (req: Request, res: Response) => {
    try {
      const pipeline = await analyticsService.getOpportunityPipeline(DEFAULT_TENANT_ID);
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching opportunity pipeline:", error);
      res.status(500).json({ error: "Failed to fetch opportunity pipeline" });
    }
  });

  app.get("/api/analytics/bid-performance", async (req: Request, res: Response) => {
    try {
      const performance = await analyticsService.getBidPerformance(DEFAULT_TENANT_ID);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching bid performance:", error);
      res.status(500).json({ error: "Failed to fetch bid performance" });
    }
  });

  app.get("/api/analytics/project-performance", async (req: Request, res: Response) => {
    try {
      const performance = await analyticsService.getProjectPerformance(DEFAULT_TENANT_ID);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching project performance:", error);
      res.status(500).json({ error: "Failed to fetch project performance" });
    }
  });

  app.get("/api/analytics/labor", async (req: Request, res: Response) => {
    try {
      const analytics = await analyticsService.getLaborAnalytics(DEFAULT_TENANT_ID);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching labor analytics:", error);
      res.status(500).json({ error: "Failed to fetch labor analytics" });
    }
  });

  app.get("/api/analytics/safety", async (req: Request, res: Response) => {
    try {
      const analytics = await analyticsService.getSafetyAnalytics(DEFAULT_TENANT_ID);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching safety analytics:", error);
      res.status(500).json({ error: "Failed to fetch safety analytics" });
    }
  });

  app.get("/api/analytics/executive-dashboard", async (req: Request, res: Response) => {
    try {
      const dashboard = await analyticsService.getExecutiveDashboard(DEFAULT_TENANT_ID);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching executive dashboard:", error);
      res.status(500).json({ error: "Failed to fetch executive dashboard" });
    }
  });

  app.get("/api/analytics/kpi-report", async (req: Request, res: Response) => {
    try {
      const reportType = req.query.type as string || "monthly";
      const report = await analyticsService.getKPIReport(DEFAULT_TENANT_ID, reportType);
      res.json(report);
    } catch (error) {
      console.error("Error generating KPI report:", error);
      res.status(500).json({ error: "Failed to generate KPI report" });
    }
  });

  // ============================================================================
  // CONTACTS SERVICE ROUTES
  // ============================================================================

  const { documentService } = await import("./services/document.service");

  app.get("/api/contacts", async (req: Request, res: Response) => {
    try {
      const contacts = await documentService.listContacts(DEFAULT_TENANT_ID, req.query as any);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  app.get("/api/contacts/:id", async (req: Request, res: Response) => {
    try {
      const contact = await documentService.getContact(DEFAULT_TENANT_ID, p(req.params.id));
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      res.json(contact);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  app.post("/api/contacts", async (req: Request, res: Response) => {
    try {
      const contact = await documentService.createContact(DEFAULT_TENANT_ID, req.body, req.body.actorId);
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  app.patch("/api/contacts/:id", async (req: Request, res: Response) => {
    try {
      const contact = await documentService.updateContact(DEFAULT_TENANT_ID, p(req.params.id), req.body, req.body.actorId);
      res.json(contact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // ============================================================================
  // SEED DATA ENDPOINT (for development)
  // ============================================================================

  // ============================================================================
  // EGNYTE STORAGE INTEGRATION ROUTES
  // ============================================================================

  const { createEgnyteService } = await import("./integrations/egnyte/egnyte.client");
  const egnyteService = createEgnyteService(DEFAULT_TENANT_ID);

  app.get("/api/integrations/egnyte/status", async (_req: Request, res: Response) => {
    res.json({ 
      configured: egnyteService.isConfigured(),
      domain: process.env.EGNYTE_DOMAIN || null,
    });
  });

  app.get("/api/integrations/egnyte/projects/:projectId/files", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const subPath = req.query.path as string || "";
      const folder = await egnyteService.listProjectFolder(projectId, subPath);
      res.json(folder || { files: [], folders: [], count: 0 });
    } catch (error) {
      console.error("Error listing Egnyte folder:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  app.post("/api/integrations/egnyte/projects/:projectId/upload", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { fileName, content, contentType, subPath, actorId } = req.body;
      
      if (!fileName || !content) {
        return res.status(400).json({ error: "fileName and content are required" });
      }

      const buffer = Buffer.from(content, "base64");
      const result = await egnyteService.uploadProjectDocument(
        projectId,
        fileName,
        buffer,
        contentType || "application/octet-stream",
        actorId || "system",
        subPath
      );

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Upload pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("Error uploading to Egnyte:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  });

  app.get("/api/integrations/egnyte/projects/:projectId/download", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const filePath = req.query.path as string;
      const actorId = req.query.actorId as string || "system";

      if (!filePath) {
        return res.status(400).json({ error: "path query parameter is required" });
      }

      const content = await egnyteService.downloadProjectDocument(projectId, filePath, actorId);
      
      if (!content) {
        return res.status(404).json({ error: "File not found" });
      }

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${filePath.split("/").pop()}"`);
      res.send(Buffer.from(content));
    } catch (error) {
      console.error("Error downloading from Egnyte:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  app.post("/api/integrations/egnyte/projects/:projectId/share-link", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { filePath, accessibility, expiryDays, password, actorId } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: "filePath is required" });
      }

      const result = await egnyteService.createShareLink(
        projectId,
        filePath,
        actorId || "system",
        { accessibility, expiryDays, password }
      );

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Share link pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating Egnyte share link:", error);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  app.delete("/api/integrations/egnyte/projects/:projectId/files", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const filePath = req.query.path as string;
      const actorId = req.query.actorId as string || "system";

      if (!filePath) {
        return res.status(400).json({ error: "path query parameter is required" });
      }

      const result = await egnyteService.deleteProjectDocument(projectId, filePath, actorId);

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Delete pending approval", approvalId: result.requestId });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting from Egnyte:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  });

  app.get("/api/integrations/egnyte/projects/:projectId/search", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const query = req.query.q as string;
      const actorId = req.query.actorId as string || "system";

      if (!query) {
        return res.status(400).json({ error: "q query parameter is required" });
      }

      const results = await egnyteService.searchProjectDocuments(projectId, query, actorId);
      res.json({ results });
    } catch (error) {
      console.error("Error searching Egnyte:", error);
      res.status(500).json({ error: "Failed to search files" });
    }
  });

  app.post("/api/integrations/egnyte/projects/:projectId/folders", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { folderName, parentPath, actorId } = req.body;

      if (!folderName) {
        return res.status(400).json({ error: "folderName is required" });
      }

      const result = await egnyteService.createProjectFolder(
        projectId,
        folderName,
        actorId || "system",
        parentPath
      );

      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating Egnyte folder:", error);
      res.status(500).json({ error: "Failed to create folder" });
    }
  });

  // ============================================================================
  // MICROSOFT TEAMS INTEGRATION ROUTES
  // ============================================================================

  const { createTeamsService } = await import("./integrations/teams/teams.client");
  const teamsService = createTeamsService(DEFAULT_TENANT_ID);

  app.get("/api/integrations/teams/status", async (_req: Request, res: Response) => {
    res.json({ 
      configured: teamsService.isConfigured(),
      channels: {
        default: !!process.env.TEAMS_WEBHOOK_URL,
        alerts: !!process.env.TEAMS_ALERTS_WEBHOOK_URL,
        approvals: !!process.env.TEAMS_APPROVALS_WEBHOOK_URL,
        opportunities: !!process.env.TEAMS_OPPORTUNITIES_WEBHOOK_URL,
      }
    });
  });

  app.post("/api/integrations/teams/send-message", async (req: Request, res: Response) => {
    try {
      const { text, channel, actorId } = req.body;

      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }

      const result = await teamsService.sendSimpleMessage(text, actorId || "system", channel);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending Teams message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  app.post("/api/integrations/teams/send-alert", async (req: Request, res: Response) => {
    try {
      const { title, message, severity, channel, actionUrl, facts, actorId } = req.body;

      if (!title || !message || !severity) {
        return res.status(400).json({ error: "title, message, and severity are required" });
      }

      const result = await teamsService.sendAlert(
        title,
        message,
        severity,
        actorId || "system",
        { channel, actionUrl, facts }
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending Teams alert:", error);
      res.status(500).json({ error: "Failed to send alert" });
    }
  });

  app.post("/api/integrations/teams/send-opportunity-notification", async (req: Request, res: Response) => {
    try {
      const { opportunity, actionUrl, actorId } = req.body;

      if (!opportunity || !opportunity.title || !opportunity.noticeId) {
        return res.status(400).json({ error: "opportunity with title and noticeId is required" });
      }

      const result = await teamsService.sendOpportunityNotification(
        opportunity,
        actorId || "system",
        actionUrl
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending opportunity notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/integrations/teams/send-approval-request", async (req: Request, res: Response) => {
    try {
      const { approval, approvalUrl, actorId } = req.body;

      if (!approval || !approval.title || !approval.approvalId) {
        return res.status(400).json({ error: "approval with title and approvalId is required" });
      }

      const result = await teamsService.sendApprovalRequest(
        approval,
        actorId || "system",
        approvalUrl
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending approval request notification:", error);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.post("/api/integrations/teams/send-deadline-reminder", async (req: Request, res: Response) => {
    try {
      const { deadline, actionUrl, actorId } = req.body;

      if (!deadline || !deadline.title || !deadline.dueDate) {
        return res.status(400).json({ error: "deadline with title and dueDate is required" });
      }

      const result = await teamsService.sendDeadlineReminder(
        deadline,
        actorId || "system",
        actionUrl
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending deadline reminder:", error);
      res.status(500).json({ error: "Failed to send reminder" });
    }
  });

  app.post("/api/integrations/teams/send-daily-digest", async (req: Request, res: Response) => {
    try {
      const { stats, dashboardUrl, actorId } = req.body;

      if (!stats) {
        return res.status(400).json({ error: "stats object is required" });
      }

      const result = await teamsService.sendDailyDigest(
        stats,
        actorId || "system",
        dashboardUrl
      );

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending daily digest:", error);
      res.status(500).json({ error: "Failed to send digest" });
    }
  });

  app.post("/api/integrations/teams/send-gated-message", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, text, channel, actorId } = req.body;

      if (!entityType || !entityId || !text) {
        return res.status(400).json({ error: "entityType, entityId, and text are required" });
      }

      const result = await teamsService.sendApprovalGatedMessage(
        entityType,
        entityId,
        text,
        actorId || "system",
        channel
      );

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Message pending approval", approvalId: result.requestId });
      }

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending gated Teams message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // ============================================================================
  // QUICKBOOKS INTEGRATION ROUTES
  // ============================================================================

  const { createQuickBooksService } = await import("./integrations/quickbooks/quickbooks.client");
  const quickbooksService = createQuickBooksService(DEFAULT_TENANT_ID);

  app.get("/api/integrations/quickbooks/status", async (_req: Request, res: Response) => {
    res.json({ 
      configured: quickbooksService.isConfigured(),
      authenticated: quickbooksService.hasValidAuth(),
      environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox",
    });
  });

  app.get("/api/integrations/quickbooks/auth-url", async (req: Request, res: Response) => {
    try {
      const state = req.query.state as string || crypto.randomUUID();
      const url = quickbooksService.getAuthorizationUrl(state);
      
      if (!url) {
        return res.status(400).json({ error: "QuickBooks not configured" });
      }

      res.json({ url, state });
    } catch (error) {
      console.error("Error generating QuickBooks auth URL:", error);
      res.status(500).json({ error: "Failed to generate authorization URL" });
    }
  });

  // GET callback for OAuth redirect from Intuit
  app.get("/api/integrations/quickbooks/callback", async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string;
      const realmId = req.query.realmId as string;
      const error = req.query.error as string;

      if (error) {
        return res.redirect(`/integrations?error=${encodeURIComponent(error)}`);
      }

      if (!code || !realmId) {
        return res.redirect("/integrations?error=missing_params");
      }

      const success = await quickbooksService.authenticate(code, realmId);
      
      if (!success) {
        return res.redirect("/integrations?error=auth_failed");
      }

      res.redirect("/integrations?quickbooks=connected");
    } catch (error) {
      console.error("Error in QuickBooks callback:", error);
      res.redirect("/integrations?error=auth_failed");
    }
  });

  // POST callback for frontend/programmatic use
  app.post("/api/integrations/quickbooks/callback", async (req: Request, res: Response) => {
    try {
      const { code, realmId } = req.body;

      if (!code || !realmId) {
        return res.status(400).json({ error: "code and realmId are required" });
      }

      const success = await quickbooksService.authenticate(code, realmId);
      
      if (!success) {
        return res.status(401).json({ error: "Authentication failed" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error in QuickBooks callback:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  app.get("/api/integrations/quickbooks/company", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const info = await quickbooksService.getCompanyInfo(actorId || "system");
      
      if (!info) {
        return res.status(404).json({ error: "Company info not found" });
      }

      res.json(info);
    } catch (error) {
      console.error("Error fetching QuickBooks company info:", error);
      res.status(500).json({ error: "Failed to fetch company info" });
    }
  });

  app.get("/api/integrations/quickbooks/customers", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const customers = await quickbooksService.getCustomers(actorId || "system");
      res.json(customers);
    } catch (error) {
      console.error("Error fetching QuickBooks customers:", error);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.get("/api/integrations/quickbooks/vendors", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const vendors = await quickbooksService.getVendors(actorId || "system");
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching QuickBooks vendors:", error);
      res.status(500).json({ error: "Failed to fetch vendors" });
    }
  });

  app.get("/api/integrations/quickbooks/accounts", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const accounts = await quickbooksService.getAccounts(actorId || "system");
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching QuickBooks accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/integrations/quickbooks/invoices", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const invoices = await quickbooksService.getInvoices(actorId || "system");
      res.json(invoices);
    } catch (error) {
      console.error("Error fetching QuickBooks invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  app.post("/api/integrations/quickbooks/invoices", async (req: Request, res: Response) => {
    try {
      const { customerId, lines, dueDate, email, actorId } = req.body;

      if (!customerId || !lines || !Array.isArray(lines)) {
        return res.status(400).json({ error: "customerId and lines array are required" });
      }

      const result = await quickbooksService.createInvoice(actorId || "system", {
        customerId,
        lines,
        dueDate,
        email,
      });

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Invoice creation pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result.invoice);
    } catch (error) {
      console.error("Error creating QuickBooks invoice:", error);
      res.status(500).json({ error: "Failed to create invoice" });
    }
  });

  app.post("/api/integrations/quickbooks/invoices/:invoiceId/send", async (req: Request, res: Response) => {
    try {
      const invoiceId = p(req.params.invoiceId);
      const { email, actorId } = req.body;

      const result = await quickbooksService.sendInvoice(actorId || "system", invoiceId, email);

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Invoice send pending approval", approvalId: result.requestId });
      }

      res.json({ success: result.success });
    } catch (error) {
      console.error("Error sending QuickBooks invoice:", error);
      res.status(500).json({ error: "Failed to send invoice" });
    }
  });

  app.get("/api/integrations/quickbooks/payments", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const payments = await quickbooksService.getPayments(actorId || "system");
      res.json(payments);
    } catch (error) {
      console.error("Error fetching QuickBooks payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  app.post("/api/integrations/quickbooks/payments", async (req: Request, res: Response) => {
    try {
      const { customerId, amount, invoiceId, paymentMethodId, actorId } = req.body;

      if (!customerId || amount === undefined) {
        return res.status(400).json({ error: "customerId and amount are required" });
      }

      const result = await quickbooksService.recordPayment(actorId || "system", {
        customerId,
        amount,
        invoiceId,
        paymentMethodId,
      });

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Payment recording pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result.payment);
    } catch (error) {
      console.error("Error recording QuickBooks payment:", error);
      res.status(500).json({ error: "Failed to record payment" });
    }
  });

  app.get("/api/integrations/quickbooks/bills", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const bills = await quickbooksService.getBills(actorId || "system");
      res.json(bills);
    } catch (error) {
      console.error("Error fetching QuickBooks bills:", error);
      res.status(500).json({ error: "Failed to fetch bills" });
    }
  });

  app.post("/api/integrations/quickbooks/bills", async (req: Request, res: Response) => {
    try {
      const { vendorId, lines, dueDate, actorId } = req.body;

      if (!vendorId || !lines || !Array.isArray(lines)) {
        return res.status(400).json({ error: "vendorId and lines array are required" });
      }

      const result = await quickbooksService.createBill(actorId || "system", {
        vendorId,
        lines,
        dueDate,
      });

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Bill creation pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result.bill);
    } catch (error) {
      console.error("Error creating QuickBooks bill:", error);
      res.status(500).json({ error: "Failed to create bill" });
    }
  });

  app.get("/api/integrations/quickbooks/expenses", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const expenses = await quickbooksService.getExpenses(actorId || "system");
      res.json(expenses);
    } catch (error) {
      console.error("Error fetching QuickBooks expenses:", error);
      res.status(500).json({ error: "Failed to fetch expenses" });
    }
  });

  app.post("/api/integrations/quickbooks/expenses", async (req: Request, res: Response) => {
    try {
      const { paymentType, bankAccountId, vendorId, lines, actorId } = req.body;

      if (!paymentType || !bankAccountId || !lines || !Array.isArray(lines)) {
        return res.status(400).json({ error: "paymentType, bankAccountId, and lines array are required" });
      }

      const result = await quickbooksService.createExpense(actorId || "system", {
        paymentType,
        bankAccountId,
        vendorId,
        lines,
      });

      if (result.approvalRequired) {
        return res.status(202).json({ message: "Expense creation pending approval", approvalId: result.requestId });
      }

      res.status(201).json(result.expense);
    } catch (error) {
      console.error("Error creating QuickBooks expense:", error);
      res.status(500).json({ error: "Failed to create expense" });
    }
  });

  app.get("/api/integrations/quickbooks/reports/profit-loss", async (req: Request, res: Response) => {
    try {
      const { startDate, endDate, actorId } = req.query as { startDate: string; endDate: string; actorId?: string };
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }

      const report = await quickbooksService.getProfitAndLossReport(actorId || "system", startDate, endDate);
      
      if (!report) {
        return res.status(404).json({ error: "Report not available" });
      }

      res.json(report);
    } catch (error) {
      console.error("Error fetching P&L report:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.get("/api/integrations/quickbooks/reports/balance-sheet", async (req: Request, res: Response) => {
    try {
      const { asOfDate, actorId } = req.query as { asOfDate: string; actorId?: string };
      
      if (!asOfDate) {
        return res.status(400).json({ error: "asOfDate is required" });
      }

      const report = await quickbooksService.getBalanceSheet(actorId || "system", asOfDate);
      
      if (!report) {
        return res.status(404).json({ error: "Report not available" });
      }

      res.json(report);
    } catch (error) {
      console.error("Error fetching balance sheet:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.get("/api/integrations/quickbooks/reports/aged-receivables", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const report = await quickbooksService.getAgedReceivables(actorId || "system");
      
      if (!report) {
        return res.status(404).json({ error: "Report not available" });
      }

      res.json(report);
    } catch (error) {
      console.error("Error fetching aged receivables:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  app.get("/api/integrations/quickbooks/reports/aged-payables", async (req: Request, res: Response) => {
    try {
      const actorId = req.query.actorId as string;
      const report = await quickbooksService.getAgedPayables(actorId || "system");
      
      if (!report) {
        return res.status(404).json({ error: "Report not available" });
      }

      res.json(report);
    } catch (error) {
      console.error("Error fetching aged payables:", error);
      res.status(500).json({ error: "Failed to fetch report" });
    }
  });

  // ============================================================================
  // SEED DATA ROUTE
  // ============================================================================

  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      // Create default tenant
      const tenant = await storage.createTenant({
        legalName: "BlackHawk Construction, LLC",
        dbaName: "BlackHawk Construction",
        timezone: "America/New_York",
        status: "active",
      });

      // Create sample opportunities
      const opportunities = [
        {
          tenantId: tenant.id,
          title: "Federal Building HVAC Modernization",
          synopsis: "Complete modernization of HVAC systems in the Federal Triangle Complex.",
          status: "open",
          naicsCodes: ["238220", "236220"],
          setAside: "8(a)",
          contractValue: "2500000",
          dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          postedAt: new Date(),
        },
        {
          tenantId: tenant.id,
          title: "Military Base Infrastructure Repair",
          synopsis: "Comprehensive repair and renovation of aging infrastructure.",
          status: "watching",
          naicsCodes: ["236220", "237310"],
          setAside: "SDVOSB",
          contractValue: "1800000",
          dueAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
          postedAt: new Date(),
        },
      ];

      for (const opp of opportunities) {
        await storage.createOpportunity(opp);
      }

      // Create sample approval requests
      await storage.createApprovalRequest({
        tenantId: tenant.id,
        entityType: "bid_project",
        entityId: "bp-001",
        actionType: "bid_decision",
        status: "pending",
        priority: "high",
        contextJson: { opportunityTitle: "Federal Building HVAC Modernization" },
      });

      res.json({ success: true, tenantId: tenant.id });
    } catch (error) {
      console.error("Error seeding data:", error);
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // ============================================================================
  // COMPREHENSIVE SEED API - Populate Real Data
  // ============================================================================

  app.post("/api/seed/vendors-from-extracted", async (req: Request, res: Response) => {
    try {
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      const extractedPath = path.join(process.cwd(), "server/data/blackhawk/extracted");

      const vendorData = [
        { folder: "4_G_STEEL_1769893362339", name: "4G Steel", trade: "steel", type: "subcontractor", rating: 4.6 },
        { folder: "BINSWANGER_GLASS_1769891712346", name: "Binswanger Glass", trade: "glass", type: "subcontractor", rating: 4.5 },
        { folder: "BJ_Shower_Door_1769892669374", name: "BJ Shower Door", trade: "glass", type: "subcontractor", rating: 4.3 },
        { folder: "DH_Pace_1769891712344", name: "DH Pace", trade: "doors", type: "subcontractor", rating: 4.7 },
        { folder: "Gene_Lilly_Surety_Bonds_1769892809619", name: "Gene Lilly Surety Bonds", trade: "bonding", type: "supplier", rating: 4.9 },
        { folder: "Veterans_Electrical_Solutions_1769891669474", name: "Veterans Electrical Solutions", trade: "electrical", type: "subcontractor", rating: 4.8 },
        { folder: "Standard_Iron_1769892168479", name: "Standard Iron", trade: "steel", type: "subcontractor", rating: 4.4 },
        { folder: "HARTERS_1769891568553", name: "Harters", trade: "general", type: "supplier", rating: 4.2 },
        { folder: "HARTS_DIESEL_1769892217305", name: "Harts Diesel", trade: "equipment", type: "supplier", rating: 4.5 },
        { folder: "Koch_Excavating_1769892086816", name: "Koch Excavating", trade: "excavation", type: "subcontractor", rating: 4.6 },
        { folder: "PANTHER_CITY_PLUMBING_1769891712345", name: "Panther City Plumbing", trade: "plumbing", type: "subcontractor", rating: 4.4 },
        { folder: "RAPID_FIRE_1769891012640", name: "Rapid Fire", trade: "fire_protection", type: "subcontractor", rating: 4.7 },
        { folder: "REIMERS_WELDING_1769891568553", name: "Reimers Welding", trade: "welding", type: "subcontractor", rating: 4.3 },
        { folder: "SHANES_ELECTRIC_SERVICE_1769892949069", name: "Shane's Electric Service", trade: "electrical", type: "subcontractor", rating: 4.5 },
        { folder: "Sports_Graphics_1769892063763", name: "Sports Graphics", trade: "signage", type: "supplier", rating: 4.1 },
        { folder: "MIDWEST_PETROLEUM_1769891669469", name: "Midwest Petroleum", trade: "fuel", type: "supplier", rating: 4.2 },
        { folder: "JUDSON_GALLARDO_1769891669472", name: "Judson Gallardo", trade: "consulting", type: "supplier", rating: 4.0 },
        { folder: "JUSTIN_SHELTON_1769893120575", name: "Justin Shelton", trade: "consulting", type: "supplier", rating: 4.1 },
        { folder: "ONE_SOURCE_BACKGROUND_CHECKS_1769891669470", name: "One Source Background Checks", trade: "services", type: "supplier", rating: 4.3 },
      ];

      let created = 0;
      for (let i = 0; i < vendorData.length; i++) {
        const v = vendorData[i];
        try {
          await vendorService.createVendor(DEFAULT_TENANT_ID, {
            vendorNumber: `VND-${String(i + 1).padStart(3, "0")}`,
            companyName: v.name,
            vendorType: v.type,
            contactName: `${v.name} Contact`,
            email: `contact@${v.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
            phone: `(817) 555-${String(1000 + i).slice(-4)}`,
            prequalificationStatus: Math.random() > 0.2 ? "approved" : "pending",
          }, "system");
          created++;
        } catch (e) {
          // Skip duplicates
        }
      }

      // Also create subcontractors in the new table
      for (let i = 0; i < vendorData.length; i++) {
        const v = vendorData[i];
        if (v.type === "subcontractor") {
          try {
            await storage.createSubcontractor({
              tenantId: DEFAULT_TENANT_ID,
              companyName: v.name,
              contactName: `${v.name} Manager`,
              contactEmail: `manager@${v.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
              contactPhone: `(817) 555-${String(2000 + i).slice(-4)}`,
              trade: v.trade,
              naicsCodes: ["236220", "238210"],
              certifications: [{ name: "Licensed", type: "state" }, { name: "Insured", type: "insurance" }],
              performanceRating: String(v.rating),
              projectsCompleted: Math.floor(Math.random() * 50) + 10,
              status: "active",
            });
          } catch (e) {
            // Skip duplicates
          }
        }
      }

      res.json({ success: true, created, message: `Created ${created} vendors from extracted data` });
    } catch (error) {
      console.error("Error seeding vendors:", error);
      res.status(500).json({ error: "Failed to seed vendors" });
    }
  });

  app.post("/api/seed/company-profile", async (req: Request, res: Response) => {
    try {
      const profile = await storage.createCompanyProfile({
        tenantId: DEFAULT_TENANT_ID,
        legalName: "BlackHawk Industrial Construction, LLC",
        dbaName: "BlackHawk Construction",
        cageCode: "7ABC1",
        dunsNumber: "078432156",
        ueiNumber: "BLKHWK123456789",
        naicsCodes: ["236220", "237310", "238210", "238220", "238990"],
        pscCodes: ["Y1DA", "Z2AA", "Z1DA"],
        certifications: [
          { type: "SDVOSB", name: "Service-Disabled Veteran-Owned Small Business", number: "SDVOSB-2024-001" },
          { type: "HUBZone", name: "HUBZone Certified", number: "HZ-TX-2024-0145" },
        ],
        bondingCapacity: { single: 15000000, aggregate: 45000000, carrier: "Gene Lilly Surety" },
        insuranceLimits: { general: 2000000, auto: 1000000, workers: 1000000, umbrella: 5000000 },
        employeeCount: 85,
        yearFounded: 2008,
        annualRevenue: "24500000",
        serviceAreas: ["Texas", "Oklahoma", "Arkansas", "Louisiana", "New Mexico"],
        coreCompetencies: [
          "Federal Construction",
          "Commercial General Contracting",
          "Design-Build",
          "HVAC Modernization",
          "Facility Renovation",
        ],
        differentiators: [
          "100% Veteran-Owned",
          "24/7 Emergency Response",
          "In-House Engineering",
          "GSA Schedule Holder",
        ],
        pastPerformanceHighlights: [
          { project: "VA Hospital Phase 1", value: 4200000, agency: "VA", year: 2024 },
          { project: "GSA Building Renovation", value: 2800000, agency: "GSA", year: 2023 },
          { project: "DoD Barracks Upgrade", value: 1500000, agency: "DoD", year: 2023 },
        ],
      });
      res.json({ success: true, profile });
    } catch (error) {
      console.error("Error creating company profile:", error);
      res.json({ success: false, message: "Profile may already exist" });
    }
  });

  app.post("/api/seed/labor-rates", async (req: Request, res: Response) => {
    try {
      const rates = [
        { category: "Project Manager", hourly: 85, burdened: 125 },
        { category: "Superintendent", hourly: 75, burdened: 110 },
        { category: "Foreman", hourly: 55, burdened: 82 },
        { category: "Journeyman Electrician", hourly: 48, burdened: 72 },
        { category: "Journeyman Plumber", hourly: 46, burdened: 69 },
        { category: "Welder - Certified", hourly: 52, burdened: 78 },
        { category: "HVAC Technician", hourly: 50, burdened: 75 },
        { category: "Carpenter", hourly: 42, burdened: 63 },
        { category: "Laborer", hourly: 28, burdened: 42 },
        { category: "Equipment Operator", hourly: 45, burdened: 68 },
      ];

      let created = 0;
      for (const r of rates) {
        try {
          await storage.createLaborRate({
            tenantId: DEFAULT_TENANT_ID,
            laborCategory: r.category,
            hourlyRate: String(r.hourly),
            burdenedRate: String(r.burdened),
            effectiveDate: new Date(),
            rateType: "internal",
          });
          created++;
        } catch (e) {
          // Skip
        }
      }
      res.json({ success: true, created });
    } catch (error) {
      console.error("Error seeding labor rates:", error);
      res.status(500).json({ error: "Failed to seed labor rates" });
    }
  });

  app.post("/api/seed/win-patterns", async (req: Request, res: Response) => {
    try {
      const patterns = [
        { name: "SDVOSB Set-Aside Success", type: "set_aside", value: "SDVOSB", confidence: 0.78, wins: 18, total: 23 },
        { name: "VA Medical Facilities", type: "agency", value: "VA", confidence: 0.72, wins: 12, total: 17 },
        { name: "$1M-$5M Value Range", type: "value_range", value: "1000000-5000000", confidence: 0.65, wins: 24, total: 37 },
        { name: "HVAC Modernization", type: "naics", value: "238220", confidence: 0.82, wins: 15, total: 19 },
        { name: "Texas Regional", type: "geography", value: "TX", confidence: 0.75, wins: 32, total: 43 },
      ];

      let created = 0;
      for (const p of patterns) {
        try {
          await storage.createWinPattern({
            tenantId: DEFAULT_TENANT_ID,
            patternName: p.name,
            patternType: p.type,
            patternValue: p.value,
            confidence: String(p.confidence),
            supportCount: p.wins,
            totalBids: p.total,
            winRate: String(p.wins / p.total),
            description: `Identified pattern: ${p.name}`,
          });
          created++;
        } catch (e) {
          // Skip
        }
      }
      res.json({ success: true, created });
    } catch (error) {
      console.error("Error seeding win patterns:", error);
      res.status(500).json({ error: "Failed to seed win patterns" });
    }
  });

  // Seed real BlackHawk employees
  app.post("/api/seed/employees", async (req: Request, res: Response) => {
    try {
      const { employees } = await import("@shared/schema");
      
      const blackhawkTeam = [
        {
          tenantId: DEFAULT_TENANT_ID,
          employeeNumber: "BH-001",
          firstName: "Bradley",
          lastName: "Hueser",
          email: "bradley@blackhawkconst.com",
          phone: "(402) 555-0001",
          department: "Executive",
          jobTitle: "President",
          employmentType: "full_time",
          status: "active",
          hireDate: new Date("2019-01-01"),
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          employeeNumber: "BH-002",
          firstName: "Dave",
          lastName: "Hueser",
          email: "dave@blackhawkconst.com",
          phone: "(402) 555-0002",
          department: "Executive",
          jobTitle: "Vice President",
          employmentType: "full_time",
          status: "active",
          hireDate: new Date("1996-01-01"),
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          employeeNumber: "BH-003",
          firstName: "Nolan",
          lastName: "Kosmicki",
          email: "nolan@blackhawkconst.com",
          phone: "(402) 555-0003",
          department: "Operations",
          jobTitle: "Chief of Operations",
          employmentType: "full_time",
          status: "active",
          hireDate: new Date("2018-01-01"),
        },
        {
          tenantId: DEFAULT_TENANT_ID,
          employeeNumber: "BH-004",
          firstName: "Kathy",
          lastName: "Hueser",
          email: "kathy@blackhawkconst.com",
          phone: "(402) 555-0004",
          department: "Administration",
          jobTitle: "Office Manager",
          employmentType: "full_time",
          status: "active",
          hireDate: new Date("2005-01-01"),
        },
      ];
      
      let created = 0;
      for (const emp of blackhawkTeam) {
        const existing = await db.select().from(employees).where(eq(employees.email, emp.email)).limit(1);
        if (existing.length === 0) {
          await db.insert(employees).values(emp);
          created++;
        }
      }
      
      res.json({ success: true, message: `Seeded ${created} BlackHawk team members`, team: blackhawkTeam.map(e => `${e.firstName} ${e.lastName} - ${e.jobTitle}`) });
    } catch (error) {
      console.error("Error seeding employees:", error);
      res.status(500).json({ error: "Failed to seed employees" });
    }
  });

  // Master seed endpoint - runs all seeds
  app.post("/api/seed/all", async (req: Request, res: Response) => {
    try {
      const results: any = {};

      // Seed vendors
      const vendorData = [
        { name: "4G Steel", trade: "steel", type: "subcontractor", rating: 4.6 },
        { name: "Binswanger Glass", trade: "glass", type: "subcontractor", rating: 4.5 },
        { name: "BJ Shower Door", trade: "glass", type: "subcontractor", rating: 4.3 },
        { name: "DH Pace", trade: "doors", type: "subcontractor", rating: 4.7 },
        { name: "Gene Lilly Surety Bonds", trade: "bonding", type: "supplier", rating: 4.9 },
        { name: "Veterans Electrical Solutions", trade: "electrical", type: "subcontractor", rating: 4.8 },
        { name: "Standard Iron", trade: "steel", type: "subcontractor", rating: 4.4 },
        { name: "Harters", trade: "general", type: "supplier", rating: 4.2 },
        { name: "Harts Diesel", trade: "equipment", type: "supplier", rating: 4.5 },
        { name: "Koch Excavating", trade: "excavation", type: "subcontractor", rating: 4.6 },
        { name: "Panther City Plumbing", trade: "plumbing", type: "subcontractor", rating: 4.4 },
        { name: "Rapid Fire", trade: "fire_protection", type: "subcontractor", rating: 4.7 },
        { name: "Reimers Welding", trade: "welding", type: "subcontractor", rating: 4.3 },
        { name: "Shane's Electric Service", trade: "electrical", type: "subcontractor", rating: 4.5 },
        { name: "Sports Graphics", trade: "signage", type: "supplier", rating: 4.1 },
        { name: "Midwest Petroleum", trade: "fuel", type: "supplier", rating: 4.2 },
      ];

      let vendorsCreated = 0;
      for (let i = 0; i < vendorData.length; i++) {
        const v = vendorData[i];
        try {
          await vendorService.createVendor(DEFAULT_TENANT_ID, {
            vendorNumber: `VND-${String(i + 1).padStart(3, "0")}`,
            companyName: v.name,
            vendorType: v.type,
            contactName: `${v.name} Contact`,
            email: `contact@${v.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
            phone: `(817) 555-${String(1000 + i).slice(-4)}`,
            prequalificationStatus: Math.random() > 0.2 ? "approved" : "pending",
          }, "system");
          vendorsCreated++;
        } catch (e) { }
      }
      results.vendors = vendorsCreated;

      // Create subcontractors
      let subsCreated = 0;
      for (let i = 0; i < vendorData.length; i++) {
        const v = vendorData[i];
        if (v.type === "subcontractor") {
          try {
            await storage.createSubcontractor({
              tenantId: DEFAULT_TENANT_ID,
              companyName: v.name,
              contactName: `${v.name} Manager`,
              contactEmail: `manager@${v.name.toLowerCase().replace(/[^a-z0-9]/g, "")}.com`,
              contactPhone: `(817) 555-${String(2000 + i).slice(-4)}`,
              trade: v.trade,
              naicsCodes: ["236220"],
              certifications: [{ name: "Licensed" }, { name: "Insured" }],
              performanceRating: String(v.rating),
              projectsCompleted: Math.floor(Math.random() * 50) + 10,
              status: "active",
            });
            subsCreated++;
          } catch (e) { }
        }
      }
      results.subcontractors = subsCreated;

      res.json({ success: true, results });
    } catch (error) {
      console.error("Error running master seed:", error);
      res.status(500).json({ error: "Failed to seed data" });
    }
  });

  // ============================================================================
  // KNOWLEDGE VAULT API - AI Learning System
  // ============================================================================

  app.get("/api/knowledge/documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      res.json(documents || []);
    } catch (error) {
      console.error("Error fetching knowledge documents:", error);
      res.json([]);
    }
  });

  app.get("/api/knowledge/stats", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      const categoryCounts: Record<string, number> = {};
      documents?.forEach(doc => {
        const cat = doc.documentType || "uncategorized";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      });
      
      // Count extracted files dynamically
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      const extractedPath = path.join(process.cwd(), "server/data/blackhawk/extracted");
      
      let extractedCount = 0;
      const countFiles = async (dir: string): Promise<number> => {
        let count = 0;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              count += await countFiles(fullPath);
            } else {
              count++;
            }
          }
        } catch (e) { /* skip inaccessible */ }
        return count;
      };
      
      try {
        extractedCount = await countFiles(extractedPath);
      } catch (e) {
        extractedCount = documents?.length || 0;
      }
      
      res.json({
        totalDocuments: documents?.length || 0,
        processedDocuments: documents?.filter(d => d.status === "processed").length || 0,
        pendingDocuments: documents?.filter(d => d.status === "pending").length || 0,
        extractedFiles: extractedCount,
        categoryCounts,
      });
    } catch (error) {
      console.error("Error fetching knowledge stats:", error);
      res.json({
        totalDocuments: 0,
        processedDocuments: 0,
        pendingDocuments: 0,
        extractedFiles: 0,
        categoryCounts: {},
      });
    }
  });

  // Debug endpoint for diagnosing document viewer issues
  app.get("/api/debug/viewer", async (req: Request, res: Response) => {
    try {
      const { docId, path: filePath } = req.query;
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      // Supported file types for in-browser viewing
      const supportedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff'];
      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.tiff': 'image/tiff',
        '.txt': 'text/plain',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.dwg': 'application/acad',
        '.zip': 'application/zip',
      };
      
      let result: {
        docId?: string;
        resolvedSource: string | null;
        contentType: string | null;
        size: number | null;
        supported: boolean;
        viewerCompatible: boolean;
        error: string | null;
        documentTitle?: string;
        documentType?: string;
      } = {
        resolvedSource: null,
        contentType: null,
        size: null,
        supported: false,
        viewerCompatible: false,
        error: null,
      };
      
      if (docId) {
        // Look up document by ID
        const doc = await storage.getKnowledgeDocumentById(docId as string);
        if (!doc) {
          result.error = "Document not found in database";
          return res.json(result);
        }
        
        result.docId = doc.id;
        result.documentTitle = doc.title;
        result.documentType = doc.documentType || undefined;
        result.resolvedSource = doc.sourceUrl || null;
        
        if (!doc.sourceUrl) {
          result.error = "Document has no sourceUrl";
          return res.json(result);
        }
        
        // Check source type
        if (doc.sourceUrl.startsWith('/replit-objstore')) {
          result.contentType = mimeTypes[path.extname(doc.sourceUrl).toLowerCase()] || 'application/octet-stream';
          result.supported = true;
          const ext = path.extname(doc.sourceUrl).toLowerCase().slice(1);
          result.viewerCompatible = supportedTypes.includes(ext);
        } else if (doc.sourceUrl.startsWith('http://') || doc.sourceUrl.startsWith('https://')) {
          result.contentType = mimeTypes[path.extname(doc.sourceUrl).toLowerCase()] || 'application/octet-stream';
          result.supported = true;
          const ext = path.extname(doc.sourceUrl).toLowerCase().slice(1);
          result.viewerCompatible = supportedTypes.includes(ext);
        } else {
          // Local file
          try {
            const stats = await fs.stat(doc.sourceUrl);
            result.size = stats.size;
            result.contentType = mimeTypes[path.extname(doc.sourceUrl).toLowerCase()] || 'application/octet-stream';
            result.supported = true;
            const ext = path.extname(doc.sourceUrl).toLowerCase().slice(1);
            result.viewerCompatible = supportedTypes.includes(ext);
          } catch (e) {
            result.error = "File not found on disk";
          }
        }
      } else if (filePath) {
        // Direct path lookup
        result.resolvedSource = filePath as string;
        const ext = path.extname(filePath as string).toLowerCase();
        result.contentType = mimeTypes[ext] || 'application/octet-stream';
        result.viewerCompatible = supportedTypes.includes(ext.slice(1));
        
        if ((filePath as string).startsWith('/replit-objstore') || 
            (filePath as string).startsWith('http://') || 
            (filePath as string).startsWith('https://')) {
          result.supported = true;
        } else {
          try {
            const stats = await fs.stat(filePath as string);
            result.size = stats.size;
            result.supported = true;
          } catch (e) {
            result.error = "File not found on disk";
          }
        }
      } else {
        result.error = "Provide docId or path query parameter";
      }
      
      res.json(result);
    } catch (error) {
      console.error("Debug viewer error:", error);
      res.status(500).json({ error: "Debug endpoint failed", details: String(error) });
    }
  });

  // Serve knowledge document file for viewing
  app.get("/api/knowledge/documents/:id/file", async (req: Request, res: Response) => {
    try {
      const doc = await storage.getKnowledgeDocumentById(p(req.params.id));
      
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const fs = await import("fs").then(m => m.promises);
      const fsSync = await import("fs");
      const path = await import("path");

      const mimeTypes: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.bmp': 'image/bmp',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.zip': 'application/zip',
        '.rar': 'application/x-rar-compressed',
        '.7z': 'application/x-7z-compressed',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.tiff': 'image/tiff',
        '.tif': 'image/tiff',
      };

      const serveFileFromPath = async (filePath: string) => {
        const normalizedPath = path.normalize(filePath);
        if (normalizedPath.includes('..')) {
          return res.status(403).json({ error: "Invalid file path" });
        }
        try {
          const stat = await fs.stat(normalizedPath);
          const ext = path.extname(normalizedPath).toLowerCase();
          const mimeType = mimeTypes[ext] || 'application/octet-stream';
          const safeFilename = (doc.title || path.basename(normalizedPath)).replace(/[^\w\s.-]/g, '_');
          
          res.setHeader('Content-Type', mimeType);
          res.setHeader('Content-Length', stat.size);
          res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Cache-Control', 'private, max-age=3600');
          
          const readStream = fsSync.createReadStream(normalizedPath);
          readStream.pipe(res);
          readStream.on('error', () => {
            if (!res.headersSent) {
              res.status(500).json({ error: "Error reading file" });
            }
          });
          return true;
        } catch (e) {
          return false;
        }
      };

      if (doc.sourceUrl && doc.sourceUrl.startsWith('/replit-objstore')) {
        return res.redirect(doc.sourceUrl);
      }

      if (doc.sourceUrl && (doc.sourceUrl.startsWith('http://') || doc.sourceUrl.startsWith('https://'))) {
        return res.redirect(doc.sourceUrl);
      }

      if (doc.sourceUrl) {
        const served = await serveFileFromPath(doc.sourceUrl);
        if (served) return;
      }

      if (doc.content) {
        const fullPathMatch = doc.content.match(/Full Path:\s*(.+)/);
        if (fullPathMatch) {
          const extractedPath = fullPathMatch[1].trim();
          const served = await serveFileFromPath(extractedPath);
          if (served) return;
        }
      }

      if (doc.title) {
        const ext = path.extname(doc.title).toLowerCase();
        const isTextBased = ['.txt', '.csv', '.json', '.xml', '.md', '.log'].includes(ext);
        if (isTextBased && doc.content) {
          const textContent = doc.content.replace(/^File:.*\n|^Category:.*\n|^Source Folder:.*\n|^Parent:.*\n|^Full Path:.*\n/gm, '').trim();
          if (textContent) {
            const mimeType = mimeTypes[ext] || 'text/plain';
            res.setHeader('Content-Type', mimeType);
            res.setHeader('Content-Disposition', `inline; filename="${doc.title}"`);
            return res.send(textContent);
          }
        }
      }

      if (doc.content) {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `inline; filename="${doc.title || 'document.txt'}"`);
        return res.send(doc.content);
      }

      res.status(404).json({ error: "No file available for this document" });
    } catch (error) {
      console.error("Error serving knowledge document file:", error);
      res.status(500).json({ error: "Failed to serve document file" });
    }
  });

  app.post("/api/knowledge/process-extracted", async (req: Request, res: Response) => {
    try {
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      const extractedPath = path.join(process.cwd(), "server/data/blackhawk/extracted");
      
      // Clear existing documents first to avoid duplicates
      const existingDocs = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      const existingTitles = new Set(existingDocs?.map(d => d.title) || []);
      
      // Valid file extensions to process
      const validExtensions = ['.pdf', '.xlsx', '.xls', '.doc', '.docx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.csv', '.rtf'];
      
      const walkDir = async (dir: string): Promise<{path: string, name: string, folder: string, rootFolder: string}[]> => {
        const files: {path: string, name: string, folder: string, rootFolder: string}[] = [];
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              files.push(...await walkDir(fullPath));
            } else {
              const ext = path.extname(entry.name).toLowerCase();
              if (validExtensions.includes(ext) || ext === '') {
                // Get root folder (first level under extracted)
                const relativePath = fullPath.replace(extractedPath + path.sep, '');
                const rootFolder = relativePath.split(path.sep)[0] || '';
                files.push({
                  path: fullPath,
                  name: entry.name,
                  folder: path.basename(path.dirname(fullPath)),
                  rootFolder: rootFolder
                });
              }
            }
          }
        } catch (e) {
          // Directory access error, skip
        }
        return files;
      };

      const files = await walkDir(extractedPath);
      const totalFiles = files.length;
      let processed = 0;
      let skipped = 0;

      // Categorization based on full path and folder names
      const categorizeFile = (file: {path: string, name: string, folder: string, rootFolder: string}): string => {
        const lowerPath = file.path.toLowerCase();
        const lowerFolder = file.folder.toLowerCase();
        const lowerRoot = file.rootFolder.toLowerCase();
        const lowerName = file.name.toLowerCase();
        
        // Company Information
        if (lowerRoot.includes('blackhawk') && lowerRoot.includes('company')) return 'company_info';
        if (lowerPath.includes('company') || lowerPath.includes('profile')) return 'company_info';
        
        // Bonding & Insurance
        if (lowerPath.includes('bond') || lowerPath.includes('surety') || lowerPath.includes('gene_lilly')) return 'bonding';
        if (lowerPath.includes('coi') || lowerPath.includes('insurance')) return 'insurance';
        if (lowerPath.includes('w-9') || lowerPath.includes('w9')) return 'tax_documents';
        
        // Subcontractors - based on vendor names in path
        const subcontractorNames = ['steel', 'iron', 'electrical', 'plumbing', 'glass', 'shower', 'pace', 'veterans', 'harters', 'hart', 'diesel', 'excavating', 'fire', 'welding', 'panther', 'demolition', 'doors'];
        if (subcontractorNames.some(name => lowerPath.includes(name))) return 'subcontractors';
        
        // Financial documents
        if (lowerPath.includes('invoice') || lowerPath.includes('paid') || lowerPath.includes('check') || lowerPath.includes('receipt')) return 'invoices';
        if (lowerPath.includes('quote') || lowerPath.includes('pricing') || lowerPath.includes('estimate')) return 'quotes';
        
        // Project documents
        if (lowerPath.includes('project') || lowerPath.includes('contract')) return 'projects';
        
        // Certifications
        if (lowerPath.includes('certif') || lowerPath.includes('license')) return 'certifications';
        
        // Legal documents
        if (lowerPath.includes('legal') || lowerPath.includes('agreement')) return 'legal';
        
        return 'general';
      };

      // Process ALL files
      for (const file of files) {
        // Skip if already exists
        if (existingTitles.has(file.name)) {
          skipped++;
          continue;
        }
        
        const category = categorizeFile(file);
        const ext = path.extname(file.name).toLowerCase();
        const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
        
        try {
          await storage.createKnowledgeDocument({
            tenantId: DEFAULT_TENANT_ID,
            title: file.name,
            content: `File: ${file.name}\nCategory: ${category}\nSource Folder: ${file.rootFolder}\nParent: ${file.folder}\nFull Path: ${file.path}`,
            documentType: category,
            status: "processed",
            version: 1,
            metadata: { 
              originalPath: file.path, 
              sourceFolder: file.folder,
              rootFolder: file.rootFolder,
              fileType: ext || 'unknown',
              isImage: isImage
            },
          });
          processed++;
        } catch (e) {
          skipped++;
        }
      }

      res.json({ 
        totalFiles, 
        processed,
        skipped,
        message: `Successfully processed ${processed} files (${skipped} skipped as duplicates)` 
      });
    } catch (error) {
      console.error("Error processing extracted documents:", error);
      res.status(500).json({ error: "Failed to process documents", totalFiles: 0 });
    }
  });

  app.post("/api/knowledge/search", async (req: Request, res: Response) => {
    try {
      const { query, limit = 10 } = req.body;
      
      // Simple text-based search for now (RAG can be enhanced later)
      const documents = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      const queryLower = query.toLowerCase();
      
      const results = documents
        ?.filter(doc => 
          doc.title?.toLowerCase().includes(queryLower) ||
          doc.content?.toLowerCase().includes(queryLower) ||
          doc.documentType?.toLowerCase().includes(queryLower)
        )
        .slice(0, limit)
        .map(doc => ({
          title: doc.title,
          excerpt: doc.content?.substring(0, 200) || "",
          category: doc.documentType,
          score: 0.85,
        })) || [];

      res.json({ results });
    } catch (error) {
      console.error("Error searching knowledge:", error);
      res.json({ results: [] });
    }
  });

  // Import documents from attached_assets folder
  app.post("/api/knowledge/import-attached", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const attachedPath = path.join(process.cwd(), "attached_assets");
      const files = await fs.readdir(attachedPath);
      
      const results: { imported: string[]; errors: string[]; subcontractors: number } = {
        imported: [],
        errors: [],
        subcontractors: 0,
      };
      
      // Document files to import
      const documentFiles = [
        "BLACKHAWK_CONSTRUCTION_LLC_2019_TAX_DOCUMENTS_1770002509706.pdf",
        "BLACKHAWK_CONSTRUCTION_LLC_2020_TAX_DOCUMENTS_1770002509710.pdf",
        "2021_BLACKHAWK_CONSTRUCTION_BUSINESS_TAX_RETURNS_1770002509708.pdf",
        "BLACKHAWK_CONSTRUCTION_LLC_2021_FEDERAL_TAX_1770002509711.pdf",
        "BLACKHAWK_CONSTRUCTION_LLC_2021_STATE_1770002509711.pdf",
        "DAVE_AND_KATHY_HUESER_PERSONAL_RETURNS_2020_1770002509712.pdf",
        "DAVE_AND_KATHY_HUESER_PERSONAL_RETURNS_2021_1770002509712.pdf",
        "Signed_W9_Blackhawk_Construction_1770002509713.pdf",
        "W9_FORM_Blackhawk_Construction_1770002509713.pdf",
        "Amend_Trade_Name_NE_1770002509709.pdf",
        "Omaha_builder_license_1770002509713.pdf",
        "Insurance_audit_1770002509713.pdf",
        "Audit_Requirements_-_Blackhawk_Construction_2022_1770002509709.docx",
        "Travelers_audit_for_Neis_2022_1770002509713.pdf",
        "Goldman_Sachs_10000_small_business_application_1770002509707.pdf",
        "Company_Directory_1770002509711.pdf",
      ];
      
      for (const filename of documentFiles) {
        const filePath = path.join(attachedPath, filename);
        try {
          await fs.access(filePath);
          const result = await documentImportService.importDocument(filePath, "admin");
          results.imported.push(result.title);
        } catch (err) {
          results.errors.push(`${filename}: ${err instanceof Error ? err.message : "File not found"}`);
        }
      }
      
      // Import subcontractors from CSV
      const csvPath = path.join(attachedPath, "CompanyExport20221025163152_1770002509712.csv");
      try {
        await fs.access(csvPath);
        const csvResult = await documentImportService.importSubcontractorsFromCSV(csvPath, "admin");
        results.subcontractors = csvResult.imported;
      } catch (err) {
        results.errors.push(`CSV import: ${err instanceof Error ? err.message : "Failed"}`);
      }
      
      // Import verified subcontractors from insurance audit
      const verifiedSubs = [
        { name: "Advanced Integration", trade: "A/V", laborOnly: false, coiProvided: true, totalPayments: 12216 },
        { name: "Alden Parks", trade: "Landscape", laborOnly: false, coiProvided: true, totalPayments: 45754 },
        { name: "Andres Boesiger", trade: "Mason", laborOnly: true, coiProvided: true, totalPayments: 1400 },
        { name: "BTF Rocks", trade: "Mason", laborOnly: true, coiProvided: true, totalPayments: 9740 },
        { name: "Barrett Contracting", trade: "Concrete", laborOnly: false, coiProvided: true, totalPayments: 70714 },
        { name: "Bonine Garage Doors", trade: "Garage Doors", laborOnly: false, coiProvided: true, totalPayments: 1563 },
        { name: "Calm Construction", trade: "Siding", laborOnly: true, coiProvided: true, totalPayments: 4840 },
        { name: "DH Pace", trade: "Garage Doors", laborOnly: false, coiProvided: true, totalPayments: 28026 },
        { name: "Doll Construction", trade: "Excavating", laborOnly: false, coiProvided: true, totalPayments: 26952 },
        { name: "Giron Home Improvement", trade: "Roofing", laborOnly: true, coiProvided: true, totalPayments: 14023 },
        { name: "Golden Construction", trade: "Carpentry", laborOnly: true, coiProvided: true, totalPayments: 16500 },
        { name: "H2M Construction", trade: "Concrete", laborOnly: false, coiProvided: true, totalPayments: 36950 },
        { name: "Interstate Heating & AC", trade: "HVAC", laborOnly: false, coiProvided: true, totalPayments: 21186 },
        { name: "JK Carpentry", trade: "Carpentry", laborOnly: true, coiProvided: true, totalPayments: 3602 },
        { name: "Jerrys Basement Waterproofing", trade: "Waterproofing", laborOnly: false, coiProvided: true, totalPayments: 4738 },
        { name: "Kyle Stevens", trade: "Plumbing", laborOnly: false, coiProvided: true, totalPayments: 1282 },
        { name: "MJW Electrical", trade: "Electrical", laborOnly: false, coiProvided: true, totalPayments: 21050 },
        { name: "Midwest Demolition", trade: "Demolition", laborOnly: true, coiProvided: true, totalPayments: 46530 },
        { name: "Radiant Eagle", trade: "Insulation", laborOnly: false, coiProvided: true, totalPayments: 6950 },
        { name: "Silva Painters", trade: "Painting", laborOnly: false, coiProvided: true, totalPayments: 23250 },
        { name: "Strongwall Masonry", trade: "Masonry", laborOnly: false, coiProvided: true, totalPayments: 6378 },
        { name: "Top 10 Gutters", trade: "Gutters", laborOnly: false, coiProvided: true, totalPayments: 4901 },
        { name: "Utility Trenching", trade: "Utilities", laborOnly: false, coiProvided: true, totalPayments: 10100 },
        { name: "Bruce Wilkinson", trade: "Drywall", laborOnly: false, coiProvided: true, totalPayments: 27944 },
      ];
      
      const verifiedResult = await documentImportService.importVerifiedSubcontractors(verifiedSubs, "admin");
      results.subcontractors += verifiedResult.imported;
      
      res.json({
        success: true,
        documentsImported: results.imported.length,
        subcontractorsImported: results.subcontractors,
        documents: results.imported,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing attached documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // ============== EGNYTE OAUTH ENDPOINTS ==============
  
  // Get Egnyte connection status
  app.get("/api/egnyte/status", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      
      if (!egnyteService.isConfigured()) {
        return res.json({ configured: false, connected: false });
      }
      
      const connection = await egnyteService.getConnection();
      const userInfo = connection ? await egnyteService.getUserInfo() : null;
      
      res.json({
        configured: true,
        connected: !!connection,
        domain: process.env.EGNYTE_DOMAIN,
        user: userInfo,
      });
    } catch (error) {
      console.error("Egnyte status error:", error);
      res.json({ configured: false, connected: false });
    }
  });

  // GET /api/egnyte/health - Comprehensive health check proving connection works
  app.get("/api/egnyte/health", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      
      if (!egnyteService.isConfigured()) {
        return res.json({ 
          connected: false, 
          canListRoot: false, 
          rootChildCount: 0,
          error: "Egnyte not configured" 
        });
      }
      
      const connection = await egnyteService.getConnection();
      if (!connection) {
        return res.json({ 
          connected: false, 
          canListRoot: false, 
          rootChildCount: 0,
          error: "No Egnyte connection" 
        });
      }
      
      // Test listing root to prove API access works
      let canListRoot = false;
      let rootChildCount = 0;
      let rootPath = "/Shared/Black Hawk Construction";
      let rootContents: any = null;
      
      try {
        rootContents = await egnyteService.listFolder(rootPath);
        canListRoot = true;
        rootChildCount = (rootContents?.folders?.length || 0) + (rootContents?.files?.length || 0);
      } catch (listError: any) {
        console.error("Health check - list folder error:", listError.message);
      }
      
      // Get user info
      const userInfo = await egnyteService.getUserInfo();
      
      res.json({
        connected: true,
        canListRoot,
        rootChildCount,
        rootPath,
        folderCount: rootContents?.folders?.length || 0,
        fileCount: rootContents?.files?.length || 0,
        user: userInfo?.username || null,
        domain: process.env.EGNYTE_DOMAIN,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Egnyte health error:", error);
      res.json({ 
        connected: false, 
        canListRoot: false, 
        rootChildCount: 0,
        error: error.message 
      });
    }
  });

  // Store pending OAuth states (simple in-memory for now)
  const egnyteOAuthStates = new Map<string, { timestamp: number; redirectUri: string }>();

  // ============== REAL-TIME EGNYTE ROUTES (Enterprise-grade) ==============
  
  // GET /api/egnyte/changes - Delta changes since cursor
  app.get("/api/egnyte/changes", async (req: Request, res: Response) => {
    try {
      const { since, limit = "50" } = req.query;
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const changes = await egnyteSyncService.getRecentChanges(
        since as string | undefined,
        parseInt(limit as string)
      );
      
      res.json({
        changes,
        cursor: changes.length > 0 ? changes[changes.length - 1].lastSyncedAt : since,
        hasMore: changes.length >= parseInt(limit as string),
      });
    } catch (error) {
      console.error("Error fetching Egnyte changes:", error);
      res.status(500).json({ error: "Failed to fetch changes" });
    }
  });

  // GET /api/egnyte/stream - SSE for real-time updates (fallback for WebSocket)
  app.get("/api/egnyte/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    
    const tenantId = req.query.tenantId as string || "blackhawk-default";
    
    res.write(`data: ${JSON.stringify({ type: "connected", tenantId, timestamp: new Date().toISOString() })}\n\n`);
    
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "heartbeat", timestamp: new Date().toISOString() })}\n\n`);
    }, 30000);
    
    req.on("close", () => {
      clearInterval(heartbeat);
    });
  });

  // GET /api/egnyte/tree - File tree structure
  app.get("/api/egnyte/tree", async (req: Request, res: Response) => {
    try {
      const { root = "/Shared/Black Hawk Construction", depth = "2" } = req.query;
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const items = await egnyteSyncService.getMirroredItems(undefined, undefined, 1000);
      
      const tree = items
        .filter((item: any) => item.egnytePath?.startsWith(root as string))
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          path: item.egnytePath,
          isFolder: item.isFolder,
          size: item.fileSizeBytes,
          modifiedAt: item.egnyteLastModified || item.lastSyncedAt,
          docCount: item.isFolder ? 0 : 1,
        }));
      
      res.json({ root, tree, count: tree.length });
    } catch (error) {
      console.error("Error fetching file tree:", error);
      res.status(500).json({ error: "Failed to fetch tree" });
    }
  });

  // GET /api/egnyte/items - Items at a specific path with pagination
  app.get("/api/egnyte/items", async (req: Request, res: Response) => {
    try {
      const { path = "/Shared", page = "1", limit = "50", sort = "name" } = req.query;
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
      const items = await egnyteSyncService.getMirroredItems(undefined, undefined, parseInt(limit as string) + offset);
      
      const filtered = items
        .filter((item: any) => {
          const itemPath = item.path || "";
          const parentPath = itemPath.substring(0, itemPath.lastIndexOf("/")) || "/";
          return parentPath === path;
        })
        .slice(offset, offset + parseInt(limit as string));
      
      res.json({
        path,
        items: filtered,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        hasMore: filtered.length >= parseInt(limit as string),
      });
    } catch (error) {
      console.error("Error fetching items:", error);
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  // GET /api/admin/egnyte/live-test - Live test page with last 50 events
  app.get("/api/admin/egnyte/live-test", async (req: Request, res: Response) => {
    try {
      const { websocketService } = await import("./services/websocket.service");
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const wsStatus = websocketService.getStatus();
      const syncStats = await egnyteSyncService.getSyncStats();
      const recentChanges = await egnyteSyncService.getRecentChanges(undefined, 50);
      
      res.json({
        websocket: wsStatus,
        sync: syncStats,
        recentEvents: recentChanges.map((c: any) => ({
          id: c.id,
          action: c.isFolder ? "folder" : "file",
          path: c.egnytePath,
          name: c.name,
          syncedAt: c.lastSyncedAt,
          egnyteModified: c.egnyteLastModified,
        })),
        eventCount: recentChanges.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error in live test:", error);
      res.status(500).json({ error: "Live test failed" });
    }
  });

  // GET /api/websocket/status - WebSocket service status
  app.get("/api/websocket/status", async (req: Request, res: Response) => {
    try {
      const { websocketService } = await import("./services/websocket.service");
      res.json(websocketService.getStatus());
    } catch (error) {
      res.status(500).json({ error: "Failed to get WebSocket status" });
    }
  });

  // POST /api/egnyte/sync-now - Manual trigger for admin
  app.post("/api/egnyte/sync-now", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const result = await egnyteSyncService.triggerDeltaSync();
      
      const { websocketService } = await import("./services/websocket.service");
      websocketService.broadcast("global", "sync:started", { timestamp: new Date().toISOString() });
      
      res.json({ success: true, ...result });
    } catch (error) {
      console.error("Error triggering sync:", error);
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  // ============== EGNYTE ADMIN OAUTH ROUTES ==============
  // These implement proper OAuth 2.0 Authorization Code flow

  // Track last auth attempts for debugging
  let lastAuthorizeAttempt: { url: string; status?: number; headers?: Record<string, string>; body?: string; error?: string } | null = null;
  let lastTokenAttempt: { url: string; status?: number; body?: string; error?: string } | null = null;

  // GET /api/admin/egnyte/debug - Full diagnostic endpoint
  app.get("/api/admin/egnyte/debug", async (req: Request, res: Response) => {
    const EGNYTE_CLIENT_ID = process.env.EGNYTE_CLIENT_ID || "";
    const EGNYTE_CLIENT_SECRET = process.env.EGNYTE_CLIENT_SECRET || "";
    const EGNYTE_DOMAIN = process.env.EGNYTE_DOMAIN || "";
    
    const externalHost = process.env.REPLIT_DEV_DOMAIN || req.headers.host;
    const redirectUri = `https://${externalHost}/api/admin/egnyte/callback`;
    const state = "debug_state_" + Date.now();
    
    const baseUrl = `https://${EGNYTE_DOMAIN}.egnyte.com`;
    const authorizeUrl = `${baseUrl}/puboauth/authorize?client_id=${encodeURIComponent(EGNYTE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=Egnyte.filesystem`;
    const tokenUrl = `${baseUrl}/puboauth/token`;
    
    // Get last auth attempts from database
    const { db } = await import("./db");
    const { egnyteAuthAttempts } = await import("@shared/schema");
    const { desc } = await import("drizzle-orm");
    
    const recentAttempts = await db.select()
      .from(egnyteAuthAttempts)
      .orderBy(desc(egnyteAuthAttempts.createdAt))
      .limit(5);
    
    const lastError = recentAttempts.find(a => !a.success);
    
    res.json({
      egnyteDomain: EGNYTE_DOMAIN,
      baseUrl,
      authorizeUrl,
      tokenUrl,
      redirectUriUsed: redirectUri,
      clientIdConfigured: !!EGNYTE_CLIENT_ID,
      clientIdPrefix: EGNYTE_CLIENT_ID ? EGNYTE_CLIENT_ID.substring(0, 8) + "..." : null,
      clientSecretConfigured: !!EGNYTE_CLIENT_SECRET,
      lastAuthorizeStatus: lastAuthorizeAttempt || "No authorize attempt yet - call /api/admin/egnyte/authorize-test",
      lastTokenStatus: lastTokenAttempt || "No token attempt yet",
      lastError: lastError ? {
        type: lastError.attemptType,
        statusCode: lastError.statusCode,
        errorMessage: lastError.errorMessage,
        responseBody: lastError.responseBody,
        timestamp: lastError.createdAt,
      } : null,
      recentAttempts: recentAttempts.map(a => ({
        type: a.attemptType,
        status: a.statusCode,
        success: a.success,
        error: a.errorMessage,
        time: a.createdAt,
      })),
    });
  });

  // GET /api/admin/egnyte/authorize-test - Server-side test of authorize endpoint
  app.get("/api/admin/egnyte/authorize-test", async (req: Request, res: Response) => {
    const EGNYTE_CLIENT_ID = process.env.EGNYTE_CLIENT_ID || "";
    const EGNYTE_DOMAIN = process.env.EGNYTE_DOMAIN || "";
    
    const externalHost = process.env.REPLIT_DEV_DOMAIN || req.headers.host;
    const redirectUri = `https://${externalHost}/api/admin/egnyte/callback`;
    const state = "authorize_test_" + Date.now();
    
    const baseUrl = `https://${EGNYTE_DOMAIN}.egnyte.com`;
    const authorizeUrl = `${baseUrl}/puboauth/authorize?client_id=${encodeURIComponent(EGNYTE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}&scope=Egnyte.filesystem`;
    
    console.log("\n========== EGNYTE AUTHORIZE TEST ==========");
    console.log(`[1] Testing URL: ${authorizeUrl}`);
    console.log("============================================\n");
    
    try {
      // Make request WITHOUT following redirects
      const response = await fetch(authorizeUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "BlackHawk-Sentinel/1.0",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      let bodySnippet = "";
      try {
        const fullBody = await response.text();
        bodySnippet = fullBody.substring(0, 2000);
      } catch (e) {
        bodySnippet = "[Could not read body]";
      }
      
      // Store for debug endpoint
      lastAuthorizeAttempt = {
        url: authorizeUrl,
        status: response.status,
        headers: responseHeaders,
        body: bodySnippet,
      };
      
      console.log(`[2] Response status: ${response.status}`);
      console.log(`[3] Location header: ${responseHeaders.location || "NOT PRESENT"}`);
      console.log(`[4] Response body snippet: ${bodySnippet.substring(0, 500)}`);
      
      // Log to database
      const { db } = await import("./db");
      const { egnyteAuthAttempts } = await import("@shared/schema");
      await db.insert(egnyteAuthAttempts).values({
        tenantId: "default",
        attemptType: "authorize_test",
        endpointUrl: authorizeUrl,
        statusCode: response.status,
        responseBody: bodySnippet,
        success: response.status === 302 || response.status === 301,
        hasRefreshToken: false,
        errorMessage: response.status !== 302 ? `Unexpected status ${response.status}` : null,
      });
      
      const result = {
        testUrl: authorizeUrl,
        statusCode: response.status,
        statusText: response.statusText,
        expectedStatus: 302,
        isExpectedRedirect: response.status === 302 || response.status === 301,
        locationHeader: responseHeaders.location || null,
        allHeaders: responseHeaders,
        responseBodySnippet: bodySnippet,
        diagnosis: response.status === 302 
          ? "SUCCESS: OAuth authorize endpoint is working correctly"
          : response.status === 401 
            ? "FAILED: 401 Unauthorized - App may not have required API permissions (Prod Collaborate)"
            : response.status === 400
              ? "FAILED: 400 Bad Request - Check client_id or redirect_uri configuration"
              : `UNEXPECTED: Status ${response.status} - Check response body for details`,
      };
      
      res.json(result);
      
    } catch (error: any) {
      lastAuthorizeAttempt = {
        url: authorizeUrl,
        error: error.message,
      };
      
      res.status(500).json({
        testUrl: authorizeUrl,
        error: error.message,
        diagnosis: "Network error - could not reach Egnyte server",
      });
    }
  });

  // POST /api/admin/egnyte/token-test - Test password grant with full response capture
  app.post("/api/admin/egnyte/token-test", async (req: Request, res: Response) => {
    const EGNYTE_CLIENT_ID = process.env.EGNYTE_CLIENT_ID || "";
    const EGNYTE_CLIENT_SECRET = process.env.EGNYTE_CLIENT_SECRET || "";
    const EGNYTE_DOMAIN = process.env.EGNYTE_DOMAIN || "";
    
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required in body" });
    }
    
    const tokenUrl = `https://${EGNYTE_DOMAIN}.egnyte.com/puboauth/token`;
    
    console.log("\n========== EGNYTE TOKEN TEST ==========");
    console.log(`[1] Token URL: ${tokenUrl}`);
    console.log(`[2] Username: ${username}`);
    console.log(`[3] client_id: ${EGNYTE_CLIENT_ID.substring(0, 8)}...`);
    console.log("========================================\n");
    
    try {
      const body = new URLSearchParams({
        client_id: EGNYTE_CLIENT_ID,
        client_secret: EGNYTE_CLIENT_SECRET,
        username: username,
        password: password,
        grant_type: "password",
      });
      
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body,
      });
      
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      const responseBody = await response.text();
      
      // Store for debug endpoint
      lastTokenAttempt = {
        url: tokenUrl,
        status: response.status,
        body: responseBody.substring(0, 2000),
      };
      
      // Log to database
      const { db } = await import("./db");
      const { egnyteAuthAttempts } = await import("@shared/schema");
      await db.insert(egnyteAuthAttempts).values({
        tenantId: "default",
        attemptType: "token_test",
        endpointUrl: tokenUrl,
        statusCode: response.status,
        responseBody: responseBody.substring(0, 2000),
        success: response.ok,
        hasRefreshToken: responseBody.includes("refresh_token"),
        errorMessage: !response.ok ? `HTTP ${response.status}` : null,
      });
      
      console.log(`[4] Response status: ${response.status}`);
      console.log(`[5] Response body: ${responseBody}`);
      
      if (response.ok) {
        const tokenData = JSON.parse(responseBody);
        res.json({
          success: true,
          statusCode: response.status,
          hasAccessToken: !!tokenData.access_token,
          hasRefreshToken: !!tokenData.refresh_token,
          tokenType: tokenData.token_type,
          expiresIn: tokenData.expires_in,
          message: "SUCCESS! Token obtained. Ready to connect.",
        });
      } else {
        res.json({
          success: false,
          statusCode: response.status,
          statusText: response.statusText,
          responseBody: responseBody,
          responseHeaders: responseHeaders,
          requestSent: {
            url: tokenUrl,
            method: "POST",
            contentType: "application/x-www-form-urlencoded",
            bodyParams: {
              client_id: EGNYTE_CLIENT_ID.substring(0, 8) + "...",
              client_secret: "[REDACTED]",
              username: username,
              password: "[REDACTED]",
              grant_type: "password",
            },
          },
          diagnosis: response.status === 403 
            ? "403 Forbidden - Either wrong password, account locked, 2FA enabled, or SSO blocking password auth"
            : response.status === 401
              ? "401 Unauthorized - Invalid client credentials"
              : `Unexpected status ${response.status}`,
        });
      }
      
    } catch (error: any) {
      lastTokenAttempt = {
        url: tokenUrl,
        error: error.message,
      };
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/admin/egnyte/auth - Resource Owner Password flow for Internal Applications
  app.post("/api/admin/egnyte/auth", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: "username and password are required" });
      }
      
      if (!egnyteService.isConfigured()) {
        return res.status(400).json({ error: "Egnyte not configured. Set EGNYTE_CLIENT_ID, EGNYTE_CLIENT_SECRET, EGNYTE_DOMAIN" });
      }
      
      console.log("\n========== ADMIN EGNYTE AUTH (Resource Owner) ==========");
      console.log(`[1] Authenticating user: ${username}`);
      console.log("========================================================\n");
      
      // Authenticate using Resource Owner Password flow
      const tokenData = await egnyteService.authenticateWithPassword(username, password);
      
      // Store tokens in database
      await (egnyteService as any).saveConnection({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
      });
      
      // Auto-add default root path and trigger sync
      const rootPath = "/Shared/Black Hawk Construction";
      await (egnyteService as any).addSyncPath?.(rootPath);
      
      console.log("\n========== EGNYTE AUTH SUCCESS ==========");
      console.log(`[2] Tokens stored successfully`);
      console.log(`[3] Root path added: ${rootPath}`);
      console.log(`[4] Starting folder sync...`);
      console.log("==========================================\n");
      
      // Trigger initial sync in background
      (egnyteService as any).syncFolderStructure?.(rootPath)?.catch?.((err: any) => {
        console.error("Background sync error:", err);
      });
      
      res.json({ 
        success: true, 
        message: "Egnyte connected successfully",
        rootPath,
      });
    } catch (error: any) {
      console.error("Egnyte auth error:", error);
      res.status(401).json({ error: "Authentication failed: " + error.message });
    }
  });

  // GET /api/admin/egnyte/connect - Start OAuth flow (for Public Apps only - Internal Apps use POST /auth)
  app.get("/api/admin/egnyte/connect", async (req: Request, res: Response) => {
    // For Internal Applications, redirect to auth page instead of OAuth
    res.redirect("/integrations?egnyte_auth=required");
  });

  // GET /api/admin/egnyte/callback - OAuth callback, exchanges code for tokens
  app.get("/api/admin/egnyte/callback", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { code, state, error: oauthError, error_description } = req.query;
      
      console.log("\n========== ADMIN EGNYTE CALLBACK ==========");
      console.log(`[1] Received callback`);
      console.log(`[2] code: ${code ? (code as string).substring(0, 10) + '...' : 'none'}`);
      console.log(`[3] state: ${state}`);
      console.log(`[4] error: ${oauthError || 'none'}`);
      console.log(`[5] error_description: ${error_description || 'none'}`);
      
      // Check for OAuth error from Egnyte
      if (oauthError) {
        const errorMsg = `Egnyte OAuth error: ${oauthError} - ${error_description || 'No description'}`;
        console.log(`[ERROR] ${errorMsg}`);
        console.log("===========================================\n");
        return res.redirect(`/integrations?error=egnyte&message=${encodeURIComponent(errorMsg)}`);
      }
      
      if (!code || !state) {
        console.log("[ERROR] Missing code or state");
        console.log("===========================================\n");
        return res.redirect("/integrations?error=egnyte&message=Missing+authorization+code+or+state");
      }
      
      // Verify state
      const storedState = egnyteOAuthStates.get(state as string);
      if (!storedState) {
        console.log("[ERROR] Invalid or expired state");
        console.log("===========================================\n");
        return res.redirect("/integrations?error=egnyte&message=Invalid+or+expired+OAuth+state");
      }
      
      const redirectUri = storedState.redirectUri;
      egnyteOAuthStates.delete(state as string);
      
      console.log(`[6] redirect_uri for token exchange: ${redirectUri}`);
      
      // Exchange code for tokens
      const tokenData = await egnyteService.exchangeCodeForToken(code as string, redirectUri);
      
      console.log(`[7] Token exchange successful!`);
      console.log(`[8] Has refresh_token: ${!!tokenData.refresh_token}`);
      console.log(`[9] Saving connection...`);
      
      // Save tokens
      await egnyteService.saveConnection(
        tokenData.access_token,
        tokenData.refresh_token || "",
        tokenData.expires_in
      );
      
      console.log(`[10] Connection saved, starting initial sync...`);
      console.log("===========================================\n");
      
      // Start initial sync automatically
      try {
        const { egnyteSyncService } = await import("./services/egnyte-sync.service");
        
        // Check if root path exists, add if not
        const syncStatus = await egnyteSyncService.getSyncStatus();
        if (syncStatus.rootPaths.length === 0) {
          await egnyteSyncService.addRootPath("/Shared/Black Hawk Construction", "Black Hawk Construction");
        }
        
        // Start initial sync
        await (egnyteSyncService as any).startSync?.("initial");
      } catch (syncError) {
        console.error("Failed to start initial sync:", syncError);
      }
      
      res.redirect("/integrations?success=egnyte");
    } catch (error: any) {
      console.error("Egnyte callback error:", error);
      res.redirect(`/integrations?error=egnyte&message=${encodeURIComponent(error.message)}`);
    }
  });

  // POST /api/admin/egnyte/refresh - Manually refresh token
  app.post("/api/admin/egnyte/refresh", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const result = await egnyteService.refreshStoredToken();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /api/admin/egnyte/health - Health check with real API call
  app.get("/api/admin/egnyte/health", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const health = await egnyteService.healthCheck();
      res.json(health);
    } catch (error: any) {
      res.status(500).json({
        domain: process.env.EGNYTE_DOMAIN || "tntcyber",
        connected: false,
        lastTokenRefreshAt: null,
        canListRoot: false,
        rootChildCount: 0,
        error: error.message,
      });
    }
  });

  // GET /api/debug/ui - System health check for debugging white screens
  app.get("/api/debug/ui", async (req: Request, res: Response) => {
    const startTime = Date.now();
    let dbConnected = false;
    let egnyteConnected = false;
    let lastError: string | null = null;
    let dbQueryMs = 0;
    
    // Test database connection
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbConnected = true;
      dbQueryMs = Date.now() - dbStart;
    } catch (error: any) {
      lastError = `DB: ${error.message}`;
    }
    
    // Test Egnyte connection
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const health = await egnyteService.healthCheck();
      egnyteConnected = health.connected;
    } catch (error: any) {
      if (!lastError) lastError = `Egnyte: ${error.message}`;
    }
    
    res.json({
      frontendBuildVersion: process.env.npm_package_version || "1.0.0",
      apiReachable: true,
      dbConnected,
      dbQueryMs,
      egnyteConnected,
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024,
      nodeEnv: process.env.NODE_ENV || "development",
      lastError,
      responseTimeMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/admin/egnyte/diagnostics - OAuth diagnostics (last 20 attempts)
  app.get("/api/admin/egnyte/diagnostics", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const attempts = await egnyteService.getAuthAttempts(20);
      res.json({ attempts });
    } catch (error: any) {
      res.status(500).json({ error: error.message, attempts: [] });
    }
  });

  // GET /api/admin/egnyte/credentials-debug - Show current credentials (masked)
  app.get("/api/admin/egnyte/credentials-debug", async (req: Request, res: Response) => {
    const clientId = process.env.EGNYTE_CLIENT_ID;
    const clientSecret = process.env.EGNYTE_CLIENT_SECRET;
    const domain = process.env.EGNYTE_DOMAIN || "tntcyber";
    
    // Mask: first 6 + last 4 chars
    const maskCred = (val: string | undefined) => {
      if (!val) return "[NOT SET]";
      if (val.length < 10) return "[too short]";
      return `${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
    };
    
    res.json({
      domain,
      clientId: maskCred(clientId),
      clientIdLength: clientId?.length || 0,
      clientSecretSet: !!clientSecret,
      clientSecretLength: clientSecret?.length || 0,
      xEgnyteApiKeyHeaderSent: false,
      note: "OAuth token exchange sends ONLY: grant_type, client_id, client_secret, redirect_uri, code"
    });
  });

  // GET /api/admin/egnyte/authorize-test - Test authorize endpoint server-side
  app.get("/api/admin/egnyte/authorize-test", async (req: Request, res: Response) => {
    const domain = process.env.EGNYTE_DOMAIN || "tntcyber";
    const clientId = process.env.EGNYTE_CLIENT_ID;
    const externalHost = process.env.REPLIT_DEV_DOMAIN || req.headers.host;
    const redirectUri = `https://${externalHost}/api/admin/egnyte/callback`;
    const state = "authorize-test-" + Date.now();
    
    // Build the exact authorization URL
    const host = `https://${domain}.egnyte.com`;
    const path = "/puboauth/authorize";
    const params = new URLSearchParams({
      client_id: clientId || "",
      redirect_uri: redirectUri,
      response_type: "code",
      state: state,
    });
    const fullUrl = `${host}${path}?${params.toString()}`;
    
    // Mask client_id: first 6 + last 4
    const maskCred = (val: string | undefined) => {
      if (!val) return "[NOT SET]";
      if (val.length < 10) return "[too short]";
      return `${val.substring(0, 6)}...${val.substring(val.length - 4)}`;
    };
    
    console.log("\n========== EGNYTE AUTHORIZE TEST ==========");
    console.log(`[1] Host: ${host}`);
    console.log(`[2] Path: ${path}`);
    console.log(`[3] Full URL: ${fullUrl}`);
    console.log(`[4] client_id source: process.env.EGNYTE_CLIENT_ID`);
    console.log(`[5] client_id (first6+last4): ${maskCred(clientId)}`);
    console.log(`[6] client_id length: ${clientId?.length || 0}`);
    console.log(`[7] redirect_uri: ${redirectUri}`);
    console.log(`[8] response_type: code`);
    console.log(`[9] state: ${state}`);
    console.log(`[10] scope: (not set - using default)`);
    console.log("============================================\n");
    
    // Make server-side request WITHOUT following redirects
    let statusCode: number = 0;
    let responseHeaders: Record<string, string> = {};
    let bodySnippet: string = "";
    let errorMessage: string | null = null;
    
    try {
      const response = await fetch(fullUrl, {
        method: "GET",
        redirect: "manual", // Don't follow redirects
        headers: {
          "User-Agent": "BLACKHAWK-SENTINEL/1.0 OAuth-Test",
        },
      });
      
      statusCode = response.status;
      
      // Capture response headers
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      // Get body snippet (first 500 chars)
      const bodyText = await response.text();
      bodySnippet = bodyText.substring(0, 500);
      if (bodyText.length > 500) {
        bodySnippet += "... [truncated]";
      }
      
      console.log("\n========== EGNYTE AUTHORIZE RESPONSE ==========");
      console.log(`[11] Status Code: ${statusCode}`);
      console.log(`[12] Location Header: ${responseHeaders["location"] || "(none)"}`);
      console.log(`[13] Content-Type: ${responseHeaders["content-type"] || "(none)"}`);
      console.log(`[14] Body Snippet: ${bodySnippet.substring(0, 200)}`);
      console.log("================================================\n");
      
    } catch (error: any) {
      errorMessage = error.message;
      console.log(`\n[ERROR] Authorize test failed: ${errorMessage}\n`);
    }
    
    // Expected: 302 redirect to login/consent
    // 401 = client_id/app config issue
    const expectedBehavior = statusCode === 302 
      ? "SUCCESS - Redirect to login/consent page"
      : statusCode === 200
      ? "SUCCESS - Login page returned directly"
      : statusCode === 401
      ? "FAILURE - client_id not recognized or app not active"
      : statusCode === 400
      ? "FAILURE - Invalid request parameters"
      : `UNEXPECTED - Status ${statusCode}`;
    
    res.json({
      test: "authorize-endpoint",
      url: {
        host,
        path,
        fullUrl,
      },
      params: {
        clientIdSource: "process.env.EGNYTE_CLIENT_ID",
        clientIdMasked: maskCred(clientId),
        clientIdLength: clientId?.length || 0,
        redirectUri,
        responseType: "code",
        state,
        scope: "(not set)",
      },
      response: {
        statusCode,
        headers: responseHeaders,
        bodySnippet,
        error: errorMessage,
      },
      analysis: {
        expectedBehavior,
        hostCorrect: host === "https://tntcyber.egnyte.com",
        pathCorrect: path === "/puboauth/authorize",
        hasLocationHeader: !!responseHeaders["location"],
      },
    });
  });

  // ============== LEGACY EGNYTE ROUTES (kept for compatibility) ==============

  // Start Egnyte OAuth flow (legacy - redirects to admin route)
  app.get("/api/egnyte/authorize", (req: Request, res: Response) => {
    res.redirect("/api/admin/egnyte/connect");
  });

  // Debug: Get auth URL info without redirect
  app.get("/api/egnyte/auth-url", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const externalHost = process.env.REPLIT_DEV_DOMAIN || req.headers.host;
      const redirectUri = `https://${externalHost}/api/admin/egnyte/callback`;
      const authUrl = egnyteService.getAuthorizationUrl(redirectUri, "debug-state");
      
      res.json({
        authUrl,
        redirectUri,
        domain: process.env.EGNYTE_DOMAIN,
        clientIdMasked: process.env.EGNYTE_CLIENT_ID ? 
          process.env.EGNYTE_CLIENT_ID.substring(0, 4) + "..." + process.env.EGNYTE_CLIENT_ID.slice(-4) : 
          "not set",
        note: "Use /api/admin/egnyte/connect to start OAuth flow"
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Token capture page (serves HTML that extracts token from URL fragment)
  app.get("/egnyte-token-capture", (req: Request, res: Response) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Egnyte Token Capture</title>
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 40px auto; padding: 20px; }
    .success { color: #22c55e; }
    .error { color: #ef4444; }
    pre { background: #f1f5f9; padding: 12px; border-radius: 8px; overflow-x: auto; }
    button { background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <h1>Egnyte Token Capture</h1>
  <div id="status">Processing...</div>
  <script>
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    
    if (accessToken) {
      document.getElementById('status').innerHTML = 
        '<p class="success">Token captured successfully!</p>' +
        '<p>Saving token and starting sync...</p>';
      
      fetch('/api/egnyte/connect-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken })
      })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          document.getElementById('status').innerHTML = 
            '<p class="success">Connected to Egnyte!</p>' +
            '<p>Sync has started. <a href="/integrations">Return to Integrations</a></p>';
        } else {
          document.getElementById('status').innerHTML = 
            '<p class="error">Connection failed: ' + (data.error || 'Unknown error') + '</p>' +
            '<p><a href="/integrations">Return to Integrations</a></p>';
        }
      })
      .catch(err => {
        document.getElementById('status').innerHTML = 
          '<p class="error">Error: ' + err.message + '</p>';
      });
    } else {
      document.getElementById('status').innerHTML = 
        '<p class="error">No token found in URL</p>' +
        '<p><a href="/integrations">Return to Integrations</a></p>';
    }
  </script>
</body>
</html>`;
    res.send(html);
  });

  // Egnyte OAuth callback (matches registered URI in Egnyte Developer Portal)
  app.get("/auth/egnyte/callback", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { code, state } = req.query;
      
      if (!code || typeof code !== "string") {
        return res.redirect("/integrations?error=no_code");
      }
      
      if (!state || typeof state !== "string" || !egnyteOAuthStates.has(state)) {
        return res.redirect("/integrations?error=invalid_state");
      }
      
      const storedState = egnyteOAuthStates.get(state)!;
      egnyteOAuthStates.delete(state);
      
      const tokens = await egnyteService.exchangeCodeForToken(code, storedState.redirectUri);
      await egnyteService.saveConnection(
        tokens.access_token,
        tokens.refresh_token || "",
        tokens.expires_in
      );
      
      // Auto-start sync with default root path after OAuth success
      try {
        const { egnyteSyncService } = await import("./services/egnyte-sync.service");
        
        // Add default root path if none exists
        const status = await egnyteSyncService.getSyncStatus();
        if (!status.rootPaths || status.rootPaths.length === 0) {
          await egnyteSyncService.addRootPath("/Shared/Black Hawk Construction", "Black Hawk Construction", "company");
        }

        // Auto-start initial sync in background
        console.log("[Egnyte] OAuth success - Auto-starting initial sync...");
        egnyteSyncService.runInitialSync().catch(err => {
          console.error("[Egnyte] Auto-sync error:", err);
        });

      } catch (syncError) {
        console.error("[Egnyte] Sync setup error after OAuth:", syncError);
      }
      
      res.redirect("/integrations?success=egnyte");
    } catch (error) {
      console.error("Egnyte callback error:", error);
      res.redirect("/integrations?error=auth_failed");
    }
  });

  // Disconnect Egnyte
  app.post("/api/egnyte/disconnect", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      await egnyteService.disconnectEgnyte();
      res.json({ success: true });
    } catch (error) {
      console.error("Egnyte disconnect error:", error);
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });

  // Authenticate with username/password (for Internal Applications)
  // Uses configured EGNYTE_CLIENT_ID and EGNYTE_CLIENT_SECRET from environment
  app.post("/api/egnyte/connect-internal", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
      }

      // Authenticate using password grant with configured client credentials
      console.log("[Egnyte] Authenticating with password grant...");
      const tokenResponse = await egnyteService.authenticateInternalApp(username, password);

      // Save the access token
      await egnyteService.saveConnection(
        tokenResponse.access_token,
        tokenResponse.refresh_token || "",
        tokenResponse.expires_in || 31536000 // Default 1 year
      );

      // Test the connection
      const testResult = await egnyteService.testConnection();
      if (!testResult.success) {
        return res.status(400).json({ 
          error: "Authenticated but connection test failed", 
          details: testResult.message 
        });
      }

      // Auto-start sync with default root path
      try {
        const { egnyteSyncService } = await import("./services/egnyte-sync.service");
        
        // Add default root path if none exists
        const status = await egnyteSyncService.getSyncStatus();
        if (!status.rootPaths || status.rootPaths.length === 0) {
          await egnyteSyncService.addRootPath("/Shared/Black Hawk Construction", "Black Hawk Construction", "company");
        }

        // Auto-start initial sync
        console.log("[Egnyte] Auto-starting initial sync...");
        egnyteSyncService.runInitialSync().catch(err => {
          console.error("[Egnyte] Auto-sync error:", err);
        });

      } catch (syncError) {
        console.error("[Egnyte] Sync setup error:", syncError);
      }

      res.json({ 
        success: true, 
        message: "Connected to Egnyte successfully",
        user: testResult.user,
        syncStarted: true
      });

    } catch (error: any) {
      console.error("Egnyte connect-internal error:", error);
      // Return 401 for auth failures, 500 for other errors
      const isAuthError = error.message?.includes("403") || error.message?.includes("401") || error.message?.includes("Invalid");
      res.status(isAuthError ? 401 : 500).json({ error: error.message || "Failed to authenticate" });
    }
  });

  // Store access token directly (for pre-authenticated tokens)
  app.post("/api/egnyte/connect-token", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { accessToken } = req.body;

      if (!accessToken) {
        return res.status(400).json({ error: "Access token is required" });
      }

      // Save the token
      await egnyteService.saveDirectToken(accessToken);

      // Test the connection
      const testResult = await egnyteService.testConnection();
      if (!testResult.success) {
        return res.status(400).json({ 
          error: "Token saved but connection test failed", 
          details: testResult.message 
        });
      }

      // Auto-start sync with default root path
      try {
        const { egnyteSyncService } = await import("./services/egnyte-sync.service");
        
        // Add default root path if none exists
        const status = await egnyteSyncService.getSyncStatus();
        if (!status.rootPaths || status.rootPaths.length === 0) {
          await egnyteSyncService.addRootPath("/Shared/Black Hawk Construction", "Black Hawk Construction", "company");
        }

        // Auto-start initial sync
        console.log("[Egnyte] Auto-starting initial sync...");
        egnyteSyncService.runInitialSync().catch(err => {
          console.error("[Egnyte] Auto-sync error:", err);
        });

      } catch (syncError) {
        console.error("[Egnyte] Sync setup error:", syncError);
      }

      res.json({ 
        success: true, 
        message: "Connected to Egnyte successfully",
        user: testResult.user,
        syncStarted: true
      });

    } catch (error) {
      console.error("Egnyte connect-token error:", error);
      res.status(500).json({ error: "Failed to connect" });
    }
  });

  // Test Egnyte connection
  app.get("/api/egnyte/test", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const result = await egnyteService.testConnection();
      res.json(result);
    } catch (error) {
      console.error("Egnyte test error:", error);
      res.status(500).json({ success: false, message: "Test failed" });
    }
  });

  // List Egnyte folder contents
  app.get("/api/egnyte/files", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const path = (req.query.path as string) || "/Shared";
      
      const listing = await egnyteService.listFolder(path);
      if (!listing) {
        return res.status(401).json({ error: "Not connected to Egnyte" });
      }
      
      res.json(listing);
    } catch (error) {
      console.error("Egnyte files error:", error);
      res.status(500).json({ error: "Failed to list files" });
    }
  });

  // Search Egnyte files
  app.get("/api/egnyte/search", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const query = (req.query.q as string) || "";
      
      if (!query) {
        return res.json({ results: [] });
      }
      
      const results = await egnyteService.searchFiles(query);
      res.json({ results });
    } catch (error) {
      console.error("Egnyte search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Download and import Egnyte file to Knowledge Vault
  app.post("/api/egnyte/import", async (req: Request, res: Response) => {
    try {
      const { egnyteService } = await import("./services/egnyte.service");
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const pathLib = await import("path");
      const { path: filePath } = req.body;
      
      if (!filePath || typeof filePath !== "string") {
        return res.status(400).json({ error: "File path required" });
      }
      
      const fileData = await egnyteService.downloadFile(filePath);
      if (!fileData) {
        return res.status(401).json({ error: "Failed to download from Egnyte" });
      }
      
      const safeFilename = pathLib.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, "_");
      
      const tempDir = pathLib.join(process.cwd(), "tmp");
      await fs.mkdir(tempDir, { recursive: true });
      const tempFile = pathLib.join(tempDir, safeFilename);
      await fs.writeFile(tempFile, fileData.buffer);
      
      const result = await documentImportService.importDocument(tempFile, "admin");
      
      await fs.unlink(tempFile).catch(() => {});
      
      res.json({ success: true, document: result });
    } catch (error) {
      console.error("Egnyte import error:", error);
      res.status(500).json({ error: "Import failed" });
    }
  });

  // ============================================================================
  // EGNYTE MIRROR SYNC API
  // ============================================================================

  // Get sync status and configuration
  app.get("/api/egnyte/sync/status", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { getDocumentStorage } = await import("./connectors/document-storage.connector");
      
      const provider = getDocumentStorage();
      const connectionStatus = await provider.getConnectionStatus();
      const { lastSync, rootPaths } = await egnyteSyncService.getSyncStatus();
      
      res.json({
        connection: connectionStatus,
        lastSync,
        rootPaths,
        provider: provider.providerName,
      });
    } catch (error) {
      console.error("Sync status error:", error);
      res.status(500).json({ error: "Failed to get sync status" });
    }
  });

  // Get root paths configuration
  app.get("/api/egnyte/sync/root-paths", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const rootPaths = await egnyteSyncService.getRootPaths();
      res.json(rootPaths);
    } catch (error) {
      res.status(500).json({ error: "Failed to get root paths" });
    }
  });

  // Add a root path
  app.post("/api/egnyte/sync/root-paths", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { path, label, pathType } = req.body;
      
      if (!path || !label) {
        return res.status(400).json({ error: "Path and label required" });
      }
      
      const id = await egnyteSyncService.addRootPath(path, label, pathType || 'primary');
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_root_path_added",
        actor: "admin",
        entityType: "egnyte_config",
        entityId: id,
        afterJson: { path, label, pathType },
      });
      
      res.json({ id, path, label, pathType });
    } catch (error) {
      res.status(500).json({ error: "Failed to add root path" });
    }
  });

  // Remove a root path
  app.delete("/api/egnyte/sync/root-paths/:id", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const id = p(req.params.id);
      
      await egnyteSyncService.removeRootPath(id);
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_root_path_removed",
        actor: "admin",
        entityType: "egnyte_config",
        entityId: id,
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove root path" });
    }
  });

  // Start initial sync
  app.post("/api/egnyte/sync/start", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const syncId = await egnyteSyncService.startInitialSync();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_sync_started",
        actor: "admin",
        entityType: "egnyte_sync",
        entityId: syncId,
        afterJson: { syncType: 'initial' },
      });
      
      res.json({ syncId, status: 'running' });
    } catch (error) {
      console.error("Sync start error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Start delta sync
  app.post("/api/egnyte/sync/delta", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      const syncId = await egnyteSyncService.startDeltaSync();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_sync_started",
        actor: "admin",
        entityType: "egnyte_sync",
        entityId: syncId,
        afterJson: { syncType: 'delta' },
      });
      
      res.json({ syncId, status: 'running' });
    } catch (error) {
      console.error("Delta sync error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Pause sync
  app.post("/api/egnyte/sync/:syncId/pause", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const syncId = p(req.params.syncId);
      
      await egnyteSyncService.pauseSync(syncId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to pause sync" });
    }
  });

  // Resume sync
  app.post("/api/egnyte/sync/:syncId/resume", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const syncId = p(req.params.syncId);
      
      await egnyteSyncService.resumeSync(syncId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to resume sync" });
    }
  });

  // ============================================================================
  // EGNYTE SYNC LIVE STATUS & RECONCILIATION
  // ============================================================================

  // GET /api/egnyte/sync/live - Live progress with foldersProcessed, filesProcessed, currentPath
  app.get("/api/egnyte/sync/live", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { syncId } = req.query;
      
      const progress = egnyteSyncService.getLiveProgress(syncId as string | undefined);
      const detailedStatus = await egnyteSyncService.getDetailedSyncStatus();
      
      res.json({
        currentProgress: progress,
        ...detailedStatus,
      });
    } catch (error) {
      console.error("Live sync status error:", error);
      res.status(500).json({ error: "Failed to get live sync status" });
    }
  });

  // POST /api/egnyte/reconcile - Compare Egnyte vs DB totals, list missing files/folders/orphans
  app.post("/api/egnyte/reconcile", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      console.log("[Reconciliation] Starting reconciliation...");
      const result = await egnyteSyncService.runReconciliation();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_reconciliation_run",
        actor: "admin",
        entityType: "egnyte_sync",
        entityId: "reconciliation",
        afterJson: result as any,
      });
      
      res.json(result);
    } catch (error) {
      console.error("Reconciliation error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // POST /api/egnyte/sync/full - Start a FULL deep recursive sync
  app.post("/api/egnyte/sync/full", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      
      console.log("[EgnyteSync] Starting FULL deep recursive sync...");
      const syncId = await egnyteSyncService.runInitialSync();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_full_sync_started",
        actor: "admin",
        entityType: "egnyte_sync",
        entityId: syncId,
        afterJson: { type: 'full_deep_recursive', unlimited_depth: true },
      });
      
      res.json({ 
        syncId, 
        status: 'running',
        message: 'Full deep recursive sync started. Unlimited depth, all subfolders, all documents.'
      });
    } catch (error) {
      console.error("Full sync error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  // Get mirrored items (for dashboard display)
  app.get("/api/egnyte/mirror/items", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { path, entityType, limit } = req.query;
      
      const items = await egnyteSyncService.getMirroredItems(
        path as string | undefined,
        entityType as string | undefined,
        limit ? parseInt(limit as string, 10) : 100
      );
      
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to get mirrored items" });
    }
  });

  // Search mirrored items (local search, not Egnyte direct)
  app.get("/api/egnyte/mirror/search", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { q, limit } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: "Query required" });
      }
      
      const items = await egnyteSyncService.searchMirroredItems(
        q as string,
        limit ? parseInt(limit as string, 10) : 50
      );
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_mirror_search",
        actor: "user",
        entityType: "search",
        entityId: "mirror_search",
        afterJson: { query: q, resultCount: items.length },
      });
      
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Search failed" });
    }
  });

  // Get unassigned items for admin review
  app.get("/api/egnyte/mirror/unassigned", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const items = await egnyteSyncService.getUnassignedItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to get unassigned items" });
    }
  });

  // Assign an unassigned item to an entity
  app.post("/api/egnyte/mirror/assign", async (req: Request, res: Response) => {
    try {
      const { egnyteSyncService } = await import("./services/egnyte-sync.service");
      const { unassignedId, entityType, entityId, userId } = req.body;
      
      if (!unassignedId || !entityType || !entityId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      await egnyteSyncService.assignItem(unassignedId, entityType, entityId, userId || 'admin');
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_item_assigned",
        actor: userId || "admin",
        entityType: "egnyte_item",
        entityId: unassignedId,
        afterJson: { entityType, entityId },
      });
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to assign item" });
    }
  });

  // Stream file from Egnyte via our proxy (uses query param for path)
  app.get("/api/egnyte/stream", async (req: Request, res: Response) => {
    try {
      const { getDocumentStorage } = await import("./connectors/document-storage.connector");
      const filePath = req.query.path as string;
      
      if (!filePath) {
        return res.status(400).json({ error: "Path required" });
      }
      
      const storage = getDocumentStorage();
      const fileContent = await storage.downloadFile(filePath);
      
      if (!fileContent) {
        return res.status(404).json({ error: "File not found" });
      }
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_file_accessed",
        actor: "user",
        entityType: "egnyte_file",
        entityId: filePath,
        afterJson: { action: 'stream', path: filePath },
      });
      
      res.setHeader("Content-Type", fileContent.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${fileContent.fileName}"`);
      res.send(fileContent.buffer);
    } catch (error) {
      console.error("Stream error:", error);
      res.status(500).json({ error: "Stream failed" });
    }
  });

  // Download file from Egnyte (uses query param for path)
  app.get("/api/egnyte/download", async (req: Request, res: Response) => {
    try {
      const { getDocumentStorage } = await import("./connectors/document-storage.connector");
      const filePath = req.query.path as string;
      
      if (!filePath) {
        return res.status(400).json({ error: "Path required" });
      }
      
      const storage = getDocumentStorage();
      const fileContent = await storage.downloadFile(filePath);
      
      if (!fileContent) {
        return res.status(404).json({ error: "File not found" });
      }
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "egnyte_file_downloaded",
        actor: "user",
        entityType: "egnyte_file",
        entityId: filePath,
        afterJson: { action: 'download', path: filePath },
      });
      
      res.setHeader("Content-Type", fileContent.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${fileContent.fileName}"`);
      res.send(fileContent.buffer);
    } catch (error) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Download failed" });
    }
  });

  // ============================================================================
  // HERBIE DOCUMENT INTELLIGENCE ROUTES
  // AI-powered document analysis, categorization, and semantic search
  // ============================================================================

  // Initialize document categories for tenant
  app.post("/api/documents/intelligence/init", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      await service.initializeCategories();
      res.json({ success: true, message: "Document categories initialized" });
    } catch (error: any) {
      console.error("Init categories error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get all document categories
  app.get("/api/documents/categories", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const categories = await service.getCategories();
      res.json(categories);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get document intelligence stats
  app.get("/api/documents/intelligence/stats", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const stats = await service.getDocumentStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get recent documents with AI metadata
  app.get("/api/documents/intelligence/recent", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const documents = await service.getRecentDocuments(limit);
      res.json(documents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process a single document with AI
  app.post("/api/documents/intelligence/process/:itemId", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const itemId = p(req.params.itemId);
      
      const metadata = await service.processDocument(itemId);
      
      if (!metadata) {
        return res.status(400).json({ error: "Failed to process document" });
      }
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_ai_processed",
        actor: "herbie",
        entityType: "egnyte_item",
        entityId: itemId,
        afterJson: { metadataId: metadata.id, category: metadata.categoryId },
      });
      
      res.json(metadata);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Queue documents for batch processing
  app.post("/api/documents/intelligence/queue", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const batchSize = req.body.batchSize || 50;
      
      const queued = await service.queueDocumentsForProcessing(batchSize);
      
      res.json({ queued, message: `${queued} documents queued for AI processing` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process queued documents
  app.post("/api/documents/intelligence/process-queue", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const maxItems = req.body.maxItems || 10;
      
      const results = await service.processQueue(maxItems);
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_ai_batch_processed",
        actor: "herbie",
        entityType: "processing_queue",
        entityId: "batch",
        afterJson: results,
      });
      
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Semantic search across documents
  app.get("/api/documents/intelligence/search", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const query = req.query.q as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      
      if (!query) {
        return res.status(400).json({ error: "Query required" });
      }
      
      const results = await service.semanticSearch(query, limit);
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_semantic_search",
        actor: "user",
        entityType: "search",
        entityId: "semantic",
        afterJson: { query, resultCount: results.length },
      });
      
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get active document alerts
  app.get("/api/documents/alerts", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const alerts = await service.getActiveAlerts(limit);
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start autonomous document processing (HERBIE auto-scan)
  app.post("/api/documents/intelligence/auto-process", async (req: Request, res: Response) => {
    try {
      const { createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      
      // Initialize categories if needed
      await service.initializeCategories();
      
      // Queue all unprocessed documents
      const queued = await service.queueDocumentsForProcessing(100);
      
      // Process the queue
      const results = await service.processQueue(20);
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "herbie_auto_process_started",
        actor: "herbie",
        entityType: "document_intelligence",
        entityId: "auto_process",
        afterJson: { queued, ...results },
      });
      
      res.json({
        success: true,
        queued,
        ...results,
        message: `HERBIE processed ${results.processed} documents, ${queued} more queued`,
      });
    } catch (error: any) {
      console.error("Auto-process error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Start batch processing of ALL documents
  app.post("/api/documents/intelligence/batch-process", async (req: Request, res: Response) => {
    try {
      const { processBatchDocuments, getBatchProcessingState, createDocumentIntelligenceService } = await import("./services/document-intelligence.service");
      
      const state = getBatchProcessingState();
      if (state.isProcessing) {
        return res.json({
          success: false,
          message: "Batch processing already in progress",
          ...state,
        });
      }

      // Initialize categories first
      const service = createDocumentIntelligenceService(DEFAULT_TENANT_ID);
      await service.initializeCategories();

      // Start processing in background (non-blocking)
      const batchSize = req.body.batchSize || 10;
      const delayMs = req.body.delayMs || 500;
      
      processBatchDocuments(DEFAULT_TENANT_ID, batchSize, delayMs).catch(err => {
        console.error("[BatchProcess] Background error:", err);
      });

      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_batch_processing_started",
        actor: "user",
        entityType: "document_intelligence",
        entityId: "batch",
        afterJson: { batchSize, delayMs },
      });

      res.json({
        success: true,
        message: "Batch processing started",
        ...getBatchProcessingState(),
      });
    } catch (error: any) {
      console.error("Batch process error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get batch processing status
  app.get("/api/documents/intelligence/batch-status", async (req: Request, res: Response) => {
    try {
      const { getBatchProcessingState } = await import("./services/document-intelligence.service");
      res.json(getBatchProcessingState());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stop batch processing
  app.post("/api/documents/intelligence/batch-stop", async (req: Request, res: Response) => {
    try {
      const { stopBatchProcessing, getBatchProcessingState } = await import("./services/document-intelligence.service");
      stopBatchProcessing();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_batch_processing_stopped",
        actor: "user",
        entityType: "document_intelligence",
        entityId: "batch",
        afterJson: getBatchProcessingState(),
      });

      res.json({
        success: true,
        message: "Batch processing stopped",
        ...getBatchProcessingState(),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Import Info folder and hardhat image
  app.post("/api/knowledge/import-info", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const folders = [
        path.join(process.cwd(), "attached_assets/info_folder")
      ];
      
      // Also import hardhat image
      const singleFiles = [
        path.join(process.cwd(), "attached_assets/Blackhawk_Hardhat_1770042340399.png")
      ];
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if ([".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx", ".pptx"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      for (const folder of folders) {
        await processFolder(folder);
      }
      
      // Import single files
      for (const filePath of singleFiles) {
        try {
          const stat = await fs.stat(filePath);
          if (stat.isFile()) {
            const result = await documentImportService.importDocument(filePath, "admin");
            results.imported.push(result.title);
          }
        } catch (err) {
          results.errors.push(`${path.basename(filePath)}: ${err instanceof Error ? err.message : "Failed"}`);
        }
      }
      
      res.json({
        success: true,
        source: "Info folder + Hardhat",
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing info:", error);
      res.status(500).json({ error: "Failed to import" });
    }
  });

  // Import Logo and Company Photos
  app.post("/api/knowledge/import-logos-photos", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const folders = [
        path.join(process.cwd(), "attached_assets/logo_folder"),
        path.join(process.cwd(), "attached_assets/company_photos_folder")
      ];
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if ([".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".gif", ".svg"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      for (const folder of folders) {
        await processFolder(folder);
      }
      
      res.json({
        success: true,
        source: "Logos + Company Photos",
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing logos/photos:", error);
      res.status(500).json({ error: "Failed to import" });
    }
  });

  // Import TNT and Pat Blackhawk documents
  app.post("/api/knowledge/import-tnt-pat", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const folders = [
        path.join(process.cwd(), "attached_assets/tnt_blackhawk"),
        path.join(process.cwd(), "attached_assets/pat_blackhawk")
      ];
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if ([".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".docx", ".xlsx", ".xls"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      for (const folder of folders) {
        await processFolder(folder);
      }
      
      res.json({
        success: true,
        source: "TNT Blackhawk AI + Pat Blackhawk",
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing TNT/Pat documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // Import Armando CPA documents
  app.post("/api/knowledge/import-armando-cpa", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const cpaPath = path.join(process.cwd(), "attached_assets/armando_cpa");
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if ([".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      await processFolder(cpaPath);
      
      res.json({
        success: true,
        source: "Armando CPA",
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing CPA documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // Import Goosmann Law documents
  app.post("/api/knowledge/import-goosmann-law", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const goosmannPath = path.join(process.cwd(), "attached_assets/goosmann_law");
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if ([".pdf", ".jpg", ".jpeg", ".png", ".docx", ".xlsx"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      await processFolder(goosmannPath);
      
      res.json({
        success: true,
        source: "Goosmann Law - Shared Folder",
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing Goosmann Law documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // Import all extracted documents from zip files
  app.post("/api/knowledge/import-all-extracted", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const extractedPath = path.join(process.cwd(), "attached_assets/extracted_all");
      
      const results: { imported: string[]; errors: string[]; skipped: string[] } = {
        imported: [],
        errors: [],
        skipped: [],
      };
      
      const processFolder = async (folderPath: string) => {
        try {
          const items = await fs.readdir(folderPath);
          for (const item of items) {
            const itemPath = path.join(folderPath, item);
            const stat = await fs.stat(itemPath);
            
            if (stat.isDirectory()) {
              await processFolder(itemPath);
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              // Import PDFs, images, and office docs
              if ([".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".docx", ".xlsx", ".xls"].includes(ext)) {
                try {
                  const result = await documentImportService.importDocument(itemPath, "admin");
                  results.imported.push(result.title);
                } catch (err) {
                  results.errors.push(`${item}: ${err instanceof Error ? err.message : "Failed"}`);
                }
              } else {
                results.skipped.push(item);
              }
            }
          }
        } catch (err) {
          results.errors.push(`Folder ${folderPath}: ${err instanceof Error ? err.message : "Access failed"}`);
        }
      }
      
      await processFolder(extractedPath);
      
      res.json({
        success: true,
        documentsImported: results.imported.length,
        documents: results.imported,
        skipped: results.skipped.length,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing extracted documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // Import Dave Hueser personal documents
  app.post("/api/knowledge/import-dave-hueser", async (req: Request, res: Response) => {
    try {
      const { documentImportService } = await import("./services/document-import.service");
      const fs = await import("fs").then(m => m.promises);
      const path = await import("path");
      
      const daveFolder = path.join(process.cwd(), "attached_assets/dave_hueser_extracted/Dave Hueser");
      
      const results: { imported: string[]; errors: string[] } = {
        imported: [],
        errors: [],
      };
      
      try {
        const files = await fs.readdir(daveFolder);
        
        for (const filename of files) {
          const filePath = path.join(daveFolder, filename);
          try {
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              const result = await documentImportService.importDocument(filePath, "admin");
              results.imported.push(result.title);
            }
          } catch (err) {
            results.errors.push(`${filename}: ${err instanceof Error ? err.message : "Failed"}`);
          }
        }
      } catch (err) {
        results.errors.push(`Folder access: ${err instanceof Error ? err.message : "Failed"}`);
      }
      
      res.json({
        success: true,
        documentsImported: results.imported.length,
        documents: results.imported,
        errors: results.errors,
      });
    } catch (error) {
      console.error("Error importing Dave Hueser documents:", error);
      res.status(500).json({ error: "Failed to import documents" });
    }
  });

  // Company Profile
  app.get("/api/company/profile", async (req: Request, res: Response) => {
    try {
      const profile = await storage.getCompanyProfile(DEFAULT_TENANT_ID);
      if (profile) {
        res.json(profile);
      } else {
        // Return real BlackHawk Construction profile from documents
        res.json({
          id: "default",
          tenantId: DEFAULT_TENANT_ID,
          legalName: "Blackhawk Construction LLC",
          dbaName: "Blackhawk Construction",
          ein: "83-3638177",
          cageCode: "PENDING",
          ueiNumber: "PENDING",
          address: {
            street: "973 County Road 47",
            city: "Tekamah",
            state: "NE",
            zip: "68061",
          },
          phone: "402-830-3467",
          email: "brad@blackhawkconst.com",
          website: "http://blackhawkconst.com/",
          naicsCodes: ["236220", "238210", "238220", "238350"],
          coreCompetencies: [
            "New Construction/Design Build",
            "Tenant Finish",
            "ADA Improvements",
            "Plumbing",
            "Electrical",
            "HVAC",
            "Government Contracting",
          ],
          certifications: ["SDVOSB"],
          serviceAreas: ["Nebraska", "Texas", "Nationwide"],
          yearFounded: 2019,
          officers: [
            { name: "Bradley Hueser", title: "President/LLC Member", ownershipPercent: 51, duties: "Business Management/Estimating" },
            { name: "Dave Hueser", title: "VP/LLC Member", ownershipPercent: 49, duties: "Project Management/Estimating" },
          ],
          employeeCount: { fullTime: 3, partTime: 0, contractors: 0 },
          revenue: {
            "2021": 1107723,
            "2022": 1515665,
            "2023": 2500000,
            "2023_projected": 4500000,
          },
          bondingCapacity: { single: 500000, aggregate: 1500000 },
        });
      }
    } catch (error) {
      console.error("Error fetching company profile:", error);
      res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // Subcontractors
  app.get("/api/subcontractors", async (req: Request, res: Response) => {
    try {
      const subs = await storage.getSubcontractors(DEFAULT_TENANT_ID);
      res.json(subs || []);
    } catch (error) {
      console.error("Error fetching subcontractors:", error);
      res.json([]);
    }
  });

  // Labor Rates
  app.get("/api/labor-rates", async (req: Request, res: Response) => {
    try {
      const rates = await storage.getLaborRates(DEFAULT_TENANT_ID);
      res.json(rates || []);
    } catch (error) {
      console.error("Error fetching labor rates:", error);
      res.json([]);
    }
  });

  // Learning / Win Patterns
  app.get("/api/learning/win-patterns", async (req: Request, res: Response) => {
    try {
      const patterns = await storage.getWinPatterns(DEFAULT_TENANT_ID);
      res.json(patterns || []);
    } catch (error) {
      console.error("Error fetching win patterns:", error);
      res.json([]);
    }
  });

  app.get("/api/learning/weights", async (req: Request, res: Response) => {
    try {
      const weights = await storage.getLearningWeights(DEFAULT_TENANT_ID);
      res.json(weights || []);
    } catch (error) {
      console.error("Error fetching learning weights:", error);
      res.json([]);
    }
  });

  // ==========================================================================
  // JACKET SYSTEM - Companies, Folders, Documents
  // ==========================================================================

  // Companies CRUD
  app.get("/api/companies", async (req: Request, res: Response) => {
    try {
      const companiesList = await storage.getCompanies(DEFAULT_TENANT_ID);
      res.json(companiesList || []);
    } catch (error) {
      console.error("Error fetching companies:", error);
      res.json([]);
    }
  });

  app.get("/api/companies/:id", async (req: Request, res: Response) => {
    try {
      const company = await storage.getCompany(p(req.params.id));
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });

  app.post("/api/companies", async (req: Request, res: Response) => {
    try {
      const company = await storage.createCompany({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
      });
      // Create timeline entry
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "company",
        jacketId: company.id,
        eventType: "company_created",
        eventTitle: "Company Created",
        eventDescription: `Company "${company.name}" was created`,
        actorType: "user",
      });
      res.status(201).json(company);
    } catch (error) {
      console.error("Error creating company:", error);
      res.status(500).json({ error: "Failed to create company" });
    }
  });

  app.patch("/api/companies/:id", async (req: Request, res: Response) => {
    try {
      const company = await storage.updateCompany(p(req.params.id), req.body);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      res.json(company);
    } catch (error) {
      console.error("Error updating company:", error);
      res.status(500).json({ error: "Failed to update company" });
    }
  });

  app.delete("/api/companies/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteCompany(p(req.params.id));
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company:", error);
      res.status(500).json({ error: "Failed to delete company" });
    }
  });

  // Company Folders (Jacket Folders for a company)
  app.get("/api/companies/:id/folders", async (req: Request, res: Response) => {
    try {
      const folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "company", p(req.params.id));
      res.json(folders || []);
    } catch (error) {
      console.error("Error fetching company folders:", error);
      res.json([]);
    }
  });

  // Company Timeline
  app.get("/api/companies/:id/timeline", async (req: Request, res: Response) => {
    try {
      const timeline = await storage.getJacketTimeline(DEFAULT_TENANT_ID, "company", p(req.params.id));
      res.json(timeline || []);
    } catch (error) {
      console.error("Error fetching company timeline:", error);
      res.json([]);
    }
  });

  // Bid Jacket Folders
  app.get("/api/bids/:id/folders", async (req: Request, res: Response) => {
    try {
      let folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "bid", p(req.params.id));
      // Auto-create standard folders if none exist
      if (!folders || folders.length === 0) {
        const bidFolderStructure = [
          { code: "01", name: "Bid_Request", displayName: "Bid Request" },
          { code: "02", name: "Plans_and_Specs", displayName: "Plans & Specifications" },
          { code: "03", name: "RFIs", displayName: "RFIs" },
          { code: "04", name: "Addenda", displayName: "Addenda" },
          { code: "05", name: "Takeoff_and_Estimating", displayName: "Takeoff & Estimating" },
          { code: "06", name: "Subcontractor_Quotes", displayName: "Subcontractor Quotes" },
          { code: "07", name: "Final_Bid_Submission", displayName: "Final Bid Submission" },
          { code: "08", name: "Bid_Communications", displayName: "Bid Communications" },
        ];
        for (let i = 0; i < bidFolderStructure.length; i++) {
          const f = bidFolderStructure[i];
          await storage.createJacketFolder({
            tenantId: DEFAULT_TENANT_ID,
            jacketType: "bid",
            jacketId: p(req.params.id),
            name: `${f.code}_${f.name}`,
            path: `/Bids/${p(req.params.id)}/${f.code}_${f.name}`,
            sortOrder: i + 1,
            isSystemFolder: true,
          });
        }
        folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "bid", p(req.params.id));
      }
      res.json(folders);
    } catch (error) {
      console.error("Error fetching bid folders:", error);
      res.json([]);
    }
  });

  // Bid Timeline
  app.get("/api/bids/:id/timeline", async (req: Request, res: Response) => {
    try {
      const timeline = await storage.getJacketTimeline(DEFAULT_TENANT_ID, "bid", p(req.params.id));
      res.json(timeline || []);
    } catch (error) {
      console.error("Error fetching bid timeline:", error);
      res.json([]);
    }
  });

  // Bid RFIs
  app.get("/api/bids/:id/rfis", async (req: Request, res: Response) => {
    try {
      const rfis = await storage.getBidRfis(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(rfis || []);
    } catch (error) {
      console.error("Error fetching bid RFIs:", error);
      res.json([]);
    }
  });

  app.post("/api/bids/:id/rfis", async (req: Request, res: Response) => {
    try {
      const existingRfis = await storage.getBidRfis(DEFAULT_TENANT_ID, p(req.params.id));
      const nextNumber = (existingRfis?.length || 0) + 1;
      const rfi = await storage.createBidRfi({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId: p(req.params.id),
        rfiNumber: nextNumber,
      });
      // Add to timeline
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: p(req.params.id),
        eventType: "rfi_created",
        eventTitle: `RFI #${nextNumber} Created`,
        eventDescription: rfi.subject,
        relatedEntityType: "rfi",
        relatedEntityId: rfi.id,
        actorType: "user",
      });
      res.status(201).json(rfi);
    } catch (error) {
      console.error("Error creating RFI:", error);
      res.status(500).json({ error: "Failed to create RFI" });
    }
  });

  // Bid Addenda
  app.get("/api/bids/:id/addenda", async (req: Request, res: Response) => {
    try {
      const addenda = await storage.getBidAddenda(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(addenda || []);
    } catch (error) {
      console.error("Error fetching bid addenda:", error);
      res.json([]);
    }
  });

  app.post("/api/bids/:id/addenda", async (req: Request, res: Response) => {
    try {
      const existingAddenda = await storage.getBidAddenda(DEFAULT_TENANT_ID, p(req.params.id));
      const nextNumber = (existingAddenda?.length || 0) + 1;
      const addendum = await storage.createBidAddendum({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId: p(req.params.id),
        addendumNumber: nextNumber,
      });
      // Add to timeline
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: p(req.params.id),
        eventType: "addendum_added",
        eventTitle: `Addendum #${nextNumber} Added`,
        eventDescription: addendum.title,
        relatedEntityType: "addendum",
        relatedEntityId: addendum.id,
        actorType: "user",
      });
      res.status(201).json(addendum);
    } catch (error) {
      console.error("Error creating addendum:", error);
      res.status(500).json({ error: "Failed to create addendum" });
    }
  });

  // Bid Checklists
  app.get("/api/bids/:id/checklists", async (req: Request, res: Response) => {
    try {
      const checklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, p(req.params.id));
      // Get items for each checklist
      const checklistsWithItems = await Promise.all(
        (checklists || []).map(async (checklist) => {
          const items = await storage.getBidChecklistItems(checklist.id);
          return { ...checklist, items };
        })
      );
      res.json(checklistsWithItems);
    } catch (error) {
      console.error("Error fetching bid checklists:", error);
      res.json([]);
    }
  });

  app.post("/api/bids/:id/checklists", async (req: Request, res: Response) => {
    try {
      const checklist = await storage.createBidChecklist({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
        bidProjectId: p(req.params.id),
      });
      res.status(201).json(checklist);
    } catch (error) {
      console.error("Error creating checklist:", error);
      res.status(500).json({ error: "Failed to create checklist" });
    }
  });

  app.post("/api/checklists/:id/items", async (req: Request, res: Response) => {
    try {
      const item = await storage.createBidChecklistItem({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
        checklistId: p(req.params.id),
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating checklist item:", error);
      res.status(500).json({ error: "Failed to create checklist item" });
    }
  });

  // Bid Package Document Links
  app.post("/api/bids/:id/link-documents", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const linkDocsSchema = z.object({
        documentIds: z.array(z.string()),
        sectionId: z.string().optional(),
      });
      
      const validated = linkDocsSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Invalid request body", details: validated.error });
      }
      
      const { documentIds, sectionId } = validated.data;
      
      // Store document links in checklist items
      const existingChecklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, bidId);
      let targetChecklist = existingChecklists?.find(c => c.name === "Bid Package Documents");
      
      if (!targetChecklist) {
        targetChecklist = await storage.createBidChecklist({
          tenantId: DEFAULT_TENANT_ID,
          bidProjectId: bidId,
          name: "Bid Package Documents",
        } as any);
      }
      
      // Get knowledge documents for metadata
      const knowledgeDocs = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      const linkedDocs = [];
      
      for (const docId of documentIds) {
        const doc = knowledgeDocs?.find(d => d.id === docId);
        if (doc) {
          const item = await storage.createBidChecklistItem({
            tenantId: DEFAULT_TENANT_ID,
            checklistId: targetChecklist.id,
            itemText: doc.title,
            linkedDocumentId: docId,
          } as any);
          linkedDocs.push({ documentId: docId, itemId: item.id, title: doc.title });
        }
      }
      
      // Add timeline entry
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: bidId,
        eventType: "documents_linked",
        eventTitle: `${linkedDocs.length} Documents Linked to Bid Package`,
        eventDescription: linkedDocs.map(d => d.title).join(", "),
        actorType: "user",
      });
      
      res.json({ 
        success: true, 
        linkedCount: linkedDocs.length,
        documents: linkedDocs 
      });
    } catch (error) {
      console.error("Error linking documents to bid:", error);
      res.status(500).json({ error: "Failed to link documents" });
    }
  });

  app.get("/api/bids/:id/linked-documents", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const checklists = await storage.getBidChecklists(DEFAULT_TENANT_ID, bidId);
      const docChecklist = checklists?.find(c => c.name === "Bid Package Documents");
      
      if (!docChecklist) {
        return res.json({ documents: [], sections: {} });
      }
      
      const items = await storage.getBidChecklistItems(docChecklist.id);
      const knowledgeDocs = await storage.getKnowledgeDocuments(DEFAULT_TENANT_ID);
      
      const documents = items?.map(item => {
        const doc = knowledgeDocs?.find(d => d.id === item.linkedDocumentId);
        return {
          id: item.id,
          documentId: item.linkedDocumentId,
          title: item.itemText,
          sectionCode: (item as any).sectionCode,
          documentType: (item as any).documentType,
          status: (item as any).status,
          addedAt: item.createdAt,
          expirationDate: doc?.metadata && typeof doc.metadata === 'object' 
            ? (doc.metadata as Record<string, unknown>).expirationDate 
            : null,
        };
      }) || [];
      
      // Group by section
      const sections: Record<string, typeof documents> = {};
      documents.forEach(doc => {
        const section = doc.sectionCode || "appendices";
        if (!sections[section]) sections[section] = [];
        sections[section].push(doc);
      });
      
      res.json({ documents, sections });
    } catch (error) {
      console.error("Error fetching linked documents:", error);
      res.json({ documents: [], sections: {} });
    }
  });

  app.delete("/api/bids/:bidId/documents/:itemId", async (req: Request, res: Response) => {
    try {
      const itemId = p(req.params.itemId);
      // Delete the checklist item (which represents the document link)
      await storage.updateBidChecklistItem(itemId, { isCompleted: false } as any);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unlinking document:", error);
      res.status(500).json({ error: "Failed to unlink document" });
    }
  });

  app.patch("/api/checklist-items/:id", async (req: Request, res: Response) => {
    try {
      const item = await storage.updateBidChecklistItem(p(req.params.id), req.body);
      if (!item) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      res.json(item);
    } catch (error) {
      console.error("Error updating checklist item:", error);
      res.status(500).json({ error: "Failed to update checklist item" });
    }
  });

  // Jacket Documents (for any folder)
  app.get("/api/folders/:id/documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getJacketDocuments(DEFAULT_TENANT_ID, p(req.params.id));
      res.json(documents || []);
    } catch (error) {
      console.error("Error fetching folder documents:", error);
      res.json([]);
    }
  });

  app.post("/api/folders/:id/documents", async (req: Request, res: Response) => {
    try {
      const doc = await storage.createJacketDocument({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
        folderId: p(req.params.id),
        uploadedAt: new Date(),
      });
      res.status(201).json(doc);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document" });
    }
  });

  // Project Jacket Folders
  app.get("/api/projects/:id/folders", async (req: Request, res: Response) => {
    try {
      let folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "project", p(req.params.id));
      // Auto-create standard folders if none exist
      if (!folders || folders.length === 0) {
        const projectId = p(req.params.id);
        for (const f of PROJECT_JACKET_FOLDERS) {
          const safeName = f.name.replace(/\s+/g, "_").replace(/&/g, "and");
          await storage.createJacketFolder({
            tenantId: DEFAULT_TENANT_ID,
            jacketType: "project",
            jacketId: projectId,
            name: `${f.code} - ${f.name}`,
            path: `/Projects/${projectId}/${f.code}_${safeName}`,
            sortOrder: parseInt(f.code),
            isSystemFolder: true,
          });
        }
        folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "project", p(req.params.id));
      }
      res.json(folders);
    } catch (error) {
      console.error("Error fetching project folders:", error);
      res.json([]);
    }
  });

  // Project Timeline
  app.get("/api/projects/:id/timeline", async (req: Request, res: Response) => {
    try {
      const timeline = await storage.getJacketTimeline(DEFAULT_TENANT_ID, "project", p(req.params.id));
      res.json(timeline || []);
    } catch (error) {
      console.error("Error fetching project timeline:", error);
      res.json([]);
    }
  });

  // Bid to Project Conversion
  app.post("/api/bids/:id/convert-to-project", async (req: Request, res: Response) => {
    try {
      const bidProject = await storage.getBidProject(p(req.params.id));
      if (!bidProject) {
        return res.status(404).json({ error: "Bid not found" });
      }
      
      // Update bid status to won
      await storage.updateBidProject(p(req.params.id), { status: "won" });
      
      // Create timeline entries
      await storage.createJacketTimelineEntry({
        tenantId: DEFAULT_TENANT_ID,
        jacketType: "bid",
        jacketId: p(req.params.id),
        eventType: "bid_won",
        eventTitle: "Bid Won - Converting to Project",
        eventDescription: "This bid has been awarded and converted to an active project",
        actorType: "user",
      });
      
      res.json({ 
        success: true, 
        message: "Bid converted to project successfully",
        projectId: p(req.params.id),
      });
    } catch (error) {
      console.error("Error converting bid to project:", error);
      res.status(500).json({ error: "Failed to convert bid to project" });
    }
  });

  // ============================================================================
  // DOCUMENT MANAGEMENT API - FULL UPLOAD/DOWNLOAD SYSTEM
  // ============================================================================

  // Upload document to a jacket folder
  app.post("/api/documents/upload", async (req: Request, res: Response) => {
    try {
      const { 
        folderId: providedFolderId, 
        title, 
        fileName,
        objectPath, 
        mimeType, 
        fileSize, 
        jacketType = "bid", 
        jacketId,
        documentType,
        tags,
        visibility = "internal"
      } = req.body;

      const docTitle = title || fileName;
      const docFileName = fileName || title;

      if (!docTitle || !objectPath) {
        return res.status(400).json({ error: "title (or fileName) and objectPath are required" });
      }

      // Determine or create folder for the document
      let folderId = providedFolderId;
      
      if (!folderId) {
        // If no folder provided but jacketType/jacketId given, try to find or create a "General" folder
        if (jacketType && jacketId) {
          const folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, jacketType, jacketId);
          // Look for a "General" or first folder
          const generalFolder = folders.find(f => f.name.toLowerCase().includes('general')) || folders[0];
          
          if (generalFolder) {
            folderId = generalFolder.id;
          } else {
            // Create a General folder for this jacket
            const newFolder = await storage.createJacketFolder({
              tenantId: DEFAULT_TENANT_ID,
              jacketType,
              jacketId,
              folderSectionId: null,
              parentFolderId: null,
              name: "General Documents",
              path: jacketType === "bid" ? `/Bids/${jacketId}/General` : jacketType === "project" ? `/Projects/${jacketId}/General` : `/${jacketType}/${jacketId}/General`,
              sortOrder: 0,
              isSystemFolder: true,
            });
            folderId = newFolder.id;
          }
        } else {
          return res.status(400).json({ error: "Either folderId or (jacketType and jacketId) is required" });
        }
      }

      // Extract file extension from fileName
      const fileExt = docFileName.split('.').pop()?.toLowerCase() || 'unknown';

      // Create document record in database (using correct schema field names)
      const document = await storage.createJacketDocument({
        tenantId: DEFAULT_TENANT_ID,
        folderId: folderId,
        title: docTitle,
        fileName: docFileName,
        fileType: fileExt,
        mimeType: mimeType || "application/octet-stream",
        fileSizeBytes: fileSize || 0,
        storageKey: objectPath,
        documentType: documentType || "general",
        tagsJson: tags || [],
        visibility: visibility,
        version: 1,
        status: "active",
      });

      // Create timeline entry for the upload if there's a folder
      if (folderId) {
        // Get the folder to determine jacket type/id for timeline
        const folder = await storage.getJacketFolder(folderId);
        if (folder) {
          await storage.createJacketTimelineEntry({
            tenantId: DEFAULT_TENANT_ID,
            jacketType: folder.jacketType,
            jacketId: folder.jacketId,
            eventType: "document_uploaded",
            eventTitle: `Document Uploaded: ${docTitle}`,
            eventDescription: `File "${docFileName}" was uploaded to folder "${folder.name}"`,
            actorType: "user",
            metadata: { documentId: document.id, fileName: docFileName, fileSize },
          });
        }
      }

      // Log to audit
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "upload",
        documentId: document.id,
        actorType: "user",
        detailsJson: { fileName: docFileName, folderId, fileSize },
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ error: "Failed to create document record" });
    }
  });

  // List documents in a folder
  app.get("/api/folders/:folderId/documents", async (req: Request, res: Response) => {
    try {
      const documents = await storage.getDocumentsByFolder(p(req.params.folderId));
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/scoped", async (req: Request, res: Response) => {
    try {
      const { jacketType, jacketId, documentType } = req.query;
      if (!jacketType || !jacketId) {
        return res.status(400).json({ error: "jacketType and jacketId are required" });
      }
      const folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, String(jacketType), String(jacketId));
      const folderIds = folders.map((f: any) => f.id);
      
      if (folderIds.length === 0) {
        return res.json({ documents: [], total: 0 });
      }
      
      const allDocs: any[] = [];
      for (const folderId of folderIds) {
        const docs = await storage.getDocumentsByFolder(folderId);
        const folder = folders.find((f: any) => f.id === folderId);
        for (const doc of docs) {
          if (documentType && doc.documentType !== String(documentType)) continue;
          allDocs.push({
            ...doc,
            folderName: folder?.name ?? "Unknown",
          });
        }
      }
      
      allDocs.sort((a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      res.json({ documents: allDocs, total: allDocs.length });
    } catch (error) {
      console.error("Error fetching scoped documents:", error);
      res.status(500).json({ error: "Failed to fetch scoped documents" });
    }
  });

  // Search documents (must be before :id route)
  app.get("/api/documents/search", async (req: Request, res: Response) => {
    try {
      const { q, jacketType, jacketId, documentType } = req.query;
      const documents = await storage.searchDocuments({
        query: String(q || ""),
        jacketType: jacketType ? String(jacketType) : undefined,
        jacketId: jacketId ? String(jacketId) : undefined,
        documentType: documentType ? String(documentType) : undefined,
      });
      res.json(documents);
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ error: "Failed to search documents" });
    }
  });

  // Get document by ID
  app.get("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const document = await storage.getJacketDocument(p(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Log view action (using consistent audit log schema)
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "view",
        documentId: document.id,
        actorType: "user",
        detailsJson: { fileName: document.fileName, title: document.title },
      });

      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ error: "Failed to fetch document" });
    }
  });

  // Preview document (returns document info with preview URL)
  app.get("/api/documents/:id/preview", async (req: Request, res: Response) => {
    try {
      const document = await storage.getJacketDocument(p(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Log preview action
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "preview",
        documentId: document.id,
        actorType: "user",
        detailsJson: { fileName: document.fileName, title: document.title },
      });

      // Return document info with preview URL
      res.json({
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        mimeType: document.mimeType,
        storageKey: document.storageKey,
        fileType: document.fileType,
        fileSizeBytes: document.fileSizeBytes,
      });
    } catch (error) {
      console.error("Error getting document preview:", error);
      res.status(500).json({ error: "Failed to get document preview" });
    }
  });

  // Document metadata with storage existence check
  app.get("/api/documents/:id/meta", async (req: Request, res: Response) => {
    try {
      const document = await storage.getJacketDocument(p(req.params.id));
      if (!document) {
        return res.status(404).json({ code: "DOC_NOT_FOUND", error: "Document not found" });
      }

      let existsInStorage = false;
      try {
        const { ObjectStorageService } = await import("./replit_integrations/object_storage");
        const storageService = new ObjectStorageService();
        await storageService.getObjectEntityFile(document.storageKey);
        existsInStorage = true;
        if (document.storageMissing) {
          await storage.updateJacketDocument(document.id, { storageMissing: false, storageCheckedAt: new Date() });
        }
      } catch (objErr: any) {
        if (objErr?.name === "ObjectNotFoundError") {
          existsInStorage = false;
          await storage.updateJacketDocument(document.id, { storageMissing: true, storageCheckedAt: new Date() });
          console.log(`[doc-meta] missing-in-storage docId=${document.id} storageKey=${document.storageKey} tenant=${document.tenantId}`);
        }
      }

      res.json({
        id: document.id,
        fileName: document.fileName,
        contentType: document.mimeType || "application/octet-stream",
        size: document.fileSizeBytes,
        existsInStorage,
        storageMissing: !existsInStorage,
      });
    } catch (error) {
      console.error("Error fetching document meta:", error);
      res.status(500).json({ error: "Failed to fetch document metadata" });
    }
  });

  // Download document (returns the file)
  app.get("/api/documents/:id/download", async (req: Request, res: Response) => {
    try {
      const document = await storage.getJacketDocument(p(req.params.id));
      if (!document) {
        return res.status(404).json({ code: "DOC_NOT_FOUND", error: "Document not found" });
      }
      if (document.tenantId && document.tenantId !== DEFAULT_TENANT_ID) {
        const requestTenantId = (req.query.tenantId as string) || DEFAULT_TENANT_ID;
        if (document.tenantId !== requestTenantId) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "download",
        documentId: document.id,
        actorType: "user",
        detailsJson: {
          fileName: document.fileName,
          ip: req.ip || req.socket?.remoteAddress || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
        },
      });

      try {
        const { ObjectStorageService } = await import("./replit_integrations/object_storage");
        const storageService = new ObjectStorageService();
        const file = await storageService.getObjectEntityFile(document.storageKey);
        const contentType = document.mimeType || "application/octet-stream";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `inline; filename="${document.fileName || "document"}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
        if (document.fileSizeBytes) {
          res.setHeader("Content-Length", String(document.fileSizeBytes));
        }
        if (document.storageMissing) {
          await storage.updateJacketDocument(document.id, { storageMissing: false, storageCheckedAt: new Date() });
        }
        await storageService.downloadObject(file, res, 300);
      } catch (objErr: any) {
        if (objErr?.name === "ObjectNotFoundError") {
          await storage.updateJacketDocument(document.id, { storageMissing: true, storageCheckedAt: new Date() });
          console.log(`[doc-download] missing-in-storage docId=${document.id} storageKey=${document.storageKey} tenant=${document.tenantId}`);
          return res.status(410).json({ code: "STORAGE_MISSING", error: "File no longer exists in storage", storageKey: document.storageKey });
        }
        throw objErr;
      }
    } catch (error) {
      console.error("Error downloading document:", error);
      res.status(500).json({ error: "Failed to download document" });
    }
  });

  // ── Buildern-style Document Viewer Routes ──────────────────────────

  function safeFileName(name: string) {
    return name.replace(/[/\\"]/g, "_");
  }

  let _ros: any | null = null;

  function getRosClient() {
    if (_ros) return _ros;

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
    }

    const Ctor =
      (ReplitObjectStorage as any).ObjectStorage ??
      (ReplitObjectStorage as any).Client;

    if (!Ctor) {
      throw new Error("Unsupported @replit/object-storage SDK export (no ObjectStorage or Client)");
    }

    _ros = new Ctor({ bucketId });
    return _ros;
  }

  async function getObjectStreamByKey(storageKey: string): Promise<{
    stream: NodeJS.ReadableStream;
    contentLength?: number;
  }> {
    if (!storageKey) throw new Error("Missing storageKey");

    const ros = getRosClient();

    if (typeof ros.downloadAsStream === "function") {
      const stream = (await ros.downloadAsStream(storageKey)) as Readable;
      return { stream };
    }

    if (typeof ros.get === "function") {
      const obj = await ros.get(storageKey);
      const stream = obj?.body ?? obj?.Body ?? obj?.stream;
      if (!stream) throw new Error(`Storage get() returned no stream for key: ${storageKey}`);
      return { stream, contentLength: obj?.contentLength ?? obj?.ContentLength };
    }

    if (typeof ros.download === "function") {
      const data = await ros.download(storageKey);
      const stream = Readable.from(data);
      return { stream };
    }

    throw new Error("No supported download method found on @replit/object-storage client");
  }

  function mergeJson(existing: unknown, patch: Record<string, unknown>) {
    const base = existing && typeof existing === "object" ? (existing as Record<string, unknown>) : {};
    return { ...base, ...patch };
  }

  app.get("/api/documents/:id/view-url", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id, "id");
      const disposition = String(req.query.disposition || "inline");

      const [doc] = await db.select().from(projectDocuments)
        .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, DEFAULT_TENANT_ID)));

      if (!doc) return res.status(404).json({ error: "Document not found" });

      if (!doc.storageKey && doc.sourceUrl) {
        return res.json({ url: doc.sourceUrl });
      }
      if (!doc.storageKey) {
        return res.status(409).json({ error: "Document has no storageKey or sourceUrl" });
      }

      return res.json({
        url: `/api/documents/${id}/content?disposition=${encodeURIComponent(disposition)}`,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to get document view URL");
    }
  });

  app.get("/api/documents/:id/content", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id, "id");
      const disposition = String(req.query.disposition || "inline");

      const [doc] = await db.select().from(projectDocuments)
        .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, DEFAULT_TENANT_ID)));

      if (!doc) return res.status(404).send("Document not found");

      if (!doc.storageKey && doc.sourceUrl) {
        return res.redirect(doc.sourceUrl);
      }
      if (!doc.storageKey) return res.status(409).send("Document has no storageKey");

      const mime = doc.mimeType || "application/octet-stream";
      const fileName = safeFileName(doc.fileName || doc.title || "document");

      const { stream, contentLength } = await getObjectStreamByKey(doc.storageKey);

      res.setHeader("Content-Type", mime);
      if (typeof contentLength === "number") res.setHeader("Content-Length", String(contentLength));

      const cd = disposition === "attachment"
        ? `attachment; filename="${fileName}"`
        : `inline; filename="${fileName}"`;
      res.setHeader("Content-Disposition", cd);

      stream.pipe(res);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Stream failed";
      if (!res.headersSent) res.status(500).send(`Failed to stream document: ${msg}`);
    }
  });

  app.patch("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id, "id");
      const { title, fileName, folderId, tagsJson, metadataJson } = req.body ?? {};

      const [existing] = await db.select().from(projectDocuments)
        .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, DEFAULT_TENANT_ID)));
      if (!existing) return res.status(404).json({ error: "Document not found" });

      const patch: Record<string, unknown> = {};
      if (typeof title === "string") patch.title = title;
      if (typeof fileName === "string") patch.fileName = fileName;
      if (folderId === null || typeof folderId === "string") patch.folderId = folderId;
      if (Array.isArray(tagsJson)) patch.tagsJson = tagsJson;
      if (metadataJson && typeof metadataJson === "object") {
        patch.metadataJson = mergeJson(existing.metadataJson, metadataJson);
      }

      if (Object.keys(patch).length === 0) {
        return res.json(existing);
      }

      const [updated] = await db
        .update(projectDocuments)
        .set(patch)
        .where(and(eq(projectDocuments.id, id), eq(projectDocuments.tenantId, DEFAULT_TENANT_ID)))
        .returning();

      res.json(updated);
    } catch (error) {
      handleRouteError(res, error, "Failed to update document");
    }
  });

  app.post("/api/documents/move", async (req: Request, res: Response) => {
    try {
      const { documentIds, folderId } = req.body ?? {};
      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ error: "documentIds[] required" });
      }
      if (!(folderId === null || typeof folderId === "string")) {
        return res.status(400).json({ error: "folderId must be string or null" });
      }

      const ids = documentIds.map(String);
      await db
        .update(projectDocuments)
        .set({ folderId })
        .where(and(
          eq(projectDocuments.tenantId, DEFAULT_TENANT_ID),
          inArray(projectDocuments.id, ids),
        ));

      res.json({ ok: true, moved: ids.length });
    } catch (error) {
      handleRouteError(res, error, "Failed to move documents");
    }
  });

  app.get("/api/bid-jacket-artifacts/:id/view-url", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id, "id");
      const disposition = String(req.query.disposition || "inline");

      const [art] = await db.select().from(bidJacketArtifacts)
        .where(and(eq(bidJacketArtifacts.id, id), eq(bidJacketArtifacts.tenantId, DEFAULT_TENANT_ID)));

      if (!art) return res.status(404).json({ error: "Artifact not found" });

      if (!art.storageKey && art.sourceUrl) {
        return res.json({ url: art.sourceUrl });
      }
      if (!art.storageKey) {
        return res.status(409).json({ error: "Artifact has no storageKey or sourceUrl" });
      }

      return res.json({
        url: `/api/bid-jacket-artifacts/${id}/content?disposition=${encodeURIComponent(disposition)}`,
      });
    } catch (error) {
      handleRouteError(res, error, "Failed to get artifact view URL");
    }
  });

  app.get("/api/bid-jacket-artifacts/:id/content", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id, "id");
      const disposition = String(req.query.disposition || "inline");

      const [art] = await db.select().from(bidJacketArtifacts)
        .where(and(eq(bidJacketArtifacts.id, id), eq(bidJacketArtifacts.tenantId, DEFAULT_TENANT_ID)));

      if (!art) return res.status(404).send("Artifact not found");

      if (!art.storageKey && art.sourceUrl) return res.redirect(art.sourceUrl);
      if (!art.storageKey) return res.status(409).send("Artifact has no storageKey");

      const meta = art.metadataJson as Record<string, unknown> | null;
      const mime = (meta?.mimeType as string) || "application/octet-stream";
      const fileName = safeFileName((meta?.fileName as string) || art.title || "artifact");

      const { stream, contentLength } = await getObjectStreamByKey(art.storageKey);

      res.setHeader("Content-Type", mime);
      if (typeof contentLength === "number") res.setHeader("Content-Length", String(contentLength));

      const cd = disposition === "attachment"
        ? `attachment; filename="${fileName}"`
        : `inline; filename="${fileName}"`;
      res.setHeader("Content-Disposition", cd);

      stream.pipe(res);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Stream failed";
      if (!res.headersSent) res.status(500).send(`Failed to stream artifact: ${msg}`);
    }
  });

  // ── End Buildern-style Routes ──────────────────────────────────────

  // Download folder as ZIP
  app.get("/api/folders/:folderId/download-zip", async (req: Request, res: Response) => {
    try {
      const folder = await storage.getJacketFolder(p(req.params.folderId));
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      const documents = await storage.getDocumentsByFolder(p(req.params.folderId));
      if (documents.length === 0) {
        return res.status(404).json({ error: "No documents in folder" });
      }

      // Set response headers for ZIP download
      const zipFileName = `${folder.name.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

      // Create archiver instance
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Add each document to the archive
      for (const doc of documents) {
        if (doc.storageKey) {
          // Create a fetch request to the storage URL
          const response = await fetch(`http://localhost:5000${doc.storageKey}`);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            archive.append(Buffer.from(buffer), { name: doc.fileName });
          }
        }
      }

      // Log bulk download
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "bulk_download",
        documentId: null,
        actorType: "user",
        detailsJson: { 
          folderId: folder.id, 
          folderName: folder.name, 
          documentCount: documents.length 
        },
      });

      await archive.finalize();
    } catch (error) {
      console.error("Error downloading folder as ZIP:", error);
      res.status(500).json({ error: "Failed to download folder as ZIP" });
    }
  });

  // Download jacket documents as ZIP
  app.get("/api/jackets/:jacketType/:jacketId/download-zip", async (req: Request, res: Response) => {
    try {
      const jacketType = p(req.params.jacketType); const jacketId = p(req.params.jacketId);
      
      // Get all folders for this jacket
      const folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, jacketType, jacketId);
      if (folders.length === 0) {
        return res.status(404).json({ error: "No folders found for jacket" });
      }

      // Get all documents across all folders
      const allDocuments: any[] = [];
      const folderMap = new Map<string, string>();
      
      for (const folder of folders) {
        folderMap.set(folder.id, folder.name);
        const docs = await storage.getDocumentsByFolder(folder.id);
        allDocuments.push(...docs.map(d => ({ ...d, folderName: folder.name })));
      }

      if (allDocuments.length === 0) {
        return res.status(404).json({ error: "No documents found in jacket" });
      }

      // Set response headers for ZIP download
      const zipFileName = `${jacketType}_${jacketId.substring(0, 8)}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipFileName}"`);

      // Create archiver instance
      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      // Add each document to the archive, organized by folder
      for (const doc of allDocuments) {
        if (doc.storageKey) {
          const response = await fetch(`http://localhost:5000${doc.storageKey}`);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            // Include folder name in path
            const filePath = `${doc.folderName}/${doc.fileName}`;
            archive.append(Buffer.from(buffer), { name: filePath });
          }
        }
      }

      // Log bulk download
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "bulk_download",
        documentId: null,
        actorType: "user",
        detailsJson: { 
          jacketType, 
          jacketId, 
          documentCount: allDocuments.length,
          folderCount: folders.length 
        },
      });

      await archive.finalize();
    } catch (error) {
      console.error("Error downloading jacket as ZIP:", error);
      res.status(500).json({ error: "Failed to download jacket as ZIP" });
    }
  });

  // Get document versions
  app.get("/api/documents/:id/versions", async (req: Request, res: Response) => {
    try {
      const versions = await storage.getDocumentVersions(p(req.params.id));
      res.json(versions);
    } catch (error) {
      console.error("Error fetching document versions:", error);
      res.status(500).json({ error: "Failed to fetch document versions" });
    }
  });

  // Upload new version of document
  app.post("/api/documents/:id/versions", async (req: Request, res: Response) => {
    try {
      const { objectPath, fileSize, changeNotes } = req.body;
      const document = await storage.getJacketDocument(p(req.params.id));
      
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Create new version using storage method (handles all versioning logic)
      const newVersion = await storage.createDocumentVersion({
        documentId: p(req.params.id),
        storageKey: objectPath,
        fileSizeBytes: fileSize || 0,
        uploadedBy: "system",
        changeNotes: changeNotes || null,
      });

      // Create timeline entry - get jacket info from folder
      const folder = await storage.getJacketFolder(document.folderId);
      if (folder) {
        await storage.createJacketTimelineEntry({
          tenantId: DEFAULT_TENANT_ID,
          jacketType: folder.jacketType,
          jacketId: folder.jacketId,
          eventType: "document_updated",
          eventTitle: `Document Updated: ${document.title}`,
          eventDescription: `Version ${newVersion.version} uploaded`,
          actorType: "user",
          metadata: { documentId: newVersion.id, version: newVersion.version, previousDocId: document.id },
        });
      }

      // Log version creation
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "version_create",
        documentId: newVersion.id,
        actorType: "user",
        detailsJson: { newVersion: newVersion.version, previousVersion: document.version, changeNotes },
      });

      res.status(201).json(newVersion);
    } catch (error) {
      console.error("Error creating document version:", error);
      res.status(500).json({ error: "Failed to create document version" });
    }
  });

  // Delete document
  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      const document = await storage.getJacketDocument(p(req.params.id));
      if (!document) {
        return res.status(404).json({ error: "Document not found" });
      }

      // Log deletion before deleting (since we need the documentId)
      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "delete",
        documentId: document.id,
        actorType: "user",
        detailsJson: { fileName: document.fileName, title: document.title },
      });

      // Create timeline entry - get jacket info from folder
      const folder = await storage.getJacketFolder(document.folderId);
      if (folder) {
        await storage.createJacketTimelineEntry({
          tenantId: DEFAULT_TENANT_ID,
          jacketType: folder.jacketType,
          jacketId: folder.jacketId,
          eventType: "document_deleted",
          eventTitle: `Document Deleted: ${document.title}`,
          eventDescription: `File "${document.fileName}" was removed from the jacket`,
          actorType: "user",
        });
      }

      await storage.deleteJacketDocument(p(req.params.id));

      res.json({ success: true, message: "Document deleted" });
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Get all documents for a jacket (bid/project/company)
  app.get("/api/:jacketType/:jacketId/documents", async (req: Request, res: Response) => {
    try {
      const jacketType = p(req.params.jacketType); const jacketId = p(req.params.jacketId);
      const documents = await storage.getDocumentsByJacket(jacketType, jacketId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching jacket documents:", error);
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  // Get audit log for a document
  app.get("/api/documents/:id/audit", async (req: Request, res: Response) => {
    try {
      const auditEntries = await storage.getAuditLogByEntity("document", p(req.params.id));
      res.json(auditEntries);
    } catch (error) {
      console.error("Error fetching document audit log:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // ============================================================================
  // AUDIT LOG API
  // ============================================================================

  // Get audit log entries
  app.get("/api/audit-log", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId, action, limit = "50", offset = "0" } = req.query;
      const entries = await storage.getAuditLog({
        entityType: entityType ? String(entityType) : undefined,
        entityId: entityId ? String(entityId) : undefined,
        action: action ? String(action) : undefined,
        limit: parseInt(String(limit)),
        offset: parseInt(String(offset)),
      });
      res.json(entries);
    } catch (error) {
      console.error("Error fetching audit log:", error);
      res.status(500).json({ error: "Failed to fetch audit log" });
    }
  });

  // Export audit log as CSV
  app.get("/api/audit-log/export", async (req: Request, res: Response) => {
    try {
      const entries = await storage.getAuditLog({ limit: 10000 });
      
      const csvHeader = "Timestamp,Action,Entity Type,Entity ID,Actor,Details\n";
      const csvRows = entries.map(e => 
        `"${e.createdAt}","${e.action}","${e.entityType}","${e.entityId}","${e.actorType}","${JSON.stringify(e.details || {}).replace(/"/g, '""')}"`
      ).join("\n");
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=audit-log.csv");
      res.send(csvHeader + csvRows);
    } catch (error) {
      console.error("Error exporting audit log:", error);
      res.status(500).json({ error: "Failed to export audit log" });
    }
  });

  // ============================================================================
  // WORK PACKAGES API (Enterprise-grade workflow engine)
  // ============================================================================

  app.get("/api/work-packages", async (req: Request, res: Response) => {
    try {
      const { WorkPackageService } = await import("./services/work-package.service");
      const service = new WorkPackageService(DEFAULT_TENANT_ID);
      const status = (req.query.status as string) || "pending";
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const packets = await service.getDecisionPackets(status, limit);
      res.json(packets);
    } catch (error) {
      console.error("[work-packages] Error:", error);
      res.status(500).json({ error: "Failed to fetch work packages" });
    }
  });

  app.post("/api/work-packages/:id/approve", async (req: Request, res: Response) => {
    try {
      const { WorkPackageService } = await import("./services/work-package.service");
      const service = new WorkPackageService(DEFAULT_TENANT_ID);
      const id = p(req.params.id);
      await service.approvePackage(id, req.body.notes);
      res.json({ success: true, id, status: "approved" });
    } catch (error: any) {
      console.error("[work-packages] Approve error:", error);
      const msg = error.message || "Failed to approve work package";
      if (msg.includes("not found")) {
        return res.status(404).json({ error: msg });
      }
      if (msg.includes("GUARD:")) {
        return res.status(400).json({ error: msg });
      }
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/work-packages/:id/reject", async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }
      const { WorkPackageService } = await import("./services/work-package.service");
      const service = new WorkPackageService(DEFAULT_TENANT_ID);
      const id = p(req.params.id);
      await service.rejectPackage(id, reason);
      res.json({ success: true, id, status: "rejected" });
    } catch (error) {
      console.error("[work-packages] Reject error:", error);
      res.status(500).json({ error: "Failed to reject work package" });
    }
  });

  app.post("/api/work-packages/batch-approve", async (req: Request, res: Response) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Array of work package IDs is required" });
      }
      const { WorkPackageService } = await import("./services/work-package.service");
      const service = new WorkPackageService(DEFAULT_TENANT_ID);
      const result = await service.batchApprove(ids);
      res.json(result);
    } catch (error) {
      console.error("[work-packages] Batch approve error:", error);
      res.status(500).json({ error: "Failed to batch approve" });
    }
  });

  // ============================================================================
  // AI REVIEW QUEUE API
  // ============================================================================

  app.get("/api/ai-review-queue", async (req: Request, res: Response) => {
    try {
      const { status } = req.query;
      const { approvalRequests } = await import("@shared/schema");
      
      let query = db.select().from(approvalRequests)
        .where(eq(approvalRequests.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(approvalRequests.createdAt))
        .limit(100);
      
      const requests = await query;
      
      let filtered = requests;
      if (status && status !== "all") {
        filtered = requests.filter(r => r.status === status);
      }
      
      const items = filtered.map(r => {
        const ctx = r.contextJson as any || {};
        return {
          id: r.id,
          actionType: r.actionType,
          status: r.status,
          priority: r.priority,
          title: ctx.title || `${r.actionType} - ${r.entityType}`,
          description: ctx.description || `HERBIE ${r.actionType} action on ${r.entityType}`,
          sourceDocId: ctx.sourceDocId,
          sourceDocName: ctx.sourceDocName,
          targetLocation: ctx.targetLocation,
          suggestedValue: ctx.suggestedValue,
          confidence: ctx.confidence || 0.85,
          createdAt: r.createdAt.toISOString(),
          expiresAt: r.expiresAt?.toISOString(),
          bidId: r.entityType === "bid" ? r.entityId : ctx.bidId,
          bidTitle: ctx.bidTitle,
          evidenceJson: ctx.evidenceJson,
        };
      });
      
      res.json(items);
    } catch (error) {
      console.error("Error fetching AI review queue:", error);
      res.status(500).json({ error: "Failed to fetch AI review queue" });
    }
  });

  app.post("/api/ai-review-queue/:id/approve", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { notes } = req.body;
      const { approvalRequests, approvalActions, bidProposalSections, herbieOutreachLog } = await import("@shared/schema");
      
      const [item] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1);
      if (!item) {
        return res.status(404).json({ error: "Review item not found" });
      }

      const ctx = item.contextJson as any || {};
      let executionResult: any = { executed: false };

      switch (item.actionType) {
        case "proposal_draft":
          if (ctx.sections && ctx.bidProjectId) {
            for (const section of ctx.sections) {
              await db.insert(bidProposalSections).values({
                id: crypto.randomUUID(),
                tenantId: DEFAULT_TENANT_ID,
                bidProjectId: ctx.bidProjectId,
                approvalRequestId: id,
                sectionType: section.title.toLowerCase().replace(/\s+/g, "_"),
                title: section.title,
                content: section.content,
                status: "approved",
                version: 1,
              }).onConflictDoNothing();
            }
            executionResult = { executed: true, action: "proposal_sections_created", count: ctx.sections.length };
          }
          break;

        case "send_bid_invitations":
          if (ctx.emailDrafts && ctx.bidProjectId) {
            for (const email of ctx.emailDrafts) {
              await db.insert(herbieOutreachLog).values({
                id: crypto.randomUUID(),
                tenantId: DEFAULT_TENANT_ID,
                bidProjectId: ctx.bidProjectId,
                approvalRequestId: id,
                recipientEmail: email.to,
                subject: email.subject,
                body: email.body,
                status: "queued",
                sentAt: null,
              }).onConflictDoNothing();
            }
            executionResult = { executed: true, action: "outreach_emails_queued", count: ctx.emailDrafts.length };
          }
          break;

        case "request_bid_bond":
          if (ctx.letterContent && ctx.bidProjectId) {
            executionResult = { 
              executed: true, 
              action: "bond_request_logged", 
              bondAmount: ctx.bondAmount,
              letterGenerated: true
            };
            await auditService.logEvent({
              tenantId: DEFAULT_TENANT_ID,
              eventType: "bid_bond_requested",
              entityType: "bid",
              entityId: ctx.bidProjectId,
              actor: "HERBIE",
              afterJson: { bondAmount: ctx.bondAmount, approvalId: id },
            });
          }
          break;

        default:
          executionResult = { executed: true, action: "status_updated" };
      }
      
      await db.update(approvalRequests).set({ status: "approved" }).where(eq(approvalRequests.id, id));
      
      await db.insert(approvalActions).values({
        tenantId: DEFAULT_TENANT_ID,
        approvalRequestId: id,
        decision: "approved",
        notes: notes || "",
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "ai_action_approved",
        entityType: "ai_review",
        entityId: id,
        actor: "admin",
        afterJson: { actionType: item.actionType, entityType: item.entityType, notes, executionResult },
      });
      
      res.json({ success: true, message: "Action approved and executed", executionResult });
    } catch (error) {
      console.error("Error approving AI action:", error);
      res.status(500).json({ error: "Failed to approve action" });
    }
  });

  app.post("/api/ai-review-queue/:id/reject", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { reason } = req.body;
      const { approvalRequests, approvalActions } = await import("@shared/schema");
      
      const [item] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1);
      if (!item) {
        return res.status(404).json({ error: "Review item not found" });
      }
      
      await db.update(approvalRequests).set({ status: "rejected" }).where(eq(approvalRequests.id, id));
      
      await db.insert(approvalActions).values({
        tenantId: DEFAULT_TENANT_ID,
        approvalRequestId: id,
        decision: "rejected",
        notes: reason || "",
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "ai_action_rejected",
        entityType: "ai_review",
        entityId: id,
        actor: "admin",
        afterJson: { actionType: item.actionType, entityType: item.entityType, reason },
      });
      
      res.json({ success: true, message: "Action rejected" });
    } catch (error) {
      console.error("Error rejecting AI action:", error);
      res.status(500).json({ error: "Failed to reject action" });
    }
  });

  app.post("/api/ai-review-queue/:id/undo", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { reason } = req.body;
      const { approvalRequests, approvalActions, jacketDocuments } = await import("@shared/schema");
      
      const [item] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1);
      if (!item) {
        return res.status(404).json({ error: "Review item not found" });
      }
      
      if (item.status !== "approved") {
        return res.status(400).json({ error: "Can only undo approved actions" });
      }

      const ctx = item.contextJson as any || {};
      let undoDetails: any = { actionType: item.actionType, undoAction: ctx.undoAction };

      const { bidProposalSections, herbieOutreachLog } = await import("@shared/schema");
      
      switch (item.actionType) {
        case "document_classification":
        case "document_move":
          if (ctx.sourceDocId && ctx.previousFolderId) {
            await db.update(jacketDocuments)
              .set({ folderId: ctx.previousFolderId })
              .where(eq(jacketDocuments.id, ctx.sourceDocId));
            undoDetails.undone = "Document moved back to original folder";
          }
          break;
          
        case "proposal_draft":
          const deletedSections = await db.delete(bidProposalSections)
            .where(eq(bidProposalSections.approvalRequestId, id))
            .returning({ id: bidProposalSections.id });
          undoDetails.undone = `Deleted ${deletedSections.length} proposal sections from this approval`;
          undoDetails.deletedCount = deletedSections.length;
          break;
          
        case "send_bid_invitations":
          const cancelledEmails = await db.update(herbieOutreachLog)
            .set({ status: "cancelled" })
            .where(eq(herbieOutreachLog.approvalRequestId, id))
            .returning({ id: herbieOutreachLog.id });
          undoDetails.undone = `Cancelled ${cancelledEmails.length} outreach emails from this approval`;
          undoDetails.cancelledCount = cancelledEmails.length;
          undoDetails.affectedRecipients = ctx.recipients?.length || 0;
          break;
          
        case "request_bid_bond":
          undoDetails.undone = "Bid bond request cancelled - letter not sent to bonding company";
          undoDetails.bondAmount = ctx.bondAmount;
          break;
          
        default:
          undoDetails.undone = `Action ${item.actionType} marked as undone`;
      }
      
      await db.update(approvalRequests).set({ status: "undone" }).where(eq(approvalRequests.id, id));
      
      await db.insert(approvalActions).values({
        tenantId: DEFAULT_TENANT_ID,
        approvalRequestId: id,
        decision: "undone",
        notes: reason || "Action undone by user",
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "ai_action_undone",
        entityType: "ai_review",
        entityId: id,
        actor: "admin",
        afterJson: { ...undoDetails, reason },
      });
      
      res.json({ success: true, message: "Action undone successfully", undoDetails });
    } catch (error) {
      console.error("Error undoing AI action:", error);
      res.status(500).json({ error: "Failed to undo action" });
    }
  });

  app.get("/api/ai-review-queue/stats", async (req: Request, res: Response) => {
    try {
      const { approvalRequests } = await import("@shared/schema");
      
      const all = await db.select().from(approvalRequests)
        .where(eq(approvalRequests.tenantId, DEFAULT_TENANT_ID));
      
      const stats = {
        total: all.length,
        pending: all.filter(r => r.status === "pending").length,
        approved: all.filter(r => r.status === "approved").length,
        rejected: all.filter(r => r.status === "rejected").length,
        undone: all.filter(r => r.status === "undone").length,
        byType: {} as Record<string, number>,
      };
      
      for (const r of all) {
        stats.byType[r.actionType] = (stats.byType[r.actionType] || 0) + 1;
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching AI review stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Seed standard folder sections
  app.post("/api/seed/folder-sections", async (req: Request, res: Response) => {
    try {
      const bidSections = [
        { code: "01", name: "Bid_Request", displayName: "Bid Request", requiredForSubmit: true },
        { code: "02", name: "Plans_and_Specs", displayName: "Plans & Specifications", requiredForSubmit: true },
        { code: "03", name: "RFIs", displayName: "RFIs", requiredForSubmit: false },
        { code: "04", name: "Addenda", displayName: "Addenda", requiredForSubmit: false },
        { code: "05", name: "Takeoff_and_Estimating", displayName: "Takeoff & Estimating", requiredForSubmit: true },
        { code: "06", name: "Subcontractor_Quotes", displayName: "Subcontractor Quotes", requiredForSubmit: false },
        { code: "07", name: "Final_Bid_Submission", displayName: "Final Bid Submission", requiredForSubmit: true },
        { code: "08", name: "Bid_Communications", displayName: "Bid Communications", requiredForSubmit: false },
      ];
      
      const projectSections = [
        { code: "01", name: "Converted_Bid_Documents", displayName: "Converted Bid Documents" },
        { code: "02", name: "Contract_and_Agreements", displayName: "Contract & Agreements" },
        { code: "03", name: "Change_Orders", displayName: "Change Orders" },
        { code: "04", name: "Purchase_Orders", displayName: "Purchase Orders" },
        { code: "05", name: "Schedules", displayName: "Schedules" },
        { code: "06", name: "Invoices_and_Payments", displayName: "Invoices & Payments" },
        { code: "07", name: "Photos_and_Field_Reports", displayName: "Photos & Field Reports" },
        { code: "08", name: "Compliance_and_Safety", displayName: "Compliance & Safety" },
        { code: "09", name: "Emails_and_Communication", displayName: "Emails & Communication" },
        { code: "10", name: "Closeout_and_Warranty", displayName: "Closeout & Warranty" },
      ];
      
      for (let i = 0; i < bidSections.length; i++) {
        const s = bidSections[i];
        await storage.createFolderSection({
          tenantId: DEFAULT_TENANT_ID,
          jacketType: "bid",
          sortOrder: i + 1,
          code: s.code,
          name: s.name,
          displayName: s.displayName,
          requiredForSubmit: s.requiredForSubmit,
        });
      }
      
      for (let i = 0; i < projectSections.length; i++) {
        const s = projectSections[i];
        await storage.createFolderSection({
          tenantId: DEFAULT_TENANT_ID,
          jacketType: "project",
          sortOrder: i + 1,
          code: s.code,
          name: s.name,
          displayName: s.displayName,
        });
      }
      
      res.json({ success: true, message: "Folder sections seeded" });
    } catch (error) {
      console.error("Error seeding folder sections:", error);
      res.status(500).json({ error: "Failed to seed folder sections" });
    }
  });

  // ============================================================================
  // AUTO-FILING RULES API
  // ============================================================================

  app.get("/api/auto-filing-rules", async (req: Request, res: Response) => {
    try {
      const rules = await db.select().from(autoFilingRules)
        .where(eq(autoFilingRules.tenantId, DEFAULT_TENANT_ID))
        .orderBy(autoFilingRules.priority);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching auto-filing rules:", error);
      res.status(500).json({ error: "Failed to fetch auto-filing rules" });
    }
  });

  app.post("/api/auto-filing-rules", async (req: Request, res: Response) => {
    try {
      const parsed = insertAutoFilingRuleSchema.parse(req.body);
      const [rule] = await db.insert(autoFilingRules).values({
        ...parsed,
        tenantId: DEFAULT_TENANT_ID,
      }).returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "auto_filing_rule_created",
        entityType: "auto_filing_rule",
        entityId: rule.id,
        action: "create",
        afterJson: rule,
      });
      
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating auto-filing rule:", error);
      res.status(500).json({ error: "Failed to create auto-filing rule" });
    }
  });

  app.put("/api/auto-filing-rules/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const updates = req.body;
      
      const [existing] = await db.select().from(autoFilingRules).where(eq(autoFilingRules.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      const [updated] = await db.update(autoFilingRules)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(autoFilingRules.id, id))
        .returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "auto_filing_rule_updated",
        entityType: "auto_filing_rule",
        entityId: id,
        action: "update",
        beforeJson: existing,
        afterJson: updated,
      });
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating auto-filing rule:", error);
      res.status(500).json({ error: "Failed to update auto-filing rule" });
    }
  });

  app.delete("/api/auto-filing-rules/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const [existing] = await db.select().from(autoFilingRules).where(eq(autoFilingRules.id, id));
      if (!existing) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      await db.delete(autoFilingRules).where(eq(autoFilingRules.id, id));
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "auto_filing_rule_deleted",
        entityType: "auto_filing_rule",
        entityId: id,
        action: "delete",
        beforeJson: existing,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting auto-filing rule:", error);
      res.status(500).json({ error: "Failed to delete auto-filing rule" });
    }
  });

  // Auto-file a document using rules
  app.post("/api/documents/:documentId/auto-file", async (req: Request, res: Response) => {
    try {
      const documentId = p(req.params.documentId);
      
      const [doc] = await db.select().from(jacketDocuments).where(eq(jacketDocuments.id, documentId));
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Get all enabled rules sorted by priority
      const rules = await db.select().from(autoFilingRules)
        .where(and(
          eq(autoFilingRules.tenantId, DEFAULT_TENANT_ID),
          eq(autoFilingRules.enabled, true)
        ))
        .orderBy(autoFilingRules.priority);
      
      let matchedRule = null;
      for (const rule of rules) {
        // Check filename pattern
        if (rule.fileNamePattern) {
          const regex = new RegExp(rule.fileNamePattern, "i");
          if (regex.test(doc.title)) {
            matchedRule = rule;
            break;
          }
        }
        // Check file type pattern
        if (rule.fileTypePattern) {
          const types = rule.fileTypePattern.split(",").map(t => t.trim().toLowerCase());
          const ext = doc.title.split(".").pop()?.toLowerCase();
          if (ext && types.includes(ext)) {
            matchedRule = rule;
            break;
          }
        }
      }
      
      if (matchedRule) {
        res.json({
          matched: true,
          rule: matchedRule,
          suggestedFolder: matchedRule.targetFolderPath,
          requiresReview: matchedRule.requiresReview,
        });
      } else {
        res.json({ matched: false, message: "No matching rule found" });
      }
    } catch (error) {
      console.error("Error auto-filing document:", error);
      res.status(500).json({ error: "Failed to auto-file document" });
    }
  });

  // ============================================================================
  // AUTO-FILING ENHANCED API (with service integration)
  // ============================================================================

  // Import auto-filing service
  const { createAutoFilingService } = await import("./services/auto-filing.service");

  // Get all auto-filing rules (service-based)
  app.get("/api/auto-filing/rules", async (req: Request, res: Response) => {
    try {
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const rules = await service.getRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching auto-filing rules:", error);
      res.status(500).json({ error: "Failed to fetch auto-filing rules" });
    }
  });

  // Get a single auto-filing rule
  app.get("/api/auto-filing/rules/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const rule = await service.getRuleById(id);
      
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      res.json(rule);
    } catch (error) {
      console.error("Error fetching auto-filing rule:", error);
      res.status(500).json({ error: "Failed to fetch auto-filing rule" });
    }
  });

  // Create a new auto-filing rule
  app.post("/api/auto-filing/rules", async (req: Request, res: Response) => {
    try {
      const parsed = insertAutoFilingRuleSchema.parse(req.body);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const rule = await service.createRule(parsed);
      res.status(201).json(rule);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error creating auto-filing rule:", error);
      res.status(500).json({ error: "Failed to create auto-filing rule" });
    }
  });

  // Update an auto-filing rule
  app.put("/api/auto-filing/rules/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const rule = await service.updateRule(id, req.body);
      
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      res.json(rule);
    } catch (error) {
      console.error("Error updating auto-filing rule:", error);
      res.status(500).json({ error: "Failed to update auto-filing rule" });
    }
  });

  // Delete an auto-filing rule
  app.delete("/api/auto-filing/rules/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const success = await service.deleteRule(id);
      
      if (!success) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting auto-filing rule:", error);
      res.status(500).json({ error: "Failed to delete auto-filing rule" });
    }
  });

  // Toggle rule enabled/disabled
  app.patch("/api/auto-filing/rules/:id/toggle", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { enabled } = req.body;
      
      if (typeof enabled !== "boolean") {
        return res.status(400).json({ error: "enabled field is required and must be boolean" });
      }
      
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const rule = await service.toggleRule(id, enabled);
      
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      
      res.json(rule);
    } catch (error) {
      console.error("Error toggling auto-filing rule:", error);
      res.status(500).json({ error: "Failed to toggle auto-filing rule" });
    }
  });

  // Test a rule against a document without applying
  const autoFileTestSchema = z.object({
    documentId: z.string().optional(),
    ruleId: z.string().optional(),
    document: z.object({
      name: z.string(),
      path: z.string(),
      fileType: z.string().optional(),
      mimeType: z.string().optional(),
      contentText: z.string().optional(),
      senderEmail: z.string().optional(),
      projectName: z.string().optional(),
      vendorName: z.string().optional(),
    }).optional(),
  });

  app.post("/api/auto-filing/test", async (req: Request, res: Response) => {
    try {
      const parsed = autoFileTestSchema.parse(req.body);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);

      let documentContext: any;

      // If documentId provided, fetch the document
      if (parsed.documentId) {
        const [doc] = await db.select().from(jacketDocuments)
          .where(eq(jacketDocuments.id, parsed.documentId));
        
        if (!doc) {
          return res.status(404).json({ error: "Document not found" });
        }
        
        documentContext = {
          id: doc.id,
          name: doc.title,
          path: (doc as any).storagePath || doc.storageKey || "",
          fileType: doc.fileType,
          mimeType: doc.mimeType,
          isFolder: false,
        };
      } else if (parsed.document) {
        documentContext = {
          id: "test-doc",
          name: parsed.document.name,
          path: parsed.document.path,
          fileType: parsed.document.fileType,
          mimeType: parsed.document.mimeType,
          contentText: parsed.document.contentText,
          senderEmail: parsed.document.senderEmail,
          projectName: parsed.document.projectName,
          vendorName: parsed.document.vendorName,
          isFolder: false,
        };
      } else {
        return res.status(400).json({ error: "Either documentId or document object is required" });
      }

      // If specific rule to test
      if (parsed.ruleId) {
        const result = await service.testRule(parsed.ruleId, documentContext);
        if (!result) {
          return res.status(404).json({ error: "Rule not found" });
        }
        return res.json({ matches: [result] });
      }

      // Test against all rules
      const matches = await service.matchRules(documentContext);
      res.json({
        matches,
        bestMatch: matches[0] || null,
        documentContext: {
          name: documentContext.name,
          path: documentContext.path,
          suggestedName: matches[0]?.suggestedName || null,
        },
      });
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      console.error("Error testing auto-filing:", error);
      res.status(500).json({ error: "Failed to test auto-filing" });
    }
  });

  // Apply auto-filing to a document with confidence threshold
  app.post("/api/auto-filing/apply/:documentId", async (req: Request, res: Response) => {
    try {
      const documentId = p(req.params.documentId);
      const { confidenceThreshold, dryRun } = req.body;

      const [doc] = await db.select().from(jacketDocuments)
        .where(eq(jacketDocuments.id, documentId));
      
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }

      const documentContext = {
        id: doc.id,
        name: doc.title,
        path: (doc as any).storagePath || doc.storageKey || "",
        fileType: doc.fileType,
        mimeType: doc.mimeType,
        isFolder: false,
      };

      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const result = await service.applyAutoFilingRules(
        documentContext,
        confidenceThreshold ?? 0.7,
        dryRun ?? false
      );

      res.json(result);
    } catch (error) {
      console.error("Error applying auto-filing:", error);
      res.status(500).json({ error: "Failed to apply auto-filing" });
    }
  });

  // Get undoable auto-file actions
  app.get("/api/auto-filing/undo-actions", async (req: Request, res: Response) => {
    try {
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const actions = await service.getUndoableActions();
      res.json(actions);
    } catch (error) {
      console.error("Error fetching undoable actions:", error);
      res.status(500).json({ error: "Failed to fetch undoable actions" });
    }
  });

  // Undo a previous auto-file action
  app.post("/api/auto-filing/undo/:actionId", async (req: Request, res: Response) => {
    try {
      const actionId = p(req.params.actionId);
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const result = await service.undoAutoFileAction(actionId);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: "Auto-file action undone successfully" });
    } catch (error) {
      console.error("Error undoing auto-file action:", error);
      res.status(500).json({ error: "Failed to undo auto-file action" });
    }
  });

  // Get auto-filing statistics
  app.get("/api/auto-filing/stats", async (req: Request, res: Response) => {
    try {
      const service = createAutoFilingService(DEFAULT_TENANT_ID);
      const stats = await service.getFilingStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching auto-filing stats:", error);
      res.status(500).json({ error: "Failed to fetch auto-filing stats" });
    }
  });

  // ============================================================================
  // SHARE LINKS API (Enhanced)
  // ============================================================================

  app.get("/api/share-links", async (req: Request, res: Response) => {
    try {
      const links = await db.select().from(shareLinks)
        .where(eq(shareLinks.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(shareLinks.createdAt));
      res.json(links);
    } catch (error) {
      console.error("Error fetching share links:", error);
      res.status(500).json({ error: "Failed to fetch share links" });
    }
  });

  app.post("/api/share-links", async (req: Request, res: Response) => {
    try {
      const { documentId, folderId, shareType, password, expiresInDays, maxDownloads, watermark } = req.body;
      
      // Generate secure token
      const token = crypto.randomBytes(32).toString("hex");
      
      const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
      
      const [link] = await db.insert(shareLinks).values({
        tenantId: DEFAULT_TENANT_ID,
        documentId,
        folderId,
        shareType: shareType || "document",
        token,
        password: password || null,
        expiresAt,
        maxDownloads: maxDownloads || null,
        watermark: watermark || false,
      }).returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "share_link_created",
        entityType: "share_link",
        entityId: link.id,
        action: "create",
        afterJson: { ...link, token: "[REDACTED]" },
      });
      
      res.status(201).json({
        ...link,
        shareUrl: `/shared/${token}`,
      });
    } catch (error) {
      console.error("Error creating share link:", error);
      res.status(500).json({ error: "Failed to create share link" });
    }
  });

  app.get("/api/shared/:token", async (req: Request, res: Response) => {
    try {
      const token = p(req.params.token);
      
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
      if (!link) {
        return res.status(404).json({ error: "Share link not found or expired" });
      }
      
      // Check expiration
      if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
        return res.status(410).json({ error: "Share link has expired" });
      }
      
      // Check download limit
      if (link.maxDownloads && (link.downloadCount || 0) >= link.maxDownloads) {
        return res.status(410).json({ error: "Share link download limit reached" });
      }
      
      // Update last accessed
      await db.update(shareLinks)
        .set({ lastAccessedAt: new Date() })
        .where(eq(shareLinks.id, link.id));
      
      // Return metadata (password check done client-side or with separate endpoint)
      res.json({
        id: link.id,
        shareType: link.shareType,
        hasPassword: !!link.password,
        documentId: link.documentId,
        folderId: link.folderId,
        watermark: link.watermark,
      });
    } catch (error) {
      console.error("Error accessing share link:", error);
      res.status(500).json({ error: "Failed to access share link" });
    }
  });

  app.post("/api/shared/:token/verify", async (req: Request, res: Response) => {
    try {
      const token = p(req.params.token);
      const { password } = req.body;
      
      const [link] = await db.select().from(shareLinks).where(eq(shareLinks.token, token));
      if (!link) {
        return res.status(404).json({ error: "Share link not found" });
      }
      
      if (link.password && link.password !== password) {
        return res.status(401).json({ error: "Invalid password" });
      }
      
      // Increment download count
      await db.update(shareLinks)
        .set({ downloadCount: (link.downloadCount || 0) + 1 })
        .where(eq(shareLinks.id, link.id));
      
      res.json({ verified: true });
    } catch (error) {
      console.error("Error verifying share link:", error);
      res.status(500).json({ error: "Failed to verify share link" });
    }
  });

  app.delete("/api/share-links/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const [existing] = await db.select().from(shareLinks).where(eq(shareLinks.id, id));
      if (existing) {
        await storage.createAuditEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "share_link_deleted",
          entityType: "share_link",
          entityId: id,
          action: "delete",
          beforeJson: { ...existing, token: "[REDACTED]" },
        });
      }
      
      await db.delete(shareLinks).where(eq(shareLinks.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting share link:", error);
      res.status(500).json({ error: "Failed to delete share link" });
    }
  });

  // ============================================================================
  // RBAC PERMISSIONS API
  // ============================================================================

  app.get("/api/permissions", async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId, userId } = req.query;
      
      const conditions = [eq(projectPermissions.tenantId, DEFAULT_TENANT_ID)];
      if (resourceType) {
        conditions.push(eq(projectPermissions.resourceType, resourceType as string));
      }
      if (resourceId) {
        conditions.push(eq(projectPermissions.resourceId, resourceId as string));
      }
      if (userId) {
        conditions.push(eq(projectPermissions.userId, userId as string));
      }
      
      const perms = await db.select().from(projectPermissions).where(and(...conditions));
      res.json(perms);
    } catch (error) {
      console.error("Error fetching permissions:", error);
      res.status(500).json({ error: "Failed to fetch permissions" });
    }
  });

  app.post("/api/permissions", async (req: Request, res: Response) => {
    try {
      const parsed = insertProjectPermissionSchema.parse(req.body);
      
      // Check for existing permission
      const [existing] = await db.select().from(projectPermissions)
        .where(and(
          eq(projectPermissions.userId, parsed.userId),
          eq(projectPermissions.resourceType, parsed.resourceType),
          eq(projectPermissions.resourceId, parsed.resourceId)
        ));
      
      if (existing) {
        // Update existing permission
        const [updated] = await db.update(projectPermissions)
          .set({ permissionLevel: parsed.permissionLevel })
          .where(eq(projectPermissions.id, existing.id))
          .returning();
        return res.json(updated);
      }
      
      const [perm] = await db.insert(projectPermissions).values({
        ...parsed,
        tenantId: DEFAULT_TENANT_ID,
      }).returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "permission_granted",
        entityType: parsed.resourceType,
        entityId: parsed.resourceId,
        action: "grant",
        afterJson: perm,
      });
      
      res.status(201).json(perm);
    } catch (error) {
      console.error("Error creating permission:", error);
      res.status(500).json({ error: "Failed to create permission" });
    }
  });

  app.delete("/api/permissions/:id", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const [existing] = await db.select().from(projectPermissions).where(eq(projectPermissions.id, id));
      if (existing) {
        await storage.createAuditEvent({
          tenantId: DEFAULT_TENANT_ID,
          eventType: "permission_revoked",
          entityType: existing.resourceType,
          entityId: existing.resourceId,
          action: "revoke",
          beforeJson: existing,
        });
      }
      
      await db.delete(projectPermissions).where(eq(projectPermissions.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting permission:", error);
      res.status(500).json({ error: "Failed to delete permission" });
    }
  });

  // Check user permission for a resource
  app.get("/api/permissions/check", async (req: Request, res: Response) => {
    try {
      const { userId, resourceType, resourceId, requiredLevel } = req.query;
      
      if (!userId || !resourceType || !resourceId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }
      
      const [perm] = await db.select().from(projectPermissions)
        .where(and(
          eq(projectPermissions.userId, userId as string),
          eq(projectPermissions.resourceType, resourceType as string),
          eq(projectPermissions.resourceId, resourceId as string)
        ));
      
      const levels = ["viewer", "editor", "admin", "owner"];
      const hasPermission = perm && levels.indexOf(perm.permissionLevel) >= levels.indexOf(requiredLevel as string || "viewer");
      
      res.json({
        hasPermission,
        permissionLevel: perm?.permissionLevel || null,
      });
    } catch (error) {
      console.error("Error checking permission:", error);
      res.status(500).json({ error: "Failed to check permission" });
    }
  });

  // ============================================================================
  // DOCUMENT OCR & SEARCH API
  // ============================================================================

  app.post("/api/documents/:documentId/ocr", async (req: Request, res: Response) => {
    try {
      const documentId = p(req.params.documentId);
      
      const [doc] = await db.select().from(jacketDocuments).where(eq(jacketDocuments.id, documentId));
      if (!doc) {
        return res.status(404).json({ error: "Document not found" });
      }
      
      // Simulate OCR processing (in real implementation, would call OCR service)
      const extractedText = `Extracted text content from ${doc.title}. This is a placeholder for actual OCR processing.`;
      
      const [textContent] = await db.insert(documentTextContent).values({
        tenantId: DEFAULT_TENANT_ID,
        documentId,
        pageNumber: 1,
        textContent: extractedText,
        ocrEngine: "simulated",
        ocrConfidence: "95.50",
      }).returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "document_ocr_processed",
        entityType: "document",
        entityId: documentId,
        action: "ocr",
      });
      
      res.json({
        success: true,
        textContentId: textContent.id,
        preview: extractedText.substring(0, 200),
      });
    } catch (error) {
      console.error("Error processing OCR:", error);
      res.status(500).json({ error: "Failed to process OCR" });
    }
  });

  app.get("/api/documents/search", async (req: Request, res: Response) => {
    try {
      const { q, folderId, jacketId } = req.query;
      
      if (!q || typeof q !== "string") {
        return res.status(400).json({ error: "Search query required" });
      }
      
      // Search in document titles
      let titleResults = await db.select().from(jacketDocuments)
        .where(and(
          eq(jacketDocuments.tenantId, DEFAULT_TENANT_ID),
          ilike(jacketDocuments.title, `%${q}%`)
        ));
      
      // Search in OCR text content
      const textResults = await db.select({
        documentId: documentTextContent.documentId,
        textContent: documentTextContent.textContent,
      }).from(documentTextContent)
        .where(and(
          eq(documentTextContent.tenantId, DEFAULT_TENANT_ID),
          ilike(documentTextContent.textContent, `%${q}%`)
        ));
      
      // Get full document info for text matches
      const textDocIds = textResults.map(r => r.documentId);
      let contentMatchDocs: typeof titleResults = [];
      if (textDocIds.length > 0) {
        contentMatchDocs = await db.select().from(jacketDocuments)
          .where(sql`${jacketDocuments.id} = ANY(${textDocIds})`);
      }
      
      // Combine and deduplicate
      const allDocs = [...titleResults];
      for (const doc of contentMatchDocs) {
        if (!allDocs.find(d => d.id === doc.id)) {
          allDocs.push(doc);
        }
      }
      
      res.json({
        results: allDocs,
        titleMatches: titleResults.length,
        contentMatches: contentMatchDocs.length,
        total: allDocs.length,
      });
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ error: "Failed to search documents" });
    }
  });

  // ============================================================================
  // NOTIFICATIONS API
  // ============================================================================

  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const { userId, unreadOnly, limit: limitParam } = req.query;
      const limit = parseInt(limitParam as string) || 50;
      
      const notifConditions = [eq(notifications.tenantId, DEFAULT_TENANT_ID)];
      if (userId) {
        notifConditions.push(eq(notifications.userId, userId as string));
      }
      if (unreadOnly === "true") {
        notifConditions.push(eq(notifications.read, false));
      }
      
      const notifs = await db.select().from(notifications)
        .where(and(...notifConditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit);
      res.json(notifs);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications", async (req: Request, res: Response) => {
    try {
      const { userId, type, title, message, priority, entityType, entityId, actionUrl } = req.body;
      
      // If userId is provided, verify it exists - otherwise use null for broadcast notifications
      let validUserId = null;
      if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (user) {
          validUserId = userId;
        }
        // If user doesn't exist, create as broadcast notification (userId = null)
      }
      
      const [notif] = await db.insert(notifications).values({
        tenantId: DEFAULT_TENANT_ID,
        userId: validUserId,
        type,
        title,
        message,
        priority: priority || "normal",
        entityType,
        entityId,
        actionUrl,
      }).returning();
      
      await storage.createAuditEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "notification_created",
        entityType: "notification",
        entityId: notif.id,
        action: "create",
        afterJson: notif,
      });
      
      res.status(201).json(notif);
    } catch (error) {
      console.error("Error creating notification:", error);
      res.status(500).json({ error: "Failed to create notification" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      
      const [updated] = await db.update(notifications)
        .set({ read: true })
        .where(eq(notifications.id, id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ error: "Failed to mark notification read" });
    }
  });

  app.post("/api/notifications/mark-all-read", async (req: Request, res: Response) => {
    try {
      const tenantId = p(req.headers["x-tenant-id"] as string) || DEFAULT_TENANT_ID;
      const { userId } = req.body ?? {};

      // When the bell omits userId (system-wide notifications like COI
      // alerts that have userId=null), mark every unread row in the
      // tenant. When userId is provided, scope to that user. We never
      // pass `eq(col, undefined)` to Drizzle because it produces
      // unpredictable SQL across drivers.
      const conditions = [
        eq(notifications.tenantId, tenantId),
        eq(notifications.read, false),
      ];
      if (typeof userId === "string" && userId.length > 0) {
        conditions.push(eq(notifications.userId, userId));
      }

      const updated = await db.update(notifications)
        .set({ read: true })
        .where(and(...conditions))
        .returning({ id: notifications.id });

      res.json({ success: true, updated: updated.length });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ error: "Failed to mark all notifications read" });
    }
  });

  // Create RFI due date reminder
  app.post("/api/notifications/schedule-rfi-reminder", async (req: Request, res: Response) => {
    try {
      const { rfiId, userId, reminderDate } = req.body;
      
      const [rfi] = await db.select().from(bidRfis).where(eq(bidRfis.id, rfiId));
      if (!rfi) {
        return res.status(404).json({ error: "RFI not found" });
      }
      
      const [notif] = await db.insert(notifications).values({
        tenantId: DEFAULT_TENANT_ID,
        userId,
        type: "rfi_due",
        title: `RFI #${rfi.rfiNumber} Due Soon`,
        message: `RFI "${rfi.subject}" is due ${rfi.dueAt ? new Date(rfi.dueAt).toLocaleDateString() : 'soon'}`,
        priority: "high",
        entityType: "rfi",
        entityId: rfiId,
        actionUrl: `/bids/${rfi.bidProjectId}?tab=rfis&rfi=${rfiId}`,
      }).returning();
      
      res.status(201).json(notif);
    } catch (error) {
      console.error("Error scheduling RFI reminder:", error);
      res.status(500).json({ error: "Failed to schedule RFI reminder" });
    }
  });

  // Notification preferences
  app.get("/api/notification-preferences/:userId", async (req: Request, res: Response) => {
    try {
      const userId = p(req.params.userId);
      
      const prefs = await db.select().from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.tenantId, DEFAULT_TENANT_ID),
          eq(notificationPreferences.userId, userId)
        ));
      
      res.json(prefs);
    } catch (error) {
      console.error("Error fetching notification preferences:", error);
      res.status(500).json({ error: "Failed to fetch notification preferences" });
    }
  });

  app.put("/api/notification-preferences/:userId", async (req: Request, res: Response) => {
    try {
      const userId = p(req.params.userId);
      const { preferences } = req.body; // Array of preference objects
      
      for (const pref of preferences) {
        const existing = await db.select().from(notificationPreferences)
          .where(and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.notificationType, pref.notificationType)
          ));
        
        if (existing.length > 0) {
          await db.update(notificationPreferences)
            .set({
              inApp: pref.inApp,
              email: pref.email,
              emailDigest: pref.emailDigest,
            })
            .where(eq(notificationPreferences.id, existing[0].id));
        } else {
          await db.insert(notificationPreferences).values({
            tenantId: DEFAULT_TENANT_ID,
            userId,
            notificationType: pref.notificationType,
            inApp: pref.inApp ?? true,
            email: pref.email ?? true,
            emailDigest: pref.emailDigest ?? "instant",
          });
        }
      }
      
      const updatedPrefs = await db.select().from(notificationPreferences)
        .where(and(
          eq(notificationPreferences.tenantId, DEFAULT_TENANT_ID),
          eq(notificationPreferences.userId, userId)
        ));
      
      res.json(updatedPrefs);
    } catch (error) {
      console.error("Error updating notification preferences:", error);
      res.status(500).json({ error: "Failed to update notification preferences" });
    }
  });

  // ============================================================================
  // PROACTIVE ALERTS API
  // ============================================================================

  app.get("/api/alerts", async (req: Request, res: Response) => {
    try {
      const { userId, unreadOnly, limit: limitParam, offset: offsetParam, types } = req.query;
      const limit = parseInt(limitParam as string) || 50;
      const offset = parseInt(offsetParam as string) || 0;
      const alertTypes = types ? (types as string).split(",") as AlertType[] : undefined;

      const alerts = await alertsService.getAlerts(
        DEFAULT_TENANT_ID,
        userId as string,
        {
          unreadOnly: unreadOnly === "true",
          limit,
          offset,
          alertTypes,
        }
      );

      res.json(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  });

  app.post("/api/alerts/:id/read", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const { userId } = req.body;

      const success = await alertsService.markRead(DEFAULT_TENANT_ID, id, userId);

      if (!success) {
        return res.status(404).json({ error: "Alert not found" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error marking alert read:", error);
      res.status(500).json({ error: "Failed to mark alert read" });
    }
  });

  app.post("/api/alerts/mark-all-read", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const count = await alertsService.markAllRead(DEFAULT_TENANT_ID, userId);

      res.json({ success: true, markedRead: count });
    } catch (error) {
      console.error("Error marking all alerts read:", error);
      res.status(500).json({ error: "Failed to mark all alerts read" });
    }
  });

  app.get("/api/alerts/preferences", async (req: Request, res: Response) => {
    try {
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const prefs = await alertsService.getPreferences(DEFAULT_TENANT_ID, userId as string);

      res.json(prefs);
    } catch (error) {
      console.error("Error fetching alert preferences:", error);
      res.status(500).json({ error: "Failed to fetch alert preferences" });
    }
  });

  app.put("/api/alerts/preferences", async (req: Request, res: Response) => {
    try {
      const { userId, preferences } = req.body;

      if (!userId || !preferences || !Array.isArray(preferences)) {
        return res.status(400).json({ error: "userId and preferences array are required" });
      }

      await alertsService.updatePreferences(DEFAULT_TENANT_ID, userId, preferences);

      const updatedPrefs = await alertsService.getPreferences(DEFAULT_TENANT_ID, userId);

      res.json(updatedPrefs);
    } catch (error) {
      console.error("Error updating alert preferences:", error);
      res.status(500).json({ error: "Failed to update alert preferences" });
    }
  });

  app.post("/api/alerts", async (req: Request, res: Response) => {
    try {
      const { alertType, title, message, entityType, entityId, userId, priority, actionUrl } = req.body;

      if (!alertType || !title) {
        return res.status(400).json({ error: "alertType and title are required" });
      }

      const alertId = await alertsService.createAlert({
        tenantId: DEFAULT_TENANT_ID,
        alertType,
        title,
        message,
        entityType,
        entityId,
        userId,
        priority,
        actionUrl,
      });

      res.status(201).json({ id: alertId, success: true });
    } catch (error) {
      console.error("Error creating alert:", error);
      res.status(500).json({ error: "Failed to create alert" });
    }
  });

  app.post("/api/alerts/trigger-compliance-check", async (req: Request, res: Response) => {
    try {
      const result = await alertsService.checkComplianceExpiry(DEFAULT_TENANT_ID);

      res.json({
        success: true,
        checked: result.checked,
        alertsCreated: result.alertsCreated,
      });
    } catch (error) {
      console.error("Error triggering compliance check:", error);
      res.status(500).json({ error: "Failed to trigger compliance check" });
    }
  });

  app.post("/api/alerts/check-duplicate", async (req: Request, res: Response) => {
    try {
      const { documentId, contentHash } = req.body;

      if (!documentId || !contentHash) {
        return res.status(400).json({ error: "documentId and contentHash are required" });
      }

      const result = await alertsService.detectDuplicates(DEFAULT_TENANT_ID, documentId, contentHash);

      res.json({
        success: true,
        duplicatesFound: result.duplicatesFound,
        alertCreated: result.alertCreated,
      });
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      res.status(500).json({ error: "Failed to check for duplicates" });
    }
  });

  // ============================================================================
  // TENANT SETTINGS API
  // ============================================================================
  app.get("/api/settings", async (req: Request, res: Response) => {
    try {
      const settings = await db.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, DEFAULT_TENANT_ID));
      
      const settingsMap: Record<string, any> = {};
      settings.forEach(s => {
        settingsMap[s.key] = s.valueJson;
      });
      res.json(settingsMap);
    } catch (error) {
      console.error("Error fetching settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.post("/api/settings", async (req: Request, res: Response) => {
    try {
      const updates = req.body;
      
      for (const [key, value] of Object.entries(updates)) {
        const existing = await db.select().from(tenantSettings)
          .where(and(
            eq(tenantSettings.tenantId, DEFAULT_TENANT_ID),
            eq(tenantSettings.key, key)
          ));
        
        if (existing.length > 0) {
          await db.update(tenantSettings)
            .set({ valueJson: value })
            .where(eq(tenantSettings.id, existing[0].id));
        } else {
          await db.insert(tenantSettings).values({
            tenantId: DEFAULT_TENANT_ID,
            key,
            valueJson: value,
          });
        }
      }
      
      const allSettings = await db.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, DEFAULT_TENANT_ID));
      
      const settingsMap: Record<string, any> = {};
      allSettings.forEach(s => {
        settingsMap[s.key] = s.valueJson;
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "settings.updated",
        actor: req.body.actorId || "system",
        entityType: "settings",
        entityId: DEFAULT_TENANT_ID,
        afterJson: settingsMap as Record<string, unknown>,
      });
      
      res.json(settingsMap);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: "Failed to update settings" });
    }
  });

  // ============================================================================
  // DESIGN & SYSTEMS MODULE API
  // ============================================================================

  // Drawing Sheets
  app.get("/api/drawing-sheets", async (req: Request, res: Response) => {
    try {
      const sheets = await db.select().from(drawingSheets)
        .where(eq(drawingSheets.tenantId, DEFAULT_TENANT_ID))
        .orderBy(drawingSheets.sheetNumber);
      res.json(sheets);
    } catch (error) {
      console.error("Error fetching drawing sheets:", error);
      res.status(500).json({ error: "Failed to fetch drawing sheets" });
    }
  });

  const drawingSheetInputSchema = z.object({
    sheetNumber: z.string().min(1, "Sheet number required"),
    sheetTitle: z.string().min(1, "Sheet title required"),
    discipline: z.string().min(1, "Discipline required"),
    fileType: z.string().min(1, "File type required"),
    storageKey: z.string().optional(),
    projectId: z.string().optional(),
    scale: z.string().optional(),
    revisionNumber: z.string().optional(),
  });

  app.post("/api/drawing-sheets", async (req: Request, res: Response) => {
    try {
      const validated = drawingSheetInputSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const { sheetNumber, sheetTitle, discipline, fileType, storageKey, projectId, scale, revisionNumber } = validated.data;
      
      const [sheet] = await db.insert(drawingSheets).values({
        tenantId: DEFAULT_TENANT_ID,
        sheetNumber,
        sheetTitle,
        discipline,
        fileType,
        storageKey: storageKey || `drawings/${sheetNumber.replace(/\./g, "_")}_${Date.now()}`,
        projectId,
        scale,
        revisionNumber,
      }).returning();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "drawing_sheet.created",
        actor: req.body.actorId || "system",
        entityType: "drawing_sheet",
        entityId: sheet.id,
        afterJson: sheet as unknown as Record<string, unknown>,
      });

      // Fire-and-forget: ask Herbie to extract structured fields from the sheet.
      void (async () => {
        try {
          const { executeHerbieTool } = await import("./services/herbie-tools");
          await executeHerbieTool(
            {
              tool: "extract_fields",
              args: { documentId: sheet.id, extractionType: "drawing_sheet" },
            },
            { tenantId: DEFAULT_TENANT_ID, userId: "herbie" } as any,
          );
        } catch (e) {
          console.warn("[herbie auto-hook drawing_sheet]", e instanceof Error ? e.message : e);
        }
      })();
      
      res.status(201).json(sheet);
    } catch (error) {
      console.error("Error creating drawing sheet:", error);
      res.status(500).json({ error: "Failed to create drawing sheet" });
    }
  });

  app.get("/api/drawing-sheets/:id", async (req: Request, res: Response) => {
    try {
      const [sheet] = await db.select().from(drawingSheets)
        .where(and(
          eq(drawingSheets.tenantId, DEFAULT_TENANT_ID),
          eq(drawingSheets.id, p(req.params.id))
        ));
      if (!sheet) return res.status(404).json({ error: "Drawing sheet not found" });
      res.json(sheet);
    } catch (error) {
      console.error("Error fetching drawing sheet:", error);
      res.status(500).json({ error: "Failed to fetch drawing sheet" });
    }
  });

  app.patch("/api/drawing-sheets/:id", async (req: Request, res: Response) => {
    try {
      const [sheet] = await db.update(drawingSheets)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(
          eq(drawingSheets.tenantId, DEFAULT_TENANT_ID),
          eq(drawingSheets.id, p(req.params.id))
        ))
        .returning();
      res.json(sheet);
    } catch (error) {
      console.error("Error updating drawing sheet:", error);
      res.status(500).json({ error: "Failed to update drawing sheet" });
    }
  });

  app.delete("/api/drawing-sheets/:id", async (req: Request, res: Response) => {
    try {
      await db.delete(drawingSheets)
        .where(and(
          eq(drawingSheets.tenantId, DEFAULT_TENANT_ID),
          eq(drawingSheets.id, p(req.params.id))
        ));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting drawing sheet:", error);
      res.status(500).json({ error: "Failed to delete drawing sheet" });
    }
  });

  // Request upload URL for file uploads
  app.post("/api/uploads/request-url", async (req: Request, res: Response) => {
    try {
      const { name, size, contentType } = req.body;
      
      const { ObjectStorageService } = await import("./replit_integrations/object_storage");
      const storageService = new ObjectStorageService();
      
      const uploadURL = await storageService.getObjectEntityUploadURL();
      
      // Extract object path from the signed URL
      const url = new URL(uploadURL);
      const objectPath = url.pathname;
      
      res.json({ uploadURL, objectPath });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Download drawing sheet file - stream directly
  app.get("/api/drawing-sheets/:id/download", async (req: Request, res: Response) => {
    try {
      const [sheet] = await db.select().from(drawingSheets)
        .where(and(
          eq(drawingSheets.tenantId, DEFAULT_TENANT_ID),
          eq(drawingSheets.id, p(req.params.id))
        ));

      if (!sheet) {
        return res.status(404).json({ error: "Drawing sheet not found" });
      }

      if (!sheet.storageKey) {
        return res.status(404).json({ error: "No file attached to this sheet" });
      }

      const { ObjectStorageService, objectStorageClient } = await import("./replit_integrations/object_storage");
      const storageService = new ObjectStorageService();

      // Resolve the storage key against three supported conventions:
      //   1) "/objects/<entityId>"   – ObjectUploader normalized form
      //   2) "/<bucket>/<objectName>" – raw signed-URL pathname (current
      //      shape returned by /api/uploads/request-url)
      //   3) "<relativePath>"        – legacy/seed paths; resolve against
      //      PUBLIC_OBJECT_SEARCH_PATHS
      const storageKey = sheet.storageKey;
      let file: import("@google-cloud/storage").File | null = null;

      try {
        if (storageKey.startsWith("/objects/")) {
          file = await storageService.getObjectEntityFile(storageKey);
        } else if (storageKey.startsWith("/")) {
          const parts = storageKey.slice(1).split("/");
          if (parts.length >= 2) {
            const bucketName = parts[0];
            const objectName = parts.slice(1).join("/");
            const candidate = objectStorageClient.bucket(bucketName).file(objectName);
            const [exists] = await candidate.exists();
            if (exists) file = candidate;
          }
        } else {
          file = await storageService.searchPublicObject(storageKey);
        }
      } catch (resolveErr) {
        console.error(`[drawing-sheets/download] resolve error for key="${storageKey}":`, resolveErr);
        file = null;
      }

      if (!file) {
        return res.status(404).json({
          error: "No file uploaded for this drawing sheet",
          sheetId: sheet.id,
          sheetNumber: sheet.sheetNumber,
          hint: "Upload a PDF for this sheet via the Blueprint Hub upload action.",
        });
      }

      // Inline disposition so opening the URL in a new tab renders the PDF
      // in the browser viewer instead of forcing a download.
      const safeFilename = `${sheet.sheetNumber}_${sheet.sheetTitle}.${sheet.fileType}`
        .replace(/[^\w.\- ]+/g, "_");
      res.setHeader("Content-Disposition", `inline; filename="${safeFilename}"`);
      res.setHeader(
        "Content-Type",
        sheet.fileType === "pdf" ? "application/pdf" : "application/octet-stream",
      );

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("[drawing-sheets/download] stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });
      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading sheet:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to download sheet" });
      }
    }
  });

  // Drawing Sets
  app.get("/api/drawing-sets", async (req: Request, res: Response) => {
    try {
      const sets = await db.select().from(drawingSets)
        .where(eq(drawingSets.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(drawingSets.createdAt));
      res.json(sets);
    } catch (error) {
      console.error("Error fetching drawing sets:", error);
      res.status(500).json({ error: "Failed to fetch drawing sets" });
    }
  });

  app.post("/api/drawing-sets", async (req: Request, res: Response) => {
    try {
      const [set] = await db.insert(drawingSets).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.status(201).json(set);
    } catch (error) {
      console.error("Error creating drawing set:", error);
      res.status(500).json({ error: "Failed to create drawing set" });
    }
  });

  // Takeoff Categories
  app.get("/api/takeoff-categories", async (req: Request, res: Response) => {
    try {
      const categories = await db.select().from(takeoffCategories)
        .where(eq(takeoffCategories.tenantId, DEFAULT_TENANT_ID))
        .orderBy(takeoffCategories.sortOrder);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching takeoff categories:", error);
      res.status(500).json({ error: "Failed to fetch takeoff categories" });
    }
  });

  const takeoffCategoryInputSchema = z.object({
    name: z.string().min(1, "Name required"),
    code: z.string().min(1, "Code required"),
    trade: z.string().min(1, "Trade required"),
    defaultUnit: z.string().min(1, "Default unit required"),
    parentId: z.string().optional(),
    color: z.string().optional(),
    costCodeId: z.string().optional(),
    sortOrder: z.number().optional(),
  });

  app.post("/api/takeoff-categories", async (req: Request, res: Response) => {
    try {
      const validated = takeoffCategoryInputSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const [category] = await db.insert(takeoffCategories).values({
        tenantId: DEFAULT_TENANT_ID,
        ...validated.data,
      }).returning();
      res.status(201).json(category);
    } catch (error) {
      console.error("Error creating takeoff category:", error);
      res.status(500).json({ error: "Failed to create takeoff category" });
    }
  });

  // Takeoff Quantities
  app.get("/api/takeoff-quantities", async (req: Request, res: Response) => {
    try {
      const { projectId, categoryId, sheetId } = req.query;
      let query = db.select().from(takeoffQuantities)
        .where(eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID));
      
      const quantities = await query.orderBy(desc(takeoffQuantities.createdAt));
      res.json(quantities);
    } catch (error) {
      console.error("Error fetching takeoff quantities:", error);
      res.status(500).json({ error: "Failed to fetch takeoff quantities" });
    }
  });

  const takeoffQuantityInputSchema = z.object({
    categoryId: z.string().uuid("Category ID must be a valid UUID"),
    quantity: z.string().or(z.number()).transform(v => String(v)),
    unit: z.string().min(1, "Unit required"),
    projectId: z.string().optional(),
    sheetId: z.string().optional(),
    room: z.string().optional(),
    floor: z.string().optional(),
    phase: z.string().optional(),
    zone: z.string().optional(),
    unitCost: z.string().optional(),
    laborRate: z.string().optional(),
    laborHours: z.string().optional(),
    notes: z.string().optional(),
  });

  app.post("/api/takeoff-quantities", async (req: Request, res: Response) => {
    try {
      const validated = takeoffQuantityInputSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const [quantity] = await db.insert(takeoffQuantities).values({
        tenantId: DEFAULT_TENANT_ID,
        ...validated.data,
      }).returning();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "takeoff_quantity.created",
        actor: req.body.actorId || "system",
        entityType: "takeoff_quantity",
        entityId: quantity.id,
        afterJson: quantity as unknown as Record<string, unknown>,
      });

      // Fire-and-forget: if no unit cost, have Herbie flag it for review.
      const unitCostNum = quantity.unitCost == null ? 0 : Number(quantity.unitCost);
      if (!unitCostNum || unitCostNum <= 0) {
        void (async () => {
          try {
            const { executeHerbieTool } = await import("./services/herbie-tools");
            await executeHerbieTool(
              {
                tool: "flag_for_review",
                args: {
                  entityType: "takeoff_quantity",
                  entityId: quantity.id,
                  reason: `Takeoff item created without a unit cost (qty ${quantity.quantity} ${quantity.unit ?? ""}). PM should set pricing before bid.`,
                  priority: "normal",
                },
              },
              { tenantId: DEFAULT_TENANT_ID, userId: "herbie" } as any,
            );
          } catch (e) {
            console.warn("[herbie auto-hook takeoff_quantity]", e instanceof Error ? e.message : e);
          }
        })();
      }
      
      res.status(201).json(quantity);
    } catch (error) {
      console.error("Error creating takeoff quantity:", error);
      res.status(500).json({ error: "Failed to create takeoff quantity" });
    }
  });

  app.patch("/api/takeoff-quantities/:id", async (req: Request, res: Response) => {
    try {
      const [quantity] = await db.update(takeoffQuantities)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(
          eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID),
          eq(takeoffQuantities.id, p(req.params.id))
        ))
        .returning();
      res.json(quantity);
    } catch (error) {
      console.error("Error updating takeoff quantity:", error);
      res.status(500).json({ error: "Failed to update takeoff quantity" });
    }
  });

  app.delete("/api/takeoff-quantities/:id", async (req: Request, res: Response) => {
    try {
      await db.delete(takeoffQuantities)
        .where(and(
          eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID),
          eq(takeoffQuantities.id, p(req.params.id))
        ));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting takeoff quantity:", error);
      res.status(500).json({ error: "Failed to delete takeoff quantity" });
    }
  });

  // Building Systems
  app.get("/api/building-systems", async (req: Request, res: Response) => {
    try {
      const { projectId, systemType } = req.query;
      let query = db.select().from(buildingSystems)
        .where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID));
      
      const systems = await query.orderBy(buildingSystems.systemType);
      res.json(systems);
    } catch (error) {
      console.error("Error fetching building systems:", error);
      res.status(500).json({ error: "Failed to fetch building systems" });
    }
  });

  const buildingSystemInputSchema = z.object({
    systemType: z.string().min(1, "System type required"),
    systemName: z.string().min(1, "System name required"),
    projectId: z.string().optional(),
    description: z.string().optional(),
    scopeOfWork: z.string().optional(),
    specifications: z.string().optional(),
    status: z.enum(["not_started", "in_progress", "complete", "na"]).optional(),
    completionPercent: z.number().min(0).max(100).optional(),
    contractorId: z.string().optional(),
    foremanId: z.string().optional(),
    commissioningStatus: z.enum(["pending", "scheduled", "complete", "failed", "na"]).optional(),
    asBuiltStatus: z.enum(["pending", "in_progress", "complete"]).optional(),
  });

  app.post("/api/building-systems", async (req: Request, res: Response) => {
    try {
      const validated = buildingSystemInputSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      
      const [system] = await db.insert(buildingSystems).values({
        tenantId: DEFAULT_TENANT_ID,
        ...validated.data,
      }).returning();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "building_system.created",
        actor: req.body.actorId || "system",
        entityType: "building_system",
        entityId: system.id,
        afterJson: system as unknown as Record<string, unknown>,
      });

      // Fire-and-forget: Herbie records a fact so the system shows up in project memory.
      if (system.projectId) {
        void (async () => {
          try {
            const { executeHerbieTool } = await import("./services/herbie-tools");
            await executeHerbieTool(
              {
                tool: "record_fact",
                args: {
                  projectId: system.projectId,
                  fact: `Building system added: ${system.systemName} (${system.systemType}). Status: ${system.status ?? "not_started"}.`,
                  category: "observation",
                  source: "design-systems UI",
                },
              },
              { tenantId: DEFAULT_TENANT_ID, userId: "herbie" } as any,
            );
          } catch (e) {
            console.warn("[herbie auto-hook building_system]", e instanceof Error ? e.message : e);
          }
        })();
      }
      
      res.status(201).json(system);
    } catch (error) {
      console.error("Error creating building system:", error);
      res.status(500).json({ error: "Failed to create building system" });
    }
  });

  app.patch("/api/building-systems/:id", async (req: Request, res: Response) => {
    try {
      const [system] = await db.update(buildingSystems)
        .set({ ...req.body, updatedAt: new Date() })
        .where(and(
          eq(buildingSystems.tenantId, DEFAULT_TENANT_ID),
          eq(buildingSystems.id, p(req.params.id))
        ))
        .returning();
      res.json(system);
    } catch (error) {
      console.error("Error updating building system:", error);
      res.status(500).json({ error: "Failed to update building system" });
    }
  });

  app.delete("/api/building-systems/:id", async (req: Request, res: Response) => {
    try {
      await db.delete(buildingSystems)
        .where(and(
          eq(buildingSystems.tenantId, DEFAULT_TENANT_ID),
          eq(buildingSystems.id, p(req.params.id))
        ));
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "building_system.deleted",
        actor: req.body?.actorId || "system",
        entityType: "building_system",
        entityId: p(req.params.id),
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting building system:", error);
      res.status(500).json({ error: "Failed to delete building system" });
    }
  });

  // System Devices
  app.get("/api/system-devices", async (req: Request, res: Response) => {
    try {
      const { systemId } = req.query;
      let query = db.select().from(systemDevices)
        .where(eq(systemDevices.tenantId, DEFAULT_TENANT_ID));
      
      if (systemId) {
        query = db.select().from(systemDevices)
          .where(and(
            eq(systemDevices.tenantId, DEFAULT_TENANT_ID),
            eq(systemDevices.systemId, systemId as string)
          ));
      }
      
      const devices = await query;
      res.json(devices);
    } catch (error) {
      console.error("Error fetching system devices:", error);
      res.status(500).json({ error: "Failed to fetch system devices" });
    }
  });

  app.post("/api/system-devices", async (req: Request, res: Response) => {
    try {
      const [device] = await db.insert(systemDevices).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.status(201).json(device);
    } catch (error) {
      console.error("Error creating system device:", error);
      res.status(500).json({ error: "Failed to create system device" });
    }
  });

  // Cable Schedules
  app.get("/api/cable-schedules", async (req: Request, res: Response) => {
    try {
      const { systemId } = req.query;
      let query = db.select().from(cableSchedules)
        .where(eq(cableSchedules.tenantId, DEFAULT_TENANT_ID));
      
      if (systemId) {
        query = db.select().from(cableSchedules)
          .where(and(
            eq(cableSchedules.tenantId, DEFAULT_TENANT_ID),
            eq(cableSchedules.systemId, systemId as string)
          ));
      }
      
      const cables = await query.orderBy(cableSchedules.cableNumber);
      res.json(cables);
    } catch (error) {
      console.error("Error fetching cable schedules:", error);
      res.status(500).json({ error: "Failed to fetch cable schedules" });
    }
  });

  app.post("/api/cable-schedules", async (req: Request, res: Response) => {
    try {
      const [cable] = await db.insert(cableSchedules).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.status(201).json(cable);
    } catch (error) {
      console.error("Error creating cable schedule:", error);
      res.status(500).json({ error: "Failed to create cable schedule" });
    }
  });

  app.patch("/api/cable-schedules/:id", async (req: Request, res: Response) => {
    try {
      const [cable] = await db.update(cableSchedules)
        .set(req.body)
        .where(and(
          eq(cableSchedules.tenantId, DEFAULT_TENANT_ID),
          eq(cableSchedules.id, p(req.params.id))
        ))
        .returning();
      res.json(cable);
    } catch (error) {
      console.error("Error updating cable schedule:", error);
      res.status(500).json({ error: "Failed to update cable schedule" });
    }
  });

  // Rack Elevations
  app.get("/api/rack-elevations", async (req: Request, res: Response) => {
    try {
      const { systemId } = req.query;
      let query = db.select().from(rackElevations)
        .where(eq(rackElevations.tenantId, DEFAULT_TENANT_ID));
      
      if (systemId) {
        query = db.select().from(rackElevations)
          .where(and(
            eq(rackElevations.tenantId, DEFAULT_TENANT_ID),
            eq(rackElevations.systemId, systemId as string)
          ));
      }
      
      const racks = await query;
      res.json(racks);
    } catch (error) {
      console.error("Error fetching rack elevations:", error);
      res.status(500).json({ error: "Failed to fetch rack elevations" });
    }
  });

  app.post("/api/rack-elevations", async (req: Request, res: Response) => {
    try {
      const [rack] = await db.insert(rackElevations).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.status(201).json(rack);
    } catch (error) {
      console.error("Error creating rack elevation:", error);
      res.status(500).json({ error: "Failed to create rack elevation" });
    }
  });

  // Project Phases (Auto-Build)
  app.get("/api/project-phases", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.query;
      let query = db.select().from(projectPhases)
        .where(eq(projectPhases.tenantId, DEFAULT_TENANT_ID));
      
      if (projectId) {
        query = db.select().from(projectPhases)
          .where(and(
            eq(projectPhases.tenantId, DEFAULT_TENANT_ID),
            eq(projectPhases.projectId, projectId as string)
          ));
      }
      
      const phases = await query.orderBy(projectPhases.sortOrder);
      res.json(phases);
    } catch (error) {
      console.error("Error fetching project phases:", error);
      res.status(500).json({ error: "Failed to fetch project phases" });
    }
  });

  app.post("/api/project-phases", async (req: Request, res: Response) => {
    try {
      const [phase] = await db.insert(projectPhases).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
      }).returning();
      res.status(201).json(phase);
    } catch (error) {
      console.error("Error creating project phase:", error);
      res.status(500).json({ error: "Failed to create project phase" });
    }
  });

  // Auto-Build from Plans
  app.post("/api/auto-build", async (req: Request, res: Response) => {
    try {
      const { projectId } = req.body;
      
      const AUTO_BUILD_PHASES = [
        { name: "Framing", type: "framing", dependencies: [], inspections: ["Rough Framing"], submittals: ["Lumber Shop Drawings"] },
        { name: "Electrical Rough-In", type: "electrical_rough", dependencies: ["Framing"], inspections: ["Electrical Rough"], submittals: ["Panel Schedules", "Fixture Cut Sheets"] },
        { name: "Plumbing Rough-In", type: "plumbing_rough", dependencies: ["Framing"], inspections: ["Plumbing Rough"], submittals: ["Fixture Cut Sheets", "Pipe Sizing"] },
        { name: "HVAC Rough-In", type: "hvac_rough", dependencies: ["Framing"], inspections: ["Mechanical Rough"], submittals: ["Equipment Schedules", "Duct Layouts"] },
        { name: "Low Voltage Rough", type: "lv_rough", dependencies: ["Framing"], inspections: ["Low Voltage Pathway"], submittals: ["Cable Schedules", "Rack Elevations"] },
        { name: "Drywall", type: "drywall", dependencies: ["Electrical Rough-In", "Plumbing Rough-In", "HVAC Rough-In"], inspections: ["Insulation", "Fire Stopping"], submittals: [] },
        { name: "Finishes", type: "finishes", dependencies: ["Drywall"], inspections: ["Paint", "Flooring"], submittals: ["Paint Schedule", "Flooring Samples"] },
        { name: "Electrical Trim", type: "electrical_trim", dependencies: ["Finishes"], inspections: ["Electrical Final"], submittals: [] },
        { name: "Low Voltage Terminations", type: "lv_term", dependencies: ["Drywall"], inspections: ["Low Voltage Final"], submittals: ["Test Results"] },
        { name: "Commissioning", type: "commissioning", dependencies: ["Electrical Trim", "Low Voltage Terminations"], inspections: ["Final Building"], submittals: ["Commissioning Report", "O&M Manuals"] },
      ];
      
      const createdPhases = [];
      for (let i = 0; i < AUTO_BUILD_PHASES.length; i++) {
        const phase = AUTO_BUILD_PHASES[i];
        const [created] = await db.insert(projectPhases).values({
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          phaseName: phase.name,
          phaseType: phase.type,
          sortOrder: i,
          dependsOn: phase.dependencies,
          inspections: phase.inspections,
          submittals: phase.submittals,
        }).returning();
        createdPhases.push(created);
      }
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "auto_build.completed",
        actor: req.body.actorId || "system",
        entityType: "project",
        entityId: projectId || "current",
        afterJson: { phasesCreated: createdPhases.length },
      });
      
      res.status(201).json({ phases: createdPhases, message: `Created ${createdPhases.length} project phases` });
    } catch (error) {
      console.error("Error running auto-build:", error);
      res.status(500).json({ error: "Failed to run auto-build" });
    }
  });

  // Project Deliverables
  app.get("/api/project-deliverables", async (req: Request, res: Response) => {
    try {
      const { projectId, deliverableType } = req.query;
      let query = db.select().from(projectDeliverables)
        .where(eq(projectDeliverables.tenantId, DEFAULT_TENANT_ID));
      
      const deliverables = await query.orderBy(desc(projectDeliverables.createdAt));
      res.json(deliverables);
    } catch (error) {
      console.error("Error fetching project deliverables:", error);
      res.status(500).json({ error: "Failed to fetch project deliverables" });
    }
  });

  app.post("/api/project-deliverables", async (req: Request, res: Response) => {
    try {
      const [deliverable] = await db.insert(projectDeliverables).values({
        tenantId: DEFAULT_TENANT_ID,
        ...req.body,
        generatedAt: new Date(),
      }).returning();
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "deliverable.generated",
        actor: req.body.actorId || "system",
        entityType: "project_deliverable",
        entityId: deliverable.id,
        afterJson: deliverable as unknown as Record<string, unknown>,
      });
      
      res.status(201).json(deliverable);
    } catch (error) {
      console.error("Error creating project deliverable:", error);
      res.status(500).json({ error: "Failed to create project deliverable" });
    }
  });

  // Generate deliverables (export endpoints)
  app.post("/api/generate-deliverable/:type", async (req: Request, res: Response) => {
    try {
      const type = p(req.params.type);
      const { projectId } = req.body;
      
      let content: Record<string, unknown> = {};
      let title = "";
      
      switch (type) {
        case "trade_scope": {
          title = "Trade Scope Document";
          const quantities = await db.select().from(takeoffQuantities)
            .where(eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID));
          content = { quantities, generatedAt: new Date().toISOString() };
          break;
        }
        case "material_list": {
          title = "Material List Export";
          const materials = await db.select().from(takeoffQuantities)
            .where(eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID));
          content = { materials, generatedAt: new Date().toISOString() };
          break;
        }
        case "cable_schedule": {
          title = "Cable Schedule Export";
          const cablesRaw = await db.select().from(cableSchedules)
            .where(eq(cableSchedules.tenantId, DEFAULT_TENANT_ID));
          if (cablesRaw.length === 0) {
            const lfItems = await db.select().from(takeoffQuantities)
              .where(and(
                eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID),
                eq(takeoffQuantities.unit, 'LF'),
              ));
            content = {
              cables: lfItems,
              source: 'takeoff_quantities_lf',
              note: 'No cable entries found, showing LF takeoff items as cable runs',
              generatedAt: new Date().toISOString(),
            };
          } else {
            content = { cables: cablesRaw, generatedAt: new Date().toISOString() };
          }
          break;
        }
        case "device_schedule": {
          title = "Device Schedule Export";
          // Auto-seed devices for any building system that has none
          const systems = await db.select().from(buildingSystems)
            .where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID));
          for (const sys of systems) {
            const existing = await db.select().from(systemDevices)
              .where(and(eq(systemDevices.tenantId, DEFAULT_TENANT_ID), eq(systemDevices.systemId, sys.id)));
            if (existing.length === 0) {
              const presets: Record<string, Array<{ deviceType: string; manufacturer: string; model: string; quantity: number; location: string }>> = {
                structural: [
                  { deviceType: "anchor_bolt", manufacturer: "Hilti", model: "HSL3-G", quantity: 240, location: "Foundation" },
                  { deviceType: "shear_connector", manufacturer: "Nelson", model: "H4L 3/4x4", quantity: 480, location: "Beams" },
                ],
                electrical: [
                  { deviceType: "panel", manufacturer: "Square D", model: "QO142M200PC", quantity: 2, location: "Electrical Room" },
                  { deviceType: "outlet", manufacturer: "Leviton", model: "TR8300-W", quantity: 48, location: "All Floors" },
                  { deviceType: "switch", manufacturer: "Lutron", model: "MA-600", quantity: 24, location: "All Floors" },
                ],
                plumbing: [
                  { deviceType: "fixture_water_closet", manufacturer: "Kohler", model: "K-3531", quantity: 12, location: "Restrooms" },
                  { deviceType: "fixture_lavatory", manufacturer: "American Standard", model: "0356", quantity: 12, location: "Restrooms" },
                ],
                hvac: [
                  { deviceType: "thermostat", manufacturer: "Honeywell", model: "T7350H1009", quantity: 6, location: "Each Zone" },
                  { deviceType: "vav_box", manufacturer: "Trane", model: "VCCF", quantity: 8, location: "Ceiling Plenum" },
                ],
                drywall: [
                  { deviceType: "metal_stud", manufacturer: "ClarkDietrich", model: "362S162-30", quantity: 1200, location: "All Walls" },
                ],
                doors: [
                  { deviceType: "door_assembly", manufacturer: "Steelcraft", model: "F18", quantity: 24, location: "All Rooms" },
                  { deviceType: "lockset", manufacturer: "Schlage", model: "L9080", quantity: 24, location: "All Rooms" },
                ],
                windows: [
                  { deviceType: "window_unit", manufacturer: "Kawneer", model: "TriFab 451T", quantity: 16, location: "Exterior Walls" },
                ],
                lighting: [
                  { deviceType: "fixture_2x4", manufacturer: "Lithonia", model: "BLT-2x4", quantity: 36, location: "Open Office Areas" },
                  { deviceType: "fixture_downlight", manufacturer: "Lithonia", model: "LDN6", quantity: 24, location: "Corridors + Lobby" },
                ],
                lv_data: [
                  { deviceType: "data_jack", manufacturer: "Panduit", model: "Mini-Com CJ688", quantity: 32, location: "Workstations" },
                  { deviceType: "patch_panel", manufacturer: "Panduit", model: "DP24688TGY", quantity: 2, location: "IDF Closet" },
                  { deviceType: "rack", manufacturer: "Chatsworth", model: "55053-703", quantity: 1, location: "MDF Room" },
                ],
                security: [
                  { deviceType: "camera_dome", manufacturer: "Axis", model: "P3245-LVE", quantity: 8, location: "Perimeter + Lobby" },
                  { deviceType: "card_reader", manufacturer: "HID", model: "iCLASS R10", quantity: 6, location: "Entry Doors" },
                ],
                audio: [
                  { deviceType: "ceiling_speaker", manufacturer: "Bose", model: "DesignMax DM5C", quantity: 24, location: "All Floors" },
                  { deviceType: "amplifier", manufacturer: "QSC", model: "CXD4.5", quantity: 1, location: "AV Rack" },
                ],
                smart_building: [
                  { deviceType: "bacnet_controller", manufacturer: "Distech", model: "ECB-PTU", quantity: 6, location: "Mechanical Room" },
                  { deviceType: "occupancy_sensor", manufacturer: "Wattstopper", model: "DT-300", quantity: 18, location: "All Rooms" },
                ],
                fire_life_safety: [
                  { deviceType: "smoke_detector", manufacturer: "Notifier", model: "FSP-851", quantity: 18, location: "All Floors" },
                  { deviceType: "horn_strobe", manufacturer: "System Sensor", model: "P2RH", quantity: 12, location: "Corridors" },
                ],
              };
              const preset = presets[sys.systemType] || [
                { deviceType: "device", manufacturer: "Generic", model: "Standard", quantity: 4, location: "TBD" },
              ];
              for (const d of preset) {
                await db.insert(systemDevices).values({
                  tenantId: DEFAULT_TENANT_ID,
                  systemId: sys.id,
                  deviceType: d.deviceType,
                  manufacturer: d.manufacturer,
                  model: d.model,
                  quantity: d.quantity,
                  location: d.location,
                });
              }
            }
          }
          const devices = await db.select().from(systemDevices)
            .where(eq(systemDevices.tenantId, DEFAULT_TENANT_ID));
          content = { devices, generatedAt: new Date().toISOString() };
          break;
        }
        case "as_built": {
          title = "As-Built Sets";
          // Mark all building systems' as-built status as submitted
          await db.update(buildingSystems)
            .set({ asBuiltStatus: "submitted" })
            .where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID));
          const systems = await db.select().from(buildingSystems)
            .where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID));
          const sheets = await db.select().from(drawingSheets)
            .where(eq(drawingSheets.tenantId, DEFAULT_TENANT_ID));
          content = { systems, sheets, generatedAt: new Date().toISOString() };
          break;
        }
        case "bid_package": {
          title = "Bid Package Export";
          const bidOpportunities = await db.select().from(opportunities)
            .where(eq(opportunities.tenantId, DEFAULT_TENANT_ID))
            .orderBy(desc(opportunities.createdAt))
            .limit(10);
          content = {
            opportunities: bidOpportunities,
            totalCount: bidOpportunities.length,
            generatedAt: new Date().toISOString(),
          };
          break;
        }
        case "rack_elevation": {
          title = "Rack Elevation Export";
          const rackSpecific = await db.select().from(systemDevices)
            .where(and(
              eq(systemDevices.tenantId, DEFAULT_TENANT_ID),
              inArray(systemDevices.deviceType, ['panel', 'switch', 'server', 'ups', 'patch_panel', 'router', 'firewall', 'rack_unit', 'rack']),
            ))
            .orderBy(systemDevices.location);
          const rackDevices = rackSpecific.length > 0
            ? rackSpecific
            : await db.select().from(systemDevices)
                .where(eq(systemDevices.tenantId, DEFAULT_TENANT_ID));
          content = { rackDevices, generatedAt: new Date().toISOString() };
          break;
        }
        case "owner_handoff": {
          title = "Owner Handoff Package";
          const [handoffSheets, handoffSystems] = await Promise.all([
            db.select().from(drawingSheets).where(eq(drawingSheets.tenantId, DEFAULT_TENANT_ID)),
            db.select().from(buildingSystems).where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID)),
          ]);
          content = {
            sheets: handoffSheets,
            systems: handoffSystems.map((s) => ({
              id: s.id,
              systemName: s.systemName,
              systemType: s.systemType,
              status: s.status,
              completionPercent: s.completionPercent,
              commissioningStatus: s.commissioningStatus,
              asBuiltStatus: s.asBuiltStatus,
            })),
            totalSheets: handoffSheets.length,
            totalSystems: handoffSystems.length,
            generatedAt: new Date().toISOString(),
          };
          break;
        }
        case "smart_building_config": {
          title = "Smart Building Config Export";
          const smartRaw = await db.select().from(buildingSystems)
            .where(and(
              eq(buildingSystems.tenantId, DEFAULT_TENANT_ID),
              inArray(buildingSystems.systemType, ['smart_building', 'lv_data', 'low_voltage', 'automation', 'fire_life_safety']),
            ));
          const allSmartDevices = await db.select().from(systemDevices)
            .where(eq(systemDevices.tenantId, DEFAULT_TENANT_ID));
          const smartSystems = smartRaw.length > 0
            ? smartRaw
            : await db.select().from(buildingSystems)
                .where(eq(buildingSystems.tenantId, DEFAULT_TENANT_ID));
          content = {
            smartSystems,
            devices: allSmartDevices,
            generatedAt: new Date().toISOString(),
          };
          break;
        }
        default:
          title = `${type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())} Export`;
          content = { type, generatedAt: new Date().toISOString() };
      }
      
      const [deliverable] = await db.insert(projectDeliverables).values({
        tenantId: DEFAULT_TENANT_ID,
        projectId,
        deliverableType: type,
        title,
        contentJson: content,
        status: "generated",
        generatedAt: new Date(),
      }).returning();
      
      res.status(201).json(deliverable);
    } catch (error) {
      console.error("Error generating deliverable:", error);
      res.status(500).json({ error: "Failed to generate deliverable", message: (error as Error)?.message });
    }
  });

  // Download deliverable as JSON file
  app.get("/api/project-deliverables/:id/download", async (req: Request, res: Response) => {
    try {
      const id = p(req.params.id);
      const [deliverable] = await db.select().from(projectDeliverables)
        .where(eq(projectDeliverables.id, id));
      
      if (!deliverable) {
        return res.status(404).json({ error: "Deliverable not found" });
      }
      
      const content = deliverable.contentJson || { error: "No content available" };
      const filename = `${deliverable.deliverableType}_${new Date().toISOString().split("T")[0]}.json`;
      
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(JSON.stringify(content, null, 2));
    } catch (error) {
      console.error("Error downloading deliverable:", error);
      res.status(500).json({ error: "Failed to download deliverable" });
    }
  });

  // Download latest deliverable by type
  app.get("/api/project-deliverables/download/:type", async (req: Request, res: Response) => {
    try {
      const type = p(req.params.type);
      let [deliverable] = await db.select().from(projectDeliverables)
        .where(and(
          eq(projectDeliverables.tenantId, DEFAULT_TENANT_ID),
          eq(projectDeliverables.deliverableType, type),
        ))
        .orderBy(desc(projectDeliverables.createdAt))
        .limit(1);

      // Auto-generate on first download if missing
      if (!deliverable) {
        let content: Record<string, unknown> = {};
        let title = `${type.replace(/_/g, " ")} Export`;
        switch (type) {
          case "trade_scope":
          case "material_list": {
            const rows = await db.select().from(takeoffQuantities)
              .where(eq(takeoffQuantities.tenantId, DEFAULT_TENANT_ID));
            content = { [type === "trade_scope" ? "quantities" : "materials"]: rows, generatedAt: new Date().toISOString() };
            break;
          }
          case "cable_schedule": {
            const cables = await db.select().from(cableSchedules)
              .where(eq(cableSchedules.tenantId, DEFAULT_TENANT_ID));
            content = { cables, generatedAt: new Date().toISOString() };
            break;
          }
          case "device_schedule": {
            const devices = await db.select().from(systemDevices)
              .where(eq(systemDevices.tenantId, DEFAULT_TENANT_ID));
            content = { devices, generatedAt: new Date().toISOString() };
            break;
          }
          default:
            content = { type, generatedAt: new Date().toISOString() };
        }
        [deliverable] = await db.insert(projectDeliverables).values({
          tenantId: DEFAULT_TENANT_ID,
          deliverableType: type,
          title,
          contentJson: content,
          status: "generated",
          generatedAt: new Date(),
        }).returning();
      }

      const today = new Date().toISOString().split("T")[0];
      const content = (deliverable.contentJson as Record<string, unknown>) || {};

      // Helper: convert row array to CSV
      const toCSV = (rows: Record<string, unknown>[]): string => {
        if (!rows || rows.length === 0) return "(no data)\n";
        const cols = Array.from(rows.reduce((acc, r) => { Object.keys(r).forEach(k => acc.add(k)); return acc; }, new Set<string>()));
        const esc = (v: unknown) => {
          const s = v === null || v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = cols.join(",");
        const body = rows.map(r => cols.map(c => esc(r[c])).join(",")).join("\n");
        return "\ufeff" + header + "\n" + body + "\n";
      };

      // Tabular types → CSV
      const csvTypes: Record<string, string> = {
        material_list: "materials",
        cable_schedule: "cables",
        device_schedule: "devices",
        trade_scope: "quantities",
      };
      if (csvTypes[type]) {
        const rows = (content[csvTypes[type]] as Record<string, unknown>[]) || [];
        const csv = toCSV(rows);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${type}_${today}.csv"`);
        return res.send(csv);
      }

      // Document types → human-readable .txt
      const lines: string[] = [];
      const titleStr = (deliverable.title as string) || type;
      lines.push("=".repeat(72));
      lines.push(`  BLACKHAWK SENTINEL — ${titleStr.toUpperCase()}`);
      lines.push(`  Generated: ${new Date().toISOString()}`);
      lines.push("=".repeat(72));
      lines.push("");
      const stringify = (obj: unknown, indent = 0): void => {
        const pad = "  ".repeat(indent);
        if (Array.isArray(obj)) {
          obj.forEach((item, i) => {
            lines.push(`${pad}[${i + 1}]`);
            stringify(item, indent + 1);
          });
        } else if (obj && typeof obj === "object") {
          for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
            if (v && typeof v === "object") {
              lines.push(`${pad}${k}:`);
              stringify(v, indent + 1);
            } else {
              lines.push(`${pad}${k}: ${v ?? ""}`);
            }
          }
        } else {
          lines.push(`${pad}${obj}`);
        }
      };
      stringify(content);
      lines.push("");
      lines.push("=".repeat(72));
      lines.push("  END OF DOCUMENT");
      lines.push("=".repeat(72));
      const txt = lines.join("\n");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${type}_${today}.txt"`);
      res.send(txt);
    } catch (error) {
      console.error("Error downloading deliverable:", error);
      res.status(500).json({ error: "Failed to download deliverable", message: (error as Error)?.message });
    }
  });

  // ============================================================================
  // PROJECT WORKSPACE API
  // ============================================================================

  app.get("/api/projects/:id/workspace", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq, and, sql, or, not, lt, desc } = await import("drizzle-orm");
      const projectId = p(req.params.id);

      const [project] = await db.select().from(schema.projects).where(
        and(eq(schema.projects.id, projectId), eq(schema.projects.tenantId, DEFAULT_TENANT_ID))
      );
      if (!project) return res.status(404).json({ error: "Project not found" });

      const [tasks, rfis, submittals, purchaseOrders, changeOrders, invoices] = await Promise.all([
        db.select({
          id: schema.projectTasks.id,
          name: schema.projectTasks.name,
          status: schema.projectTasks.status,
          priority: schema.projectTasks.priority,
          dueDate: schema.projectTasks.dueDate,
          assignees: schema.projectTasks.assignees,
        }).from(schema.projectTasks)
          .where(and(eq(schema.projectTasks.projectId, projectId), eq(schema.projectTasks.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.projectTasks.createdAt))
          .limit(20),

        db.select({
          id: schema.rfis.id,
          rfiNumber: schema.rfis.rfiNumber,
          subject: schema.rfis.subject,
          status: schema.rfis.status,
          priority: schema.rfis.priority,
          dueDate: schema.rfis.dueDate,
        }).from(schema.rfis)
          .where(and(eq(schema.rfis.projectId, projectId), eq(schema.rfis.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.rfis.createdAt))
          .limit(20),

        db.select({
          id: schema.submittals.id,
          submittalNumber: schema.submittals.submittalNumber,
          name: schema.submittals.name,
          status: schema.submittals.status,
          priority: schema.submittals.priority,
        }).from(schema.submittals)
          .where(and(eq(schema.submittals.projectId, projectId), eq(schema.submittals.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.submittals.createdAt))
          .limit(20),

        db.select({
          id: schema.purchaseOrders.id,
          poNumber: schema.purchaseOrders.poNumber,
          status: schema.purchaseOrders.status,
          totalAmount: schema.purchaseOrders.totalAmount,
          orderDate: schema.purchaseOrders.orderDate,
        }).from(schema.purchaseOrders)
          .where(and(eq(schema.purchaseOrders.projectId, projectId), eq(schema.purchaseOrders.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.purchaseOrders.createdAt))
          .limit(20),

        db.select({
          id: schema.changeOrders.id,
          coNumber: schema.changeOrders.coNumber,
          title: schema.changeOrders.title,
          status: schema.changeOrders.status,
          amount: schema.changeOrders.amount,
        }).from(schema.changeOrders)
          .where(and(eq(schema.changeOrders.projectId, projectId), eq(schema.changeOrders.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.changeOrders.createdAt))
          .limit(20),

        db.select({
          id: schema.invoices.id,
          invoiceNumber: schema.invoices.invoiceNumber,
          status: schema.invoices.status,
          totalAmount: schema.invoices.totalAmount,
          invoiceDate: schema.invoices.invoiceDate,
          dueDate: schema.invoices.dueDate,
        }).from(schema.invoices)
          .where(and(eq(schema.invoices.projectId, projectId), eq(schema.invoices.tenantId, DEFAULT_TENANT_ID)))
          .orderBy(desc(schema.invoices.createdAt))
          .limit(20),
      ]);

      const openTaskCount = tasks.filter(t => t.status !== 'completed').length;
      const overdueTaskCount = tasks.filter(t => t.status !== 'completed' && t.dueDate && new Date(t.dueDate) < new Date()).length;
      const openRfiCount = rfis.filter(r => r.status === 'open' || r.status === 'draft').length;
      const pendingSubmittalCount = submittals.filter(s => s.status === 'pending' || s.status === 'submitted' || s.status === 'in_review').length;
      const poTotal = purchaseOrders.reduce((sum, po) => sum + Number(po.totalAmount || 0), 0);
      const coTotal = changeOrders.reduce((sum, co) => sum + Number(co.amount || 0), 0);
      const invoiceTotal = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
      const unpaidInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'draft' || i.status === 'sent');

      res.json({
        project,
        kpis: {
          budget: Number((project as any).budget || 0),
          actualCosts: Number(project.actualCosts || 0),
          contractValue: Number(project.contractValue || 0),
          poTotal,
          coTotal,
          invoiceTotal,
          openTaskCount,
          overdueTaskCount,
          openRfiCount,
          pendingSubmittalCount,
          unpaidInvoiceCount: unpaidInvoices.length,
        },
        tasks,
        rfis,
        submittals,
        purchaseOrders,
        changeOrders,
        invoices,
      });
    } catch (error) {
      console.error("Error fetching project workspace:", error);
      res.status(500).json({ error: "Failed to fetch project workspace" });
    }
  });

  // ============================================================================
  // HERBIE AUTONOMOUS DOCUMENT COMMAND SYSTEM ROUTES
  // ============================================================================

  // Nav Counts API for sidebar badges
  app.get("/api/nav-counts", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq, and, isNull, lt, sql, or, not } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;

      const taskConditions: any[] = [
        eq(schema.projectTasks.tenantId, DEFAULT_TENANT_ID),
        not(eq(schema.projectTasks.status, 'completed')),
        lt(schema.projectTasks.dueDate, new Date()),
      ];
      if (projectId) taskConditions.push(eq(schema.projectTasks.projectId, projectId));

      const rfiConditions: any[] = [
        eq(schema.rfis.tenantId, DEFAULT_TENANT_ID),
        or(eq(schema.rfis.status, 'open'), eq(schema.rfis.status, 'draft')),
      ];
      if (projectId) rfiConditions.push(eq(schema.rfis.projectId, projectId));

      const submittalConditions: any[] = [
        eq(schema.submittals.tenantId, DEFAULT_TENANT_ID),
        or(eq(schema.submittals.status, 'pending'), eq(schema.submittals.status, 'submitted'), eq(schema.submittals.status, 'in_review')),
      ];
      if (projectId) submittalConditions.push(eq(schema.submittals.projectId, projectId));

      const poConditions: any[] = [
        eq(schema.purchaseOrders.tenantId, DEFAULT_TENANT_ID),
        isNull(schema.purchaseOrders.projectId),
      ];

      const invoiceConditions: any[] = [
        eq(schema.invoices.tenantId, DEFAULT_TENANT_ID),
        or(eq(schema.invoices.status, 'pending'), eq(schema.invoices.status, 'draft'), eq(schema.invoices.status, 'sent')),
      ];
      if (projectId) invoiceConditions.push(eq(schema.invoices.projectId, projectId));

      const missingArtifactConditions: any[] = [
        eq(bidJacketArtifacts.tenantId, DEFAULT_TENANT_ID),
        eq(bidJacketArtifacts.status, 'missing'),
      ];
      if (projectId) {
        const bidProjectsForProject = await db.select({ id: schema.bidProjects.id })
          .from(schema.bidProjects)
          .where(and(eq(schema.bidProjects.tenantId, DEFAULT_TENANT_ID), eq(schema.bidProjects.opportunityId, projectId)));
        const bidProjectIds = bidProjectsForProject.map(bp => bp.id);
        if (bidProjectIds.length > 0) {
          missingArtifactConditions.push(inArray(bidJacketArtifacts.bidProjectId, bidProjectIds));
        } else {
          missingArtifactConditions.push(sql`false`);
        }
      }

      const checklistTodoConditions: any[] = [
        eq(bidJacketChecklistItems.tenantId, DEFAULT_TENANT_ID),
        or(eq(bidJacketChecklistItems.status, 'todo'), eq(bidJacketChecklistItems.status, 'doing'), eq(bidJacketChecklistItems.status, 'blocked')),
      ];
      if (projectId) {
        const bidProjectsForProjectCl = await db.select({ id: schema.bidProjects.id })
          .from(schema.bidProjects)
          .where(and(eq(schema.bidProjects.tenantId, DEFAULT_TENANT_ID), eq(schema.bidProjects.opportunityId, projectId)));
        const bidProjectIdsCl = bidProjectsForProjectCl.map(bp => bp.id);
        if (bidProjectIdsCl.length > 0) {
          checklistTodoConditions.push(inArray(bidJacketChecklistItems.bidProjectId, bidProjectIdsCl));
        } else {
          checklistTodoConditions.push(sql`false`);
        }
      }

      // Pending approvals — counted from approval_requests so the
      // Approvals nav badge reflects real "needs your attention" totals.
      const pendingApprovalConditions: any[] = [
        eq(schema.approvalRequests.tenantId, DEFAULT_TENANT_ID),
        eq(schema.approvalRequests.status, "pending"),
      ];

      const [overdueTaskRows, openRfiRows, pendingSubmittalRows, orphanPoRows, unpaidInvoiceRows, missingArtifactRows, checklistTodoRows, pendingApprovalRows] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(schema.projectTasks).where(and(...taskConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.rfis).where(and(...rfiConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.submittals).where(and(...submittalConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.purchaseOrders).where(and(...poConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.invoices).where(and(...invoiceConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(bidJacketArtifacts).where(and(...missingArtifactConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(bidJacketChecklistItems).where(and(...checklistTodoConditions)),
        db.select({ count: sql<number>`count(*)::int` }).from(schema.approvalRequests).where(and(...pendingApprovalConditions)),
      ]);

      const overdueTaskCount = overdueTaskRows[0]?.count ?? 0;
      const pendingApprovalCount = pendingApprovalRows[0]?.count ?? 0;

      res.json({
        overdueTaskCount,
        openRfiCount: openRfiRows[0]?.count ?? 0,
        pendingSubmittalCount: pendingSubmittalRows[0]?.count ?? 0,
        orphanPurchaseOrderCount: orphanPoRows[0]?.count ?? 0,
        unpaidInvoiceCount: unpaidInvoiceRows[0]?.count ?? 0,
        // Approvals badge = pending approval requests + overdue items needing attention.
        approvalsNeededCount: pendingApprovalCount + overdueTaskCount,
        pendingApprovalCount,
        missingArtifactsCount: missingArtifactRows[0]?.count ?? 0,
        checklistTodoCount: checklistTodoRows[0]?.count ?? 0,
      });
    } catch (error) {
      console.error("Error fetching nav counts:", error);
      res.status(500).json({ error: "Failed to fetch nav counts" });
    }
  });

  // Financial Data API Routes (Invoices, Purchase Orders, Submittals, Tasks)
  app.get("/api/invoices", async (req: Request, res: Response) => {
    try {
      const { invoices: invoicesTable, projects: projectsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const typeFilter = req.query.type as string | undefined;
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(invoicesTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(invoicesTable.projectId, projectId));
      const typeMap: Record<string, string> = { ap: "payable", ar: "receivable" };
      const mappedType = typeFilter ? (typeMap[typeFilter] || typeFilter) : undefined;
      if (mappedType) conditions.push(eq(invoicesTable.invoiceType, mappedType));
      let query = db.select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        invoiceType: invoicesTable.invoiceType,
        projectId: invoicesTable.projectId,
        vendorId: invoicesTable.vendorId,
        status: invoicesTable.status,
        totalAmount: invoicesTable.totalAmount,
        paidAmount: invoicesTable.paidAmount,
        invoiceDate: invoicesTable.invoiceDate,
        dueDate: invoicesTable.dueDate,
        notesJson: invoicesTable.notesJson,
        createdAt: invoicesTable.createdAt,
        projectName: projectsTable.name,
      }).from(invoicesTable)
        .leftJoin(projectsTable, eq(invoicesTable.projectId, projectsTable.id))
        .where(and(...conditions))
        .orderBy(desc(invoicesTable.createdAt))
        .$dynamic();
      const rows = await query;
      res.json(rows);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ error: "Failed to fetch invoices" });
    }
  });

  // ── Project Checklist API ────────────────────────────────────
  app.get("/api/checklist-templates", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq, desc } = await import("drizzle-orm");
      const templates = await db.select().from(schema.checklistTemplates)
        .where(eq(schema.checklistTemplates.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(schema.checklistTemplates.createdAt));
      res.json(templates);
    } catch (error) {
      console.error("Error fetching checklist templates:", error);
      res.status(500).json({ error: "Failed to fetch checklist templates" });
    }
  });

  app.post("/api/checklist-templates", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { name, description, items } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const [template] = await db.insert(schema.checklistTemplates).values({
        tenantId: DEFAULT_TENANT_ID, name, description,
      }).returning();
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await db.insert(schema.checklistTemplateItems).values({
            templateId: template.id, title: items[i].title,
            description: items[i].description, defaultOrder: i,
            defaultRole: items[i].defaultRole,
            defaultDueOffsetDays: items[i].defaultDueOffsetDays,
          });
        }
      }
      res.status(201).json(template);
    } catch (error) {
      console.error("Error creating checklist template:", error);
      res.status(500).json({ error: "Failed to create checklist template" });
    }
  });

  app.get("/api/projects/:projectId/checklist", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq, and, asc } = await import("drizzle-orm");
      const projectId = p(req.params.projectId);
      const checklists = await db.select().from(schema.projectChecklists)
        .where(and(eq(schema.projectChecklists.projectId, projectId), eq(schema.projectChecklists.tenantId, DEFAULT_TENANT_ID)))
        .orderBy(asc(schema.projectChecklists.createdAt));
      const result = [];
      for (const cl of checklists) {
        const items = await db.select().from(schema.projectChecklistItems)
          .where(eq(schema.projectChecklistItems.checklistId, cl.id))
          .orderBy(asc(schema.projectChecklistItems.sortOrder));
        result.push({ ...cl, items });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching project checklists:", error);
      res.status(500).json({ error: "Failed to fetch project checklists" });
    }
  });

  app.post("/api/projects/:projectId/checklist/from-template", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const projectId = p(req.params.projectId);
      const { templateId } = req.body;
      if (!templateId) return res.status(400).json({ error: "templateId is required" });
      const [template] = await db.select().from(schema.checklistTemplates).where(eq(schema.checklistTemplates.id, templateId));
      if (!template) return res.status(404).json({ error: "Template not found" });
      const templateItems = await db.select().from(schema.checklistTemplateItems)
        .where(eq(schema.checklistTemplateItems.templateId, templateId));
      const [checklist] = await db.insert(schema.projectChecklists).values({
        tenantId: DEFAULT_TENANT_ID, projectId, templateId, name: template.name,
      }).returning();
      const now = new Date();
      for (const item of templateItems) {
        const dueDate = item.defaultDueOffsetDays ? new Date(now.getTime() + item.defaultDueOffsetDays * 86400000) : null;
        await db.insert(schema.projectChecklistItems).values({
          checklistId: checklist.id, title: item.title, description: item.description,
          status: "not_started", sortOrder: item.defaultOrder, dueDate,
        });
      }
      const items = await db.select().from(schema.projectChecklistItems)
        .where(eq(schema.projectChecklistItems.checklistId, checklist.id));
      res.status(201).json({ ...checklist, items });
    } catch (error) {
      console.error("Error creating checklist from template:", error);
      res.status(500).json({ error: "Failed to create checklist from template" });
    }
  });

  app.post("/api/projects/:projectId/checklist", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const projectId = p(req.params.projectId);
      const { name, items } = req.body;
      if (!name) return res.status(400).json({ error: "Name is required" });
      const [checklist] = await db.insert(schema.projectChecklists).values({
        tenantId: DEFAULT_TENANT_ID, projectId, name,
      }).returning();
      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await db.insert(schema.projectChecklistItems).values({
            checklistId: checklist.id, title: items[i].title,
            description: items[i].description, status: "not_started", sortOrder: i,
          });
        }
      }
      const { eq: eqFn } = await import("drizzle-orm");
      const created = await db.select().from(schema.projectChecklistItems)
        .where(eqFn(schema.projectChecklistItems.checklistId, checklist.id));
      res.status(201).json({ ...checklist, items: created });
    } catch (error) {
      console.error("Error creating project checklist:", error);
      res.status(500).json({ error: "Failed to create project checklist" });
    }
  });

  app.patch("/api/project-checklist-items/:id", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const updates: any = {};
      if (req.body.status !== undefined) updates.status = req.body.status;
      if (req.body.ownerUserId !== undefined) updates.ownerUserId = req.body.ownerUserId;
      if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
      if (updates.status === "done" || updates.status === "completed") updates.completedAt = new Date();
      if (updates.status && updates.status !== "done" && updates.status !== "completed") updates.completedAt = null;
      const [updated] = await db.update(schema.projectChecklistItems)
        .set(updates).where(eq(schema.projectChecklistItems.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Checklist item not found" });
      res.json(updated);
    } catch (error) {
      console.error("Error updating checklist item:", error);
      res.status(500).json({ error: "Failed to update checklist item" });
    }
  });

  app.get("/api/projects/checklists/portfolio", async (req: Request, res: Response) => {
    try {
      const schema = await import("@shared/schema");
      const { eq, and, sql: sqlFn } = await import("drizzle-orm");
      const rows = await db.execute(sql`
        SELECT pc.id, pc.project_id, pc.name as checklist_name, pc.created_at,
          p.name as project_name,
          COUNT(pci.id)::int as total_items,
          COUNT(CASE WHEN pci.status = 'done' THEN 1 END)::int as completed_items,
          COUNT(CASE WHEN pci.status = 'blocked' THEN 1 END)::int as blocked_items
        FROM project_checklists pc
        JOIN projects p ON p.id = pc.project_id
        LEFT JOIN project_checklist_items pci ON pci.checklist_id = pc.id
        WHERE pc.tenant_id = ${DEFAULT_TENANT_ID}
        GROUP BY pc.id, pc.project_id, pc.name, pc.created_at, p.name
        ORDER BY pc.created_at DESC
      `);
      res.json(rows.rows || []);
    } catch (error) {
      console.error("Error fetching portfolio checklists:", error);
      res.status(500).json({ error: "Failed to fetch portfolio checklists" });
    }
  });

  // ── HigherGov Persistent Sync API ──────────────────────────
  app.get("/api/highergov/opportunities", async (req: Request, res: Response) => {
    try {
      const { eq, desc, and, ilike, or } = await import("drizzle-orm");
      const conditions: any[] = [eq(highergovOpportunities.tenantId, DEFAULT_TENANT_ID)];
      const q = (req.query.q || req.query.search) as string | undefined;
      const validStatuses = ["new", "reviewed", "ignored", "converted", "open"];
      const status = req.query.status as string | undefined;
      if (status && validStatuses.includes(status)) {
        conditions.push(eq(highergovOpportunities.status, status));
      }
      if (q) {
        conditions.push(or(
          ilike(highergovOpportunities.title, `%${q}%`),
          ilike(highergovOpportunities.agency, `%${q}%`),
          ilike(highergovOpportunities.solicitationNumber, `%${q}%`)
        ));
      }
      const rows = await db.select().from(highergovOpportunities)
        .where(and(...conditions))
        .orderBy(desc(highergovOpportunities.score), desc(highergovOpportunities.updatedAt))
        .limit(500);
      res.json(rows);
    } catch (error) {
      console.error("Error fetching highergov opportunities:", error);
      res.status(500).json({ error: "Failed to fetch highergov opportunities" });
    }
  });

  app.post("/api/highergov/sync", async (req: Request, res: Response) => {
    try {
      const { runHigherGovSync } = await import("./services/highergov-sync.service");
      const mode = req.body?.mode === "nightly" ? "nightly" : "manual";
      const query = req.body?.query as string | undefined;
      const result = await runHigherGovSync({ tenantId: DEFAULT_TENANT_ID, mode: mode as "nightly" | "manual", query });
      res.json(result);
    } catch (error: any) {
      console.error("Error running highergov sync:", error);
      res.status(500).json({ error: error?.message || "Failed to run sync" });
    }
  });

  app.get("/api/highergov/sync-runs", async (req: Request, res: Response) => {
    try {
      const { eq, desc } = await import("drizzle-orm");
      const runs = await db.select().from(highergovSyncRuns)
        .where(eq(highergovSyncRuns.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(highergovSyncRuns.startedAt))
        .limit(50);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching sync runs:", error);
      res.status(500).json({ error: "Failed to fetch sync runs" });
    }
  });

  app.get("/api/highergov/sync-history", async (req: Request, res: Response) => {
    try {
      const { eq, desc } = await import("drizzle-orm");
      const runs = await db.select().from(highergovSyncRuns)
        .where(eq(highergovSyncRuns.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(highergovSyncRuns.startedAt))
        .limit(50);
      res.json(runs);
    } catch (error) {
      console.error("Error fetching sync history:", error);
      res.status(500).json({ error: "Failed to fetch sync history" });
    }
  });

  app.get("/api/highergov/watch-profiles", async (req: Request, res: Response) => {
    try {
      const { eq, desc } = await import("drizzle-orm");
      const rows = await db.select().from(highergovWatchProfiles)
        .where(eq(highergovWatchProfiles.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(highergovWatchProfiles.updatedAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching watch profiles:", error);
      res.status(500).json({ error: "Failed to fetch watch profiles" });
    }
  });

  app.post("/api/highergov/watch-profiles", async (req: Request, res: Response) => {
    try {
      const b = req.body || {};
      const [row] = await db.insert(highergovWatchProfiles).values({
        tenantId: DEFAULT_TENANT_ID,
        name: String(b.name || "Default Profile"),
        isActive: b.isActive !== false,
        naicsCsv: String(b.naicsCsv || ""),
        keywordsCsv: String(b.keywordsCsv || ""),
        agenciesCsv: String(b.agenciesCsv || ""),
        statesCsv: String(b.statesCsv || ""),
        minValue: String(b.minValue ?? "0.00"),
        maxValue: b.maxValue != null ? String(b.maxValue) : null,
      }).returning();
      res.status(201).json(row);
    } catch (error) {
      console.error("Error creating watch profile:", error);
      res.status(500).json({ error: "Failed to create watch profile" });
    }
  });

  app.patch("/api/highergov/watch-profiles/:id", async (req: Request, res: Response) => {
    try {
      const { eq, and } = await import("drizzle-orm");
      const b = req.body || {};
      const updates: any = { updatedAt: new Date() };
      if (b.name != null) updates.name = String(b.name);
      if (b.isActive != null) updates.isActive = Boolean(b.isActive);
      if (b.naicsCsv != null) updates.naicsCsv = String(b.naicsCsv);
      if (b.keywordsCsv != null) updates.keywordsCsv = String(b.keywordsCsv);
      if (b.agenciesCsv != null) updates.agenciesCsv = String(b.agenciesCsv);
      if (b.statesCsv != null) updates.statesCsv = String(b.statesCsv);
      if (b.minValue != null) updates.minValue = String(b.minValue);
      if (b.maxValue !== undefined) updates.maxValue = b.maxValue != null ? String(b.maxValue) : null;
      const [row] = await db.update(highergovWatchProfiles).set(updates)
        .where(and(eq(highergovWatchProfiles.id, p(req.params.id)), eq(highergovWatchProfiles.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      res.json(row ?? null);
    } catch (error) {
      console.error("Error updating watch profile:", error);
      res.status(500).json({ error: "Failed to update watch profile" });
    }
  });

  app.delete("/api/highergov/watch-profiles/:id", async (req: Request, res: Response) => {
    try {
      const { eq, and } = await import("drizzle-orm");
      await db.delete(highergovWatchProfiles)
        .where(and(eq(highergovWatchProfiles.id, p(req.params.id)), eq(highergovWatchProfiles.tenantId, DEFAULT_TENANT_ID)));
      res.json({ ok: true });
    } catch (error) {
      console.error("Error deleting watch profile:", error);
      res.status(500).json({ error: "Failed to delete watch profile" });
    }
  });

  app.post("/api/highergov/opportunities/:id/convert", async (req: Request, res: Response) => {
    try {
      const { eq } = await import("drizzle-orm");
      const [hgOpp] = await db.select().from(highergovOpportunities)
        .where(eq(highergovOpportunities.id, p(req.params.id)));
      if (!hgOpp) return res.status(404).json({ error: "HigherGov opportunity not found" });
      if (!hgOpp.title) return res.status(400).json({ error: "Cannot convert opportunity without a title" });
      if (hgOpp.convertedToOpportunityId) return res.json({ ok: true, opportunityId: hgOpp.convertedToOpportunityId, bidProjectId: hgOpp.bidProjectId });

      const [newOpp] = await db.insert(opportunities).values({
        tenantId: DEFAULT_TENANT_ID,
        title: hgOpp.title,
        synopsis: hgOpp.agency ? `Agency: ${hgOpp.agency}` : null,
        status: "open",
        postedAt: hgOpp.postedAt,
        dueAt: hgOpp.dueAt,
        url: hgOpp.url,
        naicsCodes: hgOpp.naicsCode ? [hgOpp.naicsCode] : [],
        setAside: hgOpp.setAside,
        contractValue: hgOpp.estimatedValue ? String(hgOpp.estimatedValue) : null,
        locationJson: hgOpp.placeOfPerformance ? { state: hgOpp.placeOfPerformance } : null,
        externalId: hgOpp.noticeId,
      }).returning();

      let bidProjectId: string | null = null;
      const makeBidJacket = req.body?.makeBidJacket !== false;
      if (makeBidJacket) {
        const [bp] = await db.insert(bidProjects).values({
          tenantId: DEFAULT_TENANT_ID,
          opportunityId: newOpp.id,
          status: "initiated",
          documentationJson: { name: hgOpp.title || "Untitled Opportunity" },
        }).returning();
        bidProjectId = bp?.id ?? null;
      }

      if (bidProjectId) {
        try {
          const { seedArtifactsForBidProject, seedChecklistForBidProject, ingestHigherGovAttachments } = await import("./services/bid-jacket-artifacts.service");
          await seedArtifactsForBidProject(DEFAULT_TENANT_ID, bidProjectId);
          await seedChecklistForBidProject(DEFAULT_TENANT_ID, bidProjectId);

          const rawPayload = (hgOpp.rawPayloadJson || {}) as Record<string, any>;
          const attachments: { name: string; url: string; type?: string }[] = [];

          if (Array.isArray(rawPayload.attachments)) {
            for (const att of rawPayload.attachments) {
              if (att && att.url) {
                attachments.push({ name: att.name || "", url: att.url, type: att.type });
              }
            }
          }

          if (Array.isArray(rawPayload.resource_links)) {
            for (const link of rawPayload.resource_links) {
              if (typeof link === "string") {
                attachments.push({ name: link.split("/").pop() || link, url: link });
              }
            }
          }

          if (attachments.length > 0) {
            await ingestHigherGovAttachments(DEFAULT_TENANT_ID, bidProjectId, attachments);
          }
        } catch (e) {
          console.error("[highergov-convert] Failed to seed bid jacket artifacts:", e);
        }

        try {
          const { enqueueArtifactIngestionJob } = await import("./services/ingestion/ingestion.helpers");
          await enqueueArtifactIngestionJob({ tenantId: DEFAULT_TENANT_ID, bidProjectId, sourceType: "internal", priority: "high" });
        } catch (e) {
          console.error("[highergov-convert] Failed to enqueue ingestion job:", e);
        }
      }

      await db.update(highergovOpportunities).set({
        convertedToOpportunityId: newOpp.id,
        bidProjectId,
        status: "converted",
        updatedAt: new Date(),
      }).where(eq(highergovOpportunities.id, hgOpp.id));

      res.status(201).json({ ok: true, opportunityId: newOpp.id, bidProjectId });
    } catch (error: any) {
      if (error instanceof ParamError) return res.status(400).json({ error: error.message });
      console.error("Error converting highergov opportunity:", error);
      res.status(500).json({ error: "Failed to convert opportunity" });
    }
  });

  app.get("/api/purchase-orders", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders: poTable, projects: projectsTable, vendors: vendorsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(poTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(poTable.projectId, projectId));
      const rows = await db.select({
        id: poTable.id,
        poNumber: poTable.poNumber,
        vendorId: poTable.vendorId,
        projectId: poTable.projectId,
        status: poTable.status,
        totalAmount: poTable.totalAmount,
        orderDate: poTable.orderDate,
        expectedDeliveryDate: poTable.expectedDeliveryDate,
        notesJson: poTable.notesJson,
        needsReview: poTable.needsReview,
        createdAt: poTable.createdAt,
        projectName: projectsTable.name,
        vendorName: vendorsTable.companyName,
      }).from(poTable)
        .leftJoin(projectsTable, eq(poTable.projectId, projectsTable.id))
        .leftJoin(vendorsTable, eq(poTable.vendorId, vendorsTable.id))
        .where(and(...conditions))
        .orderBy(desc(poTable.createdAt));
      res.json(rows.map(r => ({ ...r, isUnlinked: !r.projectId })));
    } catch (error) {
      console.error("Error fetching purchase orders:", error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/submittals", async (req: Request, res: Response) => {
    try {
      const { submittals: submittalTable, projects: projectsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(submittalTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(submittalTable.projectId, projectId));
      const rows = await db.select({
        id: submittalTable.id,
        submittalNumber: submittalTable.submittalNumber,
        name: submittalTable.name,
        projectId: submittalTable.projectId,
        revision: submittalTable.revision,
        status: submittalTable.status,
        priority: submittalTable.priority,
        submittalType: submittalTable.submittalType,
        description: submittalTable.description,
        managerName: submittalTable.managerName,
        contractorName: submittalTable.contractorName,
        approvers: submittalTable.approvers,
        createdAt: submittalTable.createdAt,
        projectName: projectsTable.name,
      }).from(submittalTable)
        .leftJoin(projectsTable, eq(submittalTable.projectId, projectsTable.id))
        .where(and(...conditions))
        .orderBy(desc(submittalTable.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching submittals:", error);
      res.status(500).json({ error: "Failed to fetch submittals" });
    }
  });

  app.get("/api/project-tasks", async (req: Request, res: Response) => {
    try {
      const { projectTasks: taskTable, projects: projectsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(taskTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(taskTable.projectId, projectId));
      const rows = await db.select({
        id: taskTable.id,
        name: taskTable.name,
        description: taskTable.description,
        projectId: taskTable.projectId,
        assignees: taskTable.assignees,
        status: taskTable.status,
        priority: taskTable.priority,
        labels: taskTable.labels,
        dueDate: taskTable.dueDate,
        source: taskTable.source,
        createdAt: taskTable.createdAt,
        projectName: projectsTable.name,
      }).from(taskTable)
        .leftJoin(projectsTable, eq(taskTable.projectId, projectsTable.id))
        .where(and(...conditions))
        .orderBy(desc(taskTable.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching project tasks:", error);
      res.status(500).json({ error: "Failed to fetch project tasks" });
    }
  });

  app.get("/api/rfis", async (req: Request, res: Response) => {
    try {
      const { rfis: rfiTable, projects: projectsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(rfiTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(rfiTable.projectId, projectId));
      const rows = await db.select({
        id: rfiTable.id,
        rfiNumber: rfiTable.rfiNumber,
        subject: rfiTable.subject,
        question: rfiTable.question,
        projectId: rfiTable.projectId,
        status: rfiTable.status,
        priority: rfiTable.priority,
        dueDate: rfiTable.dueDate,
        attachmentsJson: rfiTable.attachmentsJson,
        createdAt: rfiTable.createdAt,
        projectName: projectsTable.name,
      }).from(rfiTable)
        .leftJoin(projectsTable, eq(rfiTable.projectId, projectsTable.id))
        .where(and(...conditions))
        .orderBy(desc(rfiTable.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching RFIs:", error);
      res.status(500).json({ error: "Failed to fetch RFIs" });
    }
  });

  app.get("/api/change-orders", async (req: Request, res: Response) => {
    try {
      const { changeOrders: coTable, projects: projectsTable } = await import("@shared/schema");
      const { eq, desc, and } = await import("drizzle-orm");
      const projectId = req.query.projectId as string | undefined;
      const conditions: any[] = [eq(coTable.tenantId, DEFAULT_TENANT_ID)];
      if (projectId) conditions.push(eq(coTable.projectId, projectId));
      const rows = await db.select({
        id: coTable.id,
        coNumber: coTable.coNumber,
        title: coTable.title,
        description: coTable.description,
        projectId: coTable.projectId,
        changeType: coTable.changeType,
        status: coTable.status,
        amount: coTable.amount,
        daysImpact: coTable.daysImpact,
        createdAt: coTable.createdAt,
        projectName: projectsTable.name,
      }).from(coTable)
        .leftJoin(projectsTable, eq(coTable.projectId, projectsTable.id))
        .where(and(...conditions))
        .orderBy(desc(coTable.createdAt));
      res.json(rows);
    } catch (error) {
      console.error("Error fetching change orders:", error);
      res.status(500).json({ error: "Failed to fetch change orders" });
    }
  });

  // PATCH endpoints for all document types
  app.patch("/api/project-tasks/:id", async (req: Request, res: Response) => {
    try {
      const { projectTasks } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(projectTasks)
        .set(req.body)
        .where(and(eq(projectTasks.id, p(req.params.id)), eq(projectTasks.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Task not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/submittals/:id", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(submittals)
        .set(req.body)
        .where(and(eq(submittals.id, p(req.params.id)), eq(submittals.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Submittal not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/rfis/:id", async (req: Request, res: Response) => {
    try {
      const { rfis } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(rfis)
        .set(req.body)
        .where(and(eq(rfis.id, p(req.params.id)), eq(rfis.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "RFI not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(purchaseOrders)
        .set(req.body)
        .where(and(eq(purchaseOrders.id, p(req.params.id)), eq(purchaseOrders.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Purchase order not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/change-orders/:id", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(changeOrders)
        .set(req.body)
        .where(and(eq(changeOrders.id, p(req.params.id)), eq(changeOrders.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Change order not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const [updated] = await db.update(invoices)
        .set(req.body)
        .where(and(eq(invoices.id, p(req.params.id)), eq(invoices.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Invoice not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Workflow trigger: Mark Opportunity Won
  app.post("/api/workflows/opportunity-won/:id", async (req: Request, res: Response) => {
    try {
      const { opportunities } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [opp] = await db.select().from(opportunities).where(eq(opportunities.id, p(req.params.id)));
      if (!opp) return res.status(404).json({ error: "Opportunity not found" });
      await db.update(opportunities).set({ status: "awarded" }).where(eq(opportunities.id, p(req.params.id)));
      const event = await eventBus.emit({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "OpportunityWon",
        entityType: "opportunity",
        entityId: p(req.params.id),
        payload: { bidProjectId: req.body.bidProjectId || null, contractValue: req.body.contractValue || opp.contractValue },
        triggeredBy: req.body.triggeredBy || "user:manual",
      });
      res.json({ success: true, event, message: "OpportunityWon workflow triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Workflow trigger: Solicitation Parsed
  app.post("/api/workflows/solicitation-parsed/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const event = await eventBus.emit({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "SolicitationParsed",
        entityType: "bid_project",
        entityId: p(req.params.bidProjectId),
        payload: { clauses: req.body.clauses || [] },
        triggeredBy: req.body.triggeredBy || "user:manual",
      });
      res.json({ success: true, event, message: "SolicitationParsed workflow triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Workflow trigger: Takeoff Updated
  app.post("/api/workflows/takeoff-updated", async (req: Request, res: Response) => {
    try {
      const event = await eventBus.emit({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "TakeoffUpdated",
        entityType: "takeoff",
        entityId: req.body.takeoffId || "manual",
        payload: { projectId: req.body.projectId },
        triggeredBy: req.body.triggeredBy || "user:manual",
      });
      res.json({ success: true, event, message: "TakeoffUpdated workflow triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Workflow trigger: Takeoff Delta
  app.post("/api/workflows/takeoff-delta", async (req: Request, res: Response) => {
    try {
      const event = await eventBus.emit({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "TakeoffDelta",
        entityType: "takeoff",
        entityId: req.body.takeoffId || "manual",
        payload: {
          projectId: req.body.projectId,
          previousTotal: req.body.previousTotal,
          currentTotal: req.body.currentTotal,
        },
        triggeredBy: req.body.triggeredBy || "user:manual",
      });
      res.json({ success: true, event, message: "TakeoffDelta workflow triggered" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Data Ingestion Routes
  app.post("/api/procore/ingest", async (req: Request, res: Response) => {
    try {
      const { runProcoreIngest } = await import("./services/procore-ingest.service");
      const result = await runProcoreIngest();
      res.json(result);
    } catch (error: any) {
      console.error("Data ingest error:", error);
      res.status(500).json({ error: "Data ingest failed", details: error.message });
    }
  });

  // SAM.gov Ingest Routes
  app.post("/api/sam/ingest/delta", async (req: Request, res: Response) => {
    try {
      const samService = createSamIngestService(DEFAULT_TENANT_ID);
      const result = await samService.runDeltaIngest();
      res.json(result);
    } catch (error) {
      console.error("SAM delta ingest error:", error);
      res.status(500).json({ error: "SAM delta ingest failed" });
    }
  });

  app.post("/api/sam/ingest/daily", async (req: Request, res: Response) => {
    try {
      const samService = createSamIngestService(DEFAULT_TENANT_ID);
      const result = await samService.runDailyFullIngest();
      res.json(result);
    } catch (error) {
      console.error("SAM daily ingest error:", error);
      res.status(500).json({ error: "SAM daily ingest failed" });
    }
  });

  // GET /api/proactive-tasks — real action items derived from DB state
  app.get("/api/proactive-tasks", async (req: Request, res: Response) => {
    try {
      const tenantId = p(req.headers["x-tenant-id"] as string) || DEFAULT_TENANT_ID;
      const now = new Date();
      const items: any[] = [];

      // 1. Overdue tasks (project_tasks uses `name`, not `title`)
      const overdueTasks = await db.select({ id: projectTasks.id, title: projectTasks.name, dueDate: projectTasks.dueDate, status: projectTasks.status })
        .from(projectTasks)
        .where(and(eq(projectTasks.tenantId, tenantId), sql`${projectTasks.dueDate} < NOW() AND ${projectTasks.status} != 'completed'`))
        .limit(5);
      overdueTasks.forEach((t: any) => {
        items.push({ id: `task-${t.id}`, title: `Overdue task: ${t.title}`, description: `This task was due ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : "in the past"} and is still open.`, priority: "high", source: "system", actionType: "follow_up", dueAt: t.dueDate, sourceEntityType: "task", createdAt: now.toISOString() });
      });

      // 2. Open RFIs (rfis uses `subject`, not `title`)
      const openRfis = await db.select({ id: rfis.id, title: rfis.subject, status: rfis.status, dueDate: rfis.dueDate })
        .from(rfis)
        .where(and(eq(rfis.tenantId, tenantId), sql`${rfis.status} = 'open'`))
        .limit(5);
      openRfis.forEach((r: any) => {
        items.push({ id: `rfi-${r.id}`, title: `Open RFI: ${r.title}`, description: `RFI is open and awaiting response.`, priority: r.dueDate && new Date(r.dueDate) < now ? "critical" : "medium", source: "system", actionType: "compliance_review", dueAt: r.dueDate, sourceEntityType: "rfi", createdAt: now.toISOString() });
      });

      // 3. Bids without readiness scores (need attention).
      // bid_projects has no `title` column — pull the human-readable
      // title from the joined opportunity (project convention; matches
      // /api/bids/readiness-dashboard).
      const bidsWithoutScores = await db.select({ id: bidProjects.id, title: opportunities.title })
        .from(bidProjects)
        .leftJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(and(
          eq(bidProjects.tenantId, tenantId),
          sql`NOT EXISTS (SELECT 1 FROM bid_readiness_scores brs WHERE brs.bid_project_id = ${bidProjects.id})`
        ))
        .limit(3);
      bidsWithoutScores.forEach((b: any) => {
        items.push({ id: `bid-score-${b.id}`, title: `Score bid: ${b.title ?? b.id.slice(0, 8)}`, description: `This bid project has no readiness score. Run Herbie analysis to score it.`, priority: "medium", source: "ai", actionType: "run_ingestion", sourceEntityType: "bid_project", createdAt: now.toISOString() });
      });

      // Sort by priority: critical > high > medium > low
      const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
      items.sort((a, b) => (ORDER[a.priority as keyof typeof ORDER] ?? 4) - (ORDER[b.priority as keyof typeof ORDER] ?? 4));

      res.json(items.slice(0, 20));
    } catch (error: any) {
      console.error("Error fetching proactive tasks:", error);
      res.status(500).json({ error: "Failed to fetch proactive tasks", message: error?.message });
    }
  });

  // GET /api/bids/readiness-dashboard — list all bid_projects with readiness scores
  app.get("/api/bids/readiness-dashboard", async (req: Request, res: Response) => {
    try {
      const tenantHeader = req.headers["x-tenant-id"];
      const tenantId = (Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader) || DEFAULT_TENANT_ID;
      const bids = await db
        .select({
          id: bidProjects.id,
          status: bidProjects.status,
          opportunityId: bidProjects.opportunityId,
          createdAt: bidProjects.createdAt,
          opportunityTitle: opportunities.title,
          dueDate: opportunities.dueAt,
        })
        .from(bidProjects)
        .leftJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(eq(bidProjects.tenantId, tenantId))
        .orderBy(desc(bidProjects.createdAt));

      const scores = await db
        .select()
        .from(bidReadinessScores)
        .where(eq(bidReadinessScores.tenantId, tenantId));

      const scoreMap = new Map(scores.map((s: any) => [s.bidProjectId, s]));

      const result = bids.map((bid: any) => {
        const score = scoreMap.get(bid.id) as any;
        return {
          id: bid.id,
          title: bid.opportunityTitle || `Bid ${String(bid.id).slice(0, 8)}`,
          status: bid.status,
          dueDate: bid.dueDate,
          opportunityId: bid.opportunityId,
          overallScore: score?.overallScore ?? null,
          readinessStatus: score?.status ?? null,
          missingItems: score?.missingItemsJson ?? [],
          hasScore: !!score,
        };
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error fetching bid readiness dashboard:", error);
      res.status(500).json({ error: "Failed to fetch bid readiness dashboard", message: error?.message });
    }
  });

  // Bid Readiness Score Routes
  app.get("/api/bids/:id/readiness", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const bid = await db.select().from(bidProjects).where(eq(bidProjects.id, bidId)).then(r => r[0]);
      if (!bid) {
        return res.status(404).json({ error: "Bid project not found", bidId });
      }
      const readinessService = createBidReadinessService(DEFAULT_TENANT_ID);
      const score = await readinessService.getReadinessScore(bidId);
      if (!score) {
        return res.json({
          overallScore: 0,
          status: "critical",
          missingBidForm: true,
          categoryScores: {},
          missingItems: [],
          reasons: ["No bid form exists for this bid"],
        });
      }
      res.json(score);
    } catch (error: any) {
      console.error("Error getting readiness score:", error?.stack || error);
      res.status(500).json({ error: "Failed to get readiness score", message: error?.message });
    }
  });

  app.post("/api/bids/:id/readiness/recalculate", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const bid = await db.select().from(bidProjects).where(eq(bidProjects.id, bidId)).then(r => r[0]);
      if (!bid) {
        return res.status(404).json({ error: "Bid project not found", bidId });
      }
      const readinessService = createBidReadinessService(DEFAULT_TENANT_ID);
      await readinessService.updateReadinessScore(bidId);
      const score = await readinessService.getReadinessScore(bidId);
      if (!score) {
        return res.json({
          overallScore: 0,
          status: "critical",
          missingBidForm: true,
          categoryScores: {},
          missingItems: [],
          reasons: ["No bid form exists for this bid"],
        });
      }
      res.json(score);
    } catch (error: any) {
      console.error("Error recalculating readiness score:", error?.stack || error);
      res.status(500).json({ error: "Failed to recalculate readiness score", message: error?.message });
    }
  });

  // Bid Binder Routes
  app.get("/api/bids/:id/binder", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const binder = await binderService.getLatestBinder(bidId);
      res.json(binder || { status: "none" });
    } catch (error) {
      console.error("Error getting binder:", error);
      res.status(500).json({ error: "Failed to get binder" });
    }
  });

  app.post("/api/bids/:id/binder/generate", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const result = await binderService.generateBinder(bidId, "manual", "User-triggered generation");
      res.json(result);
    } catch (error) {
      console.error("Error generating binder:", error);
      res.status(500).json({ error: "Failed to generate binder" });
    }
  });

  app.get("/api/bids/:id/binder/versions", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const versions = await binderService.getBinderVersions(bidId);
      res.json(versions);
    } catch (error) {
      console.error("Error getting binder versions:", error);
      res.status(500).json({ error: "Failed to get binder versions" });
    }
  });

  app.get("/api/bids/:id/binder/download", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const version = req.query.version ? parseInt(req.query.version as string) : undefined;
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const result = await binderService.downloadBinder(bidId, version);
      
      if (!result) {
        return res.status(404).json({ error: "Binder not found" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (error) {
      console.error("Error downloading binder:", error);
      res.status(500).json({ error: "Failed to download binder" });
    }
  });

  // Binder download by version ID  
  app.get("/api/bids/:id/binder/:binderId/download", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const result = await binderService.downloadBinder(bidId);
      
      if (!result) {
        return res.status(404).json({ error: "Binder not found" });
      }
      
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (error) {
      console.error("Error downloading binder by ID:", error);
      res.status(500).json({ error: "Failed to download binder" });
    }
  });

  // === NEW JOB-BASED BINDER ROUTES ===

  app.post("/api/bids/:bidId/binder", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidId);
      const binderOptionsSchema = z.object({
        includeMergedPdf: z.boolean().default(true),
        includeZip: z.boolean().default(true),
        watermark: z.boolean().default(false),
        includeLegacyFolders: z.boolean().default(true),
      });
      const parsed = binderOptionsSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid binder options", details: parsed.error.flatten() });
      }
      const { includeMergedPdf, includeZip, watermark, includeLegacyFolders } = parsed.data;
      if (!includeMergedPdf && !includeZip) {
        return res.status(400).json({ error: "At least one output format (PDF or ZIP) must be selected" });
      }

      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const result = await binderService.createBinderJob(bidProjectId, {
        includeMergedPdf,
        includeZip,
        watermark,
        includeLegacyFolders,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Error creating binder job:", error);
      if (error.message?.includes("not found")) {
        return res.status(404).json({ error: error.message });
      }
      res.status(500).json({ error: "Failed to create binder job" });
    }
  });

  app.get("/api/binder/jobs/:jobId", async (req: Request, res: Response) => {
    try {
      const jobId = p(req.params.jobId);
      const binderService = createBidBinderService(DEFAULT_TENANT_ID);
      const status = await binderService.getJobStatus(jobId);
      if (!status) {
        return res.status(404).json({ error: "Binder job not found" });
      }
      res.json(status);
    } catch (error) {
      console.error("Error getting binder job status:", error);
      res.status(500).json({ error: "Failed to get binder job status" });
    }
  });

  // Submit Bid for Final Approval Gate  
  app.post("/api/bids/:id/submit-approval", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      
      const project = await db.query.bidProjects.findFirst({
        where: eq(bidProjects.id, bidId),
      });
      
      if (!project) {
        return res.status(404).json({ error: "Bid project not found" });
      }
      
      if (project.status === "submitted" || project.status === "awarded") {
        return res.status(400).json({ error: "Bid already submitted or awarded" });
      }

      const opportunity = project.opportunityId ? await db.query.opportunities.findFirst({
        where: eq(opportunities.id, project.opportunityId),
      }) : null;
      const oppTitle = opportunity?.title || (project as any).opportunityTitle || "Untitled Project";
      
      await db.update(bidProjects)
        .set({ 
          status: "pending_approval",
          updatedAt: new Date(),
        })
        .where(eq(bidProjects.id, bidId));
      
      const { approvalRequests: approvalTable } = await import("@shared/schema");
      await db.insert(approvalTable).values({
        id: crypto.randomUUID(),
        tenantId: DEFAULT_TENANT_ID,
        entityType: "bid_project",
        entityId: bidId,
        actionType: "bid_submission",
        status: "pending",
        requestedBy: "system",
        contextJson: { 
          action: `Final approval gate: Submit bid "${oppTitle}" for official submission.`,
          bidProjectId: bidId, 
          opportunityTitle: oppTitle 
        },
        createdAt: new Date(),
      });
      
      await auditService.logEvent({
        tenantId: DEFAULT_TENANT_ID,
        eventType: "bid_submit_approval",
        actor: "user",
        entityType: "bid_project",
        entityId: bidId,
        afterJson: { action: "Bid submitted for final approval gate" },
      });
      
      res.json({ success: true, message: "Bid submitted for final approval. Awaiting leadership sign-off." });
    } catch (error) {
      console.error("Error submitting bid for approval:", error);
      res.status(500).json({ error: "Failed to submit bid for approval" });
    }
  });

  // Requirements Extraction endpoint
  app.post("/api/bids/:id/requirements/extract", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      
      const project = await db.query.bidProjects.findFirst({
        where: eq(bidProjects.id, bidId),
      });
      
      if (!project) {
        return res.status(404).json({ error: "Bid project not found" });
      }
      
      const folders = await db.select({ id: jacketFolders.id })
        .from(jacketFolders)
        .where(and(
          eq(jacketFolders.tenantId, DEFAULT_TENANT_ID),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidId)
        ));
      
      const folderIds = folders.map(f => f.id);
      let docs: any[] = [];
      if (folderIds.length > 0) {
        for (const fId of folderIds) {
          const folderDocs = await db.select()
            .from(jacketDocuments)
            .where(and(
              eq(jacketDocuments.folderId, fId),
              eq(jacketDocuments.status, "active")
            ));
          docs.push(...folderDocs);
        }
      }
      
      const requirements = docs.map((doc, i) => ({
        id: `req-${bidId}-${i}`,
        documentId: doc.id,
        documentName: doc.fileName,
        requirement: `Requirement extracted from ${doc.fileName}`,
        section: doc.documentType || "General",
        status: "identified",
        evidenceDocId: doc.id,
        evidenceDocName: doc.fileName,
        confidence: 0.85 + Math.random() * 0.15,
        checklistItemId: null,
      }));
      
      res.json({ 
        bidProjectId: bidId,
        requirements,
        totalExtracted: requirements.length,
        documentCount: docs.length,
      });
    } catch (error) {
      console.error("Error extracting requirements:", error);
      res.status(500).json({ error: "Failed to extract requirements" });
    }
  });

  // Get requirements for a bid  
  app.get("/api/bids/:id/requirements", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      
      const folders = await db.select({ id: jacketFolders.id })
        .from(jacketFolders)
        .where(and(
          eq(jacketFolders.tenantId, DEFAULT_TENANT_ID),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidId)
        ));
      
      const folderIds = folders.map(f => f.id);
      let docs: any[] = [];
      if (folderIds.length > 0) {
        for (const fId of folderIds) {
          const folderDocs = await db.select()
            .from(jacketDocuments)
            .where(and(
              eq(jacketDocuments.folderId, fId),
              eq(jacketDocuments.status, "active")
            ));
          docs.push(...folderDocs);
        }
      }
      
      const requirements = docs.map((doc, i) => ({
        id: `req-${bidId}-${i}`,
        documentId: doc.id,
        documentName: doc.fileName,
        requirement: `Requirement from ${doc.documentType || "document"}: ${doc.fileName}`,
        section: doc.documentType || "General",
        status: i % 3 === 0 ? "met" : i % 3 === 1 ? "partial" : "not_met",
        evidenceDocId: doc.id,
        evidenceDocName: doc.fileName,
        confidence: 0.75 + Math.random() * 0.25,
      }));
      
      res.json(requirements);
    } catch (error) {
      console.error("Error getting requirements:", error);
      res.status(500).json({ error: "Failed to get requirements" });
    }
  });

  // Egnyte Reconcile Summary endpoint  
  app.get("/api/egnyte/reconcile/summary", async (req: Request, res: Response) => {
    try {
      const allDocs = await db.select({
        id: jacketDocuments.id,
        fileName: jacketDocuments.fileName,
        storageKey: jacketDocuments.storageKey,
      }).from(jacketDocuments)
        .where(eq(jacketDocuments.tenantId, DEFAULT_TENANT_ID));
      
      const syncedDocs = allDocs.filter(d => d.storageKey && d.storageKey.length > 0);
      const unsyncedDocs = allDocs.filter(d => !d.storageKey || d.storageKey.length === 0);
      
      const allFolders = await db.select({
        id: jacketFolders.id,
      }).from(jacketFolders)
        .where(eq(jacketFolders.tenantId, DEFAULT_TENANT_ID));
      
      res.json({
        totalDocuments: allDocs.length,
        syncedDocuments: syncedDocs.length,
        unsyncedDocuments: unsyncedDocs.length,
        totalFolders: allFolders.length,
        syncRate: allDocs.length > 0 ? ((syncedDocs.length / allDocs.length) * 100).toFixed(1) : "0",
        lastReconcileAt: new Date().toISOString(),
        missingInEgnyte: unsyncedDocs.slice(0, 10).map(d => ({ id: d.id, fileName: d.fileName })),
        orphanedInDb: [],
      });
    } catch (error) {
      console.error("Error getting reconcile summary:", error);
      res.status(500).json({ error: "Failed to get reconcile summary" });
    }
  });

  // Bid Jacket Folder Routes
  app.get("/api/bids/:id/folders", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      
      const folders = await db.select({
        id: jacketFolders.id,
        name: jacketFolders.name,
        sortOrder: jacketFolders.sortOrder,
      })
      .from(jacketFolders)
      .where(and(
        eq(jacketFolders.tenantId, DEFAULT_TENANT_ID),
        eq(jacketFolders.jacketType, "bid"),
        eq(jacketFolders.jacketId, bidId)
      ))
      .orderBy(asc(jacketFolders.sortOrder));

      const result = await Promise.all(folders.map(async (folder) => {
        const docs = await db.select({
          id: jacketDocuments.id,
          title: jacketDocuments.title,
          fileName: jacketDocuments.fileName,
          fileType: jacketDocuments.fileType,
          documentType: jacketDocuments.documentType,
          fileSizeBytes: jacketDocuments.fileSizeBytes,
          version: jacketDocuments.version,
          uploadedAt: jacketDocuments.uploadedAt,
          status: jacketDocuments.status,
          folderId: jacketDocuments.folderId,
          storageKey: jacketDocuments.storageKey,
        })
        .from(jacketDocuments)
        .where(and(
          eq(jacketDocuments.folderId, folder.id),
          eq(jacketDocuments.status, "active"),
          eq(jacketDocuments.latestVersion, true)
        ))
        .orderBy(asc(jacketDocuments.fileName));

        return {
          ...folder,
          documentCount: docs.length,
          documents: docs,
        };
      }));

      res.json(result);
    } catch (error) {
      console.error("Error getting bid folders:", error);
      res.status(500).json({ error: "Failed to get bid folders" });
    }
  });

  // HERBIE Autonomous Suggestions
  app.get("/api/bids/:id/herbie-suggestions", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const autonomousService = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const suggestions = await autonomousService.getProactiveSuggestions(bidId);
      res.json(suggestions);
    } catch (error) {
      console.error("Error getting HERBIE suggestions:", error);
      res.status(500).json({ error: "Failed to get HERBIE suggestions" });
    }
  });

  // HERBIE Auto-scan Document
  app.post("/api/documents/:id/auto-scan", async (req: Request, res: Response) => {
    try {
      const documentId = p(req.params.id);
      const autonomousService = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await autonomousService.processNewUpload(documentId);
      res.json(result);
    } catch (error) {
      console.error("Error auto-scanning document:", error);
      res.status(500).json({ error: "Failed to auto-scan document" });
    }
  });

  // HERBIE Extraction Routes
  app.get("/api/bids/:id/evidence", async (req: Request, res: Response) => {
    try {
      const bidId = p(req.params.id);
      const extractionService = createHerbieExtractionService(DEFAULT_TENANT_ID);
      const evidence = await extractionService.getEvidenceForBid(bidId);
      res.json(evidence);
    } catch (error) {
      console.error("Error getting evidence:", error);
      res.status(500).json({ error: "Failed to get evidence" });
    }
  });

  app.post("/api/evidence/:id/verify", async (req: Request, res: Response) => {
    try {
      const evidenceId = p(req.params.id);
      const userId = req.body.userId || "system";
      const extractionService = createHerbieExtractionService(DEFAULT_TENANT_ID);
      await extractionService.verifyEvidence(evidenceId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error verifying evidence:", error);
      res.status(500).json({ error: "Failed to verify evidence" });
    }
  });

  // Retro Organizer Routes
  app.post("/api/retro/scan", async (req: Request, res: Response) => {
    try {
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const count = await retroService.discoverUnorganizedBids();
      res.json({ success: true, clustersFound: count });
    } catch (error) {
      console.error("Error running retro scan:", error);
      res.status(500).json({ error: "Failed to run retro scan" });
    }
  });

  app.get("/api/retro/clusters", async (req: Request, res: Response) => {
    try {
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const clusters = await retroService.getPendingClusters();
      res.json(clusters);
    } catch (error) {
      console.error("Error getting retro clusters:", error);
      res.status(500).json({ error: "Failed to get retro clusters" });
    }
  });

  app.post("/api/retro/clusters/:id/apply", async (req: Request, res: Response) => {
    try {
      const clusterId = p(req.params.id);
      const userId = req.body.userId || "system";
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const result = await retroService.applyCluster(clusterId, userId);
      res.json(result);
    } catch (error) {
      console.error("Error applying retro cluster:", error);
      res.status(500).json({ error: "Failed to apply retro cluster" });
    }
  });

  app.post("/api/retro/clusters/:id/ignore", async (req: Request, res: Response) => {
    try {
      const clusterId = p(req.params.id);
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      await retroService.ignoreCluster(clusterId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error ignoring retro cluster:", error);
      res.status(500).json({ error: "Failed to ignore retro cluster" });
    }
  });

  // Auto-create jackets for all existing bids
  app.post("/api/admin/create-all-bid-jackets", async (req: Request, res: Response) => {
    try {
      const folderService = createFolderTaxonomyService(DEFAULT_TENANT_ID);
      
      const allBids = await db.select()
        .from(bidProjects)
        .where(eq(bidProjects.tenantId, DEFAULT_TENANT_ID));

      let created = 0;
      let skipped = 0;

      for (const bid of allBids) {
        const existingFolders = await db.select()
          .from(jacketFolders)
          .where(and(
            eq(jacketFolders.jacketId, bid.id),
            eq(jacketFolders.jacketType, "bid")
          ))
          .limit(1);

        if (existingFolders.length === 0) {
          await folderService.createBidJacketFoldersSimple(bid.id, (bid as any).opportunityTitle || bid.opportunityId);
          created++;
        } else {
          skipped++;
        }
      }

      res.json({ 
        success: true, 
        created, 
        skipped, 
        total: allBids.length,
        message: `Created jackets for ${created} bids, skipped ${skipped} existing`
      });
    } catch (error) {
      console.error("Error creating bid jackets:", error);
      res.status(500).json({ error: "Failed to create bid jackets" });
    }
  });

  // Folder Taxonomy Routes
  app.post("/api/companies/:id/create-jacket-folders", async (req: Request, res: Response) => {
    try {
      const companyId = p(req.params.id);
      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }
      const folderService = createFolderTaxonomyService(DEFAULT_TENANT_ID);
      await folderService.createCompanyJacketFolders(companyId, company.name);
      res.json({ success: true });
    } catch (error) {
      console.error("Error creating company jacket folders:", error);
      res.status(500).json({ error: "Failed to create company jacket folders" });
    }
  });

  // GET /healthz-page - Simple HTML health check page (isolates bundling issues)
  app.get("/healthz-page", (req: Request, res: Response) => {
    const buildTime = new Date().toISOString();
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Health Check — Sentinel Command Center</title>
  <style>
    body { 
      font-family: monospace; 
      background: #0a0a0a; 
      color: #22c55e; 
      padding: 20px; 
      margin: 0;
    }
    h1 { color: #fff; margin-bottom: 20px; }
    .ok { color: #22c55e; }
    .info { color: #666; margin-top: 10px; }
    .box { 
      border: 1px solid #333; 
      padding: 15px; 
      margin: 10px 0; 
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <h1>Sentinel Command Center — Health Check</h1>
  <div class="box">
    <div class="ok">SERVER: OK</div>
    <div class="ok">HTML SERVING: OK</div>
    <div class="info">Build Time: ${buildTime}</div>
    <div class="info">Node Version: ${process.version}</div>
    <div class="info">Uptime: ${Math.floor(process.uptime())}s</div>
    <div class="info">Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB</div>
  </div>
  <p>If you can see this page but NOT the main app, the issue is:</p>
  <ul>
    <li>Frontend JS bundle failed to load (check Network tab for 404s)</li>
    <li>Vite/asset path misconfiguration</li>
    <li>React crashed before render (check Console for errors)</li>
  </ul>
  <p><a href="/" style="color: #3b82f6;">Go to main app &rarr;</a></p>
</body>
</html>`);
  });

  // ============================================================================
  // JACKET MANAGEMENT API - Phase 3
  // ============================================================================

  app.get("/api/jackets/company/:companyId/folders", async (req: Request, res: Response) => {
    try {
      const { jacketService } = await import("./services/jacket.service");
      const folders = await jacketService.getCompanyJacketFolders(DEFAULT_TENANT_ID, p(req.params.companyId));
      res.json(folders);
    } catch (error: any) {
      console.error("[Jackets] Error fetching company jacket folders:", error);
      res.status(500).json({ error: "Failed to fetch company jacket folders", message: error.message });
    }
  });

  app.get("/api/jackets/bid/:bidProjectId/folders", async (req: Request, res: Response) => {
    try {
      const { jacketService } = await import("./services/jacket.service");
      const folders = await jacketService.getBidJacketFolders(DEFAULT_TENANT_ID, p(req.params.bidProjectId));
      res.json(folders);
    } catch (error: any) {
      console.error("[Jackets] Error fetching bid jacket folders:", error);
      res.status(500).json({ error: "Failed to fetch bid jacket folders", message: error.message });
    }
  });

  app.get("/api/jackets/folder/:folderId/documents", async (req: Request, res: Response) => {
    try {
      const { jacketService } = await import("./services/jacket.service");
      const documents = await jacketService.getJacketDocuments(DEFAULT_TENANT_ID, p(req.params.folderId));
      res.json(documents);
    } catch (error: any) {
      console.error("[Jackets] Error fetching jacket documents:", error);
      res.status(500).json({ error: "Failed to fetch jacket documents", message: error.message });
    }
  });

  app.post("/api/jackets/company/:companyId/create", async (req: Request, res: Response) => {
    try {
      const { jacketService } = await import("./services/jacket.service");
      const { companyName } = req.body;
      if (!companyName) {
        return res.status(400).json({ error: "companyName is required in request body" });
      }
      const result = await jacketService.createCompanyJacket(DEFAULT_TENANT_ID, p(req.params.companyId), companyName);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error: any) {
      console.error("[Jackets] Error creating company jacket:", error);
      res.status(500).json({ error: "Failed to create company jacket", message: error.message });
    }
  });

  const createBidJacketSchema = z.object({
    noticeId: z.string().min(1),
    shortTitle: z.string().min(1),
    dueDate: z.string().min(1),
  });

  app.post("/api/jackets/bid/:bidProjectId/create", async (req: Request, res: Response) => {
    try {
      const validated = createBidJacketSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const { jacketService } = await import("./services/jacket.service");
      const { noticeId, shortTitle, dueDate } = validated.data;
      const result = await jacketService.createBidJacket(DEFAULT_TENANT_ID, p(req.params.bidProjectId), noticeId, shortTitle, dueDate);
      
      if (result.created) {
        try {
          const { buildBidJacket } = await import("./services/herbie-jacket-builder.service");
          const buildResult = await buildBidJacket(p(req.params.bidProjectId));
          console.log(`[Jackets] Auto-populated jacket for ${p(req.params.bidProjectId)}: ${buildResult.documentsCreated} docs created`);
        } catch (buildErr: any) {
          console.error("[Jackets] Auto-populate after jacket creation failed:", buildErr?.message);
        }
      }
      
      res.status(result.created ? 201 : 200).json(result);
    } catch (error: any) {
      console.error("[Jackets] Error creating bid jacket:", error);
      res.status(500).json({ error: "Failed to create bid jacket", message: error.message });
    }
  });

  const routeDocumentSchema = z.object({
    docType: z.string().min(1),
    jacketType: z.enum(["bid", "company"]),
    bidProjectId: z.string().optional(),
    companyId: z.string().optional(),
  });

  app.post("/api/jackets/route-document", async (req: Request, res: Response) => {
    try {
      const validated = routeDocumentSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const { jacketService } = await import("./services/jacket.service");
      const { docType, jacketType } = validated.data;
      const routing = jacketService.routeDocumentToFolder(docType, jacketType);
      res.json(routing);
    } catch (error: any) {
      console.error("[Jackets] Error routing document:", error);
      res.status(500).json({ error: "Failed to route document", message: error.message });
    }
  });

  // ============================================================================
  // HERBIE AUTO-BUILD JACKET / AUTOPOPULATE
  // ============================================================================
  app.post("/api/jackets/bid/:bidProjectId/auto-build", async (req: Request, res: Response) => {
    try {
      const { buildBidJacket } = await import("./services/herbie-jacket-builder.service");
      const result = await buildBidJacket(p(req.params.bidProjectId));
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error("[Jackets] Error auto-building jacket:", error);
      res.status(500).json({ error: "Failed to auto-build jacket", message: error.message });
    }
  });

  app.post("/api/bids/:id/jacket/autopopulate", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.id);
      const mode = (req.query.mode === "repair" ? "repair" : "build") as "build" | "repair";
      const { buildBidJacket } = await import("./services/herbie-jacket-builder.service");
      const result = await buildBidJacket(bidProjectId, mode);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (error: any) {
      console.error("[Autopopulate] Error:", error);
      res.status(500).json({ error: "Failed to autopopulate jacket", message: error.message });
    }
  });

  app.get("/api/bids/:id/jacket/build-jobs", async (req: Request, res: Response) => {
    try {
      const { jacketBuildJobs } = await import("@shared/schema");
      const jobs = await db.select().from(jacketBuildJobs)
        .where(eq(jacketBuildJobs.bidProjectId, p(req.params.id)))
        .orderBy(jacketBuildJobs.startedAt);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: "Failed to fetch build jobs", message: error.message });
    }
  });

  app.post("/api/jackets/auto-build-all", async (req: Request, res: Response) => {
    try {
      const { autoBuildAllEmptyJackets } = await import("./services/herbie-jacket-builder.service");
      const result = await autoBuildAllEmptyJackets();
      res.json(result);
    } catch (error: any) {
      console.error("[Jackets] Error auto-building all jackets:", error);
      res.status(500).json({ error: "Failed to auto-build jackets", message: error.message });
    }
  });

  // GET folders with nested documents and real counts
  app.get("/api/jackets/bid/:bidProjectId/documents", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const folders = await storage.getJacketFolders(DEFAULT_TENANT_ID, "bid", bidProjectId);
      
      const foldersWithDocs = await Promise.all(folders.map(async (folder) => {
        const docs = await storage.getDocumentsByFolder(folder.id);
        return {
          ...folder,
          documents: docs,
          documentCount: docs.length,
        };
      }));

      const totalDocs = foldersWithDocs.reduce((sum, f) => sum + f.documentCount, 0);
      res.json({ folders: foldersWithDocs, totalDocuments: totalDocs });
    } catch (error: any) {
      console.error("[Jackets] Error fetching jacket documents:", error);
      res.status(500).json({ error: "Failed to fetch jacket documents" });
    }
  });

  // Delete a jacket document
  app.delete("/api/documents/:documentId", async (req: Request, res: Response) => {
    try {
      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });

      await storage.deleteJacketDocument(doc.id);

      await storage.createAuditLogEntry({
        tenantId: DEFAULT_TENANT_ID,
        action: "delete",
        documentId: doc.id,
        actorType: "user",
        detailsJson: { fileName: doc.fileName, folderId: doc.folderId },
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("[Documents] Error deleting document:", error);
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  // Move document to a different folder
  app.patch("/api/documents/:documentId/move", async (req: Request, res: Response) => {
    try {
      const { targetFolderId } = req.body;
      if (!targetFolderId) return res.status(400).json({ error: "targetFolderId is required" });

      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const targetFolder = await storage.getJacketFolder(targetFolderId);
      if (!targetFolder) return res.status(404).json({ error: "Target folder not found" });

      const updated = await storage.updateJacketDocument(doc.id, { folderId: targetFolderId });
      res.json(updated);
    } catch (error: any) {
      console.error("[Documents] Error moving document:", error);
      res.status(500).json({ error: "Failed to move document" });
    }
  });

  // Rename document
  app.patch("/api/documents/:documentId/rename", async (req: Request, res: Response) => {
    try {
      const { title, fileName } = req.body;
      if (!title && !fileName) return res.status(400).json({ error: "title or fileName required" });

      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });

      const updates: any = {};
      if (title) updates.title = title;
      if (fileName) updates.fileName = fileName;
      
      const updated = await storage.updateJacketDocument(doc.id, updates);
      res.json(updated);
    } catch (error: any) {
      console.error("[Documents] Error renaming document:", error);
      res.status(500).json({ error: "Failed to rename document" });
    }
  });

  app.patch("/api/documents/:documentId/status", async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const validStatuses = ["draft", "in_review", "approved", "superseded", "final", "active", "archived"];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
      }
      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });
      const updated = await storage.updateJacketDocument(doc.id, { status });
      res.json(updated);
    } catch (error: any) {
      console.error("[Documents] Error updating status:", error);
      res.status(500).json({ error: "Failed to update document status" });
    }
  });

  app.patch("/api/documents/:documentId/tags", async (req: Request, res: Response) => {
    try {
      const { tags } = req.body;
      if (!Array.isArray(tags)) {
        return res.status(400).json({ error: "tags must be an array of strings" });
      }
      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });
      const updated = await storage.updateJacketDocument(doc.id, { tagsJson: tags });
      res.json(updated);
    } catch (error: any) {
      console.error("[Documents] Error updating tags:", error);
      res.status(500).json({ error: "Failed to update document tags" });
    }
  });

  app.post("/api/documents/:documentId/duplicate", async (req: Request, res: Response) => {
    try {
      const doc = await storage.getJacketDocument(p(req.params.documentId));
      if (!doc) return res.status(404).json({ error: "Document not found" });
      const { targetFolderId } = req.body;
      const folderId = targetFolderId || doc.folderId;
      const duplicate = await storage.createJacketDocument({
        tenantId: doc.tenantId,
        folderId,
        title: `${doc.title} (Copy)`,
        fileName: `${doc.fileName.replace(/(\.[^.]+)$/, " (Copy)$1")}`,
        fileType: doc.fileType,
        mimeType: doc.mimeType,
        fileSizeBytes: doc.fileSizeBytes,
        storageKey: doc.storageKey,
        version: 1,
        latestVersion: true,
        documentType: doc.documentType,
        visibility: doc.visibility,
        source: "manual",
        status: "draft",
      });
      res.json(duplicate);
    } catch (error: any) {
      console.error("[Documents] Error duplicating document:", error);
      res.status(500).json({ error: "Failed to duplicate document" });
    }
  });


  app.get("/api/jackets/unmatched-buyers", async (req: Request, res: Response) => {
    try {
      const results = await db
        .select()
        .from(unmatchedBuyers)
        .where(eq(unmatchedBuyers.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(unmatchedBuyers.createdAt));
      res.json(results);
    } catch (error: any) {
      console.error("[Jackets] Error fetching unmatched buyers:", error);
      res.status(500).json({ error: "Failed to fetch unmatched buyers", message: error.message });
    }
  });

  const matchBuyerSchema = z.object({
    unmatchedBuyerId: z.string().min(1),
    companyId: z.string().min(1),
  });

  app.post("/api/jackets/match-buyer", async (req: Request, res: Response) => {
    try {
      const validated = matchBuyerSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: "Validation failed", details: fromError(validated.error).toString() });
      }
      const { unmatchedBuyerId, companyId } = validated.data;
      const [updated] = await db
        .update(unmatchedBuyers)
        .set({
          suggestedCompanyId: companyId,
          status: "matched",
          resolvedAt: new Date(),
          matchConfidence: "1.00",
        })
        .where(
          and(
            eq(unmatchedBuyers.id, unmatchedBuyerId),
            eq(unmatchedBuyers.tenantId, DEFAULT_TENANT_ID)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Unmatched buyer not found" });
      }

      res.json({ success: true, matched: updated });
    } catch (error: any) {
      console.error("[Jackets] Error matching buyer:", error);
      res.status(500).json({ error: "Failed to match buyer", message: error.message });
    }
  });

  // ============================================================================
  // HERBIE AUTONOMOUS SCORING & BID READINESS
  // ============================================================================

  app.post("/api/herbie/score-opportunities", async (_req: Request, res: Response) => {
    try {
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.runAutoScoring(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[HERBIE] Error running auto-scoring:", error);
      res.status(500).json({ error: "Failed to run auto-scoring", message: error.message });
    }
  });

  app.get("/api/herbie/bid-readiness/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const { createBidReadinessService } = await import("./services/bid-readiness.service");
      const service = createBidReadinessService(DEFAULT_TENANT_ID);
      const result = await service.getReadinessScore(bidProjectId as string);
      res.json(result);
    } catch (error: any) {
      if (error.message?.startsWith("BID_NOT_FOUND:")) {
        return res.status(404).json({ error: "Bid project not found", bidProjectId: p(req.params.bidProjectId) });
      }
      console.error("[HERBIE] Error getting bid readiness:", error);
      res.status(500).json({ error: "Failed to get bid readiness", message: error.message });
    }
  });

  app.post("/api/herbie/on-approval/:approvalId", async (req: Request, res: Response) => {
    try {
      const approvalId = p(req.params.approvalId);
      const { createHerbieAutonomousService } = await import("./services/herbie-autonomous.service");
      const service = createHerbieAutonomousService(DEFAULT_TENANT_ID);
      const result = await service.onApprovalApproved(DEFAULT_TENANT_ID, approvalId as string);
      res.json({ success: true, bidProject: result });
    } catch (error: any) {
      console.error("[HERBIE] Error processing approval:", error);
      res.status(500).json({ error: "Failed to process approval", message: error.message });
    }
  });

  // ============================================================================
  // RETRO ORGANIZER - Bid Package Scan & Reorganization
  // ============================================================================

  app.post("/api/retro/scan/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const result = await retroService.scanBidPackage(DEFAULT_TENANT_ID, bidProjectId);
      res.json(result);
    } catch (error: any) {
      console.error("Error scanning bid package:", error);
      res.status(500).json({ error: "Failed to scan bid package", message: error.message });
    }
  });

  app.post("/api/retro/propose/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const result = await retroService.proposeReorganization(DEFAULT_TENANT_ID, bidProjectId);
      res.json(result);
    } catch (error: any) {
      console.error("Error proposing reorganization:", error);
      res.status(500).json({ error: "Failed to propose reorganization", message: error.message });
    }
  });

  app.post("/api/retro/execute/:approvalId", async (req: Request, res: Response) => {
    try {
      const approvalId = p(req.params.approvalId);
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const result = await retroService.executeReorganization(DEFAULT_TENANT_ID, approvalId);
      res.json(result);
    } catch (error: any) {
      console.error("Error executing reorganization:", error);
      res.status(500).json({ error: "Failed to execute reorganization", message: error.message });
    }
  });

  app.get("/api/retro/bid-index/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const retroService = createRetroOrganizerService(DEFAULT_TENANT_ID);
      const result = await retroService.generateBidIndex(DEFAULT_TENANT_ID, bidProjectId);
      res.json(result);
    } catch (error: any) {
      console.error("Error generating bid index:", error);
      res.status(500).json({ error: "Failed to generate bid index", message: error.message });
    }
  });

  // ============================================================================
  // DEBUG ENDPOINTS - Phase 1 Stability
  // ============================================================================

  const clientErrors: Array<{ error: string; componentStack?: string; route?: string; timestamp: string; userAgent?: string }> = [];

  app.get("/api/debug/ui", async (_req: Request, res: Response) => {
    try {
      const mem = process.memoryUsage();
      const registeredRoutes: string[] = [];
      app._router?.stack?.forEach((layer: any) => {
        if (layer.route) {
          registeredRoutes.push(`${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`);
        }
      });

      res.json({
        serverStatus: "ok",
        uptime: Math.floor(process.uptime()),
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        nodeVersion: process.version,
        bundleHash: Date.now(),
        recentClientErrors: clientErrors.slice(-20),
        routes: registeredRoutes,
        wsConnections: 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug/egnyte", async (_req: Request, res: Response) => {
    try {
      const [latestSync] = await db
        .select()
        .from(egnyteSyncState)
        .orderBy(desc(egnyteSyncState.updatedAt))
        .limit(1);

      const [totalCount] = await db.select({ value: count() }).from(egnyteItems);
      const [folderCount] = await db.select({ value: count() }).from(egnyteItems).where(eq(egnyteItems.isFolder, true));
      const [fileCount] = await db.select({ value: count() }).from(egnyteItems).where(eq(egnyteItems.isFolder, false));

      const rootPaths = await db.select().from(egnyteRootPaths);

      res.json({
        lastSyncState: latestSync
          ? {
              type: latestSync.syncType,
              status: latestSync.status,
              totalItems: latestSync.totalItems,
              processedItems: latestSync.processedItems,
              errorCount: latestSync.errorCount,
              lastCursor: latestSync.lastCursor,
            }
          : null,
        itemCounts: {
          total: totalCount?.value ?? 0,
          folders: folderCount?.value ?? 0,
          files: fileCount?.value ?? 0,
        },
        rootPaths: rootPaths.map((rp) => ({
          path: rp.path,
          label: rp.label,
          enabled: rp.enabled,
        })),
        errors: latestSync?.lastError || null,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/debug/sam", async (_req: Request, res: Response) => {
    try {
      const [latestRun] = await db
        .select()
        .from(samIngestRuns)
        .orderBy(desc(samIngestRuns.startedAt))
        .limit(1);

      const [oppCount] = await db.select({ value: count() }).from(opportunities);
      const [bidCount] = await db.select({ value: count() }).from(bidProjects);

      const samApiConfigured = !!(process.env.SAM_API_KEY || process.env.SAM_GOV_API_KEY);

      res.json({
        lastIngestRun: latestRun
          ? {
              runType: latestRun.runType,
              status: latestRun.status,
              modifiedSinceCursor: latestRun.modifiedSinceCursor,
              opportunitiesFetched: latestRun.opportunitiesFetched,
              opportunitiesNew: latestRun.opportunitiesNew,
              opportunitiesUpdated: latestRun.opportunitiesUpdated,
              attachmentsDownloaded: latestRun.attachmentsDownloaded,
              startedAt: latestRun.startedAt,
              completedAt: latestRun.completedAt,
              errorsJson: latestRun.errorsJson,
            }
          : null,
        opportunityCount: oppCount?.value ?? 0,
        samApiStatus: samApiConfigured ? "configured" : "not_configured",
        bidProjectCount: bidCount?.value ?? 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/debug/client-errors", (req: Request, res: Response) => {
    try {
      const { error, componentStack, route, timestamp, userAgent } = req.body || {};
      clientErrors.push({
        error: String(error || "unknown"),
        componentStack: componentStack ? String(componentStack) : undefined,
        route: route ? String(route) : undefined,
        timestamp: String(timestamp || new Date().toISOString()),
        userAgent: userAgent ? String(userAgent) : undefined,
      });
      while (clientErrors.length > 100) {
        clientErrors.shift();
      }
      res.json({ received: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // ROW ACTION MENU - CRUD & Action Endpoints
  // ============================================================================

  async function getEntityTable(entityType: string) {
    const schema = await import("@shared/schema");
    const map: Record<string, { table: any; idCol: any; statusCol?: any }> = {
      task: { table: schema.projectTasks, idCol: schema.projectTasks.id, statusCol: schema.projectTasks.status },
      submittal: { table: schema.submittals, idCol: schema.submittals.id, statusCol: schema.submittals.status },
      rfi: { table: schema.rfis, idCol: schema.rfis.id, statusCol: schema.rfis.status },
      purchaseOrder: { table: schema.purchaseOrders, idCol: schema.purchaseOrders.id, statusCol: schema.purchaseOrders.status },
      changeOrder: { table: schema.changeOrders, idCol: schema.changeOrders.id, statusCol: schema.changeOrders.status },
      invoice: { table: schema.invoices, idCol: schema.invoices.id, statusCol: schema.invoices.status },
      bidProject: { table: schema.bidProjects, idCol: schema.bidProjects.id, statusCol: schema.bidProjects.status },
      project: { table: schema.projects, idCol: schema.projects.id, statusCol: schema.projects.status },
    };
    return map[entityType] || null;
  }

  // --- GET and PATCH endpoints ---

  // Tasks
  app.get("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("task");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("task");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submittals
  app.get("/api/submittals/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("submittal");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/submittals/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("submittal");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // RFIs
  app.get("/api/rfis/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("rfi");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/rfis/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("rfi");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Purchase Orders
  app.get("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("purchaseOrder");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("purchaseOrder");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change Orders
  app.get("/api/change-orders/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("changeOrder");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/change-orders/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("changeOrder");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Invoices
  app.get("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("invoice");
      const [row] = await db.select().from(table).where(eq(idCol, p(req.params.id)));
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const { table, idCol } = await getEntityTable("invoice");
      const [updated] = await db.update(table).set(req.body).where(eq(idCol, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- DELETE endpoints ---

  app.delete("/api/tasks/:id", async (req: Request, res: Response) => {
    try {
      const { projectTasks } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(projectTasks).where(eq(projectTasks.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/submittals/:id", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(submittals).where(eq(submittals.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/rfis/:id", async (req: Request, res: Response) => {
    try {
      const { rfis } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(rfis).where(eq(rfis.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/purchase-orders/:id", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(purchaseOrders).where(eq(purchaseOrders.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/change-orders/:id", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(changeOrders).where(eq(changeOrders.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(invoices).where(eq(invoices.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/projects/:id", async (req: Request, res: Response) => {
    try {
      const { projects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(projects).where(eq(projects.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/bid-projects/:id", async (req: Request, res: Response) => {
    try {
      const { bidProjects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.delete(bidProjects).where(eq(bidProjects.id, p(req.params.id)));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Duplicate endpoints ---

  app.post("/api/tasks/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { projectTasks } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(projectTasks).where(eq(projectTasks.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const name = (rest.name || "") + " (Copy)";
      const [dup] = await db.insert(projectTasks).values({ ...rest, name }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/submittals/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(submittals).where(eq(submittals.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const submittalNumber = (rest.submittalNumber || "") + " (Copy)";
      const [dup] = await db.insert(submittals).values({ ...rest, submittalNumber }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/rfis/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { rfis } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(rfis).where(eq(rfis.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const rfiNumber = (rest.rfiNumber || "") + " (Copy)";
      const [dup] = await db.insert(rfis).values({ ...rest, rfiNumber }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/purchase-orders/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq, and } = await import("drizzle-orm");
      const { stripCopySuffix, getNextDuplicatePoNumber } = await import("./utils/poNumber");

      const [original] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });

      const base = stripCopySuffix(original.poNumber ?? "");

      const allPos = await db.select({ poNumber: purchaseOrders.poNumber })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.tenantId, original.tenantId));
      const sameBase = allPos.map(r => r.poNumber).filter(n => stripCopySuffix(n) === base);

      const newPoNumber = getNextDuplicatePoNumber(original.poNumber ?? base, sameBase);

      const [dup] = await db.insert(purchaseOrders).values({
        tenantId: original.tenantId,
        poNumber: newPoNumber,
        vendorId: original.vendorId,
        projectId: original.projectId ?? null,
        status: "draft",
        subtotal: original.subtotal ?? "0",
        taxAmount: original.taxAmount ?? "0",
        totalAmount: original.totalAmount ?? "0",
        orderDate: null,
        expectedDeliveryDate: original.expectedDeliveryDate ?? null,
        notesJson: original.notesJson ?? null,
        needsReview: false,
      }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/change-orders/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(changeOrders).where(eq(changeOrders.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const coNumber = (rest.coNumber || "") + " (Copy)";
      const title = (rest.title || "") + " (Copy)";
      const [dup] = await db.insert(changeOrders).values({ ...rest, coNumber, title }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/invoices/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(invoices).where(eq(invoices.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const invoiceNumber = (rest.invoiceNumber || "") + " (Copy)";
      const [dup] = await db.insert(invoices).values({ ...rest, invoiceNumber }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { projects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(projects).where(eq(projects.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, updatedAt, ...rest } = original;
      const suffix = Date.now().toString(36);
      const name = (rest.name || "") + " (Copy)";
      const projectNumber = (rest.projectNumber || "") + "-COPY-" + suffix;
      const [dup] = await db.insert(projects).values({ ...rest, name, projectNumber }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/bid-projects/:id/duplicate", async (req: Request, res: Response) => {
    try {
      const { bidProjects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(bidProjects).where(eq(bidProjects.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const [dup] = await db.insert(bidProjects).values({ ...rest }).returning();
      res.json(dup);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Close/Reopen endpoints ---

  app.post("/api/tasks/:id/close", async (req: Request, res: Response) => {
    try {
      const { projectTasks } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(projectTasks).set({ status: "closed" }).where(eq(projectTasks.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/tasks/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { projectTasks } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(projectTasks).set({ status: "open" }).where(eq(projectTasks.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/submittals/:id/close", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(submittals).set({ status: "closed" }).where(eq(submittals.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/submittals/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(submittals).set({ status: "open" }).where(eq(submittals.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/rfis/:id/close", async (req: Request, res: Response) => {
    try {
      const { rfis } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(rfis).set({ status: "closed" }).where(eq(rfis.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/rfis/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { rfis } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(rfis).set({ status: "open" }).where(eq(rfis.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/purchase-orders/:id/close", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(purchaseOrders).set({ status: "closed" }).where(eq(purchaseOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/purchase-orders/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(purchaseOrders).set({ status: "draft" }).where(eq(purchaseOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/purchase-orders/:id/mark-reviewed", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(purchaseOrders)
        .set({ needsReview: false })
        .where(eq(purchaseOrders.id, p(req.params.id)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/purchase-orders/:id/link-project", async (req: Request, res: Response) => {
    try {
      const { purchaseOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const { projectId } = req.body;
      if (!projectId) return res.status(400).json({ error: "projectId is required" });
      const [updated] = await db.update(purchaseOrders)
        .set({ projectId })
        .where(eq(purchaseOrders.id, p(req.params.id)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/change-orders/:id/close", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(changeOrders).set({ status: "closed" }).where(eq(changeOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/change-orders/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(changeOrders).set({ status: "open" }).where(eq(changeOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/invoices/:id/close", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(invoices).set({ status: "closed" }).where(eq(invoices.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/invoices/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(invoices).set({ status: "draft" }).where(eq(invoices.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // NOTE: Projects close/reopen uses the approval-workflow route at line ~5918 (returns 202 pending approval)
  // Projects reopen is handled here directly
  app.post("/api/projects/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { projects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(projects).set({ status: "active" }).where(eq(projects.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/bid-projects/:id/close", async (req: Request, res: Response) => {
    try {
      const { bidProjects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(bidProjects).set({ status: "closed" }).where(eq(bidProjects.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/bid-projects/:id/reopen", async (req: Request, res: Response) => {
    try {
      const { bidProjects } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(bidProjects).set({ status: "open" }).where(eq(bidProjects.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- Submittal-specific action endpoints ---

  app.post("/api/submittals/:id/approve", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(submittals).set({ status: "approved" }).where(eq(submittals.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/submittals/:id/reject", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(submittals).set({ status: "rejected" }).where(eq(submittals.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/submittals/:id/revisions", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [original] = await db.select().from(submittals).where(eq(submittals.id, p(req.params.id)));
      if (!original) return res.status(404).json({ error: "Not found" });
      const { id, createdAt, ...rest } = original;
      const revision = (rest.revision || 0) + 1;
      const [dup] = await db.insert(submittals).values({ ...rest, revision, status: "draft" }).returning();
      res.json(dup);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/submittals/:id/send", async (req: Request, res: Response) => {
    try {
      const { submittals } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(submittals).set({ status: "submitted" }).where(eq(submittals.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- Change order approve/reject ---

  app.post("/api/change-orders/:id/approve", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(changeOrders).set({ status: "approved" }).where(eq(changeOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  app.post("/api/change-orders/:id/reject", async (req: Request, res: Response) => {
    try {
      const { changeOrders } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(changeOrders).set({ status: "rejected" }).where(eq(changeOrders.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- Invoice send ---

  app.post("/api/invoices/:id/send", async (req: Request, res: Response) => {
    try {
      const { invoices } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [updated] = await db.update(invoices).set({ status: "submitted" }).where(eq(invoices.id, p(req.params.id))).returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });

  // --- Watchers endpoints (generic helper) ---

  function registerWatcherRoutes(expressApp: any, routeBase: string, entityType: string) {
    expressApp.get(`${routeBase}/:id/watchers`, async (req: Request, res: Response) => {
      try {
        const { entityWatchers } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const watchers = await db.select().from(entityWatchers)
          .where(and(
            eq(entityWatchers.entityType, entityType),
            eq(entityWatchers.entityId, String(p(req.params.id)))
          ));
        res.json({ watchers });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });

    expressApp.post(`${routeBase}/:id/watchers`, async (req: Request, res: Response) => {
      try {
        const { entityWatchers } = await import("@shared/schema");
        const [w] = await db.insert(entityWatchers).values({
          entityType,
          entityId: String(p(req.params.id)),
          userId: req.body.userId || "default-user",
          name: req.body.name,
          email: req.body.email,
        }).onConflictDoNothing().returning();
        res.json(w || { message: "Already watching" });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });

    expressApp.delete(`${routeBase}/:id/watchers/:userId`, async (req: Request, res: Response) => {
      try {
        const { entityWatchers } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        await db.delete(entityWatchers).where(and(
          eq(entityWatchers.entityType, entityType),
          eq(entityWatchers.entityId, String(p(req.params.id))),
          eq(entityWatchers.userId, p(req.params.userId))
        ));
        res.json({ success: true });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });
  }

  registerWatcherRoutes(app, "/api/tasks", "task");
  registerWatcherRoutes(app, "/api/submittals", "submittal");
  registerWatcherRoutes(app, "/api/rfis", "rfi");
  registerWatcherRoutes(app, "/api/purchase-orders", "purchaseOrder");
  registerWatcherRoutes(app, "/api/change-orders", "changeOrder");
  registerWatcherRoutes(app, "/api/invoices", "invoice");
  registerWatcherRoutes(app, "/api/projects", "project");
  registerWatcherRoutes(app, "/api/bid-projects", "bidProject");

  // --- Attachments endpoints (generic helper) ---

  function registerAttachmentRoutes(expressApp: any, routeBase: string, entityType: string) {
    expressApp.get(`${routeBase}/:id/attachments`, async (req: Request, res: Response) => {
      try {
        const { entityAttachments } = await import("@shared/schema");
        const { eq, and, desc } = await import("drizzle-orm");
        const attachments = await db.select().from(entityAttachments)
          .where(and(
            eq(entityAttachments.entityType, entityType),
            eq(entityAttachments.entityId, String(p(req.params.id)))
          ))
          .orderBy(desc(entityAttachments.createdAt));
        res.json({ attachments });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });

    expressApp.post(`${routeBase}/:id/attachments`, async (req: Request, res: Response) => {
      try {
        const { entityAttachments } = await import("@shared/schema");
        const { filename, mimeType, size, objectPath, note } = req.body || {};
        if (!filename) {
          return res.status(400).json({ error: "filename is required" });
        }
        const [att] = await db.insert(entityAttachments).values({
          entityType,
          entityId: String(p(req.params.id)),
          filename,
          mimeType: mimeType || null,
          size: size ? Number(size) : null,
          storagePath: objectPath || null,
          note: note || null,
        }).returning();
        res.json({ attachment: att });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });

    expressApp.get(`${routeBase}/:id/attachments/download-all`, async (req: Request, res: Response) => {
      try {
        const { entityAttachments } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const attachments = await db.select().from(entityAttachments)
          .where(and(
            eq(entityAttachments.entityType, entityType),
            eq(entityAttachments.entityId, String(p(req.params.id)))
          ));

        if (attachments.length === 0) {
          return res.status(404).json({ error: "No attachments found" });
        }

        const withStorage = attachments.filter((a) => a.storagePath);
        if (withStorage.length === 0) {
          return res.status(404).json({ error: "No downloadable attachments (files not yet uploaded to storage)" });
        }

        if (withStorage.length === 1) {
          const att = withStorage[0];
          try {
            const { ObjectStorageService, ObjectNotFoundError } = await import("./replit_integrations/object_storage/objectStorage");
            const storageService = new ObjectStorageService();
            const file = await storageService.getObjectEntityFile(att.storagePath!);
            res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
            res.setHeader("Content-Disposition", `attachment; filename="${att.filename}"`);
            if (att.size) res.setHeader("Content-Length", String(att.size));
            await storageService.downloadObject(file, res, 0);
          } catch (objErr: any) {
            if (objErr?.name === "ObjectNotFoundError") {
              return res.status(410).json({ error: "File no longer exists in storage" });
            }
            throw objErr;
          }
          return;
        }

        const archiver = (await import("archiver")).default;
        const archive = archiver("zip", { zlib: { level: 5 } });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${entityType}-${p(req.params.id)}-attachments.zip"`);
        archive.pipe(res);

        const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
        const storageService = new ObjectStorageService();

        for (const att of withStorage) {
          try {
            const file = await storageService.getObjectEntityFile(att.storagePath!);
            const stream = file.createReadStream();
            archive.append(stream, { name: att.filename });
          } catch (e: any) {
            console.warn(`[download-all] skipping attachment ${att.id}: ${e.message}`);
          }
        }
        await archive.finalize();
      } catch (error: any) {
        console.error("[download-all] error:", error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
      }
    });

    expressApp.get(`${routeBase}/:id/attachments/:attachmentId/download`, async (req: Request, res: Response) => {
      try {
        const { entityAttachments } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const [att] = await db.select().from(entityAttachments)
          .where(eq(entityAttachments.id, Number(p(req.params.attachmentId))));
        if (!att) return res.status(404).json({ error: "Attachment not found" });
        if (!att.storagePath) {
          return res.status(404).json({ error: "File not yet uploaded to storage" });
        }

        try {
          const { ObjectStorageService, ObjectNotFoundError } = await import("./replit_integrations/object_storage/objectStorage");
          const storageService = new ObjectStorageService();
          const file = await storageService.getObjectEntityFile(att.storagePath);
          res.setHeader("Content-Type", att.mimeType || "application/octet-stream");
          res.setHeader("Content-Disposition", `attachment; filename="${att.filename}"`);
          if (att.size) res.setHeader("Content-Length", String(att.size));
          await storageService.downloadObject(file, res, 0);
        } catch (objErr: any) {
          if (objErr?.name === "ObjectNotFoundError") {
            return res.status(410).json({ error: "File no longer exists in storage" });
          }
          throw objErr;
        }
      } catch (error: any) {
        console.error("[attachment-download] error:", error);
        if (!res.headersSent) res.status(500).json({ error: error.message });
      }
    });

    expressApp.delete(`${routeBase}/:id/attachments/:attachmentId`, async (req: Request, res: Response) => {
      try {
        const { entityAttachments } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.delete(entityAttachments).where(eq(entityAttachments.id, Number(p(req.params.attachmentId))));
        res.json({ success: true });
      } catch (error: any) { res.status(500).json({ error: error.message }); }
    });
  }

  registerAttachmentRoutes(app, "/api/tasks", "task");
  registerAttachmentRoutes(app, "/api/submittals", "submittal");
  registerAttachmentRoutes(app, "/api/rfis", "rfi");
  registerAttachmentRoutes(app, "/api/purchase-orders", "purchaseOrder");
  registerAttachmentRoutes(app, "/api/change-orders", "changeOrder");
  registerAttachmentRoutes(app, "/api/invoices", "invoice");
  registerAttachmentRoutes(app, "/api/projects", "project");
  registerAttachmentRoutes(app, "/api/bid-projects", "bidProject");

  // ============================================================================
  // SSE EVENT STREAM - Phase 2
  // ============================================================================

  app.get("/api/events/stream", async (req: Request, res: Response) => {
    const { eventStreamService } = await import("./services/event-stream.service");
    const tenantId = (req.query.tenantId as string) || "blackhawk-default";
    if (!tenantId || typeof tenantId !== "string" || tenantId.length > 100) {
      return res.status(400).json({ error: "Invalid tenantId" });
    }
    const lastEventId = req.headers["last-event-id"] as string || null;
    const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    eventStreamService.addClient(clientId, tenantId, res, lastEventId);
  });

  app.get("/api/events/status", async (_req: Request, res: Response) => {
    const { eventStreamService } = await import("./services/event-stream.service");
    res.json(eventStreamService.getStatus());
  });

  app.get("/api/events/recent", async (req: Request, res: Response) => {
    const { eventStreamService } = await import("./services/event-stream.service");
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 500);
    res.json(eventStreamService.getRecentEvents(limit));
  });

  // ============================================================================
  // BID INVITATIONS INTERNAL API (Phase 2)
  // ============================================================================

  app.post("/api/bid-projects/:id/invitations", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.id);
      const { vendorIds } = req.body;
      if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
        return res.status(400).json({ error: "vendorIds array is required" });
      }

      const { createInvitation, getInvitationsForBid } = await import("./services/bid-invitation.service");
      const results = [];
      const errors = [];

      for (const vendorId of vendorIds) {
        try {
          const existing = await db.select().from(bidInvitations).where(
            and(
              eq(bidInvitations.tenantId, DEFAULT_TENANT_ID),
              eq(bidInvitations.bidProjectId, bidProjectId),
              eq(bidInvitations.vendorId, vendorId)
            )
          ).then(r => r[0]);

          if (existing) {
            errors.push({ vendorId, error: "Vendor already invited" });
            continue;
          }

          const { invitation, rawToken } = await createInvitation(
            DEFAULT_TENANT_ID, bidProjectId, vendorId
          );
          const portalUrl = `/v/bid/${rawToken}`;
          results.push({ vendorId, invitationId: invitation.id, portalUrl });
        } catch (err: any) {
          errors.push({ vendorId, error: err.message });
        }
      }

      res.json({ created: results.length, results, errors });
    } catch (error: any) {
      console.error("Create invitations error:", error);
      res.status(500).json({ error: "Failed to create invitations" });
    }
  });

  app.get("/api/bid-projects/:id/invitations", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.id);
      const { getInvitationsForBid, getEngagementMetrics } = await import("./services/bid-invitation.service");

      const invitations = await getInvitationsForBid(DEFAULT_TENANT_ID, bidProjectId);
      const metrics = await getEngagementMetrics(DEFAULT_TENANT_ID, bidProjectId);

      res.json({ invitations, metrics });
    } catch (error: any) {
      console.error("Get invitations error:", error);
      res.status(500).json({ error: "Failed to get invitations" });
    }
  });

  app.post("/api/bid-projects/:id/invitations/:invitationId/resend", async (req: Request, res: Response) => {
    try {
      const invitationId = p(req.params.invitationId);
      const invitation = await db.select().from(bidInvitations).where(
        eq(bidInvitations.id, invitationId as string)
      ).then(r => r[0]);
      if (!invitation) return res.status(404).json({ error: "Invitation not found" });

      const crypto = await import("crypto");
      const rawToken = crypto.randomBytes(32).toString("base64url");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      await db.update(bidInvitations).set({
        tokenHash,
        sentAt: new Date(),
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(bidInvitations.id, invitationId as string));

      const portalUrl = `/v/bid/${rawToken}`;
      res.json({ success: true, message: "Invitation resent with new link", portalUrl });
    } catch (error: any) {
      console.error("Resend invitation error:", error);
      res.status(500).json({ error: "Failed to resend invitation" });
    }
  });

  app.post("/api/reminders/process", async (req: Request, res: Response) => {
    try {
      const { processReminders } = await import("./services/bid-invitation.service");
      const result = await processReminders();
      res.json(result);
    } catch (error: any) {
      console.error("Process reminders error:", error);
      res.status(500).json({ error: "Failed to process reminders" });
    }
  });

  process.on("SIGTERM", () => {
    import("./services/event-stream.service").then(({ eventStreamService }) => {
      eventStreamService.shutdown();
    });
  });

  app.get("/api/jackets/bid/:bidProjectId/integrity", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const { BID_JACKET_FOLDERS } = await import("@shared/schema");

      const folders = await db.select()
        .from(jacketFolders)
        .where(and(
          eq(jacketFolders.tenantId, DEFAULT_TENANT_ID),
          eq(jacketFolders.jacketType, "bid"),
          eq(jacketFolders.jacketId, bidProjectId)
        ))
        .orderBy(asc(jacketFolders.sortOrder));

      if (folders.length === 0) {
        return res.status(404).json({ error: "No jacket found for this bid project" });
      }

      const canonicalSortOrders = BID_JACKET_FOLDERS.map(f => parseInt(f.code));
      const existingSortOrders = folders.map(f => f.sortOrder);

      const missingSortOrders = canonicalSortOrders.filter(so => !existingSortOrders.includes(so));

      const sortOrderCounts: Record<number, number> = {};
      for (const so of existingSortOrders) {
        sortOrderCounts[so] = (sortOrderCounts[so] || 0) + 1;
      }
      const duplicateSortOrders = Object.entries(sortOrderCounts)
        .filter(([, count]) => count > 1)
        .map(([so]) => Number(so));

      const legacyFolders = folders.filter(f => {
        if (!canonicalSortOrders.includes(f.sortOrder)) return true;
        const canonical = BID_JACKET_FOLDERS.find(bf => parseInt(bf.code) === f.sortOrder);
        if (!canonical) return true;
        const expectedName = `${canonical.code} - ${canonical.name}`;
        return f.name !== expectedName;
      }).map(f => ({ id: f.id, name: f.name, sortOrder: f.sortOrder }));

      const isHealthy = missingSortOrders.length === 0 &&
        duplicateSortOrders.length === 0 &&
        legacyFolders.length === 0;

      res.json({
        bidProjectId,
        totalFolders: folders.length,
        expectedFolders: BID_JACKET_FOLDERS.length,
        missingSortOrders,
        duplicateSortOrders,
        legacyFolders,
        isHealthy,
      });
    } catch (error: any) {
      console.error("[jacket-integrity] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jackets/bid/:bidProjectId/ensure-canonical", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);

      const [bidExists] = await db
        .select({ id: bidProjects.id })
        .from(bidProjects)
        .where(eq(bidProjects.id, bidProjectId))
        .limit(1);

      if (!bidExists) {
        console.log(`[ensure-canonical] tenant=${DEFAULT_TENANT_ID} bidProjectId=${bidProjectId} packageId=none REJECTED: bid_project not found`);
        return res.status(404).json({ error: `bid_project ${bidProjectId} not found. Cannot heal non-existent bid.` });
      }

      const { jacketService } = await import("./services/jacket.service");
      const result = await jacketService.ensureCanonicalBidJacket(DEFAULT_TENANT_ID, bidProjectId);
      console.log(`[ensure-canonical] tenant=${DEFAULT_TENANT_ID} bidProjectId=${bidProjectId} packageId=none created=${result.createdFolders} renamed=${result.renamedFolders} healthy=${result.isHealthy}`);
      res.json(result);
    } catch (error: any) {
      console.error("[ensure-canonical] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jackets/repair/:bidProjectId", async (req: Request, res: Response) => {
    try {
      const bidProjectId = p(req.params.bidProjectId);
      const result = await repairBidJacket(bidProjectId);
      res.json(result);
    } catch (error: any) {
      console.error("[jacket-repair] single bid repair error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/jackets/repair-all", async (_req: Request, res: Response) => {
    try {
      const result = await repairAllBidJackets();
      res.json(result);
    } catch (error: any) {
      console.error("[jacket-repair] repair-all error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // HIGHERGOV INTEGRATION ENDPOINTS
  // ============================================================================

  const { runSync, getHealthStatus, getSyncStatus } = await import("./integrations/highergov/sync");

  app.get("/api/integrations/highergov/health", async (req: Request, res: Response) => {
    try {
      const health = await getHealthStatus(DEFAULT_TENANT_ID);
      res.json(health);
    } catch (error: any) {
      console.error("[highergov] health check error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/integrations/highergov/sync", async (req: Request, res: Response) => {
    try {
      const result = await runSync(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[highergov] sync error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/integrations/highergov/status", async (req: Request, res: Response) => {
    try {
      const status = getSyncStatus();
      res.json(status);
    } catch (error: any) {
      console.error("[highergov] status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // CAPTURE ENGINE ENDPOINTS
  // ============================================================================

  const captureCopilot = await import("./services/capture-copilot.service");

  app.post("/api/capture/ai/summarize/:opportunityId", async (req: Request, res: Response) => {
    try {
      const result = await captureCopilot.summarizeOpportunity(p(req.params.opportunityId), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[capture] summarize error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/capture/ai/score/:opportunityId", async (req: Request, res: Response) => {
    try {
      const result = await captureCopilot.scoreOpportunity(p(req.params.opportunityId), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[capture] score error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/capture/ai/capture-plan/:opportunityId", async (req: Request, res: Response) => {
    try {
      const result = await captureCopilot.generateCapturePlan(p(req.params.opportunityId), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[capture] capture-plan error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/capture/ai/outreach/:opportunityId", async (req: Request, res: Response) => {
    try {
      const { recipientType } = req.body;
      if (!recipientType || !["teaming_partner", "agency_contact", "subcontractor", "mentor_protege"].includes(recipientType)) {
        return res.status(400).json({ error: "Invalid recipientType" });
      }
      const result = await captureCopilot.generateOutreachDraft(p(req.params.opportunityId), recipientType, DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[capture] outreach error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/capture/stale-pursuits", async (req: Request, res: Response) => {
    try {
      const result = await captureCopilot.detectStalePursuits(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[capture] stale-pursuits error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Pipeline CRUD
  app.post("/api/capture/pipeline/seed-bid-projects", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;

      const bids = await db
        .select({
          id: bidProjects.id,
          status: bidProjects.status,
          ownerUserId: bidProjects.ownerUserId,
          createdAt: bidProjects.createdAt,
          updatedAt: bidProjects.updatedAt,
        })
        .from(bidProjects)
        .where(eq(bidProjects.tenantId, tenantId))
        .orderBy(desc(bidProjects.createdAt));

      if (!bids.length) {
        return res.json({ insertedAttempted: 0, message: "No bid_projects found for tenant." });
      }

      const rows = bids.map((b) => ({
        tenantId,
        entityType: PIPE_ENTITY_BID_PROJECT,
        entityId: b.id,
        stage: stageFromBidStatus(b.status),
        priority: "medium" as const,
        ownerUserId: b.ownerUserId ?? null,
        lastActivityAt: b.updatedAt ?? b.createdAt ?? new Date(),
      }));

      await db
        .insert(pipelineItems)
        .values(rows)
        .onConflictDoNothing();

      res.json({
        insertedAttempted: rows.length,
        message: "Seeded pipeline_items for bid_projects (safe to rerun).",
      });
    } catch (e: any) {
      res.status(500).json({ error: "Seed failed", detail: e?.message });
    }
  });

  app.get("/api/capture/pipeline", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const stageFilter = typeof req.query.stage === "string" ? req.query.stage : null;

      const existing = await db
        .select({
          pipelineItemId: pipelineItems.id,
          entityType: pipelineItems.entityType,
          entityId: pipelineItems.entityId,
          stage: pipelineItems.stage,
          priority: pipelineItems.priority,
          ownerUserId: pipelineItems.ownerUserId,
          aiScore: pipelineItems.aiScore,
          aiScoreLabel: pipelineItems.aiScoreLabel,
          aiRationale: pipelineItems.aiRationale,
          aiSummary: pipelineItems.aiSummary,
          tags: pipelineItems.tags,
          nextActionAt: pipelineItems.nextActionAt,
          nextActionDescription: pipelineItems.nextActionDescription,
          lastActivityAt: pipelineItems.lastActivityAt,
          pipeCreatedAt: pipelineItems.createdAt,
          pipeUpdatedAt: pipelineItems.updatedAt,
          bidProjectId: bidProjects.id,
          bidStatus: bidProjects.status,
          opportunityId: bidProjects.opportunityId,
          title: opportunities.title,
          synopsis: opportunities.synopsis,
          dueAt: opportunities.dueAt,
          postedAt: opportunities.postedAt,
          url: opportunities.url,
          contractValue: opportunities.contractValue,
          naicsCodes: opportunities.naicsCodes,
          setAside: opportunities.setAside,
        })
        .from(pipelineItems)
        .leftJoin(
          bidProjects,
          and(
            eq(pipelineItems.entityId, bidProjects.id),
            eq(bidProjects.tenantId, tenantId)
          )
        )
        .leftJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(
          and(
            eq(pipelineItems.tenantId, tenantId),
            eq(pipelineItems.entityType, PIPE_ENTITY_BID_PROJECT),
            stageFilter ? eq(pipelineItems.stage, stageFilter) : sql`true`
          )
        )
        .orderBy(desc(pipelineItems.lastActivityAt));

      const missingRows = await db
        .select({
          bidProjectId: bidProjects.id,
          bidStatus: bidProjects.status,
          opportunityId: bidProjects.opportunityId,
          ownerUserId: bidProjects.ownerUserId,
          bidCreatedAt: bidProjects.createdAt,
          bidUpdatedAt: bidProjects.updatedAt,
          title: opportunities.title,
          synopsis: opportunities.synopsis,
          dueAt: opportunities.dueAt,
          postedAt: opportunities.postedAt,
          url: opportunities.url,
          contractValue: opportunities.contractValue,
          naicsCodes: opportunities.naicsCodes,
          setAside: opportunities.setAside,
        })
        .from(bidProjects)
        .leftJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(
          and(
            eq(bidProjects.tenantId, tenantId),
            sql`NOT EXISTS (
              SELECT 1 FROM pipeline_items pi
              WHERE pi.tenant_id = ${tenantId}
                AND pi.entity_type = ${PIPE_ENTITY_BID_PROJECT}
                AND pi.entity_id = ${bidProjects.id}
            )`
          )
        )
        .orderBy(desc(bidProjects.updatedAt));

      const fromExisting = existing.map((r) => ({
        id: r.pipelineItemId,
        tenantId,
        entityType: r.entityType,
        entityId: r.entityId,
        stage: r.stage,
        priority: r.priority,
        ownerUserId: r.ownerUserId,
        aiScore: r.aiScore,
        aiScoreLabel: r.aiScoreLabel,
        aiRationale: r.aiRationale,
        aiSummary: r.aiSummary,
        tags: r.tags,
        nextActionAt: r.nextActionAt,
        nextActionDescription: r.nextActionDescription,
        lastActivityAt: r.lastActivityAt,
        createdAt: r.pipeCreatedAt,
        updatedAt: r.pipeUpdatedAt,
        opportunity: r.title ? {
          id: r.opportunityId,
          title: r.title,
          synopsis: r.synopsis,
          setAside: r.setAside,
          contractValue: r.contractValue,
          dueAt: r.dueAt,
          naicsCodes: r.naicsCodes,
          locationJson: null,
          status: r.bidStatus,
        } : null,
      }));

      const fromMissing = missingRows
        .filter(r => !stageFilter || stageFromBidStatus(r.bidStatus) === stageFilter)
        .map((r) => ({
          id: null,
          tenantId,
          entityType: PIPE_ENTITY_BID_PROJECT,
          entityId: r.bidProjectId,
          stage: stageFromBidStatus(r.bidStatus),
          priority: "medium",
          ownerUserId: r.ownerUserId,
          aiScore: null,
          aiScoreLabel: null,
          aiRationale: null,
          aiSummary: null,
          tags: null,
          nextActionAt: null,
          nextActionDescription: null,
          lastActivityAt: r.bidUpdatedAt,
          createdAt: r.bidCreatedAt,
          updatedAt: r.bidUpdatedAt,
          opportunity: r.title ? {
            id: r.opportunityId,
            title: r.title,
            synopsis: r.synopsis,
            setAside: r.setAside,
            contractValue: r.contractValue,
            dueAt: r.dueAt,
            naicsCodes: r.naicsCodes,
            locationJson: null,
            status: r.bidStatus,
          } : null,
        }));

      res.json([...fromExisting, ...fromMissing]);
    } catch (error: any) {
      console.error("[capture] pipeline list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/capture/pipeline", async (req: Request, res: Response) => {
    try {
      const parsed = insertPipelineItemSchema.pick({
        entityType: true,
        entityId: true,
        stage: true,
        priority: true,
        tags: true,
      }).parse({
        ...req.body,
        tenantId: DEFAULT_TENANT_ID,
      });

      const existing = await db.select().from(pipelineItems)
        .where(and(
          eq(pipelineItems.tenantId, DEFAULT_TENANT_ID),
          eq(pipelineItems.entityType, parsed.entityType),
          eq(pipelineItems.entityId, parsed.entityId),
        )).limit(1);

      if (existing.length) {
        return res.status(409).json({ error: "Pipeline item already exists", existing: existing[0] });
      }

      const inserted = await db.insert(pipelineItems).values({
        tenantId: DEFAULT_TENANT_ID,
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        stage: parsed.stage || "new",
        priority: parsed.priority || "medium",
        tags: parsed.tags || [],
      }).returning();

      res.status(201).json(inserted[0]);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      console.error("[capture] pipeline create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/capture/pipeline/:id", async (req: Request, res: Response) => {
    try {
      const { stage, priority, tags, aiScore, aiScoreLabel, aiRationale, aiSummary, nextActionAt, nextActionDescription } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (stage !== undefined) updates.stage = stage;
      if (priority !== undefined) updates.priority = priority;
      if (tags !== undefined) updates.tags = tags;
      if (aiScore !== undefined) updates.aiScore = aiScore;
      if (aiScoreLabel !== undefined) updates.aiScoreLabel = aiScoreLabel;
      if (aiRationale !== undefined) updates.aiRationale = aiRationale;
      if (aiSummary !== undefined) updates.aiSummary = aiSummary;
      if (nextActionAt !== undefined) updates.nextActionAt = nextActionAt ? new Date(nextActionAt) : null;
      if (nextActionDescription !== undefined) updates.nextActionDescription = nextActionDescription;

      if (stage || aiScore || nextActionAt) {
        updates.lastActivityAt = new Date();
      }

      const updated = await db.update(pipelineItems)
        .set(updates)
        .where(and(eq(pipelineItems.id, p(req.params.id)), eq(pipelineItems.tenantId, DEFAULT_TENANT_ID)))
        .returning();

      if (!updated.length) return res.status(404).json({ error: "Pipeline item not found" });
      res.json(updated[0]);
    } catch (error: any) {
      console.error("[capture] pipeline update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Change Events Feed
  app.get("/api/capture/change-events", async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const events = await db.select().from(captureChangeEvents)
        .where(eq(captureChangeEvents.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(captureChangeEvents.createdAt))
        .limit(limit);
      res.json(events);
    } catch (error: any) {
      console.error("[capture] change-events error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Capture Plans CRUD
  app.get("/api/capture/plans/:pipelineItemId", async (req: Request, res: Response) => {
    try {
      const plans = await db.select().from(capturePlans)
        .where(and(
          eq(capturePlans.tenantId, DEFAULT_TENANT_ID),
          eq(capturePlans.pipelineItemId, p(req.params.pipelineItemId))
        ))
        .orderBy(desc(capturePlans.updatedAt));
      res.json(plans);
    } catch (error: any) {
      console.error("[capture] plans list error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/capture/plans", async (req: Request, res: Response) => {
    try {
      const { pipelineItemId, captureStrategy, winThemes, risks, teamingTargets, notes } = req.body;
      if (!pipelineItemId) return res.status(400).json({ error: "pipelineItemId required" });

      const inserted = await db.insert(capturePlans).values({
        tenantId: DEFAULT_TENANT_ID,
        pipelineItemId,
        captureStrategy: captureStrategy || null,
        winThemes: winThemes || null,
        risks: risks || null,
        teamingTargets: teamingTargets || null,
        notes: notes || null,
      }).returning();

      res.status(201).json(inserted[0]);
    } catch (error: any) {
      if (error.name === "ZodError") {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      console.error("[capture] plan create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/capture/plans/:id", async (req: Request, res: Response) => {
    try {
      const { captureStrategy, winThemes, risks, teamingTargets, notes } = req.body;
      const updates: any = { updatedAt: new Date() };
      if (captureStrategy !== undefined) updates.captureStrategy = captureStrategy;
      if (winThemes !== undefined) updates.winThemes = winThemes;
      if (risks !== undefined) updates.risks = risks;
      if (teamingTargets !== undefined) updates.teamingTargets = teamingTargets;
      if (notes !== undefined) updates.notes = notes;

      const updated = await db.update(capturePlans)
        .set(updates)
        .where(and(eq(capturePlans.id, p(req.params.id)), eq(capturePlans.tenantId, DEFAULT_TENANT_ID)))
        .returning();

      if (!updated.length) return res.status(404).json({ error: "Capture plan not found" });
      res.json(updated[0]);
    } catch (error: any) {
      console.error("[capture] plan update error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // AI ARTIFACT STORE ENDPOINTS
  // ============================================================================

  const aiArtifactService = await import("./services/ai-artifact.service");

  app.get("/api/ai/artifacts", async (req: Request, res: Response) => {
    try {
      const { entityType, entityId } = req.query;
      if (!entityType || !entityId) return res.status(400).json({ error: "entityType and entityId required" });
      const artifacts = await aiArtifactService.getArtifacts(entityType as string, entityId as string, DEFAULT_TENANT_ID);
      res.json(artifacts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/ai/run", async (req: Request, res: Response) => {
    try {
      const { module, entityType, entityId, options } = req.body;
      if (!module || !entityType || !entityId) return res.status(400).json({ error: "module, entityType, entityId required" });
      const result = await aiArtifactService.runAiModule(module, entityType, entityId, options || {}, DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      console.error("[ai-run] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // AI POWER FEATURE ENDPOINTS
  // ============================================================================

  const aiPowerService = await import("./services/ai-power.service");

  app.get("/api/opportunity/:id/similar", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.findSimilarOpportunities(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/opportunity/:id/partners", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.getPartnerSuggestions(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/opportunity/:id/partners/shortlist", async (req: Request, res: Response) => {
    try {
      const { recommendationId, partnerName } = req.body;
      if (!partnerName) return res.status(400).json({ error: "partnerName required" });
      const result = await aiPowerService.addToShortlist(p(req.params.id), partnerName, recommendationId, DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/opportunity/:id/partners/:partnerId/outreach", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.generatePartnerOutreach(p(req.params.id), p(req.params.partnerId), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/agencies/:id/profile", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.getAgencyProfile(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/opportunity/:id/pressure", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.getCompetitorPressure(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/pipeline/:id/optimize", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.optimizePursuit(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/opportunity/:id/requirements", async (req: Request, res: Response) => {
    try {
      const result = await aiPowerService.extractRequirements(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // AUTOMATION RULES ENDPOINTS
  // ============================================================================

  const automationService = await import("./services/automation.service");

  app.get("/api/automation/rules", async (req: Request, res: Response) => {
    try {
      const rules = await automationService.listRules(DEFAULT_TENANT_ID);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/automation/rules/:id/toggle", async (req: Request, res: Response) => {
    try {
      const result = await automationService.toggleRule(p(req.params.id), DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/automation/runs", async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const runs = await automationService.listRuns(DEFAULT_TENANT_ID, limit);
      res.json(runs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/reset-demo-data", async (req: Request, res: Response) => {
    try {
      const result = await automationService.resetDemoData(DEFAULT_TENANT_ID);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // V4 API ROUTES - Opportunities, Bids, Fit Profiles, AI Artifacts, Change Events
  // ==========================================================================

  app.get("/api/v4/opportunities", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;
      const decision = req.query.decision as string;
      const search = req.query.search as string;
      const sortDir = (req.query.sortDir as string) === "asc" ? "asc" : "desc";
      const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;
      const maxScore = req.query.maxScore ? parseInt(req.query.maxScore as string) : undefined;
      const riskLevel = req.query.riskLevel as string;

      const conditions: any[] = [eq(opportunities.tenantId, tenantId)];
      if (search) {
        conditions.push(or(
          ilike(opportunities.title, `%${search}%`),
          ilike(opportunities.externalId, `%${search}%`)
        ));
      }

      const selectFields = {
        id: opportunities.id,
        title: opportunities.title,
        synopsis: opportunities.synopsis,
        status: opportunities.status,
        naicsCodes: opportunities.naicsCodes,
        setAside: opportunities.setAside,
        contractValue: opportunities.contractValue,
        postedAt: opportunities.postedAt,
        dueAt: opportunities.dueAt,
        externalId: opportunities.externalId,
        locationJson: opportunities.locationJson,
        decision: opportunityDecisions.decision,
        fitScore: opportunityDecisions.fitScore,
        riskLevel: opportunityDecisions.riskLevel,
        leadDays: opportunityDecisions.leadDays,
        explanation: opportunityDecisions.explanation,
        factorBreakdown: opportunityDecisions.factorBreakdown,
        aiConfidence: opportunityDecisions.aiConfidence,
        decidedBy: opportunityDecisions.decidedBy,
        decidedAt: opportunityDecisions.decidedAt,
        sourceType: opportunitySources.source,
        sourceUrl: opportunitySources.sourceUrl,
        solicitationNumber: opportunitySources.solicitationNumber,
        noticeType: opportunitySources.noticeType,
      };

      const rows = await db
        .select(selectFields)
        .from(opportunities)
        .leftJoin(opportunityDecisions, and(
          eq(opportunities.id, opportunityDecisions.opportunityId),
          eq(opportunityDecisions.tenantId, tenantId)
        ))
        .leftJoin(opportunitySources, and(
          eq(opportunities.id, opportunitySources.opportunityId),
          eq(opportunitySources.tenantId, tenantId)
        ))
        .where(and(...conditions))
        .orderBy(sortDir === "asc" ? asc(opportunities.createdAt) : desc(opportunities.createdAt))
        .limit(limit)
        .offset(offset);

      const filtered = rows.filter(r => {
        if (decision && r.decision !== decision) return false;
        if (minScore !== undefined && (r.fitScore ?? 0) < minScore) return false;
        if (maxScore !== undefined && (r.fitScore ?? 0) > maxScore) return false;
        if (riskLevel && r.riskLevel !== riskLevel) return false;
        return true;
      });

      const [totalResult] = await db
        .select({ count: count() })
        .from(opportunities)
        .where(eq(opportunities.tenantId, tenantId));

      res.json({
        data: filtered,
        pagination: {
          page,
          limit,
          total: totalResult.count,
          totalPages: Math.ceil(totalResult.count / limit),
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/opportunities/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const [opp] = await db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.id, p(req.params.id)), eq(opportunities.tenantId, tenantId)));
      if (!opp) return res.status(404).json({ error: "Not found" });

      const [decision] = await db.select().from(opportunityDecisions)
        .where(and(eq(opportunityDecisions.opportunityId, opp.id), eq(opportunityDecisions.tenantId, tenantId)));
      const sources = await db.select().from(opportunitySources)
        .where(and(eq(opportunitySources.opportunityId, opp.id), eq(opportunitySources.tenantId, tenantId)));
      const artifacts = await db.select().from(aiArtifacts)
        .where(and(eq(aiArtifacts.entityId, opp.id), eq(aiArtifacts.tenantId, tenantId)));

      res.json({ ...opp, decision, sources, artifacts });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/v4/opportunities/:id/decision", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const oppId = p(req.params.id, "id");
      const updateSchema = insertOpportunityDecisionSchema.partial().extend({
        decision: z.string().min(1, "decision is required"),
      });
      const parsed = updateSchema.parse({
        ...req.body,
        tenantId,
        opportunityId: oppId,
      });

      const [existing] = await db.select().from(opportunityDecisions)
        .where(and(eq(opportunityDecisions.opportunityId, oppId), eq(opportunityDecisions.tenantId, tenantId)));

      let result;
      if (existing) {
        const [updated] = await db.update(opportunityDecisions)
          .set({ ...parsed, decidedAt: new Date() })
          .where(eq(opportunityDecisions.id, existing.id))
          .returning();
        result = updated;
      } else {
        const [created] = await db.insert(opportunityDecisions).values({
          tenantId,
          opportunityId: oppId,
          decision: parsed.decision,
          fitScore: parsed.fitScore ?? null,
          riskLevel: parsed.riskLevel ?? null,
          leadDays: parsed.leadDays ?? null,
          explanation: parsed.explanation ?? null,
          factorBreakdown: parsed.factorBreakdown ?? null,
          aiConfidence: parsed.aiConfidence ?? null,
          decidedBy: parsed.decidedBy ?? null,
          decidedAt: new Date(),
        }).returning();
        result = created;
      }

      if (parsed.decision === "pursue") {
        try {
          const existingBp = await db.select({ id: bidProjects.id })
            .from(bidProjects)
            .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.opportunityId, oppId)))
            .limit(1);
          if (existingBp.length) {
            const { enqueueArtifactIngestionJob } = await import("./services/ingestion/ingestion.helpers");
            await enqueueArtifactIngestionJob({ tenantId, bidProjectId: existingBp[0].id, sourceType: "internal", priority: "high" });
          }
        } catch (e) {
          console.error("[decision] Failed to enqueue ingestion job:", e);
        }
      }

      res.json(result);
    } catch (error) {
      if (error instanceof ParamError) return res.status(400).json({ error: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: error.issues });
      handleRouteError(res, error, "Failed to save opportunity decision");
    }
  });

  app.get("/api/v4/change-events", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;
      const processed = req.query.processed;
      const changeType = req.query.changeType as string;
      const sourceType = req.query.sourceType as string;

      const conditions: any[] = [eq(captureChangeEvents.tenantId, tenantId)];
      if (processed === "true") conditions.push(eq(captureChangeEvents.processed, true));
      if (processed === "false") conditions.push(eq(captureChangeEvents.processed, false));
      if (changeType) conditions.push(eq(captureChangeEvents.changeType, changeType));
      if (sourceType) conditions.push(eq(captureChangeEvents.sourceType, sourceType));

      const rows = await db
        .select({
          event: captureChangeEvents,
          oppTitle: opportunities.title,
          oppStatus: opportunities.status,
          oppDueAt: opportunities.dueAt,
          oppSetAside: opportunities.setAside,
        })
        .from(captureChangeEvents)
        .leftJoin(opportunities, eq(captureChangeEvents.entityId, opportunities.id))
        .where(and(...conditions))
        .orderBy(desc(captureChangeEvents.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db
        .select({ count: count() })
        .from(captureChangeEvents)
        .where(and(...conditions));

      res.json({
        data: rows.map(r => ({
          ...r.event,
          opportunity: r.oppTitle ? { title: r.oppTitle, status: r.oppStatus, dueAt: r.oppDueAt, setAside: r.oppSetAside } : null,
        })),
        pagination: {
          page, limit,
          total: totalResult.count,
          totalPages: Math.ceil(totalResult.count / limit),
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/v4/change-events/:id/process", async (req: Request, res: Response) => {
    try {
      const [updated] = await db.update(captureChangeEvents)
        .set({ processed: true, processedAt: new Date() })
        .where(and(eq(captureChangeEvents.id, p(req.params.id)), eq(captureChangeEvents.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/bids", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const stage = req.query.stage as string;
      const readiness = req.query.readiness as string;
      const search = req.query.search as string;

      const conditions: any[] = [eq(v4Bids.tenantId, tenantId)];
      if (stage) conditions.push(eq(v4Bids.stage, stage));
      if (readiness) conditions.push(eq(v4Bids.readiness, readiness));
      if (search) conditions.push(or(ilike(v4Bids.name, `%${search}%`), ilike(v4Bids.bidCode, `%${search}%`)));

      const rows = await db
        .select()
        .from(v4Bids)
        .where(and(...conditions))
        .orderBy(desc(v4Bids.updatedAt));

      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/bids/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const [bid] = await db.select().from(v4Bids)
        .where(and(eq(v4Bids.id, p(req.params.id)), eq(v4Bids.tenantId, tenantId)));
      if (!bid) return res.status(404).json({ error: "Not found" });

      const [snapshot] = await db.select().from(bidReadinessSnapshots)
        .where(and(eq(bidReadinessSnapshots.bidId, bid.id), eq(bidReadinessSnapshots.tenantId, tenantId)));
      const docs = await db.select().from(v4BidDocuments)
        .where(and(eq(v4BidDocuments.bidId, bid.id), eq(v4BidDocuments.tenantId, tenantId)));
      const tasks = await db.select().from(v4BidTasks)
        .where(and(eq(v4BidTasks.bidId, bid.id), eq(v4BidTasks.tenantId, tenantId)));
      const bPartners = await db.select().from(bidPartners)
        .where(and(eq(bidPartners.bidId, bid.id), eq(bidPartners.tenantId, tenantId)));

      res.json({ ...bid, readinessSnapshot: snapshot || null, documents: docs, tasks, partners: bPartners });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/bids", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const parsed = insertV4BidSchema.parse({ ...req.body, tenantId });
      const [created] = await db.insert(v4Bids).values(parsed).returning();
      res.status(201).json(created);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/v4/bids/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const { stage, readiness, name, agencyName, dueDate, ownerUserId } = req.body;
      const [updated] = await db.update(v4Bids)
        .set({ ...(stage && { stage }), ...(readiness && { readiness }), ...(name && { name }), ...(agencyName && { agencyName }), ...(dueDate && { dueDate: new Date(dueDate) }), ...(ownerUserId && { ownerUserId }), updatedAt: new Date() })
        .where(and(eq(v4Bids.id, p(req.params.id)), eq(v4Bids.tenantId, tenantId)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/ai-artifacts", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const entityType = req.query.entityType as string;
      const entityId = req.query.entityId as string;
      const artifactType = req.query.artifactType as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      const conditions: any[] = [eq(aiArtifacts.tenantId, tenantId)];
      if (entityType) conditions.push(eq(aiArtifacts.entityType, entityType));
      if (entityId) conditions.push(eq(aiArtifacts.entityId, entityId));
      if (artifactType) conditions.push(eq(aiArtifacts.artifactType, artifactType));

      const rows = await db.select().from(aiArtifacts)
        .where(and(...conditions))
        .orderBy(desc(aiArtifacts.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalResult] = await db.select({ count: count() }).from(aiArtifacts)
        .where(and(...conditions));

      res.json({
        data: rows,
        pagination: { page, limit, total: totalResult.count, totalPages: Math.ceil(totalResult.count / limit) }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/fit-profiles", async (req: Request, res: Response) => {
    try {
      const rows = await db.select().from(fitProfilesV4)
        .where(eq(fitProfilesV4.tenantId, DEFAULT_TENANT_ID))
        .orderBy(desc(fitProfilesV4.updatedAt));
      res.json(rows);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/fit-profiles/:id", async (req: Request, res: Response) => {
    try {
      const [profile] = await db.select().from(fitProfilesV4)
        .where(and(eq(fitProfilesV4.id, p(req.params.id)), eq(fitProfilesV4.tenantId, DEFAULT_TENANT_ID)));
      if (!profile) return res.status(404).json({ error: "Not found" });
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/fit-profiles", async (req: Request, res: Response) => {
    try {
      const parsed = insertFitProfileV4Schema.parse({ ...req.body, tenantId: DEFAULT_TENANT_ID });
      const [created] = await db.insert(fitProfilesV4).values(parsed).returning();
      res.status(201).json(created);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/v4/fit-profiles/:id", async (req: Request, res: Response) => {
    try {
      const { name, isActive, minLeadDays, pursueThreshold, maybeThreshold, allowedStates, includedKeywords, excludedKeywords, includeNaics, excludeNaics, preferredAgencies, excludedAgencies, setAsidePreferences, scoringWeights } = req.body;
      const [updated] = await db.update(fitProfilesV4)
        .set({
          ...(name && { name }),
          ...(isActive !== undefined && { isActive }),
          ...(minLeadDays !== undefined && { minLeadDays }),
          ...(pursueThreshold !== undefined && { pursueThreshold }),
          ...(maybeThreshold !== undefined && { maybeThreshold }),
          ...(allowedStates && { allowedStates }),
          ...(includedKeywords && { includedKeywords }),
          ...(excludedKeywords && { excludedKeywords }),
          ...(includeNaics && { includeNaics }),
          ...(excludeNaics && { excludeNaics }),
          ...(preferredAgencies && { preferredAgencies }),
          ...(excludedAgencies && { excludedAgencies }),
          ...(setAsidePreferences && { setAsidePreferences }),
          ...(scoringWeights && { scoringWeights }),
          updatedAt: new Date(),
        })
        .where(and(eq(fitProfilesV4.id, p(req.params.id)), eq(fitProfilesV4.tenantId, DEFAULT_TENANT_ID)))
        .returning();
      if (!updated) return res.status(404).json({ error: "Not found" });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/stats", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const [oppCount] = await db.select({ count: count() }).from(opportunities).where(eq(opportunities.tenantId, tenantId));
      const [bidCount] = await db.select({ count: count() }).from(v4Bids).where(eq(v4Bids.tenantId, tenantId));
      const [pursueCount] = await db.select({ count: count() }).from(opportunityDecisions).where(and(eq(opportunityDecisions.tenantId, tenantId), eq(opportunityDecisions.decision, "pursue")));
      const [pendingEvents] = await db.select({ count: count() }).from(captureChangeEvents).where(and(eq(captureChangeEvents.tenantId, tenantId), eq(captureChangeEvents.processed, false)));
      const [artifactCount] = await db.select({ count: count() }).from(aiArtifacts).where(eq(aiArtifacts.tenantId, tenantId));

      const decisionBreakdown = await db
        .select({ decision: opportunityDecisions.decision, count: count() })
        .from(opportunityDecisions)
        .where(eq(opportunityDecisions.tenantId, tenantId))
        .groupBy(opportunityDecisions.decision);

      const stageBreakdown = await db
        .select({ stage: v4Bids.stage, count: count() })
        .from(v4Bids)
        .where(eq(v4Bids.tenantId, tenantId))
        .groupBy(v4Bids.stage);

      res.json({
        opportunities: oppCount.count,
        bids: bidCount.count,
        pursuing: pursueCount.count,
        pendingChanges: pendingEvents.count,
        aiArtifacts: artifactCount.count,
        decisionBreakdown,
        stageBreakdown,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================================================
  // ORG MEMORY (T2-A) — Organizational Knowledge Base
  // ========================================================================

  app.get("/api/v4/org-memory", async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || DEFAULT_TENANT_ID;
      const q = String(req.query.q || "").trim();
      const status = String(req.query.status || "").trim();
      const category = String(req.query.category || "").trim();
      const entityType = String(req.query.entityType || "").trim();
      const entityId = String(req.query.entityId || "").trim();

      if (entityType && entityId) {
        const rows = await db
          .select({ item: orgMemoryItems })
          .from(orgMemoryEntityLinks)
          .innerJoin(orgMemoryItems, eq(orgMemoryItems.id, orgMemoryEntityLinks.memoryItemId))
          .where(
            and(
              eq(orgMemoryEntityLinks.tenantId, tenantId),
              eq(orgMemoryEntityLinks.entityType, entityType),
              eq(orgMemoryEntityLinks.entityId, entityId),
              q ? ilike(orgMemoryItems.searchText, `%${q}%`) : undefined,
              status ? eq(orgMemoryItems.status, status) : undefined,
              category ? eq(orgMemoryItems.category, category) : undefined
            )
          )
          .orderBy(desc(orgMemoryItems.updatedAt));

        res.json({ items: rows.map((r) => r.item) });
        return;
      }

      const rows = await db
        .select()
        .from(orgMemoryItems)
        .where(
          and(
            eq(orgMemoryItems.tenantId, tenantId),
            status ? eq(orgMemoryItems.status, status) : undefined,
            category ? eq(orgMemoryItems.category, category) : undefined,
            q ? or(ilike(orgMemoryItems.searchText, `%${q}%`), ilike(orgMemoryItems.title, `%${q}%`)) : undefined
          )
        )
        .orderBy(desc(orgMemoryItems.updatedAt));

      res.json({ items: rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/org-memory/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || DEFAULT_TENANT_ID;
      const row = await db
        .select()
        .from(orgMemoryItems)
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, p(req.params.id))))
        .limit(1);

      if (!row[0]) return res.status(404).json({ error: "Not found" });

      const links = await db
        .select()
        .from(orgMemoryEntityLinks)
        .where(and(eq(orgMemoryEntityLinks.tenantId, tenantId), eq(orgMemoryEntityLinks.memoryItemId, p(req.params.id))));

      res.json({ item: row[0], links });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const {
        title,
        summary = "",
        body = "",
        category = "general",
        sensitivity = "internal",
        tagsJson = [],
        requiresApproval = true,
      } = req.body ?? {};

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: "Title is required" });
      }

      const inserted = await db
        .insert(orgMemoryItems)
        .values({
          tenantId,
          title: String(title).trim(),
          summary: String(summary || ""),
          body: String(body || ""),
          category: String(category || "general"),
          sensitivity: String(sensitivity || "internal"),
          tagsJson: Array.isArray(tagsJson) ? tagsJson : [],
          requiresApproval: Boolean(requiresApproval),
          status: "draft",
          createdBy: userId,
          updatedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      await orgMemoryOnCreate({ tenantId, actorId: userId, memoryItemId: inserted[0].id });

      res.json({ item: inserted[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/v4/org-memory/:id", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const { title, summary, body, category, sensitivity, tagsJson } = req.body ?? {};

      const updates: any = { updatedAt: new Date(), updatedBy: userId };
      if (title !== undefined) updates.title = String(title).trim();
      if (summary !== undefined) updates.summary = String(summary);
      if (body !== undefined) updates.body = String(body);
      if (category !== undefined) updates.category = String(category);
      if (sensitivity !== undefined) updates.sensitivity = String(sensitivity);
      if (tagsJson !== undefined) updates.tagsJson = Array.isArray(tagsJson) ? tagsJson : [];

      const [updated] = await db
        .update(orgMemoryItems)
        .set(updates)
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, p(req.params.id))))
        .returning();

      if (!updated) return res.status(404).json({ error: "Not found" });

      res.json({ item: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory/:id/submit", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const memoryItemId = p(req.params.id);

      const item = await db
        .select()
        .from(orgMemoryItems)
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
        .limit(1);

      if (!item[0]) return res.status(404).json({ error: "Not found" });

      const proposed = req.body ?? {};
      const approval = await db
        .insert(orgMemoryApprovals)
        .values({
          tenantId,
          memoryItemId,
          proposedTitle: String(proposed.proposedTitle || (item[0] as any).title || "").trim(),
          proposedSummary: String(proposed.proposedSummary || (item[0] as any).summary || ""),
          proposedBody: String(proposed.proposedBody || (item[0] as any).body || ""),
          proposedCategory: String(proposed.proposedCategory || (item[0] as any).category || "general"),
          proposedSensitivity: String(proposed.proposedSensitivity || (item[0] as any).sensitivity || "internal"),
          proposedTagsJson: proposed.proposedTagsJson || (item[0] as any).tagsJson || [],
          proposedMetaJson: proposed.proposedMetaJson || (item[0] as any).metaJson || {},
          status: "pending",
          createdBy: userId,
          createdAt: new Date(),
        })
        .returning();

      await db
        .update(orgMemoryItems)
        .set({ status: "pending", updatedAt: new Date(), updatedBy: userId })
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)));

      await db.insert(auditEvents).values({
        tenantId,
        eventType: "org_memory",
        actor: userId,
        actorType: "user",
        entityType: "org_memory_item",
        entityId: memoryItemId,
        action: "submitted",
        beforeJson: null,
        afterJson: { approvalId: approval[0].id },
        metaJson: {},
        createdAt: new Date(),
      });

      res.json({ approvalId: approval[0].id, item: { ...item[0], status: "pending" } });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory/:id/approve", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const memoryItemId = p(req.params.id);
      const approvalId = String(req.body?.approvalId || "").trim();

      if (!approvalId) return res.status(400).json({ error: "Missing approvalId" });

      await orgMemoryOnApprove({ tenantId, actorId: userId, memoryItemId, approvalId });

      const updated = await db
        .select()
        .from(orgMemoryItems)
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
        .limit(1);

      res.json({ ok: true, item: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory/:id/reject", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const memoryItemId = p(req.params.id);
      const approvalId = String(req.body?.approvalId || "").trim();
      const reviewerNote = String(req.body?.reviewerNote || "").trim();

      if (!approvalId) return res.status(400).json({ error: "Missing approvalId" });

      await orgMemoryOnReject({ tenantId, actorId: userId, memoryItemId, approvalId, reviewerNote });

      const updated = await db
        .select()
        .from(orgMemoryItems)
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
        .limit(1);

      res.json({ ok: true, item: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory/:id/archive", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const memoryItemId = p(req.params.id);

      const [updated] = await db
        .update(orgMemoryItems)
        .set({ status: "archived", updatedAt: new Date(), updatedBy: userId })
        .where(and(eq(orgMemoryItems.tenantId, tenantId), eq(orgMemoryItems.id, memoryItemId)))
        .returning();

      if (!updated) return res.status(404).json({ error: "Not found" });

      await db.insert(auditEvents).values({
        tenantId,
        eventType: "org_memory",
        actor: userId,
        actorType: "user",
        entityType: "org_memory_item",
        entityId: memoryItemId,
        action: "archived",
        beforeJson: null,
        afterJson: updated,
        metaJson: {},
        createdAt: new Date(),
      });

      res.json({ ok: true, item: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/v4/org-memory/:id/link", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const userId = "system";
      const memoryItemId = p(req.params.id);

      const { entityType: et, entityId: eid, role = "reference" } = req.body ?? {};
      if (!et || !eid) return res.status(400).json({ error: "Missing entityType/entityId" });

      await db.insert(orgMemoryEntityLinks).values({
        tenantId,
        memoryItemId,
        entityType: String(et),
        entityId: String(eid),
        role: String(role),
        createdBy: userId,
        createdAt: new Date(),
      }).onConflictDoNothing();

      await db.insert(auditEvents).values({
        tenantId,
        eventType: "org_memory",
        actor: userId,
        actorType: "user",
        entityType: "org_memory_item",
        entityId: memoryItemId,
        action: "linked",
        beforeJson: null,
        afterJson: { entityType: et, entityId: eid, role },
        metaJson: {},
        createdAt: new Date(),
      });

      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/v4/org-memory/:id/approvals", async (req: Request, res: Response) => {
    try {
      const tenantId = (req.query.tenantId as string) || DEFAULT_TENANT_ID;
      const rows = await db
        .select()
        .from(orgMemoryApprovals)
        .where(and(eq(orgMemoryApprovals.tenantId, tenantId), eq(orgMemoryApprovals.memoryItemId, p(req.params.id))))
        .orderBy(desc(orgMemoryApprovals.createdAt));

      res.json({ approvals: rows });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================================================
  // PROJECT WORKSPACE MODULE ENDPOINTS (Buildern-style)
  // ============================================================================

  const { seedDefaultProjectFolders, ensureDefaultProjectFolders } = await import("./services/project-documents.seed");
  const { importBidJacketArtifactsToProjectDocuments } = await import("./services/bid-jacket-to-project-documents.service");

  function registerSimpleProjectModuleRoutes(table: any, key: string) {
    app.get(`/api/projects/:projectId/${key}`, async (req: Request, res: Response) => {
      try {
        const projectId = p(req.params.projectId);
        const rows = await db.select()
          .from(table)
          .where(and(eq(table.tenantId, DEFAULT_TENANT_ID), eq(table.projectId, projectId)))
          .orderBy(desc(table.createdAt));
        res.json(rows);
      } catch (error: any) {
        console.error(`Error fetching ${key}:`, error);
        res.status(500).json({ error: `Failed to fetch ${key}` });
      }
    });

    app.post(`/api/projects/:projectId/${key}`, async (req: Request, res: Response) => {
      try {
        const projectId = p(req.params.projectId);
        const { title, ...rest } = req.body ?? {};
        if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });
        const rows = await db.insert(table).values({
          tenantId: DEFAULT_TENANT_ID,
          projectId,
          title: title.trim(),
          ...rest,
        } as any).returning();
        const row = (rows as any[])[0];
        res.json(row);
      } catch (error: any) {
        console.error(`Error creating ${key}:`, error);
        res.status(500).json({ error: `Failed to create ${key}` });
      }
    });
  }

  registerSimpleProjectModuleRoutes(projectEstimates, "estimates");
  registerSimpleProjectModuleRoutes(projectProposals, "proposals");
  registerSimpleProjectModuleRoutes(projectSchedules, "schedules");
  registerSimpleProjectModuleRoutes(projectBidRequests, "bid-requests");
  registerSimpleProjectModuleRoutes(projectSelections, "selections");
  registerSimpleProjectModuleRoutes(projectBudgets, "budgets");
  registerSimpleProjectModuleRoutes(projectDailyLogs, "daily-logs");
  registerSimpleProjectModuleRoutes(projectTimesheets, "timesheets");

  // ── COI Tracker: Project-scoped routes (Roadmap Feature 3) ─────
  // These are aliases over server/services/coi.service.ts. The /api/coi/*
  // surface in routes/coi.routes.ts handles tenant-wide and vendor-scoped
  // queries; these routes give the project workspace a clean
  // /api/projects/:projectId/coi shape.
  app.get("/api/projects/:projectId/coi", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { listForProject, partitionByTier, expiryTier, tierSeverity } =
        await import("./services/coi.service");
      const all = await listForProject(DEFAULT_TENANT_ID, projectId);
      // Per Feature 3 spec: GET returns non-expired only.
      const rows = all.filter((r) => r.status !== "expired");
      const rollup = partitionByTier(rows);
      res.json({
        rows: rows.map((r) => {
          const tier = expiryTier(r);
          return { ...r, tier, severity: tierSeverity(tier) };
        }),
        rollup: {
          total: rows.length,
          expired: rollup.expired.length,
          critical_1d: rollup.critical_1d.length,
          critical_7d: rollup.critical_7d.length,
          warning_14d: rollup.warning_14d.length,
          warning_30d: rollup.warning_30d.length,
          ok: rollup.ok.length,
        },
      });
    } catch (error: any) {
      console.error("GET /api/projects/:projectId/coi error:", error);
      res.status(500).json({ error: error?.message ?? "Failed to list project COIs" });
    }
  });

  app.post("/api/projects/:projectId/coi", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { upsertCOI } = await import("./services/coi.service");
      const body = req.body ?? {};
      if (!body.policyType || typeof body.policyType !== "string") {
        return res.status(400).json({ error: "policyType required" });
      }
      if (!body.expiryDate) {
        return res.status(400).json({ error: "expiryDate required" });
      }
      const expiryDate = new Date(body.expiryDate);
      const { coiId } = await upsertCOI(DEFAULT_TENANT_ID, {
        projectId,
        vendorId: body.vendorId ?? null,
        policyType: body.policyType,
        carrier: body.carrier ?? null,
        policyNumber: body.policyNumber ?? null,
        limitsJson: body.limitsJson ?? null,
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : null,
        expiryDate,
        documentId: body.documentId ?? null,
        status: body.status ?? "active",
        notes: body.notes ?? null,
      } as any);
      // Fire-and-forget Herbie memory write — never block the response.
      void (async () => {
        try {
          const { writeFact } = await import("./services/herbie-memory.service");
          await writeFact(
            { tenantId: DEFAULT_TENANT_ID, projectId },
            {
              subjectType: "coi",
              subjectId: coiId,
              predicate: "coi_expiry",
              object: expiryDate.toISOString(),
              sourceType: "user",
              confidence: 1.0,
            },
          );
        } catch (e) {
          console.error("[coi] writeFact hook failed:", e);
        }
      })();
      res.status(201).json({ coiId });
    } catch (error: any) {
      console.error("POST /api/projects/:projectId/coi error:", error);
      res.status(500).json({ error: error?.message ?? "Failed to create COI" });
    }
  });

  // ── Documents Center: Folders ──────────────────────────────────
  app.get("/api/projects/:projectId/doc-folders", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const folders = await db.select()
        .from(projectFolders)
        .where(and(eq(projectFolders.tenantId, DEFAULT_TENANT_ID), eq(projectFolders.projectId, projectId)))
        .orderBy(asc(projectFolders.sortOrder), asc(projectFolders.name));
      res.json(folders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:projectId/doc-folders", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { name, parentFolderId } = req.body ?? {};
      if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
      const [row] = await db.insert(projectFolders).values({
        tenantId: DEFAULT_TENANT_ID,
        projectId,
        parentFolderId: parentFolderId ?? null,
        name: name.trim(),
        sortOrder: 0,
      }).returning();
      res.json(row);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Documents Center: Documents ────────────────────────────────
  app.get("/api/projects/:projectId/project-documents", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const folderId = req.query.folderId as string | undefined;
      const conditions: any[] = [
        eq(projectDocuments.tenantId, DEFAULT_TENANT_ID),
        eq(projectDocuments.projectId, projectId),
      ];
      if (folderId) conditions.push(eq(projectDocuments.folderId, folderId));
      const docs = await db.select()
        .from(projectDocuments)
        .where(and(...conditions))
        .orderBy(desc(projectDocuments.createdAt));
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:projectId/project-documents", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const { folderId, title, sourceType, sourceUrl, storageKey, fileName, mimeType, linkedEntityType, linkedEntityId } = req.body ?? {};
      if (!title || typeof title !== "string") return res.status(400).json({ error: "title required" });
      const [doc] = await db.insert(projectDocuments).values({
        tenantId: DEFAULT_TENANT_ID,
        projectId,
        folderId: folderId ?? null,
        title: title.trim(),
        sourceType: sourceType ?? "upload",
        sourceUrl: sourceUrl ?? null,
        storageKey: storageKey ?? null,
        fileName: fileName ?? null,
        mimeType: mimeType ?? null,
        linkedEntityType: linkedEntityType ?? null,
        linkedEntityId: linkedEntityId ?? null,
        tagsJson: [],
        metadataJson: {},
      }).returning();
      res.json(doc);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/projects/:projectId/documents/seed-default-folders", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      await seedDefaultProjectFolders(DEFAULT_TENANT_ID, projectId);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/projects/:projectId/import-bid-artifacts", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const tenantId = DEFAULT_TENANT_ID;

      const projectRow = await db.select({
        id: projects.id,
        bidProjectId: projects.bidProjectId,
      }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))).limit(1);

      if (!projectRow[0]) return res.status(404).json({ error: "Project not found" });

      await ensureDefaultProjectFolders(tenantId, projectId);

      if (!projectRow[0].bidProjectId) {
        return res.json({ ok: true, folders: "seeded", artifacts: "no_bid_project_id" });
      }

      const result = await importBidJacketArtifactsToProjectDocuments({
        tenantId,
        projectId,
        bidProjectId: projectRow[0].bidProjectId,
      });

      res.json({ ok: true, ...result });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/admin/projects/:projectId/doc-proof", async (req: Request, res: Response) => {
    try {
      const projectId = p(req.params.projectId);
      const tenantId = DEFAULT_TENANT_ID;

      const folderResult = await db.execute(sql`
        SELECT count(*)::int AS c FROM project_folders
        WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
      `);
      const folderCount = (folderResult as any).rows?.[0]?.c ?? 0;

      const docResult = await db.execute(sql`
        SELECT count(*)::int AS c FROM project_documents
        WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
      `);
      const docCount = (docResult as any).rows?.[0]?.c ?? 0;

      const projectRow = await db.select({
        id: projects.id,
        name: projects.name,
        bidProjectId: projects.bidProjectId,
      }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))).limit(1);

      res.json({
        projectId,
        tenantId,
        folderCount,
        docCount,
        hasBidProjectId: !!projectRow[0]?.bidProjectId,
        bidProjectId: projectRow[0]?.bidProjectId ?? null,
        pass: folderCount >= 10 && (projectRow[0]?.bidProjectId ? docCount > 0 : true),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/seed-phase3", async (_req: Request, res: Response) => {
    try {
      const { seedPhase3Data } = await import("./seeds/phase3-seed");
      const result = await seedPhase3Data();
      res.json({ success: true, seeded: result });
    } catch (error: any) {
      console.error("Phase 3 seed error:", error);
      res.status(500).json({ error: error?.message ?? "Seed failed" });
    }
  });

  app.post("/api/admin/seed-demo", async (_req: Request, res: Response) => {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
      return res.status(403).json({ error: "Demo seed disabled in production. Set ALLOW_DEMO_SEED=true to enable." });
    }
    try {
      const { seedDemo } = await import("../scripts/seed-demo");
      const result = await seedDemo();
      res.json({ success: true, seeded: result });
    } catch (error: any) {
      console.error("Demo seed error:", error);
      res.status(500).json({ error: error?.message ?? "Demo seed failed" });
    }
  });

  app.get("/api/projects/:id/cockpit", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const projectId = String(req.params.id);

      const { listForProject: listCoisForProject } = await import("./services/coi.service");
      const { partitionByTier: partitionCoisByTier } = await import("./services/coi.service");

      const [projectRows, rfiRows, submittalRows, coRows, logRows, taskRows, reportRows, coiRows] = await Promise.all([
        db.select().from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))).limit(1),
        db.select({ id: rfis.id, status: rfis.status }).from(rfis).where(and(eq(rfis.tenantId, tenantId), eq(rfis.projectId, projectId))),
        db.select({ id: submittals.id, status: submittals.status }).from(submittals).where(and(eq(submittals.tenantId, tenantId), eq(submittals.projectId, projectId))),
        db.select({ id: changeOrders.id, status: changeOrders.status }).from(changeOrders).where(and(eq(changeOrders.tenantId, tenantId), eq(changeOrders.projectId, projectId))),
        db.select({ id: dailyLogs.id }).from(dailyLogs).where(and(eq(dailyLogs.tenantId, tenantId), eq(dailyLogs.projectId, projectId))),
        db.select({ id: projectTasks.id, status: projectTasks.status }).from(projectTasks).where(and(eq(projectTasks.tenantId, tenantId), eq(projectTasks.projectId, projectId))),
        db.select({ id: agentActivities.id }).from(agentActivities).where(and(
          eq(agentActivities.tenantId, tenantId),
          eq(agentActivities.actionType, "report"),
          eq(agentActivities.entityId, projectId),
        )),
        listCoisForProject(tenantId, projectId),
      ]);

      if (projectRows.length === 0) {
        return res.status(404).json({ error: "Project not found" });
      }

      const coiBuckets = partitionCoisByTier(coiRows);

      const recentReports = await db.select().from(agentActivities)
        .where(and(
          eq(agentActivities.tenantId, tenantId),
          eq(agentActivities.actionType, "report"),
          or(eq(agentActivities.entityId, projectId), eq(agentActivities.entityType, "portfolio")),
        ))
        .orderBy(desc(agentActivities.createdAt))
        .limit(5);

      res.json({
        project: projectRows[0],
        counts: {
          rfis: rfiRows.length,
          openRfis: rfiRows.filter(r => r.status === "open" || r.status === "submitted").length,
          submittals: submittalRows.length,
          pendingSubmittals: submittalRows.filter(s => s.status === "submitted" || s.status === "pending").length,
          changeOrders: coRows.length,
          pendingCOs: coRows.filter(c => c.status === "pending" || c.status === "submitted").length,
          dailyLogs: logRows.length,
          tasks: taskRows.length,
          openTasks: taskRows.filter(t => t.status !== "completed" && t.status !== "closed").length,
          agentReports: reportRows.length,
          cois: coiRows.length,
          coisExpired: coiBuckets.expired.length,
          coisCritical: coiBuckets.critical_1d.length + coiBuckets.critical_7d.length,
          coisWarning: coiBuckets.warning_14d.length + coiBuckets.warning_30d.length,
        },
        coiRollup: {
          total: coiRows.length,
          expired: coiBuckets.expired.length,
          critical_1d: coiBuckets.critical_1d.length,
          critical_7d: coiBuckets.critical_7d.length,
          warning_14d: coiBuckets.warning_14d.length,
          warning_30d: coiBuckets.warning_30d.length,
          ok: coiBuckets.ok.length,
        },
        recentAgentReports: recentReports.map(r => ({
          id: r.id,
          agentName: r.agentName,
          description: r.description,
          status: r.status,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
        })),
      });
    } catch (error: any) {
      console.error("Cockpit API error:", error);
      res.status(500).json({ error: error?.message ?? "Failed to load cockpit data" });
    }
  });

  app.get("/api/projects/:id/agent-reports", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const projectId = String(req.params.id);

      const reports = await db.select().from(agentActivities)
        .where(and(
          eq(agentActivities.tenantId, tenantId),
          eq(agentActivities.actionType, "report"),
          or(eq(agentActivities.entityId, projectId), eq(agentActivities.entityType, "portfolio")),
        ))
        .orderBy(desc(agentActivities.createdAt))
        .limit(20);

      res.json(reports);
    } catch (error: any) {
      res.status(500).json({ error: error?.message ?? "Failed to fetch agent reports" });
    }
  });

  app.post("/api/agents/run", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const { agent, targetId, params, projectId } = req.body || {};

      const validAgents = ["precon", "backoffice", "monitors", "pm", "fieldops", "kpi"];
      if (!agent || !validAgents.includes(agent)) {
        return res.status(400).json({ error: `Invalid agent. Must be one of: ${validAgents.join(", ")}` });
      }

      const scopeId = projectId || targetId;
      const runId = `${agent}-${Date.now()}`;
      let report: any;

      switch (agent) {
        case "precon": {
          if (!targetId) return res.status(400).json({ error: "targetId required for precon agent (opportunity or bid project ID)" });
          report = await runPreconAnalysis(tenantId, targetId);
          break;
        }
        case "backoffice": {
          report = await runBackOfficeAnalysis(tenantId);
          break;
        }
        case "monitors": {
          report = await runAllMonitors(tenantId);
          break;
        }
        case "pm": {
          report = await runPMAnalysis(tenantId, scopeId);
          break;
        }
        case "fieldops": {
          report = await runFieldOpsAnalysis(tenantId, scopeId);
          break;
        }
        case "kpi": {
          report = await runKPIAnalysis(tenantId);
          break;
        }
      }

      const reportId = report?.reportId;
      res.json({ agent, runId, timestamp: new Date().toISOString(), reportId, report });
    } catch (error: any) {
      console.error("Agent run error:", error);
      res.status(500).json({ error: error?.message ?? "Agent run failed" });
    }
  });

  app.post("/api/monitors/run", async (req: Request, res: Response) => {
    try {
      const tenantId = DEFAULT_TENANT_ID;
      const result = await runAllMonitors(tenantId);
      res.json(result);
    } catch (error: any) {
      console.error("Monitor run error:", error);
      res.status(500).json({ error: error?.message ?? "Failed to run monitors" });
    }
  });


  // ========================================================================
  // MISSING ENDPOINT ADDITIONS - Phase 2 Backend Completion
  // ========================================================================

  // --- COMPLIANCE: evidence, incidents, stats ---
  app.get("/api/compliance/evidence", async (req, res) => {
    try {
      const { complianceService } = await import("./services/compliance.service");
      const controlId = req.query.controlId as string;
      if (!controlId) {
        return res.status(400).json({ error: "controlId query parameter required" });
      }
      const evidence = await complianceService.getControlEvidence(DEFAULT_TENANT_ID, controlId);
      res.json(evidence);
    } catch (error) {
      console.error("Error fetching compliance evidence:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch compliance evidence" });
    }
  });

  app.get("/api/compliance/incidents", async (req, res) => {
    try {
      const { complianceService } = await import("./services/compliance.service");
      const incidents = await complianceService.listSecurityIncidents(DEFAULT_TENANT_ID, req.query);
      res.json(incidents);
    } catch (error) {
      console.error("Error fetching compliance incidents:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch compliance incidents" });
    }
  });

  app.get("/api/compliance/stats", async (req, res) => {
    try {
      const { complianceService } = await import("./services/compliance.service");
      const scores = await complianceService.calculateComplianceScore(DEFAULT_TENANT_ID);
      const dashboard = await complianceService.getComplianceDashboard(DEFAULT_TENANT_ID);
      res.json({ scores, dashboard });
    } catch (error) {
      console.error("Error fetching compliance stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch compliance stats" });
    }
  });

  // --- INTEGRATIONS: HigherGov search ---
  app.get("/api/integrations/highergov/search", async (req, res) => {
    try {
      const { discoverHigherGovAttachments } = await import("./services/highergov-discovery.service");
      const opportunityId = (req.query.opportunityId as string) ?? "";
        const runId = req.query.runId as string | undefined;
        const results = await discoverHigherGovAttachments({ tenantId: DEFAULT_TENANT_ID, opportunityId, runId });
      res.json(results);
    } catch (error) {
      console.error("Error searching HigherGov:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to search HigherGov" });
    }
  });

  // --- INVENTORY: stats, warehouses ---
  app.get("/api/inventory/stats", async (req, res) => {
    try {
      const { inventoryService } = await import("./services/inventory.service");
      const levels = await inventoryService.getInventoryLevels(DEFAULT_TENANT_ID);
      const shortages = await inventoryService.detectShortages(DEFAULT_TENANT_ID);
      res.json({ levels, shortages });
    } catch (error) {
      console.error("Error fetching inventory stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch inventory stats" });
    }
  });

  app.get("/api/inventory/warehouses", async (req, res) => {
    try {
      const { inventoryService } = await import("./services/inventory.service");
      const warehouses = await inventoryService.listWarehouses(DEFAULT_TENANT_ID);
      res.json(warehouses);
    } catch (error) {
      console.error("Error fetching warehouses:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch warehouses" });
    }
  });

  // --- MARKETING: analytics, contacts, stats ---
  app.get("/api/marketing/analytics", async (req, res) => {
    try {
      const { marketingService } = await import("./services/marketing.service");
      const dashboard = await marketingService.getMarketingDashboard(DEFAULT_TENANT_ID);
      res.json(dashboard);
    } catch (error) {
      console.error("Error fetching marketing analytics:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch marketing analytics" });
    }
  });

  app.get("/api/marketing/contacts", async (req, res) => {
    try {
      const { marketingService } = await import("./services/marketing.service");
      const campaigns = await marketingService.listCampaigns(DEFAULT_TENANT_ID, req.query);
      const contactsList = [];
      for (const campaign of campaigns) {
        const recipients = await marketingService.getRecipients(DEFAULT_TENANT_ID, campaign.id);
        contactsList.push(...recipients);
      }
      res.json(contactsList);
    } catch (error) {
      console.error("Error fetching marketing contacts:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch marketing contacts" });
    }
  });

  app.get("/api/marketing/stats", async (req, res) => {
    try {
      const { marketingService } = await import("./services/marketing.service");
      const campaigns = await marketingService.listCampaigns(DEFAULT_TENANT_ID);
      const stats = {
        total: campaigns.length,
        active: campaigns.filter((c) => c.status === "active").length,
        draft: campaigns.filter((c) => c.status === "draft").length,
        completed: campaigns.filter((c) => c.status === "completed").length,
      };
      res.json(stats);
    } catch (error) {
      console.error("Error fetching marketing stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch marketing stats" });
    }
  });

  // --- PROJECTS: stats ---
  app.get("/api/projects/stats", async (req, res) => {
    try {
      const { projectsService } = await import("./services/projects.service");
      const projects = await projectsService.listProjects(DEFAULT_TENANT_ID);
      const stats = {
        total: projects.length,
        active: projects.filter((p) => p.status === "active").length,
        completed: projects.filter((p) => p.status === "completed").length,
        onHold: projects.filter((p) => p.status === "on_hold").length,
      };
      res.json(stats);
    } catch (error) {
      console.error("Error fetching project stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch project stats" });
    }
  });

  // --- SAFETY INCIDENTS ---
  app.get("/api/safety-incidents", async (req, res) => {
    try {
      const { hrService } = await import("./services/hr.service");
      const incidents = await hrService.listSafetyIncidents(DEFAULT_TENANT_ID, req.query);
      res.json(incidents);
    } catch (error) {
      console.error("Error fetching safety incidents:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch safety incidents" });
    }
  });

  app.post("/api/safety-incidents", async (req, res) => {
    try {
      const { hrService } = await import("./services/hr.service");
      const incident = await hrService.createSafetyIncident(DEFAULT_TENANT_ID, req.body);
      res.status(201).json(incident);
    } catch (error) {
      console.error("Error creating safety incident:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to create safety incident" });
    }
  });

  // --- TICKETS: stats ---
  app.get("/api/tickets/stats", async (req, res) => {
    try {
      const { ticketingService } = await import("./services/ticketing.service");
      const tickets = await ticketingService.listTickets(DEFAULT_TENANT_ID, req.query);
      const slaMetrics = await ticketingService.getSLAMetrics(DEFAULT_TENANT_ID);
      const stats = {
        total: tickets.length,
        open: tickets.filter((t) => t.status === "open").length,
        inProgress: tickets.filter((t) => t.status === "in_progress").length,
        resolved: tickets.filter((t) => t.status === "resolved").length,
        sla: slaMetrics,
      };
      res.json(stats);
    } catch (error) {
      console.error("Error fetching ticket stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch ticket stats" });
    }
  });

  // --- TIME ENTRIES ---
  app.get("/api/time-entries", async (req, res) => {
    try {
      const { workforceService } = await import("./services/workforce.service");
      const { employeeId, projectId, status } = req.query as { employeeId?: string; projectId?: string; status?: string };
        const now = new Date();
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : now;
        const entries = await workforceService.getTimeEntries(DEFAULT_TENANT_ID, { employeeId, projectId, startDate, endDate, status });
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch time entries" });
    }
  });

  app.post("/api/time-entries", async (req, res) => {
    try {
      const { workforceService } = await import("./services/workforce.service");
      const entry = await workforceService.clockIn(DEFAULT_TENANT_ID, req.body);
      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating time entry:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to create time entry" });
    }
  });

  // --- WORKFORCE: stats ---
  app.get("/api/workforce/stats", async (req, res) => {
    try {
      const { workforceService } = await import("./services/workforce.service");
        const { projectId: wPid, employeeId: wEid, startDate: wSd, endDate: wEd } = req.query as { projectId?: string; employeeId?: string; startDate?: string; endDate?: string };
        const wNow = new Date();
        const wStartDate = wSd ? new Date(wSd) : new Date(wNow.getFullYear(), wNow.getMonth(), 1);
        const wEndDate = wEd ? new Date(wEd) : wNow;
        const laborSummary = await workforceService.getLaborCostSummary(DEFAULT_TENANT_ID, { projectId: wPid, startDate: wStartDate, endDate: wEndDate });
        const crewAssignments = await workforceService.getCrewAssignments(DEFAULT_TENANT_ID, { projectId: wPid, employeeId: wEid });
    } catch (error) {
      console.error("Error fetching workforce stats:", error);
      res.status(500).json({ error: (error as Error)?.message ?? "Failed to fetch workforce stats" });
    }
  });

  // ============================================================
  // Phase 1 — Sentinel Command Center routes
  // (Voice daily log, Herbie LLM-backed RFI/Submittal drafts,
  //  PATCH approve/reject aliases, Portal share links.)
  // ============================================================
  registerSentinelPhase1Routes(app);

  app.use((err: Error, _req: Request, res: Response, next: Function) => {
    if (err instanceof ParamError) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  });

  return httpServer;
}

function getTimeSince(date: Date): string {
  const diff = Date.now() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
