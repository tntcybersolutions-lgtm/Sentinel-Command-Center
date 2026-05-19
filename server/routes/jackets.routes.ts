/**
 * Sprint M-WIRE-1: Jacket routes.
 *
 * Surfaces jacket_folders + jacket_documents (where SAM.gov imports land)
 * to the bid-jacket.tsx UI. Without this, SAM imports are invisible to users.
 *
 * GET /api/jackets/bid/:bidId/documents
 *   -> { folders: [{ id, name, path, sortOrder, documents: [...] }], totalDocuments }
 *
 * GET /api/jackets/:type/:id/documents
 *   -> same, for any jacket type (bid|project|company)
 *
 * GET /api/jackets/documents/:docId
 *   -> single document metadata + presigned URL hint
 */
import { Router, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import { jacketFolders, jacketDocuments, bidProjects } from "@shared/schema";

export const jacketsRouter = Router();

async function buildJacketResponse(jacketType: string, jacketId: string, tenantId?: string) {
  const tenantClause = tenantId
    ? and(
        eq(jacketFolders.jacketType, jacketType),
        eq(jacketFolders.jacketId, jacketId),
        eq(jacketFolders.tenantId, tenantId),
      )
    : and(
        eq(jacketFolders.jacketType, jacketType),
        eq(jacketFolders.jacketId, jacketId),
      );

  const folders = await db.select().from(jacketFolders).where(tenantClause);
  const folderIds = folders.map(f => f.id);

  let docs: any[] = [];
  if (folderIds.length > 0) {
    // Pull docs in chunks to avoid huge IN clauses
    docs = await db.execute(sql`
      SELECT * FROM jacket_documents
      WHERE folder_id = ANY(${folderIds})
      AND (latest_version IS NULL OR latest_version = TRUE)
      ORDER BY created_at DESC
      LIMIT 5000
    `).then((r: any) => r.rows || r || []);
  }

  // Group docs by folder
  const docsByFolder = new Map<string, any[]>();
  for (const d of docs) {
    const fid = d.folder_id || d.folderId;
    if (!docsByFolder.has(fid)) docsByFolder.set(fid, []);
    docsByFolder.get(fid)!.push({
      id: d.id,
      folderId: fid,
      title: d.title,
      fileName: d.file_name || d.fileName,
      fileType: d.file_type || d.fileType,
      mimeType: d.mime_type || d.mimeType,
      fileSizeBytes: d.file_size_bytes || d.fileSizeBytes,
      version: d.version,
      documentType: d.document_type || d.documentType,
      source: d.source,
      sourceReference: d.source_reference || d.sourceReference,
      tagsJson: d.tags_json || d.tagsJson,
      createdAt: d.created_at || d.createdAt,
    });
  }

  const foldersOut = folders.map(f => ({
    id: f.id,
    name: f.name,
    path: f.path,
    sortOrder: f.sortOrder,
    parentFolderId: f.parentFolderId,
    isSystemFolder: f.isSystemFolder,
    documentCount: (docsByFolder.get(f.id) || []).length,
    totalSizeBytes: (docsByFolder.get(f.id) || []).reduce((s, d) => s + (d.fileSizeBytes || 0), 0),
    documents: docsByFolder.get(f.id) || [],
  })).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  return {
    folders: foldersOut,
    totalDocuments: docs.length,
    totalFolders: foldersOut.length,
  };
}

// GET /api/jackets/bid/:bidId/documents — what bid-jacket.tsx queries
jacketsRouter.get("/bid/:bidId/documents", async (req: Request, res: Response) => {
  try {
    // Look up tenant from the bid project for scoping
    const bid = await db.select().from(bidProjects).where(eq(bidProjects.id, req.params.bidId)).limit(1);
    const tenantId = bid[0]?.tenantId;
    const data = await buildJacketResponse("bid", req.params.bidId, tenantId);
    res.json(data);
  } catch (e: any) {
    console.error("[jackets] bid/:bidId/documents:", e);
    res.status(500).json({ error: e.message || "Failed", folders: [], totalDocuments: 0 });
  }
});

// Generic: /api/jackets/:type/:id/documents
jacketsRouter.get("/:type/:id/documents", async (req: Request, res: Response) => {
  try {
    if (req.params.type === "bid") return; // handled above
    const data = await buildJacketResponse(req.params.type, req.params.id);
    res.json(data);
  } catch (e: any) {
    console.error("[jackets] type/id/documents:", e);
    res.status(500).json({ error: e.message || "Failed", folders: [], totalDocuments: 0 });
  }
});

// Single document metadata
jacketsRouter.get("/documents/:docId", async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(jacketDocuments)
      .where(eq(jacketDocuments.id, req.params.docId))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: "Document not found" });
    res.json(rows[0]);
  } catch (e: any) {
    console.error("[jackets] get doc:", e);
    res.status(500).json({ error: e.message });
  }
});

// SAM-aware summary for a bid: count of SAM-source docs + last import time
jacketsRouter.get("/bid/:bidId/sam-summary", async (req: Request, res: Response) => {
  try {
    const r: any = await db.execute(sql`
      SELECT
        COUNT(*) AS doc_count,
        COALESCE(SUM(file_size_bytes), 0) AS total_bytes,
        MAX(jd.created_at) AS last_imported_at
      FROM jacket_documents jd
      JOIN jacket_folders jf ON jf.id = jd.folder_id
      WHERE jf.jacket_type = 'bid'
        AND jf.jacket_id = ${req.params.bidId}
        AND jd.source = 'sam.gov'
    `);
    const row = (r.rows && r.rows[0]) || r[0] || {};
    res.json({
      bidProjectId: req.params.bidId,
      samDocCount: Number(row.doc_count || 0),
      totalBytes: Number(row.total_bytes || 0),
      lastImportedAt: row.last_imported_at || null,
    });
  } catch (e: any) {
    console.error("[jackets] sam-summary:", e);
    res.status(500).json({ error: e.message });
  }
});

export default jacketsRouter;
