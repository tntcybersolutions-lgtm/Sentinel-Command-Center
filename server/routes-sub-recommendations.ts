import { Router } from "express";
import { recommendSubsForTrade, recommendForBidProjectTrades } from "./services/sub-recommendation.service";

export const subRecommendationRouter = Router();

function tenantOf(req: any): string | null {
  if (typeof req.body?.tenantId === "string") return req.body.tenantId;
  if (req.user?.tenantId) return String(req.user.tenantId);
  if (typeof req.query?.tenantId === "string") return String(req.query.tenantId);
  return null;
}

// GET /api/subcontractors/recommend?division=22&section=22 4000&limit=3&tenantId=...
subRecommendationRouter.get("/api/subcontractors/recommend", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return res.status(400).json({ ok: false, error: "missing tenantId (provide via auth, body, or query)" });
  const division = String(req.query.division || "").trim();
  if (!division) return res.status(400).json({ ok: false, error: "missing required query param: division" });
  const section = req.query.section ? String(req.query.section) : null;
  const limit = Math.min(parseInt(String(req.query.limit || "5"), 10) || 5, 50);
  try {
    const subs = await recommendSubsForTrade({ tenantId, csiDivision: division, csiSection: section, limit });
    return res.json({ ok: true, division, section, count: subs.length, subs });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// POST /api/subcontractors/recommend-batch  body: { trades: [{csiDivision, csiSection?}], perTradeLimit?, tenantId? }
subRecommendationRouter.post("/api/subcontractors/recommend-batch", async (req, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return res.status(400).json({ ok: false, error: "missing tenantId" });
  const trades: any[] = Array.isArray(req.body?.trades) ? req.body.trades : [];
  if (!trades.length) return res.status(400).json({ ok: false, error: "missing trades[]" });
  const perTradeLimit = Math.min(parseInt(String(req.body?.perTradeLimit || "3"), 10) || 3, 25);
  try {
    const out = await recommendForBidProjectTrades({ tenantId, trades, perTradeLimit });
    return res.json({ ok: true, results: out });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
