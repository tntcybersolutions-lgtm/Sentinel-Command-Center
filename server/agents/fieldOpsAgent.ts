import OpenAI from "openai";
import { db } from "../db";
import {
  projects,
  dailyLogs,
  timeEntries,
  rfis,
  submittals,
  changeOrders,
  employees,
  agentActivities,
} from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { auditService } from "../services/audit.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

interface DailyLogDigest {
  projectId: string;
  projectName: string;
  date: string;
  weather: any;
  workPerformed: any;
  labor: any;
  equipment: any;
  issues: any;
  safetyNotes: any;
}

interface ProductivityMetric {
  projectId: string;
  projectName: string;
  totalHoursLogged: number;
  totalOvertimeHours: number;
  crewCount: number;
  avgHoursPerCrew: number;
  overtimeRatio: number;
  productivityFlag: "green" | "amber" | "red";
}

interface DelayAttribution {
  projectId: string;
  projectName: string;
  category: string;
  description: string;
  daysImpact: number;
  source: string;
}

interface ScheduleRisk {
  projectId: string;
  projectName: string;
  riskLevel: "low" | "moderate" | "high" | "critical";
  completionPct: number;
  openRfis: number;
  pendingSubmittals: number;
  pendingCOs: number;
  totalDelayDays: number;
  concerns: string[];
}

interface FieldOpsDigest {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  recentDailyLogs: DailyLogDigest[];
  productivityMetrics: ProductivityMetric[];
  delayAttributions: DelayAttribution[];
  scheduleRisks: ScheduleRisk[];
  crewSummary: {
    totalCrews: number;
    totalHours: number;
    avgOvertimeRatio: number;
    projectsWithOvertime: number;
  };
  actionItems: Array<{ priority: string; category: string; message: string }>;
  narrative: string;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function runFieldOpsAnalysis(tenantId: string, projectId?: string): Promise<FieldOpsDigest & { reportId?: string }> {
  const startTime = Date.now();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allProjects, recentLogs, recentTime, allRfis, allSubmittals, allCOs] = await Promise.all([
    db.select().from(projects).where(
      projectId
        ? and(eq(projects.tenantId, tenantId), eq(projects.id, projectId))
        : eq(projects.tenantId, tenantId)
    ),
    db.select().from(dailyLogs).where(
      and(eq(dailyLogs.tenantId, tenantId), gte(dailyLogs.logDate, sevenDaysAgo))
    ),
    db.select().from(timeEntries).where(
      and(eq(timeEntries.tenantId, tenantId), gte(timeEntries.entryDate, thirtyDaysAgo))
    ),
    db.select().from(rfis).where(eq(rfis.tenantId, tenantId)),
    db.select().from(submittals).where(eq(submittals.tenantId, tenantId)),
    db.select().from(changeOrders).where(eq(changeOrders.tenantId, tenantId)),
  ]);

  const activeProjects = allProjects.filter(p =>
    !["completed", "archived", "cancelled"].includes(p.status || "")
  );
  const projectMap = new Map(activeProjects.map(p => [p.id, p]));
  const closedStatuses = new Set(["closed", "answered", "approved", "completed", "rejected", "cancelled"]);

  const recentDailyLogs: DailyLogDigest[] = recentLogs
    .filter(dl => projectMap.has(dl.projectId))
    .sort((a, b) => new Date(b.logDate).getTime() - new Date(a.logDate).getTime())
    .slice(0, 20)
    .map(dl => ({
      projectId: dl.projectId,
      projectName: projectMap.get(dl.projectId)?.name || "Unknown",
      date: new Date(dl.logDate).toISOString().split("T")[0],
      weather: dl.weatherJson,
      workPerformed: dl.workPerformedJson,
      labor: dl.laborJson,
      equipment: dl.equipmentJson,
      issues: dl.issuesJson,
      safetyNotes: dl.safetyNotesJson,
    }));

  const productivityMetrics: ProductivityMetric[] = [];
  const projectTimeMap = new Map<string, typeof recentTime>();

  for (const te of recentTime) {
    if (!te.projectId || !projectMap.has(te.projectId)) continue;
    const existing = projectTimeMap.get(te.projectId) || [];
    existing.push(te);
    projectTimeMap.set(te.projectId, existing);
  }

