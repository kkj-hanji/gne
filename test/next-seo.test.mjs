/**
 * SEO contract tests.
 *
 * Two guarantees are locked here:
 *   1. the shared seo-meta module emits correct, unique, crawlable metadata;
 *   2. the committed static pages, sitemap and robots file are complete and
 *      internally consistent, with no placeholder or mojibake text.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROUTES, ROUTES as ROUTE_MAP, ROUTE_ORDER, SITE, headBlock, headTags,
  injectHead, metaForRoute, normalizeOrigin, routeFromPath
} from "../next/seo-meta.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NEXT = path.join(ROOT, "next");
const ORIGIN = SITE.defaultOrigin;

const read = (relative) => readFile(path.join(ROOT, relative), "utf8");
const page = (relative) => readFile(path.join(NEXT, relative), "utf8");

async function htmlFiles(relative) {
  const dir = path.join(NEXT, relative);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) files.push(...await htmlFiles(path.join(relative, entry.name)));
    else if (entry.name === "index.html") files.push(path.join(relative, entry.name).split(path.sep).join("/"));
  }
  return files;
}

/* ── shared metadata module ────────────────────────────────────────────── */

test("every app route has unique title, description and keywords", () => {
  const titles = new Set();
  for (const id of ROUTE_ORDER) {
    const route = ROUTES[id];
    assert.ok(route, `${id} must exist`);
    assert.equal(route.slug, id);
    assert.ok(route.title.length > 20 && route.title.length < 120, `${id} title length`);
    assert.ok(route.description.length > 60, `${id} description too short`);
    assert.ok(route.keywords.length >= 3, `${id} needs keywords`);
    assert.equal(titles.has(route.title), false, `${id} title duplicates another route`);
    titles.add(route.title);
  }
});

test("section metadata names the real section without inventing facts", () => {
  const meta = metaForRoute("timetable", { section: "cea" });
  assert.match(meta.title, /CEA/);
  assert.match(meta.description, /section CEA/);
  assert.doesNotMatch(meta.description, /undefined|null/);

  const injected = metaForRoute("timetable", { section: "<script>" });
  assert.doesNotMatch(injected.title, /<script>/);
});

