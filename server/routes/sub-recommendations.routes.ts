/**
 * Sprint M-FINAL-2: Subcontractor recommendation routes.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { recommendSubsForTrade, recommendForBidProjectTrades } from "../services/sub-recommendation.service";
export const subRecommendationsRouter = Router();
subRecommendationsRouter.get("/", async (req: Request, res: Response) => {
  const trade = String(req.query.trade || "").trim();
  if (!trade) return res.status(400).json({ error: "trade query param required" });
  const limit = Number(req.query.limit) || 5;
  const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
  try {
    res.json(await recommendSubsForTrade({ trade, limit, projectId }));
  } catch (e: any) {
    console.error("[sub-recommendations] by-trade:", e);
    res.status(500).json({ error: e.message || "Recommendation failed" });
  }
});
const byBidSchema = z.object({
  bidProjectId: z.string().min(1),
  trades: z.array(z.string()).optional(),
  limitPerTrade: z.number().int().min(1).max(20).optional(),
});
subRecommendationsRouter.post("/by-bid", async (req: Request, res: Response) => {
  const parsed = byBidSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
  try {
    res.json(await recommendForBidProjectTrades(parsed.data));
  } catch (e: any) {
    console.error("[sub-recommendations] by-bid:", e);
    res.status(500).json({ error: e.message || "Recommendation failed" });
  }
});
export default subRecommendationsRouter;
