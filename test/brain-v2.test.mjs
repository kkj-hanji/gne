import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const brainSource = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const syllabusIndex = JSON.parse(await readFile(new URL("../public/data/first-year-syllabus-index.json", import.meta.url), "utf8"));
const officialGroupFixture = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");
const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*?(?=function kbClean)/,
  ""
).replace(
  /function kbClean/,
  "globalThis.__brainIntegrationTest = { state, buildScheduleIndex, answerWithoutAi, legacyAnswerWithoutAi, runCompassBrain, setCompassBrainV2Enabled, resetBrainConversation, parseSyllabusText, parseFetTimetable, isStructuredQuestion, shouldUseActualAi, groupLabel, sanitizeSchedule, syllabusCoursesForQuestion, isSyllabusQuestion, kbSyllabusUnitAnswer, canonicalTimetableQuestion, studentLookupRequest, studentLookupContextFromRecords, legacyStudentLookupAnswer, facultyLookupRequest, legacyFacultyLookupAnswer, loadFacultyDirectory, resolveChatFacultyLookup, enrichFacultyLookupProfile };\nfunction kbClean"
);

function createHarness(fetchImpl = () => { throw new Error("Network access is forbidden in Brain v2 tests."); }) {
  const storage = new Map();
  const context = vm.createContext({
    console,
    DOMParser: class { parseFromString(html) { return parseHTML(html).document; } },
    document: { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    window: { setTimeout, clearTimeout },
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    URL,
    fetch: fetchImpl
  });
  vm.runInContext(brainSource, context);
  vm.runInContext(sourceUnderTest, context);
  const api = context.__brainIntegrationTest;
  // Keep relative-day tests hermetic. This is Sunday in India, so the next
  // study day in the synthetic fixture is Monday regardless of wall-clock date.
  api.state.nowOverride = "2026-08-16T04:30:00.000Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  api.state.groups = ["ECB"];
  api.state.schedule = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-economics", group: "ECB", day: "Monday", start: 630, end: 690, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-physics", group: "ECB", day: "Monday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "tue-physics", group: "ECB", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB1" },
    { id: "wed-math", group: "ECB", day: "Wednesday", start: 690, end: 750, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "fri-physics", group: "ECB", day: "Friday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "fri-pps-1", group: "ECB", day: "Friday", start: 870, end: 930, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB1" },
    { id: "fri-pps-2", group: "ECB", day: "Friday", start: 930, end: 980, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB1" }
  ];
  api.buildScheduleIndex();
  api.setCompassBrainV2Enabled(true);
  return { api, context, storage };
}

test("Brain v2 adds natural conversation and safe calculations without network or AI", () => {
  const { api } = createHarness();
  assert.match(api.answerWithoutAi("hey bro"), /Hello!/);
  assert.match(api.answerWithoutAi("how are you"), /working well/i);
  assert.match(api.answerWithoutAi("are you AI"), /deterministic rules/i);
  assert.match(api.answerWithoutAi("25% of 240"), /= 60/);
  assert.match(api.answerWithoutAi("sqrt(144)"), /= 12/);
  assert.match(api.answerWithoutAi("10 / 0"), /undefined/i);
  assert.match(api.answerWithoutAi("bye"), /See you!/);
});

test("Brain v2 solves bounded linear equations and natural arithmetic without evaluating source text", () => {
  const { api, context } = createHarness();
  assert.match(api.answerWithoutAi("solve 2x + 3 = 11"), /x = 4/);
  assert.match(api.answerWithoutAi("3*x - 5 = 10"), /x = 5/);
  assert.match(api.answerWithoutAi("2 plus 3 times 4"), /= 14/);
  assert.match(api.answerWithoutAi("solve x + 2 = x + 2"), /infinitely many solutions/i);
  assert.match(api.answerWithoutAi("solve x + 2 = x + 3"), /no solution/i);
  const unsupported = context.CompassBrainV2.process("solve x^2 = 4", {});
  assert.equal(unsupported.handled, false);
  assert.equal(unsupported.fallbackReason, "UNSUPPORTED_INTENT");
});

test("Brain 1 retains independent bounded calculation support", () => {
  const { api } = createHarness();
  api.setCompassBrainV2Enabled(false);
  assert.match(api.answerWithoutAi("solve 2x + 3 = 11"), /x = 4/);
  assert.match(api.answerWithoutAi("2 plus 3 times 4"), /= 14/);
  assert.match(api.answerWithoutAi("25% of 240"), /= 60/);
});

test("the browser loads Brain v2 before the application entry point", () => {
  const brainPosition = pageSource.search(/<script src="brain-v2\.js(?:\?[^"<>]*)?"><\/script>/);
  const appPosition = pageSource.search(/<script src="app\.js(?:\?[^"<>]*)?"><\/script>/);
  assert.ok(brainPosition >= 0);
  assert.ok(appPosition > brainPosition);
});

test("exact calendar questions cannot be swallowed by today's timetable route", () => {
  const { api, context } = createHarness();
  assert.match(api.answerWithoutAi("what day is 17 August 2026"), /Monday/);
  assert.match(api.answerWithoutAi("what day is 17\/08\/2026"), /Monday/);
  assert.match(api.answerWithoutAi("what day is 2026-08-17"), /Monday/);
  assert.match(api.answerWithoutAi("what day is 31 February 2026"), /not valid/);
  const supplied = { classes: api.state.schedule, calendarDate: "2026-08-14", currentYear: 2026, now: { day: "Friday" }, nextStudyDay: { day: "Monday", label: "Monday, 17 Aug" }, conversation: {} };
  assert.match(context.CompassBrainV2.process("what is tomorrow's date?", supplied).answer, /Saturday, 15 August 2026/i);
  assert.match(context.CompassBrainV2.process("what day is today?", supplied).answer, /Friday, 14 August 2026/i);
  assert.match(context.CompassBrainV2.process("what date is parson?", supplied).answer, /Sunday, 16 August 2026/i);
});

test("day-after-tomorrow aliases use the India calendar in both Brain paths", () => {
  const { api } = createHarness();
  const timetable = api.answerWithoutAi("parson timetable");
  assert.match(timetable, /Tuesday/i);
  assert.match(timetable, /PHYSICS/i);
  assert.match(api.answerWithoutAi("physics parso kahan hai"), /G6/i);
  assert.match(api.answerWithoutAi("free lectures day after tomorrow"), /Tuesday/i);
  assert.match(api.answerWithoutAi("what date is day after tomorrow"), /Tuesday, 18 August 2026/i);
});

test("catalogue and room queries use only the active timetable", () => {
  const { api } = createHarness();
  const teachers = api.answerWithoutAi("list all my teachers");
  assert.match(teachers, /SUKHMINDER SINGH/);
  assert.match(teachers, /NAVJOT SINGH/);
  const rooms = api.answerWithoutAi("list all rooms");
  assert.match(rooms, /A9 \(AUTOMOBILE BLOCK\)/);
  assert.match(rooms, /COMP LAB EC/);
  const pairs = api.answerWithoutAi("teachers of all subjects");
  assert.match(pairs, /MATH I:<\/strong> SUKHMINDER SINGH/);
  const roomClasses = api.answerWithoutAi("what classes are in A9");
  assert.match(roomClasses, /MATH I/);
  assert.match(roomClasses, /ECONOMICS/);
  assert.doesNotMatch(roomClasses, /PROGRAMMING FOR PROBLEM SOLVING/);
  assert.match(api.answerWithoutAi("which building is A9 in"), /AUTOMOBILE BLOCK/);
});

test("teacher and subject relationship wording never degrades into syllabus page search", () => {
  const { api } = createHarness();
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  const variants = [
    "List all my teachers with there subjects",
    "list my teachers with their subjects",
    "mere sare teachers aur unke subjects batao",
    "list all my techers with there subjets"
  ];
  variants.forEach((question) => {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, /Teachers and their subjects in ECB1/i, question);
    assert.match(answer, /SUKHMINDER SINGH:<\/strong> MATH I/i, question);
    assert.match(answer, /DR JASMEET KAUR:<\/strong> PHYSICS/i, question);
    assert.doesNotMatch(answer, /Official syllabus search|Page \d+:/i, question);
  });
  const combined = api.answerWithoutAi("how many teachers and which teacher teaches which subject");
  assert.match(combined, /You have <strong>4<\/strong> teachers listed in <strong>ECB1<\/strong>/i);
  assert.match(combined, /Which teacher teaches which subject|Teachers and their subjects/i);
  assert.match(combined, /SUKHMINDER SINGH:<\/strong> MATH I.*Lecture.*A9 \(AUTOMOBILE BLOCK\)/i);
  assert.match(combined, /DR JASMEET KAUR:<\/strong> PHYSICS.*3 Lectures.*A6 \(AUTOMOBILE BLOCK\).*G6/i);
  assert.match(combined, /NAVJOT SINGH \(EC\):<\/strong> PROGRAMMING FOR PROBLEM SOLVING.*2 Practical\/Labs.*COMP LAB EC/i);
  assert.doesNotMatch(combined, /Official syllabus search|Page \d+:/i);
  api.setCompassBrainV2Enabled(false);
  const legacyCombined = api.answerWithoutAi("how many teachers and which teacher teaches which subject");
  assert.match(legacyCombined, /You have <strong>4<\/strong> teachers listed in <strong>ECB1<\/strong>/i);
  assert.match(legacyCombined, /SUKHMINDER SINGH:<\/strong> MATH I/i);
  const legacyAnswer = api.answerWithoutAi("List all my teachers with there subjects");
  assert.match(legacyAnswer, /Teachers and their subjects in ECB1/i);
  assert.match(legacyAnswer, /NAVJOT SINGH \(EC\):<\/strong> PROGRAMMING FOR PROBLEM SOLVING/i);
  assert.doesNotMatch(legacyAnswer, /Official syllabus search|Page \d+:/i);
});

