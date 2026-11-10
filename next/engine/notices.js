/**
 * Notice normalisation, merging, de-duplication and search.
 *
 * Sources, in priority order:
 *   1. Admin-published notices (published from the Compass admin page)
 *   2. Transcribed official notices shipped with the verified release
 *   3. The live GNDEC campus directory (`campus.json`, refreshed by the Worker)
 *   4. The curated official link list (`notices.json`)
 *
 * A notice is only ever shown with a source URL or an explicit transcription
 * label. Compass never rewrites a notice and never invents a date.
 */

export const NOTICE_CATEGORIES = Object.freeze([
  "Examination", "Academic", "Admission", "Fee", "Scholarship", "Event", "Holiday", "General"
]);

const CATEGORY_RULES = Object.freeze([
  ["Examination", /\b(?:exam|examination|datesheet|date sheet|mse|ese|end[- ]sem|reappear|result|seating|practical)\b/i],
  ["Admission", /\b(?:admission|counsel|seat allot|jee|leet|registration)\b/i],
  ["Fee", /\b(?:fee|fees|payment|challan|dues)\b/i],
  ["Scholarship", /\b(?:scholarship|fellowship|stipend|financial aid)\b/i],
  ["Holiday", /\b(?:holiday|vacation|diwali|festival|closed)\b/i],
  ["Event", /\b(?:workshop|seminar|conference|fest|sports|cultural|webinar|hackathon)\b/i],
  ["Academic", /\b(?:timetable|time table|syllabus|academic|class|mentor|section|semester|attendance)\b/i]
]);

export function cleanText(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

export function noticeCategory(title = "", hinted = "") {
  const explicit = cleanText(hinted);
  if (explicit) {
    const match = NOTICE_CATEGORIES.find((name) => name.toLowerCase() === explicit.toLowerCase());
    if (match) return match;
  }
  for (const [name, pattern] of CATEGORY_RULES) {
    if (pattern.test(title)) return name;
  }
  return "General";
}

/** Stable slug used as a local id and a URL fragment. */
export function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "notice";
}

export function dateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function canonicalUrl(value) {
  const raw = cleanText(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return "";
  }
}

export function normalizeNotice(raw, origin = "official") {
  const title = cleanText(raw?.title || raw?.name);
  if (!title) return null;
  const url = canonicalUrl(raw?.url || raw?.link) || cleanText(raw?.url || raw?.link);
  const date = dateOnly(raw?.date || raw?.publishedAt || raw?.createdAt);
  const id = cleanText(raw?.id) || `${slugify(title)}-${date || "undated"}`;
  return {
    id,
    title: title.slice(0, 220),
    url,
    date,
    category: noticeCategory(title, raw?.category),
    author: cleanText(raw?.author || raw?.owner).slice(0, 80),
    source: cleanText(raw?.source || url) || "",
    body: cleanText(raw?.body).slice(0, 4000),
    attachments: Array.isArray(raw?.attachments) ? raw.attachments.filter(Boolean).slice(0, 8) : [],
    pinned: Boolean(raw?.pinned),
    transcribed: Boolean(raw?.transcribed),
    admin: origin === "admin",
    origin
  };
}

function dedupeKey(notice) {
  if (notice.url) return `url:${canonicalUrl(notice.url) || notice.url}`;
  return `title:${slugify(notice.title)}|${notice.date}`;
}

/**
 * Merge every source into one list.
 * Later sources never overwrite an earlier one; duplicates are dropped.
 */
export function mergeNotices({ admin = [], transcribed = [], campus = [], curated = [] } = {}) {
  const seen = new Map();
  const push = (raw, origin) => {
    const notice = normalizeNotice(raw, origin);
    if (!notice) return;
    const key = dedupeKey(notice);
    if (seen.has(key)) return;
    seen.set(key, notice);
  };
  for (const item of Array.isArray(admin) ? admin : []) if (item?.published !== false) push(item, "admin");
  for (const item of Array.isArray(transcribed) ? transcribed : []) push(item, "transcribed");
  for (const item of Array.isArray(campus) ? campus : []) push(item, "campus");
  for (const item of Array.isArray(curated) ? curated : []) push(item, "curated");
  return sortNotices([...seen.values()]);
}

export function sortNotices(list = []) {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.date !== b.date) return String(b.date).localeCompare(String(a.date));
    return String(a.title).localeCompare(String(b.title));
  });
}

export function filterNotices(list = [], { query = "", category = "", from = "", to = "" } = {}) {
  const q = cleanText(query).toLowerCase();
  const tokens = q.split(/\s+/).filter((token) => token.length > 1).slice(0, 8);
  return (Array.isArray(list) ? list : []).filter((notice) => {
    if (category && notice.category !== category) return false;
    if (from && notice.date && notice.date < from) return false;
    if (to && notice.date && notice.date > to) return false;
    if (!tokens.length) return true;
    const haystack = `${notice.title} ${notice.category} ${notice.author} ${notice.body} ${notice.date}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

export function isRecent(date, nowISO = new Date().toISOString(), days = 14) {
  const iso = dateOnly(date);
  if (!iso) return false;
  const then = new Date(`${iso}T00:00:00Z`).getTime();
  const today = new Date(`${dateOnly(nowISO) || nowISO}T00:00:00Z`).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(today)) return false;
  const diff = (today - then) / 86400000;
  return diff >= 0 && diff <= Math.max(1, Number(days) || 14);
}

export function noticeStats(list = [], nowISO = new Date().toISOString()) {
  const items = Array.isArray(list) ? list : [];
  const byCategory = {};
  for (const notice of items) byCategory[notice.category] = (byCategory[notice.category] || 0) + 1;
  return {
    total: items.length,
    fresh: items.filter((notice) => isRecent(notice.date, nowISO)).length,
    pinned: items.filter((notice) => notice.pinned).length,
    byCategory,
    latest: items.reduce((best, notice) => (!best || String(notice.date) > String(best.date) ? notice : best), null)
  };
}

/**
 * Transcribed notices that ship with the app. They are official notices
 * photographed or supplied by a student, so they always carry the
 * `transcribed` label and link to the transcription page.
 */
export const TRANSCRIBED_NOTICES = Object.freeze([
  Object.freeze({
    id: "mse2-theory-2026-11",
    title: "MSE-II Semester I theory date sheet · November 2026",
    url: "/notices/mse2-theory-2026.html",
    date: "2026-11-03",
    category: "Examination",
    author: "Department of Applied Sciences",
    transcribed: true,
    pinned: true,
    body: "Chemistry group and Physics group theory dates for MSE-II, Semester I, November 2026. Transcribed from the photographed Applied Sciences notice APS/11/2368."
  }),
  Object.freeze({
    id: "mse2-workshops-2026-11",
    title: "MSE-II workshops (MP) date sheet · November 2026",
    url: "/notices/mse2-workshops-2026.html",
    date: "2026-11-03",
    category: "Examination",
    author: "Workshops",
    transcribed: true,
    body: "D1 workshop practical dates for ME, RAI, CE, ECE and EE sections, 18–20 November 2026."
  }),
  Object.freeze({
    id: "hod-meeting-2026-11-03",
    title: "HOD meeting minutes: MST-2, end-semester exams and working Saturdays",
    url: "/notices/hod-meeting-2026-11-03.html",
    date: "2026-11-03",
    category: "Academic",
    author: "Principal Office",
    transcribed: true,
    body: "2nd MST from 21 to 28 November 2026, end-semester examinations from 4 December 2026, 21 and 28 November working days, and 10 November 2026 declared a holiday in lieu."
  })
]);
