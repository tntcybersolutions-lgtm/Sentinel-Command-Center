// ============================================================================
// sprint4-routes.ts — Mobile PWA data + Web Push + Drawings
// ----------------------------------------------------------------------------
// Endpoints:
//   GET  /api/home/risk-score
//   GET  /api/home/today
//   POST /api/projects/:id/daily-log         (alias to plural daily-logs table)
//   POST /api/push/subscribe
//   DELETE /api/push/subscribe
//   POST /api/push/test
//   GET  /api/push/vapid-public-key
//   GET  /api/projects/:id/drawings
//   POST /api/projects/:id/drawings
//   GET  /api/drawings/:id/pins
//   POST /api/drawings/:id/pins
//   DELETE /api/drawings/:drawingId/pins/:pinId
//
// All POST routes honor `Idempotency-Key` (10 min in-memory dedup, 2k cap).
// Risk/today reuse `my-day-scoring.service.ts` for severity bands so the
// mobile Today list is consistent with the desktop scoring rules.
// ============================================================================
import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  approvalRequests,
  rfis,
  projectDailyLogs,
  projectPhotos,
  payApplications,
  invoices,
  pushSubscriptions,
  drawings,
  drawingPins,
  type DrawingPin,
  type Drawing,
  type ProjectDailyLog,
  type PushSubscription,
} from "@shared/schema";
import { scoreItem, type WorkItem, type ScoringContext } from "./services/my-day-scoring.service";

// ── Tenant / user resolution ─────────────────────────────────────────────────
type AuthedRequest = Request & { user?: { id?: string; tenantId?: string } };
const DEFAULT_TENANT_ID = "blackhawk-default";
function getTenantId(req: Request): string {
  const u = (req as AuthedRequest).user;
  return u?.tenantId || DEFAULT_TENANT_ID;
}
function getUserId(req: Request): string | null {
  const u = (req as AuthedRequest).user;
  return u?.id || null;
}

// ── Idempotency cache ────────────────────────────────────────────────────────
interface IdemEntry { at: number; status: number; body: unknown; }
const IDEM = new Map<string, IdemEntry>();
const IDEM_TTL_MS = 10 * 60 * 1000;
function idemGet(key: string | null): IdemEntry | null {
  if (!key) return null;
  const hit = IDEM.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > IDEM_TTL_MS) { IDEM.delete(key); return null; }
  return hit;
}
function idemSet(key: string | null, status: number, body: unknown): void {
  if (!key) return;
  if (IDEM.size > 2000) {
    const cutoff = Date.now() - IDEM_TTL_MS;
    for (const [k, v] of IDEM) if (v.at < cutoff) IDEM.delete(k);
  }
  IDEM.set(key, { at: Date.now(), status, body });
}
function idemKey(req: Request): string | null {
  const h = req.header("Idempotency-Key") || req.header("idempotency-key");
  return typeof h === "string" && h.length > 0 && h.length < 200 ? h : null;
}

// ── Lazy web-push init ───────────────────────────────────────────────────────
type WebPushModule = typeof import("web-push");
let webPushClient: WebPushModule | null = null;
let webPushReady = false;
async function getWebPush(): Promise<WebPushModule | null> {
  if (webPushReady) return webPushClient;
  webPushReady = true;
  try {
    // Support task-spec names (PUSH_VAPID_*) plus legacy aliases (VAPID_*).
    const pub = process.env.PUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.PUSH_VAPID_PRIVATE || process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.PUSH_VAPID_SUBJECT || process.env.VAPID_SUBJECT || "mailto:ops@blackhawkconstruction.com";
    if (!pub || !priv) {
      console.warn("[sprint4] VAPID keys missing — push disabled");
      return null;
    }
    const wp = await import("web-push");
    wp.setVapidDetails(subj, pub, priv);
    webPushClient = wp;
    return wp;
  } catch (err) {
    console.warn("[sprint4] web-push init failed:", (err as Error)?.message);
    return null;
  }
}

