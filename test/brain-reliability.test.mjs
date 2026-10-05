import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createAppHarness, addEcb2 } from "../scripts/stress-probe-harness.mjs";

function fixture() {
  const h = createAppHarness();
  h.api.state.nowOverride = "2026-10-05T04:30:00Z"; // Monday 10:00 IST
  h.api.state.metadata = { version: "07-09-2026" };
  return h;
}
const plain = html => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

test("greetings and Punjabi day questions do not become person searches", () => {
  const { api } = fixture();
  for (const greeting of ["sat sri akal", "SATS RIAKAL".replace(" ", ""), "hello", "hi", "namaste"]) {
    const answer = api.answerWithoutAi(greeting);
    assert.match(answer, /Hello|Namaste|ਸਤ|नमस्ते/i, greeting);
    assert.doesNotMatch(answer, /No verified|CRN|student roster/, greeting);
  }
  for (const q of ["ajj kehdi class aa", "aaj class kithe aa", "aaj timetable dikha kro", "mera timetable show krdo"]) {
    api.resetBrainConversation();
    assert.match(api.answerWithoutAi(q), /MATH I/, q);
    assert.doesNotMatch(api.answerWithoutAi(q), /Compare|No verified.*match/, q);
  }
});

test("temporal extraction preserves mixed-format endpoint order and exact week", () => {
  const { api, context } = fixture();
  const kernel = context.CompassBrainKernel;
  for (const q of ["from October 5 to 7 October", "from 05/10/2026 to October 7", "from October 5 to 2026-10-07"]) {
    const temporal = kernel.resolveTemporalQuery(q, "2026-10-05");
    assert.deepEqual([...temporal.dates], ["2026-10-05", "2026-10-06", "2026-10-07"], q);
  }
  assert.equal(kernel.resolveTemporalQuery("Tuesday next week", "2026-10-05").iso, "2026-10-13");
  assert.equal(kernel.resolveTemporalQuery("next week Tuesday", "2026-10-05").iso, "2026-10-13");
  assert.equal(kernel.resolveTemporalQuery("today 6 October", "2026-10-05").status, "conflict");
  assert.equal(kernel.resolveTemporalQuery("from October 7 to 5 October", "2026-10-05").status, "invalid");
  assert.equal(kernel.extractDaySymbol("day before yesterday"), "day_before_yesterday");
  assert.equal(kernel.resolveDaySymbol("day_before_yesterday", "Monday"), "Saturday");
  assert.match(api.answerWithoutAi("what date is Tuesday next week"), /13 October 2026/);
  assert.doesNotMatch(api.answerWithoutAi("what date is Tuesday next week"), /Timetable|MATH/);
  assert.match(api.answerWithoutAi("my timetable next month"), /2026-11-02/);
  assert.match(api.answerWithoutAi("my timetable in 2027"), /specify a date/);
});

test("past tense stays local to each mixed-language clause", () => {
  const { context } = fixture();
  const k = context.CompassBrainKernel;
  const plan = k.planQuery("kal timetable aur kal holiday thi", { calendarDate: "2026-10-05" });
  assert.equal(plan.clauses[0].temporal.iso, "2026-10-06");
  assert.equal(plan.clauses[1].temporal.iso, "2026-10-04");
  assert.equal(k.normalize("exam times"), "exam times");
  assert.equal(k.evaluateArithmetic(k.sanitizeArithmetic("six times seven")), 42);
});

test("calendar differences use exact elapsed or inclusive days, including leap years", () => {
  const { api } = fixture();
  for (const [q, expected] of [
    ["how many days from 5 October to 7 October", 2],
    ["how many days from October 5 to 7 October inclusive", 3],
    ["how many days between 2028-02-28 and 2028-03-01", 2],
    ["how many days from 2026-01-01 to 2027-01-01", 365],
    ["how many days until 7 October", 2],
  ]) {
    const answer = plain(api.answerWithoutAi(q));
    assert.match(answer, new RegExp(`\\b${expected} days\\b`), q);
    assert.doesNotMatch(answer, /MATH I|CHEMISTRY|teacher timetable/i, q);
  }
  assert.match(api.answerWithoutAi("how many days from 7 October to 5 October"), /end date is before/);
});

test("explicit dates and clocks constrain next class and occupancy answers", () => {
  const { api } = fixture();
  for (const q of ["next class tomorrow", "kal meri next class", "mera kal agla lecture"]) {
    const answer = api.answerWithoutAi(q);
    assert.match(answer, /2026-10-06/);
    assert.match(answer, /CHEMISTRY/);
    assert.doesNotMatch(answer, /PROGRAMMING FOR PROBLEM SOLVING/);
  }
  assert.match(api.answerWithoutAi("my timetable tomorrow at 10 AM"), /CHEMISTRY/);
  assert.doesNotMatch(api.answerWithoutAi("my timetable tomorrow at 10:30 AM"), /CHEMISTRY/);
  assert.match(api.answerWithoutAi("my timetable tomorrow at 11:30 AM"), /MATH I/);
  assert.match(api.answerWithoutAi("do I have class at 2 pm tomorrow"), /No matching class/);
  const interval = api.answerWithoutAi("my classes tomorrow between 9 AM and 12 PM");
  assert.match(interval, /CHEMISTRY/);
  assert.match(interval, /MATH I/);
  assert.match(interval, /2026-10-06/);
  assert.match(api.answerWithoutAi("my classes tomorrow between 12 PM and 9 AM"), /end after the start/);
  assert.match(api.answerWithoutAi("my timetable next week after 14:30"), /could not verify that time filter/);
  const unknownSubject = api.answerWithoutAi("my history class tomorrow at 10 AM");
  assert.match(unknownSubject, /could not verify/);
  assert.doesNotMatch(unknownSubject, /CHEMISTRY/);
  for (const q of ["my timetable at 25:30", "class at 10:99 tomorrow", "room A9 at 13 PM", "next class at 0 AM"]) assert.match(api.answerWithoutAi(q), /check the time/i, q);
});

