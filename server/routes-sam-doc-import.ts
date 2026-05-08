/**
 * Routes for SAM.gov document import.
 * Mounted at /api by server/index.ts
 */
import { Router } from "express";
import { importSamGovDocumentsForBidProject } from "./services/sam-document-importer.service";

export const samDocImportRouter = Router();

/**
 * Manual trigger: import SAM.gov source docs for a bid project.
 * POST /api/bid-projects/:id/import-sam-docs
 */
samDocImportRouter.post("/api/bid-projects/:id/import-sam-docs", async (req, res) => {
  const id = String(req.params.id);
  if (!id) return res.status(400).json({ ok: false, error: "missing bid project id" });
  try {
    const result = await importSamGovDocumentsForBidProject(id);
    return res.status(result.ok ? 200 : 207).json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});