// ── Severity helper backed by my-day scoring ─────────────────────────────────
type Severity = "critical" | "warning" | "info" | "neutral";
function severityFromScore(score: number, band: WorkItem["revenue_tier"] | string): Severity {
  if (band === "critical" || score >= 60) return "critical";
  if (score >= 40) return "warning";
  if (score >= 20) return "info";
  return "neutral";
}

// ── /api/home/risk-score ─────────────────────────────────────────────────────
async function computeRiskScore(tenantId: string) {
  const today = new Date();
  const past90 = new Date(today.getTime() - 90 * 24 * 3600 * 1000);

  let amount = 0;
  let spark: number[] = [];
  let delta7d = 0;
  try {
    const overdue = await db.select({
      total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        sql`${invoices.dueDate} < NOW() - INTERVAL '60 days'`,
        sql`${invoices.status} <> 'paid'`,
      ));
    amount = Number(overdue[0]?.total ?? 0);
  } catch { /* table or column may not exist in some envs */ }

  try {
    const rows = await db.select({
      d: sql<string>`DATE_TRUNC('day', ${invoices.createdAt})`,
      total: sql<number>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenantId),
        gte(invoices.createdAt, past90),
      ))
      .groupBy(sql`DATE_TRUNC('day', ${invoices.createdAt})`)
      .orderBy(sql`DATE_TRUNC('day', ${invoices.createdAt})`);
    spark = rows.slice(-12).map((r) => Number(r.total ?? 0));
    if (spark.length === 0) spark = [0];
    const last7 = rows.slice(-7).reduce((a, r) => a + Number(r.total ?? 0), 0);
    const prev7 = rows.slice(-14, -7).reduce((a, r) => a + Number(r.total ?? 0), 0);
    delta7d = Math.round(last7 - prev7);
  } catch { /* ignore */ }

  const score = Math.max(20, Math.min(100, 100 - Math.round(amount / 10000)));
  const suggestion = amount > 0
    ? `Push collections — $${amount.toLocaleString()} aging past 60d.`
    : "AR is healthy. Consider pulling forward upcoming pay apps.";

  return { amount, spark: spark.length ? spark : [0], delta7d, score, suggestion };
}

// ── /api/home/today ──────────────────────────────────────────────────────────
interface TodayRow {
  id: string;
  severity: Severity;
  title: string;
  subtitle?: string;
  badge?: string;
  href?: string;
  score?: number;
}

