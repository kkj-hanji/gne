import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const exists = async (path) => {
  try { await access(new URL(path, import.meta.url)); return true; } catch { return false; }
};

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
  for (const asset of new Set(assets)) {
    assert.equal(await exists(`../next/${asset}`), true, `service worker references missing ${asset}`);
  }
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
  assert.equal(next.vars.APP_VERSION, "2.1.4");
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
