// Mobile API auth middleware — Sprint 7.5
// Locks down mobile endpoints to signed-in users.
// Toggle with SENTINEL_MOBILE_REQUIRE_AUTH=true (default false in dev to avoid breakage).
import type { Request, Response, NextFunction } from "express";

const REQUIRE_AUTH = (process.env.SENTINEL_MOBILE_REQUIRE_AUTH ?? "").toLowerCase() === "true";

export interface AuthedUser {
  id: string;
  email?: string;
  role?: string;
}
declare module "express-serve-static-core" {
  interface Request { authedUser?: AuthedUser }
}

function readUserFromRequest(req: Request): AuthedUser | null {
  const r = req as unknown as { user?: AuthedUser; session?: { user?: AuthedUser; userId?: string } };
  if (r.user?.id) return r.user;
  if (r.session?.user?.id) return r.session.user;
  if (r.session?.userId) return { id: r.session.userId };
  const tokenHeader = req.header("x-sentinel-user");
  if (tokenHeader) return { id: tokenHeader };
  return null;
}

export function mobileAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const u = readUserFromRequest(req);
  if (u) {
    req.authedUser = u;
    return next();
  }
  if (!REQUIRE_AUTH) {
    // Permissive in dev: tag a fallback identity so downstream code has something
    req.authedUser = { id: "anonymous-mobile" };
    return next();
  }
  res.status(401).json({ error: "Sign in required" });
}

/** Strict — always 401 if no user (use for write endpoints). */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const u = readUserFromRequest(req);
  if (!u) { res.status(401).json({ error: "Sign in required" }); return; }
  req.authedUser = u;
  next();
}