  for (const [pId, entries] of projectTimeMap) {
    const proj = projectMap.get(pId);
    if (!proj) continue;

    const totalRegular = entries.reduce((s, e) => s + (Number(e.regularHours) || 0), 0);
    const totalOT = entries.reduce((s, e) => s + (Number(e.overtimeHours) || 0), 0);
    const totalHours = totalRegular + totalOT;
    const uniqueEmployees = new Set(entries.map(e => e.employeeId));
    const crewCount = uniqueEmployees.size;
    const avgHours = crewCount > 0 ? totalHours / crewCount : 0;
    const otRatio = totalHours > 0 ? (totalOT / totalHours) * 100 : 0;

    let flag: ProductivityMetric["productivityFlag"] = "green";
    if (otRatio > 25) flag = "red";
    else if (otRatio > 15) flag = "amber";

    productivityMetrics.push({
      projectId: pId,
      projectName: proj.name,
      totalHoursLogged: Math.round(totalHours * 10) / 10,
      totalOvertimeHours: Math.round(totalOT * 10) / 10,
      crewCount,
      avgHoursPerCrew: Math.round(avgHours * 10) / 10,
      overtimeRatio: Math.round(otRatio * 10) / 10,
      productivityFlag: flag,
    });
  }

  const delayAttributions: DelayAttribution[] = [];

