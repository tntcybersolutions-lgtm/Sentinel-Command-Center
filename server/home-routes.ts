// ============================================================================
// home-routes.ts — endpoints for the redesigned Home page
// ----------------------------------------------------------------------------
// Endpoints powering the redesigned home-assistant.tsx page:
//
//   GET /api/herbie/brief          → one-line summary banner
//   GET /api/home/money-this-week  → Pay Apps / Lien Waivers / Invoices / Bills
//   GET /api/calendar/this-week    → 7-day calendar strip
//   GET /api/home/project-health   → projects + computed risk score for the cards
//
// Each endpoint is failure-tolerant: it returns a benign empty/skeleton shape
// if a query throws, so the UI never crashes.
// ============================================================================

import type { Express, Request, Response } from "express";
import { db } from "./db";
import {
  payApplications,
  invoices,
  calendarEvents,
  projects,
} from "@shared/schema";
import { and, eq, gte, lte, lt, ne, sql, inArray } from "drizzle-orm";

const DEFAULT_TENANT_ID = "blackhawk-default";
function getTenantId(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface HerbieBrief {
  summary: string;
  href?: string;
  severity?: "critical" | "high" | "medium" | "low" | "info";
}

interface MoneyThisWeek {
  payAppsDueCount?: number;
  payAppsDueTotal?: number;
  lienWaiversOutstandingCount?: number;
  lienWaiversOutstandingOldestDays?: number;
  invoicesOverdueCount?: number;
  invoicesOverdueTotal?: number;
  billsDueWeekCount?: number;
  billsDueWeekTotal?: number;
}

interface DayEvent {
  id?: string;
  label: string;
  amount?: number;
  projectName?: string;
  type?: string;
}
interface ThisWeekDay { date: string; weekday: string; day: number; events: DayEvent[]; }

interface ProjectHealthCard {
  id: string;
  name?: string;
  projectName?: string;
  projectNumber?: string;
  status?: string;
  contractValue?: number;
  completionPercentage?: number;
  riskScore?: number;
  topIssue?: string;
  nextDeadlineLabel?: string;
}

// ── /api/herbie/brief ─────────────────────────────────────────────────────────

async function getHerbieBrief(req: Request): Promise<HerbieBrief> {
  try {
    const base = process.env.SELF_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
    const res = await fetch(`${base}/api/herbie/digest`);
    if (!res.ok) throw new Error("digest unavailable");
    const data = await res.json();
    const totals = data?.totals ?? {};
    const critical = totals.critical ?? 0;
    const high = totals.high ?? 0;
    const urgent = critical + high;

    if (urgent === 0) {
      return {
        summary: "Everything's current. No urgent items flagged.",
        href: "/herbie-digest",
        severity: "info",
      };
    }

    const bits: string[] = [];
    if (critical > 0) bits.push(`${critical} critical`);
    if (high > 0) bits.push(`${high} high-priority`);
    return {
      summary: `Herbie flagged ${urgent} urgent item${urgent !== 1 ? "s" : ""} — ${bits.join(", ")}.`,
      href: "/herbie-digest",
      severity: critical > 0 ? "critical" : "high",
    };
  } catch {
    return {
      summary: "Herbie's still warming up — check the full digest for details.",
      href: "/herbie-digest",
      severity: "info",
    };
  }
}

// ── /api/home/money-this-week ─────────────────────────────────────────────────
// Real Drizzle queries against payApplications, invoices, and project_lien_waivers.

async function getMoneyThisWeek(req: Request): Promise<MoneyThisWeek> {
  const tenantId = getTenantId(req);
  const out: MoneyThisWeek = {};

  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);

  // Pay Apps Due this week — submitted but not yet paid, with periodEnd in past or next 7d.
  try {
    const payApps = await db.select({ amount: payApplications.netPayable })
      .from(payApplications)
      .where(and(
        eq(payApplications.tenantId, tenantId),
        ne(payApplications.status, "paid"),
        ne(payApplications.status, "draft"),
        lte(payApplications.periodEnd, weekEnd),
      ));
    out.payAppsDueCount = payApps.length;
    out.payAppsDueTotal = payApps.reduce((s, r) => s + Number(r.amount || 0), 0);
  } catch (e) {
    console.error("[money-this-week] payApps query failed:", (e as Error)?.message);
  }

  // Lien Waivers Outstanding — project_lien_waivers with status='missing'. Raw SQL since
  // this table isn't declared in shared/schema.ts.
  try {
    const rows: any = await db.execute(sql`
      SELECT id, created_at
      FROM project_lien_waivers
      WHERE tenant_id = ${tenantId}
        AND status = 'missing'
    `);
    const arr: any[] = rows?.rows || [];
    out.lienWaiversOutstandingCount = arr.length;
    if (arr.length > 0) {
      const ages = arr
        .map((r: any) => (Date.now() - new Date(r.created_at).getTime()) / 86_400_000)
        .filter((n: number) => Number.isFinite(n));
      if (ages.length > 0) {
        out.lienWaiversOutstandingOldestDays = Math.floor(Math.max(...ages));
      }
    }
  } catch (e) {
    console.error("[money-this-week] lien waivers query failed:", (e as Error)?.message);
  }

  // Invoices Overdue (AR) — receivable, not paid, dueDate in the past.
  try {
    const ar = await db.select({
      amount: invoices.totalAmount,
      paid: invoices.paidAmount,
    })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.invoiceType, "receivable"),
        ne(invoices.status, "paid"),
        lt(invoices.dueDate, now),
      ));
    out.invoicesOverdueCount = ar.length;
    out.invoicesOverdueTotal = ar.reduce((s, r) => s + (Number(r.amount || 0) - Number(r.paid || 0)), 0);
  } catch (e) {
    console.error("[money-this-week] invoices query failed:", (e as Error)?.message);
  }

  // Bills Due This Week (AP) — payable invoices due in [now, now+7d], not paid.
  try {
    const bills = await db.select({
      amount: invoices.totalAmount,
      paid: invoices.paidAmount,
    })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        eq(invoices.invoiceType, "payable"),
        ne(invoices.status, "paid"),
        gte(invoices.dueDate, now),
        lte(invoices.dueDate, weekEnd),
      ));
    out.billsDueWeekCount = bills.length;
    out.billsDueWeekTotal = bills.reduce((s, r) => s + (Number(r.amount || 0) - Number(r.paid || 0)), 0);
  } catch (e) {
    console.error("[money-this-week] bills query failed:", (e as Error)?.message);
  }

  return out;
}

