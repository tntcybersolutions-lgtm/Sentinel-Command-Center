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
  samImportLog,
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


async function recordImportLog(opts: {
  tenantId: string;
  bidProjectId: string;
  opportunityId: string | null;
  result: ImportResult;
  triggeredBy: string;
}): Promise<void> {
  try {
    await db.insert(samImportLog).values({
      tenantId: opts.tenantId,
      bidProjectId: opts.bidProjectId,
      opportunityId: opts.opportunityId,
      startedAt: new Date(),
      finishedAt: new Date(),
      filesAttempted: opts.result.filesAttempted,
      filesImported: opts.result.filesImported,
      filesSkippedDuplicate: opts.result.filesSkippedDuplicate,
      bytesImported: opts.result.bytesImported,
      ok: opts.result.ok,
      errorsJson: opts.result.errors,
      triggeredBy: opts.triggeredBy,
    } as any);
  } catch (e: any) {
    console.warn("[sam-importer] failed to write import log:", e?.message);
  }
}

/**
 * Fetch the LIVE opportunity record from api.sam.gov so we pick up every
 * current resourceLink, link, additionalInfoLink, and related-notice link
 * — not just what was cached in documentation_json at ingest time.
 * Returns null if no API key or the call fails (caller falls back to local).
 */
async function fetchLiveOpportunity(noticeId: string): Promise<{
  raw: any;
  allUrls: string[];
  relatedNotices: string[];
} | null> {
  const key = process.env.SAM_GOV_API_KEY;
  if (!key) return null;
  try {
    const url = `${SAM_BASE}?api_key=${encodeURIComponent(key)}&noticeId=${encodeURIComponent(noticeId)}`;
    const r = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SentinelCommandCenter/1.0 (+bids@blackhawkconst.com)" },
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      console.warn(`[sam-importer] live fetch failed for ${noticeId}: HTTP ${r.status}`);
      return null;
    }
    const data = await r.json();
    const opp = data.opportunitiesData?.[0];
    if (!opp) {
      console.warn(`[sam-importer] live fetch returned no opportunitiesData for ${noticeId}`);
      return null;
    }
    const seen = new Set<string>();
    const urls: string[] = [];
    const pushIfNew = (u?: string) => { if (u && !seen.has(u)) { seen.add(u); urls.push(u); } };

    // 1. resourceLinks (the primary attachment list)
    if (Array.isArray(opp.resourceLinks)) for (const u of opp.resourceLinks) pushIfNew(u);
    // 2. opp.links[].href (alternate link container some notice types use)
    if (Array.isArray(opp.links)) for (const l of opp.links) {
      if (l && l.href && l.rel !== "self") pushIfNew(l.href);
    }
    // 3. additionalInfoLink (links to attachment portal page outside api)
    if (opp.additionalInfoLink) pushIfNew(opp.additionalInfoLink);
    // 4. description endpoint (so we always capture the body text/HTML)
    pushIfNew(`https://api.sam.gov/opportunities/v1/noticedesc?noticeid=${encodeURIComponent(noticeId)}`);

    const relatedNotices: string[] = [];
    if (opp.relatedNotice) {
      if (typeof opp.relatedNotice === "string") relatedNotices.push(opp.relatedNotice);
      else if (Array.isArray(opp.relatedNotice)) relatedNotices.push(...opp.relatedNotice);
    }
    if (Array.isArray(opp.related_notices)) relatedNotices.push(...opp.related_notices);

    return { raw: opp, allUrls: urls, relatedNotices };
  } catch (e: any) {
    console.warn(`[sam-importer] live fetch error for ${noticeId}:`, e?.message);
    return null;
  }
}

/**
 * Save an in-memory buffer (JSON metadata or HTML snapshot) as a jacket
 * doc. Used to persist the full opportunity payload and description.
 */
async function recordSyntheticDoc(opts: {
  tenantId: string;
  folderId: string;
  bidProjectId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  noticeId: string | null;
  sourceLabel: string;
}): Promise<{ ok: boolean; dup: boolean; bytes: number; error?: string }> {
  const sha = sha256OfBytes(opts.bytes);
  const dup = await alreadyImportedHash(opts.tenantId, opts.folderId, sha);
  if (dup) return { ok: true, dup: true, bytes: opts.bytes.byteLength };
  const storageKey = `jackets/${opts.bidProjectId}/sam-source/${sha.slice(0,12)}-${opts.fileName}`;
  const upload = await objectStorage.uploadFromBytes(storageKey, opts.bytes);
  if (!upload.ok) {
    return { ok: false, dup: false, bytes: 0, error: `Object Storage upload failed: ${upload.error?.message || "unknown"}` };
  }
  await recordDocument({
    tenantId: opts.tenantId,
    folderId: opts.folderId,
    bidProjectId: opts.bidProjectId,
    fileName: opts.fileName,
    mimeType: opts.mimeType,
    bytes: opts.bytes,
    storageKey,
    sha256: sha,
    sourceUrl: opts.sourceLabel,
    noticeId: opts.noticeId,
  });
  return { ok: true, dup: false, bytes: opts.bytes.byteLength };
}

