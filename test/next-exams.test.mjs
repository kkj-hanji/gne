import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { answerLocally, buildAnswerContext } from "../next/engine/answer.js";
import { dateForTimetableDay } from "../next/engine/datetime.js";
import { examDateSheetPeriod, examEventsForSelection, examsOnDate, groupExamDatesheetEvents, nextUpcomingExam } from "../next/engine/exams.js";
import ese2026 from "../next/data/ese-provisional-dec-2026.json" with { type: "json" };

const ese = {
  source: { url: "https://docs.google.com/spreadsheets/d/test/edit" },
  tabs: [{
    id: "applied-sciences", label: "Applied Sciences", gid: "123",
    entries: [
      { date: "2026-12-04", subject: "Mathematics 1", qualifier: "Chemistry Group", sessionStart: null, sessionEnd: null },
      { date: "2026-12-04", subject: "Mathematics 1", qualifier: "Physics Group", sessionStart: null, sessionEnd: null }
    ]
  }]
};

test("important exam countdown skips earlier practical workshops and keeps theory and ESE dates in date order", () => {
  const events = examEventsForSelection({ datesheet: ese, group: "MEB" });
  const important = events.filter((event) => !/workshop|practical|lab/i.test(`${event.category} ${event.title}`));
  assert.equal(nextUpcomingExam(important, { dateISO: "2026-11-10", minutes: 600 }).id, "mse2-phy-math");
  assert.equal(nextUpcomingExam(important, { dateISO: "2026-11-18", minutes: 600 }).id, "mse2-phy-math");
  assert.equal(nextUpcomingExam(events, { dateISO: "2026-11-18", minutes: 630 }).id, "mse2-phy-math");
  assert.equal(nextUpcomingExam(important, { dateISO: "2026-11-23", minutes: 555 }).id, "mse2-phy-pps");
  assert.equal(nextUpcomingExam(important, { dateISO: "2026-11-29", minutes: 1000 }).title, "Mathematics 1");
});

test("MSE-II exam day view contains only the selected section's published sittings", () => {
  const events = examEventsForSelection({ datesheet: ese, group: "CEA" });
  const workshopDay = examsOnDate(events, "2026-11-20");
  assert.deepEqual(workshopDay.map((event) => [event.title, event.start, event.end]), [
    ["MP (Workshop) · periods 3–4", 630, 750]
  ]);
  const edgDay = examsOnDate(events, "2026-11-28");
  assert.equal(edgDay.length, 1);
  assert.equal(edgDay[0].title, "EDG · Engineering Drawing");
  const chemistryDay = examsOnDate(examEventsForSelection({ group: "CSA" }), "2026-11-28");
  assert.deepEqual(chemistryDay.map((event) => event.title), ["BEEE"]);
});

test("Today date sheet starts three days early, stays active on gap days, and ends after the final paper", () => {
  const events = examEventsForSelection({ group: "CEA" }).filter((event) => !/workshop|practical|lab/i.test(`${event.category} ${event.title}`));
  assert.equal(examDateSheetPeriod(events, { dateISO: "2026-11-19", minutes: 600 }).active, false);
  const firstDay = examDateSheetPeriod(events, { dateISO: "2026-11-20", minutes: 600 });
  assert.equal(firstDay.active, true);
  assert.equal(firstDay.startDate, "2026-11-20");
  assert.equal(firstDay.exams.length, 5);
  const gapDay = examDateSheetPeriod(events, { dateISO: "2026-11-24", minutes: 600 });
  assert.equal(gapDay.active, true);
  assert.equal(gapDay.exams.some((event) => event.title === "PPS"), true);
  assert.equal(examDateSheetPeriod(events, { dateISO: "2026-11-28", minutes: 749 }).active, true);
  assert.equal(examDateSheetPeriod(events, { dateISO: "2026-11-28", minutes: 750 }).active, false);
});