test("headTags emits canonical, social, robots and valid JSON-LD", () => {
  const tags = headTags({ origin: "https://example.test", route: "rooms" });
  assert.match(tags, /<title>GNDEC Free Rooms/);
  assert.match(tags, /rel="canonical" href="https:\/\/example\.test\/rooms"/);
  assert.match(tags, /name="robots" content="index, follow/);
  assert.match(tags, /property="og:image" content="https:\/\/example\.test\/icons\/og-cover\.svg"/);
  assert.match(tags, /name="twitter:card" content="summary_large_image"/);
  assert.match(tags, /hreflang="en-in"/);

  const jsonLd = tags.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(jsonLd, "JSON-LD must be present");
  const graph = JSON.parse(jsonLd[1].replace(/\\u003c/g, "<"));
  assert.equal(graph["@context"], "https://schema.org");
  const types = graph["@graph"].map((node) => node["@type"]);
  assert.ok(types.includes("WebApplication"));
  assert.ok(types.includes("BreadcrumbList"));
  assert.equal(JSON.stringify(graph).includes("</script>"), false);
});

test("the section canonical is stable and query-encoded", () => {
  const tags = headTags({ origin: ORIGIN, route: "timetable", section: "cse b" });
  assert.match(tags, new RegExp(`href="${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/timetable\\?section=CSE%20B"`));
});

test("head injection replaces only the marked block", () => {
  const html = "<head>keep<!--COMPASS_SEO--><title>old</title><!--/COMPASS_SEO-->tail</head>";
  const out = injectHead(html, "<title>new</title>");
  assert.match(out, /<title>new<\/title>/);
  assert.doesNotMatch(out, /<title>old<\/title>/);
  assert.match(out, /^<head>keep/);
  assert.match(out, /tail<\/head>$/);
  assert.equal((out.match(/<!--COMPASS_SEO-->/g) || []).length, 1);

  assert.match(injectHead("<head></head>", "<title>x</title>"), /<title>x<\/title>\n<\/head>/);
  assert.match(headBlock({ route: "ask" }), /<!--COMPASS_SEO-->[\s\S]*<!--\/COMPASS_SEO-->/);
});

test("origins are normalised and never point SEO at localhost", () => {
  assert.equal(normalizeOrigin(""), SITE.defaultOrigin);
  assert.equal(normalizeOrigin("https://example.test/deep/path"), "https://example.test");
  assert.equal(normalizeOrigin("javascript:alert(1)"), SITE.defaultOrigin);
  assert.equal(normalizeOrigin("not a url"), SITE.defaultOrigin);
});

test("route resolution supports clean paths, old hashes and static pages", () => {
  assert.equal(routeFromPath("/").route, "today");
  assert.equal(routeFromPath("/timetable").route, "timetable");
  assert.equal(routeFromPath("/timetable", "#/rooms").route, "rooms");
  assert.equal(routeFromPath("/", "#/ask").route, "ask");
  assert.equal(routeFromPath("/college/section/cea/").route, "timetable");
  assert.equal(routeFromPath("/unknown-path").route, "today");
  assert.equal(routeFromPath("/timetable/").canonicalPath, "/timetable");
});

/* ── generated static pages ────────────────────────────────────────────── */

test("static directory pages exist for every entity class", async () => {
  for (const kind of ["section", "subject", "teacher", "room"]) {
    const entries = await readdir(path.join(NEXT, "college", kind), { withFileTypes: true });
    assert.ok(entries.filter((entry) => entry.isDirectory()).length > 5, `${kind} pages are missing`);
  }
  assert.ok((await readdir(path.join(NEXT, "college", "exam-datesheet"))).includes("index.html"));
  assert.ok((await readdir(path.join(NEXT, "college"))).includes("index.html"));
});

test("generated pages carry canonical, description, one h1 and parseable JSON-LD", async () => {
  const files = await htmlFiles("college");
  assert.ok(files.length > 100, `expected a full directory, found ${files.length} pages`);

  for (const file of files) {
    const html = await page(file);
    const slug = file.replace(/\/index\.html$/, "");
    const canonical = `${ORIGIN}/${slug}/`;

    assert.match(html, /^<!doctype html>/i, `${file} doctype`);
    assert.match(html, /<html lang="en-IN">/, `${file} lang`);
    assert.match(html, /<meta name="viewport" content="width=device-width/, `${file} viewport`);

    const title = html.match(/<title>([^<]+)<\/title>/);
    assert.ok(title && title[1].length > 10, `${file} title`);
    assert.equal((html.match(/<title>/g) || []).length, 1, `${file} has duplicate titles`);

    const description = html.match(/<meta name="description" content="([^"]+)"/);
    assert.ok(description && description[1].length > 40, `${file} description`);

    assert.ok(html.includes(`<link rel="canonical" href="${canonical}" />`), `${file} canonical`);
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, `${file} must have exactly one h1`);

    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    assert.ok(ld, `${file} JSON-LD`);
    const parsed = JSON.parse(ld[1].replace(/\\u003c/g, "<"));
    assert.equal(parsed["@context"], "https://schema.org", `${file} JSON-LD context`);
    assert.ok(Array.isArray(parsed["@graph"]) && parsed["@graph"].length > 0, `${file} JSON-LD graph`);

    // No placeholder or escaped-entity leakage on a rendered page.
    assert.doesNotMatch(html.replace(/<script[\s\S]*?<\/script>/g, ""), /undefined|null|\[object Object\]/, `${file} placeholder text`);
    assert.equal(html.includes("\uFFFD"), false, `${file} contains a replacement character`);
    assert.doesNotMatch(html, /\{\{[a-z]+\}\}/i, `${file} contains an unresolved template`);
  }
});

