import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

function fixture() {
  const harness = createAppHarness();
  const { api } = harness;
  api.state.nowOverride = "2026-09-07T04:00:00Z"; // Monday, 09:30 IST.
  api.state.metadata = { version: "01-09-2026" };
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  api.state.schedule = ["ECB", "CSD", "RAI"].flatMap((group, g) => days.map((day, d) => ({
    id: `${group}-${day}`, group, cohorts: `${group}${group === "CSD" ? 2 : 1}`,
    day, start: 570 + g * 60, end: 630 + g * 60,
    subject: `${group} SUBJECT ${d}`, teacher: `TEACHER ${g}`, room: `A${9 + g}`
  })));
  api.state.groups = ["ECB", "CSD", "RAI"];
  api.state.allClasses = api.state.schedule;
  const faculty = ["Monday", "Tuesday", "Wednesday"].map((day, i) => ({
    id: `faculty-${i}`, group: "MOHITVEER SINGH", day, start: 570, end: 630,
    subject: `FACULTY SUBJECT ${i}`, teacher: "MOHITVEER SINGH", room: "A10"
  }));
  api.state.timetableViews.set("teachers", { schedule: faculty });
  api.state.timetableViews.set("rooms", { schedule: api.state.schedule.map(row => ({ ...row, group: row.room })) });
  api.buildScheduleIndex();
  return harness;
}

test("240 generated shorthand variants return the exact cohort, day, date and subject", () => {
  const { api } = fixture();
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  let count = 0;
  for (const code of ["ECB1", "CSD2", "RAI1"]) for (const [d, day] of days.entries()) {
    for (const phrase of [`${code} ${day}`, `${day} ${code} tt`, `${code} ka ${day} timetable`, `${day} nu ${code} di classes`]) {
      for (const query of [phrase, phrase.toLowerCase(), phrase.toUpperCase(), `please   ${phrase.replaceAll(" ", "   ")} ?`]) {
        api.resetBrainConversation();
        const answer = api.answerWithoutAi(query);
        assert.match(answer, new RegExp(code), query);
        assert.match(answer, new RegExp(day), query);
        assert.match(answer, new RegExp(`2026-09-${String(7 + d).padStart(2, "0")}`), query);
        assert.match(answer, new RegExp(`${code.slice(0, -1)} SUBJECT ${d}`), query);
        assert.doesNotMatch(answer, new RegExp(`SUBJECT ${(d + 1) % 5}`), query);
        count++;
      }
    }
  }
  assert.equal(count, 240);
});

test("calendar resolution rejects rollovers and contradictions and preserves India year boundaries", () => {
  const { api, context } = fixture();
  const kernel = context.CompassBrainKernel;
  for (const q of ["3 September", "September 3", "3rd September", "03/09/2026", "3-9-26", "timetable 03-09", "2026-09-03"]) {
    const result = kernel.resolveTemporalQuery(q, "2026-09-07");
    assert.equal(result.iso, "2026-09-03", q);
    assert.equal(result.day, "Thursday", q);
  }
  for (const q of ["31/02/2026", "31 April", "29 February 2026", "Monday 3 September 2026"]) {
    assert.match(api.answerWithoutAi(`my timetable ${q}`), /check the date|does not exist|does not match/, q);
  }
  assert.equal(kernel.resolveTemporalQuery("day before yesterday", "2027-01-01").iso, "2026-12-30");
  assert.equal(kernel.resolveTemporalQuery("next Monday", "2026-09-07").iso, "2026-09-14");
  assert.equal(kernel.resolveTemporalQuery("previous Monday", "2026-09-07").iso, "2026-08-31");
  assert.equal(kernel.resolveTemporalQuery("kal holiday thi", "2026-09-05").iso, "2026-09-04");
  api.state.nowOverride = "2026-12-31T18:35:00Z";
  assert.equal(api.requestedTimetableDate("today").iso, "2027-01-01");
  assert.equal(api.requestedTime("14:30"), 870);
  assert.equal(api.requestedTime("2:30 PM"), 870);
  assert.equal(api.requestedTime("24:30"), null);
  assert.equal(api.requestedTime("10:99"), null);
});

