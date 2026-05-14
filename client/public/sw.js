// Sentinel Command Center service worker
// Cache-first shell for the offline-friendly mobile screens.
// Bumped on each deploy via CACHE_VERSION. Stale caches are auto-purged on activate.
const CACHE_VERSION = "sentinel-shell-v1";
const SHELL_URLS = [
  "/",
  "/home",
  "/my-day",
  "/approvals",
  "/voice-daily-log",
  "/photos",
  "/manifest.json",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_URLS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Only handle GETs on same-origin navigation/static; let API + cross-origin pass through.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/__")) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => null);
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || fetchPromise;
    })()
  );
});