test("Ask treats a published Monday paper as the day's schedule even when a lecture row conflicts", () => {
  const context = buildAnswerContext({
    group: "CEA",
    profile: { branch: "CE", section: "CEA" },
    now: { dateISO: "2026-11-22", day: "Sunday", minutes: 600, date: "22 Nov" },
    datesheet: { tabs: [] },
    schedule: [{ group: "CEA", day: "Monday", start: 570, end: 630, subject: "MATH I", room: "A9 (AUTOMOBILE BLOCK)", teacher: "SUKHMINDER SINGH", type: "lecture" }]
  });
  const answer = answerLocally("What is my first class Monday?", context);
  assert.equal(answer?.intent, "EXAM_DAY");
  assert.match(answer.html, /Mathematics-I/);
  assert.match(answer.html, /replaces the class timetable/);
  assert.doesNotMatch(answer.html, /A9|SUKHMINDER SINGH/);

  for (const question of ["Is MATH I on Monday?", "Any free periods Monday?"]) {
    const followUp = answerLocally(question, context);
    assert.equal(followUp?.intent, "EXAM_DAY", question);
    assert.match(followUp.html, /Mathematics-I/);
    assert.doesNotMatch(followUp.html, /A9|SUKHMINDER SINGH/);
  }
});

test("official ESE datesheet narrows chemistry and physics group rows by the selected section", () => {
  const chemistry = examEventsForSelection({ datesheet: ese, group: "CSA" }).filter((event) => event.category === "End-semester exam");
  const physics = examEventsForSelection({ datesheet: ese, group: "MEB" }).filter((event) => event.category === "End-semester exam");
  assert.deepEqual(chemistry.map((event) => event.title), ["Mathematics 1"]);
  assert.deepEqual(physics.map((event) => event.title), ["Mathematics 1"]);
  assert.match(chemistry[0].sourceUrl, /#gid=123$/);
  assert.equal(examEventsForSelection({ datesheet: ese, group: "ITC" }).filter((event) => event.category === "End-semester exam").length, 1);
});

test("official December 2026 ESE data covers every programme and uses the newest scheme per semester", () => {
  assert.equal(ese2026.status, "Provisional");
  assert.equal(ese2026.totals.programmes, 39);
  assert.equal(ese2026.programmes.length, 78, "Full Time and Part Time selections are both checked");
  assert.equal(ese2026.totals.sittings, 854);

  const cseFirst = examEventsForSelection({ datesheet: ese2026, group: "CSD", branch: "CSE", semester: "1" });
  const cseFirstEse = cseFirst.filter((event) => event.category === "Provisional ESE 2026");
  assert.ok(cseFirstEse.length > 0);
  assert.ok(cseFirstEse.every((event) => event.tab === "CSE" && event.semesterNumber === 1));
  assert.ok(cseFirstEse.every((event) => /2024/.test(event.schemeCode)), "older 2018 scheme rows must not replace the latest semester schedule");
  const cseSecond = examEventsForSelection({ datesheet: ese2026, group: "CSD", branch: "CSE", semester: "2" });
  assert.ok(cseSecond.filter((event) => event.category === "Provisional ESE 2026").length > 0);
  assert.ok(cseSecond.filter((event) => event.category === "Provisional ESE 2026").every((event) => event.semesterNumber === 2));

  const semesterWithoutYearEncodedInSection = examEventsForSelection({ datesheet: ese2026, group: "CSE", branch: "CSE", semester: "3" });
  assert.ok(semesterWithoutYearEncodedInSection.length > 0, "a selected branch and semester should work even when the section code does not encode an academic year");
  assert.ok(semesterWithoutYearEncodedInSection.every((event) => event.category === "Provisional ESE 2026" && event.semesterNumber === 3));

  const upperYear = examEventsForSelection({ datesheet: ese2026, group: "D2CSE1", branch: "CSE", semester: "3" });
  assert.ok(upperYear.length > 0);
  assert.ok(upperYear.every((event) => event.semesterNumber === 3 && event.tab === "CSE"));
  const partTime = examEventsForSelection({ datesheet: ese2026, group: "D2EE1", branch: "M.Tech Electrical Engineering", semester: "4" });
  assert.equal(partTime.length, 1);
  assert.equal(partTime[0].studyMode, "Part Time");
  assert.equal(partTime[0].title, "Power System Dynamics-II");
  assert.equal(partTime[0].sourceUrl, "https://academics.gndec.ac.in/datesheet/");

  const lateralEntry = examEventsForSelection({
    datesheet: ese2026,
    group: "D2CE1",
    branch: "B.Tech.(Civil Engineering - Lateral Entry (for Working Professional))",
    semester: "3"
  });
  assert.ok(lateralEntry.length > 0);
  assert.ok(lateralEntry.every((event) => event.tab === "CE-LE-WP" && event.semesterNumber === 3));
});

test("Today drops completed MSE papers while a later ESE date remains upcoming", () => {
  const events = [
    { id: "mse", category: "MSE-II theory", title: "Last MSE paper", date: "2026-11-28", start: 660, end: 750 },
    { id: "ese", category: "Provisional ESE 2026", title: "First ESE paper", date: "2026-12-07", start: 780, end: 960 }
  ];
  const period = examDateSheetPeriod(events, { dateISO: "2026-11-28", minutes: 751 });
  assert.equal(period.active, true);
  assert.deepEqual(period.today, []);
  assert.deepEqual(period.remaining.map((event) => event.id), ["ese"]);
});

test("combined datesheets show all MSE-II papers before a separately headed ESE sheet", () => {
  const mixed = groupExamDatesheetEvents([
    { category: "MSE-II theory", date: "2026-11-23", title: "First MSE-II paper" },
    { category: "End-semester exam", date: "2026-11-24", title: "ESE paper" },
    { category: "MSE-II theory", date: "2026-11-28", title: "Last MSE-II paper" }
  ]);
  assert.deepEqual(mixed.map((group) => group.label), ["MSE-II datesheet", "ESE datesheet"]);
  assert.deepEqual(mixed[0].events.map((event) => event.title), ["First MSE-II paper", "Last MSE-II paper"]);
  assert.deepEqual(mixed[1].events.map((event) => event.title), ["ESE paper"]);
});

test("weekday timetable tabs map to the upcoming India calendar date", () => {
  const sunday = { dateISO: "2026-11-22", day: "Sunday" };
  assert.equal(dateForTimetableDay("Monday", sunday), "2026-11-23");
  assert.equal(dateForTimetableDay("Sunday", sunday), "2026-11-22");
  assert.equal(dateForTimetableDay("Monday", { dateISO: "2026-11-24", day: "Tuesday" }), "2026-11-30");
  assert.equal(dateForTimetableDay("Funday", sunday), "");
  assert.equal(dateForTimetableDay("Monday", { dateISO: "2026-02-30", day: "Sunday" }), "");
});

test("Today exam datesheets stay separate from the regular lecture timetable", async () => {
  const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
  const exams = await readFile(new URL("../next/engine/exams.js", import.meta.url), "utf8");
  assert.match(app, /const period = examDateSheetPeriod\(importantExamEvents\(\), clock\)/);
  assert.match(app, /function importantExamEvents\(\)/);
  assert.match(exams, /if \(\/workshop\|practical\|lab\/\.test\(label\)\) return false/);
  const todayView = app.slice(app.indexOf("function renderToday()"), app.indexOf("function renderHero("));
  assert.match(todayView, /examMode\s*\n?\s*\? renderExamPeriodCard\(info\.period, info\)/);
  assert.match(app, /function renderExamDatesheetSections\(exams, seatEntries = \[\]\)/);
  assert.match(app, /function heroDateLabel\(info, clock\)/);
  assert.match(app, /examTimeLabel\(info\.primary, humanTime\)/);
  assert.match(app, /groupExamDatesheetEvents\(exams\)/);
  assert.match(exams, /MSE-II datesheet/);
  assert.match(exams, /ESE datesheet/);
  assert.match(app, /Exam datesheet/);
  assert.match(todayView, /examMode \? "" : `<div class="stat-grid">/);
  assert.match(app, /dateForTimetableDay, formatDuration/);
  const timetable = app.slice(app.indexOf("function renderTimetable()"), app.indexOf("function renderRooms()"));
  assert.match(timetable, /: renderDayView\(state\.day, clock\)/);
  assert.match(timetable, /const classes = classesForDay\(day\)/);
  assert.match(timetable, /const dayClasses = classesForDay\(day\)/);
  assert.doesNotMatch(timetable, /examsForDate|exam-timetable-day|agenda-exam-day|week-exam-cell/);
  const askFlow = app.slice(app.indexOf("async function sendQuestion("), app.indexOf("function updateChatHead("));
  assert.ok(askFlow.indexOf("answerLocally(question, ctx, previousMemory)") < askFlow.indexOf("runBrain(question, ctx)"), "verified local timetable answers must win over Brain lecture guesses");
  assert.match(askFlow, /memory: answer\.memory/);
  const notices = await readFile(new URL("../next/engine/notices.js", import.meta.url), "utf8");
  assert.match(notices, /mse2-workshops-2026-11/);
});