// ── /api/calendar/this-week ──────────────────────────────────────────────────
// Real Drizzle query against calendarEvents within today..today+7d.

async function getThisWeek(req: Request): Promise<ThisWeekDay[]> {
  const tenantId = getTenantId(req);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);

  const days: ThisWeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
      day: d.getDate(),
      events: [],
    });
  }

  try {
    const events = await db.select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      eventType: calendarEvents.eventType,
      startAt: calendarEvents.startAt,
      projectId: calendarEvents.projectId,
    })
      .from(calendarEvents)
      .where(and(
        eq(calendarEvents.tenantId, tenantId),
        gte(calendarEvents.startAt, today),
        lt(calendarEvents.startAt, weekEnd),
        ne(calendarEvents.status, "cancelled"),
      ));

    for (const ev of events) {
      const dateKey = new Date(ev.startAt).toISOString().slice(0, 10);
      const slot = days.find(d => d.date === dateKey);
      if (slot) {
        slot.events.push({
          id: ev.id,
          label: ev.title,
          type: ev.eventType,
        });
      }
    }
  } catch (e) {
    console.error("[this-week] calendar query failed:", (e as Error)?.message);
  }

  return days;
}

// ── /api/home/project-health ─────────────────────────────────────────────────
// Returns active projects with a computed riskScore (0–100, higher = more risk)
// and an optional one-line topIssue. Drives the Project Health card board.
//
// Risk-score model (additive, baseline 30):
//   margin < 0           → +35
//   margin < 5%          → +25
//   margin < 10%         → +15
//   margin < 15%         → +5
//   margin >= 15%        → -5
//   past expectedEndDate → +25
//   actualCosts > 95% of contract → +20
//   actualCosts > 80% of contract → +10
//   < 30 days to deadline AND completion < 70% → +15
// Clamped to [0,100].

