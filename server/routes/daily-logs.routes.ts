/**
 * Sprint F1 — Daily Log REST routes — POSTGRES PERSISTENCE
 *
 * Replaces the original in-memory store. Survives Replit Autoscale container
 * restarts. Auto-creates the field_daily_logs table on first request if missing
 * (idempotent CREATE TABLE IF NOT EXISTS) so the server boots even before
 * `npm run db:push` has been run.
 *
 * GET    /api/daily-logs                   → list (filters: projectId, date, status)
 * GET    /api/daily-logs/_meta/stats       → counts by status + last-7 + today
 * GET    /api/daily-logs/:id               → fetch single
 * POST   /api/daily-logs                   → upsert draft (idempotent per project+date)
 * PATCH  /api/daily-logs/:id               → partial update
 * DELETE /api/daily-logs/:id               → hard delete (dev only)
 */

import { Router, type Request, type Response } from "express";
import { mobileAuthMiddleware } from "../mobile-auth";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

// ---------- Zod validation (mirrors the JSON columns) ----------

const trade = z.enum([
  "carpenter", "electrician", "plumber", "drywall", "painter",
  "concrete", "ironworker", "mason", "roofer", "hvac",
  "laborer", "operator", "foreman", "super", "other",
]);

const crewEntrySchema = z.object({
  trade,
  count: z.number().int().min(0).max(500),
  hours: z.number().min(0).max(24),
  contractor: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});

const deliverySchema = z.object({
  time: z.string().max(10),
  vendor: z.string().min(1).max(120),
  material: z.string().min(1).max(240),
  ticket: z.string().max(60).optional(),
});

const visitorSchema = z.object({
  time: z.string().max(10),
  name: z.string().min(1).max(120),
  company: z.string().max(120).optional(),
  purpose: z.string().max(240).optional(),
});

const equipmentSchema = z.object({
  label: z.string().min(1).max(120),
  hours: z.number().min(0).max(24).optional(),
  operator: z.string().max(120).optional(),
});

const weatherSchema = z.object({
  conditions: z.string().max(60).optional(),
  high: z.number().min(-50).max(150).optional(),
  low: z.number().min(-50).max(150).optional(),
  precip: z.number().min(0).max(20).optional(),
  wind: z.number().min(0).max(200).optional(),
  source: z.enum(["auto", "manual"]).optional(),
});

const dailyLogSchema = z.object({
  projectId: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  superId: z.string().max(80).optional(),
  superName: z.string().max(120).optional(),
  weather: weatherSchema.optional(),
  crew: z.array(crewEntrySchema).default([]),
  equipment: z.array(equipmentSchema).default([]),
  deliveries: z.array(deliverySchema).default([]),
  visitors: z.array(visitorSchema).default([]),
  narrative: z.string().max(8000).optional(),
  delayHours: z.number().min(0).max(24).optional(),
  delayReason: z.string().max(500).optional(),
  photoUrls: z.array(z.string().url()).default([]),
  signature: z.string().optional(),
  signedAt: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  geoAccuracy: z.number().min(0).optional().nullable(),
  status: z.enum(["draft", "submitted", "approved"]).default("draft"),
});

const partialDailyLogSchema = dailyLogSchema.partial();

type DailyLogInput = z.infer<typeof dailyLogSchema>;

