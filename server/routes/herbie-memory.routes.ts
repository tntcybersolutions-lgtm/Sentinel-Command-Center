// Roadmap Feature 8 — Herbie three-layer memory HTTP surface.
//
// Thin wrappers around server/services/herbie-facts.service.ts.
// Writes honor the confidence-gated routing in the service (< 0.7 →
// review queue rather than direct persist). Reads are scoped by
// tenant and optionally by project.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  recordFact,
  recordDecision,
  recordRelationship,
  getFacts,
  getDecisions,
  getRelationships,
  getProjectMemoryBlock,
} from "../services/herbie-facts.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

// ── facts ────────────────────────────────────────────────────────
const FactInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  subjectType: z.string().min(1).max(80),
  subjectId: z.string().uuid().nullable().optional(),
  predicate: z.string().min(1).max(200),
  object: z.string().nullable().optional(),
  objectJson: z.record(z.any()).nullable().optional(),
  sourceType: z.enum(["document", "message", "user", "herbie_extraction"]),
  sourceId: z.string().uuid().nullable().optional(),
  confidence: z.number().min(0).max(1),
  extractedAt: z.coerce.date().optional(),
});

router.post("/facts", async (req: Request, res: Response) => {
  try {
    const parsed = FactInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const result = await recordFact({ tenantId, ...parsed.data });
    res.status(201).json(result);
  } catch (error: any) {
    console.error("POST /api/herbie/memory/facts error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to record fact" });
  }
});

router.get("/facts", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const subjectType = req.query.subjectType ? String(req.query.subjectType) : undefined;
    const subjectId = req.query.subjectId ? String(req.query.subjectId) : undefined;
    const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined;
    const rows = await getFacts({ tenantId, projectId, subjectType, subjectId, limit });
    res.json(rows);
  } catch (error: any) {
    console.error("GET /api/herbie/memory/facts error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list facts" });
  }
});

// ── decisions ────────────────────────────────────────────────────
const DecisionInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  summary: z.string().min(1).max(500),
  rationale: z.string().max(4000).optional(),
  decidedBy: z.string().min(1).max(80),
  decidedAt: z.coerce.date().optional(),
  relatedEntityType: z.string().max(80).optional(),
  relatedEntityId: z.string().uuid().optional(),
  metadataJson: z.record(z.any()).optional(),
});

router.post("/decisions", async (req: Request, res: Response) => {
  try {
    const parsed = DecisionInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const row = await recordDecision({ tenantId, ...parsed.data });
    res.status(201).json(row);
  } catch (error: any) {
    console.error("POST /api/herbie/memory/decisions error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to record decision" });
  }
});

router.get("/decisions", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const limit = req.query.limit ? Number.parseInt(String(req.query.limit), 10) : undefined;
    const rows = await getDecisions({ tenantId, projectId, limit });
    res.json(rows);
  } catch (error: any) {
    console.error("GET /api/herbie/memory/decisions error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list decisions" });
  }
});

// ── relationships ────────────────────────────────────────────────
const RelationshipInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  role: z.string().min(1).max(40),
  status: z.enum(["active", "inactive"]).default("active"),
  notes: z.string().max(2000).optional(),
});

router.post("/relationships", async (req: Request, res: Response) => {
  try {
    const parsed = RelationshipInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const row = await recordRelationship({ tenantId, ...parsed.data });
    res.status(201).json(row);
  } catch (error: any) {
    console.error("POST /api/herbie/memory/relationships error:", error);
    const status = /exactly one/.test(error?.message ?? "") ? 400 : 500;
    res.status(status).json({ error: error?.message ?? "Failed to record relationship" });
  }
});

router.get("/relationships", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const role = req.query.role ? String(req.query.role) : undefined;
    const rows = await getRelationships({ tenantId, projectId, role });
    res.json(rows);
  } catch (error: any) {
    console.error("GET /api/herbie/memory/relationships error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list relationships" });
  }
});

// ── combined project memory block (system-prompt assembly input) ──
router.get("/project/:projectId", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = String(req.params.projectId);
    const block = await getProjectMemoryBlock({ tenantId, projectId });
    res.json(block);
  } catch (error: any) {
    console.error("GET /api/herbie/memory/project error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to assemble project memory" });
  }
});

export const herbieMemoryRouter = router;