  for (const dl of recentLogs) {
    const proj = projectMap.get(dl.projectId);
    if (!proj) continue;

    const issues = dl.issuesJson as any[];
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        const desc = typeof issue === "string" ? issue : issue?.description || issue?.issue || JSON.stringify(issue);
        let category = "other";
        const lower = desc.toLowerCase();
        if (lower.includes("weather") || lower.includes("rain") || lower.includes("snow") || lower.includes("wind")) category = "weather";
        else if (lower.includes("owner") || lower.includes("client") || lower.includes("gfe") || lower.includes("government")) category = "owner";
        else if (lower.includes("sub") || lower.includes("vendor") || lower.includes("material")) category = "subcontractor";
        else if (lower.includes("design") || lower.includes("drawing") || lower.includes("rfi")) category = "design";
        else if (lower.includes("safety") || lower.includes("osha") || lower.includes("incident")) category = "safety";

        delayAttributions.push({
          projectId: dl.projectId,
          projectName: proj.name,
          category,
          description: desc.slice(0, 200),
          daysImpact: 1,
          source: "daily_log",
        });
      }
    }
  }

  const scheduleRisks: ScheduleRisk[] = activeProjects.map(p => {
    const pRfis = allRfis.filter(r => r.projectId === p.id && !closedStatuses.has(r.status));
    const pSubs = allSubmittals.filter(s => s.projectId === p.id && !closedStatuses.has(s.status));
    const pCOs = allCOs.filter(c => c.projectId === p.id && !closedStatuses.has(c.status));
    const pDelays = delayAttributions.filter(d => d.projectId === p.id);
    const totalDelayDays = pDelays.reduce((s, d) => s + d.daysImpact, 0);

    const concerns: string[] = [];
    if (pRfis.length >= 3) concerns.push(`${pRfis.length} unresolved RFIs may block work`);
    if (pSubs.length >= 3) concerns.push(`${pSubs.length} pending submittals — procurement at risk`);
    if (pCOs.length >= 2) concerns.push(`${pCOs.length} pending COs — scope uncertainty`);
    if (totalDelayDays >= 3) concerns.push(`${totalDelayDays} delay events in last 7 days`);

    const redFlags = pRfis.filter(r => daysBetween(new Date(r.createdAt), now) > 14);
    if (redFlags.length > 0) concerns.push(`${redFlags.length} RFIs stalled >14 days`);

    let riskLevel: ScheduleRisk["riskLevel"] = "low";
    const riskScore = pRfis.length * 3 + pSubs.length * 2 + pCOs.length * 4 + totalDelayDays * 2;
    if (riskScore > 30) riskLevel = "critical";
    else if (riskScore > 20) riskLevel = "high";
    else if (riskScore > 10) riskLevel = "moderate";

    return {
      projectId: p.id,
      projectName: p.name,
      riskLevel,
      completionPct: p.completionPercentage || 0,
      openRfis: pRfis.length,
      pendingSubmittals: pSubs.length,
      pendingCOs: pCOs.length,
      totalDelayDays,
      concerns,
    };
  });

  scheduleRisks.sort((a, b) => {
    const order = { critical: 0, high: 1, moderate: 2, low: 3 };
    return (order[a.riskLevel] || 3) - (order[b.riskLevel] || 3);
  });

  const totalCrews = productivityMetrics.reduce((s, m) => s + m.crewCount, 0);
  const totalHours = productivityMetrics.reduce((s, m) => s + m.totalHoursLogged, 0);
  const totalOT = productivityMetrics.reduce((s, m) => s + m.totalOvertimeHours, 0);
  const avgOTRatio = totalHours > 0 ? Math.round((totalOT / totalHours) * 1000) / 10 : 0;
  const projectsWithOT = productivityMetrics.filter(m => m.overtimeRatio > 10).length;

  const crewSummary = { totalCrews, totalHours: Math.round(totalHours), avgOvertimeRatio: avgOTRatio, projectsWithOvertime: projectsWithOT };

  const actionItems: FieldOpsDigest["actionItems"] = [];
  const criticalRisks = scheduleRisks.filter(r => r.riskLevel === "critical");
  if (criticalRisks.length > 0) {
    actionItems.push({
      priority: "critical",
      category: "Schedule",
      message: `${criticalRisks.length} projects at critical schedule risk: ${criticalRisks.map(r => r.projectName).join(", ")}`,
    });
  }
  if (avgOTRatio > 20) {
    actionItems.push({
      priority: "high",
      category: "Labor",
      message: `Overtime ratio at ${avgOTRatio}% across portfolio. Review crew sizing and scheduling.`,
    });
  }
  if (recentDailyLogs.length === 0 && activeProjects.length > 0) {
    actionItems.push({
      priority: "high",
      category: "Compliance",
      message: `No daily logs filed in last 7 days across ${activeProjects.length} active projects. Federal contracts require daily reporting.`,
    });
  }
  const safetyIssues = delayAttributions.filter(d => d.category === "safety");
  if (safetyIssues.length > 0) {
    actionItems.push({
      priority: "critical",
      category: "Safety",
      message: `${safetyIssues.length} safety-related issues reported in last 7 days. Review and document OSHA compliance.`,
    });
  }

  let narrative = `Field Ops Digest: ${activeProjects.length} active projects, ${recentDailyLogs.length} daily logs filed this week, ${totalCrews} crew members logged ${Math.round(totalHours)} hours (${avgOTRatio}% overtime). ${criticalRisks.length} projects at critical schedule risk. ${delayAttributions.length} delay events recorded.`;

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
          content: "You are a senior construction superintendent. Write a concise field operations briefing covering: crew productivity, schedule risks, delay attributions, and safety concerns. Use construction terminology. Focus on what a superintendent needs to know for the next 7 days.",
        },
        {
          role: "user",
          content: JSON.stringify({
            activeProjects: activeProjects.length,
            dailyLogsThisWeek: recentDailyLogs.length,
            crewSummary,
            scheduleRisks: scheduleRisks.filter(r => r.riskLevel !== "low").map(r => ({ project: r.projectName, risk: r.riskLevel, concerns: r.concerns })),
            delaysByCategory: Object.entries(delayAttributions.reduce((acc, d) => { acc[d.category] = (acc[d.category] || 0) + 1; return acc; }, {} as Record<string, number>)),
            safetyIssueCount: safetyIssues.length,
          }),
        },
      ],
    });

    if (completion.choices[0]?.message?.content) {
      narrative = completion.choices[0].message.content;
    }
  } catch (err) {
    console.error("Field Ops Agent OpenAI error (using fallback):", err);
  }

  await auditService.logEvent({
    tenantId,
    actor: "system",
    eventType: "agent_run",
    entityType: "field_ops_digest",
    entityId: projectId || "all",
    metadata: { projectCount: activeProjects.length, dailyLogs: recentDailyLogs.length, scheduleRisks: criticalRisks.length, delayEvents: delayAttributions.length },
  });

  const report: FieldOpsDigest = {
    generatedAt: now.toISOString(),
    periodStart: sevenDaysAgo.toISOString(),
    periodEnd: now.toISOString(),
    recentDailyLogs,
    productivityMetrics,
    delayAttributions,
    scheduleRisks,
    crewSummary,
    actionItems,
    narrative,
  };

  let reportId: string | undefined;
  try {
    const durationMs = Date.now() - startTime;
    const inserted = await db.insert(agentActivities).values({
      tenantId,
      agentName: "fieldops-agent",
      actionType: "report",
      entityType: projectId ? "project" : "portfolio",
      entityId: projectId || undefined,
      description: `Field Ops Digest: ${recentDailyLogs.length} logs, ${criticalRisks.length} critical risks, ${delayAttributions.length} delay events, ${activeProjects.length} projects`,
      outputJson: report,
      status: "success",
      durationMs,
    }).returning({ id: agentActivities.id });
    reportId = inserted[0]?.id;
  } catch (err) {
    console.error("Failed to persist Field Ops agent report:", err);
  }

  return { ...report, reportId };
}
