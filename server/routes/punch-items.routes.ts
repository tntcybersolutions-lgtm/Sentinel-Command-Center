// ============================================================================
// punch-items.routes.ts — Sprint F2 — POSTGRES PERSISTENCE
// ----------------------------------------------------------------------------
// Replaces the original in-memory Map store with PostgreSQL via the existing
// drizzle/pg pool. Survives Replit Autoscale container recycles.
//
// Endpoints:
//   GET    /api/punch-items                       — list (filters: projectId, status, assignee)
//   GET    /api/punch-items/_meta/stats           — counts by status + overdue + closed-7-day
//   GET    /api/punch-items/:id                   — get one
//   POST   /api/punch-items                       — create
//   PATCH  /api/punch-items/:id                   — partial update
//   DELETE /api/punch-items/:id                   — delete
//
// Status transitions auto-set closed_at when status flips to "closed" and
// clear it when status flips back out of closed. Bootstrap auto-creates the
// table on first request via CREATE TABLE IF NOT EXISTS, so the server boots
// even before `npm run db:push` has been run.
// ============================================================================

import { Router, type Request, type Response } from "express";
import { mobileAuthMiddleware } from "../mobile-auth";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "in_progress", "ready_for_review", "closed"] as const;
type PunchSeverity = (typeof SEVERITIES)[number];
type PunchStatus = (typeof STATUSES)[number];

const CreateSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  severity: z.enum(SEVERITIES).default("medium"),
  status: z.enum(STATUSES).default("open"),
  assignee: z.string().max(120).optional(),
  dueDate: z.string().optional(),
  locationLabel: z.string().max(300).optional(),
  photoUrl: z.string().max(1000).optional(),
  projectId: z.string().max(100).optional(),
  trade: z.string().max(100).optional(),
  createdBy: z.string().max(120).optional(),
});
const PatchSchema = CreateSchema.partial();

interface Row {
  id: string;
  title: string;
  description: string | null;
  severity: PunchSeverity;
  status: PunchStatus;
  assignee: string | null;
  due_date: string | null;
  location_label: string | null;
  photo_url: string | null;
  project_id: string | null;
  trade: string | null;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

function rowToJson(r: Row) {
  return {
    id: r.id,
    title: r.title,
    description: r.description || undefined,
    severity: r.severity,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    geoAccuracy: r.geo_accuracy != null ? Number(r.geo_accuracy) : null,
    status: r.status,
    assignee: r.assignee || undefined,
    dueDate: r.due_date || undefined,
    locationLabel: r.location_label || undefined,
    photoUrl: r.photo_url || undefined,
    projectId: r.project_id || undefined,
    trade: r.trade || undefined,
    createdBy: r.created_by || undefined,
    createdAt: r.created_at,
    closedAt: r.closed_at || undefined,
    updatedAt: r.updated_at,
  };
}

// ---------- Bootstrap ----------

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS punch_items (
      id              varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      title           varchar(500) NOT NULL,
      description     text,
      severity        varchar(16) NOT NULL DEFAULT 'medium',
      status          varchar(24) NOT NULL DEFAULT 'open',
      assignee        varchar(120),
      due_date        date,
      location_label  varchar(300),
      photo_url       varchar(1000),
      project_id      varchar(100),
      trade           varchar(100),
      created_by      varchar(120),
      created_at      timestamptz NOT NULL DEFAULT now(),
      closed_at       timestamptz,
      updated_at      timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS punch_items_project_idx ON punch_items (project_id, status);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS punch_items_status_idx ON punch_items (status, created_at DESC);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS punch_items_assignee_idx ON punch_items (assignee, status);`);
  // FW4: GPS columns (idempotent ALTER TABLE)
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS latitude double precision`);
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS longitude double precision`);
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS geo_accuracy double precision`);
  bootstrapped = true;
}

async function maybeSeed(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM punch_items`);
  if (Number(rows[0]?.count || 0) > 0) return;
  const today = new Date();
  const plusDays = (n: number) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO punch_items (title, description, severity, status, assignee, due_date, location_label, trade, project_id, created_by)
     VALUES
       ($1,$2,'critical','open',$3,$4,'Stairwell B / Level 3','electrical','default','Chad Derocher'),
       ($5,$6,'high','open',$7,$8,'Conference Room 201','drywall','default','Chad Derocher'),
       ($9,$10,'medium','in_progress',$11,$12,'Lobby east wall','paint','default','Chad Derocher'),
       ($13,$14,'low','ready_for_review',$15,$16,'Reception ceiling','finishes','default','Chad Derocher'),
       ($17,$18,'high','closed',$19,$20,'Mech room','fire-life-safety','default','Chad Derocher')
    `,
    [
      "Exit sign not illuminated", "Right side of egress door at Stairwell B/3 — bulb out and no battery backup", "M. Reyes (Bolt Electric)", plusDays(2),
      "Drywall seam visible", "Tape joint showing through paint along south wall of Conference 201", "K. Holloway (Apex)", plusDays(4),
      "Touch-up paint on lobby wall", "Scuff at chair-rail height, 8 ft from east window", "J. Park (Castro Painting)", plusDays(7),
      "Replace stained ceiling tile", "12x12 grid B-4, water stain", "M. Garcia (Castro)", plusDays(3),
      "Fire damper certificate missing", "Penetration above mech room ceiling needs FD certificate", "Bell Sprinklers", plusDays(-1),
    ],
  );
  // Stamp closed_at on the seed-closed row
  await pool.query(`UPDATE punch_items SET closed_at = now() WHERE status = 'closed' AND closed_at IS NULL`);
}