test("subject period counts, combined duration, and duration follow-ups remain connected", () => {
  const { api } = createHarness();
  const count = api.answerWithoutAi("total math lectures per week");
  assert.match(count, /<strong>2<\/strong> MATH I timetable periods this week/i);
  assert.match(count, /Type breakdown: <strong>2 Lectures<\/strong>/i);

  const followup = api.answerWithoutAi("duration");
  assert.match(followup, /MATH I duration/i);
  assert.match(followup, /Total scheduled duration: <strong>2 hours<\/strong> this week/i);
  assert.match(followup, /Monday 9:30 AM.*Wednesday 11:30 AM/is);

  const combined = api.answerWithoutAi("total math lectures per week and duration");
  assert.match(combined, /<strong>2<\/strong> MATH I timetable periods this week/i);
  assert.match(combined, /Total scheduled duration: <strong>2 hours<\/strong>/i);
});

test("human-style timetable questions stay specific, personalized, and source grounded", () => {
  const { api } = createHarness();
  const checks = [
    ["Saturday timetable", /No classes are listed for Saturday/i, /MATH I.*ECONOMICS/is],
    ["sunday classes", /No classes are listed for Sunday/i, /MATH I.*ECONOMICS/is],
    ["What is my first class on Monday?", /First class on Monday: MATH I/i, /ECONOMICS.*First class/is],
    ["What is the last lecture Friday?", /Last class on Friday: PROGRAMMING FOR PROBLEM SOLVING/i, null],
    ["When do I finish on Friday?", /finish at <strong>4:20 PM/i, null],
    ["does physics happen Friday?", /PHYSICS.*Friday|Friday.*PHYSICS/is, /ECONOMICS/],
    ["physics Saturday", /PHYSICS.*not listed.*Saturday/is, /Monday 9:30 AM/],
    ["how many physics classes this week?", /<strong>3<\/strong> PHYSICS timetable periods/i, null],
    ["how long is physics on Friday?", /Friday 12:30 PM.*1:30 PM.*60 minutes/is, null],
    ["what is the physics venue on Friday?", /PHYSICS.*A6 \(AUTOMOBILE BLOCK\)/is, /COMP LAB EC/],
    ["total class time Monday", /Monday class summary.*<strong>3 hours<\/strong>/is, null],
    ["free slots Friday", /8:30 AM - 9:30 AM.*11:30 AM - 12:30 PM.*1:30 PM - 2:30 PM.*5 hr/is, null],
    ["classes after 2 pm Friday", /PROGRAMMING FOR PROBLEM SOLVING/is, /PHYSICS/],
    ["classes before 12 pm Monday", /MATH I.*ECONOMICS/is, /PHYSICS/],
    ["morning classes Monday", /MATH I.*ECONOMICS/is, /PHYSICS/],
    ["how many subjects do I have?", /<strong>4<\/strong> subjects.*ECB1/is, /official subjects.*11/is],
    ["how many teachers do I have?", /<strong>4<\/strong> teachers.*ECB1/is, null],
    ["how many rooms do I use?", /<strong>4<\/strong> rooms or locations.*ECB1/is, null],
    ["Which subjects does Dr Jasmeet Kaur teach?", /DR JASMEET KAUR.*PHYSICS/is, /MATH I/],
    ["when does Jasmeet teach me?", /Monday 12:30 PM.*Tuesday 10:30 AM.*Friday 12:30 PM/is, null],
    ["where does Navjot Singh teach?", /COMP LAB EC/i, /A9 \(AUTOMOBILE BLOCK\)/]
  ];
  checks.forEach(([question, expected, forbidden]) => {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, expected, question);
    if (forbidden) assert.doesNotMatch(answer, forbidden, question);
    assert.doesNotMatch(answer, /Official syllabus search|Page \d+:/i, question);
  });
});

test("today's lecture total and free periods use the active India day", () => {
  const { api } = createHarness();
  // Monday, 17 Aug 2026 at 10:00 AM India time.
  api.state.nowOverride = "2026-08-17T04:30:00.000Z";

  const totalLectures = api.answerWithoutAi("how many lectures do I have today?");
  assert.match(totalLectures, /Monday class summary/i);
  assert.match(totalLectures, /You have <strong>3<\/strong> timetable periods/i);
  assert.match(totalLectures, /Official timetable/i);

  const freePeriods = api.answerWithoutAi("free periods today");
  assert.match(freePeriods, /Monday free timetable time/i);
  assert.match(freePeriods, /8:30 AM - 9:30 AM/i);
  assert.match(freePeriods, /11:30 AM - 12:30 PM/i);
  assert.match(freePeriods, /1:30 PM - 2:30 PM/i);
  assert.match(freePeriods, /3:30 PM - 4:20 PM/i);
  assert.match(freePeriods, /4 hr 50 min/i);
});

test("the reported chat sequence keeps timetable commands out of roster lookup and resolves ranked next classes", () => {
  const { api, context } = createHarness();
  api.state.nowOverride = "2026-08-21T03:30:00.000Z"; // Friday 9:00 AM IST
  api.state.schedule = api.state.schedule.filter((item) => item.day !== "Friday").concat([
    { id: "fri-math", group: "ECB", day: "Friday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "fri-physics", group: "ECB", day: "Friday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "fri-workshop", group: "ECB", day: "Friday", start: 750, end: 870, subject: "MANUFACTURING PRACTICES", teacher: "Teacher not listed", room: "WORKSHOPS", type: "P", cohorts: "ECB1" },
    { id: "fri-drawing-1", group: "ECB", day: "Friday", start: 870, end: 930, subject: "ENGG DRAWING AND GRAPHICS", teacher: "ER. GURMEET KAUR", room: "S203", type: "P", cohorts: "ECB1" },
    { id: "fri-drawing-2", group: "ECB", day: "Friday", start: 930, end: 980, subject: "ENGG DRAWING AND GRAPHICS", teacher: "ER. GURMEET KAUR", room: "S203", type: "P", cohorts: "ECB1" }
  ]);
  api.buildScheduleIndex();
  assert.equal(api.studentLookupRequest("Aaj ka timetable batao"), null);
  assert.equal(api.studentLookupRequest("Aaj ka timetable batao", { name: "REMEMBERED STUDENT", section: "ECB" }), null);

  for (const engine of [context.CompassBrainV2, null]) {
    api.resetBrainConversation();
    api.answerWithoutAi("math", engine);
    const next = api.answerWithoutAi("What is my next class?", engine);
    assert.match(next, /Next class: MATH I/i);
    assert.match(next, /9:30 AM - 10:30 AM/i);

    const second = api.answerWithoutAi("2nd next class", engine);
    assert.match(second, /Second upcoming class: PHYSICS/i);
    assert.match(second, /10:30 AM - 11:30 AM/i);
    assert.doesNotMatch(second, /Second upcoming class: MATH I/i);

    const today = api.answerWithoutAi("Aaj ka timetable batao", engine);
    assert.match(today, /ECB1 · Friday/i);
    assert.match(today, /Free lecture/i);
    assert.doesNotMatch(today, /No verified student found|current roster record matched/i);
  }

  api.resetBrainConversation();
  const brainResult = api.runCompassBrain("2nd next class");
  assert.equal(brainResult.intent, "UPCOMING_CLASS");
  assert.equal(brainResult.facts.position, 2);
  assert.equal(brainResult.facts.class.subject, "PHYSICS");
});

