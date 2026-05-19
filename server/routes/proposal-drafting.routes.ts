/**
 * Sprint M-WIRE-3: Federal proposal drafting routes.
 *
 * Wires the orchestration-tier capability-statement and past-performance
 * writeup endpoints to the proposal-drafting service.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { proposalDrafts } from "@shared/schema";
import {
  generateCapabilityStatement,
  generatePastPerformanceWriteup,
} from "../services/proposal-drafting.service";

export const proposalDraftingRouter = Router();

const capabilitySchema = z.object({
  tenantId: z.string().min(1),
  opportunityId: z.string().min(1),
});

proposalDraftingRouter.post("/capability-statement", async (req: Request, res: Response) => {
  const parsed = capabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  try {
    const out = await generateCapabilityStatement(parsed.data);
    res.json(out);
  } catch (e: any) {
    console.error("[proposal-drafting] capability-statement:", e);
    res.status(500).json({ error: e.message || "Failed" });
  }
});

const pastPerfSchema = z.object({
  tenantId: z.string().min(1),
  oppNaics: z.string().min(1),
  oppKeywords: z.array(z.string()).default([]),
});

proposalDraftingRouter.post("/past-performance", async (req: Request, res: Response) => {
  const parsed = pastPerfSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  }
  try {
    const out = await generatePastPerformanceWriteup(parsed.data);
    res.json(out);
  } catch (e: any) {
    console.error("[proposal-drafting] past-performance:", e);
    res.status(500).json({ error: e.message || "Failed" });
  }
});

// List drafts for a tenant
proposalDraftingRouter.get("/", async (req: Request, res: Response) => {
  const tenantId = req.query.tenantId ? String(req.query.tenantId) : undefined;
  try {
    let rows;
    if (tenantId) {
      rows = await db.select().from(proposalDrafts)
        .where(eq(proposalDrafts.tenantId, tenantId))
        .orderBy(desc(proposalDrafts.createdAt))
        .limit(100);
    } else {
      rows = await db.select().from(proposalDrafts)
        .orderBy(desc(proposalDrafts.createdAt))
        .limit(100);
    }
    res.json(rows);
  } catch (e: any) {
    console.error("[proposal-drafting] list:", e);
    res.status(500).json({ error: e.message });
  }
});

// Fetch one draft
proposalDraftingRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(proposalDrafts)
      .where(eq(proposalDrafts.id, req.params.id))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: "Draft not found" });
    res.json(rows[0]);
  } catch (e: any) {
    console.error("[proposal-drafting] get:", e);
    res.status(500).json({ error: e.message });
  }
});

export default proposalDraftingRouter;
