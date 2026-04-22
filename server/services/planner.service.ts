import { db } from "../db";
import { 
  dailyPlans, calendarEvents, bidProjects, opportunities, approvalRequests, auditEvents, users, opportunityScores
} from "@shared/schema";
import { eq, and, sql, desc, gte, lte, count, ne, inArray } from "drizzle-orm";
import { auditService } from "./audit.service";
import OpenAI from "openai";

const TERMINAL_STATUSES = ["awarded", "declined", "cancelled", "closed", "archived"];

function isUuid(v: string | null | undefined): boolean {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function buildEntityRoute(entityType: string, entityId: string): string | null {
  if (!isUuid(entityId)) return null;

  switch (entityType) {
    case "bid_project":
      return `/bid-jacket/${entityId}`;
    case "company":
      return `/companies/${entityId}`;
    case "contact":
      return `/contacts/${entityId}`;
    case "vendor":
      return `/vendors/${entityId}`;
    default:
      return null;
  }
}

function extractQuotedTitle(s: string): string | null {
  const m = s.match(/"([^"]{3,200})"/);
  if (!m) return null;
  const t = m[1].trim();
  return t.length >= 3 ? t : null;
}

function resolveDecisionTitle(a: any, ctx: any): string {
  if (ctx?.opportunityTitle && typeof ctx.opportunityTitle === "string") {
    const t = ctx.opportunityTitle.trim();
    if (t) return t;
  }
  if (ctx?.entityName && typeof ctx.entityName === "string") {
    const t = ctx.entityName.trim();
    if (t) return t;
  }
  if (ctx?.action && typeof ctx.action === "string") {
    const q = extractQuotedTitle(ctx.action);
    if (q) return q;
  }
  if (a?.title && typeof a.title === "string" && a.title.includes(":")) {
    const parts = a.title.split(":");
    if (parts[1] && parts[1].trim().length > 3) return parts[1].trim();
  }
  if (
    ctx?.reason &&
    typeof ctx.reason === "string" &&
    ctx.reason.length > 8 &&
    !ctx.reason.includes("_")
  ) {
    return ctx.reason.trim();
  }
  return "Review Required";
}