async function computeToday(tenantId: string, _userId: string | null): Promise<TodayRow[]> {
  const out: TodayRow[] = [];
  const now = new Date();
  const ctx: ScoringContext = { nowIso: now.toISOString() };
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);

  // NOTE: project-level scoping is a no-op until a project_members table
  // exists. Once present, filter all queries below by the user's project IDs.

  try {
    const approvals = await db.select()
      .from(approvalRequests)
      .where(and(
        eq(approvalRequests.tenantId, tenantId),
        eq(approvalRequests.status, "pending"),
      ))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(3);
    if (approvals.length > 0) {
      const a = approvals[0];
      const item: WorkItem = {
        id: "approvals",
        type: "approval",
        title: `${approvals.length} approval(s) pending`,
        created_ts: a.createdAt?.toISOString() || now.toISOString(),
        due_ts: null,
        revenue_tier: approvals.length > 2 ? "high" : "medium",
        status: "pending",
      };
      const r = scoreItem(item, ctx);
      out.push({
        id: "approvals",
        severity: severityFromScore(r.score, r.band),
        title: `${approvals.length} approval${approvals.length === 1 ? "" : "s"} pending`,
        subtitle: a.entityType,
        badge: String(approvals.length),
        href: "/approvals",
        score: r.score,
      });
    }
  } catch { /* ignore */ }

  try {
    const dueRfis = await db.select()
      .from(rfis)
      .where(and(
        eq(rfis.tenantId, tenantId),
        sql`${rfis.dueDate} IS NOT NULL`,
        lte(rfis.dueDate, in24h),
        sql`${rfis.status} NOT IN ('answered','closed')`,
      ))
      .limit(3);
    for (const r of dueRfis) {
      const due = r.dueDate as Date | null;
      const mins = due ? Math.max(0, Math.round((due.getTime() - now.getTime()) / 60000)) : 0;
      const item: WorkItem = {
        id: r.id,
        type: "rfi",
        title: r.subject || `RFI #${r.rfiNumber}`,
        created_ts: r.createdAt?.toISOString() || now.toISOString(),
        due_ts: due ? due.toISOString() : null,
        revenue_tier: mins < 60 ? "high" : "medium",
        status: r.status || "open",
      };
      const sr = scoreItem(item, ctx);
      out.push({
        id: `rfi-${r.id}`,
        severity: severityFromScore(sr.score, sr.band),
        title: `RFI #${r.rfiNumber} due in ${mins < 60 ? mins + "m" : Math.round(mins / 60) + "h"}`,
        subtitle: r.subject || undefined,
        href: "/execution/rfis",
        score: sr.score,
      });
    }
  } catch { /* ignore */ }

  try {
    const newPhotos = await db.select({ count: sql<number>`COUNT(*)` })
      .from(projectPhotos)
      .where(and(
        eq(projectPhotos.tenantId, tenantId),
        gte(projectPhotos.createdAt, new Date(now.getTime() - 24 * 3600 * 1000)),
        sql`(${projectPhotos.caption} IS NULL OR ${projectPhotos.caption} = '')`,
      ));
    const c = Number(newPhotos[0]?.count ?? 0);
    if (c > 0) {
      out.push({
        id: "photos-pending",
        severity: "neutral",
        title: `${c} photo${c === 1 ? "" : "s"} awaiting review`,
        subtitle: "Tap to caption",
      });
    }
  } catch { /* ignore */ }

  try {
    const wkAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    const pa = await db.select({ count: sql<number>`COUNT(*)` })
      .from(payApplications)
      .where(and(
        eq(payApplications.tenantId, tenantId),
        sql`${payApplications.periodEnd} BETWEEN NOW() AND ${wkAhead}`,
        sql`${payApplications.status} NOT IN ('paid','approved')`,
      ));
    const c = Number(pa[0]?.count ?? 0);
    if (c > 0) {
      out.push({
        id: "payapps-week",
        severity: "info",
        title: `${c} pay app${c === 1 ? "" : "s"} due this week`,
        href: "/financial/overview",
      });
    }
  } catch { /* ignore */ }

  if (out.length === 0) {
    out.push({
      id: "all-clear",
      severity: "neutral",
      title: "Nothing urgent — caught up.",
      subtitle: "Herbie will alert you when something changes.",
    });
  }
  return out;
}

