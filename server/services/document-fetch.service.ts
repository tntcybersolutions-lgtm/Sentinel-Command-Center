import { db } from "../db";
import { bidJacketArtifacts } from "@shared/schema";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { objectStorageClient } from "../replit_integrations/object_storage/objectStorage";
import { logIngestionEvent } from "./ingestion-events.service";
import { randomUUID } from "crypto";

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv",
  ".zip", ".txt", ".rtf", ".ppt", ".pptx",
  ".jpg", ".jpeg", ".png", ".gif", ".tif", ".tiff",
  ".dwg", ".dxf",
]);

function getPrivateObjectDir(): string {
  return process.env.PRIVATE_OBJECT_DIR || "";
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");
  return { bucketName, objectName };
}

function extractFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const filename = pathname.split("/").pop() || "";
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx >= 0) return filename.substring(dotIdx).toLowerCase();
  } catch {
    const clean = url.split("?")[0] || "";
    const filename = clean.split("/").pop() || "";
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx >= 0) return filename.substring(dotIdx).toLowerCase();
  }
  return "";
}

function extractFilename(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "document");
  } catch {
    const clean = url.split("?")[0] || "";
    return decodeURIComponent(clean.split("/").pop() || "document");
  }
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() || "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    csv: "text/csv",
    txt: "text/plain",
    rtf: "application/rtf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    tif: "image/tiff",
    tiff: "image/tiff",
    dwg: "application/acad",
    dxf: "application/dxf",
  };
  return map[ext] || "application/octet-stream";
}

async function fetchWithRetry(
  url: string,
  retries: number = MAX_RETRIES
): Promise<{ buffer: Buffer; contentType: string; size: number }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "BlackhawkBidBot/1.0 (Document Fetch Service)",
          Accept: "*/*",
        },
        redirect: "follow",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${contentLength} bytes exceeds ${MAX_FILE_SIZE} limit`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length > MAX_FILE_SIZE) {
        throw new Error(`Downloaded file too large: ${buffer.length} bytes exceeds ${MAX_FILE_SIZE} limit`);
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";

      return { buffer, contentType, size: buffer.length };
    } catch (err: any) {
      lastError = err;
      if (attempt < retries) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Fetch failed after retries");
}

async function uploadToObjectStorage(
  buffer: Buffer,
  storagePath: string,
  contentType: string
): Promise<string> {
  const privateDir = getPrivateObjectDir();
  if (!privateDir) {
    throw new Error("PRIVATE_OBJECT_DIR not configured for Object Storage");
  }

  const fullPath = `${privateDir}/${storagePath}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  return fullPath;
}

async function extractAndIngestZip(params: {
  buffer: Buffer;
  tenantId: string;
  bidProjectId: string;
  projectStoragePath: string;
  parentArtifactId: string;
  runId: string;
}): Promise<number> {
  const { buffer, tenantId, bidProjectId, projectStoragePath, parentArtifactId, runId } = params;

  let JSZip: any;
  try {
    JSZip = (await import("jszip")).default;
  } catch {
    console.warn("[document-fetch] jszip not available, storing ZIP as-is");
    return 0;
  }

  let zip: any;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err: any) {
    console.warn(`[document-fetch] Failed to parse ZIP: ${err.message}`);
    return 0;
  }

  let extracted = 0;
  const entries = Object.keys(zip.files);

  for (const entryName of entries) {
    const entry = zip.files[entryName];
    if (entry.dir) continue;

    const ext = extractFileExtension(entryName);
    if (ext && !SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      const entryBuffer = await entry.async("nodebuffer");

      if (entryBuffer.length > MAX_FILE_SIZE) {
        await logIngestionEvent({
          tenantId,
          bidProjectId,
          runId,
          eventType: "fetch.skipped",
          message: `ZIP entry too large: ${entryName} (${entryBuffer.length} bytes)`,
          detailsJson: { entryName, size: entryBuffer.length, parentArtifactId },
        });
        continue;
      }

      const safeName = entryName.replace(/[^a-zA-Z0-9._\-/]/g, "_");
      const entryStoragePath = `${projectStoragePath}/zip_extracted/${safeName}`;
      const mimeType = guessMimeType(entryName);

      const storageKey = await uploadToObjectStorage(entryBuffer, entryStoragePath, mimeType);

      const title = decodeURIComponent(entryName.split("/").pop() || entryName).replace(/[_-]/g, " ");

      await db
        .insert(bidJacketArtifacts)
        .values({
          tenantId,
          bidProjectId,
          templateCode: null,
          title: title.substring(0, 200),
          sourceType: "zip_extract",
          sourceUrl: null,
          storageKey,
          status: "downloaded",
          metadataJson: {
            extractedFrom: parentArtifactId,
            originalPath: entryName,
            size: entryBuffer.length,
            mimeType,
          },
        })
        .onConflictDoNothing();

      extracted++;

      await logIngestionEvent({
        tenantId,
        bidProjectId,
        runId,
        eventType: "fetch.zip_entry",
        entityType: "bid_jacket_artifact",
        message: `Extracted ZIP entry: ${entryName}`,
        detailsJson: { entryName, storageKey, size: entryBuffer.length },
      });
    } catch (err: any) {
      await logIngestionEvent({
        tenantId,
        bidProjectId,
        runId,
        eventType: "fetch.zip_entry_error",
        message: `Failed extracting ZIP entry: ${entryName}`,
        detailsJson: { entryName, error: err.message },
      });
    }
  }

  return extracted;
}

