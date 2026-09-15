import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

function fixture() {
  const harness = createAppHarness();
  harness.api.state.nowOverride = "2026-09-14T04:00:00Z";
  harness.api.state.metadata = { version: "07-09-2026" };
  return harness;
}

test("generated date-span questions verify every returned date, subject and selected cohort", () => {
  const { api } = fixture();
  let checked = 0;
  const transforms = [q => q, q => q.toUpperCase(), q => `please ${q}`, q => q.replaceAll(" ", "   ")];
  for (const mode of ["legacy", "v12", "v2", "v22"]) {
    api.state.settings.brainMode = mode;
    for (const [scope, firstDate] of [["this week", "2026-09-14"], ["next week", "2026-09-21"], ["from 14 September to 20 September", "2026-09-14"]]) {
      for (const target of ["my", "ECB1", "ECB"]) for (const noun of ["timetable", "schedule"]) for (const transform of transforms) {
        api.resetBrainConversation();
        const query = transform(`${target} ${noun} ${scope}`);
        const answer = api.answerWithoutAi(query);
        const actualDates = [...answer.matchAll(/<li><strong>(\d{4}-\d{2}-\d{2})/g)].map((match) => match[1]);
        assert.equal(actualDates.length, 8, query);
        const monday = new Date(`${firstDate}T00:00:00Z`);
        const expectedDates = [0, 0, 0, 1, 1, 2, 3, 4].map((offset) => new Date(monday.valueOf() + offset * 86400000).toISOString().slice(0, 10));
        assert.deepEqual(actualDates, expectedDates, query);
        assert.match(answer, /MATH I/);
        assert.match(answer, /ECONOMICS/);
        assert.match(answer, /weekly pattern/);
        assert.doesNotMatch(answer, /Next class:|No verified student/);
        assert.equal(api.state.selectedSubgroup, "ECB1");
        checked++;
      }
    }
  }
  assert.equal(checked, 288);
});

test("counts and ranking return exact values, ties and selected scope across all modes", () => {
  const { api } = fixture();
  for (const mode of ["legacy", "v12", "v2", "v22"]) {
    api.state.settings.brainMode = mode;
    for (const question of ["how many classes do I have this week", "mera this week kitne lectures", "count my classes this week"]) {
      assert.match(api.answerWithoutAi(question), /8 scheduled class entries/);
      assert.match(api.answerWithoutAi(question), /540 minutes/);
    }
    assert.match(api.answerWithoutAi("who teaches me the most classes"), /Highest class count:<\/strong> SUKHMINDER SINGH/);
    assert.match(api.answerWithoutAi("which room do I visit most"), /Highest class count:<\/strong> A9/);
    assert.match(api.answerWithoutAi("which room do I have most classes in"), /Highest class count:<\/strong> A9/);
    assert.match(api.answerWithoutAi("which day is my lightest this week"), /Wednesday \(2026-09-16\), Friday \(2026-09-18\)/);
    assert.match(api.answerWithoutAi("my busiest day"), /Highest occupied time:<\/strong> Monday/);
  }
});

test("date comparison is one task and actually compares matching events and changed rooms", () => {
  const { api } = fixture();
  const monday = api.state.schedule.find(row => row.id === "mon-math");
  api.state.schedule.push({ ...monday, id: "common", day: "Tuesday" });
  api.buildScheduleIndex();
  const query = "what is different between today and tomorrow timetable";
  assert.equal(api.compassQueryPlan(query).clauses.length, 1);
  const answer = api.answerWithoutAi(query);
  assert.match(answer, /1 identical classes/);
  assert.match(answer, /Only on 2026-09-14/);
  assert.match(answer, /Only on 2026-09-15/);
  assert.match(answer, /CHEMISTRY/);
  assert.doesNotMatch(answer, /No saved timetable change comparison/);
  api.state.schedule.at(-1).room = "OTHER ROOM";
  api.buildScheduleIndex();
  assert.match(api.answerWithoutAi(query), /0 identical classes/);
});