test("human-style composite questions return every requested verified fact", () => {
  const { api } = createHarness();

  const math = api.answerWithoutAi("math total count duration teacher and rooms");
  assert.match(math, /You have <strong>2<\/strong> MATH I timetable periods this week/i);
  assert.match(math, /Total scheduled duration: <strong>2 hours<\/strong>/i);
  assert.match(math, /SUKHMINDER SINGH/i);
  assert.match(math, /A9 \(AUTOMOBILE BLOCK\)/i);
  assert.doesNotMatch(math, /Official syllabus search|Page \d+:/i);

  const roomsFollowup = api.answerWithoutAi("and rooms?");
  assert.match(roomsFollowup, /MATH I.*A9 \(AUTOMOBILE BLOCK\)/is);

  const physics = api.answerWithoutAi("how many physics periods and where with teacher");
  assert.match(physics, /<strong>3<\/strong> PHYSICS timetable periods/i);
  assert.match(physics, /DR JASMEET KAUR/i);
  assert.match(physics, /A6 \(AUTOMOBILE BLOCK\).*G6|G6.*A6 \(AUTOMOBILE BLOCK\)/is);

  const monday = api.answerWithoutAi("how many classes Monday and total duration");
  assert.match(monday, /Monday class summary/i);
  assert.match(monday, /<strong>3<\/strong> timetable periods/i);
  assert.match(monday, /<strong>3 hours<\/strong>/i);

  for (const [question, expectedCount, expectedItem] of [
    ["how many subjects and list them", 4, "PROGRAMMING FOR PROBLEM SOLVING"],
    ["how many teachers and list them", 4, "NAVJOT SINGH (EC)"],
    ["how many rooms and list them", 4, "COMP LAB EC"]
  ]) {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, new RegExp(`<strong>${expectedCount}<\\/strong>`, "i"), question);
    assert.match(answer, new RegExp(expectedItem.replace(/[()]/g, "\\$&"), "i"), question);
  }
});

test("structured syllabus composition, course switching, labs, and books remain exact", () => {
  const { api } = createHarness();

  const summary = api.answerWithoutAi("physics units credits and marks");
  assert.match(summary, /Physics · Requested syllabus details/i);
  assert.match(summary, /Credits:<\/strong> 5/i);
  assert.match(summary, /Total marks:<\/strong> 150/i);
  assert.match(summary, /Units \(6\)/i);

  const books = api.answerWithoutAi("physics textbooks and reference books");
  assert.match(books, /Textbooks \(7\)/i);
  assert.match(books, /Reference books \(11\)/i);
  assert.match(books, /Dr\. D\. Zarena.*2023/is);
  assert.doesNotMatch(books, /<li>23\./i);

  const labs = api.answerWithoutAi("physics lab count and list them");
  assert.match(labs, /Laboratory work \(16\)/i);
  assert.match(labs, /dielectric constant of solid samples/i);

  const twoCourses = api.answerWithoutAi("physics syllabus then math syllabus");
  assert.match(twoCourses, /Physics/i);
  assert.match(twoCourses, /Mathematics - I/i);
  assert.doesNotMatch(twoCourses, /Mathematics - II/i);

  const mathOne = api.answerWithoutAi("math syllabus");
  assert.match(mathOne, /Mathematics - I/i);
  assert.doesNotMatch(mathOne, /Mathematics - II/i);
  const mathTwo = api.answerWithoutAi("math ii syllabus");
  assert.match(mathTwo, /Mathematics - II/i);

  api.answerWithoutAi("physics syllabus");
  const switched = api.answerWithoutAi("math units");
  assert.match(switched, /Mathematics - I/i);
  assert.doesNotMatch(switched, /Physics · Unit/i);
});

test("specific syllabus units answer concisely with official unit details and context", () => {
  const { api } = createHarness();
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  assert.equal(api.canonicalTimetableQuestion("is calculator allowed in physics exam?"), "is calculator allowed in physics exam?");
  assert.equal(api.isSyllabusQuestion("is calculator allowed in physics exam?"), true);
  assert.equal(api.syllabusCoursesForQuestion("is calculator allowed in physics exam?")[0]?.title, "Physics");
  assert.match(api.kbSyllabusUnitAnswer("is calculator allowed in physics exam?"), /Additional material allowed:<\/strong> Scientific Calculator/i);
  const unitTwo = api.answerWithoutAi("what is unit 2 of maths?");
  assert.match(unitTwo, /Mathematics - I · Unit 2/i);
  assert.match(unitTwo, /Partial Differentiation and Its Applications/i);
  assert.match(unitTwo, /Functions of several variables/i);
  assert.doesNotMatch(unitTwo, /Official syllabus search|Page \d+:/i);
  const unitThree = api.answerWithoutAi("unit 3 details");
  assert.match(unitThree, /Mathematics - I · Unit 3/i);
  assert.match(unitThree, /Ordinary Differential Equations/i);
  assert.match(unitThree, /First\s*-\s*order first\s*-\s*degree differential equations/i);
  assert.doesNotMatch(unitThree, /Scheme Code|Guru Nanak Dev Engineering College/i);
  const collision = api.answerWithoutAi("when is physics unit 2?");
  assert.match(collision, /Physics · Unit 2/i);
  assert.match(collision, /Laser/i);
  assert.doesNotMatch(collision, /Monday|Tuesday|Friday.*12:30 PM/is);
  const marks = api.answerWithoutAi("physics assessment marks");
  assert.match(marks, /Total marks:<\/strong> 150/i);
  assert.match(marks, /Continuous assessment:<\/strong> 90/i);
  assert.match(marks, /End-semester examination:<\/strong> 60/i);
  assert.doesNotMatch(marks, /Official syllabus search|Page \d+:/i);
  assert.match(api.answerWithoutAi("physics exam duration"), /Exam duration:<\/strong> 3 hours/i);
  assert.match(api.answerWithoutAi("is calculator allowed in physics exam?"), /Additional material allowed:<\/strong> Scientific Calculator/i);
  assert.match(api.answerWithoutAi("physics co 2"), /Course outcome 2.*working of various devices/is);
  const labs = api.answerWithoutAi("list physics laboratory experiments");
  assert.match(labs, /Physics · Laboratory work/i);
  assert.match(labs, /angle of divergence of laser beam/i);
  assert.doesNotMatch(labs, /Labs & practicals|Profile → Find my group/i);
});

test("co-teachers are distinct people and verified catalogue follow-ups beat stale syllabus context", () => {
  const { api } = createHarness();
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  api.state.schedule.push({ id: "physics-lab-team", group: "ECB", day: "Thursday", start: 750, end: 870, subject: "PHYSICS", teacher: "DR JASPREET SINGH, DR HARPREET KAUR GREWAL", room: "PHY LAB 1", type: "P", cohorts: "ECB1" });
  api.buildScheduleIndex();

  const teachers = api.answerWithoutAi("list all my teachers");
  assert.match(teachers, /<li>DR JASPREET SINGH<\/li>/i);
  assert.match(teachers, /<li>DR HARPREET KAUR GREWAL<\/li>/i);
  assert.doesNotMatch(teachers, /<li>DR JASPREET SINGH, DR HARPREET KAUR GREWAL<\/li>/i);
  assert.match(api.answerWithoutAi("which subjects does Dr Harpreet Kaur Grewal teach?"), /DR HARPREET KAUR GREWAL.*PHYSICS/is);
  assert.match(api.answerWithoutAi("how many teachers do I have?"), /<strong>6<\/strong> teachers/i);

  api.answerWithoutAi("how many subjects are in the official syllabus?");
  assert.match(api.answerWithoutAi("how many subjects do I have?"), /<strong>4<\/strong> subjects.*ECB1/is);
  const listed = api.answerWithoutAi("list them");
  assert.match(listed, /Subjects in ECB1/i);
  assert.match(listed, /PROGRAMMING FOR PROBLEM SOLVING/i);
  assert.doesNotMatch(listed, /Official first-year subjects \(11\)/i);

  api.resetBrainConversation();
  assert.equal(api.studentLookupRequest("list them"), null);
  assert.match(api.answerWithoutAi("how many subjects"), /<strong>4<\/strong> subjects.*ECB1/is);
  const shortFollowup = api.answerWithoutAi("list them");
  assert.match(shortFollowup, /Subjects in ECB1/i);
  assert.match(shortFollowup, /PROGRAMMING FOR PROBLEM SOLVING/i);
});

test("conversation context resolves subject references and bounded class follow-ups", () => {
  const { api } = createHarness();
  assert.match(api.answerWithoutAi("maths"), /MATH I.*selected/i);
  assert.match(api.answerWithoutAi("when is it"), /Monday 9:30 AM/);
  assert.match(api.answerWithoutAi("where?"), /A9 \(AUTOMOBILE BLOCK\)/);
  assert.match(api.answerWithoutAi("who teaches it?"), /SUKHMINDER SINGH/);
  assert.match(api.answerWithoutAi("and Wednesday?"), /Wednesday 11:30 AM/);
  assert.match(api.answerWithoutAi("what about tomorrow?"), /MATH I|not listed/);
  api.answerWithoutAi("maths");
  assert.match(api.answerWithoutAi("after that?"), /ECONOMICS.*10:30 AM/i);
  assert.match(api.answerWithoutAi("same room?"), /No later class|Yes|No/);
  assert.ok(api.state.brainConversation.recentTurns.length <= 6);
});

