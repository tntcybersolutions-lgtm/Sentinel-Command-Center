import { openDB, type IDBPDatabase } from "idb";

export interface QueuedRequest {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  createdAt: number;
  attempts: number;
  kind?: string;
  target?: string;
  lastError?: string | null;
  lastTriedAt?: number | null;
}

// Sprint TK2 — pending photo upload entry. The blob lives in IDB until we
// can complete the presigned-URL handshake against /api/uploads/request-url
// and PUT it to GCS. Daily-log / punch-item rows reference these by
// placeholder URL `idb-photo://${id}` until the real objectPath is written.
export interface QueuedPhoto {
  id: string;
  blob: Blob;
  filename: string;
  contentType: string;
  size: number;
  createdAt: number;
  attempts: number;
  objectPath?: string | null;
  uploadedAt?: number | null;
  lastError?: string | null;
  lastTriedAt?: number | null;
  context?: string | null;
}

const DB_NAME = "sentinel-outbox";
const DB_VERSION = 2;
const STORE = "outbound";
const INDEX = "by-createdAt";
const PHOTO_STORE = "photos";
const PHOTO_INDEX = "by-createdAt";
const SYNC_TAG = "sentinel-outbound";
const MAX_ATTEMPTS = 8;
const PHOTO_PLACEHOLDER_SCHEME = "idb-photo://";

