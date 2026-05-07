import { Router, type Request, type Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { storage } from "./storage";

export const takeoffItemsRouter = Router();

function getTenantId(req: Request): string | null {
  const user = (req as any).user;
  return user?.tenantId || user?.claims?.tenantId || null;
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

async function fetchDeliverables(projectId?: string, tenantId?: string): Promise<any[]> {
  try {
    const s = storage as any;
    if (typeof s.getProjectDeliverables === "function") {
      const items = projectId ? await s.getProjectDeliverables(projectId) : await s.getProjectDeliverables();
      if (Array.isArray(items)) return items;
    }
    const tableCheck = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('takeoff_project_deliverables','project_takeoff_deliverables','takeoff_deliverables','estimate_deliverables') LIMIT 1`);
    const rows = (tableCheck as any).rows as Array<{ table_name: string }>;
    if (!rows || !rows.length) return [];
    const tableName = rows[0].table_name;
    const pid = projectId ? projectId.replace(/'/g, "''") : null;
    const tid = tenantId ? tenantId.replace(/'/g, "''") : null;
    let qry = `SELECT * FROM "${tableName}"`;
    if (pid && tid) qry += ` WHERE project_id = '${pid}' AND tenant_id = '${tid}'`;
    else if (pid) qry += ` WHERE project_id = '${pid}'`;
    qry += " ORDER BY created_at DESC LIMIT 500";
    const result = await db.execute(sql.raw(qry));
    return (result as any).rows as any[];
  } catch (err: unknown) {
    console.error("[fetchDeliverables] error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

takeoffItemsRouter.get("/api/takeoff-items", async (req: Request, res: Response) => {
  try {
    const { blueprintId, projectId } = req.query as Record<string, string>;
    let items: any[] = [];
    if (blueprintId) items = await storage.getTakeoffItems(blueprintId);
    else if (projectId) items = await storage.getTakeoffItemsByProject(projectId);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch takeoff items");
  }
});

takeoffItemsRouter.post("/api/takeoff-items", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body || !body.blueprintId) return jsonError(res, 400, "blueprintId is required");
    const item = await storage.createTakeoffItem({
      blueprintId: body.blueprintId,
      name: String(body.name || "").trim() || "New Item",
      quantity: String(Number(body.quantity) || 0),
      unit: String(body.unit || "EA").trim(),
      unitCost: body.unitCost != null ? String(parseFloat(String(body.unitCost))) : "0",
      category: body.category || null,
      notes: body.notes || null,
      bidProjectId: body.bidProjectId || null,
      tenantId: body.tenantId || null,
    });
    return res.status(201).json(item);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to create takeoff item");
  }
});

takeoffItemsRouter.patch("/api/takeoff-items/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return jsonError(res, 400, "id is required");
    const body = req.body;
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.quantity !== undefined) updates.quantity = String(Number(body.quantity));
    if (body.unit !== undefined) updates.unit = String(body.unit).trim();
    if (body.unitCost !== undefined) updates.unitCost = String(parseFloat(String(body.unitCost)));
    if (body.category !== undefined) updates.category = body.category;
    if (body.notes !== undefined) updates.notes = body.notes;
    const updated = await storage.updateTakeoffItem(String(id), updates);
    if (!updated) return jsonError(res, 404, "Takeoff item not found");
    return res.json(updated);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to update takeoff item");
  }
});

takeoffItemsRouter.delete("/api/takeoff-items/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return jsonError(res, 400, "id is required");
    const idStr = String(id);
    await storage.deleteTakeoffItem(idStr);
    return res.json({ success: true, deleted: idStr });
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to delete takeoff item");
  }
});

takeoffItemsRouter.get("/api/estimate/takeoff/items", async (req: Request, res: Response) => {
  const { blueprintId, projectId } = req.query as Record<string, string>;
  try {
    let items: any[] = [];
    if (blueprintId) items = await storage.getTakeoffItems(blueprintId);
    else if (projectId) items = await storage.getTakeoffItemsByProject(projectId);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch takeoff items");
  }
});

takeoffItemsRouter.get("/api/projects/:projectId/takeoff-items", async (req: Request, res: Response) => {
  try {
    const items = await storage.getTakeoffItemsByProject(String(req.params.projectId));
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch takeoff items");
  }
});

takeoffItemsRouter.get("/api/projects/:projectId/estimate/takeoff/items", async (req: Request, res: Response) => {
  try {
    const items = await storage.getTakeoffItemsByProject(String(req.params.projectId));
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch takeoff items");
  }
});

takeoffItemsRouter.get("/api/estimate/deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as Record<string, string>;
    const items = await fetchDeliverables(projectId, getTenantId(req) ?? undefined);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch deliverables");
  }
});

takeoffItemsRouter.get("/api/project-deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as Record<string, string>;
    const items = await fetchDeliverables(projectId, getTenantId(req) ?? undefined);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch project deliverables");
  }
});

takeoffItemsRouter.get("/api/projects/:projectId/deliverables", async (req: Request, res: Response) => {
  try {
    const items = await fetchDeliverables(String(req.params.projectId), getTenantId(req) ?? undefined);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch deliverables");
  }
});

takeoffItemsRouter.get("/api/projects/:projectId/estimate/deliverables", async (req: Request, res: Response) => {
  try {
    const items = await fetchDeliverables(String(req.params.projectId), getTenantId(req) ?? undefined);
    return res.json(items);
  } catch (err: unknown) {
    return jsonError(res, 500, err instanceof Error ? err.message : "Failed to fetch deliverables");
  }
});
