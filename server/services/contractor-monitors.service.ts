import { db } from "../db";
import { projectTasks, approvalRequests } from "@shared/schema";
import { sql, eq, and } from "drizzle-orm";

export interface MonitorAlert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  entity: { type: string; id: string; label?: string; projectId?: string };
  message: string;
  action: string;
}

export interface MonitorResult {
  alerts: MonitorAlert[];
}

const DEFAULT_TENANT_ID = "blackhawk-default";

export async function monitorStalledRfis(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT r.id, r.rfi_number, r.subject, r.status, r.created_at, r.due_date,
      p.name as project_name, r.project_id,
      EXTRACT(DAY FROM NOW() - r.created_at)::int as age_days
    FROM rfis r
    LEFT JOIN projects p ON p.id = r.project_id
    WHERE r.tenant_id = ${tenantId}
      AND r.status NOT IN ('closed', 'answered', 'void')
      AND r.created_at < NOW() - INTERVAL '10 days'
    ORDER BY r.created_at ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => ({
    type: "stalled_rfi",
    severity: r.age_days > 20 ? "critical" as const : r.age_days > 14 ? "high" as const : "medium" as const,
    entity: { type: "rfi", id: r.id, label: `RFI #${r.rfi_number}: ${r.subject}`, projectId: r.project_id },
    message: `RFI #${r.rfi_number} on project "${r.project_name || "Unknown"}" has been open for ${r.age_days} days without resolution.`,
    action: "Follow up with assigned party and escalate if needed.",
  }));
  return { alerts };
}

export async function monitorOverdueSubmittals(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT s.id, s.submittal_number, s.name, s.status, s.created_at, s.submitted_at,
      p.name as project_name, s.project_id,
      EXTRACT(DAY FROM NOW() - COALESCE(s.submitted_at, s.created_at))::int as age_days
    FROM submittals s
    LEFT JOIN projects p ON p.id = s.project_id
    WHERE s.tenant_id = ${tenantId}
      AND s.status NOT IN ('approved', 'closed', 'void')
      AND COALESCE(s.submitted_at, s.created_at) < NOW() - INTERVAL '14 days'
    ORDER BY s.created_at ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => ({
    type: "overdue_submittal",
    severity: r.age_days > 30 ? "critical" as const : r.age_days > 21 ? "high" as const : "medium" as const,
    entity: { type: "submittal", id: r.id, label: `Submittal #${r.submittal_number}: ${r.name}`, projectId: r.project_id },
    message: `Submittal #${r.submittal_number} ("${r.name}") on project "${r.project_name || "Unknown"}" is overdue by ${r.age_days} days.`,
    action: "Review submittal status and follow up with reviewer.",
  }));
  return { alerts };
}

export async function monitorChangeOrderLag(tenantId: string = DEFAULT_TENANT_ID, thresholdDays: number = 14): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT co.id, co.co_number, co.title, co.status, co.amount, co.created_at, co.submitted_at,
      p.name as project_name, co.project_id,
      EXTRACT(DAY FROM NOW() - COALESCE(co.submitted_at, co.created_at))::int as age_days
    FROM change_orders co
    LEFT JOIN projects p ON p.id = co.project_id
    WHERE co.tenant_id = ${tenantId}
      AND co.status IN ('pending', 'in_review', 'submitted', 'draft')
      AND COALESCE(co.submitted_at, co.created_at) < NOW() - INTERVAL '1 day' * ${thresholdDays}
    ORDER BY co.created_at ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => ({
    type: "co_approval_lag",
    severity: r.age_days > thresholdDays * 2 ? "critical" as const : r.age_days > thresholdDays * 1.5 ? "high" as const : "medium" as const,
    entity: { type: "change_order", id: r.id, label: `CO #${r.co_number}: ${r.title}`, projectId: r.project_id },
    message: `Change Order #${r.co_number} ("${r.title}") on project "${r.project_name || "Unknown"}" has been pending for ${r.age_days} days. Amount: $${r.amount || "N/A"}.`,
    action: "Escalate CO approval to project owner or client.",
  }));
  return { alerts };
}

