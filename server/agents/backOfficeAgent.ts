import OpenAI from "openai";
import { lazyOpenAI } from "../lib/lazy-openai";
import { db } from "../db";
import { invoices, payApplications, companyCertifications, vendors, projects } from "@shared/schema";
import { eq, and, sql, lte, gte, desc, isNull } from "drizzle-orm";
import { auditService } from "../services/audit.service";

const openai = lazyOpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DEFAULT_TENANT_ID = "blackhawk-default";

export interface AgingBucket {
  label: string;
  count: number;
  amount: number;
}

export interface RetentionEntry {
  projectId: string;
  projectName: string;
  retainageHeld: number;
  retainageReleased: number;
  netRetention: number;
}

export interface VendorComplianceAlert {
  vendorId: string;
  vendorName: string;
  issues: string[];
  severity: "critical" | "warning" | "info";
}

export interface CashMetrics {
  totalReceivables: number;
  totalPayables: number;
  netPosition: number;
  arDays: number;
  retentionHeld: number;
  projected30DayCash: number;
}

export interface CashAndComplianceReport {
  cashMetrics: CashMetrics;
  arAging: AgingBucket[];
  apAging: AgingBucket[];
  retentionByProject: RetentionEntry[];
  vendorAlerts: VendorComplianceAlert[];
  missingLienWaivers: Array<{ projectId: string; projectName: string; payAppNumber: number; amount: number }>;
  actionItems: Array<{ priority: "critical" | "high" | "medium" | "low"; action: string; entity: string; dueDate: string | null }>;
  narrative: string;
  generatedAt: string;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

export async function runBackOfficeAnalysis(tenantId: string): Promise<CashAndComplianceReport> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [arRows, apRows, payAppRows, certRows, vendorRows, projectRows] = await Promise.all([
    db.select().from(invoices).where(and(
      eq(invoices.tenantId, tenantId),
      eq(invoices.invoiceType, "receivable"),
      sql`${invoices.status} NOT IN ('paid', 'cancelled', 'voided')`,
    )),
    db.select().from(invoices).where(and(
      eq(invoices.tenantId, tenantId),
      eq(invoices.invoiceType, "payable"),
      sql`${invoices.status} NOT IN ('paid', 'cancelled', 'voided')`,
    )),
    db.select().from(payApplications).where(eq(payApplications.tenantId, tenantId)),
    db.select().from(companyCertifications).where(eq(companyCertifications.tenantId, tenantId)),
    db.select().from(vendors).where(eq(vendors.tenantId, tenantId)),
    db.select().from(projects).where(eq(projects.tenantId, tenantId)),
  ]);

  const projectMap = new Map(projectRows.map(p => [p.id, p.name || p.projectNumber || "Unnamed"]));

  const arAging: AgingBucket[] = [
    { label: "Current", count: 0, amount: 0 },
    { label: "31-60 days", count: 0, amount: 0 },
    { label: "61-90 days", count: 0, amount: 0 },
    { label: "90+ days", count: 0, amount: 0 },
  ];

  let totalReceivables = 0;
  let totalArDays = 0;
  let arCount = 0;

  for (const inv of arRows) {
    const amount = parseFloat(inv.totalAmount || "0") - parseFloat(inv.paidAmount || "0");
    if (amount <= 0) continue;
    totalReceivables += amount;

    const invoiceDate = inv.invoiceDate ? new Date(inv.invoiceDate) : inv.createdAt;
    const age = daysBetween(invoiceDate, now);
    totalArDays += age;
    arCount++;

    if (age <= 30) { arAging[0].count++; arAging[0].amount += amount; }
    else if (age <= 60) { arAging[1].count++; arAging[1].amount += amount; }
    else if (age <= 90) { arAging[2].count++; arAging[2].amount += amount; }
    else { arAging[3].count++; arAging[3].amount += amount; }
  }

