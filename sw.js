const CACHE = 'brolly-v3';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./', './index.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Weather API: network-first, cache last response as offline fallback
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Everything else (app shell, Leaflet CDN, OSM tiles):
  // cache-first, populate on miss
  e.respondWith(
    caches.match(e.request).then(
      r => r ?? fetch(e.request).then(r2 => {
        if (r2.ok) caches.open(CACHE).then(c => c.put(e.request, r2.clone()));
        return r2;
      })
    )
  );
});
