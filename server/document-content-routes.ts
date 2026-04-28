import { Router, type Request, type Response } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";

export const documentContentRouter = Router();

function getTenantId(req: Request): string {
  return (req as any).tenantId || (req as any).user?.tenantId || "blackhawk-default";
}

function jsonError(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

async function resolveDocTable(): Promise<string | null> {
  try {
    const check = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('bid_jacket_documents','jacket_documents','bid_documents','project_documents') LIMIT 1`);
    const rows = (check as any).rows as Array<{ table_name: string }>;
    return rows && rows.length ? rows[0].table_name : null;
  } catch { return null; }
}

documentContentRouter.get("/api/jackets/bid/:bidId/documents/:documentId/content", async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if ((req.headers["x-tenant-id"] as string | undefined)?.trim() === "") return jsonError(res, 401, "Authentication required");
    const { bidId, documentId } = req.params;
    const tableName = await resolveDocTable();
    if (!tableName) return jsonError(res, 404, "Document not found");
    const safeDoc = documentId.replace(/'/g, "''");
    const safeBid = bidId.replace(/'/g, "''");
    const safeTen = tenantId.replace(/'/g, "''");
    const result = await db.execute(sql.raw(`SELECT id,bid_project_id,tenant_id,title,content,storage_key,source_type,file_name,mime_type FROM "${tableName}" WHERE id='${safeDoc}' LIMIT 1`));
    const rows = (result as any).rows as any[];
    if (!rows || rows.length === 0) return jsonError(res, 404, "Document not found");
    const doc = rows[0];
    if (doc.tenant_id && doc.tenant_id !== safeTen) return jsonError(res, 403, "Access denied: cross-tenant request");
    const docBid = doc.bid_project_id || doc.bid_id || doc.project_id || "";
    if (docBid && docBid !== safeBid) return jsonError(res, 404, "Document not found in this bid");
    const title = doc.title || doc.file_name || documentId;
    const fileName = doc.file_name || title.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!doc.storage_key && doc.content) {
      const body = typeof doc.content === "string" ? doc.content : JSON.stringify(doc.content);
      const mimeType = doc.mime_type || "text/markdown";
      res.set({"Content-Type": mimeType, "Content-Disposition": `attachment; filename="${fileName}"`, "Content-Length": Buffer.byteLength(body).toString(), "Cache-Control": "no-store"});
      return res.send(body);
    }
    if (doc.storage_key) {
      try {
        const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
        const storageKey: string = doc.storage_key;
        const slashIdx = storageKey.indexOf("/");
        let bucketName: string, objectPath: string;
        if (storageKey.startsWith("replit-objstore-") && slashIdx !== -1) { bucketName = storageKey.substring(0, slashIdx); objectPath = storageKey.substring(slashIdx + 1); }
        else { bucketName = "replit-objstore-default"; objectPath = storageKey; }
        const bucket = objectStorageClient.bucket(bucketName);
        const file = bucket.file(objectPath);
        const [exists] = await file.exists();
        if (!exists) return jsonError(res, 404, "Document content not found in storage");
        const [metadata] = await file.getMetadata();
        const mimeType = doc.mime_type || metadata.contentType || "application/octet-stream";
        res.set({"Content-Type": mimeType, "Content-Disposition": `attachment; filename="${fileName}"`, "Cache-Control": "no-store"});
        if (metadata.size) res.set("Content-Length", metadata.size.toString());
        const stream = file.createReadStream();
        stream.on("error", (err: Error) => { console.error("[document-content] stream error:", err.message); if (!res.headersSent) jsonError(res, 500, "Error streaming document content"); });
        return stream.pipe(res);
      } catch (storageErr: unknown) { console.error("[document-content] storage error:", storageErr); return jsonError(res, 500, "Failed to retrieve document from storage"); }
    }
    return jsonError(res, 404, "Document has no content");
  } catch (err: unknown) { console.error("[document-content] error:", err instanceof Error ? err.message : String(err)); return jsonError(res, 500, err instanceof Error ? err.message : "Internal server error"); }
});