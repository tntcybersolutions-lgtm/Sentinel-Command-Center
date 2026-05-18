/**
 * Sprint TK1 — Mobile Auth API
 *
 * Minimum-viable passwordless sign-in for the field PWA.
 * Looks up an active user by email and returns their id; the client stores
 * the id in localStorage and sends it as the `x-sentinel-user` header on
 * subsequent requests. The existing `mobileAuthMiddleware` (server/mobile-auth.ts)
 * already reads this header — flipping SENTINEL_MOBILE_REQUIRE_AUTH=true then
 * enforces it strictly.
 *
 * Endpoints:
 *   POST /api/auth/mobile-login    — body {email} → {userId, email, displayName}
 *   GET  /api/auth/mobile-session  — reads x-sentinel-user header → user or 401
 *   POST /api/auth/mobile-logout   — no-op stub for client symmetry
 *
 * Notes:
 * - This is NOT real auth (no password, no MFA). It's a single-step lookup
 *   so we can wire the gate end-to-end without bricking field users today.
 *   Real auth (Replit OIDC, magic link, or password+TOTP) goes in a later sprint.
 */

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { db } from "../db";

export const mobileAuthApiRouter = Router();

mobileAuthApiRouter.post("/mobile-login", async (req: Request, res: Response) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT id, email, display_name FROM users
      WHERE LOWER(email) = ${email} AND status = 'active'
      LIMIT 1
    `);
    const user = result.rows?.[0] as { id: string; email: string; display_name: string | null } | undefined;
    if (!user) {
      return res.status(404).json({ error: "No active user with that email" });
    }
    res.json({
      userId: user.id,
      email: user.email,
      displayName: user.display_name || user.email,
    });
  } catch (e) {
    console.error("[mobile-login]", e);
    res.status(500).json({ error: "Login failed" });
  }
});

mobileAuthApiRouter.get("/mobile-session", async (req: Request, res: Response) => {
  const userId = req.header("x-sentinel-user");
  if (!userId) {
    return res.status(401).json({ error: "Sign in required" });
  }
  try {
    const result = await db.execute(sql`
      SELECT id, email, display_name FROM users
      WHERE id = ${userId} AND status = 'active'
      LIMIT 1
    `);
    const user = result.rows?.[0] as { id: string; email: string; display_name: string | null } | undefined;
    if (!user) {
      return res.status(401).json({ error: "Session invalid" });
    }
    res.json({
      userId: user.id,
      email: user.email,
      displayName: user.display_name || user.email,
    });
  } catch (e) {
    console.error("[mobile-session]", e);
    res.status(500).json({ error: "Session lookup failed" });
  }
});

mobileAuthApiRouter.post("/mobile-logout", (_req: Request, res: Response) => {
  // Client just clears localStorage. This endpoint exists for symmetry / future
  // server-side session invalidation (e.g. token revocation list).
  res.json({ ok: true });
});

export default mobileAuthApiRouter;