// Sprint TK1 — attach mobile session header on every apiFetch and replay.
// Read from localStorage so the helper survives page refreshes without React.
function getAuthHeaders(): Record<string, string> {
  try {
    if (typeof localStorage === "undefined") return {};
    const id = localStorage.getItem("sentinel-user-id");
    return id ? { "x-sentinel-user": id } : {};
  } catch {
    return {};
  }
}
function redirectToLoginIfMobile(): void {
  try {
    if (typeof window === "undefined") return;
    const p = window.location.pathname;
    if (!p.startsWith("/m-") || p === "/m-login") return;
    window.location.href = "/m-login";
  } catch { /* ignore */ }
}

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex(INDEX, "createdAt");
        }
        if (oldVersion < 2 && !db.objectStoreNames.contains(PHOTO_STORE)) {
          const ps = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
          ps.createIndex(PHOTO_INDEX, "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

const listeners = new Set<(count: number) => void>();
async function notify(): Promise<void> {
  try {
    const count = await pending();
    listeners.forEach((fn) => {
      try { fn(count); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

export function subscribe(listener: (count: number) => void): () => void {
  listeners.add(listener);
  pending().then((c) => { try { listener(c); } catch { /* ignore */ } }).catch(() => listener(0));
  return () => { listeners.delete(listener); };
}

export async function pending(): Promise<number> {
  try {
    const db = await getDB();
    return await db.count(STORE);
  } catch {
    return 0;
  }
}

export async function list(): Promise<QueuedRequest[]> {
  try {
    const db = await getDB();
    return (await db.getAllFromIndex(STORE, INDEX)) as QueuedRequest[];
  } catch {
    return [];
  }
}

export async function remove(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(STORE, id);
    void notify();
  } catch { /* ignore */ }
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function tryRegisterSync(): Promise<void> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const anyReg = reg as unknown as { sync?: { register: (tag: string) => Promise<void> } };
    if (anyReg.sync && typeof anyReg.sync.register === "function") {
      await anyReg.sync.register(SYNC_TAG);
    }
  } catch { /* ignore — Background Sync unsupported on iOS Safari */ }
}

// Map a URL+method to a friendly kind/target so the SyncSheet can show
// human-readable labels instead of raw paths.
function describe(method: string, url: string): { kind: string; target: string } {
  try {
    const u = new URL(url, "http://x");
    const path = u.pathname;
    if (/\/projects\/[^/]+\/daily-log/.test(path)) return { kind: "Daily Log", target: path.split("/")[3] || "" };
    if (/\/projects\/[^/]+\/drawings/.test(path)) return { kind: "Drawing", target: path.split("/")[3] || "" };
    if (/\/drawings\/[^/]+\/pins/.test(path)) return { kind: "Drawing Pin", target: path.split("/")[3] || "" };
    if (/\/projects\/[^/]+\/photos/.test(path)) return { kind: "Photo", target: path.split("/")[3] || "" };
    if (/\/rfis/.test(path)) return { kind: "RFI", target: path };
    if (/\/approvals/.test(path)) return { kind: "Approval", target: path };
    return { kind: method, target: path };
  } catch {
    return { kind: method, target: url };
  }
}

export async function enqueue(req: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ id: string }> {
  const desc = describe(req.method, req.url);
  const entry: QueuedRequest = {
    id: newId(),
    method: req.method.toUpperCase(),
    url: req.url,
    headers: req.headers ?? {},
    body: req.body,
    createdAt: Date.now(),
    attempts: 0,
    kind: desc.kind,
    target: desc.target,
    lastError: null,
    lastTriedAt: null,
  };
  const db = await getDB();
  await db.put(STORE, entry);
  void notify();
  void tryRegisterSync();
  return { id: entry.id };
}

let flushing = false;

async function attemptOne(item: QueuedRequest): Promise<{ ok: boolean; error?: string }> {
  try {
    // Sprint TK2 — before sending a queued request body, resolve any
    // `idb-photo://${id}` placeholders to real objectPaths. If a photo is
    // still pending upload, we leave its placeholder in place; the next
    // replay will pick it up after photos finish uploading.
    const resolvedBody = await resolvePhotoPlaceholders(item.body);
    const resp = await fetch(item.url, {
      method: item.method,
      headers: {
        ...(item.headers ?? {}),
        ...getAuthHeaders(),
        "Idempotency-Key": item.id,
        "Content-Type": "application/json",
      },
      body: resolvedBody,
    });
    if (resp.ok) return { ok: true };
    let detail = "";
    try { detail = (await resp.clone().text()).slice(0, 200); } catch { /* ignore */ }
    return { ok: false, error: `HTTP ${resp.status}${detail ? `: ${detail}` : ""}` };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || "network error" };
  }
}

async function recordFailure(item: QueuedRequest, error: string): Promise<void> {
  const next: QueuedRequest = {
    ...item,
    attempts: item.attempts + 1,
    lastError: error,
    lastTriedAt: Date.now(),
  };
  try {
    const db = await getDB();
    if (next.attempts >= MAX_ATTEMPTS) {
      await db.delete(STORE, item.id);
    } else {
      await db.put(STORE, next);
    }
    void notify();
  } catch { /* ignore */ }
}

export async function retry(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDB();
    const item = (await db.get(STORE, id)) as QueuedRequest | undefined;
    if (!item) return { ok: false, error: "not found" };
    const result = await attemptOne(item);
    if (result.ok) {
      await remove(id);
      return { ok: true };
    }
    await recordFailure(item, result.error || "unknown");
    return { ok: false, error: result.error };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || "retry failed" };
  }
}

export async function flush(): Promise<{ flushed: number; failed: number }> {
  if (flushing) return { flushed: 0, failed: 0 };
  flushing = true;
  let flushed = 0;
  let failed = 0;
  try {
    // Sprint TK2 — drain pending photo uploads first so subsequent queued
    // requests (daily-log saves, punch-item creates) can substitute real
    // objectPaths into their bodies before sending.
    try { await flushPhotos(); } catch { /* ignore */ }
    const items = await list();
    for (const item of items) {
      const result = await attemptOne(item);
      if (result.ok) {
        await remove(item.id);
        flushed += 1;
      } else {
        failed += 1;
        await recordFailure(item, result.error || "unknown");
        if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      }
    }
  } finally {
    flushing = false;
  }
  return { flushed, failed };
}

export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") {
    const auth = getAuthHeaders();
    const merged: HeadersInit = { ...(init.headers as Record<string, string> | undefined), ...auth };
    const resp = await fetch(url, { ...init, headers: merged });
    if (resp.status === 401) redirectToLoginIfMobile();
    return resp;
  }
  // FormData / Blob bodies cannot survive IDB — let them go through (or fail loudly)
  const body = init.body;
  const isQueueable = body == null || typeof body === "string";
  if (!isQueueable) {
    return fetch(url, init);
  }
  try {
    const auth = getAuthHeaders();
    const merged: HeadersInit = { ...(init.headers as Record<string, string> | undefined), ...auth };
    const resp = await fetch(url, { ...init, headers: merged });
    if (resp.status === 401) redirectToLoginIfMobile();
    if (resp.status === 0 || resp.status >= 500) {
      throw new Error(`status ${resp.status}`);
    }
    return resp;
  } catch {
    const headers: Record<string, string> = {};
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) headers[k] = v;
    } else if (h && typeof h === "object") {
      Object.assign(headers, h as Record<string, string>);
    }
    const { id } = await enqueue({
      method,
      url,
      headers,
      body: typeof body === "string" ? body : undefined,
    });
    return new Response(JSON.stringify({ queued: true, id }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ============================================================================
// Sprint TK2 — Offline photo capture queue
// ----------------------------------------------------------------------------
// Photos captured in the field can't go through the JSON apiFetch path
// because their bodies are Blobs (not survivable in IDB inside a request
// envelope, and the upload itself uses a direct PUT to GCS). We solve this
// with a dedicated `photos` IDB store: each entry holds the raw Blob plus
// the eventual objectPath once the presigned-URL handshake completes.
//
// Callers stash a photo via `enqueuePhoto(file)`, which returns a stable id.
// The caller then uses `idb-photo://<id>` as the photo URL in their model
// (e.g. daily_log.photoUrls). Renderers resolve via `getPhotoDisplayUrl(id)`
// to either the local Blob preview (offline / pending) or the uploaded
// objectPath (after success). On every `flush()`, pending photos are
// uploaded first so subsequent queued JSON requests can substitute real
// objectPaths into their bodies.
// ============================================================================

const photoListeners = new Set<(state: { pending: number; uploaded: number }) => void>();

async function notifyPhotos(): Promise<void> {
  try {
    const all = await listPhotos();
    const pendingCount = all.filter((p) => !p.objectPath).length;
    const uploadedCount = all.length - pendingCount;
    photoListeners.forEach((fn) => {
      try { fn({ pending: pendingCount, uploaded: uploadedCount }); } catch { /* ignore */ }
    });
  } catch { /* ignore */ }
}

export function subscribePhotos(
  listener: (state: { pending: number; uploaded: number }) => void,
): () => void {
  photoListeners.add(listener);
  void notifyPhotos();
  return () => { photoListeners.delete(listener); };
}

export async function listPhotos(): Promise<QueuedPhoto[]> {
  try {
    const db = await getDB();
    return (await db.getAllFromIndex(PHOTO_STORE, PHOTO_INDEX)) as QueuedPhoto[];
  } catch {
    return [];
  }
}

export async function getPhoto(id: string): Promise<QueuedPhoto | null> {
  try {
    const db = await getDB();
    const p = (await db.get(PHOTO_STORE, id)) as QueuedPhoto | undefined;
    return p ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve a photo url for <img src>. Accepts the raw placeholder
 * (`idb-photo://<id>`) or a real objectPath and returns the best display
 * url available right now. If a placeholder's photo has finished uploading
 * we return the objectPath, otherwise an object URL backed by the local Blob.
 */
export async function getPhotoDisplayUrl(url: string): Promise<string> {
  if (!url.startsWith(PHOTO_PLACEHOLDER_SCHEME)) return url;
  const id = url.slice(PHOTO_PLACEHOLDER_SCHEME.length);
  const p = await getPhoto(id);
  if (!p) return url; // unknown — leave the placeholder, caller can show fallback
  if (p.objectPath) return p.objectPath;
  return URL.createObjectURL(p.blob);
}

/**
 * Stash a captured photo in IDB and try to upload it now. The returned
 * `placeholderUrl` should be stored in the caller's model (e.g.
 * daily_log.photoUrls). When the upload eventually completes — either
 * immediately, on the next `flush()`, or after the user comes back online —
 * any queued JSON request bodies that reference the placeholder get
 * rewritten to point at the real objectPath in `attemptOne`.
 */
export async function enqueuePhoto(
  file: File | Blob,
  options?: { filename?: string; contentType?: string; context?: string },
): Promise<{ id: string; placeholderUrl: string }> {
  const id = newId();
  const filename = options?.filename
    || (file instanceof File ? file.name : `photo-${id}.jpg`);
  const contentType = options?.contentType
    || (file instanceof File ? file.type : "image/jpeg")
    || "application/octet-stream";
  const entry: QueuedPhoto = {
    id,
    blob: file,
    filename,
    contentType,
    size: file.size,
    createdAt: Date.now(),
    attempts: 0,
    objectPath: null,
    uploadedAt: null,
    lastError: null,
    lastTriedAt: null,
    context: options?.context ?? null,
  };
  try {
    const db = await getDB();
    await db.put(PHOTO_STORE, entry);
    void notifyPhotos();
    // Fire-and-forget — we don't block the UI. On failure the blob waits in
    // IDB until the next flush.
    void attemptOnePhoto(entry).then(() => notifyPhotos());
  } catch (e) {
    console.warn("[offline-queue] enqueuePhoto failed to persist", (e as Error)?.message);
  }
  return { id, placeholderUrl: `${PHOTO_PLACEHOLDER_SCHEME}${id}` };
}

async function attemptOnePhoto(p: QueuedPhoto): Promise<{ ok: boolean; error?: string }> {
  if (p.objectPath) return { ok: true };
  try {
    // 1) Ask the server for a presigned URL. apiFetch will queue if offline,
    //    so we use raw fetch here — we want a hard fail to retry later.
    const headers: Record<string, string> = { "Content-Type": "application/json", ...getAuthHeaders() };
    const r1 = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: p.filename, size: p.size, contentType: p.contentType }),
    });
    if (!r1.ok) throw new Error(`request-url HTTP ${r1.status}`);
    const { uploadURL, objectPath } = (await r1.json()) as { uploadURL: string; objectPath: string };
    // 2) PUT the blob directly to GCS.
    const r2 = await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": p.contentType },
      body: p.blob,
    });
    if (!r2.ok) throw new Error(`gcs PUT HTTP ${r2.status}`);
    // 3) Persist the resolved objectPath alongside the blob — we keep the
    //    blob a bit longer so still-rendered <img> tags don't break, then
    //    a cleanup pass removes it after the next save.
    try {
      const db = await getDB();
      const updated: QueuedPhoto = { ...p, objectPath, uploadedAt: Date.now(), lastError: null };
      await db.put(PHOTO_STORE, updated);
    } catch { /* ignore */ }
    return { ok: true };
  } catch (err) {
    const error = (err as Error)?.message || "photo upload failed";
    try {
      const db = await getDB();
      const updated: QueuedPhoto = {
        ...p,
        attempts: p.attempts + 1,
        lastError: error,
        lastTriedAt: Date.now(),
      };
      // We never auto-delete photos on max attempts — losing a field photo
      // is unacceptable. Surface them in the SyncSheet for manual retry.
      await db.put(PHOTO_STORE, updated);
    } catch { /* ignore */ }
    return { ok: false, error };
  }
}

