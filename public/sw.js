const CACHE_VERSION = "sol-logbuch-v22";
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

function cacheResponse(request, response, cacheName, maxItems = 80, cache = null) {
  if (!response || !response.ok) return;
  const copy = response.clone();
  const doPut = (c) => {
    c.put(request, copy);
    trimCache(cacheName, maxItems);
  };
  if (cache) {
    doPut(cache);
  } else {
    caches.open(cacheName).then(doPut);
  }
}

function networkFirstAsset(request, cacheName, maxItems = 80) {
  return fetch(request)
    .then((response) => {
      cacheResponse(request, response, cacheName, maxItems);
      return response;
    })
    .catch(() => caches.match(request));
}

function staleWhileRevalidate(request, cacheName, maxItems = 80) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
      .then((response) => {
        cacheResponse(request, response, cacheName, maxItems, cache);
        return response;
      })
      .catch(() => null);

    return cached || networkPromise || Response.error();
  });
}

function isPrivateAppPath(pathname) {
  return (
    pathname.startsWith("/teacher/") ||
    pathname.startsWith("/student/") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/superadmin")
  );
}

function networkOnlyPage(request) {
  return fetch(request);
}

function networkFirstPage(request) {
  const pathname = new URL(request.url).pathname;
  if (isPrivateAppPath(pathname)) {
    return networkOnlyPage(request);
  }

  return fetch(request)
    .then((response) => {
      cacheResponse(request, response, STATIC_CACHE);
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
    const pathname = url.pathname;
    if (isPrivateAppPath(pathname)) {
      event.respondWith(networkOnlyPage(request));
      return;
    }
    event.respondWith(networkFirstPage(request));
    return;
  }

  const destination = request.destination;

  if (destination === "image") {
    // Hero-Assets immer network-first, damit neue Dateien mit gleichem Namen nicht aus dem Image-Cache kommen
    if (url.pathname.startsWith("/icons/student/hero/")) {
      event.respondWith(networkFirstAsset(request, IMAGE_CACHE, 120));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, 120));
    return;
  }

  if (destination === "style" || destination === "script") {
    if (url.pathname.startsWith("/js/")) {
      event.respondWith(networkFirstAsset(request, ASSET_CACHE, 80));
      return;
    }
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