export async function fetchAndStoreArtifact(params: {
  tenantId: string;
  bidProjectId: string;
  artifactId: string;
  sourceUrl: string;
  runId?: string;
}): Promise<{ success: boolean; storageKey?: string; error?: string; extractedCount?: number }> {
  const { tenantId, bidProjectId, artifactId, sourceUrl } = params;
  const runId = params.runId || randomUUID();

  await logIngestionEvent({
    tenantId,
    bidProjectId,
    runId,
    eventType: "fetch.started",
    entityType: "bid_jacket_artifact",
    entityId: artifactId,
    message: `Fetching document from ${sourceUrl}`,
    detailsJson: { sourceUrl, artifactId },
  });

  try {
    const { buffer, contentType, size } = await fetchWithRetry(sourceUrl);

    const filename = extractFilename(sourceUrl);
    const ext = extractFileExtension(sourceUrl) || ".bin";
    const projectStoragePath = `projects/${bidProjectId}/documents`;
    const storageName = `${randomUUID()}${ext}`;
    const storagePath = `${projectStoragePath}/${storageName}`;

    const mimeType = contentType !== "application/octet-stream" ? contentType : guessMimeType(filename);

    const storageKey = await uploadToObjectStorage(buffer, storagePath, mimeType);

    await db
      .update(bidJacketArtifacts)
      .set({
        storageKey,
        status: "downloaded",
        updatedAt: new Date(),
        metadataJson: {
          originalFilename: filename,
          mimeType,
          size,
          fetchedAt: new Date().toISOString(),
          runId,
        },
      })
      .where(eq(bidJacketArtifacts.id, artifactId));

    await logIngestionEvent({
      tenantId,
      bidProjectId,
      runId,
      eventType: "fetch.completed",
      entityType: "bid_jacket_artifact",
      entityId: artifactId,
      message: `Downloaded and stored: ${filename}`,
      detailsJson: { storageKey, size, mimeType, filename },
    });

    let extractedCount = 0;
    if (ext === ".zip" || mimeType.includes("zip")) {
      extractedCount = await extractAndIngestZip({
        buffer,
        tenantId,
        bidProjectId,
        projectStoragePath,
        parentArtifactId: artifactId,
        runId,
      });

      await logIngestionEvent({
        tenantId,
        bidProjectId,
        runId,
        eventType: "fetch.zip_extracted",
        entityType: "bid_jacket_artifact",
        entityId: artifactId,
        message: `Extracted ${extractedCount} files from ZIP`,
        detailsJson: { extractedCount },
      });
    }

    return { success: true, storageKey, extractedCount };
  } catch (err: any) {
    await db
      .update(bidJacketArtifacts)
      .set({
        status: "fetch_failed",
        updatedAt: new Date(),
        metadataJson: {
          lastFetchError: err.message,
          lastFetchAttempt: new Date().toISOString(),
          runId,
        },
      })
      .where(eq(bidJacketArtifacts.id, artifactId));

    await logIngestionEvent({
      tenantId,
      bidProjectId,
      runId,
      eventType: "fetch.failed",
      entityType: "bid_jacket_artifact",
      entityId: artifactId,
      message: `Failed to fetch: ${err.message}`,
      detailsJson: { sourceUrl, error: err.message },
    });

    return { success: false, error: err.message };
  }
}

export async function fetchAllPendingArtifacts(params: {
  tenantId: string;
  bidProjectId: string;
  runId?: string;
}): Promise<{
  total: number;
  downloaded: number;
  failed: number;
  skipped: number;
  extractedFromZips: number;
}> {
  const { tenantId, bidProjectId } = params;
  const runId = params.runId || randomUUID();

  await logIngestionEvent({
    tenantId,
    bidProjectId,
    runId,
    eventType: "fetch.batch_started",
    message: `Starting batch fetch for bid project ${bidProjectId}`,
  });

  const artifacts = await db
    .select({
      id: bidJacketArtifacts.id,
      sourceUrl: bidJacketArtifacts.sourceUrl,
      storageKey: bidJacketArtifacts.storageKey,
      status: bidJacketArtifacts.status,
    })
    .from(bidJacketArtifacts)
    .where(
      and(
        eq(bidJacketArtifacts.tenantId, tenantId),
        eq(bidJacketArtifacts.bidProjectId, bidProjectId),
        isNotNull(bidJacketArtifacts.sourceUrl),
        isNull(bidJacketArtifacts.storageKey)
      )
    );

  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  let extractedFromZips = 0;

  for (const artifact of artifacts) {
    if (!artifact.sourceUrl) {
      skipped++;
      continue;
    }

    if (artifact.storageKey) {
      skipped++;
      continue;
    }

    const result = await fetchAndStoreArtifact({
      tenantId,
      bidProjectId,
      artifactId: artifact.id,
      sourceUrl: artifact.sourceUrl,
      runId,
    });

    if (result.success) {
      downloaded++;
      if (result.extractedCount) {
        extractedFromZips += result.extractedCount;
      }
    } else {
      failed++;
    }
  }

  await logIngestionEvent({
    tenantId,
    bidProjectId,
    runId,
    eventType: "fetch.batch_completed",
    message: `Batch fetch completed: ${downloaded} downloaded, ${failed} failed, ${skipped} skipped`,
    detailsJson: { total: artifacts.length, downloaded, failed, skipped, extractedFromZips },
  });

  console.log(
    `[document-fetch] Batch complete for ${bidProjectId}: ${downloaded}/${artifacts.length} downloaded, ${failed} failed, ${extractedFromZips} extracted from ZIPs`
  );

  return {
    total: artifacts.length,
    downloaded,
    failed,
    skipped,
    extractedFromZips,
  };
}