test("faculty spelling variants return the correct day, room, subject and unchanged selection", () => {
  const { api } = fixture();
  for (const query of ["Mohitveer Singh tomorrow", "mohitveeer kal tt", "mohitveer singh da kal timetable", "mohitveer sir tomorrow schedule"]) {
    const answer = api.answerWithoutAi(query);
    assert.match(answer, /MOHITVEER SINGH/);
    assert.match(answer, /Tuesday.*2026-09-08/);
    assert.match(answer, /FACULTY SUBJECT 1/);
    assert.match(answer, /A10/);
    assert.doesNotMatch(answer, /FACULTY SUBJECT 0/);
    assert.equal(api.state.selectedSubgroup, "ECB1");
  }
  api.state.timetableViews.get("teachers").schedule.push({ ...api.state.timetableViews.get("teachers").schedule[0], group: "MOHITVEER KAUR" });
  assert.match(api.answerWithoutAi("mohitveer tomorrow timetable"), /More than one faculty/);
});

test("compound faculty comparison and holiday preserve all dependent requests", () => {
  const { api } = fixture();
  const answer = api.answerWithoutAi("mohitveer sir ka kal ka tt aur mera compare krdo, kl chutti bhi hai kya");
  assert.equal((answer.match(/<section>/g) || []).length, 3);
  assert.match(answer, /Faculty timetable.*Tuesday.*2026-09-08/);
  assert.match(answer, /Compared: MOHITVEER SINGH and ECB1/);
  assert.match(answer, /FACULTY SUBJECT 1/);
  assert.match(answer, /ECB SUBJECT 1/);
  assert.match(answer, /September 8, 2026.*no gazetted holiday/);
  assert.doesNotMatch(answer, /regular college working day/);
  assert.equal(api.state.selectedSubgroup, "ECB1");
});

test("follow-ups retain verified target but explicit queries and profile changes take priority", () => {
  const { api } = fixture();
  api.answerWithoutAi("Mohitveer Singh timetable Monday");
  assert.match(api.answerWithoutAi("what about Wednesday"), /FACULTY SUBJECT 2/);
  assert.match(api.answerWithoutAi("CSD2 Tuesday"), /CSD SUBJECT 1/);
  assert.doesNotMatch(api.answerWithoutAi("my timetable Monday"), /FACULTY SUBJECT/);
  api.state.selectedGroup = "RAI";
  api.state.selectedSubgroup = "RAI1";
  assert.doesNotMatch(api.compassQueryPlan("Wednesday").clauses[0].question, /CSD2|MOHITVEER/);
});

test("room identifiers, source coverage, unknown codes, and planner bounds fail safely", () => {
  const { api, context } = fixture();
  assert.equal(context.CompassBrainKernel.normalize("room M1 timetable"), "room m1 timetable");
  assert.match(api.answerWithoutAi("A9 timetable tomorrow"), /A9.*Tuesday.*2026-09-08/);
  assert.match(api.answerWithoutAi("A9 timetable tomorrow"), /ECB SUBJECT 1/);
  assert.doesNotMatch(api.answerWithoutAi("ZZZ9 today"), /ECB SUBJECT/);
  assert.match(api.answerWithoutAi("holiday on 3 September 2027"), /do not have a verified.*2027/);
  assert.match(api.answerWithoutAi("Diwali holiday 2027"), /do not have a verified.*2027/);
  assert.ok(api.answerWithoutAi("").trim());
  assert.match(api.answerWithoutAi("ECB1 timetable 31 August 2026"), /cannot verify an earlier timetable/);
  assert.match(api.answerWithoutAi("today timetable; tomorrow timetable; physics credits; holiday; what can you do"), /up to four/);
  assert.match(api.answerWithoutAi("x".repeat(1201)), /shorten/);
  assert.equal(context.CompassBrainKernel.decomposeQuery("today timetable; explain quantum gravity").length, 2);
});

test("credits require structured course facts and named-course totals use exact arithmetic", () => {
  const { api } = fixture();
  assert.match(api.answerWithoutAi("physics credits"), /could not verify|not loaded/);
  api.state.syllabus = [{ code: "BSC101", title: "Physics", credits: "3.5" }, { code: "BSC102", title: "Physics Laboratory", credits: "1.5" }];
  const answer = api.answerWithoutAi("physics credits");
  assert.match(answer, /BSC101.*3.5 Credits/);
  assert.match(answer, /BSC102.*1.5 Credits/);
  assert.doesNotMatch(answer, /BTPH|~40/);
  assert.match(api.answerWithoutAi("total credits BSC101 BSC102"), /5 Credits/);
  assert.match(api.answerWithoutAi("my total credits"), /enrollment|course codes/);
});

