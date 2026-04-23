import OpenAI from "openai";
import { db } from "../db";
import {
  projects,
  invoices,
  payApplications,
  changeOrders,
  rfis,
  submittals,
  projectEstimates,
  opportunities,
} from "@shared/schema";
import { eq, and, ne, sql, desc, gte, count } from "drizzle-orm";
import { auditService } from "../services/audit.service";

const DEFAULT_TENANT_ID = "blackhawk-default";

interface JobMargin {
  projectId: string;
  projectName: string;
  contractValue: number;
  actualCosts: number;
  grossProfit: number;
  marginPct: number;
  billedToDate: number;
  completionPct: number;
  overUnderBilling: number;
  feeBurnRatio: number;
  status: "healthy" | "watch" | "at_risk" | "critical";
}

interface CashMetrics {
  totalReceivables: number;
  totalPayables: number;
  netCashPosition: number;
  arDays: number;
  apDays: number;
  cashConversionCycle: number;
  projected30DayCash: number;
  retentionHeld: number;
}

interface BacklogMetrics {
  totalBacklog: number;
  monthlyBurnRate: number;
  backlogMonths: number;
  pipelineValue: number;
  backlogTrend: "growing" | "stable" | "declining";
}

interface PMPerformance {
  pmName: string;
  projectCount: number;
  totalContractValue: number;
  avgMargin: number;
  openRfis: number;
  openSubmittals: number;
  pendingCOs: number;
  revenuePerPM: number;
  loadGrade: "A" | "B" | "C" | "D" | "F";
}

interface ExecScorecard {
  generatedAt: string;
  companyHealthScore: number;
  companyHealthGrade: "A" | "B" | "C" | "D" | "F";
  jobMargins: JobMargin[];
  cashMetrics: CashMetrics;
  backlogMetrics: BacklogMetrics;
  pmPerformance: PMPerformance[];
  changeOrderMetrics: {
    totalPending: number;
    totalPendingAmount: number;
    avgApprovalLagDays: number;
    approvalRate: number;
  };
  reworkProxy: {
    rejectedSubmittals: number;
    totalSubmittals: number;
    reworkRate: number;
  };
  topRisks: Array<{ rank: number; category: string; severity: string; message: string; impact: string }>;
  actionItems: Array<{ priority: string; category: string; message: string }>;
  narrative: string;
}

