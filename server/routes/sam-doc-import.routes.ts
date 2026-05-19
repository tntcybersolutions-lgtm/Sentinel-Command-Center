/**
 * Sprint M-FINAL-2: SAM.gov document import routes.
 */
import { Router, type Request, type Response } from "express";
import { importSamGovDocumentsForBidProject } from "../services/sam-document-importer.service";
export const samDocImportRouter = Router();
samDocImportRouter.post("/:bidProjectId", async (req: Request, res: Response) => {
  const id = req.params.bidProjectId;
  if (!id) return res.status(400).json({ error: "bidProjectId required" });
  try {
    const result = await importSamGovDocumentsForBidProject(id);
    res.json(result);
  } catch (e: any) {
    console.error("[sam-doc-import] failed:", e);
    res.status(500).json({ error: e.message || "Import failed" });
  }
});
export default samDocImportRouter;