export async function monitorPayAppsDueSoon(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT pa.id, pa.pay_app_number, pa.status, pa.period_end, pa.net_payable,
      pa.submitted_at, pa.current_billed,
      p.name as project_name, pa.project_id,
      EXTRACT(DAY FROM pa.period_end - NOW())::int as days_until_due
    FROM pay_applications pa
    LEFT JOIN projects p ON p.id = pa.project_id
    WHERE pa.tenant_id = ${tenantId}
      AND pa.status NOT IN ('paid', 'approved', 'void')
      AND pa.period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    ORDER BY pa.period_end ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => ({
    type: "pay_app_due_soon",
    severity: r.days_until_due <= 2 ? "high" as const : "medium" as const,
    entity: { type: "pay_application", id: r.id, label: `Pay App #${r.pay_app_number}` },
    message: `Pay App #${r.pay_app_number} for project "${r.project_name || "Unknown"}" is due in ${r.days_until_due} days. Amount: $${r.net_payable || r.current_billed || "N/A"}.`,
    action: "Submit pay application before deadline.",
  }));
  return { alerts };
}

export async function monitorArAging(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT i.id, i.invoice_number, i.invoice_type, i.total_amount, i.paid_amount,
      i.due_date, i.status, i.vendor_id, i.client_id, i.project_id,
      EXTRACT(DAY FROM NOW() - i.due_date)::int as days_overdue
    FROM invoices i
    WHERE i.tenant_id = ${tenantId}
      AND i.status NOT IN ('paid', 'void', 'cancelled')
      AND i.due_date < NOW()
      AND i.due_date IS NOT NULL
    ORDER BY i.due_date ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows
    .filter((r: any) => r.days_overdue >= 45)
    .map((r: any) => {
      let severity: MonitorAlert["severity"] = "medium";
      if (r.days_overdue >= 90) severity = "critical";
      else if (r.days_overdue >= 60) severity = "high";

      const outstanding = r.total_amount && r.paid_amount
        ? (parseFloat(r.total_amount) - parseFloat(r.paid_amount)).toFixed(2)
        : r.total_amount || "N/A";

      return {
        type: "ar_aging",
        severity,
        entity: { type: "invoice", id: r.id, label: `Invoice #${r.invoice_number}` },
        message: `Invoice #${r.invoice_number} is ${r.days_overdue} days past due. Outstanding: $${outstanding}.`,
        action: r.days_overdue >= 90
          ? "Escalate to collections or senior management immediately."
          : r.days_overdue >= 60
            ? "Send formal demand letter and escalate."
            : "Send payment reminder and follow up.",
      };
    });
  return { alerts };
}

export async function monitorExpiringInsurance(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT cc.id, cc.certification_code, cc.certification_name, cc.expires_at,
      cc.status, cc.issuing_agency,
      EXTRACT(DAY FROM cc.expires_at - NOW())::int as days_until_expiry
    FROM company_certifications cc
    WHERE cc.tenant_id = ${tenantId}
      AND cc.expires_at IS NOT NULL
      AND cc.expires_at <= NOW() + INTERVAL '30 days'
      AND cc.status NOT IN ('revoked')
    ORDER BY cc.expires_at ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => {
    const expired = r.days_until_expiry <= 0;
    return {
      type: "insurance_expiring",
      severity: expired ? "critical" as const : r.days_until_expiry <= 7 ? "high" as const : "medium" as const,
      entity: { type: "company_certification", id: r.id, label: r.certification_name },
      message: expired
        ? `${r.certification_name} (${r.certification_code}) has EXPIRED. Issuer: ${r.issuing_agency || "N/A"}.`
        : `${r.certification_name} (${r.certification_code}) expires in ${r.days_until_expiry} days. Issuer: ${r.issuing_agency || "N/A"}.`,
      action: expired
        ? "Renew immediately to maintain compliance."
        : "Begin renewal process before expiration.",
    };
  });
  return { alerts };
}

export async function monitorMissingVendorDocs(tenantId: string = DEFAULT_TENANT_ID): Promise<MonitorResult> {
  const result = await db.execute(sql`
    SELECT v.id, v.company_name, v.vendor_number, v.status,
      v.tax_id, v.insurance_expires_at,
      CASE WHEN v.tax_id IS NULL OR v.tax_id = '' THEN true ELSE false END as missing_w9,
      CASE WHEN v.insurance_expires_at IS NULL THEN true
           WHEN v.insurance_expires_at < NOW() THEN true
           ELSE false END as missing_coi
    FROM vendors v
    WHERE v.tenant_id = ${tenantId}
      AND v.status = 'active'
      AND (
        v.tax_id IS NULL OR v.tax_id = ''
        OR v.insurance_expires_at IS NULL
        OR v.insurance_expires_at < NOW()
      )
    ORDER BY v.company_name ASC
  `);
  const rows = (result as any).rows || [];
  const alerts: MonitorAlert[] = rows.map((r: any) => {
    const issues: string[] = [];
    if (r.missing_w9 === true || r.missing_w9 === "t") issues.push("W-9");
    if (r.missing_coi === true || r.missing_coi === "t") issues.push("COI/Insurance");

    return {
      type: "missing_vendor_docs",
      severity: issues.length > 1 ? "high" as const : "medium" as const,
      entity: { type: "vendor", id: r.id, label: r.company_name },
      message: `Vendor "${r.company_name}" (${r.vendor_number}) is missing: ${issues.join(", ")}.`,
      action: "Request missing documentation from vendor to complete onboarding.",
    };
  });
  return { alerts };
}

