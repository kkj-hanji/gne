import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_NOTICES_KEY, OFFICIAL_NOTICES_URL, fetchOfficialNotices,
  officialNoticesResponse, parseOfficialNoticeDetail, parseOfficialNoticeIndex
} from "../src/official-notices.js";
import { examGroupForSection, examEventsForSelection } from "../next/engine/exams.js";
import { normalizeNotice } from "../next/engine/notices.js";
import datesheet from "../src/data/datesheet-seed.json" with { type: "json" };

test("official ERP notice parser accepts varied dated notice links and keeps each item's date", () => {
  const html = `
    <section><p>administrator November 12, 2026</p><p><img><a href="noticeboard/struck-off-notice-45-121126">Struck off notice 45</a></p><hr>
    <p>coe_office November 6, 2026</p><p><img><a href="noticeboard/exam-sheet-%E2%80%93-november-2026">Exam sheet – November 2026</a></p><hr>
    <p>Undated</p><a href="noticeboard/no-date">Undated notice</a></section>`;
  const records = parseOfficialNoticeIndex(html);
  assert.equal(records.length, 2);
  assert.equal(records[0].title, "Struck off notice 45");
  assert.equal(records[0].date, "2026-11-12");
  assert.equal(records[1].date, "2026-11-06");
  assert.equal(records[1].category, "Examination");
  assert.equal(records[0].url, "https://erp.gndec.ac.in/noticeboard/struck-off-notice-45-121126");
});

test("notice details keep official PDF and Google Sheet links, summarize safely, and never copy student records", () => {
  const notice = { id: "struck-off-45", title: "Struck_off_Notice 45_12.11.26", url: "https://erp.gndec.ac.in/noticeboard/struck-off-notice-45-121126", date: "2026-11-12" };
  const html = `<main><div class="page_content"><h1>NOTICE</h1><h3>${notice.title}</h3><p>Dear Students</p>
    <a href="https://erp.gndec.ac.in/files/Struck_off_Notice%2045_12.11.26.pdf">Struck_off_Notice 45_12.11.26</a>
    <a href="https://docs.google.com/spreadsheets/d/abc123/edit">View sheet</a>
    <a href="https://bad.example/student-list.pdf">unsafe external copy</a></div></main>`;
  const enriched = parseOfficialNoticeDetail(html, notice);
  assert.equal(enriched.attachments.length, 2);
  assert.equal(enriched.attachments[0].url, "https://erp.gndec.ac.in/files/Struck_off_Notice%2045_12.11.26.pdf");
  assert.match(enriched.attachments[0].label, /\.pdf$/i);
  assert.match(enriched.body, /does not copy those personal details/i);
  assert.match(enriched.privacyNote, /does not use your saved profile/i);
  assert.doesNotMatch(JSON.stringify(enriched), /2615116|Harjot Singh|father name/i);
});

test("notice import ignores a mismatched attachment number and finds a plain-text official sheet URL", () => {
  const struck = parseOfficialNoticeDetail(`<div class="page_content"><a href="/files/Struck_off_Notice_43.pdf">Struck-off notice PDF</a></div></main>`, {
    title: "Struck_off_Notice_44", url: "https://erp.gndec.ac.in/noticeboard/struck-off-notice-44", date: "2026-11-06"
  });
  assert.deepEqual(struck.attachments, []);
  const sheet = parseOfficialNoticeDetail(`<div class="page_content">Available at: https://docs.google.com/spreadsheets/d/1abc234/edit?usp=sharing</div></main>`, {
    title: "Tentative end semester date sheet", url: "https://erp.gndec.ac.in/noticeboard/exam-sheet", date: "2026-11-06"
  });
  assert.equal(sheet.attachments[0].url, "https://docs.google.com/spreadsheets/d/1abc234/edit");
});

test("official notice sync uses the current ERP list and retains the last good per-notice details", async () => {
  const calls = [];
  const html = `<div><p>administrator November 12, 2026</p><a href="noticeboard/struck-off-notice-45-121126">Struck_off_Notice 45</a><hr></div>`;
  const detail = `<div class="page_content"><h3>Struck_off_Notice 45</h3><a href="/files/Struck_off_Notice%2045.pdf">PDF</a></div></main>`;
  const result = await fetchOfficialNotices({ fetchImpl: async (url) => {
    calls.push(url);
    return new Response(url === OFFICIAL_NOTICES_URL ? html : detail, { headers: { "Content-Type": "text/html" } });
  } });
  assert.equal(result.notices[0].date, "2026-11-12");
  assert.equal(result.notices[0].attachments.length, 1);
  assert.equal(calls.length, 2);
});

test("official notice endpoint serves the bundled verified seed and schedules a stale refresh", async () => {
  const queued = [];
  const response = await officialNoticesResponse(new Request("https://next.test/api/official-notices"), {}, { waitUntil: (promise) => queued.push(promise) }, { refresh: async () => ({}) });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.notices[0].id, "struck-off-notice-45-121126");
  assert.equal(queued.length, 1);
  assert.equal(OFFICIAL_NOTICES_KEY, "gndec-next:official-notices:v1");
});

test("fresh official notices pin for two calendar dates only; manual pins remain explicit", () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const today = `${parts.find((part) => part.type === "year").value}-${parts.find((part) => part.type === "month").value}-${parts.find((part) => part.type === "day").value}`;
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * 86400000).toISOString().slice(0, 10);
  assert.equal(normalizeNotice({ title: "New notice", date: today }, "campus").pinned, true);
  assert.equal(normalizeNotice({ title: "New notice", date: yesterday }, "campus").pinned, true);
  assert.equal(normalizeNotice({ title: "Old notice", date: twoDaysAgo }, "campus").pinned, false);
  assert.equal(normalizeNotice({ title: "Manual notice", date: twoDaysAgo, pinned: true }, "admin").pinned, true);
});

test("profile section scopes the datesheet to the student's Chemistry or Physics group", () => {
  assert.equal(examGroupForSection("CSD"), "Chemistry group");
  assert.equal(examGroupForSection("ECB"), "Physics group");
  assert.equal(examGroupForSection("BCA1"), "");
  const chemistry = examEventsForSelection({ datesheet, group: "CSD" });
  const physics = examEventsForSelection({ datesheet, group: "ECB" });
  assert.ok(chemistry.every((exam) => !/physics group/i.test(`${exam.tab} ${exam.title}`)));
  assert.ok(physics.every((exam) => !/chemistry group/i.test(`${exam.tab} ${exam.title}`)));
});
