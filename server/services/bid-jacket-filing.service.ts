// Phase 1 closes the gap that SAM.gov / HigherGov ingestion creates rows
// in `bid_jacket_artifacts` (with sourceUrl) but never downloads or files
// the actual blob into the bid jacket. This service downloads each
// unfiled artifact, stores the blob in object storage, and creates a
// matching `jacket_documents` row inside the correct folder.

import { db } from "../db";
import { and, eq } from "drizzle-orm";
import {
  bidJacketArtifacts,
  jacketFolders,
  jacketDocuments,
  bidJacketFolderDisplayName,
  type BidJacketArtifact,
} from "@shared/schema";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";

// Maps a `bid_jacket_artifacts.template_code` to the canonical bid jacket
// folder code (BID_JACKET_FOLDERS). Codes outside this map land in 00 (Intake).
export const ARTIFACT_CODE_TO_FOLDER: Record<string, string> = {
  SAM_SOLICITATION: "01",
  SAM_ATTACHMENTS_PACKAGE: "01",
  SAM_PWS_SOW: "01",
  SAM_DRAWINGS_SPECS: "01",
  SAM_AMENDMENTS: "02",
  SAM_QA_QA: "04",
  SAM_SITE_VISIT: "03",
  SAM_WAGE_DETERMINATION: "07",
  SAM_QA_QC: "10",
  SAM_SUBMISSION_RULES: "12",
  PRICING_SHEET: "11",
  SUB_QUOTES_COMPILATION: "06",
  BID_FORMS: "08",
  BID_COVER_SHEET: "10",
  BID_EXEC_SUMMARY: "10",
  SCOPE_NARRATIVE: "10",
  INSURANCE_CERTS: "07",
  BONDING_LETTER: "07",
  SAFETY_PACKAGE: "08",
  POST_AWARD_HANDOFF: "14",
};

export function folderCodeForArtifact(templateCode: string | null | undefined): string {
  if (!templateCode) return "00";
  return ARTIFACT_CODE_TO_FOLDER[templateCode] || "00";
}

export interface ArtifactBlob {
  buffer: Buffer;
  contentType: string;
  fileName: string;
}

export type ArtifactDownloader = (sourceUrl: string) => Promise<ArtifactBlob>;

export interface FilingDeps {
  download: ArtifactDownloader;
  storeObject: (key: string, blob: ArtifactBlob) => Promise<{ storageKey: string; size: number }>;
  resolveFolderId: (tenantId: string, bidProjectId: string, code: string) => Promise<string | null>;
  insertJacketDocument: (row: NewJacketDocumentRow) => Promise<{ id: string }>;
  markArtifactFiled: (artifactId: string, storageKey: string, approved: boolean) => Promise<void>;
}

export interface NewJacketDocumentRow {
  tenantId: string;
  folderId: string;
  title: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  documentType: string;
  source: string;
  generatedType: string | null;
  metadataJson: Record<string, unknown>;
}

export interface FileSingleResult {
  artifactId: string;
  status: "filed" | "skipped" | "failed";
  documentId?: string;
  reason?: string;
}

export interface FileBatchResult {
  filed: number;
  skipped: number;
  failed: number;
  results: FileSingleResult[];
}

export async function fileArtifactRow(
  artifact: BidJacketArtifact,
  deps: FilingDeps,
): Promise<FileSingleResult> {
  // Idempotent: if it's already filed (has storageKey OR status==="ready"/"approved"
  // with a backing document), skip.
  if (artifact.storageKey) {
    return { artifactId: artifact.id, status: "skipped", reason: "already_filed" };
  }
  if (!artifact.sourceUrl) {
    return { artifactId: artifact.id, status: "skipped", reason: "no_source_url" };
  }

  let blob: ArtifactBlob;
  try {
    blob = await deps.download(artifact.sourceUrl);
  } catch (err: any) {
    return { artifactId: artifact.id, status: "failed", reason: `download_failed: ${err?.message || String(err)}` };
  }

  const folderCode = folderCodeForArtifact(artifact.templateCode);
  const folderId = await deps.resolveFolderId(artifact.tenantId, artifact.bidProjectId, folderCode);
  if (!folderId) {
    return {
      artifactId: artifact.id,
      status: "failed",
      reason: `folder_not_found: code=${folderCode} (run ensure-canonical first)`,
    };
  }

  const safeName = blob.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectKey = `jackets/bid/${artifact.bidProjectId}/${artifact.id}-${safeName}`;

  let stored: { storageKey: string; size: number };
  try {
    stored = await deps.storeObject(objectKey, blob);
  } catch (err: any) {
    return { artifactId: artifact.id, status: "failed", reason: `storage_failed: ${err?.message || String(err)}` };
  }

  // If doc insert fails we don't update the artifact, so a re-run of this
  // routine will retry from the same starting state.
  const doc = await deps.insertJacketDocument({
    tenantId: artifact.tenantId,
    folderId,
    title: artifact.title,
    fileName: blob.fileName,
    fileType: inferFileType(blob.fileName, blob.contentType),
    mimeType: blob.contentType,
    fileSizeBytes: stored.size,
    storageKey: stored.storageKey,
    documentType: artifact.templateCode || "misc",
    source: artifact.sourceType || "upload",
    generatedType: artifact.templateCode || null,
    metadataJson: { artifactId: artifact.id, sourceUrl: artifact.sourceUrl, folderCode },
  });

  await deps.markArtifactFiled(artifact.id, stored.storageKey, artifact.status === "approved");

  return { artifactId: artifact.id, status: "filed", documentId: doc.id };
}