test("Hinglish, Punjabi transliteration, aliases, and common typos resolve conservatively", () => {
  const { api } = createHarness();
  assert.match(api.answerWithoutAi("kal maths kaha hai"), /MATH I.*A9/is);
  assert.match(api.answerWithoutAi("math wali class kidhar hai"), /A9 \(AUTOMOBILE BLOCK\)/);
  assert.match(api.answerWithoutAi("maths di class kithe aa"), /A9 \(AUTOMOBILE BLOCK\)/);
  assert.match(api.answerWithoutAi("matsh teacher"), /SUKHMINDER SINGH/);
  assert.match(api.answerWithoutAi("physis loacation on tuesday"), /G6/);
  assert.match(api.answerWithoutAi("monday timetabel"), /MATH I/);
  assert.match(api.answerWithoutAi("physis syllbus unit 1"), /Unit 1/i);
  assert.match(api.answerWithoutAi("what's after economics"), /PHYSICS.*12:30 PM/is);
  assert.match(api.answerWithoutAi("what's before physics"), /ECONOMICS.*10:30 AM/is);
});

test("specific subject room questions cannot degrade into an all-room catalogue", () => {
  const { api } = createHarness();
  const answer = api.answerWithoutAi("Which rooms do I use for Mathematics?");
  assert.match(answer, /A9 \(AUTOMOBILE BLOCK\)/);
  assert.doesNotMatch(answer, /COMP LAB EC/);
  const monday = api.answerWithoutAi("Which rooms do I use Monday?");
  assert.match(monday, /A9 \(AUTOMOBILE BLOCK\)/);
  assert.match(monday, /A6 \(AUTOMOBILE BLOCK\)/);
  assert.doesNotMatch(monday, /COMP LAB EC/);
});

test("local suggestions cover catalogue, subject, room, date, and reasoning questions", () => {
  const { api, context } = createHarness();
  const brain = context.CompassBrainV2;
  const supplied = { classes: api.state.schedule };
  assert.ok(brain.suggest("list all m", supplied).some((item) => /teachers|rooms|subjects/i.test(item)));
  assert.ok(brain.suggest("who teaches math", supplied).some((item) => /MATH I/i.test(item)));
  assert.ok(brain.suggest("classes in A9", supplied).some((item) => /A9/i.test(item)));
  assert.ok(brain.suggest("most classes", supplied).some((item) => /most classes/i.test(item)));
  assert.equal(brain.suggest("nxt clas", supplied)[0], "What is my next class?");
  assert.equal(brain.suggest("aaj time", supplied)[0], "Aaj ka timetable batao");
  assert.equal(brain.suggest("mat unt", supplied)[0], "Math units");
  assert.ok(brain.suggest("", supplied).length > 0, "Brain 2 should provide bounded starter actions on focus");
  assert.ok(brain.suggest("", supplied).length <= 8);
});

test("Brain v2 performs bounded, source-grounded timetable reasoning", () => {
  const { api } = createHarness();
  assert.match(api.answerWithoutAi("Which day has the most classes this week?"), /Monday.*3/i);
  assert.match(api.answerWithoutAi("Which teacher do I see most this week?"), /DR JASMEET KAUR.*3/i);
  assert.match(api.answerWithoutAi("Which buildings do I visit Monday?"), /AUTOMOBILE BLOCK/i);
});

test("Brain v2 distinguishes light days, free time, internal breaks, and building usage", () => {
  const { api } = createHarness();

  const lightest = api.answerWithoutAi("Which day is lightest?");
  assert.match(lightest, /Thursday/i);
  assert.match(lightest, /0 (?:classes|periods)|no classes/i);

  const building = api.answerWithoutAi("Which building do I use most this week?");
  assert.match(building, /AUTOMOBILE BLOCK/i);
  assert.match(building, /5 (?:hours|timetable periods)/i);

  const free = api.answerWithoutAi("When am I free tomorrow?");
  assert.match(free, /Monday.*free/i);
  assert.match(free, /8:30 AM.*9:30 AM/is);
  assert.match(free, /11:30 AM.*12:30 PM/is);
  assert.match(free, /1:30 PM.*4:20 PM/is);

  const breaks = api.answerWithoutAi("How long is my break tomorrow?");
  assert.match(breaks, /Monday.*break/i);
  assert.match(breaks, /11:30 AM.*12:30 PM/is);
  assert.match(breaks, /Total internal break time:.*1 hour/is);
  assert.doesNotMatch(breaks, /8:30 AM.*9:30 AM/is);
  assert.doesNotMatch(breaks, /1:30 PM.*4:20 PM/is);
});

test("next-subject questions return one future occurrence instead of the weekly catalogue", () => {
  const { api } = createHarness();
  const answer = api.answerWithoutAi("When is my next Maths class?");
  assert.match(answer, /Next MATH I class.*Monday/is);
  assert.match(answer, /9:30 AM.*10:30 AM/is);
  assert.doesNotMatch(answer, /Wednesday 11:30 AM/is);
  assert.equal(api.state.brainConversation.activeClassId, "mon-math");
});

test("day-specific subject availability answers yes or no before showing evidence", () => {
  const { api } = createHarness();
  const yes = [
    "Do I have Maths tomorrow?",
    "kal maths hai?",
    "कल गणित है?",
    "ਕੱਲ੍ਹ ਗਣਿਤ ਹੈ?"
  ];
  yes.forEach((question) => {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, /<strong>Yes\.<\/strong>.*MATH I.*Monday/is, question);
    assert.doesNotMatch(answer, /Wednesday 11:30 AM/is, question);
  });
  const no = api.answerWithoutAi("Do I have Physics Wednesday?");
  assert.match(no, /<strong>No\.<\/strong>.*PHYSICS.*not listed.*Wednesday/is);
});

test("subject adjacency uses context first, otherwise the next future occurrence, and clarifies without a clock", () => {
  const { api, context } = createHarness();
  api.state.schedule.push(
    { id: "wed-economics", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "wed-physics-after-econ", group: "ECB", day: "Wednesday", start: 810, end: 870, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB1" }
  );
  api.buildScheduleIndex();
  api.state.nowOverride = "2026-08-17T07:00:00.000Z"; // Monday 12:30 PM IST

  const future = api.answerWithoutAi("What comes after Economics?");
  assert.match(future, /Using your next.*ECONOMICS.*occurrence.*Wednesday.*12:30 PM/is);
  assert.match(future, /PHYSICS.*1:30 PM/is);
  assert.equal(api.state.brainConversation.activeClassId, "wed-physics-after-econ");

  const supplied = { classes: api.state.schedule, conversation: {}, profileLabel: "ECB1" };
  const ambiguous = context.CompassBrainV2.process("What comes after Economics?", supplied);
  assert.equal(ambiguous.intent, "CLARIFY_SUBJECT_OCCURRENCE");
  assert.match(ambiguous.answer, /more than one.*ECONOMICS.*Which day/is);
  assert.doesNotMatch(ambiguous.answer, /PHYSICS.*(?:Monday|Wednesday)/is);
});

test("ordinary class follow-ups preserve anchors and compare the intended pair", () => {
  const { api } = createHarness();

  assert.match(api.answerWithoutAi("next class"), /Next class: MATH I/i);
  assert.equal(api.state.brainConversation.activeClassId, "mon-math");

  assert.match(api.answerWithoutAi("where?"), /A9 \(AUTOMOBILE BLOCK\)/i);
  assert.equal(api.state.brainConversation.activeClassId, "mon-math");

  assert.match(api.answerWithoutAi("who teaches it?"), /SUKHMINDER SINGH/i);
  assert.equal(api.state.brainConversation.activeClassId, "mon-math");

  assert.match(api.answerWithoutAi("and after that?"), /ECONOMICS.*10:30 AM/i);
  assert.equal(api.state.brainConversation.previousClassId, "mon-math");
  assert.equal(api.state.brainConversation.activeClassId, "mon-economics");

  const comparison = api.answerWithoutAi("same room?");
  assert.match(comparison, /Yes/i);
  assert.match(comparison, /MATH I.*ECONOMICS/is);
  assert.equal(api.state.brainConversation.activeClassId, "mon-economics");
});

test("new aggregate and break intents understand English, Hinglish, Hindi, and Punjabi mixtures", () => {
  const { api } = createHarness();
  const cases = [
    ["sabse halka day kaunsa hai?", /Thursday/i],
    ["सबसे हल्का दिन कौन सा है?", /Thursday/i],
    ["ਸਭ ਤੋਂ ਹਲਕਾ ਦਿਨ ਕਿਹੜਾ ਹੈ?", /Thursday/i],
    ["kal main kab khali hoon?", /Monday.*8:30 AM/is],
    ["कल मैं कब खाली हूँ?", /Monday.*8:30 AM/is],
    ["ਕੱਲ੍ਹ ਮੈਂ ਕਦੋਂ ਖਾਲੀ ਹਾਂ?", /Monday.*8:30 AM/is],
    ["kal mera break kitna lamba hai?", /Total internal break time:.*1 hour/is],
    ["कल मेरा ब्रेक कितना लंबा है?", /Total internal break time:.*1 hour/is],
    ["ਕੱਲ੍ਹ ਮੇਰਾ ਬ੍ਰੇਕ ਕਿੰਨਾ ਲੰਬਾ ਹੈ?", /Total internal break time:.*1 hour/is],
    ["is hafte sabse zyada kaunsi building use karta hoon?", /AUTOMOBILE BLOCK.*5 hours/is],
    ["इस हफ्ते मैं कौन सी इमारत सबसे ज्यादा इस्तेमाल करता हूँ?", /AUTOMOBILE BLOCK.*5 hours/is],
    ["ਇਸ ਹਫ਼ਤੇ ਮੈਂ ਕਿਹੜੀ ਬਿਲਡਿੰਗ ਸਭ ਤੋਂ ਵੱਧ ਵਰਤਦਾ ਹਾਂ?", /AUTOMOBILE BLOCK.*5 hours/is]
  ];
  cases.forEach(([question, expected]) => assert.match(api.answerWithoutAi(question), expected, question));
});

test("legacy timetable and syllabus fixes win whenever Brain v2 is unsupported", () => {
  const { api } = createHarness();
  const friday = api.answerWithoutAi("Friday timetable");
  assert.match(friday, /Free lecture/);
  assert.match(friday, /3:30 PM - 4:20 PM/);
  const multiSubject = api.answerWithoutAi("is there any physics economics class on Friday; if yes give location and teacher name");
  assert.match(multiSubject, /No.*ECONOMICS/is);
  assert.match(multiSubject, /Yes.*PHYSICS/is);
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));

  const books = api.answerWithoutAi("physics textbooks");
  assert.match(books, /A Text Book of Engineering Physics/);
  assert.doesNotMatch(books, /Library.*student ID/is);
  const combinedUnits = api.answerWithoutAi("total units of physics and maths");
  assert.match(combinedUnits, /Physics:<\/strong> 6 units/);
  assert.match(combinedUnits, /Mathematics - I:<\/strong> 4 units/);
});

