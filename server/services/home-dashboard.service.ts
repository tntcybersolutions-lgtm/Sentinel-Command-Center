import type {
  HomeItem,
  HomePriority,
  HomeExecutiveKpis,
  HomeIntelligence,
  HomeDashboardResponse,
  HomeBucketKey,
} from "../../shared/schema";
import { computeScore, priorityFromScore } from "./home-priority.service";

type CommandApproval = {
  id: string; entityType: string; entityId: string; actionType: string;
  priority: string; entityName: string; dollarValue: number | null;
  deadline: string | null; naicsCodes: string[]; setAside: string | null;
  agency: string | null; requestedBy: string; createdAt: string; ageDays: number;
};

type CommandOpportunity = {
  id: string; title: string; agency: string | null; value: number | null;
  naics: string[]; setAside: string | null; dueAt: string | null;
  status: string; url: string | null; synopsis: string | null;
  fitScore: number | null; decision: string | null; hasBidProject: boolean;
};

type CommandTask = {
  id: string; title: string; description: string | null; priority: string;
  status: string; dueAt: string | null; source: string;
  sourceEntityType: string | null; sourceEntityId: string | null;
  actionType: string | null; actionPayload: any; completedAt: string | null;
};

type CommandKpis = {
  pendingApprovals: number; missingArtifacts: number; checklistTodo: number;
  upcomingDeadlines: number; overdueItems: number;
};

type CommandJacket = {
  bidProjectId: string; total: number; missing: number; ready: number;
  filed: number; failed: number; oppTitle: string; oppDueAt: string | null;
  opportunityId: string; bidStatus: string;
};

export type DashboardCommandData = {
  approvals: CommandApproval[];
  opportunities: CommandOpportunity[];
  tasks: CommandTask[];
  kpis: CommandKpis;
  jackets: CommandJacket[];
};

export type CalendarTodayData = {
  today: Array<{ id: string; time: string | null; allDay: boolean; title: string; subtitle: string; type: string; route: string; priority?: string }>;
  missed: Array<{ id: string; time: string | null; allDay: boolean; title: string; subtitle: string; type: string; route: string; priority?: string }>;
  connections: { microsoft: boolean; google: boolean };
};