async function getProjectHealth(req: Request): Promise<ProjectHealthCard[]> {
  const tenantId = getTenantId(req);
  try {
    const rows = await db.select({
      id: projects.id,
      name: projects.name,
      projectNumber: projects.projectNumber,
      status: projects.status,
      contractValue: projects.contractValue,
      actualCosts: projects.actualCosts,
      completionPercentage: projects.completionPercentage,
      grossProfit: projects.grossProfit,
      expectedEndDate: projects.expectedEndDate,
    })
      .from(projects)
      .where(and(
        eq(projects.tenantId, tenantId),
        inArray(projects.status, [
          "planning",
          "pre_construction",
          "active",
          "in_progress",
          "construction",
          "punch_list",
        ]),
      ));

    const out: ProjectHealthCard[] = rows.map(r => {
      const contractVal = Number(r.contractValue || 0);
      const actualCosts = Number(r.actualCosts || 0);
      const completionPct = Number(r.completionPercentage || 0);
      const grossProfit = Number(r.grossProfit || 0);
      const margin = contractVal > 0 ? grossProfit / contractVal : 0;

      let risk = 30;
      if (margin < 0) risk += 35;
      else if (margin < 0.05) risk += 25;
      else if (margin < 0.10) risk += 15;
      else if (margin < 0.15) risk += 5;
      else risk -= 5;

      const dueSoon = r.expectedEndDate ? new Date(r.expectedEndDate) : null;
      const nowMs = Date.now();
      if (dueSoon && dueSoon.getTime() < nowMs) {
        risk += 25;
      }
      if (contractVal > 0 && actualCosts > contractVal * 0.95) {
        risk += 20;
      } else if (contractVal > 0 && actualCosts > contractVal * 0.80) {
        risk += 10;
      }
      if (dueSoon) {
        const daysLeft = (dueSoon.getTime() - nowMs) / 86_400_000;
        if (daysLeft > 0 && daysLeft < 30 && completionPct < 70) risk += 15;
      }

      const riskScore = Math.max(0, Math.min(100, Math.round(risk)));

      let topIssue: string | undefined;
      if (margin < 0) {
        topIssue = `Negative margin (${(margin * 100).toFixed(1)}%)`;
      } else if (dueSoon && dueSoon.getTime() < nowMs) {
        topIssue = "Past expected end date";
      } else if (contractVal > 0 && actualCosts > contractVal * 0.95) {
        topIssue = "Cost overrun risk";
      } else if (margin < 0.05 && contractVal > 0) {
        topIssue = `Thin margin (${(margin * 100).toFixed(1)}%)`;
      }

      let nextDeadlineLabel: string | undefined;
      if (dueSoon) {
        const daysLeft = Math.round((dueSoon.getTime() - nowMs) / 86_400_000);
        if (daysLeft > 0 && daysLeft < 60) {
          nextDeadlineLabel = `Expected complete in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`;
        } else if (daysLeft < 0) {
          nextDeadlineLabel = `Past due by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""}`;
        }
      }

      return {
        id: r.id,
        name: r.name,
        projectName: r.name,
        projectNumber: r.projectNumber,
        status: r.status,
        contractValue: contractVal,
        completionPercentage: completionPct,
        riskScore,
        topIssue,
        nextDeadlineLabel,
      };
    });

    out.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
    return out;
  } catch (e) {
    console.error("[project-health] query failed:", (e as Error)?.message);
    return [];
  }
}

// ── Registration ─────────────────────────────────────────────────────────────

export function registerHomeRoutes(app: Express) {
  app.get("/api/herbie/brief", async (req: Request, res: Response) => {
    try {
      res.json(await getHerbieBrief(req));
    } catch {
      res.json({
        summary: "Herbie's still warming up — check the full digest for details.",
        href: "/herbie-digest",
        severity: "info",
      } satisfies HerbieBrief);
    }
  });

  app.get("/api/home/money-this-week", async (req: Request, res: Response) => {
    try {
      res.json(await getMoneyThisWeek(req));
    } catch {
      res.json({});
    }
  });

  app.get("/api/calendar/this-week", async (req: Request, res: Response) => {
    try {
      res.json(await getThisWeek(req));
    } catch {
      res.json([]);
    }
  });

  app.get("/api/home/project-health", async (req: Request, res: Response) => {
    try {
      res.json(await getProjectHealth(req));
    } catch {
      res.json([]);
    }
  });
}
