// ============================================================================
// punch-items.routes.ts — Sprint 9.1 backend
// ----------------------------------------------------------------------------
// REST surface for the Punch List module.
//
// v1: in-memory store keyed by punch item id. Persists across requests for the
// life of the server process; survives Replit Autoscale restarts because every
// request re-seeds from baseline when the map is empty. Swap to Drizzle when
// you want multi-server consistency.
//
// Endpoints:
//   GET    /api/punch-items                — list (optional ?projectId, ?status)
//   GET    /api/punch-items/:id            — get one
//   POST   /api/punch-items                — create
//   PATCH  /api/punch-items/:id            — partial update (status, assignee, ...)
//   DELETE /api/punch-items/:id            — delete
//
// Status transitions auto-set closedAt when status flips to "closed" and clear
// it when status flips back out of closed.
// ============================================================================

import { Router, type Request, type Response } from "express";
import { z } from "zod";

const router = Router();

// ── Types ────────────────────────────────────────────────────────────────────

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "in_progress", "ready_for_review", "closed"] as const;

type PunchSeverity = (typeof SEVERITIES)[number];
type PunchStatus = (typeof STATUSES)[number];

interface PunchItem {
  id: string;
  title: string;
  description?: string;
  severity: PunchSeverity;
  status: PunchStatus;
  assignee?: string;
  dueDate?: string;
  locationLabel?: string;
  photoUrl?: string;
  createdAt: string;
  closedAt?: string;
  projectId?: string;
  trade?: string;
  createdBy?: string;
}

// ── Validation ───────────────────────────────────────────────────────────────

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

// ── Store ────────────────────────────────────────────────────────────────────

const store = new Map<string, PunchItem>();

function nextId(): string {
  return `p-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function seedIfEmpty() {
  if (store.size > 0) return;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const seeds: PunchItem[] = [
    {
      id: "p-1001",
      title: "Ceiling tile broken in Conference Room B",
      severity: "medium",
      status: "open",
      assignee: "Jose M.",
      dueDate: new Date(now + 3 * day).toISOString(),
      locationLabel: "Level 3 / Conference Room B",
      trade: "drywall",
      createdAt: new Date(now - 1 * day).toISOString(),
    },
    {
      id: "p-1002",
      title: "Outlet not grounded — east wall, Unit 412",
      severity: "critical",
      status: "open",
      assignee: "Marco R.",
      dueDate: new Date(now + 1 * day).toISOString(),
      locationLabel: "Level 4 / Unit 412",
      trade: "electrical",
      createdAt: new Date(now - 2 * day).toISOString(),
    },
    {
      id: "p-1003",
      title: "Paint touch-up — corridor 3A",
      severity: "low",
      status: "in_progress",
      assignee: "Sara K.",
      dueDate: new Date(now + 7 * day).toISOString(),
      locationLabel: "Level 3 / Corridor 3A",
      trade: "paint",
      createdAt: new Date(now - 4 * day).toISOString(),
    },
    {
      id: "p-1004",
      title: "Door hardware re-keyed",
      severity: "medium",
      status: "ready_for_review",
      assignee: "Jose M.",
      locationLabel: "Level 1 / Main Entry",
      trade: "finishes",
      createdAt: new Date(now - 6 * day).toISOString(),
    },
    {
      id: "p-1005",
      title: "Smoke detector tested + signed off",
      severity: "high",
      status: "closed",
      assignee: "Marco R.",
      locationLabel: "Level 2 / All units",
      trade: "fire-life-safety",
      createdAt: new Date(now - 9 * day).toISOString(),
      closedAt: new Date(now - 1 * day).toISOString(),
    },
  ];
  for (const s of seeds) store.set(s.id, s);
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// GET /api/punch-items
router.get("/", (req: Request, res: Response) => {
  seedIfEmpty();
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  let items = Array.from(store.values());
  if (projectId) items = items.filter((it) => it.projectId === projectId);
  if (status && STATUSES.includes(status as PunchStatus)) {
    items = items.filter((it) => it.status === status);
  }
  // Newest first
  items.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  res.json(items);
});

// GET /api/punch-items/:id
router.get("/:id", (req: Request, res: Response) => {
  seedIfEmpty();
  const it = store.get(String(req.params.id));
  if (!it) return res.status(404).json({ error: "Not found" });
  res.json(it);
});

// POST /api/punch-items
router.post("/", (req: Request, res: Response) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
  }
  seedIfEmpty();
  const id = nextId();
  const item: PunchItem = {
    ...parsed.data,
    id,
    createdAt: new Date().toISOString(),
    closedAt: parsed.data.status === "closed" ? new Date().toISOString() : undefined,
  };
  store.set(id, item);
  res.status(201).json(item);
});

// PATCH /api/punch-items/:id
router.patch("/:id", (req: Request, res: Response) => {
  const parsed = PatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
  }
  seedIfEmpty();
  const id = String(req.params.id);
  const existing = store.get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const updated: PunchItem = {
    ...existing,
    ...parsed.data,
  };

  // Auto-manage closedAt when status transitions across the closed boundary
  if (parsed.data.status === "closed" && existing.status !== "closed") {
    updated.closedAt = new Date().toISOString();
  } else if (parsed.data.status && parsed.data.status !== "closed" && existing.status === "closed") {
    updated.closedAt = undefined;
  }

  store.set(id, updated);
  res.json(updated);
});

// DELETE /api/punch-items/:id
router.delete("/:id", (req: Request, res: Response) => {
  seedIfEmpty();
  const id = String(req.params.id);
  if (!store.has(id)) return res.status(404).json({ error: "Not found" });
  store.delete(id);
  res.status(204).end();
});

// ── Diagnostics (handy for QA, no PII) ──────────────────────────────────────

// GET /api/punch-items/_stats — counts only, for the health endpoint
router.get("/_meta/stats", (_req: Request, res: Response) => {
  seedIfEmpty();
  const items = Array.from(store.values());
  const byStatus = STATUSES.reduce<Record<string, number>>((acc, s) => {
    acc[s] = items.filter((it) => it.status === s).length;
    return acc;
  }, {});
  const overdue = items.filter(
    (it) => it.status !== "closed" && it.dueDate && new Date(it.dueDate).getTime() < Date.now(),
  ).length;
  res.json({ total: items.length, byStatus, overdue });
});

export default router;