interface DailyLogRow {
  id: string;
  project_id: string;
  date: string;
  super_id: string | null;
  super_name: string | null;
  weather: any | null;
  crew: any;
  equipment: any;
  deliveries: any;
  visitors: any;
  narrative: string | null;
  delay_hours: number | null;
  delay_reason: string | null;
  photo_urls: any;
  signature: string | null;
  signed_at: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_accuracy: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToJson(r: DailyLogRow) {
  return {
    id: r.id,
    projectId: r.project_id,
    date: typeof r.date === "string" ? r.date.slice(0, 10) : r.date,
    superId: r.super_id || undefined,
    superName: r.super_name || undefined,
    weather: r.weather || undefined,
    crew: r.crew || [],
    equipment: r.equipment || [],
    deliveries: r.deliveries || [],
    visitors: r.visitors || [],
    narrative: r.narrative || undefined,
    delayHours: r.delay_hours == null ? undefined : Number(r.delay_hours),
    delayReason: r.delay_reason || undefined,
    photoUrls: r.photo_urls || [],
    signature: r.signature || undefined,
    signedAt: r.signed_at || undefined,
    latitude: r.latitude == null ? null : Number(r.latitude),
    longitude: r.longitude == null ? null : Number(r.longitude),
    geoAccuracy: r.geo_accuracy == null ? null : Number(r.geo_accuracy),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------- Bootstrap: CREATE TABLE IF NOT EXISTS ----------

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS field_daily_logs (
      id          varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  varchar(80) NOT NULL,
      date        date NOT NULL,
      super_id    varchar(80),
      super_name  varchar(120),
      weather     jsonb,
      crew        jsonb NOT NULL DEFAULT '[]'::jsonb,
      equipment   jsonb NOT NULL DEFAULT '[]'::jsonb,
      deliveries  jsonb NOT NULL DEFAULT '[]'::jsonb,
      visitors    jsonb NOT NULL DEFAULT '[]'::jsonb,
      narrative   text,
      delay_hours numeric(4,2),
      delay_reason varchar(500),
      photo_urls  jsonb NOT NULL DEFAULT '[]'::jsonb,
      signature   text,
      signed_at   timestamptz,
      status      varchar(16) NOT NULL DEFAULT 'draft',
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  // FW4: GPS columns
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS latitude double precision`);
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS longitude double precision`);
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS geo_accuracy double precision`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_logs_project_date_idx ON field_daily_logs (project_id, date DESC);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS daily_logs_status_idx ON field_daily_logs (status);`);
  // Ensure only one draft per project+date (the idempotent-upsert depends on this)
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS daily_logs_one_draft_per_day
      ON field_daily_logs (project_id, date)
      WHERE status = 'draft';
  `);
  bootstrapped = true;
}

// Seed two rows on first boot so the page isn't empty in fresh environments.
async function maybeSeed(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM field_daily_logs`);
  if (Number(rows[0]?.count || 0) > 0) return;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await pool.query(
    `INSERT INTO field_daily_logs (project_id, date, super_name, weather, crew, equipment, deliveries, visitors, narrative, photo_urls, status, signed_at)
     VALUES
       ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10::jsonb,$11,$12),
       ($13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22::jsonb,$23,$24)
     ON CONFLICT DO NOTHING`,
    [
      "default", yesterday, "Chad Derocher",
      JSON.stringify({ conditions: "Sunny", high: 78, low: 54, precip: 0, wind: 8, source: "auto" }),
      JSON.stringify([
        { trade: "carpenter", count: 6, hours: 8, contractor: "Apex Framing" },
        { trade: "electrician", count: 3, hours: 8, contractor: "Bolt Electric" },
        { trade: "laborer", count: 4, hours: 8 },
      ]),
      JSON.stringify([
        { label: "Skid steer", hours: 6, operator: "M. Reyes" },
        { label: "Boom lift 60ft", hours: 4 },
      ]),
      JSON.stringify([
        { time: "07:15", vendor: "Builders FirstSource", material: "Framing lumber — 4,200 bf", ticket: "BF-44218" },
        { time: "10:40", vendor: "Heritage Glass", material: "Storefront SF-1 thru SF-3" },
      ]),
      JSON.stringify([{ time: "13:00", name: "Sarah Lin", company: "ABC Owner Rep", purpose: "Weekly walk" }]),
      "Framing complete on Level 2 east wing. Electrical rough-in started in offices 201-205. Glazier confirmed Friday install. No safety incidents. Concrete pour scheduled tomorrow 6am — pumper confirmed.",
      JSON.stringify([]),
      "submitted",
      yesterday + "T17:42:00Z",

      "default", today, "Chad Derocher",
      JSON.stringify({ conditions: "Partly Cloudy", high: 74, low: 52, precip: 0.05, wind: 12, source: "auto" }),
      JSON.stringify([
        { trade: "concrete", count: 8, hours: 10, contractor: "Solid Pour Co" },
        { trade: "laborer", count: 5, hours: 10 },
      ]),
      JSON.stringify([{ label: "Concrete pumper 56m", hours: 5 }]),
      JSON.stringify([{ time: "06:00", vendor: "Cemex", material: "Ready-mix 4000psi — 42 cy", ticket: "CMX-99812" }]),
      JSON.stringify([]),
      "Pour Day. Slab on grade Phase 1 complete. 42 cy placed. Vibrated, screeded, bull-floated. Curing blankets down by 1100. Inspector signed off at 1145.",
      JSON.stringify([]),
      "draft",
      null,
    ],
  );
}

