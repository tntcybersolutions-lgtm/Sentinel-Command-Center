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
// ============================================================================
import type { Express, Request, Response } from "express";
import { and, desc, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import {
  projects,
  approvalRequests,
  rfis,
  projectDailyLogs,
  projectPhotos,
  payApplications,
  invoices,
  pushSubscriptions,
  drawings,
  drawingPins,
} from "@shared/schema";

const DEFAULT_TENANT_ID = "blackhawk-default";
function getTenantId(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
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
let webPushClient: typeof import("web-push") | null = null;
let webPushReady = false;
async function getWebPush(): Promise<typeof import("web-push") | null> {
  if (webPushReady) return webPushClient;
  webPushReady = true;
  try {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT || "mailto:ops@blackhawkconstruction.com";
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

  // Health score: inverse of overdue amount weighted (cap)
  const score = Math.max(20, Math.min(100, 100 - Math.round(amount / 10000)));
  const suggestion = amount > 0
    ? `Push collections — $${amount.toLocaleString()} aging past 60d.`
    : "AR is healthy. Consider pulling forward upcoming pay apps.";

  return { amount, spark: spark.length ? spark : [0], delta7d, score, suggestion };
}

// ── /api/home/today ──────────────────────────────────────────────────────────
type Severity = "critical" | "warning" | "info" | "neutral";
interface TodayRow {
  id: string;
  severity: Severity;
  title: string;
  subtitle?: string;
  badge?: string;
  href?: string;
}

async function computeToday(tenantId: string): Promise<TodayRow[]> {
  const out: TodayRow[] = [];
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);

  // Pending approvals
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
      out.push({
        id: `approvals`,
        severity: approvals.length > 2 ? "critical" : "warning",
        title: `${approvals.length} approval${approvals.length === 1 ? "" : "s"} pending`,
        subtitle: approvals[0].entityType,
        badge: String(approvals.length),
        href: "/approvals",
      });
    }
  } catch { /* ignore */ }

  // RFIs due in next 24h
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
      out.push({
        id: `rfi-${r.id}`,
        severity: mins < 60 ? "critical" : "warning",
        title: `RFI #${r.rfiNumber} due in ${mins < 60 ? mins + "m" : Math.round(mins / 60) + "h"}`,
        subtitle: r.subject,
        href: "/execution/rfis",
      });
    }
  } catch { /* ignore */ }

  // Photos awaiting caption (last 24h with no caption)
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

  // Pay apps with period ending this week
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
    } catch (e: any) {
      console.error("[sprint4] risk-score failed", e); res.status(500).json({ error: "risk-score failed" });
    }
  });

  app.get("/api/home/today", async (req: Request, res: Response) => {
    try {
      const data = await computeToday(getTenantId(req));
      res.setHeader("Cache-Control", "private, max-age=30");
      res.json(data);
    } catch (e: any) {
      console.error("[sprint4] today failed", e); res.status(500).json({ error: "today failed" });
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
      const rows = await db.insert(projectDailyLogs).values({
        tenantId,
        projectId,
        title: String(finalTitle),
        notes: finalNotes as string | null,
        weather: typeof weather === "string" ? weather : null,
        logDate: ld,
      }).returning();
      const row = (rows as any[])[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e: any) {
      console.error("[sprint4] daily-log alias failed:", e?.message);
      console.error("[sprint4] daily-log failed", e); res.status(500).json({ error: "daily-log failed" });
    }
  });

  // ── Push ───────────────────────────────────────────────────────────────────
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  });

  app.post("/api/push/subscribe", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const userId = (req as any)?.user?.id || null;
      const { endpoint, keys } = (req.body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return res.status(400).json({ error: "endpoint + keys.p256dh + keys.auth required" });
      }
      const ua = req.header("user-agent") || null;
      const existing = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).limit(1);
      if (existing.length > 0) {
        await db.update(pushSubscriptions)
          .set({ p256dh: keys.p256dh, auth: keys.auth, userAgent: ua, lastSeenAt: new Date(), tenantId, userId })
          .where(eq(pushSubscriptions.id, existing[0].id));
        return res.json({ ok: true, id: existing[0].id, updated: true });
      }
      const rows = await db.insert(pushSubscriptions).values({
        tenantId, userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: ua,
      }).returning();
      res.json({ ok: true, id: (rows as any[])[0].id });
    } catch (e: any) {
      console.error("[sprint4] subscribe failed", e); res.status(500).json({ error: "subscribe failed" });
    }
  });

  app.delete("/api/push/subscribe", async (req: Request, res: Response) => {
    try {
      const { endpoint } = (req.body ?? {}) as { endpoint?: string };
      if (!endpoint) return res.status(400).json({ error: "endpoint required" });
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
      res.json({ ok: true });
    } catch (e: any) {
      console.error("[sprint4] unsubscribe failed", e); res.status(500).json({ error: "unsubscribe failed" });
    }
  });

  app.post("/api/push/test", async (req: Request, res: Response) => {
    try {
      const wp = await getWebPush();
      if (!wp) return res.status(503).json({ error: "VAPID keys not configured" });
      const tenantId = getTenantId(req);
      const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.tenantId, tenantId));
      const payload = JSON.stringify({
        title: (req.body?.title as string) || "Sentinel test",
        body: (req.body?.body as string) || "Push notifications are wired up.",
        url: (req.body?.url as string) || "/home",
      });
      let sent = 0; let failed = 0; const stale: string[] = [];
      for (const s of subs) {
        try {
          await wp.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch (err: any) {
          failed += 1;
          if (err?.statusCode === 404 || err?.statusCode === 410) stale.push(s.endpoint);
        }
      }
      if (stale.length > 0) {
        await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, stale));
      }
      res.json({ sent, failed, pruned: stale.length });
    } catch (e: any) {
      console.error("[sprint4] push test failed", e); res.status(500).json({ error: "push test failed" });
    }
  });

  // ── Drawings ───────────────────────────────────────────────────────────────
  app.get("/api/projects/:id/drawings", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const rows = await db.select().from(drawings).where(and(
        eq(drawings.tenantId, tenantId),
        eq(drawings.projectId, String(req.params.id)),
      )).orderBy(desc(drawings.createdAt));
      res.json(rows);
    } catch (e: any) {
      console.error("[sprint4] drawings list failed", e); res.status(500).json({ error: "drawings list failed" });
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
      const rows = await db.insert(drawings).values({
        tenantId,
        projectId,
        title: String(title),
        sheet: sheet ? String(sheet) : null,
        discipline: discipline ? String(discipline) : null,
        fileUrl: urlStr,
        pageCount: typeof pageCount === "number" ? pageCount : null,
      }).returning();
      const row = (rows as any[])[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e: any) {
      console.error("[sprint4] drawing create failed", e); res.status(500).json({ error: "drawing create failed" });
    }
  });

  app.get("/api/drawings/:id/pins", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const rows = await db.select().from(drawingPins).where(and(
        eq(drawingPins.tenantId, tenantId),
        eq(drawingPins.drawingId, String(req.params.id)),
      )).orderBy(drawingPins.createdAt);
      res.json(rows);
    } catch (e: any) {
      console.error("[sprint4] pins list failed", e); res.status(500).json({ error: "pins list failed" });
    }
  });

  app.post("/api/drawings/:id/pins", async (req: Request, res: Response) => {
    const key = idemKey(req);
    const cached = idemGet(key);
    if (cached) return res.status(cached.status).json(cached.body);
    try {
      const tenantId = getTenantId(req);
      const drawingId = String(req.params.id);
      const { page, x, y, label, linkType, linkId } = (req.body ?? {}) as Record<string, unknown>;
      const px = typeof x === "number" ? x : Number(x);
      const py = typeof y === "number" ? y : Number(y);
      if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || px > 1 || py < 0 || py > 1) {
        return res.status(400).json({ error: "x and y must be 0..1" });
      }
      const rows = await db.insert(drawingPins).values({
        tenantId,
        drawingId,
        page: typeof page === "number" ? page : 1,
        x: String(px) as any,
        y: String(py) as any,
        label: label ? String(label) : null,
        linkType: linkType ? String(linkType) : null,
        linkId: linkId ? String(linkId) : null,
      }).returning();
      const row = (rows as any[])[0];
      idemSet(key, 200, row);
      res.json(row);
    } catch (e: any) {
      console.error("[sprint4] pin create failed", e); res.status(500).json({ error: "pin create failed" });
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
    } catch (e: any) {
      console.error("[sprint4] pin delete failed", e); res.status(500).json({ error: "pin delete failed" });
    }
  });

  console.log("[sprint4] routes registered");
}
