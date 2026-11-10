/**
 * Generate static, crawlable SEO pages for every verified GNDEC entity.
 *
 * Output (all under next/, so the Worker serves them as static assets):
 *   college/index.html                     directory hub
 *   college/section/<slug>/index.html      one per published section
 *   college/subject/<slug>/index.html      one per published subject
 *   college/teacher/<slug>/index.html      one per published teacher
 *   college/room/<slug>/index.html         one per published room
 *   college/exam-datesheet/index.html      official tentative ESE datesheet
 *   sitemap.xml, robots.txt, icons/og-cover.svg
 *
 * The pages contain the real timetable rows for that entity, internal links,
 * canonical URLs and JSON-LD. No invented facts, no thin placeholder pages.
 *
 * Usage: node scripts/build-next-seo.mjs
 */

import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";
import { DAY_NAMES } from "../next/engine/datetime.js";
import { parseFetTimetable } from "../next/engine/fet-parser.js";
import { SITE, ROUTE_ORDER, escapeAttr, escapeText, normalizeOrigin, collegeJsonLd } from "../next/seo-meta.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "next");
const CACHE = path.join(ROOT, ".cache-next");
const ORIGIN = normalizeOrigin(process.env.PUBLIC_ORIGIN || SITE.defaultOrigin);
const LEGACY = process.env.LEGACY_ORIGIN || "https://gndec-compass.koush3069.workers.dev";

const SOURCES = {
  groups: { local: ["next/data/timetable-groups.html", ".cache-next/groups.html"], url: `${LEGACY}/api/timetable?source=groups` },
  rooms: { local: ["next/data/timetable-rooms.html", ".cache-next/rooms.html"], url: `${LEGACY}/api/timetable?source=rooms` },
  datesheet: { local: [".cache-next/datesheet.json", "public/data/end-sem-datesheet.json"], url: `${LEGACY}/data/end-sem-datesheet.json` }
};

/**
 * Refuse to publish a source that lost characters in transit. A single U+FFFD
 * means the bytes were decoded with the wrong charset (or a body was truncated),
 * and publishing it would put mangled names and rooms on the site.
 */
function assertReadable(key, text) {
  const losses = (text.match(/\uFFFD/g) || []).length;
  if (losses) throw new Error(`${key} source has ${losses} unreadable character(s); refusing to publish partial facts. Clear .cache-next and retry.`);
  return text;
}

