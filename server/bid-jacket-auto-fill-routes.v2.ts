// Phase 2 v2 — POST /api/bid-projects/:bidProjectId/auto-fill-jacket
//
// This is the v2 router that uses real codebase signatures:
//   - Indexes by bidProjectId (not arbitrary jacketId)
//   - Tenant from auth context (req.user.tenantId) or from the bidProject row
//   - Wires the orchestrator to buildProductionAutoFillDeps()
//
// Mount in server/routes.ts:
//
//   import { bidJacketAutoFillRouter } from "./bid-jacket-auto-fill-routes.v2";
//   app.use(bidJacketAutoFillRouter);
//
// The route piggybacks on whatever auth middleware the rest of /api uses
// (the existing routes.ts file has app.use early-on for auth).

import { Router, type Request, type Response } from "express";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { bidProjects } from "@shared/schema";
import {
  autoFillJacket,
  type AutoFillResult,
} from "./services/jacket-auto-fill.service.v2";
import { buildProductionAutoFillDeps } from "./services/jacket-auto-fill.deps";

export const bidJacketAutoFillRouter = Router();

function isUuidish(s: string): boolean {
  return /^[a-zA-Z0-9_-]{6,64}$/.test(s);
}

/**
 * POST /api/bid-projects/:bidProjectId/auto-fill-jacket
 *
 * Body (optional): { tenantId?: string }  — falls back to req.user.tenantId
 *                                           or to bidProject.tenantId
 *
 * Returns: AutoFillResult JSON.  Status 200 on full success, 207 on
 * partial (some sections skipped/failed), 400/404/500 on error.
 */
bidJacketAutoFillRouter.post(
  "/api/bid-projects/:bidProjectId/auto-fill-jacket",
  async (req: Request, res: Response) => {
    const bidProjectId = String(req.params.bidProjectId || "");
    if (!isUuidish(bidProjectId)) {
      return res.status(400).json({ ok: false, error: "invalid_bid_project_id" });
    }

    // Resolve tenantId in priority order: body → auth context → bidProject row.
    let tenantId: string | null =
      typeof req.body?.tenantId === "string" ? req.body.tenantId : null;

    if (!tenantId && (req as any).user?.tenantId) {
      tenantId = (req as any).user.tenantId as string;
    }

    if (!tenantId) {
      const [project] = await db
        .select({ tenantId: bidProjects.tenantId })
        .from(bidProjects)
        .where(eq(bidProjects.id, bidProjectId));
      if (!project) {
        return res.status(404).json({ ok: false, error: "bid_project_not_found" });
      }
      tenantId = project.tenantId;
    }

    let deps;
    try {
      deps = buildProductionAutoFillDeps();
    } catch (err: any) {
      return res.status(500).json({
        ok: false,
        error: "deps_init_failed",
        detail: err?.message,
      });
    }

    let result: AutoFillResult;
    try {
      result = await autoFillJacket({ tenantId, bidProjectId, deps });
    } catch (err: any) {
      console.error("[bid-jacket-auto-fill] unhandled error", {
        bidProjectId,
        tenantId,
        err: err?.message,
      });
      return res.status(500).json({
        ok: false,
        error: "auto_fill_unhandled",
        detail: err?.message ?? String(err),
      });
    }

    return res.status(result.success ? 200 : 207).json({
      ok: result.success,
      result,
    });
  },
);

/**
 * GET /api/bid-projects/:bidProjectId/auto-fill-jacket/status
 *
 * Lightweight health check the frontend can hit before showing the button.
 * Confirms the route is mounted without actually firing the orchestrator.
 */
bidJacketAutoFillRouter.get(
  "/api/bid-projects/:bidProjectId/auto-fill-jacket/status",
  async (req: Request, res: Response) => {
    const bidProjectId = String(req.params.bidProjectId || "");
    return res.json({ ok: true, bidProjectId, mounted: true });
  },
);