  const apAging: AgingBucket[] = [
    { label: "Current", count: 0, amount: 0 },
    { label: "31-60 days", count: 0, amount: 0 },
    { label: "61-90 days", count: 0, amount: 0 },
    { label: "90+ days", count: 0, amount: 0 },
  ];

  let totalPayables = 0;
  for (const inv of apRows) {
    const amount = parseFloat(inv.totalAmount || "0") - parseFloat(inv.paidAmount || "0");
    if (amount <= 0) continue;
    totalPayables += amount;

    const invoiceDate = inv.invoiceDate ? new Date(inv.invoiceDate) : inv.createdAt;
    const age = daysBetween(invoiceDate, now);

    if (age <= 30) { apAging[0].count++; apAging[0].amount += amount; }
    else if (age <= 60) { apAging[1].count++; apAging[1].amount += amount; }
    else if (age <= 90) { apAging[2].count++; apAging[2].amount += amount; }
    else { apAging[3].count++; apAging[3].amount += amount; }
  }

  const retentionMap = new Map<string, { held: number; released: number }>();
  for (const pa of payAppRows) {
    const projId = pa.projectId;
    if (!retentionMap.has(projId)) retentionMap.set(projId, { held: 0, released: 0 });
    const entry = retentionMap.get(projId)!;
    entry.held += parseFloat(pa.retainageHeld || "0");
    entry.released += parseFloat(pa.retainageReleased || "0");
  }

  const retentionByProject: RetentionEntry[] = [];
  let totalRetention = 0;
  for (const [projId, vals] of retentionMap) {
    const net = vals.held - vals.released;
    totalRetention += net;
    retentionByProject.push({
      projectId: projId,
      projectName: projectMap.get(projId) || projId,
      retainageHeld: Math.round(vals.held),
      retainageReleased: Math.round(vals.released),
      netRetention: Math.round(net),
    });
  }

  const missingLienWaivers: Array<{ projectId: string; projectName: string; payAppNumber: number; amount: number }> = [];
  for (const pa of payAppRows) {
    if (pa.status === "approved" && (!pa.lienWaiverStatus || pa.lienWaiverStatus === "missing" || pa.lienWaiverStatus === "pending")) {
      missingLienWaivers.push({
        projectId: pa.projectId,
        projectName: projectMap.get(pa.projectId) || pa.projectId,
        payAppNumber: pa.payAppNumber,
        amount: parseFloat(pa.netPayable || "0"),
      });
    }
  }

  const vendorAlerts: VendorComplianceAlert[] = [];
  for (const v of vendorRows) {
    const issues: string[] = [];

    const vendorCerts = certRows.filter(c => {
      const meta = c as any;
      return meta.vendorId === v.id || (c.tenantId === tenantId);
    });

    if (v.insuranceExpiresAt) {
      const expiry = new Date(v.insuranceExpiresAt);
      const daysUntil = daysBetween(now, expiry);
      if (daysUntil < 0) {
        issues.push(`Insurance expired ${Math.abs(daysUntil)} days ago`);
      } else if (daysUntil <= 30) {
        issues.push(`Insurance expires in ${daysUntil} days`);
      }
    }

    if (v.licenseExpiresAt) {
      const expiry = new Date(v.licenseExpiresAt);
      const daysUntil = daysBetween(now, expiry);
      if (daysUntil < 0) {
        issues.push(`License expired ${Math.abs(daysUntil)} days ago`);
      } else if (daysUntil <= 30) {
        issues.push(`License expires in ${daysUntil} days`);
      }
    }

    if (issues.length > 0) {
      vendorAlerts.push({
        vendorId: v.id,
        vendorName: v.companyName || "Unknown",
        issues,
        severity: issues.some(i => i.includes("expired")) ? "critical" : "warning",
      });
    }
  }

  const arDays = arCount > 0 ? Math.round(totalArDays / arCount) : 0;
  const projected30DayCash = totalReceivables * 0.6 - totalPayables * 0.8;

