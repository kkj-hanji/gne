import test from "node:test";
import assert from "node:assert/strict";

import {
  ACADEMIC_PERIODS,
  HOLIDAYS_2026,
  academicPeriodFor,
  dayOfWeek,
  holidayOn,
  holidaySummary,
  isOffDay,
  upcomingHolidays
} from "../next/engine/calendar.js";
import {
  NOTICE_CATEGORIES,
  TRANSCRIBED_NOTICES,
  filterNotices,
  mergeNotices,
  normalizeNotice,
  noticeCategory,
  noticeStats,
  slugify
} from "../next/engine/notices.js";
import {
  buildPaperIndex,
  groupPapers,
  paperId,
  paperStats,
  parsePaperTitle,
  searchPapers
} from "../next/engine/papers.js";
import {
  buildSyllabusIndex,
  groupSyllabus,
  normalizeSyllabus,
  searchSyllabus,
  semesterFromLabel
} from "../next/engine/syllabus.js";
import {
  MENTORING_SUBJECT,
  applyMentoringOverride,
  applyMentoringOverrides,
  profileAppliesToSelection
} from "../next/engine/mentoring.js";
import {
  addEditor,
  authorize,
  deleteItem,
  getFile,
  publicPayload,
  putFile,
  readAll,
  readAudit,
  removeEditor,
  restorePrevious,
  upsertItem
} from "../src/content-store.js";
import { handleRequest } from "../src/next-core.js";

const ORIGIN = "https://next.compass.test";
const OWNER = "owner-token-0123456789";
const EDITOR = "editor-token-0123456789";

/* ── Fake KV ────────────────────────────────────────────────────────────── */

function createKv() {
  const map = new Map();
  return {
    map,
    async get(key, type) {
      const entry = map.get(key);
      if (!entry) return null;
      if (type === "json") return typeof entry.value === "string" ? JSON.parse(entry.value) : entry.value;
      return entry.value;
    },
    async put(key, value, options = {}) {
      map.set(key, { value, metadata: options.metadata || null, options });
    },
    async delete(key) { map.delete(key); },
    async getWithMetadata(key, type) {
      const entry = map.get(key);
      if (!entry) return null;
      let value = entry.value;
      if (type === "arrayBuffer" && value instanceof Uint8Array) {
        value = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      }
      return { value, metadata: entry.metadata };
    }
  };
}

function env(overrides = {}) {
  return { ADMIN_API_TOKEN: OWNER, CONTENT: createKv(), ...overrides };
}

function request(path, { method = "GET", headers = {}, body, token } = {}) {
  const auth = token ? { Authorization: `Bearer ${token}` } : {};
  return new Request(`${ORIGIN}${path}`, { method, headers: { ...auth, ...headers }, body });
}

function ctx() {
  return { waitUntil() {} };
}

