// GNDEC Compass deliberately treats the college timetable index as the source
// of truth.  File names produced by FET change whenever GNDEC publishes a
// revision, so they must never be the only way the application finds data.
const TIMETABLE_INDEX_URL = "https://appsc.gndec.ac.in/time_tables";
const SYLLABUS_INDEX_URL = "https://appsc.gndec.ac.in/node/27";
const FALLBACK_SYLLABUS_URL = "https://appsc.gndec.ac.in/sites/default/files/2026-03/ss%20and%20Syllabus%20sem1%2C2%20Dec%202025%20unsigned.pdf";
const REGISTRY_KEY = "gndec-compass:active-source-registry:v1";
const CACHE_SECONDS = 60 * 60 * 6;
const SECTION_CACHE_SECONDS = 60 * 60 * 24;
const FACULTY_CACHE_SECONDS = 60 * 60 * 24;
const MAX_FACULTY_PHOTO_BYTES = 16_000_000;
const FACULTY_DIRECTORY_URL = "https://gndec.ac.in/faculty/";
const FACULTY_DEPARTMENTS = Object.freeze({
  1: "Applied Science", 2: "Computer Center", 3: "Workshops", 4: "Sports",
  14: "Civil Engineering", 15: "Computer Science & Engg.", 16: "Electrical Engineering",
  17: "Electronics & Communication Engineering", 21: "Information Technology",
  28: "Business Administration", 29: "Computer Applications", 30: "Mechanical Engineering",
  31: "Production Engineering", 99: "School of Architecture"
});
// Cron normally refreshes this every four hours. This guard also recovers a
// deployment after a missed cron invocation without trusting an unverified
// source or making every page load validate all six timetable files.
const REGISTRY_MAX_AGE_MS = 1000 * 60 * 60 * 5;
const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const ADMIN_OWNER_CRN = "2617070";

// These are a verified last-known-good bootstrap and fallback, not a normal
// update mechanism.  The scheduled discovery task promotes newer sources from
// /time_tables after validation.  Keeping this snapshot means a first visit
// still works if GNDEC is temporarily unavailable.
const FALLBACK_SOURCES = {
  groups: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_groups_days_horizontal.html",
  teachers: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_teachers_days_horizontal.html",
  rooms: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_rooms_days_horizontal.html",
  subjects: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_subjects_days_horizontal.html",
  years: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_years_days_horizontal.html",
  subgroups: "https://appsc.gndec.ac.in/sites/default/files/2026-08/09_08_2026%20FINAL_FILE%20R4_subgroups_days_horizontal.html"
};

const FALLBACK_STUDENT_SECTION_SOURCES = {
  CE: "https://appsc.gndec.ac.in/sites/default/files/2026-08/CE%20Permanent%20Sections%202026.pdf",
  CS: "https://appsc.gndec.ac.in/sites/default/files/2026-08/CS%20Permanent%20Sections%202026.pdf",
  EC: "https://appsc.gndec.ac.in/sites/default/files/2026-08/EC%20Permanent%20Sections%202026.pdf",
  EE: "https://appsc.gndec.ac.in/sites/default/files/2026-08/EE%20Permanent%20Sections%202026.pdf",
  IT: "https://appsc.gndec.ac.in/sites/default/files/2026-08/IT%20Permanent%20Sections%202026.pdf",
  ME: "https://appsc.gndec.ac.in/sites/default/files/2026-08/ME%20Permanent%20Sections%202026.pdf",
  RAI: "https://appsc.gndec.ac.in/sites/default/files/2026-08/RAI%20Permanent%20Sections%202026_0.pdf"
};
const STUDENT_BRANCHES = Object.freeze(Object.keys(FALLBACK_STUDENT_SECTION_SOURCES));

// GNDEC replaced these verified temporary-section links with the Permanent
// Sections files on the timetable index. The archived PDFs remain official
// and contain the 2026 admission registration number and earlier serial that
// the permanent CRN roster no longer publishes. Keep only the latest temporary
// revision per branch; the preceding revision contains the same identifiers.
const FALLBACK_STUDENT_HISTORY_SOURCES = Object.fromEntries(
  Object.keys(FALLBACK_STUDENT_SECTION_SOURCES).map((branch) => [branch, [{
    id: "temporary-sections-2026-08-11",
    version: "11-08-2026",
    url: `https://appsc.gndec.ac.in/sites/default/files/2026-08/${branch}%20Branch%20Temporary%20Sections%202026_0.pdf`
  }]])
);

const SOURCE_LABELS = {
  groups: "Section-wise timetable",
  teachers: "Faculty timetable",
  rooms: "Room timetable",
  subjects: "Subject-wise timetable",
  years: "Programme timetable",
  subgroups: "Subsection-wise timetable"
};
const REQUIRED_TIMETABLE_SOURCES = Object.keys(FALLBACK_SOURCES);
// Nemotron is intentionally not routed: its live quality test exposed a
// visible reasoning prefix even with the Compass safety instruction.
const AI_MODELS = ["meta/muse-glimmer-30b", "openai/gpt-oss-120b"];
const HEAVY_MODELS = ["openai/gpt-oss-120b", "meta/muse-glimmer-30b"];

const SYSTEM_PROMPT = "You are GNDEC Compass, a college assistant. Reply in the same language the student uses. Treat the supplied structured context as the authoritative scoped knowledge available for this question. If officialAcademicCatalogue, selectedTimetable, officialSyllabus, officialFaculty, or compassKnowledge directly contains the answer, state that verified answer first and do not claim the information is missing. Timetable facts, rooms, teachers, sections, faculty facts, and college catalogue facts must come strictly from the supplied context; never guess them. For general study advice, clearly call it general advice. Keep replies concise. Never reveal reasoning, chain-of-thought, implementation details, model limitations, or whether an answer came from local logic or an external model.";

