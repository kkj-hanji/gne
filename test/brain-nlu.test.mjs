import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const kernelSource = await readFile(new URL("../public/brain-kernel.js", import.meta.url), "utf8");
const brainV12Source = await readFile(new URL("../public/brain-v1-2.js", import.meta.url), "utf8");
const brainV22Source = await readFile(new URL("../public/brain-v2-2.js", import.meta.url), "utf8");
const brainSource = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const knowledgeGraph = JSON.parse(await readFile(new URL("../public/data/knowledge-graph.json", import.meta.url), "utf8"));
const syllabusIndex = JSON.parse(await readFile(new URL("../public/data/first-year-syllabus-index.json", import.meta.url), "utf8"));

const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*?(?=function kbClean)/,
  ""
).replace(
  /function kbClean/,
  "globalThis.__brainNluTest = { state, buildScheduleIndex, answerWithoutAi, runCompassBrain, canonicalTimetableQuestion, isHolidayCalendarQuestion, studentLookupRequest, facultyLookupRequest, answerFromKnowledgeBase, resolveChatStudentLookup, resolveChatFacultyLookup, looksLikePlainStudentNameQuery };\nfunction kbClean"
);

function createHarness() {
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
    fetch: async () => ({ ok: true, json: async () => ({}) })
  });
  vm.runInContext(kernelSource, context);
  vm.runInContext(brainV12Source, context);
  vm.runInContext(brainV22Source, context);
  vm.runInContext(brainSource, context);
  vm.runInContext(sourceUnderTest, context);
  const api = context.__brainNluTest;
  api.state.nowOverride = "2026-08-16T04:30:00.000Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.groups = ["ECB"];
  api.state.schedule = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-economics", group: "ECB", day: "Monday", start: 630, end: 690, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-physics", group: "ECB", day: "Monday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" }
  ];
  api.buildScheduleIndex();
  return { context, api };
}

test("NLU: Hinglish and Punjabi slang normalizations in kernel", () => {
  const { context } = createHarness();
  const kernel = context.CompassBrainKernel;
  assert.ok(kernel, "Kernel exists");
  
  // Time and date slang
  assert.match(kernel.normalize("kado class hai"), /when/i);
  assert.match(kernel.normalize("kinne vaje class hai"), /when/i);
  assert.match(kernel.normalize("kitne baje math hai"), /when/i);
  assert.match(kernel.normalize("kalle di class"), /tomorrow/i);
  assert.match(kernel.normalize("ajj di class"), /today/i);
  
  // Location and room slang
  assert.match(kernel.normalize("kithe hai room"), /where/i);
  assert.match(kernel.normalize("keda kamra hai"), /who|where/i);
  
  // Free period slang
  assert.match(kernel.normalize("vella time kab hai"), /free/i);
  assert.match(kernel.normalize("velle period kab hain"), /free/i);
  assert.match(kernel.normalize("khaali time"), /free/i);
  
  // Attendance and bunk slang
  assert.match(kernel.normalize("aaj bunk karna hai"), /bunk/i);
  assert.match(kernel.normalize("hazri kitni chahiye"), /attendance/i);
  assert.match(kernel.normalize("haziri percentage"), /attendance/i);
  
  // Teacher designations
  assert.match(kernel.normalize("sukhminder sir ka room"), /teacher/i);
  assert.match(kernel.normalize("jasmeet mam"), /teacher/i);
  assert.match(kernel.normalize("prof jasmeet kaur"), /teacher/i);
});

test("NLU: Student vs Faculty lookup differentiation", () => {
  const { api } = createHarness();

  // Student specific queries with keywords/fields
  const studentQ1 = api.studentLookupRequest("student Harpreet CRN 2315001");
  assert.ok(studentQ1, "Should recognize student keyword query");
  assert.equal(studentQ1.flags.crn, true);

  const studentQ2 = api.studentLookupRequest("roll no 2315001 roster");
  assert.ok(studentQ2, "Should recognize roster/roll student query");

  // Faculty specific queries with keywords/designations
  const facultyQ1 = api.facultyLookupRequest("who is Dr Jasmeet Kaur");
  assert.ok(facultyQ1, "Should recognize Dr faculty query");
  assert.equal(facultyQ1.term.toLowerCase(), "jasmeet kaur");

  const facultyQ2 = api.facultyLookupRequest("Sanjam mam contact email");
  assert.ok(facultyQ2, "Should recognize mam/email faculty query");

  const facultyQ3 = api.facultyLookupRequest("Sukhminder sir cabin");
  assert.ok(facultyQ3, "Should recognize sir faculty query");

  // Explicit student keyword must not be captured as faculty lookup
  const facultyQFromStudent = api.facultyLookupRequest("student roll 12345");
  assert.equal(facultyQFromStudent, null, "Student query must not route to faculty");
});

