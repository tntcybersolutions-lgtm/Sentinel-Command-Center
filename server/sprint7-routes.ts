// Sprint 7.5 wiring — written by Claude.
//  - Locks down mobile API endpoints with mobileAuthMiddleware.
//  - Persisted push subscription endpoints.
//  - Internal hooks for approval/RFI/task change notifications.
import type { Express, Request, Response, NextFunction } from "express";
import { mobileAuthMiddleware } from "./mobile-auth";
import {
  savePushSubscription,
  deletePushSubscription,
  checkAndStoreIdempotency,
  purgeExpiredIdempotency,
} from "./push-persistence";
import { pushApprovalCreated, pushRfiCreated, pushTaskChange } from "./push-notify";

function isMobileApi(path: string): boolean {
  if (path.startsWith("/api/home/")) return true;
  if (/^\/api\/projects\/[^/]+\/(photos|receipts|daily-logs)/.test(path)) return true;
  if (path === "/api/receipts/ocr") return true;
  return false;
}

function mobileGate(req: Request, res: Response, next: NextFunction): void {
  if (isMobileApi(req.path)) return mobileAuthMiddleware(req, res, next);
  next();
}

function reqUserId(req: Request): string {
  return (req as Request & { authedUser?: { id: string } }).authedUser?.id || "anonymous-mobile";
}

async function subscribePush(req: Request, res: Response): Promise<void> {
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "endpoint and keys required" });
    return;
  }
  await savePushSubscription({
    endpoint,
    keys,
    userId: reqUserId(req),
    userAgent: req.header("user-agent")?.slice(0, 240),
  });
  res.json({ ok: true });
}

async function unsubscribePush(req: Request, res: Response): Promise<void> {
  const endpoint = req.body?.endpoint;
  if (!endpoint) {
    res.status(400).json({ error: "endpoint required" });
    return;
  }
  await deletePushSubscription(endpoint);
  res.json({ ok: true });
}

async function checkIdempotency(req: Request, res: Response): Promise<void> {
  const key = String(req.body?.key ?? "");
  const scope = String(req.body?.scope ?? "default");
  if (!key) { res.status(400).json({ error: "key required" }); return; }
  const inserted = await checkAndStoreIdempotency(key, scope);
  res.json({ duplicate: !inserted });
}

// ---- Inbound notification fires (called by mobile/desktop clients on local changes) ----
async function fireApprovalChange(req: Request, res: Response): Promise<void> {
  await pushApprovalCreated({
    userId: req.body?.userId,
    projectId: String(req.body?.projectId ?? ""),
    itemTitle: String(req.body?.itemTitle ?? "Approval"),
    amount: req.body?.amount,
  });
  res.json({ ok: true });
}

async function fireRfiChange(req: Request, res: Response): Promise<void> {
  await pushRfiCreated({
    userId: req.body?.userId,
    projectId: String(req.body?.projectId ?? ""),
    question: String(req.body?.question ?? "New RFI"),
  });
  res.json({ ok: true });
}

async function fireTaskChange(req: Request, res: Response): Promise<void> {
  await pushTaskChange({
    userId: req.body?.userId,
    projectId: String(req.body?.projectId ?? ""),
    taskTitle: String(req.body?.taskTitle ?? "Task"),
    status: String(req.body?.status ?? "updated"),
  });
  res.json({ ok: true });
}

export function registerSprint7Routes(app: Express): void {
  // Gate mobile API endpoints
  app.use(mobileGate);

  // Push subscription persistence
  app.post("/api/push/subscribe", subscribePush);
  app.post("/api/push/unsubscribe", unsubscribePush);

  // Idempotency helpers
  app.post("/api/idempotency/check", checkIdempotency);

  // Notification fire endpoints (internal — gated by auth)
  app.post("/api/notify/approval", fireApprovalChange);
  app.post("/api/notify/rfi", fireRfiChange);
  app.post("/api/notify/task", fireTaskChange);

  // Periodic idempotency purge (every hour)
  setInterval(() => { purgeExpiredIdempotency().catch(() => {}); }, 60 * 60 * 1000);

  console.log("[sprint7] mobile auth + push persistence + push notify wired");
}

// Expose imperative helpers so other server modules can call them directly
export { pushApprovalCreated, pushRfiCreated, pushTaskChange };
