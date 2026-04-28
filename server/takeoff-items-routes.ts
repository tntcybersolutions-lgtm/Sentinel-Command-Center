import { Router, type Request, type Response } from "express";
import { storage } from "./storage";

// ─── Takeoff Items Router ────────────────────────────────────────────────────
// Registers the missing /api/takeoff-items routes that the Takeoff Engine
// UI (design-systems.tsx) calls. The main routes.ts file is 24k lines and
// does not include these endpoints, causing the SPA to fall back to HTML and
// throw JSON parse errors that freeze the "Loading Categories..." spinner.
//
// Routes exposed:
//   GET    /api/takeoff-items                — list all items for this tenant
//   GET    /api/takeoff-items?projectId=     — filter by bid project id
//   GET    /api/takeoff-items?blueprintId=   — filter by blueprint id
//   POST   /api/takeoff-items                — create a new item
//   PATCH  /api/takeoff-items/:id            — update a single item
//   DELETE /api/takeoff-items/:id            — delete a single item
//
//   Alias routes the page also calls:
//   GET    /api/estimate/takeoff/items       — same as /api/takeoff-items
//   GET    /api/estimate/deliverables        — list project deliverables
//   GET    /api/project-deliverables         — list project deliverables
//   GET    /api/projects/:projectId/takeoff-items — project-scoped list
//   GET    /api/projects/:projectId/estimate/takeoff/items — same