test("generated clock and date matrix validates actual subjects across input variations", () => {
  const { api } = fixture();
  let checked = 0;
  for (const [date, subject, time] of [["2026-10-05", "MATH I", "10 AM"], ["2026-10-06", "CHEMISTRY", "10 AM"], ["2026-10-07", "ECONOMICS", "1 PM"], ["2026-10-08", "WORKSHOP", "9 AM"], ["2026-10-09", "ENGLISH", "10 AM"]]) {
    for (const prefix of ["my timetable", "mera timetable", "meri class", "my schedule", "my classes"])
      for (const phrase of [`${prefix} on ${date} at ${time}`, `${date} ${prefix} at ${time}`])
        for (const query of [phrase, phrase.toUpperCase(), phrase.replaceAll(" ", "   "), `please ${phrase}?`]) {
          api.resetBrainConversation();
          const answer = api.answerWithoutAi(query);
          assert.match(answer, new RegExp(subject), query);
          assert.match(answer, new RegExp(date), query);
          assert.equal(api.state.selectedSubgroup, "ECB1");
          checked++;
        }
  }
  assert.equal(checked, 200);
});

test("relative holiday months respect year boundaries and official coverage", () => {
  const { api } = fixture();
  const october = api.answerWithoutAi("holidays this month");
  assert.match(october, /October 2026/);
  assert.doesNotMatch(october, /Independence Day|Diwali/);
  assert.match(api.answerWithoutAi("holidays next month"), /November 2026.*Diwali/s);
  api.state.nowOverride = "2026-12-30T04:30:00Z";
  assert.match(api.answerWithoutAi("holidays next month"), /2027.*not loaded|not.*verified.*2027/s);
});

test("multi-subject questions retain shared teacher or location requests", () => {
  const { api } = fixture();
  const answer = plain(api.answerWithoutAi("who teaches physics and maths"));
  assert.match(answer, /PHYSICS.*Teacher: DR JASMEET KAUR/);
  assert.match(answer, /MATH I.*Teacher: SUKHMINDER SINGH/);
  assert.doesNotMatch(answer, /Schedule Monday/);
});

test("CGPA and assessment answers require correct scope and published facts", () => {
  const { api, context } = fixture();
  for (const answer of [api.answerWithoutAi("8.4 CGPA to percentage"), vm.runInContext('legacyAnswerWithoutAi("8.4 CGPA to percentage")', context)]) {
    assert.match(answer, /84%/); assert.match(answer, /2016/); assert.match(answer, /cgpac\.pdf/); assert.doesNotMatch(answer, /9\.5/);
  }
  assert.match(api.answerWithoutAi("110% to CGPA"), /0 to 100/);
  assert.match(api.answerWithoutAi("-1 CGPA to percentage"), /0 to 10/);
  assert.match(api.answerWithoutAi("8 CGPA to percentage batch 2014"), /cannot verify/);
  assert.match(api.answerWithoutAi("Physics internal marks"), /could not verify/);
  api.state.syllabus = [{ code: "BSC101", title: "Physics", caMarks: "35", eseMarks: "65", totalMarks: "100" }];
  const answer = api.answerWithoutAi("Physics internal marks");
  assert.match(answer, /35 Marks/); assert.match(answer, /65 Marks/); assert.doesNotMatch(answer, /40 Marks|60 Marks/);
  assert.match(api.answerWithoutAi("calculate CGPA: 4 credits A+, 4 credits A"), /numeric grade points/);
  for (const q of ["calculate CGPA: 4 A+, 3 B", "calculate CGPA: 4 credits 9, 3 credits 11", "calculate CGPA: -4 credits 9, 3 credits 8", "calculate CGPA: 4 credits 9, 3 credits 8, unknown"])
    assert.match(api.answerWithoutAi(q), /numeric grade points/, q);
  assert.match(api.answerWithoutAi("calculate CGPA: 4 credits 0, 4 credits 8.5"), /4.25 \/ 10.0/);
  assert.doesNotMatch(api.answerWithoutAi("calculate SGPA: 4 credits 9, 3 credits 8"), /Equivalent Percentage/);
  assert.equal(context.CompassBrainKernel.evaluateCgpa([{ credits: 4, grade: "A+" }]), null);
});

test("faculty ambiguity and comparison retain verified identities", () => {
  const { api, context } = fixture();
  const brain = context.CompassBrainV2_2;
  const rows = ["DR AMAN SINGH", "DR AMAN KAUR"].map((teacher, i) => ({ ...api.state.schedule[0], id: `teacher-${i}`, group: teacher, teacher }));
  const ambiguous = brain.process("teacher aman timetable", { facultyTimetables: rows, calendarDate: "2026-10-05" });
  assert.equal(ambiguous.handled, true);
  assert.match(ambiguous.answer, /More than one/);
  const exact = brain.process("teacher aman singh timetable Monday", { facultyTimetables: rows, calendarDate: "2026-10-05" });
  assert.equal(exact.handled, true);
  assert.match(exact.answer, /MATH I/);
  addEcb2(api);
  assert.match(api.answerWithoutAi("compare ECB1 and ECB2 Monday"), /Compared: ECB1 and ECB2/);
  assert.equal(api.state.selectedSubgroup, "ECB1");
});
