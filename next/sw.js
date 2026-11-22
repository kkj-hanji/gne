/* GNDEC Compass Next service worker.
 * The legacy app is served from another origin and is never controlled here.
 */

const VERSION = "compass-next-v3.1.2";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const DATA_FRESH_MS = 24 * 60 * 60 * 1000;
const DATA_OFFLINE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DATA_ENTRIES = 80;
const MAX_SHELL_ENTRIES = 100;

// Large timetable documents are fetched and cached after the app starts using
// them, so installing the shell does not wait on half a megabyte of HTML.
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
  "./engine/calendar.js",
  "./engine/exams.js",
  "./engine/profile-lookup.js",
  "./engine/profile-history.js",
  "./engine/mentoring.js",
  "./engine/notices.js",
  "./engine/papers.js",
  "./engine/syllabus.js",
  "./data/ptu-holidays-2027.js",
  "./data/ptu-holiday-sources.js",
  "./data/papers-index.json",
  "./data/appsc-first-year-scheme-2025.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL_ASSETS.map(async (asset) => {
      try { await cache.add(new Request(asset, { cache: "reload" })); } catch { /* optional asset */ }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith("compass-next-") && !key.startsWith(VERSION))
      .map((key) => caches.delete(key)));
    await cleanDataCache();
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

function isPublicApi(url) {
  const path = url.pathname;
  if (path === "/api/version" || path === "/api/content" || path === "/api/official-notices" || path === "/api/ptu-holidays") return true;
  if ([
    "/api/legacy/api/sources",
    "/api/legacy/api/section-list",
    "/api/legacy/api/faculty",
    "/api/legacy/data/end-sem-datesheet.json",
    "/api/legacy/data/notices.json",
    "/api/legacy/data/campus.json",
    "/api/legacy/data/faculty-directory-index.json",
    "/api/legacy/data/first-year-syllabus-index.json"
  ].includes(path)) return true;
  if (path === "/api/legacy/api/timetable") return ["groups", "rooms", "subgroups"].includes(url.searchParams.get("source"));
  return false;
}

function isStatic(url) {
  return /\.(?:css|js|html|svg|png|webmanifest|woff2?|json)$/i.test(url.pathname);
}

function canStoreResponse(request, response) {
  if (!response?.ok || response.type === "opaque" || request.method !== "GET") return false;
  if (request.headers?.has("authorization")) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/(?:^|,)\s*(?:no-store|private)(?:\s*=|\s*(?:,|$))/i.test(cacheControl)) return false;
  if ((response.headers.get("vary") || "").split(",").some((value) => value.trim() === "*")) return false;
  return true;
}

function cacheAge(response) {
  const timestamp = Number(response?.headers.get("x-compass-cached-at"));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const age = Date.now() - timestamp;
  return age < 0 ? null : age;
}

function storedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Compass-Cached-At", String(Date.now()));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function taggedResponse(response, cacheStatus) {
  const headers = new Headers(response.headers);
  headers.set("X-Compass-Cache", cacheStatus);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function offlineResponse(response, age) {
  const headers = new Headers(response.headers);
  headers.set("X-Compass-Offline", "1");
  headers.set("X-Compass-Cache", age > DATA_FRESH_MS ? "stale-offline" : "offline");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Register the lifetime extension synchronously while the fetch event is
// dispatching. Background writes and revalidations can then finish reliably.
function respondWithTrackedWork(event, handler) {
  let responseFinished = false;
  let pendingBackground = 0;
  let finishLifetime;
  const lifetime = new Promise((resolve) => { finishLifetime = resolve; });
  const maybeFinish = () => {
    if (responseFinished && pendingBackground === 0) finishLifetime();
  };
  event.waitUntil(lifetime);
  const track = (task) => {
    pendingBackground += 1;
    Promise.resolve(task).catch(() => {}).finally(() => {
      pendingBackground -= 1;
      maybeFinish();
    });
  };
  event.respondWith(Promise.resolve().then(() => handler(track)).finally(() => {
    responseFinished = true;
    maybeFinish();
  }));
}

async function putBounded(cache, request, response, maxEntries) {
  await cache.put(request, response);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const entries = await Promise.all(keys.map(async (key) => {
    const cached = await cache.match(key);
    return { key, timestamp: Number(cached?.headers.get("x-compass-cached-at")) || 0 };
  }));
  entries.sort((a, b) => a.timestamp - b.timestamp);
  await Promise.all(entries.slice(0, keys.length - maxEntries).map(({ key }) => cache.delete(key)));
}

async function storePublicResponse(cache, request, response, track) {
  if (!canStoreResponse(request, response)) {
    track(cache.delete(request));
    return;
  }
  track(putBounded(cache, request, storedResponse(response.clone()), MAX_DATA_ENTRIES));
}

async function staleWhileRevalidate(request, cacheName, track) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const age = cacheAge(cached);

  if (cached && age !== null && age <= DATA_FRESH_MS) {
    track((async () => {
      const response = await fetch(request);
      await storePublicResponse(cache, request, response, track);
    })());
    return taggedResponse(cached, "hit");
  }

  if (cached && age === null) track(cache.delete(request));
  try {
    const response = await fetch(request);
    await storePublicResponse(cache, request, response, track);
    return response;
  } catch (error) {
    if (cached && age !== null && age <= DATA_OFFLINE_MAX_MS) return offlineResponse(cached, age);
    throw error;
  }
}

async function cacheFirst(request, cacheName, track) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached && request.cache !== "reload") return taggedResponse(cached, "hit");
  const response = await fetch(request);
  if (response?.ok && request.method === "GET") {
    track(putBounded(cache, request, response.clone(), MAX_SHELL_ENTRIES));
  }
  return response;
}

async function navigate(request, cacheName, track) {
  const cache = await caches.open(cacheName);
  if (request.cache !== "reload") {
    const cached = await cache.match(request) || await cache.match("./index.html") || await cache.match("./");
    if (cached) return taggedResponse(cached, "hit");
  }
  try {
    const response = await fetch(request);
    if (response?.ok && /text\/html/i.test(response.headers.get("content-type") || "") && !new URL(request.url).search) {
      track(putBounded(cache, request, response.clone(), MAX_SHELL_ENTRIES));
    }
    return response;
  } catch {
    return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
  }
}

async function cleanDataCache() {
  try {
    const cache = await caches.open(DATA_CACHE);
    const keys = await cache.keys();
    const now = Date.now();
    const entries = await Promise.all(keys.map(async (key) => {
      const response = await cache.match(key);
      const timestamp = Number(response?.headers.get("x-compass-cached-at"));
      const age = now - timestamp;
      if (!Number.isFinite(timestamp) || timestamp <= 0 || age < 0 || age > DATA_OFFLINE_MAX_MS) {
        await cache.delete(key);
        return null;
      }
      return { key, timestamp };
    }));
    const valid = entries.filter(Boolean).sort((a, b) => a.timestamp - b.timestamp);
    await Promise.all(valid.slice(0, Math.max(0, valid.length - MAX_DATA_ENTRIES)).map(({ key }) => cache.delete(key)));
  } catch { /* storage may be unavailable or full */ }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    respondWithTrackedWork(event, (track) => navigate(request, SHELL_CACHE, track));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (!isPublicApi(url)) return;
    respondWithTrackedWork(event, (track) => staleWhileRevalidate(request, DATA_CACHE, track).catch(() => Response.error()));
    return;
  }

  if (isStatic(url)) {
    respondWithTrackedWork(event, (track) => cacheFirst(request, SHELL_CACHE, track).catch(() => Response.error()));
  }
});