test("comparisons retain parallel classes instead of overwriting a shared time slot", () => {
  const { api } = fixture();
  api.state.schedule = [
    { id: "left-a", group: "ECB", cohorts: "ECB1", day: "Monday", start: 570, end: 630, subject: "SHARED", teacher: "ONE", room: "A9" },
    { id: "left-b", group: "ECB", cohorts: "ECB1", day: "Monday", start: 570, end: 630, subject: "PARALLEL LAB", teacher: "TWO", room: "A10" },
    { id: "right-a", group: "CSD", cohorts: "CSD2", day: "Monday", start: 570, end: 630, subject: "SHARED", teacher: "ONE", room: "A9" }
  ];
  api.state.allClasses = api.state.schedule;
  api.buildScheduleIndex();
  const result = api.runCompassBrain("ECB1 vs CSD2 Monday");
  assert.equal(result.facts.shared, 1);
  assert.equal(result.facts.leftOnly, 1);
  assert.match(result.answer, /PARALLEL LAB/);
});

test("explicit comparison targets override previous named context", () => {
  const { api } = fixture();
  api.answerWithoutAi("Mohitveer Singh tomorrow");
  assert.match(api.answerWithoutAi("compare ECB1 CSD2 Tuesday"), /Compared: ECB1 and CSD2/);
  assert.match(api.answerWithoutAi("compare my timetable with RAI tomorrow"), /ECB1.*RAI|RAI.*ECB1/);
  api.answerWithoutAi("my timetable Tuesday");
  assert.match(api.answerWithoutAi("Wednesday"), /ECB SUBJECT 2/);
});

test("scoped public roster lists are bounded and omit student identifiers", () => {
  const { api } = fixture();
  api.state.rosterCache = { records: Array.from({ length: 25 }, (_, i) => ({ name: `Student ${i}`, section: "ECB", subsection: "ECB1", branch: "EC", crn: `PRIVATE-${i}`, registrationNo: `REGISTRATION-${i}` })) };
  const answer = api.answerWithoutAi("students in ECB1");
  assert.match(answer, /25 students/);
  assert.match(answer, /Showing the first 20/);
  assert.doesNotMatch(answer, /PRIVATE|REGISTRATION|Student 24/);
  api.state.rosterCache.unavailableBranches = ["EC"];
  assert.match(api.answerWithoutAi("students in ECB1"), /roster is unavailable/);
  assert.match(api.answerWithoutAi("who is in A9"), /room timetable cannot establish/);
});

test("creator answers never mention administration or access commands", () => {
  const { api } = fixture();
  for (const question of ["who built this website", "who created Ask Campass", "developer", "website creator"]) {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, /Kaushik Jain/);
    assert.match(answer, /ECE/);
    assert.doesNotMatch(answer, /admin|kkj|unlock|unlimited/i);
  }
});

test("FET subject, teacher and room captions supply only the field implied by the source view", () => {
  const { api } = fixture();
  const header = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(day => `<th class="xAxis">${day}</th>`).join("");
  const makeTable = (caption, body) => `<table><caption><span class="name">${caption}</span></caption><thead><tr>${header}</tr></thead><tbody><tr><th class="yAxis">08:30</th><td>${body}</td><td class="empty"></td><td class="empty"></td><td class="empty"></td><td class="empty"></td></tr></tbody></table>`;
  const subjectHtml = makeTable("PHYSICS", '<table class="detailed"><tr class="line0"><td><span class="activitytag">P</span></td></tr><tr class="studentsset"><td>ECB1</td></tr><tr class="teacher"><td>DR EXAMPLE</td></tr><tr class="room"><td>PHY LAB</td></tr></table>');
  const subjectRows = api.parseFetTimetable(subjectHtml, "subjects");
  assert.equal(subjectRows.length, 1);
  assert.equal(subjectRows[0].subject, "PHYSICS");
  assert.equal(subjectRows[0].cohorts, "ECB1");
  assert.equal(subjectRows[0].teacher, "DR EXAMPLE");
  assert.equal(subjectRows[0].room, "PHY LAB");
  assert.equal(api.parseFetTimetable(subjectHtml, "groups").length, 0, "Do not infer the subject from an arbitrary caption");
  const detail = '<span class="subject">PHYSICS</span><span class="activitytag">L</span>';
  assert.equal(api.parseFetTimetable(makeTable("DR EXAMPLE", detail), "teachers")[0].teacher, "DR EXAMPLE");
  assert.equal(api.parseFetTimetable(makeTable("A9", detail), "rooms")[0].room, "A9");
});