// ── Routes ───────────────────────────────────────────────────────────────────
export function registerSprint4Routes(app: Express): void {
  app.get("/api/home/risk-score", async (req: Request, res: Response) => {
    try {
      const data = await computeRiskScore(getTenantId(req));
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json(data);
    } catch (e) {
      console.error("[sprint4] risk-score failed", e);
      res.status(500).json({ error: "risk-score failed" });
    }
  });

  app.get("/api/home/today", async (req: Request, res: Response) => {
    try {
      const data = await computeToday(getTenantId(req), getUserId(req));
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json(data);
    } catch (e) {
      console.error("[sprint4] today failed", e);
      res.status(500).json({ error: "today failed" });
    }
  });

  // POST /api/projects/:id/daily-log → alias to existing plural module
  app.post("/api/projects/:id/daily-log", async (req: Request, res: Response) => {
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const tenantId = getTenantId(req);
      const projectId = String(req.params.id);
      const { title, notes, text, logDate, weather } = (req.body ?? {}) as Record<string, unknown>;
      const finalTitle = (typeof title === "string" && title.trim())
        || (typeof text === "string" && text.trim().slice(0, 80))
        || `Voice log — ${new Date().toLocaleString()}`;
      const finalNotes = (typeof notes === "string" && notes) || (typeof text === "string" ? text : null);
      const ld = typeof logDate === "string" && logDate ? new Date(logDate) : new Date();
      const rows: ProjectDailyLog[] = await db.insert(projectDailyLogs).values({
        tenantId,
        projectId,
        title: String(finalTitle),
        notes: finalNotes as string | null,
        weather: typeof weather === "string" ? weather : null,
        logDate: ld,
      }).returning();
      const row = rows[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e) {
      console.error("[sprint4] daily-log failed", e);
      res.status(500).json({ error: "daily-log failed" });
    }
  });

  // ── Push ───────────────────────────────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({
      publicKey: process.env.PUSH_VAPID_PUBLIC || process.env.VAPID_PUBLIC_KEY || null,
    });
  });

  // Explicit authz gate for push routes: in production we require an
  // authenticated user so anonymous callers cannot subscribe arbitrary
  // endpoints to the default tenant. Dev/test still allows the default
  // tenant fallback for smoke testing without auth middleware mounted.
  function requirePushAuthz(req: Request, res: Response): boolean {
    const userId = getUserId(req);
    const isProd = process.env.NODE_ENV === "production";
    if (isProd && !userId) {
      res.status(401).json({ error: "authentication required for push" });
      return false;
    }
    return true;
  }

  app.post("/api/push/subscribe", async (req: Request, res: Response) => {
    if (!requirePushAuthz(req, res)) return;
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const tenantId = getTenantId(req);
      const userId = getUserId(req);
      const { endpoint, keys } = (req.body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "endpoint + keys.p256dh + keys.auth required" });
      }
      const ua = req.header("user-agent") || null;
      const existing: PushSubscription[] = await db.select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
        .limit(1);
      let body: { ok: true; id: string; updated: boolean };
      if (existing.length > 0) {
        await db.update(pushSubscriptions)
          .set({ p256dh: keys.p256dh, auth: keys.auth, userAgent: ua, lastSeenAt: new Date(), tenantId, userId })
          .where(eq(pushSubscriptions.id, existing[0].id));
        body = { ok: true, id: existing[0].id, updated: true };
      } else {
        const rows: PushSubscription[] = await db.insert(pushSubscriptions).values({
          tenantId, userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua,
        }).returning();
        body = { ok: true, id: rows[0].id, updated: false };
      }
      idemSet(key, 200, body);
      res.json(body);
    } catch (e) {
      console.error("[sprint4] subscribe failed", e);
      res.status(500).json({ error: "subscribe failed" });
    }
  });

  app.delete("/api/push/subscribe", async (req: Request, res: Response) => {
    if (!requirePushAuthz(req, res)) return;
    try {
      const { endpoint } = (req.body ?? {}) as { endpoint?: string };
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
      res.json({ ok: true });
    } catch (e) {
      console.error("[sprint4] unsubscribe failed", e);
      res.status(500).json({ error: "unsubscribe failed" });
    }
  });

  app.post("/api/push/test", async (req: Request, res: Response) => {
    if (!requirePushAuthz(req, res)) return;
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const wp = await getWebPush();
      if (!wp) return res.status(503).json({ error: "VAPID keys not configured" });
      const tenantId = getTenantId(req);
      const subs: PushSubscription[] = await db.select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.tenantId, tenantId));
      const reqBody = (req.body ?? {}) as { title?: string; body?: string; url?: string };
      const payload = JSON.stringify({
        title: reqBody.title || "Sentinel test",
        body: reqBody.body || "Push notifications are wired up.",
        url: reqBody.url || "/home",
      });
      let sent = 0; let failed = 0; const stale: string[] = [];
      for (const s of subs) {
        try {
          await wp.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch (err) {
          failed += 1;
          const code = (err as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) stale.push(s.endpoint);
        }
      }
      if (stale.length > 0) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, stale));
      }
      const body = { sent, failed, pruned: stale.length };
      idemSet(key, 200, body);
      res.json(body);
    } catch (e) {
      console.error("[sprint4] push test failed", e);
      res.status(500).json({ error: "push test failed" });
    }
  });

  // ── Drawings ───────────────────────────────────────────────────────────────
  app.get("/api/projects/:id/drawings", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const rows: Drawing[] = await db.select().from(drawings).where(and(
        eq(drawings.tenantId, tenantId),
        eq(drawings.projectId, String(req.params.id)),
      )).orderBy(desc(drawings.createdAt));
      res.json(rows);
    } catch (e) {
      console.error("[sprint4] drawings list failed", e);
      res.status(500).json({ error: "drawings list failed" });
    }
  });

  app.post("/api/projects/:id/drawings", async (req: Request, res: Response) => {
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const tenantId = getTenantId(req);
      const projectId = String(req.params.id);
      const { title, sheet, discipline, fileUrl, pageCount } = (req.body ?? {}) as Record<string, unknown>;
      if (!title || !fileUrl) return res.status(400).json({ error: "title + fileUrl required" });
      const urlStr = String(fileUrl);
      try {
        const u = new URL(urlStr);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          return res.status(400).json({ error: "fileUrl must be http(s)" });
        }
        const host = u.hostname.toLowerCase();
        if (
          host === "localhost" || host === "0.0.0.0" || host === "::1" ||
          host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") ||
          /^169\.254\./.test(host) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        ) {
          return res.status(400).json({ error: "fileUrl host not allowed" });
        }
      } catch {
        return res.status(400).json({ error: "fileUrl is not a valid URL" });
      }
      const rows: Drawing[] = await db.insert(drawings).values({
        tenantId,
        projectId,
        title: String(title),
        sheet: sheet ? String(sheet) : null,
        discipline: discipline ? String(discipline) : null,
        fileUrl: urlStr,
        pageCount: typeof pageCount === "number" ? pageCount : null,
      }).returning();
      const row = rows[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e) {
      console.error("[sprint4] drawing create failed", e);
      res.status(500).json({ error: "drawing create failed" });
    }
  });

  app.get("/api/drawings/:id/pins", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const rows: DrawingPin[] = await db.select().from(drawingPins).where(and(
        eq(drawingPins.tenantId, tenantId),
        eq(drawingPins.drawingId, String(req.params.id)),
      )).orderBy(drawingPins.createdAt);
      res.json(rows);
    } catch (e) {
      console.error("[sprint4] pins list failed", e);
      res.status(500).json({ error: "pins list failed" });
    }
  });

  app.post("/api/drawings/:id/pins", async (req: Request, res: Response) => {
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const tenantId = getTenantId(req);
      const drawingId = String(req.params.id);
      // Verify the parent drawing belongs to this tenant before creating a pin.
      const parent: Drawing[] = await db.select()
        .from(drawings)
        .where(and(eq(drawings.tenantId, tenantId), eq(drawings.id, drawingId)))
        .limit(1);
      if (parent.length === 0) {
        return res.status(404).json({ error: "drawing not found" });
      }
      const { page, x, y, label, linkType, linkId } = (req.body ?? {}) as Record<string, unknown>;
      const px = typeof x === "number" ? x : Number(x);
      const py = typeof y === "number" ? y : Number(y);
      if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px > 1 || py < 0 || py > 1) {
        return res.status(400).json({ error: "x and y must be 0..1" });
      }
      const rows: DrawingPin[] = await db.insert(drawingPins).values({
        tenantId,
        drawingId,
        page: typeof page === "number" ? page : 1,
        x: String(px),
        y: String(py),
        label: label ? String(label) : null,
        linkType: linkType ? String(linkType) : null,
        linkId: linkId ? String(linkId) : null,
      }).returning();
      const row = rows[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e) {
      console.error("[sprint4] pin create failed", e);
      res.status(500).json({ error: "pin create failed" });
    }
  });

  app.delete("/api/drawings/:drawingId/pins/:pinId", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      await db.delete(drawingPins).where(and(
        eq(drawingPins.tenantId, tenantId),
        eq(drawingPins.id, String(req.params.pinId)),
        eq(drawingPins.drawingId, String(req.params.drawingId)),
      ));
      res.json({ ok: true });
    } catch (e) {
      console.error("[sprint4] pin delete failed", e);
      res.status(500).json({ error: "pin delete failed" });
    }
  });

  console.log("[sprint4] routes registered");
}