  const cashMetrics: CashMetrics = {
    totalReceivables: Math.round(totalReceivables),
    totalPayables: Math.round(totalPayables),
    netPosition: Math.round(totalReceivables - totalPayables),
    arDays,
    retentionHeld: Math.round(totalRetention),
    projected30DayCash: Math.round(projected30DayCash),
  };

  const actionItems: Array<{ priority: "critical" | "high" | "medium" | "low"; action: string; entity: string; dueDate: string | null }> = [];

  if (arAging[3].amount > 0) {
    actionItems.push({ priority: "critical", action: `Collect $${arAging[3].amount.toLocaleString()} in 90+ day receivables`, entity: "AR", dueDate: null });
  }
  if (arAging[2].amount > 0) {
    actionItems.push({ priority: "high", action: `Follow up on $${arAging[2].amount.toLocaleString()} in 61-90 day receivables`, entity: "AR", dueDate: null });
  }
  for (const alert of vendorAlerts.filter(a => a.severity === "critical")) {
    actionItems.push({ priority: "critical", action: `${alert.vendorName}: ${alert.issues[0]}`, entity: "Vendor Compliance", dueDate: null });
  }
  if (missingLienWaivers.length > 0) {
    actionItems.push({ priority: "high", action: `${missingLienWaivers.length} pay app(s) missing lien waivers`, entity: "Lien Waivers", dueDate: null });
  }

  const payAppsDueSoon = payAppRows.filter(pa => {
    if (pa.status !== "draft" && pa.status !== "in_progress") return false;
    const periodEnd = new Date(pa.periodEnd);
    return daysBetween(now, periodEnd) <= 7 && daysBetween(now, periodEnd) >= 0;
  });
  for (const pa of payAppsDueSoon) {
    actionItems.push({ priority: "high", action: `Pay App #${pa.payAppNumber} due — ${projectMap.get(pa.projectId) || pa.projectId}`, entity: "Pay Apps", dueDate: pa.periodEnd.toISOString() });
  }

  let narrative = `Back office analysis: AR $${cashMetrics.totalReceivables.toLocaleString()}, AP $${cashMetrics.totalPayables.toLocaleString()}, net position $${cashMetrics.netPosition.toLocaleString()}. `;
  narrative += `AR days: ${arDays}. Retention held: $${cashMetrics.retentionHeld.toLocaleString()}. `;
  narrative += `${vendorAlerts.length} vendor compliance alert(s). ${missingLienWaivers.length} missing lien waiver(s). `;
  narrative += `${actionItems.length} action item(s) requiring attention.`;

  if (process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
    try {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 600,
        messages: [{
          role: "system",
          content: "You are a construction CFO assistant. Write a concise executive cash and compliance summary (2-4 paragraphs). Focus on cash risks, collections priorities, and compliance gaps. Use construction industry terminology."
        }, {
          role: "user",
          content: JSON.stringify({ cashMetrics, arAgingSummary: arAging, vendorAlertCount: vendorAlerts.length, missingWaiverCount: missingLienWaivers.length, actionItemCount: actionItems.length })
        }],
      });
      narrative = aiResponse.choices[0]?.message?.content || narrative;
    } catch (err) {
      console.error("BackOffice AI narrative error:", err);
    }
  }

  await auditService.logEvent({
    tenantId,
    eventType: "agent_run",
    actor: "HERBIE_BACKOFFICE",
    entityType: "agent_report",
    entityId: tenantId,
    afterJson: { agent: "backoffice", arTotal: cashMetrics.totalReceivables, apTotal: cashMetrics.totalPayables, vendorAlerts: vendorAlerts.length, actionItems: actionItems.length },
  });

  return {
    cashMetrics,
    arAging,
    apAging,
    retentionByProject,
    vendorAlerts,
    missingLienWaivers,
    actionItems,
    narrative,
    generatedAt: now.toISOString(),
  };
}
