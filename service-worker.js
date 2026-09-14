const SHELL_CACHE = "ptc-shell-v4";
const TILE_CACHE = "ptc-tiles-v1";

const SHELL_FILES = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "data/stops.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/star.png",
  "icons/grey.png",
  "icons/green.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isMapTile(url) {
  return url.hostname.includes("tile.openstreetmap.org");
}
function isLeafletAsset(url) {
  return url.hostname === "unpkg.com" && url.pathname.includes("leaflet");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Map tiles & the Leaflet library: cache-first, fall back to network,
  // and store whatever we fetch so it works offline next time.
  if (isMapTile(url) || isLeafletAsset(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // App shell files: network-first, so updates (like this one) show up
  // immediately when you're online. Falls back to the cached copy only
  // when there's no connection, so the app still works fully offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
