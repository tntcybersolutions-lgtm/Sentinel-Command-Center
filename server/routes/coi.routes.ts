// Roadmap Feature 3 — COI tracker HTTP surface.
//
// Thin wrappers around server/services/coi.service.ts. All handlers
// use DEFAULT_TENANT_ID until multi-tenant auth arrives; keep the
// tenant derivation in one place here so upgrading is a single-file
// change.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  upsertCoi,
  getCoi,
  listForProject,
  listForVendor,
  coisExpiringWithin,
  expiryTier,
  tierSeverity,
  partitionByTier,
  COI_ALERT_DAYS,
} from "../services/coi.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

const POLICY_TYPES = [
  "gl",
  "wc",
  "auto",
  "umbrella",
  "professional",
  "pollution",
  "builders_risk",
] as const;

const CoiInputSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  policyType: z.enum(POLICY_TYPES),
  carrier: z.string().max(200).optional(),
  policyNumber: z.string().max(100).optional(),
  limitsJson: z.record(z.any()).optional(),
  effectiveDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  documentId: z.string().uuid().optional(),
  status: z
    .enum(["active", "expired", "pending_renewal", "cancelled"])
    .optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/coi — create or update a COI on the composite key.
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = CoiInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const row = await upsertCoi({ tenantId, ...parsed.data });
    res.status(201).json(row);
  } catch (error: any) {
    console.error("POST /api/coi error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to upsert COI" });
  }
});

// GET /api/coi/:id
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const row = await getCoi(tenantId, String(req.params.id));
    if (!row) return res.status(404).json({ error: "Not found" });
    const tier = expiryTier(row);
    res.json({ ...row, tier, severity: tierSeverity(tier) });
  } catch (error: any) {
    console.error("GET /api/coi/:id error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to fetch COI" });
  }
});

// GET /api/coi/project/:projectId — list for a project, with rollup.
router.get("/project/:projectId", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const projectId = String(req.params.projectId);
    const rows = await listForProject(tenantId, projectId);
    const rollup = partitionByTier(rows);
    res.json({
      rows,
      rollup: {
        total: rows.length,
        expired: rollup.expired.length,
        critical_1d: rollup.critical_1d.length,
        critical_7d: rollup.critical_7d.length,
        warning_14d: rollup.warning_14d.length,
        warning_30d: rollup.warning_30d.length,
        ok: rollup.ok.length,
      },
    });
  } catch (error: any) {
    console.error("GET /api/coi/project error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list project COIs" });
  }
});

// GET /api/coi/vendor/:vendorId
router.get("/vendor/:vendorId", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const vendorId = String(req.params.vendorId);
    const rows = await listForVendor(tenantId, vendorId);
    res.json(rows);
  } catch (error: any) {
    console.error("GET /api/coi/vendor error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list vendor COIs" });
  }
});

// GET /api/coi/expiring/:days — driver for the proactive monitor
// (Feature 9) and the cockpit expiring-soon widget.
router.get("/expiring/:days", async (req: Request, res: Response) => {
  try {
    const tenantId = tenantOf(req);
    const daysRaw = Number.parseInt(String(req.params.days), 10);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? daysRaw : 30;
    const rows = await coisExpiringWithin(tenantId, days);
    res.json({
      windowDays: days,
      alertThresholds: COI_ALERT_DAYS,
      rows: rows.map((r) => {
        const tier = expiryTier(r);
        return { ...r, tier, severity: tierSeverity(tier) };
      }),
    });
  } catch (error: any) {
    console.error("GET /api/coi/expiring error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to list expiring COIs" });
  }
});

export const coiRouter = router;
