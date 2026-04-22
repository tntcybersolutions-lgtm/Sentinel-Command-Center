import OpenAI from "openai";
import { db } from "../db";
import {
  rfis,
  submittals,
  changeOrders,
  projects,
  payApplications,
  tasks,
  agentActivities,
} from "@shared/schema";
import { eq, and, ne, sql, inArray } from "drizzle-orm";
import { auditService } from "../services/audit.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

interface RFIHealth {
  total: number;
  open: number;
  overdue: number;
  avgAgeDays: number;
  oldest: { id: string; subject: string; ageDays: number } | null;
  stalledItems: Array<{ id: string; rfiNumber: string; subject: string; ageDays: number; project: string }>;
}

interface SubmittalHealth {
  total: number;
  pending: number;
  overdue: number;
  rejected: number;
  avgAgeDays: number;
  stalledItems: Array<{ id: string; submittalNumber: string; name: string; ageDays: number; project: string }>;
}

interface ChangeOrderHealth {
  total: number;
  pending: number;
  totalPendingAmount: number;
  avgApprovalDays: number;
  longCycleItems: Array<{ id: string; coNumber: string; title: string; ageDays: number; amount: number; project: string }>;
}

interface ProjectHealth {
  projectId: string;
  projectName: string;
  rfiCount: number;
  openRfiCount: number;
  overdueRfiCount: number;
  submittalCount: number;
  pendingSubmittals: number;
  changeOrderCount: number;
  pendingCOs: number;
  healthGrade: "A" | "B" | "C" | "D" | "F";
  silentKillers: string[];
}