test("Brain v2 kill switch and every invalid result shape fall back to legacy", () => {
  const { api, context } = createHarness();
  const question = "Friday timetable";
  const expected = api.legacyAnswerWithoutAi(question);
  const cases = [
    { process() { throw new Error("planner failed"); } },
    { process() { return null; } },
    { process() { return undefined; } },
    { process() { return { handled: false, confidence: 1, verified: true, answer: "wrong" }; } },
    { process() { return { handled: true, confidence: 0.2, verified: true, answer: "wrong" }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "" }; } },
    { process() { return { handled: true, confidence: 1, verified: false, answer: "wrong" }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "wrong", plan: Array(9).fill("too deep") }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "<script>alert(1)</script>", plan: [] }; }, validateResult() { return { accepted: true, reason: "" }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "<p onclick=\"alert(1)\">wrong</p>", plan: [] }; }, validateResult() { return { accepted: true, reason: "" }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "<p>NaN</p>", plan: [] }; }, validateResult() { return { accepted: true, reason: "" }; } },
    { process() { return { handled: true, confidence: 1, verified: true, answer: "x".repeat(64001), plan: [] }; }, validateResult() { return { accepted: true, reason: "" }; } },
    { process() { return "malformed"; } }
  ];
  cases.forEach((engine) => assert.equal(api.answerWithoutAi(question, engine), expected));
  assert.equal(context.CompassBrainV2.validateResult({ handled: true, verified: true, confidence: 1, answer: "<iframe src='bad'></iframe>", plan: [] }).accepted, false);
  api.setCompassBrainV2Enabled(false);
  assert.equal(api.answerWithoutAi(question), expected);
});

test("malformed timetable records and unsupported input do not fabricate facts or crash", () => {
  const { api } = createHarness();
  api.state.schedule.push({ id: "broken", group: "ECB", day: "Someday", start: "bad", end: null, subject: "INVENTED", room: "<img src=x>" });
  api.buildScheduleIndex();
  assert.equal(api.runCompassBrain("🛸🛸🛸"), null);
  assert.equal(api.runCompassBrain("tell me the winning lottery number"), null);
  assert.doesNotMatch(api.answerWithoutAi("list all rooms"), /<img/);
});

test("out-of-box college questions remain useful and do not collide with official data routes", () => {
  const { api } = createHarness();
  const cases = [
    ["what are college timings", /College hours/],
    ["tell me attendance rule", /Attendance (?:rule|Rule)/i],
    ["library timing", /Library/],
    ["hostel and mess information", /Hostel/],
    ["what is the exam pattern", /Exam scheme/],
    ["how can I get scholarship", /Scholarships/],
    ["where can I get previous year papers", /Previous papers/],
    ["give me study tips", /Study method|Quick study method/],
    ["does Compass work offline", /Offline/],
    ["is my profile private", /Privacy/],
    ["how do I share Compass with my friend", /Sharing Compass|Share the Compass/]
  ];
  cases.forEach(([question, expected]) => assert.match(api.answerWithoutAi(question), expected, question));
});

test("all official syllabus subjects answer units locally and never become timetable answers", () => {
  const { api } = createHarness();
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  const cases = [
    ["physics units", /Unit 6/],
    ["mathematics 1 units", /Unit 4/],
    ["chemistry units", /Unit 4/],
    ["mathematics 2 units", /Unit 4/],
    ["basic electrical units", /Unit 6/],
    ["engineering drawing units", /Unit 6/],
    ["PPS units", /Unit 6/],
    ["python syllabus units", /Unit 5/],
    ["professional english units", /Unit 6/],
    ["economics syllabus units", /Unit 7/],
    ["manufacturing practices units", /Unit 1/]
  ];
  cases.forEach(([question, expected]) => {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, expected, question);
    assert.doesNotMatch(answer, /Next class:/, question);
  });
  assert.match(api.answerWithoutAi("physics course outcomes"), /vector calculus/i);
  assert.match(api.answerWithoutAi("is De Moivre's theorem in maths syllabus"), /De\s*-?\s*Moivre/i);
  assert.match(api.answerWithoutAi("mathematics ii continuous assessment marks"), /Page 30/);
  assert.match(api.answerWithoutAi("list all official subjects"), /Official first-year subjects \(11\)/);
});

test("calculation engine accepts safe forms and rejects executable or non-finite expressions", () => {
  const { api } = createHarness();
  const cases = [
    ["2 + 2", /= 4/],
    ["10-17", /= -7/],
    ["2.5 * 4", /= 10/],
    ["9 ÷ 4", /= 2.25/],
    ["-5 + 2", /= -3/],
    ["12.5% of 80", /= 10/],
    ["square root of 81", /= 9/],
    ["2 + 3 * 4", /= 14/],
    ["(10 + 5) / 3", /= 5/],
    ["2 ^ 8", /= 256/],
    ["2 × 3 + 4", /= 10/]
  ];
  cases.forEach(([question, expected]) => assert.match(api.answerWithoutAi(question), expected, question));
  ["1e309 * 2", "process.exit()", "alert(1)", "2 ** 1000000", "2 ^ 1000000", "Math.random()", "2026-08-17"].forEach((question) => {
    assert.equal(api.runCompassBrain(question), null, question);
  });
});

test("mixed English, Hinglish, Hindi, and Punjabi timetable requests stay deterministic", () => {
  const { api } = createHarness();
  const cases = [
    ["mera math teacher kaun hai", /SUKHMINDER SINGH/],
    ["kal maths kitne baje aur kaha hai", /MATH I.*A9/is],
    ["maths de baad ki aa", /ECONOMICS/i],
    ["math wali class kidhar hai bhai", /A9 \(AUTOMOBILE BLOCK\)/],
    ["mere kitne subjects hain", /<strong>4<\/strong> subjects/i],
    ["mere kinne teachers ne", /<strong>4<\/strong> teachers/i],
    ["mera pehla class monday", /First class on Monday: MATH I/i],
    ["akhri class friday", /Last class on Friday: PROGRAMMING FOR PROBLEM SOLVING/i],
    ["shanivar timetable", /No classes are listed for Saturday/i],
    ["jasmeet mam kad padhaundi aa", /Monday 12:30 PM.*Tuesday 10:30 AM.*Friday 12:30 PM/is],
    ["शनिवार का टाइमटेबल", /No classes are listed for Saturday/i],
    ["मेरी पहली क्लास सोमवार", /First class on Monday: MATH I/i],
    ["ਮੇਰੀ ਪਹਿਲੀ ਕਲਾਸ ਸੋਮਵਾਰ", /First class on Monday: MATH I/i],
    ["गणित की क्लास कहाँ है", /A9 \(AUTOMOBILE BLOCK\)/],
    ["ਫਿਜ਼ਿਕਸ ਕਿੱਥੇ ਹੈ", /A6|G6/]
  ];
  cases.forEach(([question, expected]) => {
    const answer = api.answerWithoutAi(question);
    assert.match(answer, expected, question);
    assert.equal(api.shouldUseActualAi(question), false, question);
  });
});

