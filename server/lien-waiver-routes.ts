import { Router, Request, Response } from "express";
import {
    getProjectLienWaivers,
    createProjectLienWaivers,
    getLienWaiverTemplatesByState,
    getAllLienWaiverTemplates,
    updateProjectLienWaiverStatus,
    seedLienWaiverTemplates,
    US_STATES,
} from "./lien-waivers";

export const lienWaiverRouter = Router();

function getTenantId(req: Request): string {
    return (req as any).tenantId || (req as any).user?.tenantId || "blackhawk-default";
}

// GET /api/lien-waivers/states
lienWaiverRouter.get("/states", (_req: Request, res: Response) => {
    res.json(US_STATES);
});

// GET /api/lien-waivers/templates
lienWaiverRouter.get("/templates", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          await seedLienWaiverTemplates(tenantId);
          res.json(await getAllLienWaiverTemplates(tenantId));
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});

// GET /api/lien-waivers/templates/:stateCode
lienWaiverRouter.get("/templates/:stateCode", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          await seedLienWaiverTemplates(tenantId);
          const templates = await getLienWaiverTemplatesByState(tenantId, String(req.params.stateCode));
          if (!templates.length) return res.status(404).json({ error: "State not found" });
          res.json(templates);
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});

// GET /api/lien-waivers/projects/:projectId
lienWaiverRouter.get("/projects/:projectId", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          res.json(await getProjectLienWaivers(tenantId, String(req.params.projectId)));
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});

// POST /api/lien-waivers/projects/:projectId/initialize
lienWaiverRouter.post("/projects/:projectId/initialize", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          const { stateCode } = req.body;
          if (!stateCode || stateCode.length !== 2) {
                  return res.status(400).json({ error: "stateCode required (2-letter)" });
          }
          await seedLienWaiverTemplates(tenantId);
          const waivers = await createProjectLienWaivers(tenantId, String(req.params.projectId), stateCode.toUpperCase());
          res.status(201).json({ created: waivers.length, waivers });
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});

// POST /api/lien-waivers/projects/:projectId/regenerate
lienWaiverRouter.post("/projects/:projectId/regenerate", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          const { stateCode } = req.body;
          if (!stateCode || stateCode.length !== 2) {
                  return res.status(400).json({ error: "stateCode required (2-letter)" });
          }
          await seedLienWaiverTemplates(tenantId);
          const waivers = await createProjectLienWaivers(tenantId, String(req.params.projectId), stateCode.toUpperCase());
          res.json({ regenerated: waivers.length, waivers });
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});

// PATCH /api/lien-waivers/:waiverId/status
lienWaiverRouter.patch("/:waiverId/status", async (req: Request, res: Response) => {
    try {
          const tenantId = getTenantId(req);
          const { status, storageKey } = req.body;
          if (!["missing", "uploaded", "approved"].includes(status)) {
                  return res.status(400).json({ error: "status must be: missing, uploaded, or approved" });
          }
          const updated = await updateProjectLienWaiverStatus(tenantId, String(req.params.waiverId), status, storageKey);
          if (!updated) return res.status(404).json({ error: "Waiver not found" });
          res.json(updated);
    } catch (err: any) {
    res.status(500).json({ error: err.message });
    }
});
