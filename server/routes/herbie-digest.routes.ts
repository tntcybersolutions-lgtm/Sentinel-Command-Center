// GET    /api/herbie/digest                      — what Herbie would proactively tell the PM.
// GET    /api/herbie/digest/:projectId            — project-scoped variant.
// DELETE /api/herbie/digest/dismiss/:type/:id     — Phase D "Mark Resolved" — hides a digest item for 7 days.

import { Router, type Request, type Response } from "express";
import { db } from "../db";
import { herbieDigestDismissals } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { buildHerbieDigest } from "../services/herbie-digest.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const digest = await buildHerbieDigest({ tenantId: tenantOf(req) });
    res.json(digest);
  } catch (error: any) {
    console.error("GET /api/herbie/digest error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to build digest" });
  }
});

// "Mark Resolved" — must be registered before the catch-all /:projectId GET
// is irrelevant (different methods), but we still keep the more specific
// path first for readability.
router.delete("/dismiss/:entityType/:entityId", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const entityType = String(req.params.entityType);
    const entityId = String(req.params.entityId);
    const now = new Date();
    const dismissedUntil = new Date(now.getTime() + DISMISS_TTL_MS);

    // Wipe any prior dismissal for the same key, then insert a fresh one.
    // Avoids unique-constraint friction without needing onConflict plumbing.
    await db
      .delete(herbieDigestDismissals)
      .where(
        and(
          eq(herbieDigestDismissals.tenantId, tenantId),
          eq(herbieDigestDismissals.entityType, entityType),
          eq(herbieDigestDismissals.entityId, entityId),
        ),
      );
    await db.insert(herbieDigestDismissals).values({
      tenantId,
      entityType,
      entityId,
      dismissedUntil,
      dismissedBy: "user",
    });

    res.json({ ok: true, dismissedUntil: dismissedUntil.toISOString() });
  } catch (error: any) {
    console.error("DELETE /api/herbie/digest/dismiss error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to dismiss digest item" });
  }
});

router.get("/:projectId", async (req: Request, res: Response) => {
  try {
    const digest = await buildHerbieDigest({
      tenantId: tenantOf(req),
      projectId: String(req.params.projectId),
    });
    res.json(digest);
  } catch (error: any) {
    console.error("GET /api/herbie/digest/:projectId error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to build digest" });
  }
});

export const herbieDigestRouter = router;
