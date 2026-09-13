/* CrimeTimeSnacks service worker - v2
   Strategy: network-first for pages and for scripts/styles (always the deployed
   code), stale-while-revalidate for images and other assets, offline.html when
   the network is gone. Bump VERSION to invalidate.

   v2: v1 served /js and /css stale-while-revalidate, and its background refresh
   went through the browser HTTP cache, which then held a week-long copy. A
   returning visitor could run last week's main.js for days after a deploy; on
   2026-09-13 that meant the new Case File signup did nothing for them. Scripts
   and styles now revalidate with the server on every load, and the precache
   bypasses the HTTP cache. */
const VERSION = 'cts-v2';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/css/style.css?v=2026r', '/js/main.js', '/js/effects.js', '/images/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, revalidating with the server (ETag) rather than trusting the HTTP
// cache; the stored copy is only for when the network is gone.
function networkFirst(req, fallback) {
  return fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || fallback()));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch cross-origin (audio CDNs, YouTube, FBI API)
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, () => caches.match(OFFLINE_URL)));
    return;
  }

  if (/^\/(js|css)\//.test(url.pathname)) {
    e.respondWith(networkFirst(req, () => Response.error()));
    return;
  }

  // images and the rest: stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || refresh;
    })
  );
});
