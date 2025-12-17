// Route Stats PWA Service Worker (safe)
// Bump when user-visible changes land to force fresh assets
const CACHE_VERSION = 'rs-pwa-v2025-11-23-6';
const STATIC_CACHE = CACHE_VERSION + '-static';

const SAME_ORIGIN = self.location.origin;

// Pre-cache minimal shell
const PRECACHE_URLS = [
  './',
  './index.html',
  './public/app.js',
  './manifest.json',
  './icon-180.png',
  './icon-192.jpg',
  './icon-512.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(key => {
      if (!key.startsWith(CACHE_VERSION)) return caches.delete(key);
    }));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === SAME_ORIGIN) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request).catch(() => null);
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })());
  }
});
