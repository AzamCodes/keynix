// Keynix Service Worker for PWA Offline Application Shell Caching
const CACHE_NAME = "keynix-v2";
const ASSETS_TO_CACHE = [
  "/manifest.json",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith("keynix-") && cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Never persist HTML documents or API responses: pages can contain account
  // state and decrypted UI. Cache only public same-origin static resources.
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) {
    return;
  }
  if (event.request.mode === "navigate" || event.request.destination === "document") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const cacheableStaticAsset =
    requestUrl.pathname.startsWith("/_next/static/") ||
    ["/manifest.json", "/favicon.ico", "/icon.svg", "/apple-touch-icon.png"].includes(requestUrl.pathname);
  if (!cacheableStaticAsset) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          response.type === "basic" &&
          !response.headers.get("Cache-Control")?.toLowerCase().includes("no-store")
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
        });
      })
  );
});
