import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { examEventsForSelection, examsOnDate, nextUpcomingExam } from "../next/engine/exams.js";

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

test("official ESE datesheet narrows chemistry and physics group rows by the selected section", () => {
  const chemistry = examEventsForSelection({ datesheet: ese, group: "CSA" }).filter((event) => event.category === "End-semester exam");
  const physics = examEventsForSelection({ datesheet: ese, group: "MEB" }).filter((event) => event.category === "End-semester exam");
  assert.deepEqual(chemistry.map((event) => event.title), ["Mathematics 1"]);
  assert.deepEqual(physics.map((event) => event.title), ["Mathematics 1"]);
  assert.match(chemistry[0].sourceUrl, /#gid=123$/);
  assert.equal(examEventsForSelection({ datesheet: ese, group: "ITC" }).filter((event) => event.category === "End-semester exam").length, 1);
});

test("only important theory/final date-sheets replace the timetable; workshops remain notice items", async () => {
  const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
  assert.match(app, /const examAgenda = examsForDate\(clock\.dateISO\)/);
  assert.match(app, /function importantExamEvents\(\)/);
  assert.match(app, /if \(\/workshop\|practical\|lab\/\.test\(label\)\) return false/);
  assert.match(app, /renderExamDayCard\(examAgenda, clock\.dateISO\)/);
  assert.match(app, /todayExamSittings\.length \? renderExamDayCard\(todayExamSittings, clock\.dateISO\)/);
  assert.match(app, /Today's exam date sheet/);
  const notices = await readFile(new URL("../next/engine/notices.js", import.meta.url), "utf8");
  assert.match(notices, /mse2-workshops-2026-11/);
});