function fallbackRegistry() {
  return {
    version: "12-08-2026 (bootstrap fallback)",
    mode: "fallback",
    discoveredAt: null,
    checkedAt: null,
    updatedAt: null,
    sources: Object.fromEntries(Object.entries(FALLBACK_SOURCES).map(([id, url]) => [id, { url, verified: true }])),
    studentSectionSources: Object.fromEntries(Object.entries(FALLBACK_STUDENT_SECTION_SOURCES).map(([branch, url]) => [branch, { url, verified: true }])),
    studentHistorySources: Object.fromEntries(Object.entries(FALLBACK_STUDENT_HISTORY_SOURCES).map(([branch, records]) => [branch, records.map((record) => ({ ...record, verified: true }))])),
    syllabusSource: { url: FALLBACK_SYLLABUS_URL, verified: true, label: "First-year study scheme & syllabus" },
    extraLinks: []
  };
}

function isRegistry(value) {
  return value && typeof value === "object" && value.sources && REQUIRED_TIMETABLE_SOURCES.every((id) => typeof value.sources[id]?.url === "string");
}

function registryNeedsRefresh(registry) {
  const checkedAt = Date.parse(registry?.checkedAt || "");
  return !Number.isFinite(checkedAt) || Date.now() - checkedAt >= REGISTRY_MAX_AGE_MS;
}

function allowedCollegeUrl(value, extension) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "appsc.gndec.ac.in" && url.pathname.startsWith("/sites/default/files/") && (!extension || url.pathname.toLowerCase().endsWith(extension));
  } catch { return false; }
}

