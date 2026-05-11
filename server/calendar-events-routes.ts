import { Router, Request, Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

export const calendarEventsRouter = Router();

const VALID_KINDS = ["item", "meeting", "note"] as const;
type EventKind = typeof VALID_KINDS[number];

function getTenantId(req: Request): string {
  return (req as any).tenantId || (req as any).user?.tenantId || "blackhawk-default";
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

// GET /api/calendar-events?from=&to=&recordType=&recordId=
calendarEventsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { from, to, recordType, recordId } = req.query;

    let rows;
    if (recordType && recordId) {
      rows = await db.execute(
        sql`SELECT * FROM calendar_events
             WHERE tenant_id = ${tenantId}
               AND record_type = ${String(recordType)}
               AND record_id = ${String(recordId)}::uuid
               ${from ? sql`AND event_date >= ${String(from)}::date` : sql``}
               ${to ? sql`AND event_date <= ${String(to)}::date` : sql``}
             ORDER BY event_date ASC`
      );
    } else {
      rows = await db.execute(
        sql`SELECT * FROM calendar_events
             WHERE tenant_id = ${tenantId}
               ${from ? sql`AND event_date >= ${String(from)}::date` : sql``}
               ${to ? sql`AND event_date <= ${String(to)}::date` : sql``}
             ORDER BY event_date ASC`
      );
    }
    res.json((rows as any).rows ?? rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/calendar-events  body: { date, kind, title, recordType?, recordId? }
calendarEventsRouter.post("/", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { date, kind, title, recordType, recordId } = req.body;

    if (!date || !kind || !title) {
      return jsonError(res, 400, "date, kind, and title are required");
    }
    if (!VALID_KINDS.includes(kind as EventKind)) {
      return jsonError(res, 400, `kind must be one of: ${VALID_KINDS.join(", ")}`);
    }
    const createdBy = (req as any).user?.id || (req as any).user?.email || "system";

    let rows;
    if (recordType && recordId) {
      rows = await db.execute(
        sql`INSERT INTO calendar_events (tenant_id, event_date, kind, title, record_type, record_id, created_by)
             VALUES (${tenantId}, ${date}::date, ${kind}, ${title}, ${recordType}, ${recordId}::uuid, ${createdBy})
             RETURNING *`
      );
    } else {
      rows = await db.execute(
        sql`INSERT INTO calendar_events (tenant_id, event_date, kind, title, created_by)
             VALUES (${tenantId}, ${date}::date, ${kind}, ${title}, ${createdBy})
             RETURNING *`
      );
    }
    res.status(201).json(((rows as any).rows ?? rows)[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/calendar-events/:id
calendarEventsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const { date, kind, title } = req.body;
    if (!date && !kind && !title) {
      return jsonError(res, 400, "At least one of date, kind, or title is required");
    }
    if (kind && !VALID_KINDS.includes(kind as EventKind)) {
      return jsonError(res, 400, `kind must be one of: ${VALID_KINDS.join(", ")}`);
    }
    const rows = await db.execute(
      sql`UPDATE calendar_events
           SET event_date  = COALESCE(${date ? sql`${date}::date` : sql`event_date`}, event_date),
               kind        = COALESCE(${kind ?? null}, kind),
               title       = COALESCE(${title ?? null}, title)
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}
           RETURNING *`
    );
    const updated = ((rows as any).rows ?? rows)[0];
    if (!updated) return jsonError(res, 404, "Event not found");
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/calendar-events/:id
calendarEventsRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { id } = req.params;
    const rows = await db.execute(
      sql`DELETE FROM calendar_events
           WHERE id = ${id}::uuid AND tenant_id = ${tenantId}
           RETURNING id`
    );
    const deleted = ((rows as any).rows ?? rows)[0];
    if (!deleted) return jsonError(res, 404, "Event not found");
    res.json({ deleted: deleted.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
