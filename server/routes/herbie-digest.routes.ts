// GET /api/herbie/digest — what Herbie would proactively tell the PM.
// GET /api/herbie/digest/:projectId — project-scoped variant.

import { Router, type Request, type Response } from "express";
import { buildHerbieDigest } from "../services/herbie-digest.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

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
