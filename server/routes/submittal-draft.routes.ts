// Roadmap Feature 5 — HTTP surface for Herbie-drafted submittals.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { draftSubmittal } from "../services/submittal-draft.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

const DraftInputSchema = z.object({
  projectId: z.string().uuid(),
  submittalNumber: z.string().max(40).optional(),
  name: z.string().min(1).max(300),
  submittalType: z.string().max(80).optional(),
  description: z.string().max(8000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  managerName: z.string().max(200).optional(),
  contractorName: z.string().max(200).optional(),
  approvers: z.string().max(1000).optional(),
  reference: z.string().max(200).optional(),
  attachmentsJson: z.any().optional(),
  draftedBy: z.string().max(80).optional(),
});

router.post("/draft", async (req: Request, res: Response) => {
  try {
    const parsed = DraftInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const result = await draftSubmittal({ tenantId, ...parsed.data });
    res.status(201).json(result);
  } catch (error: any) {
    console.error("POST /api/submittal/draft error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to draft submittal" });
  }
});

export const submittalDraftRouter = router;