function jsonRequest(path, payload, token = OWNER, method = "POST") {
  return request(path, {
    method,
    token,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/* ── Calendar ───────────────────────────────────────────────────────────── */

test("official holidays are exact and overrides never invent a date", () => {
  assert.ok(HOLIDAYS_2026.length >= 30, "the official 2026 list should be complete");
  for (const item of HOLIDAYS_2026) {
    assert.match(item.date, /^2026-\d{2}-\d{2}$/);
    assert.ok(item.name);
    assert.ok(["holiday", "restricted", "half-day"].includes(item.type));
  }

  const republic = holidayOn("2026-01-26");
  assert.equal(republic.name, "Republic Day");
  assert.equal(republic.type, "holiday");
  assert.equal(republic.overridden, false);
  assert.equal(isOffDay("2026-01-26"), true);

  assert.equal(holidayOn("2026-01-27"), null);
  assert.equal(isOffDay("2026-01-27"), false);
  assert.equal(dayOfWeek("2026-11-09"), "Monday");
  assert.equal(dayOfWeek("not-a-date"), "");
});

test("an admin override can close a day or turn a holiday into a working day", () => {
  const working = [{ date: "2026-11-09", name: "Working Saturday in lieu", type: "working" }];
  const item = holidayOn("2026-11-09", working);
  assert.equal(item.type, "working");
  assert.equal(item.overridden, true);
  assert.equal(isOffDay("2026-11-09", working), false);

  const halfDay = [{ date: "2026-11-10", name: "Half day", type: "half-day" }];
  assert.equal(isOffDay("2026-11-10", halfDay), false);
  assert.match(holidaySummary("2026-11-10", halfDay), /half-day/i);

  const extra = [{ date: "2026-11-10", name: "Declared holiday", type: "holiday" }];
  assert.equal(isOffDay("2026-11-10", extra), true);
  assert.match(holidaySummary("2026-11-10", extra), /closed holiday/i);

  // Missing or malformed overrides are ignored, never guessed.
  assert.equal(holidayOn("2026-11-10", [{ date: "", name: "x" }]), null);
  assert.equal(holidayOn("2026-11-10", [{ date: "2026-11-10", name: "" }]), null);
});

test("upcoming holidays are sorted, bounded and exclude working overrides", () => {
  const upcoming = upcomingHolidays("2026-11-09", { limit: 4 });
  assert.equal(upcoming.length, 4);
  assert.deepEqual(upcoming.map((item) => item.date), [...upcoming.map((item) => item.date)].sort());
  assert.equal(upcoming[0].date, "2026-11-09");
  assert.ok(upcoming.every((item) => item.type !== "working"));

  const overridden = upcomingHolidays("2026-11-09", {
    overrides: [{ date: "2026-11-09", name: "Working day", type: "working" }],
    limit: 3
  });
  assert.ok(!overridden.some((item) => item.date === "2026-11-09"));
  assert.deepEqual(upcomingHolidays("", { limit: 3 }), []);
});

test("academic periods come from the published calendar and are never inferred", () => {
  assert.equal(ACADEMIC_PERIODS.length, 3);
  assert.equal(academicPeriodFor("first year academic calendar")[0].kind, "first");
  assert.equal(academicPeriodFor("B.Tech LEET academic calendar")[0].kind, "leet");
  assert.equal(academicPeriodFor("second year semester exams")[0].kind, "continuing");
  assert.deepEqual(academicPeriodFor("January semester"), []);
  assert.deepEqual(academicPeriodFor("who teaches physics"), []);
});

/* ── Notices ────────────────────────────────────────────────────────────── */

test("notices merge by source, drop duplicates and keep pinned items first", () => {
  const admin = [
    { title: "MSE-II date sheet", date: "2026-11-03", url: "https://erp.gndec.ac.in/notice/1", pinned: false },
    { title: "Fee notice", date: "2026-10-01", url: "https://erp.gndec.ac.in/notice/2", pinned: true },
    { title: "Draft notice", date: "2026-11-01", url: "https://erp.gndec.ac.in/notice/3", published: false }
  ];
  const campus = [
    { title: "MSE-II date sheet (mirror)", date: "2026-11-03", url: "https://erp.gndec.ac.in/notice/1" }
  ];
  const merged = mergeNotices({ admin, transcribed: TRANSCRIBED_NOTICES, campus });
  assert.ok(merged.length >= 4);
  assert.equal(merged[0].pinned, true, "pinned notices sort first");
  assert.equal(merged.filter((notice) => notice.url === "https://erp.gndec.ac.in/notice/1").length, 1);
  assert.ok(!merged.some((notice) => notice.title === "Draft notice"), "unpublished admin notices stay private");
  assert.ok(merged.some((notice) => notice.transcribed), "transcribed notices are labelled");
  assert.ok(merged.some((notice) => notice.admin), "admin notices are labelled");
});

test("notice categories, search and stats are deterministic", () => {
  assert.equal(noticeCategory("MSE-II date sheet"), "Examination");
  assert.equal(noticeCategory("Fee payment last date"), "Fee");
  assert.equal(noticeCategory("Scholarship applications"), "Scholarship");
  assert.equal(noticeCategory("Workshop on AI"), "Event");
  assert.equal(noticeCategory("Timetable revised"), "Academic");
  assert.equal(noticeCategory("Anything else"), "General");
  assert.equal(noticeCategory("Anything else", "Fee"), "Fee");
  assert.ok(NOTICE_CATEGORIES.includes(noticeCategory("Admissions open")));
  assert.equal(slugify("MSE-II Date Sheet!"), "mse-ii-date-sheet");

  const list = mergeNotices({
    admin: [
      { title: "Physics exam date sheet", date: "2026-11-03", category: "Examination" },
      { title: "Diwali holiday", date: "2026-11-08", category: "Holiday" }
    ]
  });
  assert.equal(filterNotices(list, { query: "physics" }).length, 1);
  assert.equal(filterNotices(list, { category: "Holiday" }).length, 1);
  assert.equal(filterNotices(list, { from: "2026-11-04" }).length, 1);
  assert.equal(filterNotices(list, { to: "2026-11-04" }).length, 1);

  const stats = noticeStats(list, "2026-11-09");
  assert.equal(stats.total, 2);
  assert.equal(stats.fresh, 2);
  assert.equal(stats.pinned, 0);
  assert.equal(stats.latest.date, "2026-11-08");
  assert.equal(stats.byCategory.Examination, 1);

  assert.equal(normalizeNotice({ date: "2026-11-09" }), null, "a notice without a title is rejected");
  const curated = normalizeNotice({ title: "Holiday list", link: "https://gndec.ac.in/holidays", date: "2026-11-09" }, "curated");
  assert.equal(curated.origin, "curated");
  assert.equal(curated.category, "Holiday");
});

/* ── Papers ─────────────────────────────────────────────────────────────── */

test("paper metadata is parsed from the official file name only", () => {
  const parsed = parsePaperTitle("https://it.gndec.ac.in/sqb/Data%20Structures%20(PCIT-101).pdf");
  assert.equal(parsed.subject, "Data Structures");
  assert.equal(parsed.code, "PCIT-101");
  assert.equal(parsePaperTitle("").subject, "Question bank");
  assert.equal(paperId("https://it.gndec.ac.in/sqb/a.pdf"), "it-gndec-ac-in-sqb-a-pdf");
});

test("paper index de-duplicates, searches and groups by department", () => {
  const list = buildPaperIndex([
    { url: "https://it.gndec.ac.in/sqb/Data%20Structures%20(PCIT-101).pdf", department: "Information Technology", semester: "3" },
    { url: "https://it.gndec.ac.in/sqb/Data%20Structures%20(PCIT-101).pdf", department: "Information Technology", semester: "3" },
    { url: "https://it.gndec.ac.in/sqb/Databases%20(PCIT-201).pdf", department: "Information Technology", semester: "4" },
    { url: "" }
  ]);
  assert.equal(list.length, 2, "the same URL is indexed once and an empty URL is rejected");
  assert.equal(searchPapers(list, "data structures")[0].code, "PCIT-101");
  assert.equal(searchPapers(list, "pcit-201")[0].subject, "Databases");
  assert.equal(searchPapers(list, "", { department: "Information Technology" }).length, 2);
  assert.equal(searchPapers(list, "", { department: "Civil Engineering" }).length, 0);

  const groups = groupPapers(list);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, "Information Technology");
  assert.equal(groups[0].count, 2);
  assert.deepEqual(paperStats(list), { total: 2, departments: 1, subjects: 2 });
});

/* ── Syllabus ───────────────────────────────────────────────────────────── */

test("syllabus links carry an official department and an explicit semester only", () => {
  assert.equal(semesterFromLabel("B.Tech Sem 3 syllabus"), "3");
  assert.equal(semesterFromLabel("Third semester"), "3");
  assert.equal(semesterFromLabel("Batch 2024 syllabus"), "");
  assert.equal(semesterFromLabel("", "https://x.test/sem-5.pdf"), "5");

  const docs = buildSyllabusIndex([
    { url: "https://gndec.ac.in/syllabus/it-sem-3.pdf", label: "IT Sem 3", department: "Information Technology" },
    { url: "https://gndec.ac.in/syllabus/it-sem-3.pdf", label: "duplicate", department: "Information Technology" },
    { url: "https://gndec.ac.in/syllabus/ce.pdf", label: "Civil syllabus", department: "Civil Engineering" }
  ]);
  assert.equal(docs.length, 2);
  assert.equal(docs.find((doc) => doc.department === "Information Technology").semester, "3");
  assert.equal(searchSyllabus(docs, "civil")[0].department, "Civil Engineering");
  assert.equal(searchSyllabus(docs, "", { department: "Information Technology" }).length, 1);
  assert.equal(groupSyllabus(docs).length, 2);
  assert.equal(normalizeSyllabus({ url: "" }), null);

  const fallback = normalizeSyllabus({ url: "https://gndec.ac.in/syllabus.pdf" });
  assert.equal(fallback.department, "General");
  assert.equal(fallback.label, "Syllabus document");
});

/* ── Mentoring ──────────────────────────────────────────────────────────── */

test("mentoring fills only missing teacher and room, never printed facts", () => {
  const profile = { mentor: "DR MENTOR", mentorVenue: "LH-101", section: "CEA", subsection: "CEA1" };

  const blank = applyMentoringOverride(
    { subject: MENTORING_SUBJECT, teacher: "Teacher not listed", room: "Room not listed" },
    profile
  );
  assert.equal(blank.teacher, "DR MENTOR");
  assert.equal(blank.room, "LH-101");
  assert.equal(blank.mentoringOverlay, true);

  const printed = applyMentoringOverride(
    { subject: MENTORING_SUBJECT, teacher: "PROF PRINTED", room: "R-204" },
    profile
  );
  assert.equal(printed.teacher, "PROF PRINTED");
  assert.equal(printed.room, "R-204");
  assert.equal(printed.mentoringOverlay, undefined);

  const other = applyMentoringOverride({ subject: "PHYSICS", teacher: "Teacher not listed", room: "Room not listed" }, profile);
  assert.equal(other.teacher, "Teacher not listed");
  assert.equal(other.room, "Room not listed");

  assert.equal(profileAppliesToSelection(profile, "CEA", "CEA1"), true);
  assert.equal(profileAppliesToSelection(profile, "CEB", "CEA1"), false);
  assert.equal(profileAppliesToSelection(profile, "CEA", "CEA2"), false);
  assert.equal(profileAppliesToSelection({ mentor: "x" }, "CEA", "CEA1"), false);

  const entries = applyMentoringOverrides([
    { subject: MENTORING_SUBJECT, teacher: "Teacher not listed", room: "Room not listed" },
    { subject: "MATH", teacher: "Teacher not listed", room: "Room not listed" }
  ], profile);
  assert.equal(entries[0].teacher, "DR MENTOR");
  assert.equal(entries[1].teacher, "Teacher not listed");
});

/* ── Content store ──────────────────────────────────────────────────────── */

test("content store validates, versions and restores each collection", async () => {
  const e = env();
  const created = await upsertItem(e, "notices", {
    id: "notice-1",
    title: "Official notice",
    url: "https://gndec.ac.in/notice",
    date: "2026-11-09",
    category: "Examination"
  });
  assert.equal(created.id, "notice-1");
  assert.equal(created.published, true);
  assert.equal(created.author, "Compass admin");

  const updated = await upsertItem(e, "notices", { ...created, title: "Revised notice" });
  assert.equal(updated.title, "Revised notice");
  assert.equal(updated.createdAt, created.createdAt);

  const restored = await restorePrevious(e, "notices");
  assert.equal(restored.restored, 1);
  const rows = (await readAll(e)).collections.notices;
  assert.equal(rows[0].title, "Official notice");

  const all = await readAll(e);
  assert.equal(all.configured, true);
  assert.equal(all.meta.revision, 2);
  assert.ok((await readAudit(e)).length >= 2);

  await assert.rejects(() => upsertItem(e, "notices", { title: "No source" }), /official link or body text/);
  await assert.rejects(() => upsertItem(e, "notices", { title: "Bad link", url: "http://insecure.test/x" }), /https/);
  await assert.rejects(() => upsertItem(e, "papers", { url: "http://gndec.ac.in/a.pdf" }), /https/);
  await assert.rejects(() => upsertItem(e, "unknown", {}), /Unknown content collection/);
  await assert.rejects(() => deleteItem(e, "notices", "missing"), /does not exist/);
});

test("holiday, paper, syllabus and announcement validation is bounded and explicit", async () => {
  const e = env();
  const holiday = await upsertItem(e, "holidays", { date: "2026-11-10", name: "Working Saturday", type: "working" });
  assert.equal(holiday.type, "working");
  assert.equal(holiday.off, false);
  const half = await upsertItem(e, "holidays", { date: "2026-11-11", name: "Half day", type: "half-day" });
  assert.equal(half.type, "half-day");
  await assert.rejects(() => upsertItem(e, "holidays", { name: "No date" }), /date/);

  const paper = await upsertItem(e, "papers", {
    url: "https://it.gndec.ac.in/sqb/a.pdf", subject: "Networks", code: "PCIT-301", department: "Information Technology"
  });
  assert.equal(paper.type, "question-bank");
  await assert.rejects(() => upsertItem(e, "papers", { url: "http://it.gndec.ac.in/sqb/a.pdf" }), /https/);

  const doc = await upsertItem(e, "syllabus", { url: "https://gndec.ac.in/syllabus.pdf", label: "B.Tech syllabus" });
  assert.equal(doc.label, "B.Tech syllabus");

  await upsertItem(e, "announcements", {
    title: "Live now", body: "Message", level: "warning", expiresAt: "2026-12-01"
  });
  await upsertItem(e, "announcements", {
    title: "Expired", body: "Old", expiresAt: "2026-01-01"
  });
  const payload = publicPayload(await readAll(e), "2026-11-09T10:00:00Z");
  assert.equal(payload.announcements.length, 1);
  assert.equal(payload.announcements[0].title, "Live now");
  assert.equal(payload.papers.length, 1);
  assert.equal(payload.holidays.length, 2);
});

test("owner and editor auth resolve without leaking hashes", async () => {
  const e = env();
  assert.deepEqual(await authorize(e, request("/api/admin/session")), { ok: false, role: "", actor: "" });
  assert.equal((await authorize(e, request("/api/admin/session", { token: OWNER }))).role, "owner");

  const editors = await addEditor(e, { name: "Friend", token: EDITOR });
  assert.equal(editors.length, 1);
  assert.equal(editors[0].name, "Friend");
  assert.equal(editors[0].hash, undefined, "the hash is never exposed");

  const editor = await authorize(e, request("/api/admin/session", { token: EDITOR }));
  assert.equal(editor.role, "editor");
  assert.equal(editor.actor, "Friend");
  assert.equal((await authorize(e, request("/api/admin/session", { token: "wrong-token-000000" }))).ok, false);

  await assert.rejects(() => addEditor(e, { name: "Short", token: "short" }), /at least 16/);
  await assert.rejects(() => addEditor(e, { name: "Friend", token: EDITOR }), /already exists/);
  const afterRemove = await removeEditor(e, { name: "Friend" });
  assert.equal(afterRemove.length, 0);
  assert.equal((await authorize(e, request("/api/admin/session", { token: EDITOR }))).ok, false);
});

test("uploaded files are typed, size-checked and served back unchanged", async () => {
  const e = env();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const file = await putFile(e, { bytes, type: "image/png", name: "notice.png" });
  assert.match(file.url, /^\/api\/content\/file\//);
  assert.equal(file.size, bytes.length);

  const read = await getFile(e, file.id);
  assert.equal(read.type, "image/png");
  assert.equal(read.name, "notice.png");
  assert.deepEqual([...new Uint8Array(read.bytes)], [...bytes]);

  await assert.rejects(() => putFile(e, { bytes, type: "text/html", name: "x.html" }), /PNG, JPEG/);
  await assert.rejects(() => putFile(e, { bytes: new Uint8Array(), type: "image/png" }), /empty/);
  await assert.rejects(
    () => putFile(e, { bytes: new Uint8Array(1_600_001), type: "image/png", name: "big.png" }),
    /larger than 1\.5 MB/
  );
  assert.equal(await getFile(e, "../../etc/passwd"), null);
});

/* ── Worker routes ───────────────────────────────────────────────────────── */

test("public content is read-only and unauthenticated admin writes are rejected", async () => {
  const e = env();
  const publicRes = await handleRequest(request("/api/content"), e, ctx());
  assert.equal(publicRes.status, 200);
  const payload = await publicRes.json();
  assert.equal(payload.configured, true);
  assert.deepEqual(payload.notices, []);

  const denied = await handleRequest(request("/api/admin/content"), e, ctx());
  assert.equal(denied.status, 401);
  assert.match((await denied.json()).error, /token/i);

  const session = await handleRequest(request("/api/admin/session", { token: OWNER }), e, ctx());
  assert.equal(session.status, 200);
  const who = await session.json();
  assert.equal(who.role, "owner");
  assert.equal(who.store, true);
});

test("the admin API publishes, hides and restores content that the public API reflects", async () => {
  const e = env();
  const create = await handleRequest(jsonRequest("/api/admin/content", {
    action: "upsert",
    collection: "notices",
    item: { id: "n1", title: "Date sheet", url: "https://gndec.ac.in/datesheet.pdf", date: "2026-11-09" }
  }), e, ctx());
  assert.equal(create.status, 200);
  const created = (await create.json()).item;
  assert.equal(created.id, "n1");

  let publicRes = await handleRequest(request("/api/content"), e, ctx());
  assert.equal((await publicRes.json()).notices.length, 1);

  const unpublish = await handleRequest(jsonRequest("/api/admin/content", {
    action: "upsert",
    collection: "notices",
    item: { ...created, published: false }
  }), e, ctx());
  assert.equal(unpublish.status, 200);
  publicRes = await handleRequest(request("/api/content"), e, ctx());
  assert.equal((await publicRes.json()).notices.length, 0, "draft items never reach the public payload");

  const remove = await handleRequest(jsonRequest("/api/admin/content", {
    action: "delete", collection: "notices", id: "n1"
  }), e, ctx());
  assert.equal(remove.status, 200);

  const restore = await handleRequest(jsonRequest("/api/admin/content", {
    action: "restore", collection: "notices"
  }), e, ctx());
  assert.equal(restore.status, 200);

  const adminGet = await handleRequest(request("/api/admin/content", { token: OWNER }), e, ctx());
  const all = await adminGet.json();
  assert.equal(all.role, "owner");
  assert.equal(all.collections.notices.length, 1);
  assert.ok(Array.isArray(all.audit) && all.audit.length >= 2);
});

test("editor tokens work through the Worker and cannot manage editors", async () => {
  const e = env();
  const add = await handleRequest(jsonRequest("/api/admin/editors", { name: "Friend", token: EDITOR }), e, ctx());
  assert.equal(add.status, 200);

  const session = await handleRequest(request("/api/admin/session", { token: EDITOR }), e, ctx());
  assert.equal((await session.json()).role, "editor");

  const write = await handleRequest(jsonRequest("/api/admin/content", {
    action: "upsert",
    collection: "links",
    item: { label: "Exam page", url: "https://gndec.ac.in/exam" }
  }, EDITOR), e, ctx());
  assert.equal(write.status, 200);

  const forbidden = await handleRequest(request("/api/admin/editors", { token: EDITOR }), e, ctx());
  assert.equal(forbidden.status, 403);

  const wrongStore = env({ CONTENT: undefined });
  const noStore = await handleRequest(request("/api/admin/content", { token: OWNER }), wrongStore, ctx());
  assert.equal(noStore.status, 200);
  const body = await noStore.json();
  assert.equal(body.configured, false);
});

test("admin uploads are served from the same Worker origin", async () => {
  const e = env();
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const upload = await handleRequest(request("/api/admin/upload?name=notice.png", {
    method: "POST",
    token: OWNER,
    headers: { "Content-Type": "image/png" },
    body: png
  }), e, ctx());
  assert.equal(upload.status, 200);
  const file = await upload.json();
  assert.match(file.url, /^\/api\/content\/file\//);

  const served = await handleRequest(request(file.url), e, ctx());
  assert.equal(served.status, 200);
  assert.equal(served.headers.get("Content-Type"), "image/png");
  assert.equal(served.headers.get("Access-Control-Allow-Origin"), null);
  assert.deepEqual([...new Uint8Array(await served.arrayBuffer())], [...png]);

  const rejected = await handleRequest(request("/api/admin/upload?name=x.html", {
    method: "POST",
    token: OWNER,
    headers: { "Content-Type": "text/html" },
    body: "<script>alert(1)</script>"
  }), e, ctx());
  assert.equal(rejected.status, 415);
});
