/**
 * SAM.gov Document Importer
 *
 * Triggered when a bid project is approved-for-pursuit. Pulls every
 * document attached to the underlying SAM.gov opportunity (resourceLinks +
 * description body) and files them into the bid jacket as versioned
 * jacket_documents records, with the bytes stored in Replit Object Storage.
 *
 * Idempotent (SHA-256 dedup), amendment-aware (re-run picks up new files),
 * and best-effort (one bad link does not abort the rest).
 *
 * Env required:
 *   SAM_GOV_API_KEY  - api.sam.gov-issued or api.data.gov public key
 *                       (api.data.gov keys may not authenticate at the
 *                       api.sam.gov gateway — see audit notes)
 */

import crypto from "crypto";
import { Client as ObjectStorageClient } from "@replit/object-storage";
import { db } from "../db";
import { eq, and } from "drizzle-orm";
import {
  bidProjects,
  opportunities,
  jacketFolders,
  jacketDocuments,
} from "@shared/schema";
import { randomUUID } from "crypto";

const objectStorage = new ObjectStorageClient();

const SAM_BASE = process.env.SAM_API_BASE || "https://api.sam.gov/opportunities/v2/search";

const MAX_PARALLEL = 3;
const MAX_BYTES_PER_FILE = 250 * 1024 * 1024; // 250 MB hard cap
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

export interface ImportResult {
  ok: boolean;
  bidProjectId: string;
  opportunityId?: string | null;
  filesAttempted: number;
  filesImported: number;
  filesSkippedDuplicate: number;
  bytesImported: number;
  errors: { url: string; reason: string }[];
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function sha256OfBytes(b: Buffer): string {
  return crypto.createHash("sha256").update(b).digest("hex");
}

function filenameFromUrl(url: string, fallback = "document.bin"): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && last.includes(".")) return decodeURIComponent(last);
    return fallback;
  } catch {
    return fallback;
  }
}

function guessMime(filename: string): string {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  return ({
    pdf: "application/pdf",
    zip: "application/zip",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    txt: "text/plain",
    csv: "text/csv",
    dwg: "application/acad",
    dxf: "application/dxf",
  } as Record<string, string>)[ext] || "application/octet-stream";
}