async function bootstrapOnce(): Promise<void> {
  try {
    await ensureTable();
    await maybeSeed();
  } catch (e) {
    console.error("[daily-logs] bootstrap failed", e);
  }
}

// Kick off in the background so first request doesn't pay the cost
void bootstrapOnce();

// ---------- Router ----------

export const dailyLogsRouter = Router();

// Sprint F5 — gate behind auth (toggle with SENTINEL_MOBILE_REQUIRE_AUTH=true)
dailyLogsRouter.use(mobileAuthMiddleware);

// Run-on-first-request safety net (in case bootstrap raced the import)
dailyLogsRouter.use(async (_req, _res, next) => {
  if (!bootstrapped) await bootstrapOnce();
  next();
});

dailyLogsRouter.get("/", async (req, res) => {
  const { projectId, date, status } = req.query as Record<string, string | undefined>;
  const filters: string[] = [];
  const params: any[] = [];
  if (projectId) { params.push(projectId); filters.push(`project_id = $${params.length}`); }
  if (date) { params.push(date); filters.push(`date = $${params.length}`); }
  if (status) { params.push(status); filters.push(`status = $${params.length}`); }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const { rows } = await pool.query<DailyLogRow>(
    `SELECT * FROM field_daily_logs ${where} ORDER BY date DESC, created_at DESC`,
    params,
  );
  res.json(rows.map(rowToJson));
});

dailyLogsRouter.get("/_meta/stats", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const last7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const totalRow = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM field_daily_logs`);
  const statusRows = await pool.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*)::text AS count FROM field_daily_logs GROUP BY status`,
  );
  const last7Row = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM field_daily_logs WHERE date >= $1`,
    [last7],
  );
  const todayRow = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM field_daily_logs WHERE date = $1`,
    [today],
  );
  const byStatus: Record<string, number> = {};
  for (const r of statusRows.rows) byStatus[r.status] = Number(r.count);
  res.json({
    total: Number(totalRow.rows[0]?.count || 0),
    byStatus,
    last7Count: Number(last7Row.rows[0]?.count || 0),
    todayCount: Number(todayRow.rows[0]?.count || 0),
  });
});

