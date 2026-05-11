import { Router, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

export const recordNotesRouter = Router();

function getTenantId(req: Request): string {
  return (req as any).tenantId || (req as any).user?.tenantId || "blackhawk-default";
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

// GET /api/record-notes?recordType=&recordId=
recordNotesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { recordType, recordId } = req.query;
    if (!recordType || !recordId) {
      return jsonError(res, 400, "recordType and recordId are required");
    }
    const rows = await db.execute(
      sql`SELECT id, tenant_id, record_type, record_id, body, created_by, created_at, updated_at
           FROM record_notes
           WHERE tenant_id = ${tenantId}
             AND record_type = ${String(recordType)}
             AND record_id = ${String(recordId)}::uuid
           ORDER BY created_at ASC`
    );
    res.json((rows as any).rows ?? rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/record-notes  body: { recordType, recordId, body }
recordNotesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { recordType, recordId, body } = req.body;
    if (!recordType || !recordId || !body) {
      return jsonError(res, 400, "recordType, recordId, and body are required");
    }
    const createdBy = (req as any).user?.id || (req as any).user?.email || "system";
    const rows = await db.execute(
      sql`INSERT INTO record_notes (tenant_id, record_type, record_id, body, created_by)
           VALUES (${tenantId}, ${recordType}, ${recordId}::uuid, ${body}, ${createdBy})
           RETURNING *`
    );
    const created = ((rows as any).rows ?? rows)[0];
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/record-notes/:id  body: { body }
recordNotesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { body } = req.body;
    if (!body) return jsonError(res, 400, "body is required");
    const rows = await db.execute(
      sql`UPDATE record_notes
           SET body = ${body}, updated_at = NOW()
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}
           RETURNING *`
    );
    const updated = ((rows as any).rows ?? rows)[0];
    if (!updated) return jsonError(res, 404, "Note not found");
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/record-notes/:id
recordNotesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const rows = await db.execute(
      sql`DELETE FROM record_notes
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}
           RETURNING id`
    );
    const deleted = ((rows as any).rows ?? rows)[0];
    if (!deleted) return jsonError(res, 404, "Note not found");
    res.json({ deleted: deleted.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
