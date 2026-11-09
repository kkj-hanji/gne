/* GNDEC Compass Next — service worker.
 *
 * Scope is the new app only. The frozen legacy build lives on a different
 * origin with its own service worker, so neither cache can overwrite the other.
 *
 * Strategy:
 *   shell      cache-first, refreshed in the background
 *   legacy API network-first, cached copy used when the network fails
 *   navigation cached shell, never a guessed offline error page
 */

const VERSION = "compass-next-v2.3.0";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./boot.js",
  "./app.js",
  "./manifest.webmanifest",
  "./settings-registry.js",
  "./settings-store.js",
  "./seo-meta.js",
  "./engine/datetime.js",
  "./engine/language.js",
  "./engine/fet-parser.js",
  "./engine/free-rooms.js",
  "./engine/answer.js",
  "./engine/brain-bridge.js",
  "./engine/storage.js",
  "./engine/reminders.js",
  "./engine/ics.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll fails the whole install if one asset is missing; add individually.
    await Promise.all(SHELL_ASSETS.map(async (asset) => {
      try { await cache.add(new Request(asset, { cache: "reload" })); } catch { /* optional */ }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("compass-next-") && !key.startsWith(VERSION))
      .map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch { /* not supported */ }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isLegacyApi(url) {
  return url.pathname.startsWith("/api/");
}

function isStatic(url) {
  return /\.(?:css|js|svg|png|webmanifest|woff2?|json)$/i.test(url.pathname);
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok && request.method === "GET") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-Compass-Offline", "1");
      return new Response(cached.body, { status: cached.status, headers });
    }
    throw error;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Refresh quietly so the next launch has the newest shell.
    if (request.method === "GET") {
      fetch(request).then((response) => {
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      }).catch(() => {});
    }
    return cached;
  }
  const response = await fetch(request);
  if (response && response.ok && request.method === "GET") {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Only handle same-origin requests; never intercept the legacy origin.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      try {
        const response = await fetch(request);
        if (response && response.ok && /text\/html/i.test(response.headers.get("Content-Type") || "")) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch {
        return (await cache.match(request))
          || (await cache.match("./index.html"))
          || (await cache.match("./"))
          || Response.error();
      }
    })());
    return;
  }

  if (isLegacyApi(url)) {
    event.respondWith(networkFirst(request, DATA_CACHE).catch(() => Response.error()));
    return;
  }

  if (isStatic(url) || url.pathname === "/") {
    event.respondWith(cacheFirst(request, SHELL_CACHE).catch(() => Response.error()));
  }
});