async function materializeMonitorActions(tenantId: string, alerts: MonitorAlert[]): Promise<{ tasksCreated: number; approvalsCreated: number }> {
  let tasksCreated = 0;
  let approvalsCreated = 0;

  for (const alert of alerts) {
    if (alert.severity !== "critical" && alert.severity !== "high") continue;
    const projectId = alert.entity.projectId;
    if (!projectId) continue;

    const taskName = `[MONITOR] ${alert.type}: ${alert.message.slice(0, 80)}`;
    const existing = await db.select({ id: projectTasks.id }).from(projectTasks)
      .where(and(
        eq(projectTasks.tenantId, tenantId),
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.source, "monitor"),
        eq(projectTasks.name, taskName),
      ))
      .limit(1);

    if (existing.length === 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      await db.insert(projectTasks).values({
        tenantId,
        projectId,
        name: taskName,
        description: `${alert.message}\n\nRecommended action: ${alert.action}`,
        status: "not_started",
        priority: alert.severity === "critical" ? "urgent" : "high",
        source: "monitor",
        dueDate,
      });
      tasksCreated++;
    }

    if (alert.type === "co_approval_lag") {
      const existingApproval = await db.select({ id: approvalRequests.id }).from(approvalRequests)
        .where(and(
          eq(approvalRequests.tenantId, tenantId),
          eq(approvalRequests.entityType, "change_order"),
          eq(approvalRequests.entityId, alert.entity.id),
          eq(approvalRequests.status, "pending"),
        ))
        .limit(1);

      if (existingApproval.length === 0) {
        await db.insert(approvalRequests).values({
          tenantId,
          entityType: "change_order",
          entityId: alert.entity.id,
          actionType: "change_order_approval",
          requestedBy: "system-monitor",
          status: "pending",
          priority: alert.severity === "critical" ? "urgent" : "high",
          contextJson: { alertType: alert.type, message: alert.message, action: alert.action },
        });
        approvalsCreated++;
      }
    }
  }

  return { tasksCreated, approvalsCreated };
}

export async function runAllMonitors(tenantId: string = DEFAULT_TENANT_ID): Promise<{
  timestamp: string;
  tenantId: string;
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  monitors: Record<string, MonitorResult>;
  materialized: { tasksCreated: number; approvalsCreated: number };
}> {
  const [
    stalledRfis,
    overdueSubmittals,
    coLag,
    payAppsDue,
    arAging,
    expiringInsurance,
    missingDocs,
  ] = await Promise.all([
    monitorStalledRfis(tenantId),
    monitorOverdueSubmittals(tenantId),
    monitorChangeOrderLag(tenantId),
    monitorPayAppsDueSoon(tenantId),
    monitorArAging(tenantId),
    monitorExpiringInsurance(tenantId),
    monitorMissingVendorDocs(tenantId),
  ]);

  const monitors: Record<string, MonitorResult> = {
    stalledRfis,
    overdueSubmittals,
    coLag,
    payAppsDue,
    arAging,
    expiringInsurance,
    missingDocs,
  };

  const allAlerts = Object.values(monitors).flatMap(m => m.alerts);
  const summary = {
    total: allAlerts.length,
    critical: allAlerts.filter(a => a.severity === "critical").length,
    high: allAlerts.filter(a => a.severity === "high").length,
    medium: allAlerts.filter(a => a.severity === "medium").length,
    low: allAlerts.filter(a => a.severity === "low").length,
  };

  const materialized = await materializeMonitorActions(tenantId, allAlerts);

  return {
    timestamp: new Date().toISOString(),
    tenantId,
    summary,
    monitors,
    materialized,
  };
}