test("NLU: holiday phrases are never routed to a student or faculty search", () => {
  const { api } = createHarness();
  ["all holidays", "september holidays", "holidays in september", "gazetted", "restricted holiday", "is 4 september a holiday"].forEach((question) => {
    assert.equal(api.isHolidayCalendarQuestion(question), true, question);
    assert.equal(api.studentLookupRequest(question), null, `${question} must not become a student lookup`);
    assert.equal(api.facultyLookupRequest(question), null, `${question} must not become a faculty lookup`);
  });
});

test("NLU: Knowledge Base answers for hostel rules, links, and portals", () => {
  const { api } = createHarness();

  const hostelAns = api.answerFromKnowledgeBase("what are hostel rules");
  assert.ok(hostelAns, "Hostel rules query must be answered");
  const hostelText = typeof hostelAns === "string" ? hostelAns : hostelAns.reply;
  assert.match(hostelText, /hostel/i);
  assert.match(hostelText, /can change|latest official/i);

  const timetableLinksAns = api.answerFromKnowledgeBase("official timetable index link");
  assert.ok(timetableLinksAns, "Timetable links query must be answered");
  const timetableText = typeof timetableLinksAns === "string" ? timetableLinksAns : timetableLinksAns.reply;
  assert.match(timetableText, /section, subsection, faculty, room, subject, and programme/i);
  assert.match(timetableText, /appsc\.gndec\.ac\.in\/time_tables/i);

  const appscAns = api.answerFromKnowledgeBase("applied sciences notice board link");
  assert.ok(appscAns, "Applied sciences query must be answered");
  const appscText = typeof appscAns === "string" ? appscAns : appscAns.reply;
  assert.match(appscText, /notice-board/i);

  const rosterAns = api.answerFromKnowledgeBase("CE student roster PDF download");
  assert.ok(rosterAns, "Rosters query must be answered");
  const rosterText = typeof rosterAns === "string" ? rosterAns : rosterAns.reply;
  assert.match(rosterText, /will not guess a PDF filename/i);
  assert.match(rosterText, /appsc\.gndec\.ac\.in\/time_tables/i);

  const calendarAns = api.answerFromKnowledgeBase("academic calendar semester timeline");
  assert.ok(calendarAns, "Academic calendar query must be answered");
  const calendarText = typeof calendarAns === "string" ? calendarAns : calendarAns.reply;
  assert.match(calendarText, /gndec\.ac\.in\/\?q=node\/23/i);
});

test("NLU: Knowledge graph JSON data validity", () => {
  assert.ok(knowledgeGraph.portalLinks && Array.isArray(knowledgeGraph.portalLinks));
  assert.ok(knowledgeGraph.portalLinks.length >= 4);
  assert.ok(knowledgeGraph.hostelRules.summary);
  assert.equal(knowledgeGraph.autonomousRegulations.sourceRequired, true);
  assert.match(knowledgeGraph.policy, /current official source/i);
});

test("NLU: Attendance and CGPA math calculation questions", () => {
  const { api } = createHarness();

  const cgpaAns = api.answerWithoutAi("8.4 cgpa in percentage");
  assert.ok(cgpaAns, "CGPA to percentage should resolve");
  assert.match(cgpaAns, /79\.8%/);

  const pctAns = api.answerWithoutAi("79.8 percentage to cgpa");
  assert.ok(pctAns, "Percentage to CGPA should resolve");
  assert.match(pctAns, /8\.4 CGPA/);

  const attRuleAns = api.answerFromKnowledgeBase("attendance rule minimum percentage");
  assert.ok(attRuleAns, "Attendance rule should return 75%");
  const attText = typeof attRuleAns === "string" ? attRuleAns : attRuleAns.reply;
  assert.match(attText, /75%/);
});

test("NLU: Creator, campus places, and holiday assistant intelligence", () => {
  const { api } = createHarness();

  const creatorAns = api.answerWithoutAi("who built this web (i am kaushik jain from ece - b1 )");
  assert.ok(creatorAns, "Creator query must be answered");
  assert.match(creatorAns, /Kaushik Jain from ECE - B1/i);

  const libraryAns = api.answerWithoutAi("where is the library");
  assert.ok(libraryAns, "Library location query must be answered");
  assert.match(libraryAns, /Official GNDEC Library/i);
  assert.doesNotMatch(libraryAns, /between the Main Block|Workshop complex/i);

  const mechAns = api.answerWithoutAi("where is mechanical block");
  assert.ok(mechAns, "Mechanical block location query must be answered");
  assert.match(mechAns, /will not guess a block, floor, or landmark/i);

  const holidayMonthAns = api.answerWithoutAi("holidays in November 2026");
  assert.ok(holidayMonthAns, "Holiday month query must be answered");
  assert.match(holidayMonthAns, /November 2026/i);
});