async function bootstrapOnce(): Promise<void> {
  try {
    await ensureTable();
    await maybeSeed();
  } catch (e) {
    console.error("[punch-items] bootstrap failed", e);
  }
}
void bootstrapOnce();

// ---------- Router ----------

const router = Router();

// Sprint F5 — gate behind auth (toggle with SENTINEL_MOBILE_REQUIRE_AUTH=true)
router.use(mobileAuthMiddleware);
router.use(async (_req, _res, next) => { if (!bootstrapped) await bootstrapOnce(); next(); });

router.get("/", async (req: Request, res: Response) => {
  const { projectId, status, assignee, severity } = req.query as Record<string, string | undefined>;
  const filters: string[] = [];
  const params: any[] = [];
  if (projectId) { params.push(projectId); filters.push(`project_id = $${params.length}`); }
  if (status) { params.push(status); filters.push(`status = $${params.length}`); }
  if (assignee) { params.push(assignee); filters.push(`assignee = $${params.length}`); }
  if (severity) { params.push(severity); filters.push(`severity = $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await pool.query<Row>(
    `SELECT * FROM punch_items ${where} ORDER BY
       CASE status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'ready_for_review' THEN 2 ELSE 3 END,
       CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       created_at DESC`,
    params,
  );
  res.json(rows.map(rowToJson));
});

router.get("/_meta/stats", async (_req, res) => {
  const total = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM punch_items`);
  const statuses = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM punch_items GROUP BY status`,
  );
  const overdue = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM punch_items WHERE status <> 'closed' AND due_date IS NOT NULL AND due_date < CURRENT_DATE`,
  );
  const last7Closed = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM punch_items WHERE status = 'closed' AND closed_at >= now() - interval '7 days'`,
  );
  const byStatus: Record<string, number> = {};
  for (const r of statuses.rows) byStatus[r.status] = Number(r.count);
  res.json({
    total: Number(total.rows[0]?.count || 0),
    byStatus,
    overdue: Number(overdue.rows[0]?.count || 0),
    closedLast7: Number(last7Closed.rows[0]?.count || 0),
  });
});

router.get("/:id", async (req, res) => {
  const { rows } = await pool.query<Row>(`SELECT * FROM punch_items WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Punch item not found" });
  res.json(rowToJson(rows[0]));
});

router.post("/", async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  const d = parsed.data;
  const closedAt = d.status === "closed" ? new Date() : null;
  const { rows } = await pool.query<Row>(
    `INSERT INTO punch_items
       (title, description, severity, status, assignee, due_date, location_label, photo_url, project_id, trade, created_by, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      d.title,
      d.description ?? null,
      d.severity,
      d.status,
      d.assignee ?? null,
      d.dueDate ?? null,
      d.locationLabel ?? null,
      d.photoUrl ?? null,
      d.projectId ?? null,
      d.trade ?? null,
      d.createdBy ?? null,
      closedAt,
    ],
  );
  res.status(201).json(rowToJson(rows[0]));
});

router.patch("/:id", async (req, res) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  const d = parsed.data;
  const sets: string[] = [];
  const vals: any[] = [];
  const add = (col: string, val: any) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if (d.title !== undefined) add("title", d.title);
  if (d.description !== undefined) add("description", d.description);
  if (d.severity !== undefined) add("severity", d.severity);
  if (d.status !== undefined) {
    add("status", d.status);
    // Auto-stamp closed_at on transition into/out-of 'closed'
    if (d.status === "closed") sets.push(`closed_at = COALESCE(closed_at, now())`);
    else sets.push(`closed_at = NULL`);
  }
  if (d.assignee !== undefined) add("assignee", d.assignee);
  if (d.dueDate !== undefined) add("due_date", d.dueDate || null);
  if (d.locationLabel !== undefined) add("location_label", d.locationLabel);
  if (d.photoUrl !== undefined) add("photo_url", d.photoUrl);
  if (d.projectId !== undefined) add("project_id", d.projectId);
  if (d.trade !== undefined) add("trade", d.trade);
  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
  sets.push(`updated_at = now()`);
  vals.push(req.params.id);
  const { rows } = await pool.query<Row>(
    `UPDATE punch_items SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  if (!rows[0]) return res.status(404).json({ error: "Punch item not found" });
  res.json(rowToJson(rows[0]));
});

router.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM punch_items WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Punch item not found" });
  res.json({ ok: true });
});

export default router;