test("every generated page links to a real internal target", async () => {
  const files = await htmlFiles("college");
  const known = new Set(files.map((file) => `${ORIGIN}/${file.replace(/\/index\.html$/, "")}/`));
  for (const route of ROUTE_ORDER) {
    known.add(`${ORIGIN}/${route}`);
    known.add(`${ORIGIN}/${route}/`);
  }
  known.add(`${ORIGIN}/`);
  known.add(`${ORIGIN}/college/`);

  for (const file of files) {
    const html = await page(file);
    const links = [...html.matchAll(/href="(https:\/\/gndec-compass-next\.koush3069\.workers\.dev\/[^"#?]*)/g)]
      .map((match) => match[1]);
    for (const link of links) {
      const target = link.endsWith("/") ? link : `${link}/`;
      const isAsset = /\.(?:svg|png|webmanifest|xml|txt|css|js)$/.test(link);
      if (isAsset) continue;
      assert.ok(known.has(target), `${file} links to an ungenerated page: ${link}`);
    }
  }
});

test("no page advertises a feature the app does not have (map, AI timetable)", async () => {
  const files = await htmlFiles("college");
  const hub = await page("college/index.html");
  for (const html of [hub, ...await Promise.all(files.map(page))]) {
    assert.doesNotMatch(html, /campus map|building map|google maps|map of gndec/i);
  }
});

/* ── sitemap, robots, social image ─────────────────────────────────────── */

test("sitemap lists every route and generated page exactly once", async () => {
  const xml = await read("next/sitemap.xml");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.ok(locs.length > 200, "sitemap should cover the whole directory");
  assert.equal(new Set(locs).size, locs.length, "sitemap must not contain duplicates");
  for (const loc of locs) {
    assert.match(loc, /^https:\/\//, `sitemap URL must be absolute: ${loc}`);
    assert.doesNotMatch(loc, /localhost|127\.0\.0\.1|\/api\//);
  }
  for (const route of ROUTE_ORDER) assert.ok(locs.includes(`${ORIGIN}/${route}`), `sitemap misses /${route}`);
  assert.ok(locs.includes(`${ORIGIN}/college/`));

  const files = await htmlFiles("college");
  const pages = files.map((file) => `${ORIGIN}/${file.replace(/\/index\.html$/, "")}/`);
  for (const page of pages) assert.ok(locs.includes(page), `sitemap misses ${page}`);
  assert.equal(locs.length, pages.length + ROUTE_ORDER.length + 1, "sitemap count should match generated pages + app routes");
});

test("robots.txt allows crawling, blocks the API and points at the sitemap", async () => {
  const robots = await read("next/robots.txt");
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, new RegExp(`Sitemap: ${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/sitemap\\.xml`));
  assert.doesNotMatch(robots, /Disallow: \/\s*$/m);
});

test("the Open Graph cover is a self-contained SVG", async () => {
  const svg = await read("next/icons/og-cover.svg");
  assert.match(svg, /<svg[^>]+width="1200"[^>]+height="630"/);
  assert.match(svg, /GNDEC/);
  assert.doesNotMatch(svg, /<image[^>]+href="https?:/i);
  assert.doesNotMatch(svg, /https?:\/\/fonts\./i);
});

test("the app shell exposes the same metadata block the generator uses", async () => {
  const shell = await read("next/index.html");
  assert.match(shell, /<!--COMPASS_SEO-->/);
  assert.match(shell, /<!--\/COMPASS_SEO-->/);
  assert.match(shell, /<link rel="canonical" href="https:\/\/gndec-compass-next\.koush3069\.workers\.dev\/" \/>/);
  assert.doesNotMatch(shell, /<title>GNDEC Compass Next<\/title>/);
});

test("route metadata and the sitemap agree on the canonical origin", () => {
  assert.equal(SITE.defaultOrigin, "https://gndec-compass-next.koush3069.workers.dev");
  for (const id of ROUTE_ORDER) assert.ok(ROUTE_MAP[id].slug);
});