async function loadSource(key) {
  for (const relative of SOURCES[key].local) {
    const candidate = path.join(ROOT, relative);
    if (!existsSync(candidate)) continue;
    const cached = await readFile(candidate, "utf8");
    if ((cached.match(/\uFFFD/g) || []).length) {
      console.warn(`${relative} is unreadable; refetching ${key} from the verified release.`);
      continue;
    }
    return cached;
  }
  const response = await fetch(SOURCES[key].url, { headers: { Accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`${key} fetch failed: HTTP ${response.status}`);
  const text = assertReadable(key, await response.text());
  await mkdir(CACHE, { recursive: true });
  await writeFile(path.join(CACHE, `${key}${key === "datesheet" ? ".json" : ".html"}`), text, "utf8");
  return text;
}

function slugify(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

function humanTime(minutes) {
  const value = Number(minutes);
  if (!Number.isFinite(value)) return "";
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function dayIndex(day) {
  const index = DAY_NAMES.indexOf(day);
  return index < 0 ? 99 : index;
}

function compact(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function pageHead({ title, description, canonical, jsonLd = [], keywords = [] }) {
  const blocks = [
    `<title>${escapeText(title)}</title>`,
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />`,
    `<meta name="keywords" content="${escapeAttr([...new Set(keywords)].join(", "))}" />`,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(SITE.name)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(canonical)}" />`,
    `<meta property="og:image" content="${escapeAttr(`${ORIGIN}/icons/og-cover.svg`)}" />`,
    `<meta property="og:locale" content="${SITE.locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="theme-color" content="${SITE.themeColor}" />`,
    `<link rel="alternate" hreflang="en-in" href="${escapeAttr(canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(canonical)}" />`
  ];
  if (jsonLd.length) {
    blocks.push(`<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": jsonLd }).replace(/</g, "\\u003c")}</script>`);
  }
  return blocks.join("\n");
}

const STYLE = `
:root{--bg:#06110e;--panel:#0b1b16;--line:#1d3a30;--ink:#e7f5ef;--muted:#9fc2b5;--accent:#34d399;--accent-ink:#04120d}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
a{color:var(--accent)}
a:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:6px}
.wrap{max-width:1100px;margin:0 auto;padding:clamp(16px,4vw,40px)}
header.site{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:16px}
.brand{font-weight:800;letter-spacing:-.02em;font-size:1.15rem}
.brand span{color:var(--accent)}
.cta{display:inline-block;background:var(--accent);color:var(--accent-ink);font-weight:800;text-decoration:none;padding:11px 18px;border-radius:999px}
nav.crumbs{color:var(--muted);font-size:.85rem;margin:18px 0 0}
nav.crumbs a{color:var(--muted)}
h1{font-size:clamp(1.6rem,1.1rem+2vw,2.4rem);line-height:1.15;letter-spacing:-.03em;margin:18px 0 10px}
h2{font-size:clamp(1.15rem,1rem+.8vw,1.5rem);margin:32px 0 10px}
p.lead{color:var(--muted);max-width:75ch;margin:0 0 18px}
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))}
.chip{display:block;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px;text-decoration:none;color:var(--ink)}
.chip:hover{border-color:var(--accent)}
.chip small{display:block;color:var(--muted);font-size:.78rem;margin-top:2px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:16px;background:var(--panel)}
table{border-collapse:collapse;width:100%;min-width:640px;font-size:.92rem}
caption{text-align:left;padding:12px 14px;color:var(--muted);font-size:.82rem}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
thead th{position:sticky;top:0;background:#0e241d;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
tbody tr:last-child td{border-bottom:0}
.tag{display:inline-block;background:#123127;color:var(--accent);border-radius:999px;padding:2px 9px;font-size:.72rem;font-weight:700}
footer.site{border-top:1px solid var(--line);margin-top:40px;padding:22px 0;color:var(--muted);font-size:.82rem}
footer.site nav{display:flex;flex-wrap:wrap;gap:8px 18px;margin-bottom:10px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:480px){th,td{padding:8px}.wrap{padding:14px}}
@media print{body{background:#fff;color:#000}header.site,.cta,footer.site{display:none}.chip,.table-wrap{border-color:#bbb}}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

function layout({ title, description, canonical, head, body, pathLabel }) {
  const nav = [
    ["GNDEC Compass", `${ORIGIN}/`],
    ["Timetable", `${ORIGIN}/timetable`],
    ["Free rooms", `${ORIGIN}/rooms`],
    ["Ask Compass", `${ORIGIN}/ask`],
    ["Directory", `${ORIGIN}/college/`]
  ].map(([label, href]) => `<a href="${escapeAttr(href)}">${escapeText(label)}</a>`).join("");
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
${head}
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
<header class="site"><div class="brand">GNDEC <span>Compass</span></div><a class="cta" href="${escapeAttr(`${ORIGIN}/timetable`)}">Open live timetable</a></header>
<nav class="crumbs" aria-label="Breadcrumb"><a href="${escapeAttr(`${ORIGIN}/`)}">Home</a> › ${escapeText(pathLabel || "Directory")}</nav>
<main>
${body}
</main>
<footer class="site"><nav>${nav}</nav><p>GNDEC Compass is an independent, verified timetable companion for Guru Nanak Dev Engineering College, Ludhiana. Data is read from the official college timetable export. Compass never invents a class, teacher, room or exam date.</p><p>${escapeText(SITE.college.name)} · ${escapeText(SITE.college.address.streetAddress)}, ${escapeText(SITE.college.address.addressLocality)} ${escapeText(SITE.college.address.postalCode)}, ${escapeText(SITE.college.address.addressRegion)} · <a href="${escapeAttr(SITE.college.url)}" rel="noopener">gndec.ac.in</a></p></footer>
</div>
</body>
</html>`;
}

function breadcrumb(name, url) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "GNDEC Compass", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: "Directory", item: `${ORIGIN}/college/` },
      { "@type": "ListItem", position: 3, name, item: url }
    ]
  };
}

