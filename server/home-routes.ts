// ============================================================================
// home-routes.ts — endpoints for the redesigned Home page
// ----------------------------------------------------------------------------
// Three new endpoints that power the redesigned home-assistant.tsx page:
//
//   GET /api/herbie/brief         → one-line summary banner
//   GET /api/home/money-this-week → Pay Apps / Lien Waivers / Invoices / Bills
//   GET /api/calendar/this-week   → 7-day calendar strip
//
// All three are intentionally SAFE: each returns a valid empty-but-correctly-
// shaped response if data isn't available. The home page renders gracefully
// with "--" placeholders in that case — nothing breaks.
//
// Wire in server/index.ts (or wherever you register routes):
//
//     import { registerHomeRoutes } from "./home-routes";
//     registerHomeRoutes(app);
//
// Real DB queries are marked TODO. They're easy to add once you decide which
// tables to source from (see comments). The shapes are stable — wiring
// real data won't break the UI.
// ============================================================================

import type { Express, Request, Response } from "express";

// ── Types (mirror what the home page expects) ──────────────────────────────────

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

// ── /api/herbie/brief ─────────────────────────────────────────────────────────────────
// One-line summary banner at the top of the home page.
// Today: builds a brief from the existing /api/herbie/digest totals.
// Later: replace with a real Herbie LLM call that summarizes urgents + money +
// schedule risks into a single natural-language sentence.

async function getHerbieBrief(req: Request): Promise<HerbieBrief> {
  try {
    // Re-use existing digest endpoint output. Adjust hostname if needed.
    // In production this should be a direct DB query, not an internal fetch.
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

// ── /api/home/money-this-week ─────────────────────────────────────────────────────────
// Money-shaped scorecard. Pulls from financials tables. All four fields are
// optional in the response shape — undefined renders as "--" in the UI.
//
// TODO: replace each block with the real Drizzle query against your schema.
//       Tables to source from (best guesses from your schema.ts):
//         - bidProjects        for pay-app pipeline (or a payApps table if you have one)
//         - your invoices/AR table
//         - your bills/AP table
//         - your lienWaivers table (if you've added one — server/lien-waivers.ts hints yes)
//
// The fallback below returns an empty object so the UI shows "--" everywhere.
// Replace per-section as you wire real queries in; each is independent.

async function getMoneyThisWeek(req: Request): Promise<MoneyThisWeek> {
  const out: MoneyThisWeek = {};

  // -- Pay Apps Due this week ---------------------------------------------
  // TODO: query pay-app records where dueDate in [today, today+7d] and status != paid
  // Example shape:
  //   const rows = await db.select({...}).from(payApps).where(...);
  //   out.payAppsDueCount = rows.length;
  //   out.payAppsDueTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // -- Lien Waivers Outstanding -------------------------------------------
  // TODO: query lien_waivers where status in ('sent','requested') and signedAt IS NULL
  //   out.lienWaiversOutstandingCount = rows.length;
  //   const oldest = rows.map(r => Date.now() - new Date(r.createdAt).getTime())
  //                      .sort((a,b) => b - a)[0];
  //   out.lienWaiversOutstandingOldestDays = Math.floor(oldest / 86_400_000);

  // -- Invoices Overdue ---------------------------------------------------
  // TODO: query AR invoices where dueDate < now and status != paid
  //   out.invoicesOverdueCount = rows.length;
  //   out.invoicesOverdueTotal = rows.reduce((s, r) => s + Number(r.balance ?? 0), 0);

  // -- Bills Due This Week ------------------------------------------------
  // TODO: query AP bills where dueDate in [today, today+7d] and status != paid
  //   out.billsDueWeekCount = rows.length;
  //   out.billsDueWeekTotal = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return out;
}

// ── /api/calendar/this-week ─────────────────────────────────────────────────────────────
// 7-day strip starting today. Pulls from calendarEvents table.
// TODO: query calendarEvents where eventDate between today and today+7d, group by day.
//       Map each event to { label, amount?, projectName?, type? }.

async function getThisWeek(req: Request): Promise<ThisWeekDay[]> {
  // Build a 7-day skeleton starting today
  const days: ThisWeekDay[] = [];
  const today = new Date();
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

  // TODO: query calendarEvents within the 7-day window and slot them into days.
  //   const start = days[0].date;
  //   const end = days[6].date;
  //   const rows = await db.select(...).from(calendarEvents)
  //     .where(and(gte(calendarEvents.eventDate, start), lte(calendarEvents.eventDate, end)));
  //   for (const row of rows) {
  //     const slot = days.find(d => d.date === row.eventDate.toISOString().slice(0,10));
  //     if (slot) slot.events.push({
  //       id: row.id, label: row.title, amount: row.amount, projectName: row.projectName, type: row.eventType,
  //     });
  //   }

  return days;
}

// ── Registration ───────────────────────────────────────────────────────────────────────────────────────

export function registerHomeRoutes(app: Express) {
  app.get("/api/herbie/brief", async (req: Request, res: Response) => {
    try {
      const out = await getHerbieBrief(req);
      res.json(out);
    } catch (err) {
      // Never break the home page over this — return a benign brief.
      res.json({
        summary: "Herbie's still warming up — check the full digest for details.",
        href: "/herbie-digest",
        severity: "info",
      } satisfies HerbieBrief);
    }
  });

  app.get("/api/home/money-this-week", async (req: Request, res: Response) => {
    try {
      const out = await getMoneyThisWeek(req);
      res.json(out);
    } catch (err) {
      res.json({}); // empty object → UI renders "--" placeholders
    }
  });

  app.get("/api/calendar/this-week", async (req: Request, res: Response) => {
    try {
      const out = await getThisWeek(req);
      res.json(out);
    } catch (err) {
      res.json([]); // empty array → UI renders the 7-day skeleton
    }
  });
}
