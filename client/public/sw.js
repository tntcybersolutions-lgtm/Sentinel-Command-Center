const SW_VERSION = 'sentinel-sw-v3';
const PDF_CACHE = 'sentinel-pdf-v1';
const PRECACHE = ['/', '/manifest.json', '/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SW_VERSION)
      .then((c) => c.addAll(PRECACHE).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SW_VERSION && k !== PDF_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // PDFs (drawings): cache-first, larger budget
  if (/\.pdf(\?|$)/i.test(url.pathname)) {
    e.respondWith(
      caches.open(PDF_CACHE).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((resp) => {
          if (resp && resp.status === 200) c.put(req, resp.clone()).catch(() => null);
          return resp;
        }))
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // assets: cache-first
  if (
    /^\/assets\//.test(url.pathname) ||
    /\.(png|ico|webmanifest|json)$/.test(url.pathname) ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json'
  ) {
    e.respondWith(
      caches.match(req).then((r) =>
        r ||
        fetch(req).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(SW_VERSION).then((c) => c.put(req, copy)).catch(() => null);
          }
          return resp;
        })
      )
    );
    return;
  }

  // api GETs: stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      caches.open(SW_VERSION).then((c) =>
        c.match(req).then((cached) => {
          const network = fetch(req)
            .then((resp) => {
              if (resp && resp.ok) c.put(req, resp.clone());
              return resp;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // navigations: network first, fallback to '/'
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/')));
  }
});

self.addEventListener('sync', (e) => {
  if (e.tag === 'sentinel-outbound') {
    e.waitUntil(
      self.clients.matchAll().then((cs) =>
        cs.forEach((c) => c.postMessage({ type: 'flush-outbound' }))
      )
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'request-flush') {
    if ('sync' in self.registration) {
      self.registration.sync.register('sentinel-outbound').catch(() => {
        self.clients.matchAll().then((cs) =>
          cs.forEach((c) => c.postMessage({ type: 'flush-outbound' }))
        );
      });
    } else {
      self.clients.matchAll().then((cs) =>
        cs.forEach((c) => c.postMessage({ type: 'flush-outbound' }))
      );
    }
  }
});

// ── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = { title: 'Sentinel', body: '', url: '/home' };
  try { if (e.data) data = Object.assign(data, e.data.json()); } catch (_) {
    try { data.body = e.data ? e.data.text() : ''; } catch (_) { /* ignore */ }
  }
  const opts = {
    body: data.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    data: { url: data.url || '/home' },
    tag: data.tag || 'sentinel',
    renotify: !!data.renotify,
  };
  e.waitUntil(self.registration.showNotification(data.title || 'Sentinel', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/home';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if ('focus' in c && c.url.includes(self.location.origin)) {
          c.navigate(target).catch(() => null);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return null;
    })
  );
});
