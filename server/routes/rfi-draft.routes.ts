// Roadmap Feature 5 — HTTP surface for Herbie-drafted RFIs.
//
// POST /api/rfi/draft   — Herbie (or a user) drafts an RFI.
//                         Creates the rfis row in draft_pending_approval
//                         and files an approval request. Dispatcher
//                         registered at boot handles the post-approval
//                         transition.

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { draftRfi } from "../services/rfi-draft.service";

const router = Router();
const DEFAULT_TENANT_ID = "blackhawk-default";

function tenantOf(req: Request): string {
  return (req as any)?.user?.tenantId || DEFAULT_TENANT_ID;
}

const DraftInputSchema = z.object({
  projectId: z.string().uuid(),
  rfiNumber: z.string().max(40).optional(),
  subject: z.string().min(1).max(300),
  question: z.string().min(1).max(8000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedToUserId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  attachmentsJson: z.any().optional(),
  distributionJson: z.any().optional(),
  draftedBy: z.string().max(80).optional(),
});

router.post("/draft", async (req: Request, res: Response) => {
  try {
    const parsed = DraftInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    }
    const tenantId = tenantOf(req);
    const result = await draftRfi({ tenantId, ...parsed.data });
    res.status(201).json(result);
  } catch (error: any) {
    console.error("POST /api/rfi/draft error:", error);
    res.status(500).json({ error: error?.message ?? "Failed to draft RFI" });
  }
});

export const rfiDraftRouter = router;
