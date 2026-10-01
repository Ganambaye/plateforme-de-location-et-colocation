/* Tanal Sa Logement - Service Worker
   Réseau d'abord, cache en secours : le site est toujours à jour en ligne
   et reste consultable hors connexion une fois visité. */
const CACHE = 'tanal-v1';

const PRECACHE = [
  '/',
  '/css/style.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/pwa.js',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // L'API (connexion, données) passe toujours par le réseau, jamais le cache
  if (url.pathname.startsWith('/functions/') || url.pathname.startsWith('/api')) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const statique = /\.(css|js|png|jpg|svg|webp|ico|webmanifest|json)$/.test(url.pathname) || req.mode === 'navigate';
          if (statique) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) =>
          hit || (req.mode === 'navigate' ? caches.match('/') : new Response('', { status: 504 }))
        )
      )
  );
});