async function getOpportunityTitleForBidProjectId(tenantId: string, bidProjectId: string): Promise<string | null> {
  if (!bidProjectId) return null;
  const rows = await db
    .select({ opportunityTitle: opportunities.title })
    .from(bidProjects)
    .innerJoin(opportunities, eq(opportunities.id, bidProjects.opportunityId))
    .where(and(eq(bidProjects.tenantId, tenantId), eq(bidProjects.id, bidProjectId)))
    .limit(1);
  const t = rows?.[0]?.opportunityTitle;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

function resolveActionLabel(actionType: string): string {
  switch (actionType) {
    case "jacket_build": return "Bid Setup";
    case "bid_submission": return "Bid Submission";
    case "vendor_create": return "Vendor Approval";
    case "send_email": return "Email Authorization";
    case "bid_decision": return "Bid Decision";
    default: return "Action Required";
  }
}

const STAGE_WEIGHTS: Record<string, number> = {
  draft: 0.15,
  initiated: 0.25,
  prospect: 0.35,
  capture: 0.50,
  quoting: 0.60,
  proposal: 0.70,
  submitted: 0.80,
  evaluation: 0.85,
  negotiation: 0.90,
  in_progress: 0.65,
};

interface PlannerBrief {
  greeting: string;
  focus: string;
  bullets: string[];
  topRecommendation: {
    label: string;
    targetId?: string;
    confidence?: number;
  } | null;
  chips: {
    urgentDecisions: number;
    atRiskBids: number;
    pipelineValue: string;
  };
}

interface PlannerDecision {
  id: string;

  entityType: string;
  entityId: string;
  actionType: string;

  entityRoute: string | null;
  isNavigable: boolean;

  title: string;
  actionLabel: string;

  agencyName: string | null;
  dollarValue: number | null;
  deadline: string | null;
  naicsCodes: string[];
  setAside: string | null;
  solNumber: string | null;

  herbieReason: string | null;
  requiredRole: string | null;
  fitScore: number | null;

  requestedBy: string;
  requestedByType: "herbie" | "user";
  priority: string;
  status: string;

  context: Record<string, any>;

  reason: string;
  recommendation: string;
  confidence: number;
  urgencyScore: number;
  riskTags: string[];

  createdAt: string;
  expiresAt: string | null;
}

interface PlannerTimelineItem {
  id: string;
  bidId: string;
  title: string;
  status: string;
  dueAt: string | null;
  daysLeft: number | null;
  contractValue: string | null;
  setAside: string | null;
  naicsCodes: string[];
  winProbability: number;
  riskLevel: "low" | "medium" | "high";
  nextBestAction: string;
  slippageRisk: boolean;
}

interface PlannerRisk {
  id: string;
  title: string;
  riskType: string;
  probability: number;
  impact: string;
  riskScore: number;
  rootCause: string;
  mitigation: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
}

interface PlannerFeedItem {
  id: string;
  timestamp: string;
  message: string;
  category: string;
  eventType: string;
  entityType: string;
  entityId: string;
  undoable: boolean;
}

interface PlannerMetrics {
  pipelineValue: number;
  activeBids: number;
  urgentCount: number;
  atRiskCount: number;
  pendingApprovals: number;
  totalOpportunities: number;
  openOpportunities: number;
  bidsByStatus: Record<string, number>;
}

interface PlannerPayload {
  date: string;
  generatedAt: string;
  userName: string;
  brief: PlannerBrief;
  decisions: PlannerDecision[];
  timeline: PlannerTimelineItem[];
  risks: PlannerRisk[];
  herbieFeed: PlannerFeedItem[];
  metrics: PlannerMetrics;
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function computeWinProbability(stage: string, daysLeft: number | null, hasValue: boolean, setAside: string | null): number {
  const stageWeight = STAGE_WEIGHTS[stage] || 0.20;
  let deadlineUrgency = 0.5;
  if (daysLeft !== null) {
    if (daysLeft <= 0) deadlineUrgency = 0.1;
    else if (daysLeft <= 3) deadlineUrgency = 0.3;
    else if (daysLeft <= 7) deadlineUrgency = 0.5;
    else if (daysLeft <= 14) deadlineUrgency = 0.6;
    else if (daysLeft <= 30) deadlineUrgency = 0.7;
    else deadlineUrgency = 0.8;
  }
  const setAsideBonus = setAside && setAside !== "none" ? 0.15 : 0;
  const valueBonus = hasValue ? 0.05 : 0;
  const raw = (stageWeight * 0.5) + (deadlineUrgency * 0.3) + setAsideBonus + valueBonus;
  return Math.min(Math.round(raw * 100), 95);
}

function computeRiskLevel(daysLeft: number | null, stage: string): "low" | "medium" | "high" {
  if (daysLeft !== null && daysLeft <= 3) return "high";
  if (daysLeft !== null && daysLeft <= 7 && STAGE_WEIGHTS[stage] !== undefined && STAGE_WEIGHTS[stage] < 0.5) return "high";
  if (daysLeft !== null && daysLeft <= 14 && STAGE_WEIGHTS[stage] !== undefined && STAGE_WEIGHTS[stage] < 0.3) return "medium";
  if (daysLeft !== null && daysLeft <= 7) return "medium";
  return "low";
}

function getNextBestAction(stage: string, daysLeft: number | null): string {
  if (daysLeft !== null && daysLeft <= 1) return "Submit immediately — deadline imminent";
  if (daysLeft !== null && daysLeft <= 3) return "Finalize pricing and compliance review";
  
  switch (stage) {
    case "draft": return "Complete scope analysis and assign estimator";
    case "initiated": return "Schedule site visit and gather requirements";
    case "prospect": return "Conduct go/no-go review with project director";
    case "capture": return "Develop technical approach and identify subcontractors";
    case "quoting": return "Request subcontractor quotes and lock pricing";
    case "proposal": return "Draft technical narrative and compile bid package";
    case "submitted": return "Monitor for Q&A and prepare for evaluation";
    case "evaluation": return "Prepare best-and-final offer if requested";
    case "negotiation": return "Finalize contract terms and secure bonding";
    default: return "Review opportunity and assign team lead";
  }
}

function makeDecisionDedupeKey(d: {
  entityType: string;
  entityId: string;
  actionType: string;
}) {
  return `${d.entityType}:${d.entityId}:${d.actionType}`;
}

function chooseBetterDecision(a: PlannerDecision, b: PlannerDecision): PlannerDecision {
  const prioRank = (p: string) => (p === "urgent" ? 4 : p === "high" ? 3 : p === "medium" ? 2 : 1);
  const ap = prioRank(a.priority);
  const bp = prioRank(b.priority);
  if (ap !== bp) return ap > bp ? a : b;
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  return aTime >= bTime ? a : b;
}

function computeDecisionUrgency(priority: string, createdAt: Date, actionType: string): number {
  let score = 50;
  if (priority === "urgent") score += 40;
  else if (priority === "high") score += 25;
  else if (priority === "normal") score += 10;
  
  const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (ageHours > 72) score += 20;
  else if (ageHours > 24) score += 10;
  
  if (actionType === "bid") score += 15;
  else if (actionType === "send_email") score += 5;
  else if (actionType === "initiate_teaming") score += 10;
  else if (actionType === "bid_submission") score += 20;
  
  return Math.min(score, 100);
}

function generateDecisionRecommendation(contextJson: any, actionType: string, priority: string): { recommendation: string; confidence: number; riskTags: string[] } {
  const reason = contextJson?.reason || "";
  const riskTags: string[] = [];
  
  if (reason.toLowerCase().includes("bonding")) riskTags.push("bonding");
  if (reason.toLowerCase().includes("legal") || reason.toLowerCase().includes("compliance")) riskTags.push("legal");
  if (reason.toLowerCase().includes("scope")) riskTags.push("scope");
  if (reason.toLowerCase().includes("capacity") || reason.toLowerCase().includes("staffing")) riskTags.push("capacity");
  if (reason.toLowerCase().includes("pricing") || reason.toLowerCase().includes("margin")) riskTags.push("pricing");
  if (reason.toLowerCase().includes("teaming") || reason.toLowerCase().includes("partner")) riskTags.push("teaming");
  if (reason.toLowerCase().includes("ceo") || reason.toLowerCase().includes("requires")) riskTags.push("executive");
  
  let confidence = 70;
  if (reason.includes("strong") || reason.includes("high-fit") || reason.includes("High-fit")) confidence = 85;
  if (reason.includes("moderate")) confidence = 60;
  if (priority === "urgent") confidence = Math.max(confidence, 80);
  
  let recommendation = "Review and approve";
  if (actionType === "bid" || actionType === "bid_submission") {
    if (confidence >= 80) recommendation = "Approve — strong strategic fit";
    else if (confidence >= 60) recommendation = "Approve with conditions — review scope";
    else recommendation = "Review carefully — moderate confidence";
  } else if (actionType === "send_email") {
    recommendation = "Approve outreach — aligns with capture strategy";
    confidence = 75;
  } else if (actionType === "initiate_teaming") {
    recommendation = "Approve teaming — fills capability gap";
    confidence = 80;
  } else if (actionType === "vendor_create") {
    recommendation = "Review vendor data — below confidence threshold";
    confidence = 55;
  }
  
  return { recommendation, confidence, riskTags };
}

function formatFeedMessage(event: any): string {
  const type = event.eventType;
  const entity = event.entityType?.replace(/_/g, " ");
  const action = event.action;
  
  switch (type) {
    case "herbie_autonomous_cycle_complete":
      return `Completed autonomous analysis cycle — scanned pipeline for scoring and risk updates.`;
    case "executive_digest_generated":
      return `Generated executive digest with pipeline status and priority recommendations.`;
    case "bid_project_created":
      return `Created new bid project and initialized jacket folder structure.`;
    case "bid_submit_approval":
      return `Submitted bid for approval review — awaiting decision.`;
    case "command_palette_search":
      return `Processed search query and returned relevant results.`;
    case "herbie_command":
      return `Executed command and processed request.`;
    case "herbie_continuous_improvement":
      return `Ran continuous improvement cycle — updated scoring models.`;
    case "egnyte_reconciliation_run":
      return `Reconciled document storage with Egnyte cloud folders.`;
    default:
      return `${action || "Processed"} ${entity || "item"}.`;
  }
}

function detectRisks(
  timelineItems: PlannerTimelineItem[],
  pendingApprovals: number,
  activeBidsCount: number,
  recentActivityCount: number
): PlannerRisk[] {
  const risks: PlannerRisk[] = [];
  let riskId = 1;

  const urgentBids = timelineItems.filter(t => t.daysLeft !== null && t.daysLeft <= 3);
  if (urgentBids.length > 0) {
    for (const bid of urgentBids) {
      risks.push({
        id: `risk-deadline-${riskId++}`,
        title: bid.title,
        riskType: "Deadline",
        probability: bid.daysLeft !== null && bid.daysLeft <= 1 ? 0.95 : 0.75,
        impact: bid.contractValue ? `$${parseFloat(bid.contractValue).toLocaleString()}` : "Potential revenue loss",
        riskScore: bid.daysLeft !== null && bid.daysLeft <= 1 ? 95 : 75,
        rootCause: `Bid due in ${bid.daysLeft} day(s) — ${bid.status} stage may not complete in time.`,
        mitigation: "Prioritize completion, assign additional resources, and fast-track reviews.",
        relatedEntityId: bid.bidId,
        relatedEntityType: "bid_project",
      });
    }
  }

  if (pendingApprovals >= 5) {
    risks.push({
      id: `risk-backlog-${riskId++}`,
      title: "Approval Backlog",
      riskType: "Process",
      probability: 0.8,
      impact: `${pendingApprovals} items blocking pipeline progression`,
      riskScore: 70,
      rootCause: `${pendingApprovals} pending approvals creating bottleneck — decisions delayed.`,
      mitigation: "Batch-review approvals by priority. Delegate non-critical items to project directors.",
    });
  }

  if (activeBidsCount >= 15) {
    risks.push({
      id: `risk-capacity-${riskId++}`,
      title: "Team Capacity Strain",
      riskType: "Capacity",
      probability: 0.65,
      impact: "Quality risk across multiple active bids",
      riskScore: 60,
      rootCause: `${activeBidsCount} active bids may exceed team bandwidth for quality submissions.`,
      mitigation: "Review bid priorities, consider no-bid on lowest-probability opportunities.",
    });
  }

  const staleBids = timelineItems.filter(t => 
    t.status === "initiated" && t.daysLeft !== null && t.daysLeft > 14 && t.daysLeft < 30
  );
  if (staleBids.length >= 3) {
    risks.push({
      id: `risk-stale-${riskId++}`,
      title: "Stale Pipeline Items",
      riskType: "Process",
      probability: 0.5,
      impact: `${staleBids.length} bids stuck in 'initiated' without progress`,
      riskScore: 45,
      rootCause: "Multiple bids initiated but no stage progression — may lack owner assignment.",
      mitigation: "Assign project leads and set go/no-go review deadlines for each.",
    });
  }

  const noValueBids = timelineItems.filter(t => !t.contractValue);
  if (noValueBids.length >= 5) {
    risks.push({
      id: `risk-valuation-${riskId++}`,
      title: "Missing Contract Values",
      riskType: "Data Quality",
      probability: 0.6,
      impact: "Cannot assess pipeline value or prioritize by dollar impact",
      riskScore: 50,
      rootCause: `${noValueBids.length} bids have no contract value — limits revenue forecasting.`,
      mitigation: "Request estimators to provide preliminary values for all active bids.",
    });
  }

  return risks.sort((a, b) => b.riskScore - a.riskScore);
}

class PlannerService {
  async getCurrentUser(tenantId: string): Promise<{ firstName: string; displayName: string }> {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .limit(1);
    
    if (user) {
      const firstName = user.displayName.split(" ")[0] || user.displayName;
      return { firstName, displayName: user.displayName };
    }

    try {
      const [seeded] = await db.insert(users)
        .values({
          id: `usr-default-${tenantId}`,
          tenantId,
          email: "bradley@blackhawkconst.com",
          displayName: "Bradley Hueser",
          status: "active",
        })
        .onConflictDoNothing()
        .returning();
      if (seeded) {
        return { firstName: "Bradley", displayName: "Bradley Hueser" };
      }
    } catch {
    }
    return { firstName: "Commander", displayName: "Commander" };
  }

  async getPlannerPayload(tenantId: string, date: Date, userName?: string): Promise<PlannerPayload> {
    const dateStr = date.toISOString().split("T")[0];
    const now = new Date();
    const futureDate14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const userInfo = userName 
      ? { firstName: userName.split(" ")[0], displayName: userName }
      : await this.getCurrentUser(tenantId);

    const [
      pendingApprovalsRaw,
      allBidsWithOpps,
      allOpps,
      recentAuditEvents,
      todaysCalEvents,
    ] = await Promise.all([
      db.select()
        .from(approvalRequests)
        .where(and(
          eq(approvalRequests.tenantId, tenantId),
          eq(approvalRequests.status, "pending")
        ))
        .orderBy(desc(approvalRequests.createdAt)),

      db.select({ bid: bidProjects, opp: opportunities })
        .from(bidProjects)
        .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
        .where(eq(bidProjects.tenantId, tenantId))
        .orderBy(opportunities.dueAt),

      db.select()
        .from(opportunities)
        .where(eq(opportunities.tenantId, tenantId)),

      db.select()
        .from(auditEvents)
        .where(and(
          eq(auditEvents.tenantId, tenantId),
          gte(auditEvents.createdAt, new Date(Date.now() - 72 * 60 * 60 * 1000)),
          sql`${auditEvents.eventType} != 'herbie_autonomous_cycle_complete'`
        ))
        .orderBy(desc(auditEvents.createdAt))
        .limit(15),

      db.select()
        .from(calendarEvents)
        .where(and(
          eq(calendarEvents.tenantId, tenantId),
          gte(calendarEvents.startAt, new Date(date.setHours(0,0,0,0))),
          lte(calendarEvents.startAt, new Date(date.setHours(23,59,59,999)))
        )),
    ]);

    const herbieEvents = await db.select()
      .from(auditEvents)
      .where(and(
        eq(auditEvents.tenantId, tenantId),
        gte(auditEvents.createdAt, new Date(Date.now() - 72 * 60 * 60 * 1000)),
        sql`${auditEvents.eventType} = 'herbie_autonomous_cycle_complete'`
      ))
      .orderBy(desc(auditEvents.createdAt))
      .limit(3);

    const activeBids = allBidsWithOpps.filter(b => !TERMINAL_STATUSES.includes(b.bid.status));
    const bidsByStatus: Record<string, number> = {};
    activeBids.forEach(b => { bidsByStatus[b.bid.status] = (bidsByStatus[b.bid.status] || 0) + 1; });
    
    const openOpps = allOpps.filter(o => o.status === "active" || o.status === "open");

    let pipelineValue = 0;
    activeBids.forEach(b => {
      if (b.opp.contractValue) pipelineValue += parseFloat(b.opp.contractValue);
    });

    const timeline: PlannerTimelineItem[] = activeBids.map(b => {
      const daysLeft = b.opp.dueAt 
        ? Math.ceil((new Date(b.opp.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const winProb = computeWinProbability(
        b.bid.status, 
        daysLeft, 
        !!b.opp.contractValue, 
        b.opp.setAside
      );
      const riskLevel = computeRiskLevel(daysLeft, b.bid.status);
      const nextAction = getNextBestAction(b.bid.status, daysLeft);
      
      return {
        id: b.opp.id,
        bidId: b.bid.id,
        title: b.opp.title,
        status: b.bid.status,
        dueAt: b.opp.dueAt ? b.opp.dueAt.toISOString() : null,
        daysLeft,
        contractValue: b.opp.contractValue,
        setAside: b.opp.setAside,
        naicsCodes: (b.opp.naicsCodes || []) as string[],
        winProbability: winProb,
        riskLevel,
        nextBestAction: nextAction,
        slippageRisk: riskLevel === "high" || (daysLeft !== null && daysLeft <= 5 && (STAGE_WEIGHTS[b.bid.status] || 0) < 0.5),
      };
    }).sort((a, b) => {
      if (a.daysLeft === null && b.daysLeft === null) return 0;
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

    const decisionsUnsorted: PlannerDecision[] = await Promise.all(
      pendingApprovalsRaw.map(async (a: any) => {
        const ctx = (a.contextJson as any) || {};

        const bidProjectId =
          typeof ctx?.bidProjectId === "string" ? ctx.bidProjectId :
          typeof a?.entityId === "string" && a.actionType === "bid_submission" ? a.entityId :
          null;

        if (!ctx.opportunityTitle && bidProjectId) {
          const t = await getOpportunityTitleForBidProjectId(a.tenantId || tenantId, bidProjectId);
          if (t) ctx.opportunityTitle = t;
        }

        const { recommendation, confidence, riskTags } = generateDecisionRecommendation(ctx, a.actionType, a.priority);
        const urgencyScore = computeDecisionUrgency(a.priority, a.createdAt, a.actionType);

        const decisionTitle = resolveDecisionTitle(a, ctx);
        const actionLabel = resolveActionLabel(a.actionType);

        if (a.actionType === "bid_submission" && decisionTitle === "Review Required") {
          console.warn(
            `[planner] title_resolution_failed actionType=bid_submission approvalId=${a.id} tenant=${a.tenantId} bidProjectId=${ctx?.bidProjectId ?? "none"} action=${typeof ctx?.action === "string" ? ctx.action : "none"}`
          );
        }

        const entityRoute = buildEntityRoute(a.entityType, a.entityId);
        const isNavigable = !!entityRoute;

        return {
          id: a.id,
          entityType: a.entityType,
          entityId: a.entityId,
          actionType: a.actionType,

          title: decisionTitle,
          actionLabel: actionLabel,

          entityRoute,
          isNavigable,

          agencyName: ctx?.agencyName ?? null,
          dollarValue: ctx?.estimatedValue ?? null,
          deadline: ctx?.deadline ?? null,
          naicsCodes: ctx?.naicsCodes ?? [],
          setAside: ctx?.setAside ?? null,
          solNumber: ctx?.solicitationNumber ?? null,

          herbieReason: ctx?.reason ?? null,
          requiredRole: ctx?.requiredRole ?? null,
          fitScore: ctx?.score ?? null,

          requestedBy: a.requestedBy,
          requestedByType: a.requestedFrom ? "user" : "herbie",

          priority: a.priority,
          status: a.status,
          context: ctx,

          reason: ctx?.reason || "",
          recommendation,
          confidence,
          urgencyScore,
          riskTags,
          createdAt: a.createdAt.toISOString(),
          expiresAt: a.expiresAt ? a.expiresAt.toISOString() : null,
        };
      })
    );
    const sortedDecisions = decisionsUnsorted.sort((a, b) => b.urgencyScore - a.urgencyScore);

    const dedupedMap = new Map<string, PlannerDecision>();
    for (const d of sortedDecisions) {
      const key = makeDecisionDedupeKey(d);
      const existing = dedupedMap.get(key);
      dedupedMap.set(key, existing ? chooseBetterDecision(existing, d) : d);
    }
    const decisions = Array.from(dedupedMap.values())
      .sort((a, b) => b.urgencyScore - a.urgencyScore);

    const risks = detectRisks(timeline, pendingApprovalsRaw.length, activeBids.length, recentAuditEvents.length);

    const allFeedEvents = [...recentAuditEvents, ...herbieEvents]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, 12);

    const herbieFeed: PlannerFeedItem[] = allFeedEvents.map(e => ({
      id: e.id,
      timestamp: e.createdAt!.toISOString(),
      message: formatFeedMessage(e),
      category: e.eventType.includes("herbie") ? "HERBIE" : 
                e.eventType.includes("bid") ? "Bids" :
                e.eventType.includes("egnyte") ? "Documents" :
                e.eventType.includes("digest") ? "Reports" : "System",
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      undoable: e.eventType === "bid_project_created" || e.eventType === "herbie_command",
    }));

    const metrics: PlannerMetrics = {
      pipelineValue,
      activeBids: activeBids.length,
      urgentCount: decisions.filter(d => d.priority === "urgent" || d.priority === "high").length,
      atRiskCount: timeline.filter(t => t.riskLevel === "high").length,
      pendingApprovals: pendingApprovalsRaw.length,
      totalOpportunities: allOpps.length,
      openOpportunities: openOpps.length,
      bidsByStatus,
    };

    const urgentBidsNear = timeline.filter(t => t.daysLeft !== null && t.daysLeft <= 7);
    const highPriorityDecision = decisions[0];

    let brief: PlannerBrief;
    try {
      brief = await this.generateAIBrief(
        userInfo.firstName, dateStr, decisions, timeline, risks, metrics, 
        todaysCalEvents.length, urgentBidsNear, highPriorityDecision
      );
    } catch (err) {
      console.error("AI brief generation failed, using heuristic fallback:", err);
      brief = this.generateHeuristicBrief(
        userInfo.firstName, dateStr, decisions, timeline, risks, metrics,
        todaysCalEvents.length, urgentBidsNear, highPriorityDecision
      );
    }

    return {
      date: dateStr,
      generatedAt: new Date().toISOString(),
      userName: userInfo.firstName,
      brief,
      decisions,
      timeline,
      risks,
      herbieFeed,
      metrics,
    };
  }

  private async generateAIBrief(
    firstName: string,
    dateStr: string,
    decisions: PlannerDecision[],
    timeline: PlannerTimelineItem[],
    risks: PlannerRisk[],
    metrics: PlannerMetrics,
    meetingsCount: number,
    urgentBids: PlannerTimelineItem[],
    topDecision: PlannerDecision | undefined,
  ): Promise<PlannerBrief> {
    const openai = new OpenAI({ 
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const timeGreeting = getTimeOfDayGreeting();
    const dateFormatted = new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const dataContext = {
      date: dateFormatted,
      greeting: `${timeGreeting}, ${firstName}`,
      activeBids: metrics.activeBids,
      bidsByStatus: metrics.bidsByStatus,
      pendingApprovals: metrics.pendingApprovals,
      urgentDecisions: metrics.urgentCount,
      atRiskBids: metrics.atRiskCount,
      pipelineValue: metrics.pipelineValue,
      totalOpportunities: metrics.totalOpportunities,
      meetingsToday: meetingsCount,
      urgentBidsNext7Days: urgentBids.map(b => ({ title: b.title, daysLeft: b.daysLeft, status: b.status, value: b.contractValue })),
      topRisks: risks.slice(0, 3).map(r => ({ title: r.title, type: r.riskType, score: r.riskScore })),
      topDecision: topDecision ? { title: topDecision.title, priority: topDecision.priority, reason: topDecision.reason } : null,
    };

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are HERBIE, the AI operations assistant for BlackHawk Construction's SENTINEL platform. Generate a personalized daily command brief. You MUST respond with valid JSON only, no markdown.

Return this exact JSON structure:
{
  "focus": "One sentence: the single most important thing to focus on today.",
  "bullets": ["Change/update 1 since yesterday", "Change/update 2", "Change/update 3"],
  "topRecommendation": "One specific actionable recommendation with project name and why."
}

Rules:
- Reference real project names and dollar amounts from the data
- Be specific and actionable, not generic
- Focus statement should prioritize by deadline urgency and dollar value
- Bullets should describe concrete pipeline changes or status updates
- Recommendation should be the highest-ROI action available right now
- Keep each bullet under 100 characters
- Professional, direct tone for a construction company president`
        },
        {
          role: "user",
          content: `Generate today's command brief based on this live pipeline data:\n\n${JSON.stringify(dataContext, null, 2)}`
        }
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || "";
    let parsed: any;
    try {
      const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error("Failed to parse AI response as JSON");
    }

    return {
      greeting: `${timeGreeting}, ${firstName}`,
      focus: parsed.focus || "Review your pipeline and address urgent decisions.",
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 3) : [],
      topRecommendation: parsed.topRecommendation ? {
        label: parsed.topRecommendation,
        targetId: topDecision?.id,
        confidence: topDecision?.confidence,
      } : null,
      chips: {
        urgentDecisions: metrics.urgentCount,
        atRiskBids: metrics.atRiskCount,
        pipelineValue: metrics.pipelineValue > 0 
          ? `$${(metrics.pipelineValue / 1000000).toFixed(1)}M` 
          : "Not estimated",
      },
    };
  }

  private generateHeuristicBrief(
    firstName: string,
    dateStr: string,
    decisions: PlannerDecision[],
    timeline: PlannerTimelineItem[],
    risks: PlannerRisk[],
    metrics: PlannerMetrics,
    meetingsCount: number,
    urgentBids: PlannerTimelineItem[],
    topDecision: PlannerDecision | undefined,
  ): PlannerBrief {
    const timeGreeting = getTimeOfDayGreeting();
    
    const bullets: string[] = [];
    if (urgentBids.length > 0) {
      bullets.push(`${urgentBids.length} bid(s) due within 7 days — ${urgentBids[0].title} is closest.`);
    }
    if (metrics.pendingApprovals > 0) {
      bullets.push(`${metrics.pendingApprovals} pending approvals awaiting your review.`);
    }
    if (risks.length > 0) {
      bullets.push(`${risks.length} risk(s) detected — ${risks[0].title} is highest priority.`);
    }
    if (bullets.length === 0) {
      bullets.push("Pipeline is steady — no critical changes overnight.");
    }

    let focus = "Review your pipeline and address pending decisions.";
    if (urgentBids.length > 0 && topDecision) {
      focus = `Prioritize the ${urgentBids[0].title} deadline and resolve ${topDecision.title.substring(0, 50)}.`;
    } else if (urgentBids.length > 0) {
      focus = `${urgentBids[0].title} is due in ${urgentBids[0].daysLeft} day(s) — ensure submission readiness.`;
    } else if (topDecision) {
      focus = `Resolve the top-priority decision: ${topDecision.title.substring(0, 80)}.`;
    }

    let topRec: PlannerBrief["topRecommendation"] = null;
    if (topDecision) {
      topRec = {
        label: `${topDecision.recommendation} — ${topDecision.title.substring(0, 80)}`,
        targetId: topDecision.id,
        confidence: topDecision.confidence,
      };
    }

    return {
      greeting: `${timeGreeting}, ${firstName}`,
      focus,
      bullets,
      topRecommendation: topRec,
      chips: {
        urgentDecisions: metrics.urgentCount,
        atRiskBids: metrics.atRiskCount,
        pipelineValue: metrics.pipelineValue > 0 
          ? `$${(metrics.pipelineValue / 1000000).toFixed(1)}M` 
          : "Not estimated",
      },
    };
  }

  async getDailyPlan(tenantId: string, userId: string, planDate: Date) {
    const startOfDay = new Date(planDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(planDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [plan] = await db.select()
      .from(dailyPlans)
      .where(and(
        eq(dailyPlans.tenantId, tenantId),
        eq(dailyPlans.userId, userId),
        gte(dailyPlans.planDate, startOfDay),
        lte(dailyPlans.planDate, endOfDay)
      ));
    return plan;
  }

  async createDailyPlan(tenantId: string, data: {
    userId: string;
    planDate: Date;
    tasksJson?: unknown;
    prioritiesJson?: unknown;
    meetingsJson?: unknown;
    goalsJson?: unknown;
    notesJson?: unknown;
  }) {
    const [plan] = await db.insert(dailyPlans)
      .values({
        tenantId,
        ...data,
        status: "pending",
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "daily_plan.created",
      actor: data.userId,
      entityType: "daily_plan",
      entityId: plan.id,
      afterJson: plan as Record<string, unknown>,
    });

    return plan;
  }

  async updateDailyPlan(tenantId: string, planId: string, data: Partial<{
    tasksJson: unknown;
    prioritiesJson: unknown;
    meetingsJson: unknown;
    goalsJson: unknown;
    notesJson: unknown;
    status: string;
    completionPercentage: number;
  }>, actorId?: string) {
    const [plan] = await db.update(dailyPlans)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(dailyPlans.tenantId, tenantId), eq(dailyPlans.id, planId)))
      .returning();

    return plan;
  }

  async listCalendarEvents(tenantId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
  }) {
    let conditions = [eq(calendarEvents.tenantId, tenantId)];
    
    if (filters?.startDate) {
      conditions.push(gte(calendarEvents.startAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(calendarEvents.endAt, filters.endDate));
    }
    if (filters?.eventType) {
      conditions.push(eq(calendarEvents.eventType, filters.eventType));
    }

    return db.select({
      id: calendarEvents.id,
      tenantId: calendarEvents.tenantId,
      entityType: calendarEvents.entityType,
      entityId: calendarEvents.entityId,
      title: calendarEvents.title,
      description: calendarEvents.description,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      allDay: calendarEvents.allDay,
      location: calendarEvents.location,
      attendeesJson: calendarEvents.attendeesJson,
      externalEventId: calendarEvents.externalEventId,
      status: calendarEvents.status,
      createdAt: calendarEvents.createdAt,
    })
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt);
  }

  async createCalendarEvent(tenantId: string, data: {
    title: string;
    description?: string;
    eventType: string;
    startAt: Date;
    endAt?: Date;
    allDay?: boolean;
    location?: string;
    attendeesJson?: unknown;
    entityType?: string;
    entityId?: string;
  }, actorId?: string) {
    const [event] = await db.insert(calendarEvents)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "calendar_event.created",
      actor: actorId || "system",
      entityType: "calendar_event",
      entityId: event.id,
      afterJson: event as Record<string, unknown>,
    });

    return event;
  }

  async getCalendarEvents(tenantId: string, filters?: { startDate?: Date; endDate?: Date }) {
    return this.listCalendarEvents(tenantId, filters);
  }

  async updateCalendarEvent(tenantId: string, eventId: string, data: Partial<{
    title: string;
    description: string;
    startAt: Date;
    endAt: Date;
    location: string;
    attendeesJson: unknown;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, eventId)));

    const [event] = await db.update(calendarEvents)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, eventId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "calendar_event.updated",
      actor: actorId || "system",
      entityType: "calendar_event",
      entityId: eventId,
      beforeJson: before as Record<string, unknown>,
      afterJson: event as Record<string, unknown>,
    });

    return event;
  }

  async deleteCalendarEvent(tenantId: string, eventId: string, actorId?: string) {
    const [event] = await db.delete(calendarEvents)
      .where(and(eq(calendarEvents.tenantId, tenantId), eq(calendarEvents.id, eventId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "calendar_event.deleted",
      actor: actorId || "system",
      entityType: "calendar_event",
      entityId: eventId,
      beforeJson: event as Record<string, unknown>,
    });

    return event;
  }

  async generateDailyBriefing(tenantId: string, userId: string, briefingDate: Date) {
    return this.getPlannerPayload(tenantId, briefingDate);
  }

  async getUpcomingDeadlines(tenantId: string, daysAhead: number = 7, fromDate?: Date) {
    const now = fromDate || new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const opps = await db.select()
      .from(opportunities)
      .where(and(
        eq(opportunities.tenantId, tenantId),
        sql`${opportunities.dueAt} IS NOT NULL`,
        gte(opportunities.dueAt, now),
        lte(opportunities.dueAt, futureDate)
      ))
      .orderBy(opportunities.dueAt);

    const filteredOpps = opps.filter(o => !TERMINAL_STATUSES.includes(o.status));

    const bids = await db.select({
      bid: bidProjects,
      opp: opportunities,
    })
      .from(bidProjects)
      .innerJoin(opportunities, eq(bidProjects.opportunityId, opportunities.id))
      .where(and(
        eq(bidProjects.tenantId, tenantId),
        sql`${opportunities.dueAt} IS NOT NULL`,
        gte(opportunities.dueAt, now),
        lte(opportunities.dueAt, futureDate)
      ))
      .orderBy(opportunities.dueAt);

    const filteredBids = bids.filter(b => !TERMINAL_STATUSES.includes(b.bid.status));

    return {
      opportunities: filteredOpps.map(o => ({
        type: "opportunity",
        id: o.id,
        title: o.title,
        deadline: o.dueAt,
        status: o.status,
      })),
      bids: filteredBids.map(b => ({
        type: "bid",
        id: b.bid.id,
        title: b.opp.title,
        deadline: b.opp.dueAt,
        status: b.bid.status,
      })),
    };
  }

  async getPlannerDashboard(tenantId: string, userId?: string) {
    return this.getPlannerPayload(tenantId, new Date());
  }
}

export const plannerService = new PlannerService();
