import { Router, type Request, type Response } from "express";
import {
  seedLienWaiverTemplates,
  getAllLienWaiverTemplates,
  getLienWaiverTemplatesByState,
  createProjectLienWaivers,
  getProjectLienWaivers,
  updateProjectLienWaiverStatus,
  US_STATES,
  WAIVER_TYPES,
} from "../lien-waivers";

const router = Router();

/** Resolve tenant id from session/header; falls back to a default for dev. */
function tenantOf(req: Request): string {
  const r = req as any;
  return (
    r.user?.tenantId ||
    r.session?.tenantId ||
    (req.headers["x-tenant-id"] as string) ||
    "default"
  );
}

/** GET /api/lien-waivers/meta — static lists for the UI (states + types). */
router.get("/meta", (_req: Request, res: Response) => {
  res.json({ states: US_STATES, types: WAIVER_TYPES });
});

/** GET /api/lien-waivers/templates — all templates for tenant (200 rows once seeded). */
router.get("/templates", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const rows = await getAllLienWaiverTemplates(tenantId);
    res.json({ rows });
  } catch (err: any) {
    console.error("[lien-waivers] templates list failed", err);
    res.status(500).json({ error: err?.message || "failed to list templates" });
  }
});

/** GET /api/lien-waivers/templates/:state — templates filtered by state code. */
router.get("/templates/:state", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const rows = await getLienWaiverTemplatesByState(tenantId, req.params.state);
    res.json({ rows });
  } catch (err: any) {
    console.error("[lien-waivers] templates by state failed", err);
    res.status(500).json({ error: err?.message || "failed to list templates by state" });
  }
});

/** POST /api/lien-waivers/templates/seed — one-click seed of all 200 templates for tenant. */
router.post("/templates/seed", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    await seedLienWaiverTemplates(tenantId);
    const rows = await getAllLienWaiverTemplates(tenantId);
    res.json({ ok: true, count: rows.length });
  } catch (err: any) {
    console.error("[lien-waivers] seed failed", err);
    res.status(500).json({ error: err?.message || "seed failed" });
  }
});

/** GET /api/lien-waivers?projectId=...&status=missing|received|approved
 *  Returns rows for one project; if projectId omitted, returns []
 *  (cross-project aggregation is added in Phase 4 packet work).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = (req.query.projectId as string) || "";
    const status = req.query.status as string | undefined;
    if (!projectId) {
      res.json({ rows: [] });
      return;
    }
    const rows = await getProjectLienWaivers(tenantId, projectId);
    const filtered = status
      ? rows.filter((r: any) => r.status === status)
      : rows;
    res.json({ rows: filtered });
  } catch (err: any) {
    console.error("[lien-waivers] list failed", err);
    res.status(500).json({ error: err?.message || "failed to list waivers" });
  }
});

/** POST /api/lien-waivers — create waivers for a project + folder + template list. */
router.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const { projectId, folderId, templateIds } = req.body as {
      projectId: string;
      folderId: string;
      templateIds: string[];
    };
    if (!projectId || !folderId || !Array.isArray(templateIds)) {
      res.status(400).json({ error: "projectId, folderId, templateIds[] required" });
      return;
    }
    const created = await createProjectLienWaivers(
      tenantId,
      projectId,
      folderId,
      templateIds,
    );
    res.json({ ok: true, created });
  } catch (err: any) {
    console.error("[lien-waivers] create failed", err);
    res.status(500).json({ error: err?.message || "create failed" });
  }
});

/** PATCH /api/lien-waivers/:id/status — update one waiver's status. */
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const { status, notes } = req.body as { status: string; notes?: string };
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    await updateProjectLienWaiverStatus(tenantId, req.params.id, status, notes);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[lien-waivers] status update failed", err);
    res.status(500).json({ error: err?.message || "status update failed" });
  }
});

export const lienWaiversRouter = router;
export default router;