test("fuzzy subject, weekday, class, and teacher wording does not leave the local path", () => {
  const { api } = createHarness();
  const cases = [
    ["matsh techer", /SUKHMINDER SINGH/],
    ["mathh room", /A9/],
    ["tusday time table", /Tuesday/],
    ["wensday clas", /Wednesday/],
    ["nxt lectur", /class|lecture/i],
    ["programing room", /COMP LAB EC/]
  ];
  cases.forEach(([question, expected]) => {
    assert.equal(api.shouldUseActualAi(question), false, question);
    assert.match(api.answerWithoutAi(question), expected, question);
  });
});

test("calendar formats, invalid dates, and explicit timetable times remain distinct", () => {
  const { api } = createHarness();
  const dateCases = [
    ["what day is 17 August 2026", /Monday/],
    ["which day is 17 Aug 2026", /Monday/],
    ["what day is 17-08-2026", /Monday/],
    ["what day is 2026-08-17", /Monday/],
    ["what day is 29 February 2025", /not valid/],
    ["what day is 29 February 2028", /Tuesday/]
  ];
  dateCases.forEach(([question, expected]) => assert.match(api.answerWithoutAi(question), expected, question));
  const atTime = api.answerWithoutAi("what class is at 10:30 on Monday");
  assert.match(atTime, /ECONOMICS/);
  assert.doesNotMatch(atTime, /In India it is/);
});

