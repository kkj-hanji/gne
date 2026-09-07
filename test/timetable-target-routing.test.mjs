import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

function fixture() {
  const harness = createAppHarness();
  const { api } = harness;
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  api.state.nowOverride = "2026-09-07T04:00:00Z";
  api.state.queryConversation = null;
  const teachers = ["DR. CHAHAT JAIN", "Ms. SHREYA", "DR D S PATHANIA", "ER. HARMINDER KAUR AULAKH (EC)"];
  const rooms = ["F113", "F1130", "A9 (AUTOMOBILE BLOCK)", "COMP LAB MBA"];
  for (const [id, captions] of [["teachers", teachers], ["rooms", rooms]]) {
    const schedule = captions.flatMap((group, i) => days.map((day, d) => ({
      id: `${id}-${i}-${d}`, group, day, start: 570 + d * 60, end: 630 + d * 60,
      subject: `COURSE ${id.toUpperCase()} ${i} ${d}`, teacher: teachers[i], room: rooms[i], type: "L", cohorts: "ECB1"
    })));
    api.state.timetableViews.set(id, { revision: "fixture", schedule });
  }
  api.state.schedule.push(...days.map((day, d) => ({ id: `student-${d}`, group: "CSA", day, start: 570, end: 630, subject: "STUDENT ONLY COURSE", teacher: "ANOTHER TEACHER", room: "G6", type: "L", cohorts: "CSA2" })));
  api.state.rosterCache = { records: [{ name: "CHAHAT JAIN", section: "CSA", subsection: "CSA2", branch: "CS" }] };
  api.state.sourceRegistry = { sources: ["teachers", "rooms"].map(id => ({ id, contentHash: "fixture", url: `https://appsc.gndec.ac.in/${id}.html` })) };
  api.buildScheduleIndex();
  return { ...harness, teachers, rooms, days };
}

test("faculty and room variants return only the requested entity and weekday rows", () => {
  const { api, teachers, rooms, days } = fixture();
  let checked = 0;
  for (const [view, captions] of [["teachers", teachers], ["rooms", rooms]]) {
    for (const [index, caption] of captions.entries()) {
      for (const [d, day] of days.entries()) {
        const type = view === "teachers" ? "teacher" : "room";
        for (const q of [
          `${type} timetable ${caption} ${day}`,
          `${type} ${caption} ${day} schedule`,
          `${day} ${type} timetable ${caption}`,
          `${type} ${caption} da ${day} da tt`,
          `  ${type.toUpperCase()}   timetable ${caption.toLowerCase()}   ${day.toUpperCase()}? `
        ]) {
          api.state.queryConversation = null;
          const answer = api.answerWithoutAi(q);
          assert.match(answer, new RegExp(`COURSE ${view.toUpperCase()} ${index} ${d}`), q);
          assert.equal((answer.match(/<br\s*\/>/g) || []).length, 1, q);
          assert.doesNotMatch(answer, /STUDENT ONLY COURSE|CSA2|undefined|NaN/, q);
          assert.equal(api.state.selectedSubgroup, "ECB1", q);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 200);
});

test("teacher names, initials, typos and missing surnames respect identity boundaries", () => {
  const { api } = fixture();
  for (const q of ["Chahat Jain sir kal tt", "Dr Chahaat Jain tomorrow timetable", "faculty timetable chahat jain", "teacher timetable D S Pathania"]) {
    const answer = api.answerWithoutAi(q);
    assert.match(answer, /COURSE TEACHERS/, q);
    assert.doesNotMatch(answer, /CSA2|STUDENT ONLY COURSE/, q);
  }
  for (const q of ["teacher timetable Chahat Verma", "teacher timetable D R Pathania", "room F112 timetable", "room F11300 timetable"]) {
    const answer = api.answerWithoutAi(q);
    assert.doesNotMatch(answer, /COURSE TEACHERS|COURSE ROOMS|STUDENT ONLY COURSE/, q);
  }
  assert.match(api.answerWithoutAi("Chahat Jain timetable"), /both a student and a faculty/);
  assert.match(api.answerWithoutAi("student Chahat Jain timetable"), /STUDENT ONLY COURSE/);
});

test("asynchronous faculty requests never fetch student rosters, even on failure", async () => {
  const { api, context } = fixture();
  const resolve = vm.runInContext("resolveNamedPersonTimetableAnswer", context);
  const calls = [];
  context.fetch = async url => { calls.push(String(url)); throw new Error("Offline fixture"); };
  assert.match(await resolve("Chahat Jain sir kal tt"), /COURSE TEACHERS 0 1/);
  assert.deepEqual(calls, []);
  api.state.timetableViews.delete("teachers");
  const answer = await resolve("Chahat Jain sir kal tt");
  assert.match(answer, /faculty timetable is unavailable/);
  assert.doesNotMatch(answer, /CSA2|STUDENT ONLY COURSE/);
  assert.deepEqual(calls, ["/api/timetable?source=teachers"]);
});

test("calendar wording cannot become a schedule query, including timezone boundaries", () => {
  const { api } = fixture();
  for (const q of ["today date", "today day", "what is today's date?", "date today", "aaj ki date kya hai", "tell me today day", "what day is tomorrow", "day 9 September 2026", "current time"]) {
    const plan = api.compassQueryPlan(q);
    assert.ok(plan.clauses.every(clause => !clause.question.includes("timetable")), q);
    const answer = api.answerWithoutAi(q);
    assert.match(answer, /India calendar date|Asia\/Kolkata time/, q);
    assert.doesNotMatch(answer, /COURSE|timetable/, q);
  }
  api.state.nowOverride = "2026-12-31T18:31:00Z";
  assert.match(api.answerWithoutAi("today date"), /Friday, 1 January 2027/);
  assert.match(api.answerWithoutAi("yesterday day"), /Thursday, 31 December 2026/);
});
