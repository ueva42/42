const CACHE_VERSION = "sol-logbuch-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const ASSET_CACHE = `${CACHE_VERSION}-assets`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;
const OFFLINE_URL = "/offline.html";

const CORE_ASSETS = [
  "/login",
  "/manifest.json",
  "/pwa-init.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  OFFLINE_URL
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function trimCache(cacheName, maxItems) {
  return caches.open(cacheName).then(async (cache) => {
    const keys = await cache.keys();
    if (keys.length <= maxItems) return;
    await cache.delete(keys[0]);
    return trimCache(cacheName, maxItems);
  });
}

function staleWhileRevalidate(request, cacheName, maxItems = 80) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
          trimCache(cacheName, maxItems);
        }
        return response;
      })
      .catch(() => null);

    return cached || networkPromise || Response.error();
  });
}

function networkFirstPage(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    })
    .catch(async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cachedPage = await cache.match(request);
      if (cachedPage) return cachedPage;
      return cache.match(OFFLINE_URL);
    });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  if (url.origin !== self.location.origin) {
    if (url.hostname.includes("fonts.googleapis.com")) {
      event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, 80));
      return;
    }

    if (url.hostname.includes("fonts.gstatic.com")) {
      event.respondWith(staleWhileRevalidate(request, FONT_CACHE, 30));
      return;
    }
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
    return;
  }

  const destination = request.destination;

  if (destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, 120));
    return;
  }

  if (destination === "style" || destination === "script") {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE, 80));
    return;
  }

  if (destination === "font") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE, 40));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