test("active profile and branch selection isolate personalized facts", () => {
  const { api } = createHarness();
  api.state.student = { serialNo: "68", currentSerialNo: "68", oldSerialNos: ["41"], crn: "1234567", name: "Test Student", registrationNo: "26019999", branch: "Electronics and Communication Engineering", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR", mentorPhone: "9999999999", academicGroup: "ECBM1", mentorVenue: "F108", venue: "F108", rosterVersion: "12-08-2026" };
  assert.match(api.answerWithoutAi("what is my name"), /Test Student/);
  assert.match(api.answerWithoutAi("my registration number"), /26019999/);
  assert.match(api.answerWithoutAi("what is my CRN"), /1234567/);
  assert.match(api.answerWithoutAi("what is my new serial number"), /Current\/new serial.*68/is);
  assert.match(api.answerWithoutAi("my previous serial number"), /41/);
  assert.match(api.answerWithoutAi("my profile venue"), /Mentor venue.*F108/is);
  assert.match(api.answerWithoutAi("what is my mentor phone number"), /Mentor phone.*9999999999/is);
  assert.match(api.answerWithoutAi("who is my mentor"), /DR TEST MENTOR/);
  const combinedProfile = api.answerWithoutAi("registration number, serial number, mentor");
  assert.match(combinedProfile, /Student details/i);
  assert.match(combinedProfile, /Current serial.*68/is);
  assert.match(combinedProfile, /Registration No\..*26019999/is);
  assert.match(combinedProfile, /Mentor.*DR TEST MENTOR/is);
  assert.doesNotMatch(combinedProfile, /data-kb-followup="(?:My registration number|Who is my mentor\?)"/i);
  const identity = api.answerWithoutAi("who am i");
  assert.match(identity, /Student profile/i);
  assert.match(identity, /Test Student.*Electronics and Communication Engineering.*1234567.*68.*41.*26019999.*ECB.*ECB1.*ECBM1.*DR TEST MENTOR/is);
  assert.match(api.answerWithoutAi("section and subsection"), /Section.*ECB.*Subsection.*ECB1/is);
  assert.equal(api.groupLabel("ECB"), "ECB - Electronics and Communication Engineering");

  api.state.schedule.push({ id: "csa-math", group: "CSA", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "CSA TEACHER", room: "CSA ROOM", type: "L", cohorts: "CSA1" });
  api.state.groups.push("CSA");
  api.state.selectedGroup = "CSA";
  api.state.selectedSubgroup = "CSA1";
  api.buildScheduleIndex();
  api.resetBrainConversation();
  const teachers = api.answerWithoutAi("list all my teachers");
  assert.match(teachers, /CSA TEACHER/);
  assert.doesNotMatch(teachers, /SUKHMINDER SINGH/);
  const rooms = api.answerWithoutAi("list all rooms");
  assert.match(rooms, /CSA ROOM/);
  assert.doesNotMatch(rooms, /A9/);
});

test("Brain 2 and independent Brain 1 render the same verified read-only student facts", () => {
  const { api, context } = createHarness();
  api.state.student = { name: "ACTIVE STUDENT", crn: "9999999", branch: "CS", section: "CSA", subsection: "CSA1" };
  const before = JSON.stringify(api.state.student);
  const records = [{ name: "KAUSHIK JAIN", crn: "2617070", currentSerialNo: "7", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "Dr. Chahat Jain", mentorPhone: "7837005620", academicGroup: "ECBM1", mentorVenue: "G6" }];
  const studentLookup = api.studentLookupContextFromRecords("tell me every detail of Kaushik Jain", records, { version: "12-08-2026" });
  const brain2 = api.answerWithoutAi("tell me every detail of Kaushik Jain", context.CompassBrainV2, { studentLookup });
  const brain1 = api.answerWithoutAi("tell me every detail of Kaushik Jain", null, { studentLookup });
  ["KAUSHIK JAIN", "2617070", "7", "ECB", "ECB1", "Dr. Chahat Jain", "7837005620", "ECBM1", "G6", "Read-only lookup"].forEach((value) => {
    assert.match(brain1, new RegExp(value, "i"), `Brain 1: ${value}`);
    assert.match(brain2, new RegExp(value, "i"), `Brain 2: ${value}`);
  });
  assert.doesNotMatch(brain1, /father|mother|parent/i);
  assert.doesNotMatch(brain2, /father|mother|parent/i);
  assert.doesNotMatch(brain1, /12-08-2026/);
  assert.doesNotMatch(brain2, /12-08-2026/);
  assert.equal(JSON.stringify(api.state.student), before);
});

test("both local Brain paths keep roster versions internal to every profile answer", () => {
  const { api, context } = createHarness();
  api.state.student = { name: "TEST STUDENT", crn: "1234567", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR", rosterVersion: "12-08-2026" };
  const brain2 = api.answerWithoutAi("show my full profile", context.CompassBrainV2);
  const brain1 = api.answerWithoutAi("show my full profile", null);
  [brain1, brain2].forEach((answer) => {
    assert.match(answer, /TEST STUDENT/);
    assert.match(answer, /Verified GNDEC roster/);
    assert.doesNotMatch(answer, /12-08-2026/);
  });
});

test("Brain 2 and independent Brain 1 render official professional faculty details", () => {
  const { api, context } = createHarness();
  const facultyLookup = {
    handled: true, status: "single", query: "chahat jain", source: "https://gndec.ac.in/faculty/", checkedAt: "2026-08-21T00:00:00.000Z",
    fields: { full: true, any: true }, records: [{
      name: "DR. CHAHAT JAIN", department: "Electronics & Communication Engineering", designation: "Assistant Professor",
      email: "chahatjain@gndec.ac.in", experience: "15 years", qualifications: ["Ph.D (ECE)", "M.Tech (ECE)"],
      profileId: "126", photoUrl: "https://gndec.ac.in/images/photo.jpg",
      journalPublications: "18", conferencePublications: "41", memberships: ["Fellow, IETE"], researchInterests: "Antenna design",
      timetableClasses: [{ id: "tue-physics", group: "ECB", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR. CHAHAT JAIN", room: "G6", type: "L" }]
    }]
  };
  for (const engine of [context.CompassBrainV2, null]) {
    const answer = api.answerWithoutAi("full details of Dr Chahat Jain", engine, { facultyLookup });
    ["DR. CHAHAT JAIN", "Assistant Professor", "chahatjain@gndec.ac.in", "15 years", "Ph.D", "18", "41", "Antenna design", "Tuesday", "G6"].forEach((value) => assert.match(answer, new RegExp(value, "i")));
    assert.match(answer, /Official GNDEC faculty directory/i);
    assert.match(answer, /\/api\/faculty\/photo\?id=126/i);
    assert.match(answer, /data-faculty-photo-fallback="https:\/\/gndec\.ac\.in\/images\/photo\.jpg"/i);
    assert.match(answer, /Official GNDEC profile photo of DR\. CHAHAT JAIN/i);
    assert.match(answer, /<details class="answer-disclosure faculty-details-disclosure">/i);
    assert.match(answer, /Open image/i);
    assert.match(answer, /https:\/\/gndec\.ac\.in\/faculty\/\?id=126/i);
    assert.doesNotMatch(answer, /date of birth|26\.12\.1987/i);
  }
});

test("compound subject questions join teacher, rooms, schedule, and official faculty profile", () => {
  const { api, context } = createHarness();
  const question = "Who teaches Math, where are the classes, and show the teacher's profile?";
  const request = api.facultyLookupRequest(question);
  assert.equal(request.term, "sukhminder singh");
  assert.equal(request.fields.full, true);
  const facultyLookup = {
    handled: true, status: "single", query: request.term, source: "https://gndec.ac.in/faculty/", fields: request.fields,
    records: [{
      name: "SUKHMINDER SINGH", department: "Applied Science", designation: "Assistant Professor", profileId: "29",
      photoUrl: "https://gndec.ac.in/images/photo.jpg", email: "sukhmindersingh3@gmail.com", qualifications: ["M.Sc. Mathematics"],
      timetableClasses: [
        { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L" },
        { id: "wed-math", group: "ECB", day: "Wednesday", start: 690, end: 750, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L" }
      ]
    }]
  };
  for (const engine of [context.CompassBrainV2, null]) {
    const answer = api.answerWithoutAi(question, engine, { facultyLookup });
    ["SUKHMINDER SINGH", "MATH I", "A9 (AUTOMOBILE BLOCK)", "Monday", "Wednesday", "Open official faculty profile"].forEach((value) => assert.match(answer, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")));
    assert.match(answer, /Professional details and class schedule/i);
  }
});

test("Brain 2 keeps compound timetable facts attached to each requested subject", () => {
  const { api } = createHarness();
  const question = "when is my physics class and who teaches math and when";
  const result = api.runCompassBrain(question);
  assert.equal(result.intent, "MULTI_SUBJECT_FACTS");
  assert.match(result.answer, /PHYSICS · this week[\s\S]*Schedule/i);
  assert.match(result.answer, /MATH I · this week[\s\S]*Teacher:[\s\S]*SUKHMINDER SINGH[\s\S]*Schedule/i);
  assert.match(result.answer, /DR JASMEET KAUR/i);
  assert.doesNotMatch(result.answer, /Next class:/i);
  assert.deepEqual(Array.from(result.facts.subjects, (item) => item.subject), ["PHYSICS", "MATH I"]);
});

test("faculty lookup renders directory facts before profile enrichment and reuses verified local cache", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), cache: options.cache });
    if (String(url) === "/api/faculty") return { ok: true, async json() { return { source: "https://gndec.ac.in/faculty/", checkedAt: "2026-08-22T00:00:00.000Z", records: [{ name: "DR JASMEET KAUR", designation: "Assistant Professor", department: "Applied Science", email: "jasmeet@gndec.ac.in", profileId: "99", profileUrl: "https://gndec.ac.in/faculty/?id=99" }] }; } };
    if (String(url) === "/api/faculty/profile?id=99") return { ok: true, async json() { return { profile: { profileId: "99", name: "DR JASMEET KAUR", photoUrl: "https://gndec.ac.in/images/jasmeet.jpg", qualifications: ["PhD Physics"], experience: "10 years" } }; } };
    throw new Error(`Unexpected fetch: ${url}`);
  };
  const { api } = createHarness(fetchImpl);
  const base = await api.resolveChatFacultyLookup("full details of DR JASMEET KAUR", { includeProfile: false });
  assert.equal(base.status, "single");
  assert.equal(calls.length, 1, "the profile request must not block the first verified answer");
  assert.equal(calls[0].cache, "no-cache");
  const baseAnswer = api.legacyFacultyLookupAnswer(base);
  assert.match(baseAnswer, /Showing verified directory facts now/i);
  assert.doesNotMatch(baseAnswer, /<img|Experience[\s\S]*Not published/i);

  const enriched = await api.enrichFacultyLookupProfile(base);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].cache, "default");
  assert.equal(enriched.profilePending, false);
  const answer = api.legacyFacultyLookupAnswer(enriched);
  assert.match(answer, /PhD Physics/i);
  assert.match(answer, /\/api\/faculty\/photo\?id=99/i);

  api.state.facultyCache = null;
  const restored = await api.loadFacultyDirectory();
  assert.equal(calls.length, 2, "the verified four-hour device cache should avoid another network lookup");
  assert.equal(restored.records[0].photoUrl, "https://gndec.ac.in/images/jasmeet.jpg");
});

test("plain-name student lookup, teacher details, rooms, and calendar wording stay safely separated", () => {
  const { api, context } = createHarness();
  api.state.student = { name: "ACTIVE STUDENT", crn: "9999999", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR JASMEET KAUR", mentorPhone: "7000000000", mentorVenue: "G6", rosterVersion: "12-08-2026" };

  assert.equal(api.studentLookupRequest("Kaushik Jain").term, "kaushik jain");
  assert.equal(api.studentLookupRequest("full details of Navjot Singh"), null);

  for (const engine of [context.CompassBrainV2, null]) {
    const teacher = api.answerWithoutAi("full details of Navjot Singh", engine);
    assert.match(teacher, /NAVJOT SINGH/i);
    assert.match(teacher, /PROGRAMMING FOR PROBLEM SOLVING/i);
    assert.match(teacher, /COMP LAB EC/i);
    assert.match(teacher, /Friday/i);
    assert.match(teacher, /Not published in the active timetable/i);

    const room = api.answerWithoutAi("how do I reach G6?", engine);
    assert.match(room, /mentor's verified venue/i);
    assert.match(room, /campus map|help desk/i);
    assert.match(room, /will not guess/i);

    assert.match(api.answerWithoutAi("what date is next Monday?", engine), /17 August 2026/i);
    assert.match(api.answerWithoutAi("17th Aug 26 is which day?", engine), /Monday/i);
  }
});

test("active branch, current semester, and first-year subject questions stay personalized and source-grounded", () => {
  const { api } = createHarness();
  api.state.student = { name: "Kaushik Jain", registrationNo: "26011000", branch: "Electronics and Communication Engineering", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR" };
  api.state.syllabusPages = syllabusIndex.pages;
  api.state.syllabus = api.parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));

  assert.match(api.answerWithoutAi("what is my branch?"), /Electronics and Communication Engineering/);
  assert.match(api.answerWithoutAi("meri branch kya hai?"), /Electronics and Communication Engineering/);
  assert.match(api.answerWithoutAi("मेरी ब्रांच कौन सी है?"), /Electronics and Communication Engineering/);
  assert.match(api.answerWithoutAi("ਮੇਰੀ ਬ੍ਰਾਂਚ ਕਿਹੜੀ ਹੈ?"), /Electronics and Communication Engineering/);

  const branchSubjects = api.answerWithoutAi("what subjects do I have in my ECE branch this semester?");
  assert.match(branchSubjects, /Subjects in ECB1/);
  assert.match(branchSubjects, /MATH I/);
  assert.match(branchSubjects, /PROGRAMMING FOR PROBLEM SOLVING/);
  assert.doesNotMatch(branchSubjects, /MATHEMATICS - II/);

  const firstSemester = api.answerWithoutAi("list my first semester subjects");
  assert.match(firstSemester, /Subjects currently listed for ECB1/);
  assert.match(firstSemester, /PHYSICS/);
  assert.doesNotMatch(firstSemester, /MATHEMATICS - II/);
  assert.match(api.answerWithoutAi("pehle semester ke subjects kaun se hain?"), /Subjects currently listed for ECB1/);
  assert.match(api.answerWithoutAi("ਪਹਿਲੇ ਸਮੈਸਟਰ ਦੇ ਵਿਸ਼ੇ ਕਿਹੜੇ ਹਨ?"), /Subjects currently listed for ECB1/);

  const firstYear = api.answerWithoutAi("list the official first year subjects for my branch");
  assert.match(firstYear, /Official first-year subjects \(11\)/);
  assert.match(firstYear, /MATHEMATICS - II/i);
  assert.match(firstYear, /common for all branches/i);
});

test("subjects, teachers, locations, rooms, and buildings compose without unrelated data", () => {
  const { api, context } = createHarness();
  const mathTeacher = api.answerWithoutAi("who teaches maths?");
  assert.match(mathTeacher, /SUKHMINDER SINGH/);
  assert.doesNotMatch(mathTeacher, /DR JASMEET KAUR/);
  for (const engine of [context.CompassBrainV2, null]) {
    ["math teacher", "math teacher name", "teacher ka naam math wala", "math nu kaun padhaunda", "maths ka teacher kaun hai", "गणित का शिक्षक कौन है", "गणित कौन पढ़ाता है", "ਗਣਿਤ ਦਾ ਅਧਿਆਪਕ ਕੌਣ ਹੈ", "ਕੌਣ ਗਣਿਤ ਪੜ੍ਹਾਉਂਦਾ ਹੈ", "matsh techer"].forEach((question) => {
      const answer = api.answerWithoutAi(question, engine);
      assert.match(answer, /SUKHMINDER SINGH/i, question);
      assert.doesNotMatch(answer, /No verified faculty match/i, question);
    });
  }
  assert.equal(api.facultyLookupRequest("math teacher"), null);
  assert.equal(api.facultyLookupRequest("math teacher name"), null);
  ["next holiday", "all holidays", "all september holidays"].forEach((question) => {
    assert.equal(api.facultyLookupRequest(question), null, question);
  });
  const mathTeacherProfile = api.facultyLookupRequest("full profile of my math teacher");
  assert.equal(mathTeacherProfile.term, "sukhminder singh");
  assert.equal(mathTeacherProfile.department, "Applied Science");
  const physicsPlaces = api.answerWithoutAi("all physics locations this week");
  assert.match(physicsPlaces, /A6 \(AUTOMOBILE BLOCK\)/);
  assert.match(physicsPlaces, /G6/);
  assert.doesNotMatch(physicsPlaces, /COMP LAB EC/);
  const allPairs = api.answerWithoutAi("rooms of all subjects");
  assert.match(allPairs, /MATH I:<\/strong> A9/);
  assert.match(allPairs, /PROGRAMMING FOR PROBLEM SOLVING:<\/strong> COMP LAB EC/);
  assert.match(api.answerWithoutAi("which building is A9 in"), /AUTOMOBILE BLOCK/);
});

test("large prompt matrix never exposes internals, NaN, or undefined factual output", () => {
  const { api } = createHarness();
  const prompts = [
    "hello", "good evening", "how are you", "are you ai", "thanks", "bye",
    "list all teachers", "list all rooms", "list my subjects", "teachers of all subjects",
    "where is maths", "who teaches physics", "what classes are in A9", "Friday timetable",
    "is there physics economics class on Friday", "Which day has the most classes this week?",
    "Which teacher do I see most?", "How many classes tomorrow?", "Which rooms Monday?",
    "25% of 400", "sqrt(625)", "what day is 1 January 2027", "what day is 31 April 2027",
    "kal math kaha hai", "matsh techer", "maths de baad ki aa", "tusday timetable",
    "privacy", "offline", "hostel", "library", "exam pattern", "study advice"
  ];
  prompts.forEach((question) => {
    const answer = api.answerWithoutAi(question);
    assert.ok(typeof answer === "string" && answer.trim(), question);
    assert.doesNotMatch(answer, /BRAIN_(?:EXCEPTION|DISABLED)|fallbackReason|\bNaN\b|\bundefined\b|TypeError|ReferenceError/, question);
  });
});

test("Brain normalization is stable and a 500-question local batch stays bounded", () => {
  const { api, context } = createHarness();
  const brain = context.CompassBrainV2;
  const variants = ["  Kal   MATHS kaha hai?? ", "NXT lectur", "AJJ class KITHE aa", "Matsh Techer"];
  variants.forEach((value) => assert.equal(brain.normalize(brain.normalize(value)), brain.normalize(value)));
  const supplied = { classes: api.state.schedule, profileLabel: "ECB1", now: { day: "Monday" }, nextStudyDay: { day: "Tuesday", label: "Tuesday" }, conversation: {} };
  const prompts = ["hello", "25% of 240", "list all rooms", "who teaches maths", "which day has the most classes"];
  const started = performance.now();
  for (let index = 0; index < 500; index += 1) brain.process(prompts[index % prompts.length], supplied);
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1500, `500 local questions took ${elapsed.toFixed(1)} ms`);
});

test("Brain v2 exposes privacy-safe coverage metrics without retaining query text", () => {
  const { api, context } = createHarness();
  const brain = context.CompassBrainV2;
  const supplied = { classes: api.state.schedule, profileLabel: "ECB1", now: { day: "Monday", minutes: 480 }, nextStudyDay: { day: "Tuesday", label: "Tuesday" }, conversation: {} };
  brain.process("Which day is lightest?", supplied);
  brain.process("a deliberately unsupported private phrase 849271", supplied);
  const metrics = brain.getMetrics();
  assert.equal(metrics.processed, 2);
  assert.equal(metrics.handled, 1);
  assert.equal(metrics.fallback, 1);
  assert.equal(metrics.intents.LIGHTEST_DAY, 1);
  assert.equal(metrics.fallbackReasons.UNSUPPORTED_INTENT, 1);
  assert.ok(metrics.coverage > 0 && metrics.coverage < 1);
  assert.doesNotMatch(JSON.stringify(metrics), /849271|private phrase/i);
});

test("Brain v2 answers against the complete checked-in official FET timetable, not only synthetic records", () => {
  const { api } = createHarness();
  const schedule = api.parseFetTimetable(officialGroupFixture);
  assert.ok(schedule.length > 500);
  api.state.schedule = schedule;
  api.state.groups = [...new Set(schedule.map((item) => item.group))];
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.buildScheduleIndex();
  api.resetBrainConversation();

  const teachers = api.answerWithoutAi("list all my teachers");
  assert.match(teachers, /JASMEET KAUR/);
  assert.match(teachers, /SUKHMINDER SINGH/);
  const math = api.answerWithoutAi("all maths locations this week");
  assert.match(math, /MATH I/);
  assert.match(math, /AUTOMOBILE BLOCK/);
  const friday = api.answerWithoutAi("Friday timetable");
  assert.match(friday, /MANUFACTURING PRACTICES/);
  assert.match(friday, /Free lecture/);
  const availability = api.answerWithoutAi("is there any physics economics class on Friday; if yes give location and teacher name");
  assert.match(availability, /PHYSICS/);
  assert.match(availability, /ECONOMICS/);
  const teacherSubjects = api.answerWithoutAi("List all my teachers with there subjects");
  assert.match(teacherSubjects, /SUKHMINDER SINGH:<\/strong> MATH I/i);
  assert.match(teacherSubjects, /NAVJOT SINGH \(EC\):<\/strong> PROGRAMMING FOR PROBLEM SOLVING/i);
  const detailedTeachers = api.answerWithoutAi("how many teachers and which teacher teaches which subject");
  assert.match(detailedTeachers, /DR JASMEET KAUR:<\/strong> PHYSICS.*Lecture/is);
  assert.match(detailedTeachers, /DR JASPREET SINGH:<\/strong> PHYSICS.*Practical\/Lab/is);
  assert.match(detailedTeachers, /DR HARPREET KAUR GREWAL:<\/strong> PHYSICS.*Practical\/Lab/is);
  assert.doesNotMatch(teacherSubjects, /Official syllabus search|Page \d+:/i);
  const mathCount = api.answerWithoutAi("total math lectures per week and duration");
  assert.match(mathCount, /<strong>4<\/strong> MATH I timetable periods this week/i);
  assert.match(mathCount, /Total scheduled duration: <strong>4 hours<\/strong>/i);
  assert.match(api.answerWithoutAi("duration"), /MATH I duration.*Total scheduled duration: <strong>4 hours<\/strong>/is);
  assert.match(api.answerWithoutAi("Saturday timetable"), /No classes are listed for Saturday/i);
  assert.match(api.answerWithoutAi("first class Monday"), /First class on Monday: MATH I/i);
  assert.match(api.answerWithoutAi("when do I finish Friday"), /finish at <strong>4:20 PM/i);

  assert.match(api.answerWithoutAi("Which day is lightest?"), /lightest/i);
  assert.match(api.answerWithoutAi("Which building do I use most this week?"), /most this week/i);
  const nextMath = api.answerWithoutAi("When is my next Maths class?");
  assert.match(nextMath, /Next MATH I class/i);
  assert.doesNotMatch(nextMath, /<ol>[\s\S]*MATH I[\s\S]*MATH I/i);

  api.resetBrainConversation();
  api.answerWithoutAi("next class");
  const firstAnchor = api.state.brainConversation.activeClassId;
  assert.ok(firstAnchor);
  api.answerWithoutAi("where?");
  api.answerWithoutAi("who teaches it?");
  assert.equal(api.state.brainConversation.activeClassId, firstAnchor);
  const after = api.answerWithoutAi("and after that?");
  assert.match(after, /After|No later class/i);
  if (/After/i.test(after)) {
    assert.equal(api.state.brainConversation.previousClassId, firstAnchor);
    assert.match(api.answerWithoutAi("same room?"), /Yes|No|can’t verify/i);
  }
});