export async function flushPhotos(): Promise<{ flushed: number; failed: number }> {
  let flushed = 0;
  let failed = 0;
  try {
    const items = await listPhotos();
    for (const p of items) {
      if (p.objectPath) continue; // already uploaded — skip
      const result = await attemptOnePhoto(p);
      if (result.ok) flushed += 1;
      else {
        failed += 1;
        if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      }
    }
    void notifyPhotos();
  } catch { /* ignore */ }
  return { flushed, failed };
}

/**
 * Manually retry a single pending photo. Used by SyncSheet retry buttons.
 */
export async function retryPhoto(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const p = await getPhoto(id);
    if (!p) return { ok: false, error: "not found" };
    const r = await attemptOnePhoto(p);
    void notifyPhotos();
    return r;
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || "retry failed" };
  }
}

/**
 * Permanently drop a pending photo (e.g. user removed it from the log
 * before it ever uploaded). Frees IDB space.
 */
export async function removePhoto(id: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(PHOTO_STORE, id);
    void notifyPhotos();
  } catch { /* ignore */ }
}

/**
 * Walk a JSON request body (string) and replace any `idb-photo://<id>`
 * placeholders with their resolved objectPaths, leaving unresolved ones
 * alone. Returns the same string if no placeholders exist.
 */
async function resolvePhotoPlaceholders(body?: string): Promise<string | undefined> {
  if (!body || typeof body !== "string") return body;
  if (!body.includes(PHOTO_PLACEHOLDER_SCHEME)) return body;
  try {
    // Regex over the raw JSON is safe: placeholder ids are uuid-shaped and
    // don't contain quote chars. Avoids parsing arbitrary JSON shapes.
    const ids = new Set<string>();
    const re = /idb-photo:\/\/([a-zA-Z0-9-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) ids.add(m[1]);
    if (ids.size === 0) return body;
    const mapping = new Map<string, string>();
    for (const id of ids) {
      const p = await getPhoto(id);
      if (p?.objectPath) mapping.set(id, p.objectPath);
    }
    if (mapping.size === 0) return body;
    return body.replace(re, (full, id) => mapping.get(id) ?? full);
  } catch {
    return body;
  }
}

let initialized = false;
function init(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    window.addEventListener("online", () => { void flush(); });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        if ((e.data as { type?: string } | null)?.type === "flush-outbound") void flush();
      });
    }
  } catch { /* ignore */ }
}
init();
