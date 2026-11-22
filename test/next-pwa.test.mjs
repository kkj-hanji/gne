import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { access, readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const exists = async (path) => {
  try { await access(new URL(path, import.meta.url)); return true; } catch { return false; }
};

async function createServiceWorker(fetcher) {
  const source = await read("../next/sw.js");
  const origin = "https://app.test";
  const listeners = new Map();
  const records = new Map();
  const keyOf = (request) => new URL(typeof request === "string" ? request : request.url, origin).href;
  class MemoryCache {
    constructor(name) { this.name = name; this.entries = new Map(); }
    async match(request) { return this.entries.get(keyOf(request))?.clone(); }
    async put(request, response) { this.entries.set(keyOf(request), response.clone()); }
    async delete(request) { return this.entries.delete(keyOf(request)); }
    async keys() { return [...this.entries.keys()].map((url) => new Request(url)); }
    async add(request) { await this.put(request, await fetcher(new Request(keyOf(request)))); }
  }
  const caches = {
    async open(name) {
      if (!records.has(name)) records.set(name, new MemoryCache(name));
      return records.get(name);
    },
    async keys() { return [...records.keys()]; },
    async delete(name) { return records.delete(name); }
  };
  const self = {
    location: { origin },
    clients: { claim: async () => {} },
    addEventListener(name, handler) { listeners.set(name, handler); },
    skipWaiting() {}
  };
  runInNewContext(source, { self, caches, fetch: fetcher, Request, Response, Headers, URL, Date, Promise, console });
  return {
    caches,
    async fetch(requestUrl, { mode = "cors", cache = "default" } = {}) {
      const request = new Request(new URL(requestUrl, origin), { cache });
      if (mode !== "cors") Object.defineProperty(request, "mode", { value: mode });
      let responsePromise = null;
      const waits = [];
      listeners.get("fetch")({
        request,
        respondWith(promise) { responsePromise = Promise.resolve(promise); },
        waitUntil(promise) { waits.push(Promise.resolve(promise)); }
      });
      return {
        handled: Boolean(responsePromise),
        response: responsePromise ? await responsePromise : null,
        async waitForLifetime() { await Promise.all(waits); }
      };
    }
  };
}

test("the app shell declares the PWA contract", async () => {
  const html = await read("../next/index.html");
  const { document } = parseHTML(html);

  assert.equal(document.documentElement.getAttribute("lang"), "en");
  assert.ok(document.querySelector('meta[name="viewport"]')?.getAttribute("content").includes("width=device-width"));
  assert.equal(document.querySelector('link[rel="manifest"]')?.getAttribute("href"), "./manifest.webmanifest");
  assert.ok(document.querySelector('link[rel="icon"]'));
  assert.ok(document.querySelector('link[rel="apple-touch-icon"]'));
  assert.equal(document.querySelectorAll("script[src]").length, 2);
  assert.equal(document.querySelector('script[type="module"]')?.getAttribute("src"), "./app.js");
  assert.equal(document.querySelector("noscript") !== null, true);
  assert.match(document.querySelector("noscript").textContent, /legacy build/i);

  for (const id of [
    "view", "sidebar", "side-nav", "topbar", "bottom-nav", "boot-skeleton",
    "menu-button", "scrim", "command-palette", "command-input", "command-results",
    "toast-root", "update-banner", "update-reload", "update-dismiss",
    "install-button", "install-side", "open-legacy-side", "avatar-button",
    "avatar-initials", "build-line"
  ]) {
    assert.ok(document.getElementById(id), `missing #${id}`);
  }
});

test("the shell has no external fonts, styles or scripts", async () => {
  const html = await read("../next/index.html");
  const css = await read("../next/styles.css");
  assert.doesNotMatch(html, /<link[^>]+rel="(?:stylesheet|preconnect|dns-prefetch)"[^>]*href="https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
  assert.doesNotMatch(css, /@import\s+url\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /url\(\s*["']?https?:/i);
  assert.doesNotMatch(css, /fonts\.googleapis|fonts\.gstatic/i);
});

test("the manifest is installable and every icon exists", async () => {
  const manifest = JSON.parse(await read("../next/manifest.webmanifest"));
  assert.equal(manifest.name, "GNDEC Compass");
  assert.equal(manifest.short_name, "Compass");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.start_url, "./today");
  assert.ok(manifest.background_color && manifest.theme_color);
  assert.equal(manifest.icons.some((icon) => icon.sizes === "192x192"), true);
  assert.equal(manifest.icons.some((icon) => icon.sizes === "512x512"), true);
  assert.equal(manifest.icons.some((icon) => icon.purpose === "maskable"), true);
  assert.ok(manifest.shortcuts.length >= 2);

  for (const icon of manifest.icons) {
    assert.equal(await exists(`../next/${icon.src.replace("./", "")}`), true, `missing ${icon.src}`);
  }
});

test("the manifest and directory keep every URL on the app origin", async () => {
  const manifest = JSON.parse(await read("../next/manifest.webmanifest"));
  const urls = [manifest.start_url, ...manifest.shortcuts.map((shortcut) => shortcut.url)];
  for (const url of urls) assert.doesNotMatch(url, /#\//, `hash route leaked into ${url}`);
  const app = await read("../next/app.js");
  assert.match(app, /\/api\/legacy\/api\/faculty\/photo\?id=/);
  assert.doesNotMatch(app, /src="\$\{escapeHtml\(record\.photoUrl\)\}"/);
  assert.match(app, /function facultyRecordForTeacher\(/);
  assert.match(app, /function facultyAvatar\(/);
  assert.match(app, /data-faculty-initials/);
  assert.match(app, /state\.route === "teachers" && state\.facultyStatus === "idle"/);
  assert.match(app, /setAttribute\("src", `\/api\/legacy\$\{source\}`\)/);
});

test("the service worker precaches the real shell and isolates the legacy origin", async () => {
  const sw = await read("../next/sw.js");
  assert.match(sw, /compass-next-v/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /request\.method !== "GET"/);
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /caches\.delete/);
  assert.doesNotMatch(sw, /legacy\.compass|caches\.open\([^)]*legacy/i);

  const assets = [...sw.matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
  assert.ok(assets.includes("index.html"));
  assert.ok(assets.includes("app.js"));
  assert.ok(assets.includes("styles.css"));
  assert.ok(assets.includes("engine/profile-history.js"), "the new profile picker works after an offline install");
  assert.ok(assets.includes("engine/seating.js"), "local sitting-plan intent stays available offline");
  assert.equal(assets.includes("data/timetable-groups.html"), false, "large timetable HTML loads on demand");
  assert.equal(assets.includes("data/timetable-rooms.html"), false, "large room HTML loads on demand");
  for (const asset of new Set(assets)) {
    assert.equal(await exists(`../next/${asset}`), true, `service worker references missing ${asset}`);
  }
});

test("the worker caches only its allowlisted public endpoints and respects private cache headers", async () => {
  const calls = [];
  const worker = await createServiceWorker(async (request) => {
    calls.push(request.url);
    return new Response("public", { headers: { "Cache-Control": "public, max-age=300" } });
  });
  for (const path of ["/api/admin/ai/status", "/api/legacy/data/student-roster-index.json", "/api/legacy/api/chat"]) {
    const result = await worker.fetch(path);
    assert.equal(result.handled, false, `${path} bypasses Cache API`);
  }
  assert.equal(calls.length, 0);

  for (const cacheControl of ["no-store", "private, max-age=60"]) {
    const privateWorker = await createServiceWorker(async () => new Response("sensitive", { headers: { "Cache-Control": cacheControl } }));
    const result = await privateWorker.fetch("/api/legacy/data/end-sem-datesheet.json");
    await result.waitForLifetime();
    assert.equal(await result.response.text(), "sensitive");
    const dataCache = await privateWorker.caches.open("compass-next-v3.1.4-data");
    assert.equal((await dataCache.keys()).length, 0, `${cacheControl} responses are not stored`);
  }
});

test("a fresh public-data hit returns immediately and its revalidation completes within worker lifetime", async () => {
  let calls = 0;
  const worker = await createServiceWorker(async () => new Response(`v${++calls}`, { headers: { "Cache-Control": "public, max-age=300" } }));
  const first = await worker.fetch("/api/legacy/data/end-sem-datesheet.json");
  await first.waitForLifetime();
  assert.equal(await first.response.text(), "v1");

  const second = await worker.fetch("/api/legacy/data/end-sem-datesheet.json");
  assert.equal(await second.response.text(), "v1");
  assert.equal(second.response.headers.get("x-compass-cache"), "hit");
  await second.waitForLifetime();
  assert.equal(calls, 2, "one background refresh ran after serving the cache hit");

  const third = await worker.fetch("/api/legacy/data/end-sem-datesheet.json");
  assert.equal(await third.response.text(), "v2");
  await third.waitForLifetime();
});

test("warm static assets stay cache-first and offline navigation falls back to the shell", async () => {
  let calls = 0;
  const worker = await createServiceWorker(async () => {
    calls += 1;
    return new Response("module", { headers: { "Content-Type": "text/javascript" } });
  });
  const first = await worker.fetch("/app.js");
  await first.waitForLifetime();
  assert.equal(await first.response.text(), "module");
  const second = await worker.fetch("/app.js");
  await second.waitForLifetime();
  assert.equal(await second.response.text(), "module");
  assert.equal(calls, 1, "a warm launch does not revalidate every shell module");

  const shell = await worker.caches.open("compass-next-v3.1.4-shell");
  await shell.put("/index.html", new Response("<main>offline shell</main>", { headers: { "Content-Type": "text/html" } }));
  const offlineWorker = await createServiceWorker(async () => { throw new Error("offline"); });
  const offlineShell = await offlineWorker.caches.open("compass-next-v3.1.4-shell");
  await offlineShell.put("/index.html", new Response("<main>offline shell</main>", { headers: { "Content-Type": "text/html" } }));
  const navigation = await offlineWorker.fetch("/today", { mode: "navigate" });
  assert.equal(await navigation.response.text(), "<main>offline shell</main>");
  await navigation.waitForLifetime();
});

test("shell trimming retains pinned startup assets while caching lazy PDF modules", async () => {
  const worker = await createServiceWorker(async () => new Response("module", { headers: { "Content-Type": "text/javascript" } }));
  const shell = await worker.caches.open("compass-next-v3.1.4-shell");
  await shell.put("/index.html", new Response("pinned shell", { headers: { "Content-Type": "text/html" } }));
  for (let index = 0; index < 120; index += 1) {
    const result = await worker.fetch(`/lazy-${index}.js`);
    await result.waitForLifetime();
  }
  const lazy = await worker.fetch("/vendor/pdf.min.mjs");
  assert.equal(await lazy.response.text(), "module");
  await lazy.waitForLifetime();
  const keys = (await shell.keys()).map((request) => new URL(request.url).pathname);
  assert.ok(keys.includes("/index.html"), "the pinned app shell cannot be evicted by lazy assets");
  assert.ok(keys.includes("/vendor/pdf.min.mjs"), "PDF.js modules are runtime cached as static assets");
  assert.equal(keys.length, 100, "the shell cache remains bounded");

  const app = await read("../next/app.js");
  assert.match(app, /let hasSeenController = Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(app, /if \(!hasSeenController\) \{ hasSeenController = true; return; \}/);
});

test("the public-data cache has a bounded entry count and retains recent offline data", async () => {
  const worker = await createServiceWorker(async () => new Response("data", { headers: { "Cache-Control": "public, max-age=300" } }));
  for (let index = 0; index < 84; index += 1) {
    const result = await worker.fetch(`/api/legacy/api/timetable?source=groups&version=${index}`);
    await result.waitForLifetime();
  }
  const cache = await worker.caches.open("compass-next-v3.1.4-data");
  assert.equal((await cache.keys()).length, 80);

  const recent = new Response("saved datesheet", { headers: { "Cache-Control": "public", "X-Compass-Cached-At": String(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
  await cache.put("/api/legacy/data/end-sem-datesheet.json", recent);
  const offlineWorker = await createServiceWorker(async () => { throw new Error("offline"); });
  const offlineCache = await offlineWorker.caches.open("compass-next-v3.1.4-data");
  await offlineCache.put("/api/legacy/data/end-sem-datesheet.json", recent);
  const offline = await offlineWorker.fetch("/api/legacy/data/end-sem-datesheet.json");
  assert.equal(await offline.response.text(), "saved datesheet");
  assert.equal(offline.response.headers.get("x-compass-offline"), "1");
  await offline.waitForLifetime();
});

test("PWA icon files are valid PNGs and the SVG is self-contained", async () => {
  for (const file of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
    const buffer = await readFile(new URL(`../next/icons/${file}`, import.meta.url));
    assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", `${file} is not a PNG`);
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    const expected = file.includes("192") ? 192 : 512;
    assert.equal(width, expected, `${file} width`);
    assert.equal(height, expected, `${file} height`);
  }
  const svg = await read("../next/icons/icon.svg");
  assert.match(svg, /<svg[^>]+viewBox="0 0 512 512"/);
  // The SVG namespace is a name, not a network fetch.
  assert.doesNotMatch(svg, /(?:href|src)="https?:|<image\b|<use\b/);
});

test("the boot script applies saved appearance before paint", async () => {
  const boot = await read("../next/boot.js");
  assert.match(boot, /gndec-compass-next-settings-v2/);
  assert.match(boot, /data\.theme|dataset\.theme/);
  assert.match(boot, /prefers-color-scheme/);
  assert.match(boot, /try\s*\{/);
  assert.match(boot, /catch/);
  assert.doesNotMatch(boot, /fetch\(|import\s/);
});

test("every ES module import resolves to a real local file", async () => {
  for (const file of [
    "next/app.js", "next/settings-registry.js", "next/settings-store.js",
    "next/engine/datetime.js", "next/engine/fet-parser.js", "next/engine/free-rooms.js",
    "next/engine/answer.js", "next/engine/brain-bridge.js", "next/engine/storage.js",
    "next/engine/reminders.js", "next/engine/ics.js"
  ]) {
    const source = await read(`../${file}`);
    for (const match of source.matchAll(/from\s+"(\.[^"]+)"/g)) {
      const resolved = new URL(match[1], new URL(`../${file}`, import.meta.url));
      assert.equal(await exists(resolved.href), true, `${file} imports missing ${match[1]}`);
    }
  }
});

test("the new app talks only to its own origin and the legacy proxy", async () => {
  const app = await read("../next/app.js");
  const urls = [...app.matchAll(/fetch\(\s*[`"']([^`"']+)/g)].map((match) => match[1]);
  assert.ok(urls.length > 0);
  for (const url of urls) {
    assert.match(url, /^\/(?:api|legacy)/, `unexpected fetch target ${url}`);
  }
  assert.match(app, /\/api\/legacy\/api\/timetable\?source=\$\{source\}/);
  assert.match(app, /\/data\/timetable-groups\.html/);
  assert.match(app, /\/data\/timetable-rooms\.html/);
  assert.match(app, /function isTimetableDocument/);
  assert.match(app, /let subgroupSchedule = \[\]/);
  assert.match(app, /subgroupSchedule = readVerifiedFetTimetable\(subgroup\.text, "subgroups"\)/);
  for (const line of app.split("\n").filter((text) => text.includes("localStorage."))) {
    assert.match(line, /try\s*\{/, `unguarded storage access: ${line.trim()}`);
  }
});

test("the deployment configs keep the new app and the frozen legacy build separate", async () => {
  const next = JSON.parse(await read("../wrangler.next.jsonc"));
  assert.equal(next.name, "gndec-compass-next");
  assert.equal(next.main, "src/next-worker.js");
  assert.equal(next.assets.directory, "next");
  assert.equal(next.assets.binding, "ASSETS");
  assert.deepEqual(next.assets.run_worker_first, ["/", "/api/*", "/today", "/timetable", "/rooms", "/teachers", "/ask", "/notices", "/papers", "/syllabus", "/calendar", "/directory", "/compare", "/settings", "/admin"]);
  assert.match(next.vars.LEGACY_ORIGIN, /^https:\/\//);
  assert.match(next.vars.PUBLIC_ORIGIN, /^https:\/\//);
  assert.equal(next.vars.APP_VERSION, "2.2.14");
  assert.equal(next.services?.length, 1);
  assert.equal(next.services[0].binding, "LEGACY");
  assert.equal(next.services[0].service, "gndec-compass");

  const legacy = await read("../wrangler.legacy.jsonc");
  assert.match(legacy, /"name": "gndec-compass-legacy"/);
  assert.match(legacy, /"main": "src\/worker\.js"/);
  assert.match(legacy, /"directory": "public"/);

  const current = JSON.parse(await read("../wrangler.jsonc"));
  assert.equal(current.name, "gndec-compass");
  assert.equal(current.assets.directory, "public");
  assert.notEqual(current.name, next.name);
});

test("the first-year scheme semester choice is persistent and shared with Ask Compass", async () => {
  const app = await read("../next/app.js");
  const css = await read("../next/styles.css");
  assert.match(app, /SCHEME_SEMESTER_KEY\s*=\s*"gndec-compass-next-scheme-semester-v1"/);
  assert.match(app, /data-action="scheme-semester"/);
  assert.match(app, /storageSet\(SCHEME_SEMESTER_KEY, semester\)/);
  assert.match(app, /const selectedSemester = \["1", "2"\]\.includes\(state\.schemeSemesterChoice\)/);
  assert.match(app, /answerFirstYearSyllabus\([^\n]+\{ semester: selectedSemester \}\)/);
  assert.match(app, /answerFirstYearScheme\(question, state\.firstYearScheme, \{\s*semester: selectedSemester/s);
  assert.match(css, /\.scheme-semester-picker/);
  assert.match(css, /\.scheme-card \.table-wrap \{ overflow-x: auto; \}/);
});

test("the new app ships no map, no analytics SDK and no remote inference", async () => {
  const files = ["next/app.js", "next/index.html", "next/sw.js", "next/engine/answer.js", "next/engine/brain-bridge.js"];
  for (const file of files) {
    const text = await read(`../${file}`);
    assert.doesNotMatch(text, /google-analytics|googletagmanager|segment\.io|mixpanel|sentry\.io/i, `${file} loads analytics`);
    assert.doesNotMatch(text, /openai\.com|api\.anthropic|generativelanguage\.googleapis/i, `${file} calls an inference API directly`);
  }
  const brain = await read("../next/engine/brain-bridge.js");
  assert.doesNotMatch(brain, /\bembedding|tensorflow|onnxruntime|transformers/i);
});

test("mobile navigation keeps the drawer crisp above its dimming scrim", async () => {
  const styles = await read("../next/styles.css");
  const scrim = styles.match(/\.scrim\s*\{[^}]*z-index:\s*(\d+)/);
  const mobileSidebar = styles.match(/@media\s*\(max-width:\s*980px\)[\s\S]*?\.sidebar\s*\{[^}]*z-index:\s*(\d+)/);
  assert.ok(scrim && mobileSidebar, "scrim and mobile drawer stacking rules exist");
  assert.ok(Number(mobileSidebar[1]) > Number(scrim[1]), "drawer paints above the scrim");
});

test("timetable labels only data-derived gaps and keeps the five PM look-ahead", async () => {
  const app = await read("../next/app.js");
  assert.match(app, /freeGapsBetweenClasses\(classes\)/);
  assert.match(app, /Break \/ free time/);
  assert.match(app, /Break \/ no class listed/);
  assert.match(app, /shouldLookAheadAtFive\(clock\.minutes, true\)/);
  assert.match(app, /automatic look-ahead after 5:00 PM/);
});