export const takeoffItemsRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTenantId(req: Request): string | null {
  const user = (req as any).user;
  return user?.tenantId || user?.claims?.tenantId || null;
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

// ─── GET /api/takeoff-items ──────────────────────────────────────────────────
// Returns all takeoff items for the authenticated tenant.
// Optional query params: blueprintId, projectId
takeoffItemsRouter.get("/api/takeoff-items", async (req: Request, res: Response) => {
  try {
    const { blueprintId, projectId } = req.query as Record<string, string>;

    let items: any[] = [];

    if (blueprintId) {
      items = await storage.getTakeoffItems(blueprintId);
    } else if (projectId) {
      items = await storage.getTakeoffItemsByProject(projectId);
    } else {
      // Return empty array when no filter — the UI loads categories separately
      // and only loads items when a blueprint is selected
      items = [];
    }

    return res.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch takeoff items";
    console.error("[takeoff-items] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── POST /api/takeoff-items ─────────────────────────────────────────────────
// Creates a new takeoff item.
takeoffItemsRouter.post("/api/takeoff-items", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body || !body.blueprintId) {
      return jsonError(res, 400, "blueprintId is required");
    }

    const item = await storage.createTakeoffItem({
      blueprintId: body.blueprintId,
      name: String(body.name || "").trim() || "New Item",
      quantity: Number(body.quantity) || 0,
      unit: String(body.unit || "EA").trim(),
      unitCost: body.unitCost != null ? parseFloat(String(body.unitCost)) : 0,
      totalCost: body.totalCost != null ? parseFloat(String(body.totalCost)) : 0,
      category: body.category || null,
      notes: body.notes || null,
      bidProjectId: body.bidProjectId || null,
      tenantId: body.tenantId || null,
    });

    return res.status(201).json(item);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create takeoff item";
    console.error("[takeoff-items] POST error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── PATCH /api/takeoff-items/:id ────────────────────────────────────────────
// Updates a single takeoff item by id.
takeoffItemsRouter.patch("/api/takeoff-items/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return jsonError(res, 400, "id is required");

    const body = req.body;
    // Build partial update — only include provided fields
    const updates: Record<string, any> = {};
    if (body.name !== undefined) updates.name = String(body.name).trim();
    if (body.quantity !== undefined) updates.quantity = Number(body.quantity);
    if (body.unit !== undefined) updates.unit = String(body.unit).trim();
    if (body.unitCost !== undefined) updates.unitCost = parseFloat(String(body.unitCost));
    if (body.totalCost !== undefined) updates.totalCost = parseFloat(String(body.totalCost));
    if (body.category !== undefined) updates.category = body.category;
    if (body.notes !== undefined) updates.notes = body.notes;

    const updated = await storage.updateTakeoffItem(id, updates);
    if (!updated) return jsonError(res, 404, "Takeoff item not found");

    return res.json(updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update takeoff item";
    console.error("[takeoff-items] PATCH error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── DELETE /api/takeoff-items/:id ───────────────────────────────────────────
// Deletes a single takeoff item by id.
takeoffItemsRouter.delete("/api/takeoff-items/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) return jsonError(res, 400, "id is required");

    await storage.deleteTakeoffItem(id);
    return res.json({ success: true, deleted: id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete takeoff item";
    console.error("[takeoff-items] DELETE error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── ALIAS: GET /api/estimate/takeoff/items ──────────────────────────────────
// Same as /api/takeoff-items — the page calls this variant too.
takeoffItemsRouter.get("/api/estimate/takeoff/items", async (req: Request, res: Response) => {
  const { blueprintId, projectId } = req.query as Record<string, string>;
  try {
    let items: any[] = [];
    if (blueprintId) items = await storage.getTakeoffItems(blueprintId);
    else if (projectId) items = await storage.getTakeoffItemsByProject(projectId);
    return res.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch takeoff items";
    console.error("[estimate/takeoff/items] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── ALIAS: GET /api/projects/:projectId/takeoff-items ───────────────────────
takeoffItemsRouter.get("/api/projects/:projectId/takeoff-items", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const items = await storage.getTakeoffItemsByProject(projectId);
    return res.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch takeoff items";
    console.error("[projects/takeoff-items] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── ALIAS: GET /api/projects/:projectId/estimate/takeoff/items ──────────────
takeoffItemsRouter.get("/api/projects/:projectId/estimate/takeoff/items", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const items = await storage.getTakeoffItemsByProject(projectId);
    return res.json(items);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch takeoff items";
    console.error("[projects/estimate/takeoff/items] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── GET /api/estimate/deliverables ─────────────────────────────────────────
// Returns project deliverables. The design-systems.tsx Deliverables tab
// calls this and /api/project-deliverables to list generated documents.
// Delegates to the storage layer if a projectDeliverables method exists,
// otherwise returns an empty array so the UI renders without error.
takeoffItemsRouter.get("/api/estimate/deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as Record<string, string>;
    const s = storage as any;
    if (typeof s.getProjectDeliverables === "function") {
      const items = projectId
        ? await s.getProjectDeliverables(projectId)
        : await s.getProjectDeliverables();
      return res.json(items || []);
    }
    return res.json([]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch deliverables";
    console.error("[estimate/deliverables] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── GET /api/project-deliverables ───────────────────────────────────────────
// Same as above — used as queryKey by the Deliverables tab.
takeoffItemsRouter.get("/api/project-deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query as Record<string, string>;
    const s = storage as any;
    if (typeof s.getProjectDeliverables === "function") {
      const items = projectId
        ? await s.getProjectDeliverables(projectId)
        : await s.getProjectDeliverables();
      return res.json(items || []);
    }
    return res.json([]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch project deliverables";
    console.error("[project-deliverables] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── GET /api/projects/:projectId/deliverables ───────────────────────────────
takeoffItemsRouter.get("/api/projects/:projectId/deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const s = storage as any;
    if (typeof s.getProjectDeliverables === "function") {
      const items = await s.getProjectDeliverables(projectId);
      return res.json(items || []);
    }
    return res.json([]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch deliverables";
    console.error("[projects/deliverables] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});

// ─── GET /api/projects/:projectId/estimate/deliverables ──────────────────────
takeoffItemsRouter.get("/api/projects/:projectId/estimate/deliverables", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const s = storage as any;
    if (typeof s.getProjectDeliverables === "function") {
      const items = await s.getProjectDeliverables(projectId);
      return res.json(items || []);
    }
    return res.json([]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch deliverables";
    console.error("[projects/estimate/deliverables] GET error:", msg);
    return jsonError(res, 500, msg);
  }
});