interface PMHealthReport {
  generatedAt: string;
  rfiHealth: RFIHealth;
  submittalHealth: SubmittalHealth;
  changeOrderHealth: ChangeOrderHealth;
  projectHealthCards: ProjectHealth[];
  silentKillers: Array<{ type: string; severity: string; project: string; message: string; action: string }>;
  actionItems: Array<{ priority: string; category: string; message: string }>;
  narrative: string;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function runPMAnalysis(tenantId: string, projectId?: string): Promise<PMHealthReport & { reportId?: string }> {
  const startTime = Date.now();
  const now = new Date();

  const projectFilter = projectId
    ? and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))
    : eq(projects.tenantId, tenantId);

  const [allProjects, allRfis, allSubmittals, allCOs, allPayApps] = await Promise.all([
    db.select().from(projects).where(projectFilter),
    db.select().from(rfis).where(eq(rfis.tenantId, tenantId)),
    db.select().from(submittals).where(eq(submittals.tenantId, tenantId)),
    db.select().from(changeOrders).where(eq(changeOrders.tenantId, tenantId)),
    db.select().from(payApplications).where(eq(payApplications.tenantId, tenantId)),
  ]);

  const activeProjects = allProjects.filter(p =>
    !["completed", "archived", "cancelled"].includes(p.status || "")
  );
  const projectIds = new Set(activeProjects.map(p => p.id));
  const projectMap = new Map(activeProjects.map(p => [p.id, p.name]));

  const activeRfis = allRfis.filter(r => projectIds.has(r.projectId));
  const activeSubmittals = allSubmittals.filter(s => projectIds.has(s.projectId));
  const activeCOs = allCOs.filter(c => projectIds.has(c.projectId));

  const openStatuses = new Set(["draft", "open", "submitted", "in_review", "pending", "in_progress"]);
  const closedStatuses = new Set(["closed", "answered", "approved", "completed", "rejected", "cancelled"]);

  const openRfis = activeRfis.filter(r => !closedStatuses.has(r.status));
  const overdueRfis = openRfis.filter(r => {
    if (r.dueDate && new Date(r.dueDate) < now) return true;
    const created = new Date(r.createdAt);
    return daysBetween(created, now) > 10;
  });

  const rfiAges = openRfis.map(r => daysBetween(new Date(r.createdAt), now));
  const avgRfiAge = rfiAges.length > 0 ? Math.round(rfiAges.reduce((s, a) => s + a, 0) / rfiAges.length) : 0;

  let oldestRfi: RFIHealth["oldest"] = null;
  if (openRfis.length > 0) {
    const sorted = [...openRfis].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const o = sorted[0];
    oldestRfi = { id: o.id, subject: o.subject, ageDays: daysBetween(new Date(o.createdAt), now) };
  }

  const stalledRfis = overdueRfis.slice(0, 10).map(r => ({
    id: r.id,
    rfiNumber: r.rfiNumber,
    subject: r.subject,
    ageDays: daysBetween(new Date(r.createdAt), now),
    project: projectMap.get(r.projectId) || "Unknown",
  }));

  const rfiHealth: RFIHealth = {
    total: activeRfis.length,
    open: openRfis.length,
    overdue: overdueRfis.length,
    avgAgeDays: avgRfiAge,
    oldest: oldestRfi,
    stalledItems: stalledRfis,
  };

  const pendingSubmittals = activeSubmittals.filter(s => !closedStatuses.has(s.status));
  const overdueSubmittals = pendingSubmittals.filter(s => {
    const created = new Date(s.createdAt);
    return daysBetween(created, now) > 14;
  });
  const rejectedSubmittals = activeSubmittals.filter(s => s.status === "rejected");

  const submittalAges = pendingSubmittals.map(s => daysBetween(new Date(s.createdAt), now));
  const avgSubmittalAge = submittalAges.length > 0
    ? Math.round(submittalAges.reduce((s, a) => s + a, 0) / submittalAges.length) : 0;

  const stalledSubmittals = overdueSubmittals.slice(0, 10).map(s => ({
    id: s.id,
    submittalNumber: s.submittalNumber,
    name: s.name,
    ageDays: daysBetween(new Date(s.createdAt), now),
    project: projectMap.get(s.projectId) || "Unknown",
  }));

  const submittalHealth: SubmittalHealth = {
    total: activeSubmittals.length,
    pending: pendingSubmittals.length,
    overdue: overdueSubmittals.length,
    rejected: rejectedSubmittals.length,
    avgAgeDays: avgSubmittalAge,
    stalledItems: stalledSubmittals,
  };

  const pendingCOs = activeCOs.filter(c => openStatuses.has(c.status));
  const approvedCOs = activeCOs.filter(c => c.approvedAt);
  const coApprovalDays = approvedCOs
    .filter(c => c.submittedAt && c.approvedAt)
    .map(c => daysBetween(new Date(c.submittedAt!), new Date(c.approvedAt!)));
  const avgCOApproval = coApprovalDays.length > 0
    ? Math.round(coApprovalDays.reduce((s, d) => s + d, 0) / coApprovalDays.length) : 0;

  const longCycleCOs = pendingCOs
    .filter(c => {
      const created = c.submittedAt ? new Date(c.submittedAt) : new Date(c.createdAt);
      return daysBetween(created, now) > 14;
    })
    .slice(0, 10)
    .map(c => ({
      id: c.id,
      coNumber: c.coNumber,
      title: c.title,
      ageDays: daysBetween(c.submittedAt ? new Date(c.submittedAt) : new Date(c.createdAt), now),
      amount: Number(c.amount) || 0,
      project: projectMap.get(c.projectId) || "Unknown",
    }));

  const totalPendingAmount = pendingCOs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  const changeOrderHealth: ChangeOrderHealth = {
    total: activeCOs.length,
    pending: pendingCOs.length,
    totalPendingAmount,
    avgApprovalDays: avgCOApproval,
    longCycleItems: longCycleCOs,
  };

  const silentKillers: PMHealthReport["silentKillers"] = [];

  overdueRfis.filter(r => daysBetween(new Date(r.createdAt), now) > 21).forEach(r => {
    silentKillers.push({
      type: "stalled_rfi",
      severity: "critical",
      project: projectMap.get(r.projectId) || "Unknown",
      message: `RFI #${r.rfiNumber} "${r.subject}" unanswered for ${daysBetween(new Date(r.createdAt), now)} days`,
      action: "Escalate to architect/engineer immediately. May be blocking work.",
    });
  });

  overdueSubmittals.filter(s => daysBetween(new Date(s.createdAt), now) > 21).forEach(s => {
    silentKillers.push({
      type: "stalled_submittal",
      severity: "high",
      project: projectMap.get(s.projectId) || "Unknown",
      message: `Submittal #${s.submittalNumber} "${s.name}" pending for ${daysBetween(new Date(s.createdAt), now)} days`,
      action: "Follow up with reviewer. Material procurement may be delayed.",
    });
  });

  longCycleCOs.filter(c => c.ageDays > 30).forEach(c => {
    silentKillers.push({
      type: "co_lag",
      severity: c.amount > 50000 ? "critical" : "high",
      project: c.project,
      message: `CO #${c.coNumber} "${c.title}" ($${c.amount.toLocaleString()}) pending ${c.ageDays} days`,
      action: "Unresolved COs create cash flow risk and scope disputes.",
    });
  });

  const projectHealthCards: ProjectHealth[] = activeProjects.map(p => {
    const pRfis = activeRfis.filter(r => r.projectId === p.id);
    const pOpenRfis = pRfis.filter(r => !closedStatuses.has(r.status));
    const pOverdueRfis = pOpenRfis.filter(r => daysBetween(new Date(r.createdAt), now) > 10);
    const pSubmittals = activeSubmittals.filter(s => s.projectId === p.id);
    const pPendingSubs = pSubmittals.filter(s => !closedStatuses.has(s.status));
    const pCOs = activeCOs.filter(c => c.projectId === p.id);
    const pPendingCOs = pCOs.filter(c => openStatuses.has(c.status));

    const killers: string[] = [];
    if (pOverdueRfis.length >= 3) killers.push(`${pOverdueRfis.length} overdue RFIs`);
    if (pPendingSubs.length >= 5) killers.push(`${pPendingSubs.length} pending submittals`);
    if (pPendingCOs.length >= 3) killers.push(`${pPendingCOs.length} pending COs`);

    let demeritPoints = 0;
    demeritPoints += pOverdueRfis.length * 5;
    demeritPoints += pPendingSubs.filter(s => daysBetween(new Date(s.createdAt), now) > 14).length * 4;
    demeritPoints += pPendingCOs.filter(c => daysBetween(new Date(c.createdAt), now) > 14).length * 6;

    let grade: ProjectHealth["healthGrade"];
    if (demeritPoints <= 5) grade = "A";
    else if (demeritPoints <= 15) grade = "B";
    else if (demeritPoints <= 30) grade = "C";
    else if (demeritPoints <= 50) grade = "D";
    else grade = "F";

    return {
      projectId: p.id,
      projectName: p.name,
      rfiCount: pRfis.length,
      openRfiCount: pOpenRfis.length,
      overdueRfiCount: pOverdueRfis.length,
      submittalCount: pSubmittals.length,
      pendingSubmittals: pPendingSubs.length,
      changeOrderCount: pCOs.length,
      pendingCOs: pPendingCOs.length,
      healthGrade: grade,
      silentKillers: killers,
    };
  });

  projectHealthCards.sort((a, b) => {
    const gradeOrder = { F: 0, D: 1, C: 2, B: 3, A: 4 };
    return (gradeOrder[a.healthGrade] || 0) - (gradeOrder[b.healthGrade] || 0);
  });

  const actionItems: PMHealthReport["actionItems"] = [];
  if (overdueRfis.length > 0) {
    actionItems.push({
      priority: "critical",
      category: "RFI",
      message: `${overdueRfis.length} RFIs are overdue (avg ${avgRfiAge} days). Escalate immediately.`,
    });
  }
  if (overdueSubmittals.length > 0) {
    actionItems.push({
      priority: "high",
      category: "Submittal",
      message: `${overdueSubmittals.length} submittals are overdue (avg ${avgSubmittalAge} days). Follow up with reviewers.`,
    });
  }
  if (pendingCOs.length > 0) {
    actionItems.push({
      priority: "high",
      category: "Change Order",
      message: `${pendingCOs.length} COs pending approval ($${Math.round(totalPendingAmount).toLocaleString()}). Avg approval cycle: ${avgCOApproval} days.`,
    });
  }
  if (rejectedSubmittals.length > 0) {
    actionItems.push({
      priority: "medium",
      category: "Submittal",
      message: `${rejectedSubmittals.length} submittals rejected — need resubmission to avoid procurement delays.`,
    });
  }

  const unhealthyProjects = projectHealthCards.filter(p => p.healthGrade === "D" || p.healthGrade === "F");
  if (unhealthyProjects.length > 0) {
    actionItems.push({
      priority: "critical",
      category: "Project Health",
      message: `${unhealthyProjects.length} projects graded D or F: ${unhealthyProjects.map(p => p.projectName).join(", ")}`,
    });
  }

  let narrative = `PM Health Report: ${openRfis.length} open RFIs (${overdueRfis.length} overdue), ${pendingSubmittals.length} pending submittals (${overdueSubmittals.length} overdue), ${pendingCOs.length} pending COs ($${Math.round(totalPendingAmount).toLocaleString()}). ${silentKillers.length} silent killers detected across ${activeProjects.length} active projects.`;

  try {
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a senior construction project manager. Write a concise PM health briefing focused on: stalled items that block work, CO approval delays that create cash risk, and which projects need immediate attention. Use construction industry terminology. Be direct and actionable.",
        },
        {
          role: "user",
          content: JSON.stringify({
            rfiHealth: { open: openRfis.length, overdue: overdueRfis.length, avgAge: avgRfiAge },
            submittalHealth: { pending: pendingSubmittals.length, overdue: overdueSubmittals.length, rejected: rejectedSubmittals.length },
            changeOrders: { pending: pendingCOs.length, totalPendingAmount, avgApprovalDays: avgCOApproval },
            silentKillerCount: silentKillers.length,
            unhealthyProjects: unhealthyProjects.map(p => ({ name: p.projectName, grade: p.healthGrade, killers: p.silentKillers })),
            activeProjectCount: activeProjects.length,
          }),
        },
      ],
    });

    if (completion.choices[0]?.message?.content) {
      narrative = completion.choices[0].message.content;
    }
  } catch (err) {
    console.error("PM Agent OpenAI error (using fallback):", err);
  }

  await auditService.logEvent({
    tenantId,
    actor: "system",
    eventType: "agent_run",
    entityType: "pm_health_report",
    entityId: projectId || "all",
    metadata: { rfiOverdue: overdueRfis.length, submittalOverdue: overdueSubmittals.length, pendingCOs: pendingCOs.length, silentKillers: silentKillers.length },
  });

  const report: PMHealthReport = {
    generatedAt: now.toISOString(),
    rfiHealth,
    submittalHealth,
    changeOrderHealth,
    projectHealthCards,
    silentKillers,
    actionItems,
    narrative,
  };

  let reportId: string | undefined;
  try {
    const durationMs = Date.now() - startTime;
    const inserted = await db.insert(agentActivities).values({
      tenantId,
      agentName: "pm-agent",
      actionType: "report",
      entityType: projectId ? "project" : "portfolio",
      entityId: projectId || undefined,
      description: `PM Health Report: ${openRfis.length} open RFIs, ${pendingSubmittals.length} pending submittals, ${pendingCOs.length} pending COs, ${silentKillers.length} silent killers`,
      outputJson: report,
      status: "success",
      durationMs,
    }).returning({ id: agentActivities.id });
    reportId = inserted[0]?.id;
  } catch (err) {
    console.error("Failed to persist PM agent report:", err);
  }

  return { ...report, reportId };
}