function rowHtml(entry, showSection = false) {
  return `<tr>
<td>${escapeText(entry.day || "")}</td>
<td>${escapeText(humanTime(entry.start))} – ${escapeText(humanTime(entry.end))}</td>
<td><strong>${escapeText(entry.subject || "")}</strong>${entry.type ? ` <span class="tag">${escapeText(entry.type)}</span>` : ""}</td>
<td>${escapeText(entry.teacher || "")}</td>
<td>${escapeText(entry.room || "")}</td>
${showSection ? `<td>${escapeText(entry.group || "")}</td>` : ""}
</tr>`;
}

function tableHtml(entries, { caption, showSection = false } = {}) {
  const rows = [...entries]
    .sort((a, b) => dayIndex(a.day) - dayIndex(b.day) || a.start - b.start)
    .map((entry) => rowHtml(entry, showSection))
    .join("");
  return `<div class="table-wrap"><table><caption>${escapeText(caption || "Official GNDEC timetable rows")}</caption>
<thead><tr><th scope="col">Day</th><th scope="col">Time</th><th scope="col">Subject</th><th scope="col">Teacher</th><th scope="col">Room</th>${showSection ? '<th scope="col">Section</th>' : ""}</tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

async function writePage(relative, html) {
  const target = path.join(OUT, relative, "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
  return target;
}

async function main() {
  // Remove stale generated pages so a shrinking release cannot leave orphan URLs.
  await rm(path.join(OUT, "college"), { recursive: true, force: true });
  const [groupsHtml, roomsHtml, datesheetRaw] = await Promise.all([
    loadSource("groups"), loadSource("rooms"), loadSource("datesheet")
  ]);

  const schedule = parseFetTimetable(groupsHtml, "groups", { DOMParser });
  const roomSchedule = parseFetTimetable(roomsHtml, "rooms", { DOMParser });
  if (!schedule.length) throw new Error("No verified group rows were parsed; refusing to generate empty SEO pages.");
  if (schedule.unparsedCells) throw new Error(`The group timetable has ${schedule.unparsedCells} unreadable cells; refusing to publish partial facts.`);
  if (roomSchedule.unparsedCells) throw new Error(`The room timetable has ${roomSchedule.unparsedCells} unreadable cells; refusing to publish partial facts.`);

  let datesheet = null;
  try { datesheet = JSON.parse(datesheetRaw); } catch { datesheet = null; }

  const groups = [...new Set(schedule.map((entry) => entry.group).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const subjects = [...new Set(schedule.map((entry) => entry.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const teachers = [...new Set(schedule.map((entry) => entry.teacher).filter((value) => value && !/not listed/i.test(value)))].sort((a, b) => a.localeCompare(b));
  const rooms = [...new Set(roomSchedule.map((entry) => entry.room).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const release = schedule.find((entry) => entry.subject)?.group ? "" : "";

  const urls = [{ loc: `${ORIGIN}/`, priority: "1.0" }, ...ROUTE_ORDER.map((slug) => ({ loc: `${ORIGIN}/${slug}`, priority: slug === "ask" || slug === "settings" ? "0.8" : "0.9" }))];

  /* ── directory hub ─────────────────────────────────────────────────── */
  const hubBody = `<h1>GNDEC Timetable Directory</h1>
<p class="lead">Every published section, subject, teacher and room in the official Guru Nanak Dev Engineering College timetable. Each page shows real class times, rooms and faculty for the current verified release.</p>
<h2>Sections</h2><div class="grid">${groups.map((group) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/section/${slugify(group)}/`)}"><strong>${escapeText(group)} timetable</strong><small>${schedule.filter((entry) => entry.group === group).length} published classes</small></a>`).join("")}</div>
<h2>Subjects</h2><div class="grid">${subjects.map((subject) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/subject/${slugify(subject)}/`)}"><strong>${escapeText(subject)}</strong><small>${new Set(schedule.filter((entry) => entry.subject === subject).map((entry) => entry.group)).size} sections</small></a>`).join("")}</div>
<h2>Teachers</h2><div class="grid">${teachers.map((teacher) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/teacher/${slugify(teacher)}/`)}"><strong>${escapeText(teacher)}</strong><small>${schedule.filter((entry) => entry.teacher === teacher).length} published classes</small></a>`).join("")}</div>
<h2>Rooms and labs</h2><div class="grid">${rooms.map((room) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/room/${slugify(room)}/`)}"><strong>${escapeText(room)}</strong><small>${roomSchedule.filter((entry) => entry.room === room).length} scheduled slots</small></a>`).join("")}</div>
<h2>Examinations</h2><div class="grid"><a class="chip" href="${escapeAttr(`${ORIGIN}/college/exam-datesheet/`)}"><strong>End-semester exam datesheet</strong><small>${datesheet?.tabs?.length || 0} branch tabs · official tentative sheet</small></a></div>`;
  const hubCanonical = `${ORIGIN}/college/`;
  await writePage("college", layout({
    title: "GNDEC Timetable Directory — Every Section, Subject, Teacher and Room",
    description: "Browse every GNDEC section timetable, subject schedule, teacher timetable and room timetable. Verified from the official FET export. CEA, CEB, CSA, CSB, CSC, CSD, CSE, CSF, ECA, ECB, EEA, EEB, ITA, ITB, ITC, MEA, MEB, RAI and more.",
    canonical: hubCanonical,
    head: pageHead({
      title: "GNDEC Timetable Directory — Every Section, Subject, Teacher and Room",
      description: "Browse every GNDEC section timetable, subject schedule, teacher timetable and room timetable. Verified from the official FET export.",
      canonical: hubCanonical,
      keywords: ["gndec timetable", "gndec sections", "gndec subjects", "gndec teachers", "gndec rooms", "gndec class schedule"],
      jsonLd: [
        collegeJsonLd(),
        breadcrumb("Directory", hubCanonical),
        {
          "@type": "CollectionPage",
          name: "GNDEC Timetable Directory",
          url: hubCanonical,
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: groups.length + subjects.length + teachers.length + rooms.length,
            itemListElement: collections([...groups.map((name) => ({ name: `${name} timetable`, url: `${ORIGIN}/college/section/${slugify(name)}/` })), ...subjects.map((name) => ({ name: `${name} schedule`, url: `${ORIGIN}/college/subject/${slugify(name)}/` }))])
          }
        }
      ]
    }),
    body: hubBody,
    pathLabel: "Directory"
  }));
  urls.push({ loc: hubCanonical, priority: "0.9" });

  /* ── section pages ─────────────────────────────────────────────────── */
  for (const group of groups) {
    const entries = schedule.filter((entry) => entry.group === group);
    const canonical = `${ORIGIN}/college/section/${slugify(group)}/`;
    const title = `${group} Timetable — GNDEC Class Schedule, Teachers and Rooms`;
    const description = `Official GNDEC weekly timetable for section ${group}. ${entries.length} published classes with subject, teacher, room and time. Check the next ${group} class, free periods and rooms on GNDEC Compass.`;
    const subjectLinks = [...new Set(entries.map((entry) => entry.subject))];
    const body = `<h1>${escapeText(group)} Timetable</h1>
<p class="lead">The verified weekly schedule for section <strong>${escapeText(group)}</strong> at Guru Nanak Dev Engineering College, Ludhiana. ${entries.length} published classes across ${new Set(entries.map((entry) => entry.day)).size} weekdays. Times are India Standard Time.</p>
<p><a class="cta" href="${escapeAttr(`${ORIGIN}/timetable?section=${encodeURIComponent(group)}`)}">Open the live ${escapeText(group)} timetable</a></p>
<h2>Weekly schedule</h2>
${tableHtml(entries, { caption: `${group} · official FET release` })}
<h2>Subjects in ${escapeText(group)}</h2>
<div class="grid">${subjectLinks.map((subject) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/subject/${slugify(subject)}/`)}"><strong>${escapeText(subject)}</strong></a>`).join("")}</div>
<h2>Teachers for ${escapeText(group)}</h2>
<div class="grid">${[...new Set(entries.map((entry) => entry.teacher).filter((value) => value && !/not listed/i.test(value)))].map((teacher) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/teacher/${slugify(teacher)}/`)}"><strong>${escapeText(teacher)}</strong></a>`).join("")}</div>
<h2>Ask about this section</h2>
<p>Ask Compass understands English, Hinglish and romanised Punjabi. Try “${escapeText(group)} da timetable”, “next class ${escapeText(group)}” or “${escapeText(group)} di class kadon hai”.</p>
<p><a href="${escapeAttr(`${ORIGIN}/ask?q=${encodeURIComponent(`next class for ${group}`)}`)}">Ask Compass about ${escapeText(group)} →</a></p>`;
    await writePage(`college/section/${slugify(group)}`, layout({
      title, description, canonical, head: pageHead({
        title, description, canonical,
        keywords: [`${group} timetable`, `${group} time table`, `${group} class schedule`, "gndec timetable", "gndec class schedule", "gndec section timetable"],
        jsonLd: [
          breadcrumb(`${group} timetable`, canonical),
          {
            "@type": "WebPage",
            name: title,
            url: canonical,
            description,
            about: { "@type": "Course", name: `${group} weekly timetable`, provider: { "@type": "CollegeOrUniversity", name: SITE.college.name, url: SITE.college.url } }
          }
        ]
      }),
      body, pathLabel: `Sections › ${group}`
    }));
    urls.push({ loc: canonical, priority: "0.8" });
  }

  /* ── subject pages ─────────────────────────────────────────────────── */
  for (const subject of subjects) {
    const entries = schedule.filter((entry) => entry.subject === subject);
    const canonical = `${ORIGIN}/college/subject/${slugify(subject)}/`;
    const title = `${subject} — GNDEC Timetable, Teachers, Rooms and Sections`;
    const description = `Where and when ${subject} is taught at GNDEC: ${entries.length} published classes across ${new Set(entries.map((entry) => entry.group)).size} sections, with teacher names and room numbers.`;
    const body = `<h1>${escapeText(subject)} at GNDEC</h1>
<p class="lead">Every published ${escapeText(subject)} class in the official GNDEC timetable: ${entries.length} sittings across ${new Set(entries.map((entry) => entry.group)).size} sections. Use Ask Compass for “${escapeText(subject)} ka teacher kaun hai” or “where is ${escapeText(subject)}”.</p>
<h2>Class schedule</h2>
${tableHtml(entries, { caption: `${subject} · all sections`, showSection: true })}
<h2>Teachers</h2><div class="grid">${[...new Set(entries.map((entry) => entry.teacher).filter((value) => value && !/not listed/i.test(value)))].map((teacher) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/teacher/${slugify(teacher)}/`)}"><strong>${escapeText(teacher)}</strong></a>`).join("")}</div>
<h2>Sections</h2><div class="grid">${[...new Set(entries.map((entry) => entry.group))].map((group) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/section/${slugify(group)}/`)}"><strong>${escapeText(group)}</strong></a>`).join("")}</div>`;
    await writePage(`college/subject/${slugify(subject)}`, layout({
      title, description, canonical, head: pageHead({
        title, description, canonical,
        keywords: [`${subject} gndec`, `${subject} timetable`, `${subject} teacher`, `${subject} room`, `${subject} syllabus gndec`],
        jsonLd: [breadcrumb(subject, canonical), { "@type": "WebPage", name: title, url: canonical, description }]
      }),
      body, pathLabel: `Subjects › ${subject}`
    }));
    urls.push({ loc: canonical, priority: "0.7" });
  }

  /* ── teacher pages ─────────────────────────────────────────────────── */
  for (const teacher of teachers) {
    const entries = schedule.filter((entry) => entry.teacher === teacher);
    if (!entries.length) continue;
    const canonical = `${ORIGIN}/college/teacher/${slugify(teacher)}/`;
    const title = `${teacher} — GNDEC Timetable, Subjects and Rooms`;
    const description = `${teacher} at GNDEC: ${entries.length} published classes in ${new Set(entries.map((entry) => entry.subject)).size} subjects and ${new Set(entries.map((entry) => entry.group)).size} sections, with rooms and times.`;
    const body = `<h1>${escapeText(teacher)}</h1>
<p class="lead">Published teaching schedule for ${escapeText(teacher)} at Guru Nanak Dev Engineering College. ${entries.length} classes across ${new Set(entries.map((entry) => entry.subject)).size} subjects. This page only shows entries the official timetable actually publishes.</p>
${tableHtml(entries, { caption: `${teacher} · published timetable`, showSection: true })}
<h2>Subjects</h2><div class="grid">${[...new Set(entries.map((entry) => entry.subject))].map((subject) => `<a class="chip" href="${escapeAttr(`${ORIGIN}/college/subject/${slugify(subject)}/`)}"><strong>${escapeText(subject)}</strong></a>`).join("")}</div>`;
    await writePage(`college/teacher/${slugify(teacher)}`, layout({
      title, description, canonical, head: pageHead({
        title, description, canonical,
        keywords: [teacher, `${teacher} gndec`, `${teacher} timetable`, `${teacher} subjects`, `${teacher} classes`],
        jsonLd: [breadcrumb(teacher, canonical), { "@type": "WebPage", name: title, url: canonical, description, about: { "@type": "Person", name: teacher } }]
      }),
      body, pathLabel: `Teachers › ${teacher}`
    }));
    urls.push({ loc: canonical, priority: "0.6" });
  }

  /* ── room pages ────────────────────────────────────────────────────── */
  for (const room of rooms) {
    const entries = roomSchedule.filter((entry) => entry.room === room);
    if (!entries.length) continue;
    const canonical = `${ORIGIN}/college/room/${slugify(room)}/`;
    const title = `${room} — GNDEC Room Timetable and Free Slots`;
    const description = `${room} at GNDEC: ${entries.length} scheduled classes and labs. See which sections use it, when it is busy and when it is free.`;
    const body = `<h1>${escapeText(room)}</h1>
<p class="lead">Official room timetable for ${escapeText(room)}. ${entries.length} scheduled slots for ${new Set(entries.map((entry) => entry.group)).size} sections. Compass calculates free windows from this grid; it never guesses.</p>
${tableHtml(entries, { caption: `${room} · room timetable` })}
<p><a class="cta" href="${escapeAttr(`${ORIGIN}/rooms`)}">Check free rooms now</a></p>`;
    await writePage(`college/room/${slugify(room)}`, layout({
      title, description, canonical, head: pageHead({
        title, description, canonical,
        keywords: [room, `${room} gndec`, `${room} timetable`, `${room} free`, `${room} room`],
        jsonLd: [breadcrumb(room, canonical), { "@type": "WebPage", name: title, url: canonical, description }]
      }),
      body, pathLabel: `Rooms › ${room}`
    }));
    urls.push({ loc: canonical, priority: "0.6" });
  }

  /* ── exam datesheet ────────────────────────────────────────────────── */
  if (datesheet?.tabs?.length) {
    const canonical = `${ORIGIN}/college/exam-datesheet/`;
    const entries = datesheet.tabs.flatMap((tab) => (tab.entries || []).map((entry) => ({ ...entry, tab: tab.label })));
    const title = "GNDEC End-Semester Exam Datesheet — Branch-wise ESE Dates";
    const description = `Official tentative GNDEC end-semester exam datesheet for ${datesheet.tabs.length} programmes: ${datesheet.tabs.map((tab) => tab.label).join(", ")}. Check subject dates on Compass.`;
    const byTab = datesheet.tabs.map((tab) => {
      const rows = (tab.entries || []).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.subject).localeCompare(String(b.subject)));
      return `<h2>${escapeText(tab.label)}</h2><div class="table-wrap"><table><caption>${escapeText(tab.label)} · tentative ESE</caption><thead><tr><th>Date</th><th>Subject</th><th>Qualifier</th><th>Session</th></tr></thead><tbody>${rows.map((entry) => `<tr><td>${escapeText(entry.date || "")}</td><td><strong>${escapeText(entry.subject || "")}</strong></td><td>${escapeText(entry.qualifier || "")}</td><td>${escapeText(entry.sessionRaw || "")}</td></tr>`).join("")}</tbody></table></div>`;
    }).join("");
    const body = `<h1>GNDEC End-Semester Exam Datesheet</h1>
<p class="lead">The official tentative end-semester examination datesheet. ${entries.length} published sittings across ${datesheet.tabs.length} programmes. Compass never invents a date, reporting time or room; always confirm on the official notice.</p>
<p><a class="cta" href="${escapeAttr(`${ORIGIN}/ask?q=${encodeURIComponent("exam kab hai")}`)}">Ask when your exam is</a></p>
${byTab}`;
    await writePage("college/exam-datesheet", layout({
      title, description, canonical, head: pageHead({
        title, description, canonical,
        keywords: ["gndec exam datesheet", "gndec end semester exam", "gndec ese datesheet", "gndec exam date", "gndec datesheet 2026"],
        jsonLd: [breadcrumb("Exam datesheet", canonical), { "@type": "WebPage", name: title, url: canonical, description }]
      }),
      body, pathLabel: "Examinations › Datesheet"
    }));
    urls.push({ loc: canonical, priority: "0.8" });
  }

  /* ── sitemap + robots ──────────────────────────────────────────────── */
  const lastmod = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((item) => `  <url><loc>${escapeText(item.loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${item.priority || "0.5"}</priority></url>`).join("\n")}
</urlset>
`;
  await writeFile(path.join(OUT, "sitemap.xml"), sitemap, "utf8");
  await writeFile(path.join(OUT, "robots.txt"), `# GNDEC Compass
User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${ORIGIN}/sitemap.xml
`, "utf8");

  /* ── Open Graph cover (SVG, no external assets) ────────────────────── */
  await mkdir(path.join(OUT, "icons"), { recursive: true });
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="GNDEC Compass — verified timetable, free rooms and exam datesheet">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#04120d"/><stop offset="1" stop-color="#0b2b22"/></linearGradient><linearGradient id="accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#6ee7b7"/></linearGradient></defs>
<rect width="1200" height="630" fill="url(#bg)"/>
<circle cx="1010" cy="120" r="220" fill="#34d399" opacity=".08"/>
<circle cx="120" cy="560" r="180" fill="#34d399" opacity=".06"/>
<g transform="translate(84 84)"><rect width="76" height="76" rx="20" fill="#34d399" opacity=".16"/><path d="M38 12 50 38 38 64 26 38Z" fill="url(#accent)"/><circle cx="38" cy="38" r="6" fill="#04120d"/></g>
<text x="186" y="132" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="34" font-weight="800" fill="#e7f5ef">GNDEC <tspan fill="#34d399">Compass</tspan></text>
<text x="84" y="270" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="64" font-weight="800" fill="#e7f5ef">Verified timetable.</text>
<text x="84" y="348" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="64" font-weight="800" fill="url(#accent)">Free rooms. Real answers.</text>
<text x="84" y="416" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="26" fill="#9fc2b5">Classes · teachers · rooms · free periods · end-sem datesheet</text>
<g font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="22" font-weight="600" fill="#c9efe2">
<rect x="84" y="462" width="196" height="54" rx="27" fill="#0f2c23" stroke="#1d4a3a"/><text x="182" y="497" text-anchor="middle">18 sections</text>
<rect x="296" y="462" width="196" height="54" rx="27" fill="#0f2c23" stroke="#1d4a3a"/><text x="394" y="497" text-anchor="middle">Free rooms</text>
<rect x="508" y="462" width="236" height="54" rx="27" fill="#0f2c23" stroke="#1d4a3a"/><text x="626" y="497" text-anchor="middle">Hinglish + Punjabi</text>
</g>
<text x="84" y="576" font-family="system-ui,Segoe UI,Roboto,Arial,sans-serif" font-size="20" fill="#6f968a">Guru Nanak Dev Engineering College, Ludhiana · Works offline · Never guesses</text>
</svg>
`;
  await writeFile(path.join(OUT, "icons", "og-cover.svg"), cover, "utf8");

  console.log(`SEO pages generated: ${groups.length} sections, ${subjects.length} subjects, ${teachers.length} teachers, ${rooms.length} rooms, ${datesheet?.tabs?.length || 0} exam tabs, ${urls.length} sitemap URLs.`);
  if (!release) console.log("Release label is read at runtime from /api/sources.");
}

function collections(items) {
  return items.slice(0, 200).map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, url: item.url }));
}

main().catch((error) => {
  console.error(`[build-next-seo] ${error.message}`);
  process.exitCode = 1;
});
