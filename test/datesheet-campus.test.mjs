import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCsv,
  parseSheetDate,
  parseSpreadsheetTabs,
  parseSemesterHeader,
  parseSessionWindows,
  parseEseCsv,
  KNOWN_ESE_TABS
} from "../src/datesheet.js";
import {
  parseNoticeboard,
  parseHodFromDepartmentPage,
  parseFacultyHead,
  parseSyllabusLinks
} from "../src/campus.js";

test("datesheet CSV parser keeps quoted cells and blank rows stable", () => {
  const rows = parseCsv('"Department: Applied Sciences"\n\nDate/Semester,I(Chemistry Group)E\n4.12.2026,"Mathematics 1"\n');
  assert.deepEqual(rows[0], ["Department: Applied Sciences"]);
  assert.deepEqual(rows[1], [""]);
  assert.deepEqual(rows[3], ["4.12.2026", "Mathematics 1"]);
});

test("datesheet date and session parsing handles Indian day-first dates and noon", () => {
  assert.equal(parseSheetDate("4.12.2026"), "2026-12-04");
  assert.equal(parseSheetDate("24-12-2026"), "2026-12-24");
  assert.equal(parseSheetDate("not a date"), "");
  assert.deepEqual(parseSemesterHeader("I(Chemistry Group)E"), {
    semester: "I", semesterNumber: 1, qualifier: "Chemistry Group", sessionCode: "E", label: "I(Chemistry Group)E"
  });
  const { windows } = parseSessionWindows([
    ["Date/Semester", "I(Chemistry Group)E", "I(Physics Group)E"],
    ["Sessions", "9:00-12:00(Morning)", "1:00-4:00(Evening)"]
  ], 0);
  assert.deepEqual(windows.map((window) => [window.label.toLowerCase(), window.start, window.end]), [
    ["morning", 540, 720],
    ["evening", 780, 960]
  ]);
});

test("Applied Sciences ESE entries stay session-neutral instead of guessing a sitting", () => {
  const csv = [
    "Department: Applied Sciences",
    "Semester / Session",
    "Date/Semester,I(Chemistry Group)E,I(Physics Group)E",
    "4.12.2026,Mathematics 1,Mathematics 1",
    "8.12.2026,Chemistry,Physics",
    "Sessions,9-00-12:00(Morning),1-00-4:00(Evening)"
  ].join("\n");
  const parsed = parseEseCsv(csv, { id: "applied-sciences", label: "Applied Sciences", gid: "927569471" });
  assert.equal(parsed.department, "Applied Sciences");
  assert.equal(parsed.entries.length, 4);
  assert.ok(parsed.entries.every((entry) => entry.session === "" && entry.sessionStart === null));
  assert.match(parsed.sessionNote, /does not guess a session/);
  assert.equal(parsed.sessionAssignmentReliable, false);
});

test("spreadsheet tab discovery handles gid before initialSheet and known tabs stay unique", () => {
  const html = `<script>items.push({name: "Applied Sciences", pageUrl: "x", gid: "111", initialSheet: true});items.push({name: "CE", pageUrl: "y", gid: "222"});</script>`;
  const tabs = parseSpreadsheetTabs(html);
  assert.deepEqual(tabs, [
    { id: "applied-sciences", label: "Applied Sciences", gid: "111" },
    { id: "ce", label: "CE", gid: "222" }
  ]);
  assert.equal(new Set(KNOWN_ESE_TABS.map((tab) => tab.gid)).size, KNOWN_ESE_TABS.length);
  assert.equal(KNOWN_ESE_TABS.length, 18);
});

