// Route Stats PWA Service Worker (safe)
const CACHE_VERSION = 'rs-pwa-v2025-09-20-23';
const STATIC_CACHE = CACHE_VERSION + '-static';

const SAME_ORIGIN = self.location.origin;

// Pre-cache minimal shell
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-180.png',
  './icon-192.jpg',
  './icon-512.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

// Allow page to ask SW to activate immediately
self.addEventListener('message', (event) => {
  const data = event && event.data;
  if (data && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => {
      if (!k.startsWith(CACHE_VERSION)) return caches.delete(k);
    }))).then(() => self.clients.claim())
  );
});

function isSupabase(url) {
  return /supabase\.co/i.test(url);
}

// Only handle same-origin GET requests. Never intercept Supabase or other cross-origin calls.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;
  if (isSupabase(req.url)) return;

  // Only same-origin
  if (url.origin !== SAME_ORIGIN) return;

  // For navigation requests: network-first with cache fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || caches.match('./index.html');
      }
    })());
    return;
  }

  // For static assets: cache-first
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