export async function fileUnfiledArtifactsForBid(
  tenantId: string,
  bidProjectId: string,
  deps: FilingDeps,
): Promise<FileBatchResult> {
  const rows = await db
    .select()
    .from(bidJacketArtifacts)
    .where(and(
      eq(bidJacketArtifacts.tenantId, tenantId),
      eq(bidJacketArtifacts.bidProjectId, bidProjectId),
    ));

  const candidates = rows.filter((r) => !r.storageKey && r.sourceUrl);

  const results: FileSingleResult[] = [];
  for (const row of candidates) {
    results.push(await fileArtifactRow(row, deps));
  }

  return {
    filed: results.filter((r) => r.status === "filed").length,
    skipped: rows.length - candidates.length + results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  };
}

function inferFileType(fileName: string, mimeType: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext) return ext;
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "xlsx";
  if (mimeType.includes("word")) return "docx";
  return "bin";
}

// ─── Production wiring ───────────────────────────────────────────────────────

export const httpArtifactDownloader: ArtifactDownloader = async (sourceUrl: string) => {
  const ctrl = new AbortController();
  const timeoutMs = 30_000;
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(sourceUrl, { signal: ctrl.signal, redirect: "follow" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
    const arrayBuf = await resp.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const contentType = resp.headers.get("content-type") || "application/octet-stream";
    const cd = resp.headers.get("content-disposition") || "";
    const cdMatch = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    const urlPath = new URL(sourceUrl).pathname;
    const fileName = cdMatch?.[1] || decodeURIComponent(urlPath.split("/").pop() || "artifact");
    return { buffer, contentType, fileName };
  } finally {
    clearTimeout(timer);
  }
};

export const objectStorageWriter = async (
  key: string,
  blob: ArtifactBlob,
): Promise<{ storageKey: string; size: number }> => {
  const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
  const path = `${privateDir}/${key}`.replace(/\/+/g, "/");
  const parts = path.startsWith("/") ? path.slice(1).split("/") : path.split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(blob.buffer, { contentType: blob.contentType });
  const entityId = path.replace(`${privateDir}/`, "").replace(/^\//, "");
  return { storageKey: `/objects/${entityId}`, size: blob.buffer.length };
};

export const folderResolver = async (
  tenantId: string,
  bidProjectId: string,
  code: string,
): Promise<string | null> => {
  const expectedName = bidJacketFolderDisplayName(code);
  const folders = await db.select().from(jacketFolders).where(and(
    eq(jacketFolders.tenantId, tenantId),
    eq(jacketFolders.jacketType, "bid"),
    eq(jacketFolders.jacketId, bidProjectId),
  ));
  const exact = folders.find((f) => f.name === expectedName);
  if (exact) return exact.id;
  const sortOrderMatch = folders.find((f) => f.sortOrder === parseInt(code, 10));
  return sortOrderMatch?.id || null;
};

async function dbInsertJacketDocument(row: NewJacketDocumentRow): Promise<{ id: string }> {
  const [doc] = await db.insert(jacketDocuments).values({
    tenantId: row.tenantId,
    folderId: row.folderId,
    title: row.title,
    fileName: row.fileName,
    fileType: row.fileType,
    mimeType: row.mimeType,
    fileSizeBytes: row.fileSizeBytes,
    storageKey: row.storageKey,
    documentType: row.documentType,
    visibility: "internal",
    source: row.source,
    sourceReference: typeof row.metadataJson?.sourceUrl === "string" ? (row.metadataJson.sourceUrl as string) : null,
    generatedBy: "ingestion",
    generatedType: row.generatedType,
    tagsJson: row.metadataJson,
  }).returning();
  return { id: doc.id };
}

async function dbMarkArtifactFiled(artifactId: string, storageKey: string, approved: boolean): Promise<void> {
  await db.update(bidJacketArtifacts)
    .set({
      storageKey,
      status: approved ? "approved" : "ready",
      updatedAt: new Date(),
    })
    .where(eq(bidJacketArtifacts.id, artifactId));
}

export const productionFilingDeps: FilingDeps = {
  download: httpArtifactDownloader,
  storeObject: objectStorageWriter,
  resolveFolderId: folderResolver,
  insertJacketDocument: dbInsertJacketDocument,
  markArtifactFiled: dbMarkArtifactFiled,
};