function formatMoney(n: number): string {
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function routeFor(entityType: string | null, entityId: string | null): string {
  if (!entityType || !entityId) return "/dashboard";
  const t = (entityType || "").toLowerCase();
  if (t.includes("opportunity")) return `/capture/opportunity/${entityId}`;
  if (t.includes("bid_project") || t.includes("bidproject") || t.includes("bid_decision")) return `/projects/${entityId}/documents`;
  if (t.includes("project")) return `/projects/${entityId}`;
  if (t.includes("vendor")) return `/entity/vendor/${entityId}`;
  return `/projects/${entityId}`;
}

function mapApprovals(approvals: CommandApproval[], now: Date): HomeItem[] {
  return approvals.map((a) => {
    const route = routeFor(a.entityType, a.entityId);
    const dueDate = a.deadline ? new Date(a.deadline) : null;
    const isOverdue = dueDate ? dueDate.getTime() < now.getTime() : false;
    const { score, reasons } = computeScore({
      dueAt: dueDate,
      ageDays: a.ageDays,
      dollarValue: a.dollarValue,
      isOverdueApproval: isOverdue,
    });
    const priority = priorityFromScore(score);
    return {
      id: a.id,
      sourceType: "approval" as const,
      title: a.entityName,
      subtitle: `${a.actionType || "approval"} · Requested by ${a.requestedBy}${a.agency ? ` · ${a.agency}` : ""}`,
      route,
      dueAt: a.deadline,
      ageDays: a.ageDays,
      dollarValue: a.dollarValue,
      agency: a.agency,
      setAside: a.setAside,
      priorityScore: score,
      priority,
      reasons,
      primaryAction: { label: "Review", type: "review_approval" as const, route },
    };
  });
}

function mapOpportunities(opps: CommandOpportunity[], now: Date): HomeItem[] {
  return opps.map((o) => {
    const route = `/capture/opportunity/${o.id}`;
    const dueDate = o.dueAt ? new Date(o.dueAt) : null;
    const { score, reasons } = computeScore({
      dueAt: dueDate,
      dollarValue: o.value,
      hasNoBidProject: !o.hasBidProject,
    });
    const priority = priorityFromScore(score);
    return {
      id: o.id,
      sourceType: "opportunity" as const,
      title: o.title,
      subtitle: `${o.status}${o.agency ? ` · ${o.agency}` : ""}${o.setAside ? ` · ${o.setAside}` : ""}`,
      route,
      dueAt: o.dueAt,
      dollarValue: o.value,
      agency: o.agency,
      setAside: o.setAside,
      priorityScore: score,
      priority,
      reasons,
      primaryAction: o.hasBidProject
        ? { label: "Open", type: "open" as const, route }
        : { label: "Create Bid Project", type: "create_bid_project" as const, route, payload: { opportunityId: o.id } },
    };
  });
}

function mapTasks(tasks: CommandTask[], now: Date): HomeItem[] {
  const isDone = (s: string) => {
    const x = (s || "").toLowerCase();
    return x === "done" || x === "completed" || x === "complete" || x === "closed" || x === "cancelled";
  };
  return tasks
    .filter((t) => !isDone(t.status))
    .map((t) => {
      const route = routeFor(t.sourceEntityType, t.sourceEntityId);
      const dueDate = t.dueAt ? new Date(t.dueAt) : null;
      const { score, reasons } = computeScore({
        dueAt: dueDate,
        isAiTaskStalled: t.source === "ai" && (t.status || "").toLowerCase() === "pending",
      });
      const priority = priorityFromScore(score);
      return {
        id: t.id,
        sourceType: "task" as const,
        title: t.title,
        subtitle: `${t.source || "manual"}${t.description ? ` · ${t.description}` : ""}`,
        route,
        dueAt: t.dueAt,
        priorityScore: score,
        priority,
        reasons,
        primaryAction: { label: "Open", type: "open" as const, route },
      };
    });
}

function mapJackets(jackets: CommandJacket[], now: Date): HomeItem[] {
  return jackets
    .filter((j) => j.missing > 0)
    .map((j) => {
      const route = `/projects/${j.bidProjectId}/documents`;
      const dueDate = j.oppDueAt ? new Date(j.oppDueAt) : null;
      const { score, reasons } = computeScore({
        dueAt: dueDate,
        missingCount: j.missing,
      });
      const priority = priorityFromScore(score);
      return {
        id: j.bidProjectId,
        sourceType: "jacket" as const,
        title: j.oppTitle,
        subtitle: `${j.bidStatus} · Missing artifacts: ${j.missing}/${j.total}`,
        route,
        dueAt: j.oppDueAt,
        priorityScore: score,
        priority,
        reasons,
        primaryAction: { label: "Request Docs", type: "request_missing_docs" as const, route, payload: { bidProjectId: j.bidProjectId } },
      };
    });
}

export function buildHomeResponse(args: {
  now: Date;
  commandData: DashboardCommandData;
  calendarData: CalendarTodayData;
  intelligenceData: HomeIntelligence;
  userName: string;
}): HomeDashboardResponse {
  const { now, commandData, calendarData, intelligenceData, userName } = args;

  const approvalItems = mapApprovals(commandData.approvals, now);
  const opportunityItems = mapOpportunities(commandData.opportunities, now);
  const taskItems = mapTasks(commandData.tasks, now);
  const jacketItems = mapJackets(commandData.jackets, now);

  const allItems = [...approvalItems, ...opportunityItems, ...taskItems, ...jacketItems];
  const sortByScore = (a: HomeItem, b: HomeItem) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  };

  const urgent = allItems
    .filter((i) => i.priority === "critical" || i.priority === "high")
    .sort(sortByScore);

  const needsAttention = allItems
    .filter((i) =>
      i.sourceType === "jacket" ||
      i.sourceType === "task" ||
      i.reasons.some((r) => r.toLowerCase().includes("missing") || r.toLowerCase().includes("stalled"))
    )
    .sort(sortByScore);

  const highValue = opportunityItems
    .filter((i) => (i.dollarValue ?? 0) >= 250000)
    .sort((a, b) => (b.dollarValue ?? 0) - (a.dollarValue ?? 0));

  const approvals = approvalItems.sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0));

  const deadlines72h = allItems.filter((i) => {
    if (!i.dueAt) return false;
    const due = new Date(i.dueAt).getTime();
    const diff = due - now.getTime();
    return diff >= 0 && diff <= 72 * 60 * 60 * 1000;
  }).length;

  const approvalsOverdue = approvalItems.filter(
    (i) => i.dueAt && new Date(i.dueAt).getTime() < now.getTime()
  ).length;

  const stalledAiTasks = commandData.tasks.filter(
    (t) => t.source === "ai" && (t.status || "").toLowerCase() === "pending"
  ).length;

  const revenueAtRisk = urgent.reduce((sum, i) => sum + (i.dollarValue ?? 0), 0);

  const missingArtifacts = commandData.jackets.reduce((sum, j) => sum + (j.missing ?? 0), 0);

  const pendingApprovals = approvalItems.length;

  const h = now.getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const greetingText = `${part}, ${userName}.`;
  const summary = `${pendingApprovals} approvals pending, ${deadlines72h} deadlines within 72h, ${formatMoney(revenueAtRisk)} revenue at risk.`;

  const kpis: HomeExecutiveKpis = {
    deadlines72h,
    approvalsOverdue,
    stalledAiTasks,
    revenueAtRisk,
    missingArtifacts,
    pendingApprovals,
  };

  const suggestedFocus = urgent.length > 0
    ? {
        startLocal: new Date(now.getTime() + 30 * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        endLocal: new Date(now.getTime() + 150 * 60000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
        reason: "Reserve a 2-hour focus block to clear top approvals and generate follow-up drafts.",
      }
    : undefined;

  return {
    now: now.toISOString(),
    executiveBrief: {
      greeting: greetingText,
      summary,
      kpis,
      recommended: urgent.slice(0, 5),
    },
    intelligence: intelligenceData,
    timeline: {
      connections: calendarData.connections,
      today: calendarData.today as any,
      missed: calendarData.missed as any,
      suggestedFocus,
    },
    buckets: {
      urgent: urgent.slice(0, 50),
      needsAttention: needsAttention.slice(0, 50),
      highValue: highValue.slice(0, 50),
      approvals: approvals.slice(0, 50),
    },
  };
}