async function fetchWithKey(url: string, attempt = 1): Promise<{ ok: boolean; bytes?: Buffer; status?: number; error?: string }> {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) return { ok: false, error: "SAM_GOV_API_KEY not set" };
  const sep = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}api_key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(fullUrl, { headers: { "User-Agent": "SentinelCommandCenter/1.0 (+bids@blackhawkconst.com)" } });
    if (r.status === 429 && attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchWithKey(url, attempt + 1);
    }
    if (!r.ok) {
      return { ok: false, status: r.status, error: `HTTP ${r.status}` };
    }
    const len = parseInt(r.headers.get("content-length") || "0", 10);
    if (len > MAX_BYTES_PER_FILE) {
      return { ok: false, status: r.status, error: `file too large (${len} bytes > ${MAX_BYTES_PER_FILE})` };
    }
    const arr = new Uint8Array(await r.arrayBuffer());
    if (arr.byteLength > MAX_BYTES_PER_FILE) {
      return { ok: false, error: `file too large (${arr.byteLength} bytes)` };
    }
    return { ok: true, bytes: Buffer.from(arr), status: r.status };
  } catch (e: any) {
    if (attempt < RETRY_ATTEMPTS) {
      await sleep(RETRY_DELAY_MS * attempt);
      return fetchWithKey(url, attempt + 1);
    }
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * Ensure the bid project has a "SAM.gov Source Documents" jacket folder.
 * Returns the folder id.
 */
async function ensureSamSourceFolder(tenantId: string, bidProjectId: string): Promise<string> {
  const all = await db.select().from(jacketFolders)
    .where(and(
      eq(jacketFolders.tenantId, tenantId),
      eq(jacketFolders.jacketType, "bid"),
      eq(jacketFolders.jacketId, bidProjectId),
    ));
  const found = all.find((f: any) => (f.name || "").includes("SAM.gov Source"));
  if (found) return found.id;
  const id = randomUUID();
  await db.insert(jacketFolders).values({
    id,
    tenantId,
    jacketType: "bid",
    jacketId: bidProjectId,
    name: "99 - SAM.gov Source Documents",
    path: "99-sam-source",
    sortOrder: 99,
    isSystemFolder: true,
  } as any);
  return id;
}
async function alreadyImportedHash(tenantId: string, folderId: string, sha: string): Promise<boolean> {
  const rows = await db.select().from(jacketDocuments)
    .where(and(
      eq(jacketDocuments.tenantId, tenantId),
      eq(jacketDocuments.folderId, folderId),
    ))
    .then(rs => rs.filter(r => {
      const tags: any = (r as any).tagsJson;
      return tags && tags.sha256 === sha;
    }));
  return rows.length > 0;
}

async function recordDocument(opts: {
  tenantId: string;
  folderId: string;
  bidProjectId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  storageKey: string;
  sha256: string;
  sourceUrl: string;
  noticeId: string | null;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(jacketDocuments).values({
    id,
    tenantId: opts.tenantId,
    folderId: opts.folderId,
    title: opts.fileName,
    fileName: opts.fileName,
    fileType: (opts.fileName.split(".").pop() || "").toLowerCase(),
    mimeType: opts.mimeType,
    fileSizeBytes: opts.bytes.byteLength,
    storageKey: opts.storageKey,
    version: 1,
    latestVersion: true,
    documentType: "sam_source",
    visibility: "internal",
    source: "sam.gov",
    sourceReference: opts.sourceUrl,
    tagsJson: { sha256: opts.sha256, noticeId: opts.noticeId },
  } as any);
  return id;
}

async function downloadOne(url: string, ctx: { tenantId: string; folderId: string; bidProjectId: string; noticeId: string | null }) {
  const fname = filenameFromUrl(url);
  const fetched = await fetchWithKey(url);
  if (!fetched.ok || !fetched.bytes) {
    return { url, ok: false, reason: fetched.error || `HTTP ${fetched.status}` };
  }
  const sha = sha256OfBytes(fetched.bytes);
  const dup = await alreadyImportedHash(ctx.tenantId, ctx.folderId, sha);
  if (dup) return { url, ok: true, dup: true, fileName: fname, bytes: fetched.bytes.byteLength };
  const storageKey = `jackets/${ctx.bidProjectId}/sam-source/${sha.slice(0, 12)}-${fname}`;
  const upload = await objectStorage.uploadFromBytes(storageKey, fetched.bytes);
  if (!upload.ok) {
    return { url, ok: false, reason: `Object Storage upload failed: ${upload.error?.message || "unknown"}` };
  }
  await recordDocument({
    tenantId: ctx.tenantId,
    folderId: ctx.folderId,
    bidProjectId: ctx.bidProjectId,
    fileName: fname,
    mimeType: guessMime(fname),
    bytes: fetched.bytes,
    storageKey,
    sha256: sha,
    sourceUrl: url,
    noticeId: ctx.noticeId,
  });
  return { url, ok: true, dup: false, fileName: fname, bytes: fetched.bytes.byteLength };
}

async function processInPool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  const workers = Array(Math.min(n, items.length)).fill(0).map(() => worker());
  await Promise.all(workers);
  return out;
}

/**
 * Main entry point. Imports every document for the bid project's underlying
 * SAM.gov opportunity into the jacket. Idempotent.
 */
export async function importSamGovDocumentsForBidProject(bidProjectId: string): Promise<ImportResult> {
  const out: ImportResult = {
    ok: false,
    bidProjectId,
    opportunityId: null,
    filesAttempted: 0,
    filesImported: 0,
    filesSkippedDuplicate: 0,
    bytesImported: 0,
    errors: [],
  };

  const project = await db.select().from(bidProjects).where(eq(bidProjects.id, bidProjectId)).then(r => r[0]);
  if (!project) {
    out.errors.push({ url: "", reason: "bid project not found" });
    return out;
  }
  if (!project.opportunityId) {
    out.errors.push({ url: "", reason: "bid project has no opportunityId — nothing to import" });
    return out;
  }
  out.opportunityId = project.opportunityId;

  const opp = await db.select().from(opportunities).where(eq(opportunities.id, project.opportunityId)).then(r => r[0]);
  if (!opp) {
    out.errors.push({ url: "", reason: "opportunity row not found" });
    return out;
  }

  // Pull resourceLinks from documentation_json (sam-ingest stores the parsed payload there)
  const docJson: any = (opp as any).documentationJson || {};
  const resourceLinks: string[] = Array.isArray(docJson.resourceLinks) ? docJson.resourceLinks : [];
  const noticeId: string | null = docJson.noticeId || null;

  // Also include the description endpoint as a synthetic doc URL.
  // (api.sam.gov serves description as text/html; we save it as a .html.)
  const descUrls: string[] = [];
  if (noticeId) {
    descUrls.push(`https://api.sam.gov/opportunities/v1/noticedesc?noticeid=${encodeURIComponent(noticeId)}`);
  }

  const allUrls = Array.from(new Set([...resourceLinks, ...descUrls]));
  out.filesAttempted = allUrls.length;

  if (allUrls.length === 0) {
    out.ok = true; // nothing to import is success
    return out;
  }

  const folderId = await ensureSamSourceFolder(project.tenantId, bidProjectId);
  const ctx = { tenantId: project.tenantId, folderId, bidProjectId, noticeId };

  const results = await processInPool(allUrls, MAX_PARALLEL, url => downloadOne(url, ctx));
  for (const r of results) {
    if (r.ok) {
      if ((r as any).dup) out.filesSkippedDuplicate++;
      else {
        out.filesImported++;
        out.bytesImported += (r as any).bytes || 0;
      }
    } else {
      out.errors.push({ url: r.url, reason: (r as any).reason || "unknown" });
    }
  }
  out.ok = out.errors.length < allUrls.length;
  return out;
}
