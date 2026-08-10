const CACHE = 'brolly-v18';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./', './index.html']))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Weather API: network-first, cache last response as offline fallback.
  if (url.hostname === 'api.open-meteo.com') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request, { cacheName: CACHE }))
    );
    return;
  }

  // Same-origin app code (index.html, lib/weather.mjs, manifest, icons,
  // demo fixtures): network-first, Cache Storage only as an offline
  // fallback. This used to be cache-first like everything else below, and
  // that's the likely cause of a real bug: a file cached under the
  // *current* version's bucket was served from cache forever with no
  // further network check, until the *next* version bump swept the whole
  // bucket. If that first cache-populate for e.g. lib/weather.mjs ever
  // captured a stale response — this fetch() silently satisfied from the
  // browser's own HTTP disk cache instead of truly hitting the network, or
  // an old not-yet-swept bucket got matched by an unscoped caches.match()
  // — it stayed stuck showing stale JS under a version label that looked
  // correct (index.html's own VERSION string could read "v15" while
  // lib/weather.mjs quietly kept running v14's code), and no amount of
  // reloading fixed it: observed on real devices, one JS module rendering
  // an old UI while the page shell around it had genuinely updated.
  // `cache:'reload'` forces this fetch to bypass that disk cache too, not
  // just our own Cache Storage bucket.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          if (r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() => caches.match(e.request, { cacheName: CACHE }))
    );
    return;
  }

  // Everything else (Leaflet CDN, OSM tiles): cache-first, populate on
  // miss — external, essentially immutable per URL, worth saving the
  // round trip. caches.match() is explicitly scoped to CACHE here too (not
  // left to search every bucket ever created) so a lingering
  // not-yet-deleted old bucket can never quietly satisfy a request instead
  // of the current version's — the same fix as above, for the same reason.
  e.respondWith(
    caches.match(e.request, { cacheName: CACHE }).then(
      r => r ?? fetch(e.request).then(r2 => {
        if (r2.ok) caches.open(CACHE).then(c => c.put(e.request, r2.clone()));
        return r2;
      })
    )
  );
});