test("range boundaries, malformed dates, historical coverage and parallel rows stay correct", () => {
  const { api, context } = fixture();
  const kernel = context.CompassBrainKernel;
  const dates = kernel.resolveTemporalQuery("timetable from 30 December 2026 to 2 January 2027", "2026-09-14").dates;
  assert.deepEqual(Array.from(dates), ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  for (const query of ["my timetable from 16 September to 14 September", "my timetable from 1 September to 31 December", "my timetable from 31 February to 4 March"]) assert.match(api.answerWithoutAi(query), /check the date/);
  assert.match(api.answerWithoutAi("my timetable last week"), /2026-09-07/);
  assert.match(api.answerWithoutAi("my timetable from 1 September to 8 September"), /cannot verify an earlier/);
  const service = context.CompassScheduleAnalysis;
  const rows = [{ subject: "LAB", teacher: "X", room: "A", day: "Monday", start: 570, end: 690 }, { subject: "THEORY", teacher: "Y", room: "B", day: "Monday", start: 630, end: 750 }];
  const result = service.execute({ operation: "count" }, { rows, dates: ["2026-09-14"] });
  assert.equal(result.count, 2);
  assert.equal(result.minutes, 180, "Overlapping time is not double counted");
  assert.ok(service.execute({ operation: "count" }, { rows: [{ ...rows[0], end: NaN }], dates: ["2026-09-14"] }).error);
  assert.ok(service.execute({ operation: "count" }, { rows, dates: ["2026-02-31"] }).error);
  assert.match(api.answerWithoutAi("my timetable next week after 14:30"), /could not verify that time filter/);
});

test("subject filters and official teacher/room views never use an unrelated personal schedule", () => {
  const { api } = fixture();
  assert.equal((api.answerWithoutAi("maths timetable this week").match(/<li><strong>/g) || []).length, 2);
  assert.doesNotMatch(api.answerWithoutAi("history timetable this week"), /MATH I|ECONOMICS/);
  assert.doesNotMatch(api.answerWithoutAi("Aman next week timetable"), /MATH I|ECONOMICS/);
  for (const [view, query, caption] of [["teachers", "teacher timetable DR ARVIND GUPTA next week", "DR ARVIND GUPTA"], ["rooms", "room A9 timetable next week", "A9"], ["groups", "section ECB timetable next week", "ECB"], ["subgroups", "subsection ECB1 timetable next week", "ECB1"], ["subjects", "subject PHYSICS timetable next week", "PHYSICS"], ["years", "programme FIRST YEAR timetable next week", "FIRST YEAR"]]) {
    api.state.timetableViews.set(view, { schedule: [{ group: caption, subject: "TARGET ONLY", teacher: "DR ARVIND GUPTA", room: "A9", day: "Wednesday", start: 660, end: 720 }] });
    const answer = api.answerWithoutAi(query);
    assert.match(answer, /TARGET ONLY/);
    assert.doesNotMatch(answer, /MATH I|ECONOMICS/);
  }
});

test("broken day-only questions and four independent tasks preserve all answers", () => {
  const { api } = fixture();
  for (const query of ["aaj kya kya hai", "ajj kehdi aa", "today?", "kal kya hai"]) {
    const answer = api.answerWithoutAi(query);
    assert.match(answer, /MATH I/);
    assert.doesNotMatch(answer, /No verified student|for Kya|for Kehdi/);
  }
  const combined = api.answerWithoutAi("my timetable next week; how many classes this week; who created this website; my exam date sheet");
  assert.equal((combined.match(/<section>/g) || []).length, 4);
  for (const expected of [/2026-09-21/, /8 scheduled class entries/, /Kaushik Jain/, /MSE-I/]) assert.match(combined, expected);
  assert.doesNotMatch(combined, /\bkkj\b|admin|unlock|token/i);
});

test("academic calendar separates cohorts, MSE sittings and revised or missing periods", () => {
  const { api, context } = fixture();
  const first = api.answerWithoutAi("when are first year final exams");
  assert.match(first, /2026-12-02 onwards/);
  assert.doesNotMatch(first, /2026-11-27 onwards/);
  const continuing = api.answerWithoutAi("second year end semester exams");
  assert.match(continuing, /2026-11-27 onwards/);
  assert.match(api.answerWithoutAi("when are my final exams"), /First year.*Second year/s);
  assert.match(api.answerWithoutAi("my MSE-I date sheet"), /2026-09-14/);
  assert.match(api.answerWithoutAi("winter vacation dates"), /does not publish vacation dates/);
  assert.match(api.answerWithoutAi("academic calendar 2027"), /another session/);
  api.state.sourceRegistry = { academicCalendarSource: { ...context.CompassAcademicCalendar.source, verified: true, contentHash: "new-revision" } };
  const revised = api.answerWithoutAi("first year end semester exams");
  assert.match(revised, /different academic calendar/);
  assert.doesNotMatch(revised, /2026-12-02/);
});
