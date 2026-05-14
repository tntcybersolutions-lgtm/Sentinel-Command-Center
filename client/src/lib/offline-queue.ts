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

const DB_NAME = "sentinel-outbox";
const DB_VERSION = 1;
const STORE = "outbound";
const INDEX = "by-createdAt";
const SYNC_TAG = "sentinel-outbound";
const MAX_ATTEMPTS = 8;

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex(INDEX, "createdAt");
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
    const resp = await fetch(item.url, {
      method: item.method,
      headers: {
        ...(item.headers ?? {}),
        "Idempotency-Key": item.id,
        "Content-Type": "application/json",
      },
      body: item.body,
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
    return fetch(url, init);
  }
  // FormData / Blob bodies cannot survive IDB — let them go through (or fail loudly)
  const body = init.body;
  const isQueueable = body == null || typeof body === "string";
  if (!isQueueable) {
    return fetch(url, init);
  }
  try {
    const resp = await fetch(url, init);
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
