/**
 * Build the official question-bank index.
 *
 * Only a department that publishes a real question-bank page is crawled. At the
 * time of writing that is the IT department's `?q=sqb` page, which lists one PDF
 * per subject. Other departments link out to the library, Google Drive or a
 * third-party blog, which are not verifiable official sources and are therefore
 * not indexed automatically.
 *
 *   node scripts/build-papers.mjs [--write]
 *
 * An unreachable department page keeps the last verified entries for that
 * department. The index is never replaced with an empty list.
 */
import { readJsonIfPresent, writeJsonWhenChanged } from "./lib/stable-json.mjs";

const SOURCES = [
  {
    department: "Information Technology",
    departmentId: "it",
    url: "https://it.gndec.ac.in/?q=sqb",
    label: "Subject Question Bank"
  }
];

const BAD_FILE = /datesheet|date[\s_-]*sheet|notice|schedule|syllabus|elective\s*list|honou?r|minor|degree|admission|fee|answer[\s_-]*sheet|result|timetable|docscan|scanner|form|circular|holiday|calendar|brochure|list\s*of/i;
const MAX_BYTES = 900_000;

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'");
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "GNDEC-Compass-Paper-Index/1.0 (+https://gndec-compass-next.koush3069.workers.dev)" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const type = response.headers.get("content-type") || "";
  if (!/text\/html/i.test(type)) throw new Error(`Unexpected content-type ${type}`);
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Page too large");
  return text;
}

function anchors(html, baseUrl) {
  const out = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html)) && out.length < 1200) {
    let href;
    try {
      href = new URL(decodeEntities(match[1]), baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ href, text: stripTags(match[2]) });
  }
  return out;
}

function isOfficialPdf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:"
      && /(^|\.)gndec\.ac\.in$/i.test(parsed.hostname)
      && /\.pdf$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

const previous = readJsonIfPresent("next/data/papers-index.json");
const previousPapers = Array.isArray(previous?.papers) ? previous.papers : [];
const papers = [];
const sourceReport = [];

for (const source of SOURCES) {
  let html = "";
  let error = "";
  try {
    html = await fetchHtml(source.url);
  } catch (failure) {
    error = String(failure.message || failure);
  }
  let found = 0;
  if (html) {
    for (const anchor of anchors(html, source.url)) {
      if (!isOfficialPdf(anchor.href)) continue;
      const file = decodeURIComponent(anchor.href.split("/").pop() || "");
      if (BAD_FILE.test(file)) continue;
      papers.push({
        url: anchor.href,
        department: source.department,
        departmentId: source.departmentId,
        title: anchor.text && anchor.text.length > 3 ? anchor.text : "",
        source: source.url,
        type: "question-bank"
      });
      found += 1;
    }
  }
  let retained = 0;
  if (!found) {
    const kept = previousPapers.filter((paper) => paper.departmentId === source.departmentId);
    papers.push(...kept);
    retained = kept.length;
    if (!error) error = "No question-bank links were found on the official page";
  }
  sourceReport.push({ ...source, found, retained, error });
  console.log(`${source.departmentId.padEnd(6)} ${String(found).padStart(3)} papers${retained ? ` (+${retained} retained)` : ""}${error ? `  (${error})` : ""}`);
}

const seen = new Set();
const unique = papers.filter((paper) => {
  const key = paper.url.toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

const payload = {
  builtAt: new Date().toISOString(),
  note: "Official subject question banks published by a GNDEC department. Compass links the source PDF and never hosts a copy.",
  sources: sourceReport,
  total: unique.length,
  papers: unique
};

console.log(`\nTotal official question banks: ${unique.length}`);
if (process.argv.includes("--write")) {
  if (!unique.length) {
    console.warn("No verified question bank is available; keeping the previous index. Nothing was written.");
    process.exit(0);
  }
  const written = writeJsonWhenChanged("next/data/papers-index.json", payload);
  console.log(written ? "Wrote next/data/papers-index.json" : "next/data/papers-index.json unchanged");
}