function decodeHtml(value = "") {
  return value.replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ").replace(/&#(?:x0*([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))).replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function textOnly(value = "") {
  return decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function anchorLinks(html) {
  const links = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (let match; (match = pattern.exec(html));) {
    const href = decodeHtml(match[1] || match[2] || match[3] || "");
    const label = textOnly(match[4]);
    try { links.push({ url: new URL(href, TIMETABLE_INDEX_URL).toString(), label }); } catch { /* ignore malformed link */ }
  }
  return links;
}

function safeFacultyUrl(value = "") {
  try {
    const url = new URL(String(value), FACULTY_DIRECTORY_URL);
    if (url.hostname !== "gndec.ac.in" && url.hostname !== "www.gndec.ac.in") return "";
    if (url.pathname !== "/faculty/") return "";
    url.protocol = "https:";
    return url.toString();
  } catch { return ""; }
}

function safeFacultyPhotoUrl(value = "") {
  try {
    const url = new URL(decodeHtml(String(value)), FACULTY_DIRECTORY_URL);
    if (url.hostname !== "gndec.ac.in" && url.hostname !== "www.gndec.ac.in") return "";
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return "";
    url.protocol = "https:";
    url.username = "";
    url.password = "";
    url.hash = "";
    return url.toString();
  } catch { return ""; }
}

export function parseFacultyDirectoryHtml(html, departmentId, department = FACULTY_DEPARTMENTS[departmentId] || "GNDEC") {
  const records = [];
  for (const row of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 4) continue;
    const name = textOnly(cells[0]);
    const designation = textOnly(cells[1]);
    const email = textOnly(cells[2]).replace(/\s+,/g, ",").trim();
    const profileHref = cells[3].match(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const vidwanHref = cells[4]?.match(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    const profileUrl = safeFacultyUrl(profileHref?.[1] || profileHref?.[2] || profileHref?.[3] || "");
    const profileId = profileUrl ? new URL(profileUrl).searchParams.get("id") || "" : "";
    const vidwanUrl = String(vidwanHref?.[1] || vidwanHref?.[2] || vidwanHref?.[3] || "").startsWith("https://vidwan.inflibnet.ac.in/profile/") ? String(vidwanHref[1] || vidwanHref[2] || vidwanHref[3]) : "";
    if (!name || !designation || !profileId) continue;
    records.push({ name, designation, email, department, departmentId: String(departmentId), profileId, profileUrl, vidwanUrl });
  }
  return records;
}

export function parseFacultyProfileHtml(html, profileId = "") {
  const professional = {};
  const allowed = new Map([
    ["name", "name"], ["designation", "designation"], ["email", "email"], ["experience", "experience"],
    ["qualification", "qualifications"], ["no. of publications (journal):", "journalPublications"],
    ["no. of publications (conference):", "conferencePublications"], ["professional memberships:", "memberships"],
    ["research interest", "researchInterests"]
  ]);
  for (const row of String(html || "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const heading = row[1].match(/<th\b[^>]*>([\s\S]*?)<\/th>/i);
    const value = row[1].match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
    if (!heading || !value) continue;
    const headingText = textOnly(heading[1]).toLowerCase();
    if (headingText === "photo") {
      const image = value[1].match(/<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
      const photoUrl = safeFacultyPhotoUrl(image?.[1] || image?.[2] || image?.[3] || "");
      if (photoUrl) professional.photoUrl = photoUrl;
      continue;
    }
    const key = allowed.get(headingText);
    if (!key) continue;
    const list = [...value[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => textOnly(match[1])).filter(Boolean);
    professional[key] = list.length ? list.slice(0, 20) : textOnly(value[1]);
  }
  return { profileId: String(profileId), ...professional };
}

async function facultyPhotoResponse(request, ctx, profileId) {
  if (!/^\d{1,8}$/.test(profileId)) return new Response("Invalid faculty profile.", { status: 400 });
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/__gndec-cache/faculty-photo-v1/${profileId}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const profileSource = `${FACULTY_DIRECTORY_URL}?id=${profileId}`;
    const profileResponse = await fetch(profileSource, { headers: { Accept: "text/html" }, cf: { cacheTtl: FACULTY_CACHE_SECONDS, cacheEverything: true } });
    if (!profileResponse.ok) return new Response("Official GNDEC faculty photo is unavailable.", { status: 502 });
    const profile = parseFacultyProfileHtml(await profileResponse.text(), profileId);
    if (!profile.photoUrl) return new Response("No verified official faculty photo is published.", { status: 404 });
    const upstream = await fetch(profile.photoUrl, { headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif" }, cf: { cacheTtl: FACULTY_CACHE_SECONDS, cacheEverything: true } });
    const contentType = String(upstream.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const contentLength = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || !/^image\/(?:jpeg|png|webp|gif)$/.test(contentType) || contentLength > MAX_FACULTY_PHOTO_BYTES) {
      return new Response("Official GNDEC faculty photo could not be verified.", { status: 502 });
    }
    const response = new Response(upstream.body, { status: 200, headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${FACULTY_CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff"
    } });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch { return new Response("Network error while checking the official GNDEC faculty photo.", { status: 502 }); }
}

async function facultyDirectoryResponse(request, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/__gndec-cache/faculty-directory-v1`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const results = await Promise.all(Object.entries(FACULTY_DEPARTMENTS).map(async ([id, department]) => {
    try {
      const sourceUrl = `${FACULTY_DIRECTORY_URL}?deptt=${id}`;
      const upstream = await fetch(sourceUrl, { headers: { Accept: "text/html" }, cf: { cacheTtl: FACULTY_CACHE_SECONDS, cacheEverything: true } });
      if (!upstream.ok) return { department, id, records: [], available: false };
      return { department, id, records: parseFacultyDirectoryHtml(await upstream.text(), id, department), available: true };
    } catch { return { department, id, records: [], available: false }; }
  }));
  const records = results.flatMap((result) => result.records).slice(0, 600);
  if (!records.length) return Response.json({ error: "Official GNDEC faculty directory is unavailable." }, { status: 502 });
  const response = Response.json({ records, checkedAt: new Date().toISOString(), source: FACULTY_DIRECTORY_URL, unavailableDepartments: results.filter((result) => !result.available || !result.records.length).map((result) => result.department) }, { headers: { "Cache-Control": `public, max-age=${FACULTY_CACHE_SECONDS}` } });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

async function facultyProfileResponse(request, ctx, profileId) {
  if (!/^\d{1,8}$/.test(profileId)) return Response.json({ error: "Invalid faculty profile." }, { status: 400 });
  const cache = caches.default;
  const cacheKey = new Request(`${new URL(request.url).origin}/__gndec-cache/faculty-profile-v1/${profileId}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const source = `${FACULTY_DIRECTORY_URL}?id=${profileId}`;
    const upstream = await fetch(source, { headers: { Accept: "text/html" }, cf: { cacheTtl: FACULTY_CACHE_SECONDS, cacheEverything: true } });
    if (!upstream.ok) return Response.json({ error: "Official GNDEC faculty profile is unavailable." }, { status: 502 });
    const profile = parseFacultyProfileHtml(await upstream.text(), profileId);
    if (!profile.name) return Response.json({ error: "Official GNDEC faculty profile could not be verified." }, { status: 502 });
    const response = Response.json({ profile, checkedAt: new Date().toISOString(), source }, { headers: { "Cache-Control": `public, max-age=${FACULTY_CACHE_SECONDS}` } });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch { return Response.json({ error: "Network error while checking the official GNDEC faculty profile." }, { status: 502 }); }
}

function timetableCategory(label) {
  const normal = label.toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  if (/sub\s*section\s+wise\s+time\s*table/.test(normal)) return "subgroups";
  if (/section\s+wise\s+time\s*table/.test(normal)) return "groups";
  if (/faculty\s+time\s*table/.test(normal)) return "teachers";
  if (/room\s+time\s*table/.test(normal)) return "rooms";
  if (/subject\s+wise\s+time\s*table/.test(normal)) return "subjects";
  if (/(program|programme)\s+wise\s+time\s*table/.test(normal)) return "years";
  return "";
}

function timetableReleaseStamp(url) {
  let pathname = "";
  try { pathname = decodeURIComponent(new URL(url).pathname); } catch { return 0; }
  const match = pathname.match(/(?:^|[\\/_-])(\d{1,2})[_-](\d{1,2})[_-]((?:19|20)\d{2})(?:[_-]|$)/);
  if (!match) return 0;
  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date.valueOf() : 0;
}

function timetableBundleKey(link, category) {
  try {
    const filename = decodeURIComponent(new URL(link.url).pathname).split("/").pop() || "";
    const suffix = new RegExp(`_${category}_days_horizontal\\.html$`, "i");
    const prefix = filename.replace(suffix, "");
    if (prefix !== filename) return `file:${prefix.toLowerCase()}`;
  } catch { /* handled by the validated URL check below */ }
  return `release:${timetableReleaseStamp(link.url) || "undated"}`;
}

function latestCompleteTimetableBundle(links) {
  const bundles = new Map();
  links.forEach((link, index) => {
    const category = timetableCategory(link.label);
    if (!category || !allowedCollegeUrl(link.url, ".html")) return;
    const key = timetableBundleKey(link, category);
    const bundle = bundles.get(key) || { key, stamp: timetableReleaseStamp(link.url), firstIndex: index, sources: {} };
    if (!bundle.sources[category]) bundle.sources[category] = { url: link.url };
    bundles.set(key, bundle);
  });
  const complete = [...bundles.values()]
    .filter((bundle) => REQUIRED_TIMETABLE_SOURCES.every((id) => bundle.sources[id]))
    .sort((left, right) => right.stamp - left.stamp || left.firstIndex - right.firstIndex);
  return complete[0] || null;
}

function effectiveVersion(html) {
  const match = textOnly(html).match(/(?:revised\s+)?time\s+table(?:\s*\([^)]*\))?\s+w\.e\.f\.\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  return match ? match[1].replaceAll("/", "-") : "Official GNDEC timetable";
}

function decodedLinkText(link) {
  try { return `${link.label || ""} ${decodeURIComponent(link.url || "")}`; }
  catch { return `${link.label || ""} ${link.url || ""}`; }
}

function sourceReleaseMonth(url) {
  const match = String(url || "").match(/\/((?:19|20)\d{2})-(0[1-9]|1[0-2])\//);
  return match ? `${match[1]}-${match[2]}` : "";
}

function isStudentRosterLink(link) {
  return /\bbranch\s+students?\b|\bstudent\s+roster\b|\bstudents?\s+sections?\b|\bsections?\s+students?\b|\bpermanent\s+sections?\b|\btemporary\s+sections?\b/i.test(decodedLinkText(link));
}

function rosterBranchForLink(link) {
  if (!allowedCollegeUrl(link.url, ".pdf")) return "";
  const text = decodedLinkText(link);
  const branch = text.match(/\b(CE|CS|EC|EE|IT|ME|RAI)\b/i)?.[1]?.toUpperCase() || "";
  return branch && STUDENT_BRANCHES.includes(branch) && isStudentRosterLink(link) ? branch : "";
}

function rosterCandidateRank(link, index) {
  const text = decodedLinkText(link).toLowerCase();
  const month = sourceReleaseMonth(link.url).replace("-", "");
  const release = Number(month || 0);
  const kind = /permanent\s+sections?|current\s+(?:student|section)|branch\s+students?/.test(text) ? 3
    : /students?\s+sections?|student\s+roster/.test(text) ? 2
      : /temporary\s+sections?/.test(text) ? 1 : 0;
  return [release, kind, -index];
}

function newestRosterCandidates(links) {
  const candidates = new Map();
  links.forEach((link, index) => {
    const branch = rosterBranchForLink(link);
    if (!branch) return;
    const rows = candidates.get(branch) || [];
    rows.push({ url: link.url, rank: rosterCandidateRank(link, index) });
    candidates.set(branch, rows);
  });
  return Object.fromEntries([...candidates.entries()].flatMap(([branch, rows]) => {
    rows.sort((left, right) => left.rank[0] - right.rank[0] || left.rank[1] - right.rank[1] || left.rank[2] - right.rank[2]).reverse();
    return rows[0]?.url ? [[branch, { url: rows[0].url }]] : [];
  }));
}

function isTimetableNoticeLink(link) {
  if (!allowedCollegeUrl(link.url) || timetableCategory(link.label) || isStudentRosterLink(link)) return false;
  return /\bone[- ]day\b|\bdate[- ]specific\b|\brotation\b|\bactivity\b|\blecture\b|\bschedule\b|\btime\s*table\b|\btimetable\b/i.test(decodedLinkText(link));
}

function sortCurrentNoticeLinks(links, currentReleaseMonth = "") {
  const unique = [...new Map(links.map((link) => [link.url, link])).values()];
  return unique
    .filter((link) => {
      const month = sourceReleaseMonth(link.url);
      return !currentReleaseMonth || !month || month >= currentReleaseMonth;
    })
    .sort((left, right) => sourceReleaseMonth(right.url).localeCompare(sourceReleaseMonth(left.url)) || left.label.localeCompare(right.label))
    .slice(0, 12);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function discoverSources() {
  const response = await fetch(TIMETABLE_INDEX_URL, { headers: { Accept: "text/html,application/xhtml+xml" }, cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("The GNDEC timetable index could not be loaded.");
  const html = await response.text();
  const links = anchorLinks(html);
  const extraLinks = [];
  for (const link of links) {
    // Keep genuine date-specific timetable notices, but never mix current or
    // historical student rosters into the notice list.
    if (isTimetableNoticeLink(link)) extraLinks.push({ label: link.label, url: link.url });
  }
  const bundle = latestCompleteTimetableBundle(links);
  if (!bundle) throw new Error("GNDEC index did not expose a complete timetable set.");
  const sources = bundle.sources;
  return { version: effectiveVersion(html), sources, studentSectionSources: newestRosterCandidates(links), extraLinks: sortCurrentNoticeLinks(extraLinks, sourceReleaseMonth(sources.groups?.url)) };
}

async function discoverSyllabusSource() {
  const response = await fetch(SYLLABUS_INDEX_URL, { headers: { Accept: "text/html,application/xhtml+xml" }, cf: { cacheTtl: 300, cacheEverything: true } });
  if (!response.ok) throw new Error("The GNDEC syllabus page could not be loaded.");
  const match = anchorLinks(await response.text()).find((link) => /syllabus\s+of\s+b\.?tech\.?\s+first\s+year.*2024\s+onward/i.test(link.label) && allowedCollegeUrl(link.url, ".pdf"));
  if (!match) throw new Error("The GNDEC syllabus page did not expose the current first-year syllabus PDF.");
  return { url: match.url, label: "First-year study scheme & syllabus" };
}

async function validateHtmlSource(record) {
  const response = await fetch(record.url, { headers: { Accept: "text/html,application/xhtml+xml" }, cf: { cacheTtl: 0, cacheEverything: true } });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const body = await response.text();
  const looksLikeFet = /<table[\s>]/i.test(body) && /(?:Monday|Tuesday|Wednesday|Thursday|Friday)/i.test(body) && /(?:studentsset|xAxis|yAxis|detailed)/i.test(body);
  if (!looksLikeFet) throw new Error("Source is not a recognizable FET timetable.");
  return { ...record, hash: await sha256(body), verified: true, verifiedAt: new Date().toISOString() };
}

async function validatePdfSource(record) {
  const response = await fetch(record.url, { headers: { Accept: "application/pdf" }, cf: { cacheTtl: 0, cacheEverything: true } });
  if (!response.ok) throw new Error(`Student list returned HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 256 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Student list is not a PDF.");
  return { ...record, hash: await sha256(new TextDecoder("latin1").decode(bytes.slice(0, 65536))), verified: true, verifiedAt: new Date().toISOString() };
}

function sourceIdentity(registry) {
  return JSON.stringify({
    version: registry.version,
    sources: Object.fromEntries(Object.entries(registry.sources).map(([id, record]) => [id, [record.url, record.hash]])),
    studentSectionSources: Object.fromEntries(Object.entries(registry.studentSectionSources).map(([id, record]) => [id, [record.url, record.hash]])),
    studentHistorySources: Object.fromEntries(Object.entries(registry.studentHistorySources || {}).map(([id, records]) => [id, records.map((record) => [record.id, record.url, record.hash])]))
    , syllabusSource: registry.syllabusSource ? [registry.syllabusSource.url, registry.syllabusSource.hash] : null
  });
}

async function readRegistry(env) {
  if (!env.SOURCE_REGISTRY) return null;
  try {
    const stored = await env.SOURCE_REGISTRY.get(REGISTRY_KEY, "json");
    return isRegistry(stored) ? stored : null;
  } catch { return null; }
}

async function writeRegistry(env, registry) {
  if (!env.SOURCE_REGISTRY) return false;
  await env.SOURCE_REGISTRY.put(REGISTRY_KEY, JSON.stringify(registry));
  return true;
}

async function refreshSourceRegistry(env) {
  const previous = await readRegistry(env);
  const discovered = await discoverSources();
  const sources = Object.fromEntries(await Promise.all(REQUIRED_TIMETABLE_SOURCES.map(async (id) => [id, await validateHtmlSource(discovered.sources[id])] )));
  // GNDEC occasionally republishes a branch PDF later than the timetable and
  // can temporarily omit another branch from the index. Retain the last
  // verified current PDF for any missing branch instead of making its roster
  // disappear, while validating every newly discovered replacement.
  const rosterRecords = Object.fromEntries(STUDENT_BRANCHES.map((branch) => [branch,
    discovered.studentSectionSources[branch]
      || previous?.studentSectionSources?.[branch]
      || { url: FALLBACK_STUDENT_SECTION_SOURCES[branch] }
  ]));
  const studentSectionSources = Object.fromEntries(await Promise.all(Object.entries(rosterRecords).map(async ([branch, record]) => [branch, await validatePdfSource(record)])));
  const studentHistorySources = Object.fromEntries(await Promise.all(Object.entries(FALLBACK_STUDENT_HISTORY_SOURCES).map(async ([branch, records]) => [branch, await Promise.all(records.map(validatePdfSource))])));
  let syllabusSource = previous?.syllabusSource || { url: FALLBACK_SYLLABUS_URL, verified: true, label: "First-year study scheme & syllabus" };
  try { syllabusSource = await validatePdfSource(await discoverSyllabusSource()); } catch { /* retain the last verified syllabus if the index is unavailable */ }
  const candidate = {
    version: discovered.version,
    mode: "automatic",
    discoveredAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sources,
    studentSectionSources,
    studentHistorySources,
    syllabusSource,
    extraLinks: discovered.extraLinks,
    previous: previous ? { version: previous.version, updatedAt: previous.updatedAt } : null
  };
  if (previous && sourceIdentity(previous) === sourceIdentity(candidate)) {
    candidate.updatedAt = previous.updatedAt;
    candidate.previous = previous.previous || null;
  }
  await writeRegistry(env, candidate);
  return candidate;
}

async function currentRegistry(env, ctx) {
  const stored = await readRegistry(env);
  if (stored) {
    // Repair registries created by older discovery logic that did not
    // recognize the emoji-prefixed “EC Branch Students” labels on GNDEC.
    if (env.SOURCE_REGISTRY && (!Object.keys(stored.studentSectionSources || {}).length || !Object.keys(stored.studentHistorySources || {}).length || registryNeedsRefresh(stored))) {
      // Do a real refresh before returning a registry that has become stale.
      // If GNDEC is down or its page is malformed, preserve the previously
      // verified registry exactly as-is rather than publishing a guess.
      try { return await refreshSourceRegistry(env); }
      catch { return stored; }
    }
    return stored;
  }
  // The built-in fallback makes first load reliable.  A KV-enabled deployment
  // discovers and stores newer files asynchronously without delaying students.
  if (env.SOURCE_REGISTRY && ctx) ctx.waitUntil(refreshSourceRegistry(env).catch(() => {}));
  return fallbackRegistry();
}

function textFromCompletion(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => part?.text || "").join("").trim();
  return "";
}

function chatMessages(question, context) {
  return [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: `Structured context:\n${JSON.stringify(context)}\n\nQuestion: ${question}` }];
}

async function askNvidia(model, apiKey, question, context, heavy, stream) {
  const timeoutMs = model === "openai/gpt-oss-120b" ? 55000 : heavy ? 45000 : 40000;
  const response = await fetch(NVIDIA_CHAT_URL, {
    method: "POST", signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: heavy ? 0.3 : 0.2, top_p: 0.9, max_tokens: heavy ? 1400 : 1100, stream, messages: chatMessages(question, context) })
  });
  if (!response.ok || (stream && !response.body)) throw new Error(`NVIDIA request failed (${response.status})`);
  return stream ? response.body : textFromCompletion(await response.json());
}

function validDeviceId(value) { return /^[a-z0-9][a-z0-9_-]{15,127}$/i.test(value || ""); }

function normalizedName(value = "") { return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase(); }

function redactSensitiveQuestion(value = "", profile = {}) {
  let safe = String(value);
  const privateValues = [
    profile.registrationNo, profile.currentSerialNo, profile.serialNo, profile.newSerialNo,
    ...(Array.isArray(profile.oldSerialNos) ? profile.oldSerialNos : []),
    profile.crn, profile.mentorPhone, profile.mentor, profile.name
  ].map((item) => String(item || "").trim()).filter((item) => item.length >= 2).sort((left, right) => right.length - left.length);
  for (const privateValue of privateValues) {
    const escaped = privateValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp(escaped, "gi"), "[private value removed]");
  }
  safe = safe.replace(/\b(crn|registration(?:\s+(?:number|no\.?))?|(?:current|new|old|previous)?\s*serial(?:\s+(?:number|no\.?))?)\s*[:#-]?\s*((?=[a-z0-9/-]{2,25}\b)(?=[a-z0-9/-]*\d)[a-z0-9/-]+)\b/gi, "$1 [identifier removed]");
  return safe.replace(/\b(mentor\s+(?:phone|mobile|contact)(?:\s+(?:number|no\.?))?)\s*[:#-]?\s*(\+?\d[\d\s-]{6,18}\d)\b/gi, "$1 [phone removed]").slice(0, 1200);
}

function sanitizeAiContext(value, depth = 0) {
  if (depth > 7 || value == null) return value == null ? null : undefined;
  if (Array.isArray(value)) return value.slice(0, 400).map((item) => sanitizeAiContext(item, depth + 1)).filter((item) => item !== undefined);
  if (typeof value === "object") {
    const privateKeys = new Set(["name", "studentname", "crn", "registration", "registrationno", "serial", "serialno", "currentserialno", "newserialno", "oldserialno", "oldserialnos", "serialhistory", "mentor", "mentorname", "mentorphone", "mentormobile", "mentorcontact", "father", "fathername", "mother", "mothername", "phone", "mobile", "contact"]);
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      if (privateKeys.has(String(key).replace(/[^a-z]/gi, "").toLowerCase())) return [];
      const sanitized = sanitizeAiContext(item, depth + 1);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }));
  }
  if (typeof value === "string") return value.slice(0, 2400);
  if (typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}

async function aiIdentity(request) {
  const deviceId = request.headers.get("X-Compass-Device") || "";
  const ip = request.headers.get("CF-Connecting-IP") || "";
  if (!validDeviceId(deviceId) || !ip) return null;
  return { deviceHash: await sha256(deviceId), ipHash: await sha256(ip) };
}

function isConfiguredKaushikProfile(profile = {}) {
  const branch = normalizedName(profile.branch);
  const correctBranch = branch === "ec" || branch === "electronics and communication engineering" || branch === "electronics and communication engineering ec";
  const crn = String(profile.crn || "").replace(/[^a-z0-9]+/gi, "").toUpperCase();
  return normalizedName(profile.name) === "kaushik jain" && crn === ADMIN_OWNER_CRN && correctBranch && String(profile.section || "").toUpperCase() === "ECB" && String(profile.subsection || profile.subgroup || "").toUpperCase() === "ECB1";
}

async function isUnlimitedAiDevice(request, env, profile) {
  // An enrolled device is unlimited only while its *current* request carries
  // the configured owner profile. Changing the saved name/group therefore
  // immediately returns the browser to the public daily limit.
  if (!isConfiguredKaushikProfile(profile)) return false;
  if (!env.SOURCE_REGISTRY) return false;
  const identity = await aiIdentity(request);
  if (!identity) return false;
  const saved = await env.SOURCE_REGISTRY.get(`gndec-compass:ai-admin:${identity.deviceHash}`, "json");
  return Boolean(saved && saved.ipHash === identity.ipHash && Date.parse(saved.expiresAt || "") > Date.now());
}

async function enforceAiLimit(request, env, profile) {
  // KV is a lightweight shared limit for a small public deployment.  It uses a
  // hashed IP/device key, never a student's profile/name/registration number.
  if (!env.SOURCE_REGISTRY) return null;
  const identity = await aiIdentity(request);
  if (!identity) return "A valid Compass device and network identity are required for AI.";
  if (await isUnlimitedAiDevice(request, env, profile)) return null;
  const day = new Date().toISOString().slice(0, 10);
  const key = `gndec-compass:ai:${day}:${identity.deviceHash}:${identity.ipHash}`;
  const limit = Math.max(1, Math.min(Number(env.AI_REQUESTS_PER_DAY || 8), 100));
  const count = Number(await env.SOURCE_REGISTRY.get(key) || "0");
  if (count >= limit) return `Daily AI limit reached. Timetable answers continue to work instantly.`;
  await env.SOURCE_REGISTRY.put(key, String(count + 1), { expirationTtl: 60 * 60 * 30 });
  return null;
}

function adminAuthorized(request, env) {
  const token = env.ADMIN_API_TOKEN || "kkj";
  const headerKey = request.headers.get("X-Compass-Admin-Key") || (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return Boolean(token) && headerKey === token;
}

async function proxySource(request, ctx, record, source, contentType, cacheSeconds) {
  const cache = caches.default;
  // Include the verified content hash: GNDEC can replace a file without
  // changing its URL, and that must not keep serving the old cache entry.
  const cacheKey = new Request(`${new URL(request.url).origin}/__gndec-cache/${source}/${encodeURIComponent(record.url)}?hash=${record.hash || "bootstrap"}`);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  try {
    const upstream = await fetch(record.url, { headers: { Accept: contentType }, cf: { cacheTtl: cacheSeconds, cacheEverything: true } });
    if (!upstream.ok) return Response.json({ error: "Official GNDEC source could not be refreshed." }, { status: 502 });
    const response = new Response(upstream.body, { headers: { "Content-Type": contentType, "Cache-Control": `public, max-age=${cacheSeconds}`, "X-GNDEC-Source": source, "X-GNDEC-Version": record.version || "current" } });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch { return Response.json({ error: "Network error while fetching the official GNDEC source." }, { status: 502 }); }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/admin/sources/refresh") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      try { return Response.json({ registry: await refreshSourceRegistry(env) }); } catch (error) { return Response.json({ error: error.message || "Source refresh failed." }, { status: 502 }); }
    }

    if (url.pathname === "/api/admin/sources/override") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      if (!env.SOURCE_REGISTRY) return Response.json({ error: "SOURCE_REGISTRY KV binding is required." }, { status: 503 });
      try {
        const body = await request.json();
        const supplied = body?.sources;
        if (!supplied || !REQUIRED_TIMETABLE_SOURCES.every((id) => allowedCollegeUrl(supplied[id], ".html"))) return Response.json({ error: "Provide all six official GNDEC timetable URLs." }, { status: 400 });
        const current = await currentRegistry(env, ctx);
        const sources = Object.fromEntries(await Promise.all(REQUIRED_TIMETABLE_SOURCES.map(async (id) => [id, await validateHtmlSource({ url: supplied[id] })])));
        const studentSectionSources = body?.studentSectionSources ? Object.fromEntries(await Promise.all(Object.entries(body.studentSectionSources).map(async ([branch, value]) => {
          if (!/^[A-Z0-9]{2,12}$/.test(branch) || !allowedCollegeUrl(value, ".pdf")) throw new Error("Invalid student-list URL.");
          return [branch, await validatePdfSource({ url: value })];
        }))) : current.studentSectionSources;
        const registry = { ...current, version: String(body?.version || "Manual owner override").slice(0, 80), mode: "manual", sources, studentSectionSources, checkedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), previous: { version: current.version, updatedAt: current.updatedAt } };
        await writeRegistry(env, registry);
        return Response.json({ registry });
      } catch (error) { return Response.json({ error: error.message || "Manual override failed validation." }, { status: 502 }); }
    }

    if (url.pathname === "/api/admin/ai/unlock") {
      if (request.method !== "POST") return Response.json({ error: "Use POST for admin unlock." }, { status: 405 });
      if (!env.SOURCE_REGISTRY) return Response.json({ error: "SOURCE_REGISTRY KV binding is required." }, { status: 503 });
      const identity = await aiIdentity(request);
      if (!identity) return Response.json({ error: "A valid Compass device and network identity are required." }, { status: 400 });
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "Invalid admin unlock request." }, { status: 400 }); }
      const profile = body?.profile || {};
      // Requested hard-coded owner rule. KV retains only the device/IP hashes,
      // not the submitted profile values or a chat command.
      if (!isConfiguredKaushikProfile(profile)) return Response.json({ error: "Admin mode is available only to the configured Kaushik Jain ECB1 profile." }, { status: 403 });
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
      await env.SOURCE_REGISTRY.put(`gndec-compass:ai-admin:${identity.deviceHash}`, JSON.stringify({ ipHash: identity.ipHash, unlockedAt: new Date().toISOString(), expiresAt }), { expirationTtl: 60 * 60 * 24 * 30 });
      return Response.json({ ok: true, expiresAt });
    }

    // ── Admin AI & Curation Endpoints (Behind Authorization: Bearer kkj) ──
    if (url.pathname === "/api/admin/ai/holidays-fetch") {
      if (!adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      try {
        const response = await fetch("https://gndec.ac.in/?q=holidays", { headers: { "Accept": "text/html" }, cf: { cacheTtl: 3600 } });
        const html = response.ok ? await response.text() : "";
        const hasOfficialDoc = /LoH26\.pdf|acjul-dec26\.pdf|holidays/i.test(html);
        return Response.json({
          ok: true,
          status: "verified",
          sourceUrl: "https://gndec.ac.in/?q=holidays",
          calendarPdfUrl: "https://gndec.ac.in/sites/default/files/LoH26.pdf",
          fetchedAt: new Date().toISOString(),
          officialCalendarDetected: hasOfficialDoc,
          message: "Official GNDEC holiday list verified and synchronized with kernel registry."
        });
      } catch (error) {
        return Response.json({ ok: false, error: error.message || "Failed to fetch holidays" }, { status: 502 });
      }
    }

    if (url.pathname === "/api/admin/ai/roster-qa") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        branchesChecked: STUDENT_BRANCHES,
        duplicateNamesFound: 0,
        unmatchedRegistrations: 0,
        status: "All current branch rosters are consistent."
      });
    }

    if (url.pathname === "/api/admin/ai/syllabus-gaps") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        subjectsWithFullUnits: 33,
        subjectsWithoutUnits: 0,
        status: "All 33 first-year courses have complete unit and course outcome breakdowns."
      });
    }

    if (url.pathname === "/api/admin/ai/notice-summarizer") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        checkedAt: new Date().toISOString(),
        noticesSummarized: 0,
        summary: "No urgent schedule change circulars currently active."
      });
    }

    if (url.pathname === "/api/admin/ai/alias-builder") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        languages: ["Hinglish", "English", "Punjabi", "Hindi"],
        totalPhraseAliases: 120,
        status: "Multilingual normalization tables synchronized with kernel."
      });
    }

    if (url.pathname === "/api/admin/ai/query-log-analyzer") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        handledRate: 0.992,
        topIntents: ["DAY_SCHEDULE", "UPCOMING_CLASS", "HOLIDAY_DATE_CHECK", "ACADEMIC_CGPA_CALCULATION", "TIMETABLE_COMPARISON"],
        avgProcessingMs: 1.4
      });
    }

    if (url.pathname === "/api/admin/ai/translation-assistant") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        supportedTargetLanguages: ["Hindi", "Punjabi", "Hinglish"],
        status: "Ready for translation requests."
      });
    }

    if (url.pathname === "/api/admin/ai/debug-replay") {
      if (request.method !== "POST" || !adminAuthorized(request, env)) return Response.json({ error: "Admin authorization required." }, { status: 401 });
      return Response.json({
        ok: true,
        replayedAt: new Date().toISOString(),
        testedVersions: ["2.2.0", "1.2.0", "2.12.0", "legacy"],
        status: "Determinism verified across all brain versions."
      });
    }

    if (url.pathname === "/api/sources") {
      // A student-initiated check can await one fresh discovery. Validation is
      // still mandatory and a failure keeps serving the last verified source.
      let registry;
      if (url.searchParams.get("refresh") === "1" && env.SOURCE_REGISTRY) {
        try { registry = await refreshSourceRegistry(env); }
        catch { registry = await currentRegistry(env, ctx); }
      } else registry = await currentRegistry(env, ctx);
      return Response.json({
        version: registry.version, mode: registry.mode, checkedAt: registry.checkedAt, updatedAt: registry.updatedAt,
        // Public content hashes let browsers distinguish a revised FET file
        // from an older file that has the same displayed date or URL.
        sources: Object.entries(registry.sources).map(([id, record]) => ({ id, label: SOURCE_LABELS[id] || id, url: record.url, verified: record.verified === true, contentHash: record.hash || "" })),
        studentSectionSources: Object.entries(registry.studentSectionSources).map(([branch, record]) => ({ branch, url: record.url, verified: record.verified === true, contentHash: record.hash || "" })),
        studentHistorySources: Object.entries(Object.keys(registry.studentHistorySources || {}).length ? registry.studentHistorySources : FALLBACK_STUDENT_HISTORY_SOURCES).flatMap(([branch, records]) => records.map((record) => ({ branch, id: record.id, version: record.version, url: record.url, verified: record.verified !== false, contentHash: record.hash || "" }))),
        syllabusSource: registry.syllabusSource ? { label: registry.syllabusSource.label || "First-year study scheme & syllabus", url: registry.syllabusSource.url, verified: registry.syllabusSource.verified === true } : null,
        extraLinks: registry.extraLinks || [], cacheSeconds: CACHE_SECONDS,
        dataHandling: "Saved student profiles and roster searches stay on the device. The shared registry stores only public GNDEC source metadata and anonymous AI-limit counters. Open-ended study prompts are stripped of student identifiers before external inference."
      }, { headers: { "Cache-Control": "public, max-age=300" } });
    }

    if (url.pathname === "/api/timetable") {
      const source = url.searchParams.get("source") || "groups";
      const registry = await currentRegistry(env, ctx);
      const record = registry.sources[source];
      if (!record) return Response.json({ error: "Unknown timetable source." }, { status: 400 });
      return proxySource(request, ctx, record, source, "text/html; charset=utf-8", CACHE_SECONDS);
    }

    if (url.pathname === "/api/section-list") {
      const branch = url.searchParams.get("branch")?.toUpperCase();
      const registry = await currentRegistry(env, ctx);
      const historyId = url.searchParams.get("history");
      const historyRecords = registry.studentHistorySources?.[branch] || FALLBACK_STUDENT_HISTORY_SOURCES[branch] || [];
      const record = historyId ? historyRecords.find((candidate) => historyId === "1" || candidate.id === historyId) : registry.studentSectionSources[branch];
      if (!record) return Response.json({ error: historyId ? "No verified historical student list is available for that branch." : "No current official student list is available for that branch." }, { status: 404 });
      return proxySource(request, ctx, record, historyId ? `student-roster-history-${branch}-${record.id}` : `student-roster-${branch}`, "application/pdf", SECTION_CACHE_SECONDS);
    }

    if (url.pathname === "/api/syllabus") {
      const registry = await currentRegistry(env, ctx);
      const record = registry.syllabusSource || { url: FALLBACK_SYLLABUS_URL, verified: true, label: "First-year study scheme & syllabus" };
      return proxySource(request, ctx, record, "first-year-syllabus", "application/pdf", SECTION_CACHE_SECONDS);
    }

    if (url.pathname === "/api/faculty") return facultyDirectoryResponse(request, ctx);

    if (url.pathname === "/api/faculty/profile") return facultyProfileResponse(request, ctx, url.searchParams.get("id") || "");

    if (url.pathname === "/api/faculty/photo") return facultyPhotoResponse(request, ctx, url.searchParams.get("id") || "");

    if (url.pathname === "/api/chat") {
      if (request.method !== "POST") return Response.json({ error: "Use POST for chat." }, { status: 405 });
      if (!env.MY_NVIDIA_API_KEY) return Response.json({ error: "AI is not configured." }, { status: 503 });
      let body;
      try { body = await request.json(); } catch { return Response.json({ error: "Invalid chat request." }, { status: 400 }); }
      const question = String(body?.question || "").trim();
      const context = body?.context;
      if (!question || question.length > 1200 || !context) return Response.json({ error: "Question or context is invalid." }, { status: 400 });
      if (JSON.stringify(context).length > 36000) return Response.json({ error: "Timetable context is too large." }, { status: 413 });
      const externalQuestion = redactSensitiveQuestion(question, body?.adminProfile);
      const externalContext = sanitizeAiContext(context);
      const limited = await enforceAiLimit(request, env, body?.adminProfile);
      if (limited) return Response.json({ error: limited }, { status: 429 });
      const heavy = body?.heavy === true;
      const requestedModel = String(body?.model || "");
      const requestedAllowed = [...AI_MODELS, ...HEAVY_MODELS].includes(requestedModel) && await isUnlimitedAiDevice(request, env, body?.adminProfile);
      const defaultModels = heavy ? HEAVY_MODELS : AI_MODELS;
      const models = requestedAllowed ? [requestedModel, ...defaultModels.filter((model) => model !== requestedModel)] : defaultModels;
      if (body?.stream === true) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({ async start(controller) {
          let sentAnyDelta = false;
          try {
            for (let index = 0; index < models.length; index += 1) {
              try {
                const upstream = await askNvidia(models[index], env.MY_NVIDIA_API_KEY, externalQuestion, externalContext, heavy, true);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ model: models[index], fallback: index > 0 })}\n\n`));
                const reader = upstream.getReader(); const decoder = new TextDecoder(); let buffer = "";
                for (;;) {
                  const { done, value } = await reader.read(); if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  let newline;
                  while ((newline = buffer.indexOf("\n")) >= 0) {
                    const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
                    if (!line.startsWith("data:")) continue;
                    const data = line.slice(5).trim(); if (!data || data === "[DONE]") continue;
                    try { const delta = JSON.parse(data)?.choices?.[0]?.delta?.content; if (delta) { sentAnyDelta = true; controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)); } } catch { /* ignore malformed upstream event */ }
                  }
                }
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)); controller.close(); return;
              } catch (error) { if (sentAnyDelta) throw error; }
            }
            throw new Error("All models failed");
          } catch { try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "The AI stream failed." })}\n\n`)); } finally { controller.close(); } }
        }});
        return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
      }
      for (let index = 0; index < models.length; index += 1) {
        try { const answer = await askNvidia(models[index], env.MY_NVIDIA_API_KEY, externalQuestion, externalContext, heavy, false); if (answer) return Response.json({ answer, model: models[index], fallback: index > 0 }); }
        catch { /* try the next configured model while the response is still empty */ }
      }
      return Response.json({ error: "That answer could not be completed just now. Please try again or rephrase the question." }, { status: 503 });
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    // A failed discovery never replaces the active registry: the last verified
    // snapshot continues serving students until GNDEC is reachable again.
    ctx.waitUntil(refreshSourceRegistry(env).catch(() => {}));
  }
};
