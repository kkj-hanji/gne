"use strict";

const CACHE_PREFIX = "gndec-compass-shell-";
const CACHE_NAME = `${CACHE_PREFIX}20260901-3`;
const SHELL = [
  "/",
  "/index.html",
  "/styles.css?v=20260831-2",
  "/brain-kernel.js?v=20260901-3",
  "/brain-v1-2.js?v=20260901-3",
  "/brain-v2-2.js?v=20260901-3",
  "/brain-v2.js?v=20260831-2",
  "/app.js?v=20260901-3",
  "/manifest.webmanifest?v=20260821-13",
  "/icon.svg?v=20260821-13"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => null))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

function cacheResponse(event, request, response) {
  if (!response?.ok || response.type !== "basic" || response.bodyUsed) return;
  let copy;
  try { copy = response.clone(); }
  catch { return; }
  // Cache writes are best-effort. A browser can cancel a response while the
  // tab changes pages, so never allow cache cloning/writing to create an
  // unhandled service-worker error or affect the response sent to the page.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {}));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then((response) => {
      cacheResponse(event, "/", response);
      return response;
    }).catch(async () => (await caches.match("/")) || (await caches.match("/index.html")) || new Response(
      "GNDEC Compass is offline and its app shell has not been cached yet.",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    )));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      cacheResponse(event, request, response);
      return response;
    });
  }));
});