test("noticeboard parser keeps only dated official notice links", () => {
  const html = `
    <div><p>Admin November 6, 2026</p><a href="/noticeboard/tentative-date-sheet">Tentative date sheet for end-semester examinations</a></div>
    ${"<p>filler</p>".repeat(100)}
    <div><a href="/noticeboard/undated-item">Undated item</a></div>
    <div><p>COE</p><p>03/11/2026</p><a href="/noticeboard/hod-minutes">Minutes of HOD meeting</a></div>`;
  const notices = parseNoticeboard(html);
  assert.equal(notices.length, 2);
  assert.equal(notices[0].title, "Tentative date sheet for end-semester examinations");
  assert.equal(notices[0].publishedAt, "2026-11-06");
  assert.equal(notices[0].author, "Admin");
  assert.equal(notices[0].category, "Examination");
  assert.match(notices[0].url, /^https:\/\/erp\.gndec\.ac\.in\/noticeboard\//);
});

test("department HOD parsers accept an explicit statement and a faculty table head row", () => {
  const page = `<p>Dr. Harvinder Singh is Head of Department, Civil Engineering.</p><p>Phone: 0161-5064501</p><a href="mailto:hod_ce@gndec.ac.in">Email</a>`;
  assert.deepEqual(parseHodFromDepartmentPage(page), { name: "Dr. Harvinder Singh", email: "hod_ce@gndec.ac.in", phone: "0161-5064501" });
  const table = `<table><tr><td>Dr. Kiran Jyoti</td><td>Head</td><td>hod_cse@gndec.ac.in</td><td>0161-5064502</td></tr></table>`;
  assert.deepEqual(parseFacultyHead(table), { name: "Dr. Kiran Jyoti", email: "hod_cse@gndec.ac.in", phone: "0161-5064502" });
});

test("syllabus discovery keeps only official syllabus documents and preserves provenance", () => {
  const department = { id: "cse", short: "CSE", name: "Computer Science & Engg." };
  const html = `
    <a href="/sites/default/files/btech-cse-syllabus.pdf">B.Tech CSE Syllabus</a>
    <a href="https://example.com/random.pdf">Random PDF</a>
    <a href="/contact">Contact</a>`;
  const documents = parseSyllabusLinks(html, "https://cse.gndec.ac.in/academics", department);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].label, "B.Tech CSE Syllabus");
  assert.equal(documents[0].url, "https://cse.gndec.ac.in/sites/default/files/btech-cse-syllabus.pdf");
  assert.equal(documents[0].sourcePage, "https://cse.gndec.ac.in/academics");
  assert.equal(documents[0].external, false);
});

test("Ask Compass chat resolves datesheet and campus facts before the academic calendar", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const start = source.indexOf('$("question-form").addEventListener("submit"');
  const end = source.indexOf('const clearChat = $("clear-chat")');
  assert.ok(start > 0 && end > start, "The chat submit handler must be present");
  const handler = source.slice(start, end);
  const datesheetAt = handler.indexOf("CompassEseDatesheet?.matches");
  const campusAt = handler.indexOf("CompassCampus?.matches");
  const calendarAt = handler.indexOf("academicCalendarAnswer(question)");
  assert.ok(datesheetAt > 0, "The chat handler must resolve the ESE datesheet");
  assert.ok(campusAt > 0, "The chat handler must resolve campus facts");
  assert.ok(calendarAt > 0, "The chat handler still uses the academic calendar");
  assert.ok(datesheetAt < calendarAt, "A datesheet question must not be answered as the academic calendar");
  assert.ok(campusAt < calendarAt, "Campus facts must be resolved before the academic calendar");
  assert.match(handler.slice(datesheetAt, campusAt), /CompassEseDatesheet\.load\(\)/);
  assert.match(handler.slice(campusAt, calendarAt), /CompassCampus\.load\(\)/);
});

test("campus chat matches qualified notice requests without stealing subject syllabus questions", async () => {
  const { readFile } = await import("node:fs/promises");
  const vm = await import("node:vm");
  const source = await readFile(new URL("../public/campus.js", import.meta.url), "utf8");
  const context = vm.createContext({ console });
  vm.runInContext(source, context);
  const campus = context.CompassCampus;
  assert.equal(campus.matches("latest GNDEC notices"), true);
  assert.equal(campus.matches("recent college circulars"), true);
  assert.equal(campus.matches("noticeboard"), true);
  assert.equal(campus.matches("physics syllabus"), false);
  assert.equal(campus.matches("CSE syllabus pdf"), true);
});

test("syllabus discovery accepts camelCase and underscore-joined official file names", () => {
  const department = { id: "cse", short: "CSE", name: "Computer Science & Engineering" };
  const html = `
    <a href="/sites/default/files/MinorDegreeSyllabus.pdf">Minor Degree</a>
    <a href="/sites/default/files/PG-Diploma_in_ML_and_AI__Scheme_and_Syllabus.pdf">PG Diploma</a>`;
  const documents = parseSyllabusLinks(html, "https://cse.gndec.ac.in/?q=node/2", department);
  assert.equal(documents.length, 2);
  assert.ok(documents.every((document) => document.departmentId === "cse"));
});