/**
 * Main entry point. Imports every document for the bid project's underlying
 * SAM.gov opportunity into the jacket — pulling the FULL bid opportunity:
 *
 *   1. Live-refreshes opportunity metadata from api.sam.gov (no longer
 *      relies solely on locally cached documentationJson, so we never
 *      miss attachments added after ingest).
 *   2. Saves the full opportunity JSON as opportunity-{noticeId}.json
 *      so the bid jacket has a permanent record of what SAM.gov showed.
 *   3. Pulls description HTML, all resourceLinks, opp.links[], the
 *      additionalInfoLink, and follows relatedNotice references to pull
 *      amendment attachments too.
 *
 * Idempotent (SHA-256 dedup). One bad link does not abort the rest.
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

  const docJson: any = (opp as any).documentationJson || {};
  const noticeId: string | null = docJson.noticeId || (opp as any).externalId || null;

  // Build the canonical URL set:
  //   start with whatever is cached locally (documentationJson),
  //   then merge in everything the live SAM.gov record currently shows
  //   (additional attachments, amendments).
  const seenUrls = new Set<string>();
  const allUrls: string[] = [];
  const pushIfNew = (u?: string) => { if (u && !seenUrls.has(u)) { seenUrls.add(u); allUrls.push(u); } };

  const cachedResource: string[] = Array.isArray(docJson.resourceLinks) ? docJson.resourceLinks : [];
  for (const u of cachedResource) pushIfNew(u);

  let liveRaw: any = null;
  const relatedNoticeIds: string[] = [];
  if (noticeId) {
    const live = await fetchLiveOpportunity(noticeId);
    if (live) {
      liveRaw = live.raw;
      for (const u of live.allUrls) pushIfNew(u);
      for (const rn of live.relatedNotices) if (rn && rn !== noticeId) relatedNoticeIds.push(rn);
    } else {
      // Fall back to local-only — still include the description endpoint.
      pushIfNew(`https://api.sam.gov/opportunities/v1/noticedesc?noticeid=${encodeURIComponent(noticeId)}`);
    }
  }

  // Pull each related notice (amendments) so their attachments come in too.
  for (const rn of relatedNoticeIds) {
    const live = await fetchLiveOpportunity(rn);
    if (!live) continue;
    for (const u of live.allUrls) pushIfNew(u);
  }

  const folderId = await ensureSamSourceFolder(project.tenantId, bidProjectId);
  const ctx = { tenantId: project.tenantId, folderId, bidProjectId, noticeId };

  // 1. Save the full live opportunity JSON as a doc (permanent snapshot).
  if (liveRaw) {
    const jsonBytes = Buffer.from(JSON.stringify(liveRaw, null, 2), "utf-8");
    const jsonName = `opportunity-${noticeId || "unknown"}.json`;
    out.filesAttempted++;
    const r = await recordSyntheticDoc({
      tenantId: project.tenantId, folderId, bidProjectId,
      fileName: jsonName, mimeType: "application/json",
      bytes: jsonBytes, noticeId, sourceLabel: "sam.gov:live-opportunity-payload",
    });
    if (r.ok) { if (r.dup) out.filesSkippedDuplicate++; else { out.filesImported++; out.bytesImported += r.bytes; } }
    else out.errors.push({ url: jsonName, reason: r.error || "unknown" });
  }

  // 2. Save the description body text from opp.description (if present)
  //    as a separate HTML file — easier to read than the JSON.
  if (liveRaw && typeof liveRaw.description === "string" && liveRaw.description.length > 0) {
    const html = `<!doctype html><meta charset="utf-8"><title>SAM.gov ${noticeId || ""} — Description</title><body>${liveRaw.description}</body>`;
    const descBytes = Buffer.from(html, "utf-8");
    const descName = `opportunity-${noticeId || "unknown"}-description.html`;
    out.filesAttempted++;
    const r = await recordSyntheticDoc({
      tenantId: project.tenantId, folderId, bidProjectId,
      fileName: descName, mimeType: "text/html",
      bytes: descBytes, noticeId, sourceLabel: "sam.gov:opp.description",
    });
    if (r.ok) { if (r.dup) out.filesSkippedDuplicate++; else { out.filesImported++; out.bytesImported += r.bytes; } }
    else out.errors.push({ url: descName, reason: r.error || "unknown" });
  }

  // 3. Pull every URL we collected (resourceLinks + links + amendments +
  //    description endpoint). Pool the downloads.
  out.filesAttempted += allUrls.length;
  if (allUrls.length > 0) {
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
  }

  out.ok = out.filesAttempted === 0 || out.errors.length < out.filesAttempted;
  console.log(`[sam-importer] bid=${bidProjectId} notice=${noticeId} attempted=${out.filesAttempted} imported=${out.filesImported} dup=${out.filesSkippedDuplicate} errors=${out.errors.length}`);

  await recordImportLog({
    tenantId: project.tenantId,
    bidProjectId,
    opportunityId: project.opportunityId || null,
    result: out,
    triggeredBy: "api",
  });
  return out;
}