dailyLogsRouter.get("/:id", async (req, res) => {
  const { rows } = await pool.query<DailyLogRow>(`SELECT * FROM field_daily_logs WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Daily log not found" });
  res.json(rowToJson(rows[0]));
});

dailyLogsRouter.post("/", async (req, res) => {
  const parsed = dailyLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  const d: DailyLogInput = parsed.data;

  // Idempotent: if a draft exists for project+date, update it. Otherwise insert.
  const existing = await pool.query<DailyLogRow>(
    `SELECT id FROM field_daily_logs WHERE project_id = $1 AND date = $2 AND status = 'draft' LIMIT 1`,
    [d.projectId, d.date],
  );
  if (existing.rows[0] && d.status === "draft") {
    const { rows } = await pool.query<DailyLogRow>(
      `UPDATE field_daily_logs SET
         super_id    = $2,
         super_name  = $3,
         weather     = $4::jsonb,
         crew        = $5::jsonb,
         equipment   = $6::jsonb,
         deliveries  = $7::jsonb,
         visitors    = $8::jsonb,
         narrative   = $9,
         delay_hours = $10,
         delay_reason= $11,
         photo_urls  = $12::jsonb,
         signature   = $13,
         latitude    = $14,
         longitude   = $15,
         geo_accuracy= $16,
         updated_at  = now()
       WHERE id = $1
       RETURNING *`,
      [
        existing.rows[0].id,
        d.superId ?? null,
        d.superName ?? null,
        d.weather ? JSON.stringify(d.weather) : null,
        JSON.stringify(d.crew ?? []),
        JSON.stringify(d.equipment ?? []),
        JSON.stringify(d.deliveries ?? []),
        JSON.stringify(d.visitors ?? []),
        d.narrative ?? null,
        d.delayHours ?? null,
        d.delayReason ?? null,
        JSON.stringify(d.photoUrls ?? []),
        d.signature ?? null,
        d.latitude ?? null,
        d.longitude ?? null,
        d.geoAccuracy ?? null,
      ],
    );
    return res.status(200).json(rowToJson(rows[0]));
  }

  const { rows } = await pool.query<DailyLogRow>(
    `INSERT INTO field_daily_logs
       (project_id, date, super_id, super_name, weather, crew, equipment, deliveries, visitors,
        narrative, delay_hours, delay_reason, photo_urls, signature, signed_at, status,
        latitude, longitude, geo_accuracy)
     VALUES
       ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      d.projectId, d.date,
      d.superId ?? null, d.superName ?? null,
      d.weather ? JSON.stringify(d.weather) : null,
      JSON.stringify(d.crew ?? []),
      JSON.stringify(d.equipment ?? []),
      JSON.stringify(d.deliveries ?? []),
      JSON.stringify(d.visitors ?? []),
      d.narrative ?? null,
      d.delayHours ?? null,
      d.delayReason ?? null,
      JSON.stringify(d.photoUrls ?? []),
      d.signature ?? null,
      d.signedAt ?? (d.status === "submitted" ? new Date().toISOString() : null),
      d.status ?? "draft",
      d.latitude ?? null,
      d.longitude ?? null,
      d.geoAccuracy ?? null,
    ],
  );
  res.status(201).json(rowToJson(rows[0]));
});

dailyLogsRouter.patch("/:id", async (req, res) => {
  const parsed = partialDailyLogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  const d = parsed.data;
  const sets: string[] = [];
  const vals: any[] = [];
  const add = (col: string, val: any, jsonb = false) => {
    vals.push(val);
    sets.push(`${col} = $${vals.length}${jsonb ? "::jsonb" : ""}`);
  };
  if (d.superId !== undefined) add("super_id", d.superId);
  if (d.superName !== undefined) add("super_name", d.superName);
  if (d.weather !== undefined) add("weather", d.weather ? JSON.stringify(d.weather) : null, true);
  if (d.crew !== undefined) add("crew", JSON.stringify(d.crew), true);
  if (d.equipment !== undefined) add("equipment", JSON.stringify(d.equipment), true);
  if (d.deliveries !== undefined) add("deliveries", JSON.stringify(d.deliveries), true);
  if (d.visitors !== undefined) add("visitors", JSON.stringify(d.visitors), true);
  if (d.narrative !== undefined) add("narrative", d.narrative);
  if (d.delayHours !== undefined) add("delay_hours", d.delayHours);
  if (d.delayReason !== undefined) add("delay_reason", d.delayReason);
  if (d.photoUrls !== undefined) add("photo_urls", JSON.stringify(d.photoUrls), true);
  if (d.signature !== undefined) add("signature", d.signature);
  if (d.signedAt !== undefined) add("signed_at", d.signedAt);
  if (d.latitude !== undefined) add("latitude", d.latitude);
  if (d.longitude !== undefined) add("longitude", d.longitude);
  if (d.geoAccuracy !== undefined) add("geo_accuracy", d.geoAccuracy);
  if (d.status !== undefined) {
    add("status", d.status);
    if (d.status === "submitted" && d.signedAt === undefined) add("signed_at", new Date().toISOString());
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  sets.push(`updated_at = now()`);
  vals.push(req.params.id);
  const { rows } = await pool.query<DailyLogRow>(
    `UPDATE field_daily_logs SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
    vals,
  );
  if (!rows[0]) return res.status(404).json({ error: "Daily log not found" });
  res.json(rowToJson(rows[0]));
});

dailyLogsRouter.delete("/:id", async (req, res) => {
  const { rowCount } = await pool.query(`DELETE FROM field_daily_logs WHERE id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "Daily log not found" });
  res.json({ ok: true });
});

export default dailyLogsRouter;