function daysBetween(d1: Date, d2: Date): number {
  return Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function runKPIAnalysis(tenantId: string): Promise<ExecScorecard> {
  const now = new Date();

  const [allProjects, allInvoices, allPayApps, allCOs, allRfis, allSubmittals, allEstimates, allOpps] = await Promise.all([
    db.select().from(projects).where(eq(projects.tenantId, tenantId)),
    db.select().from(invoices).where(eq(invoices.tenantId, tenantId)),
    db.select().from(payApplications).where(eq(payApplications.tenantId, tenantId)),
    db.select().from(changeOrders).where(eq(changeOrders.tenantId, tenantId)),
    db.select().from(rfis).where(eq(rfis.tenantId, tenantId)),
    db.select().from(submittals).where(eq(submittals.tenantId, tenantId)),
    db.select().from(projectEstimates).where(eq(projectEstimates.tenantId, tenantId)),
    db.select().from(opportunities).where(eq(opportunities.tenantId, tenantId)),
  ]);

  const activeProjects = allProjects.filter(p =>
    !["completed", "archived", "cancelled"].includes(p.status || "")
  );

  const closedStatuses = new Set(["closed", "answered", "approved", "completed", "rejected", "cancelled", "paid", "voided"]);

  const jobMargins: JobMargin[] = activeProjects.map(p => {
    const cv = Number(p.contractValue) || 0;
    const ac = Number(p.actualCosts) || 0;
    const gp = Number(p.grossProfit) || (cv - ac);
    const margin = cv > 0 ? (gp / cv) * 100 : 0;
    const completion = p.completionPercentage || 0;

    const pPayApps = allPayApps.filter(pa => pa.projectId === p.id);
    const billedToDate = pPayApps.reduce((s, pa) => s + (Number(pa.currentBilled) || 0) + (Number(pa.previouslyBilled) || 0), 0);

    const expectedBilling = cv * (completion / 100);
    const overUnder = billedToDate - expectedBilling;

    const earnedFee = gp * (completion / 100);
    const feeBurn = gp > 0 ? (ac / (cv - gp)) * 100 : 0;

    let status: JobMargin["status"] = "healthy";
    if (margin < 5 || overUnder < -cv * 0.1) status = "critical";
    else if (margin < 10 || overUnder < -cv * 0.05) status = "at_risk";
    else if (margin < 15 || overUnder < 0) status = "watch";

    return {
      projectId: p.id,
      projectName: p.name,
      contractValue: cv,
      actualCosts: ac,
      grossProfit: gp,
      marginPct: Math.round(margin * 10) / 10,
      billedToDate,
      completionPct: completion,
      overUnderBilling: Math.round(overUnder),
      feeBurnRatio: Math.round(feeBurn * 10) / 10,
      status,
    };
  });

  jobMargins.sort((a, b) => a.marginPct - b.marginPct);

  const arInvoices = allInvoices.filter(i => i.invoiceType === "receivable" && !["paid", "cancelled", "voided"].includes(i.status));
  const apInvoices = allInvoices.filter(i => i.invoiceType === "payable" && !["paid", "cancelled", "voided"].includes(i.status));
  const totalAR = arInvoices.reduce((s, i) => s + ((Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0)), 0);
  const totalAP = apInvoices.reduce((s, i) => s + ((Number(i.totalAmount) || 0) - (Number(i.paidAmount) || 0)), 0);

  const paidInvoices = allInvoices.filter(i => i.invoiceType === "receivable" && i.paidDate && i.invoiceDate);
  const arDaysArr = paidInvoices.map(i => daysBetween(new Date(i.invoiceDate!), new Date(i.paidDate!)));
  const arDays = arDaysArr.length > 0 ? Math.round(arDaysArr.reduce((s, d) => s + d, 0) / arDaysArr.length) : 0;

  const paidAP = allInvoices.filter(i => i.invoiceType === "payable" && i.paidDate && i.invoiceDate);
  const apDaysArr = paidAP.map(i => daysBetween(new Date(i.invoiceDate!), new Date(i.paidDate!)));
  const apDays = apDaysArr.length > 0 ? Math.round(apDaysArr.reduce((s, d) => s + d, 0) / apDaysArr.length) : 0;

  const cashConversionCycle = arDays - apDays;

  const totalRetention = allPayApps.reduce((s, pa) => s + (Number(pa.retainageHeld) || 0) - (Number(pa.retainageReleased) || 0), 0);
  const projected30 = totalAR * 0.6 - totalAP * 0.8;

  const cashMetrics: CashMetrics = {
    totalReceivables: Math.round(totalAR),
    totalPayables: Math.round(totalAP),
    netCashPosition: Math.round(totalAR - totalAP),
    arDays,
    apDays,
    cashConversionCycle,
    projected30DayCash: Math.round(projected30),
    retentionHeld: Math.round(totalRetention),
  };

  const completedProjects = allProjects.filter(p => p.status === "completed");
  const totalContractValue = activeProjects.reduce((s, p) => s + (Number(p.contractValue) || 0), 0);
  const completedValue = completedProjects.reduce((s, p) => s + (Number(p.contractValue) || 0), 0);
  const totalBacklog = totalContractValue;

  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const recentCompleted = completedProjects.filter(p => p.actualEndDate && new Date(p.actualEndDate) >= sixMonthsAgo);
  const monthlyBurn = recentCompleted.length > 0
    ? recentCompleted.reduce((s, p) => s + (Number(p.contractValue) || 0), 0) / 6
    : totalContractValue / 12;
  const backlogMonths = monthlyBurn > 0 ? totalBacklog / monthlyBurn : 0;

  const pipelineOpps = allOpps.filter(o =>
    !["won", "lost", "cancelled", "archived", "no_bid", "declined"].includes(o.status || "")
  );
  const pipelineValue = pipelineOpps.reduce((s, o) => s + (Number(o.contractValue) || 0), 0);

  let backlogTrend: BacklogMetrics["backlogTrend"] = "stable";
  if (backlogMonths > 12) backlogTrend = "growing";
  else if (backlogMonths < 6) backlogTrend = "declining";

  const backlogMetrics: BacklogMetrics = {
    totalBacklog: Math.round(totalBacklog),
    monthlyBurnRate: Math.round(monthlyBurn),
    backlogMonths: Math.round(backlogMonths * 10) / 10,
    pipelineValue: Math.round(pipelineValue),
    backlogTrend,
  };

  const pmMap = new Map<string, { name: string; projects: typeof activeProjects }>();
  for (const p of activeProjects) {
    const pmId = p.projectManagerId || "unassigned";
    const pmName = p.projectManager || "Unassigned";
    const existing = pmMap.get(pmId) || { name: pmName, projects: [] };
    existing.projects.push(p);
    pmMap.set(pmId, existing);
  }

  const pmPerformance: PMPerformance[] = [];
  for (const [pmId, pmData] of pmMap) {
    const pmProjects = pmData.projects;
    const pmContractValue = pmProjects.reduce((s, p) => s + (Number(p.contractValue) || 0), 0);
    const pmJobMargins = jobMargins.filter(jm => pmProjects.some(p => p.id === jm.projectId));
    const avgMargin = pmJobMargins.length > 0
      ? pmJobMargins.reduce((s, jm) => s + jm.marginPct, 0) / pmJobMargins.length
      : 0;

    const pmProjectIds = new Set(pmProjects.map(p => p.id));
    const openRfis = allRfis.filter(r => pmProjectIds.has(r.projectId) && !closedStatuses.has(r.status)).length;
    const openSubs = allSubmittals.filter(s => pmProjectIds.has(s.projectId) && !closedStatuses.has(s.status)).length;
    const pendingCOs = allCOs.filter(c => pmProjectIds.has(c.projectId) && !closedStatuses.has(c.status)).length;

    let grade: PMPerformance["loadGrade"] = "A";
    const loadScore = pmProjects.length * 10 + openRfis * 2 + openSubs * 1.5 + pendingCOs * 3;
    if (loadScore > 80) grade = "F";
    else if (loadScore > 60) grade = "D";
    else if (loadScore > 40) grade = "C";
    else if (loadScore > 20) grade = "B";

    pmPerformance.push({
      pmName: pmData.name,
      projectCount: pmProjects.length,
      totalContractValue: Math.round(pmContractValue),
      avgMargin: Math.round(avgMargin * 10) / 10,
      openRfis,
      openSubmittals: openSubs,
      pendingCOs,
      revenuePerPM: Math.round(pmContractValue),
      loadGrade: grade,
    });
  }

  pmPerformance.sort((a, b) => {
    const order = { F: 0, D: 1, C: 2, B: 3, A: 4 };
    return (order[a.loadGrade] || 0) - (order[b.loadGrade] || 0);
  });

  const pendingCOs = allCOs.filter(c => !closedStatuses.has(c.status));
  const totalPendingCOAmount = pendingCOs.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const approvedCOs = allCOs.filter(c => c.approvedAt && c.submittedAt);
  const coApprovalDays = approvedCOs.map(c => daysBetween(new Date(c.submittedAt!), new Date(c.approvedAt!)));
  const avgCOLag = coApprovalDays.length > 0
    ? Math.round(coApprovalDays.reduce((s, d) => s + d, 0) / coApprovalDays.length)
    : 0;
  const coApprovalRate = allCOs.length > 0 ? Math.round((approvedCOs.length / allCOs.length) * 100) : 0;

  const changeOrderMetrics = {
    totalPending: pendingCOs.length,
    totalPendingAmount: Math.round(totalPendingCOAmount),
    avgApprovalLagDays: avgCOLag,
    approvalRate: coApprovalRate,
  };

  const totalSubs = allSubmittals.length;
  const rejectedSubs = allSubmittals.filter(s => s.status === "rejected").length;
  const reworkRate = totalSubs > 0 ? Math.round((rejectedSubs / totalSubs) * 1000) / 10 : 0;

  const reworkProxy = { rejectedSubmittals: rejectedSubs, totalSubmittals: totalSubs, reworkRate };

  const topRisks: ExecScorecard["topRisks"] = [];
  let riskRank = 1;

  if (cashMetrics.netCashPosition < 0) {
    topRisks.push({
      rank: riskRank++,
      category: "Cash Flow",
      severity: "critical",
      message: `Negative cash position: $${Math.abs(cashMetrics.netCashPosition).toLocaleString()} more payable than receivable`,
      impact: "May not meet payroll or sub payment obligations",
    });
  }

  const criticalJobs = jobMargins.filter(j => j.status === "critical");
  if (criticalJobs.length > 0) {
    topRisks.push({
      rank: riskRank++,
      category: "Job Margin",
      severity: "critical",
      message: `${criticalJobs.length} jobs at critical margin (<5%): ${criticalJobs.map(j => j.projectName).slice(0, 3).join(", ")}`,
      impact: "Risk of losing money on active projects",
    });
  }

  if (backlogMetrics.backlogMonths < 6) {
    topRisks.push({
      rank: riskRank++,
      category: "Backlog",
      severity: backlogMetrics.backlogMonths < 3 ? "critical" : "high",
      message: `Only ${backlogMetrics.backlogMonths} months of backlog remaining`,
      impact: "Insufficient work pipeline — accelerate business development",
    });
  }

  const overloadedPMs = pmPerformance.filter(pm => pm.loadGrade === "F" || pm.loadGrade === "D");
  if (overloadedPMs.length > 0) {
    topRisks.push({
      rank: riskRank++,
      category: "PM Load",
      severity: "high",
      message: `${overloadedPMs.length} PMs overloaded: ${overloadedPMs.map(pm => pm.pmName).join(", ")}`,
      impact: "Quality drops, rework increases, client satisfaction declines",
    });
  }

  if (cashMetrics.arDays > 60) {
    topRisks.push({
      rank: riskRank++,
      category: "Collections",
      severity: "high",
      message: `AR days at ${cashMetrics.arDays} — well above industry average of 45`,
      impact: "Cash conversion cycle too long — cash flow strain",
    });
  }

  if (reworkProxy.reworkRate > 15) {
    topRisks.push({
      rank: riskRank++,
      category: "Quality",
      severity: "high",
      message: `Rework rate at ${reworkProxy.reworkRate}% (${rejectedSubs} rejected submittals)`,
      impact: "Rework drives cost overruns and schedule delays",
    });
  }

  if (changeOrderMetrics.avgApprovalLagDays > 30) {
    topRisks.push({
      rank: riskRank++,
      category: "Change Orders",
      severity: "medium",
      message: `Average CO approval lag is ${changeOrderMetrics.avgApprovalLagDays} days`,
      impact: "Delayed approvals create cash flow and scope uncertainty",
    });
  }

  const actionItems: ExecScorecard["actionItems"] = [];
  if (totalAR > 0 && cashMetrics.arDays > 45) {
    actionItems.push({ priority: "critical", category: "Collections", message: `Collect $${totalAR.toLocaleString()} in outstanding receivables (${cashMetrics.arDays} day avg)` });
  }
  if (criticalJobs.length > 0) {
    actionItems.push({ priority: "critical", category: "Margins", message: `Review cost-to-complete on ${criticalJobs.length} critical-margin jobs` });
  }
  if (backlogMetrics.backlogMonths < 6) {
    actionItems.push({ priority: "high", category: "Business Dev", message: `Pipeline is thin (${backlogMetrics.backlogMonths} months). Increase pursuit activity.` });
  }
  if (pendingCOs.length > 3) {
    actionItems.push({ priority: "high", category: "Change Orders", message: `Push ${pendingCOs.length} pending COs ($${Math.round(totalPendingCOAmount).toLocaleString()}) through approval` });
  }

  let healthScore = 100;
  if (cashMetrics.netCashPosition < 0) healthScore -= 20;
  if (cashMetrics.arDays > 60) healthScore -= 10;
  else if (cashMetrics.arDays > 45) healthScore -= 5;
  healthScore -= criticalJobs.length * 8;
  healthScore -= jobMargins.filter(j => j.status === "at_risk").length * 4;
  if (backlogMetrics.backlogMonths < 6) healthScore -= 10;
  if (reworkProxy.reworkRate > 15) healthScore -= 8;
  healthScore -= overloadedPMs.length * 5;
  if (changeOrderMetrics.avgApprovalLagDays > 30) healthScore -= 5;
  healthScore = Math.max(0, Math.min(100, healthScore));

  let healthGrade: ExecScorecard["companyHealthGrade"];
  if (healthScore >= 85) healthGrade = "A";
  else if (healthScore >= 70) healthGrade = "B";
  else if (healthScore >= 55) healthGrade = "C";
  else if (healthScore >= 40) healthGrade = "D";
  else healthGrade = "F";

  let narrative = `Executive Scorecard: Company health ${healthGrade} (${healthScore}/100). ${activeProjects.length} active projects, $${Math.round(totalContractValue).toLocaleString()} total contract value. Cash: $${Math.round(totalAR).toLocaleString()} AR / $${Math.round(totalAP).toLocaleString()} AP. Backlog: ${backlogMetrics.backlogMonths} months. ${topRisks.length} key risks identified.`;

  try {
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "You are a Construction CFO presenting to ownership. Write a 4-6 paragraph executive briefing covering: company financial health, job margins, cash position, backlog outlook, PM performance, and top risks. Use construction finance terminology (WIP, over/under billing, retention, backlog coverage). Be direct about problems but also highlight strengths.",
        },
        {
          role: "user",
          content: JSON.stringify({
            healthScore,
            healthGrade,
            activeProjects: activeProjects.length,
            totalContractValue: Math.round(totalContractValue),
            cashMetrics,
            backlogMetrics,
            topJobMargins: jobMargins.slice(0, 5).map(j => ({ name: j.projectName, margin: j.marginPct, status: j.status })),
            bottomJobMargins: jobMargins.slice(-3).map(j => ({ name: j.projectName, margin: j.marginPct, status: j.status })),
            changeOrderMetrics,
            reworkProxy,
            pmCount: pmPerformance.length,
            overloadedPMs: overloadedPMs.length,
            topRisks: topRisks.slice(0, 5),
          }),
        },
      ],
    });

    if (completion.choices[0]?.message?.content) {
      narrative = completion.choices[0].message.content;
    }
  } catch (err) {
    console.error("KPI Agent OpenAI error (using fallback):", err);
  }

  await auditService.logEvent({
    tenantId,
    actor: "system",
    eventType: "agent_run",
    entityType: "exec_scorecard",
    entityId: "company",
    metadata: { healthScore, healthGrade, activeProjects: activeProjects.length, topRiskCount: topRisks.length },
  });

  return {
    generatedAt: now.toISOString(),
    companyHealthScore: healthScore,
    companyHealthGrade: healthGrade,
    jobMargins,
    cashMetrics,
    backlogMetrics,
    pmPerformance,
    changeOrderMetrics,
    reworkProxy,
    topRisks,
    actionItems,
    narrative,
  };
}
