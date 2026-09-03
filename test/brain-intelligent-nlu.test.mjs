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
  api.state.groups = ["ECB", "CSD"];
  api.state.allClasses = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-eco", group: "ECB", day: "Monday", start: 630, end: 690, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-phy", group: "ECB", day: "Monday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "csd-mon-math", group: "CSD", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "TR-1", type: "L", cohorts: "CSD2" },
    { id: "csd-mon-pps", group: "CSD", day: "Monday", start: 690, end: 750, subject: "PPS", teacher: "ER AMANDEEP KAUR", room: "TR-2", type: "L", cohorts: "CSD2" }
  ];
  api.state.schedule = api.state.allClasses.filter((c) => c.group === "ECB");
  api.buildScheduleIndex();
  return { context, api };
}

test("Multi-intent query decomposition splits independent intents cleanly", () => {
  const { context } = createHarness();
  const kernel = context.CompassBrainKernel;

  const parts1 = kernel.decomposeQuery("mohit timetable tmro and holiday?");
  assert.equal(parts1.length, 2);
  assert.match(parts1[0], /mohit timetable tomorrow/);
  assert.match(parts1[1], /holiday/);

  const parts2 = kernel.decomposeQuery("compare ECB1 and CSD2 and is tomorrow holiday?");
  assert.equal(parts2.length, 2);
  assert.match(parts2[0], /compare ecb1 and csd2/);
  assert.match(parts2[1], /tomorrow holiday/);

  // Conjunction inside comparison remains single unit
  const compOnly = kernel.decomposeQuery("compare ECB1 and CSD2");
  assert.equal(compOnly.length, 1);
  assert.equal(compOnly[0], "compare ecb1 and csd2");
});

test("Typo and abbreviation tolerance normalizes casual and broken queries", () => {
  const { context } = createHarness();
  const kernel = context.CompassBrainKernel;

  assert.equal(kernel.normalize("tmrw chutti hai kya"), "tomorrow holiday hai kya");
  assert.equal(kernel.normalize("phys creds"), "physics credits");
  assert.equal(kernel.normalize("econ marks"), "economics marks");
  assert.equal(kernel.normalize("campass help me"), "compass help me");
  assert.equal(kernel.normalize("ec-b1 timetable"), "ecb1 timetable");
});

test("Side-by-side comparison engine resolves groups and computes commonality", () => {
  const { context, api } = createHarness();
  const result = api.runCompassBrain("compare ECB1 vs CSD2 Monday");
  assert.ok(result);
  assert.equal(result.handled, true);
  assert.match(result.answer, /ECB1/);
  assert.match(result.answer, /CSD2/);
  assert.match(result.answer, /Monday/);
});

test("Common free periods and shared slots computation", () => {
  const { context, api } = createHarness();
  const result = api.runCompassBrain("when are ECB1 and CSD2 both free on Monday");
  assert.ok(result);
  assert.equal(result.handled, true);
  assert.match(result.answer, /Common Free (?:Slots|Periods)|Both Free/i);
});

test("Academic credits and scheme inquiries without external AI", () => {
  const { context, api } = createHarness();

  const econCredits = api.runCompassBrain("Economics credits");
  assert.ok(econCredits);
  assert.equal(econCredits.intent, "ACADEMIC_SUBJECT_CREDITS");
  assert.match(econCredits.answer, /Economics for Engineers/);
  assert.match(econCredits.answer, /3 Credits/);

  const totalCredits = api.runCompassBrain("how many total credits in first year");
  assert.ok(totalCredits);
  assert.equal(totalCredits.intent, "ACADEMIC_TOTAL_CREDITS");
  assert.match(totalCredits.answer, /40 Credits/);
});

test("Capabilities and Creator questions resolve deterministically", () => {
  const { context, api } = createHarness();

  const capabilities = api.runCompassBrain("what can compass do");
  assert.ok(capabilities);
  assert.equal(capabilities.intent, "CAPABILITIES");
  assert.match(capabilities.answer, /Ask Compass — Intelligent GNDEC Assistant/);

  const creator = api.runCompassBrain("who built this web");
  assert.ok(creator);
  assert.equal(creator.intent, "CREATOR");
  assert.match(creator.answer, /Kaushik Jain from ECE - B1/);
});
