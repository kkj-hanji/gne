import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const kernelSource = await readFile(new URL("../public/brain-kernel.js", import.meta.url), "utf8");
const v12Source = await readFile(new URL("../public/brain-v1-2.js", import.meta.url), "utf8");
const v22Source = await readFile(new URL("../public/brain-v2-2.js", import.meta.url), "utf8");
const v2Source = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const swSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");

function createKernelHarness() {
  const context = vm.createContext({ console, Date, Math, JSON, RegExp, String, Number, Array, Object, Set, Map });
  vm.runInContext(kernelSource, context);
  return context;
}

function createBrainHarness() {
  const context = createKernelHarness();
  vm.runInContext(v12Source, context);
  vm.runInContext(v22Source, context);
  return context;
}

// ---- Kernel unit checks ----

test("kernel normalization unifies relative-day aliases across four languages", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  assert.match(kernel.normalize("aaj ka timetable"), /today/);
  assert.match(kernel.normalize("kal maths"), /tomorrow/);
  assert.match(kernel.normalize("parson kya hai"), /day after tomorrow/);
  assert.match(kernel.normalize("parso timetable"), /day after tomorrow/);
  assert.match(kernel.normalize("आज का टाइमटेबल"), /today/);
  assert.match(kernel.normalize("ਕੱਲ੍ਹ ਦਾ ਟਾਇਮਟੇਬਲ"), /tomorrow/);
});

test("kernel arithmetic rejects executable input and non-finite results", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  assert.equal(kernel.evaluateArithmetic("2 + 3 * 4"), 14);
  assert.equal(kernel.evaluateArithmetic("(10 + 5) / 3"), 5);
  assert.equal(kernel.solveLinearEquation("solve 2x + 3 = 11")?.solution, 4);
  ["process.exit()", "Math.random()", "constructor"].forEach((input) => {
    const expression = kernel.sanitizeArithmetic(input);
    if (expression) {
      assert.throws(() => kernel.evaluateArithmetic(expression), undefined, input);
    }
  });
  // Executable-looking text is defused into inert arithmetic, never run.
  assert.equal(kernel.sanitizeArithmetic("alert(1)"), "(1)");
  assert.throws(() => kernel.evaluateArithmetic("1e309 * 2"));
  assert.throws(() => kernel.evaluateArithmetic("10 / 0"));
});

test("kernel memory stays bounded and preserves pending clarification plus comparison", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  let memory = kernel.createMemory(null);
  for (let index = 0; index < 30; index += 1) {
    memory = kernel.updateMemory(memory, {}, `question number ${index}`, "TEST_INTENT", "");
  }
  assert.ok(memory.recentTurns.length <= 8, `recentTurns should stay bounded, got ${memory.recentTurns.length}`);
  const withPending = kernel.updateMemory(memory, {
    pending: { kind: "person", candidates: [{ name: "Aman Kumar", section: "ECB" }, { name: "Aman Kumar", section: "CSA" }], turn: memory.turnCount + 1 }
  }, "find student Aman Kumar", "PERSON_MULTIPLE_MATCHES", "");
  assert.equal(withPending.pending.candidates.length, 2);
  const withComparison = kernel.updateMemory(withPending, {
    comparison: { left: "ECB1", right: "ECB2", sourceVersion: "rev-42" }
  }, "compare ECB1 vs ECB2", "TIMETABLE_COMPARISON", "rev-42");
  assert.equal(withComparison.comparison.left, "ECB1");
  assert.equal(withComparison.comparison.right, "ECB2");
  assert.equal(withComparison.comparison.sourceVersion, "rev-42");
  // Pending clarifications expire after the bounded turn window.
  let expired = withComparison;
  for (let index = 0; index < 6; index += 1) expired = kernel.updateMemory(expired, {}, "unrelated question", "OTHER", "");
  assert.equal(expired.pending, null);
});

test("kernel result factory keeps object facts and validates shapes", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  const outcome = kernel.result("CALENDAR_EXACT_DATE", 0.99, "<p>Monday</p>", { iso: "2026-08-17" }, ["step"]);
  assert.deepEqual(outcome.facts, { iso: "2026-08-17" });
  assert.equal(kernel.validateShape(outcome, 0.82).accepted, true);
  assert.equal(kernel.validateShape({ ...outcome, confidence: 0.5 }, 0.82).accepted, false);
  assert.equal(kernel.validateShape({ ...outcome, verified: false }, 0.82).accepted, false);
  assert.equal(kernel.validateShape({ ...outcome, answer: "<script>x</script>" }, 0.82).accepted, false);
});

// ---- Brain 1.2 privacy and search flows ----

const rosterFixture = [
  { name: "AMAN KUMAR", crn: "2610001", registrationNo: "26010001", currentSerialNo: "11", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR" },
  { name: "AMAN KUMAR", crn: "2610002", registrationNo: "26010002", currentSerialNo: "12", branch: "CS", section: "CSA", subsection: "CSA1", mentor: "DR OTHER MENTOR" },
  { name: "KAUSHIK JAIN", crn: "2617070", registrationNo: "26170000", currentSerialNo: "7", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR CHAHAT JAIN" }
];
const facultyFixture = [
  { name: "DR CHAHAT JAIN", profileId: "126", designation: "Assistant Professor", department: "Electronics & Communication Engineering", email: "chahatjain@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=126" },
  { name: "DR JASMEET KAUR", profileId: "99", designation: "Assistant Professor", department: "Applied Science", email: "jasmeet@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=99" }
];

function personContext(overrides = {}) {
  return {
    calendarDate: "2026-08-16",
    datasetVersion: "rev-42",
    studentRoster: rosterFixture,
    facultyDirectory: facultyFixture,
    conversation: {},
    ...overrides
  };
}

test("brain 1.2 explicit student search resolves a unique verified record", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("find student Kaushik Jain", personContext());
  assert.equal(outcome.handled, true);
  assert.equal(outcome.intent, "STUDENT_DETAILS");
  assert.match(outcome.answer, /KAUSHIK JAIN/);
  assert.match(outcome.answer, /2617070/);
  assert.match(outcome.answer, /DR CHAHAT JAIN/);
  assert.match(outcome.answer, /read-only lookup/i);
});

test("brain 1.2 duplicate students show only safe disambiguators and open a clarification", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("find student Aman Kumar", personContext());
  assert.equal(outcome.intent, "PERSON_MULTIPLE_MATCHES");
  assert.match(outcome.answer, /ECB/);
  assert.match(outcome.answer, /CSA/);
  assert.doesNotMatch(outcome.answer, /2610001|2610002|26010001|26010002|serial/i);
  assert.equal(outcome.context.pending.kind, "person");
  assert.equal(outcome.context.pending.candidates.length, 2);
});

test("brain 1.2 bare name never searches the private roster", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("Kaushik Jain", personContext());
  assert.equal(outcome.intent, "PERSON_KIND_CLARIFY");
  assert.doesNotMatch(outcome.answer, /2617070/);
  assert.match(outcome.answer, /privacy/i);
});

test("brain 1.2 faculty search reads only the public directory", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("faculty Dr Chahat Jain", personContext());
  assert.equal(outcome.intent, "FACULTY_DETAILS");
  assert.match(outcome.answer, /DR CHAHAT JAIN/);
  assert.match(outcome.answer, /Assistant Professor/);
  assert.match(outcome.answer, /chahatjain@gndec\.ac\.in/);
  assert.doesNotMatch(outcome.answer, /AMAN KUMAR|KAUSHIK JAIN/);
});

test("brain 1.2 explicit search without the word student prefers the public directory", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("find Chahat Jain", personContext());
  assert.equal(outcome.intent, "FACULTY_DETAILS");
  const missing = brain.process("find Nobody Singh", personContext());
  assert.equal(missing.intent, "FACULTY_NOT_FOUND");
  assert.match(missing.answer, /find student/i);
});

test("brain 1.2 unsupported questions fall back instead of fabricating", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("what is the meaning of life", personContext());
  assert.equal(outcome.handled, false);
  assert.equal(outcome.fallbackReason, "UNSUPPORTED_INTENT");
});

// ---- Brain 2.2 comparison engine ----

const comparisonClasses = [
  { id: "a-mon-math", group: "ECB1", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "" },
  { id: "b-mon-math", group: "ECB2", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "" },
  { id: "a-tue-phys", group: "ECB1", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "" },
  { id: "b-tue-phys", group: "ECB2", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR OTHER TEACHER", room: "G6", type: "L", cohorts: "" },
  { id: "a-wed-econ", group: "ECB1", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "" },
  { id: "b-thu-pps", group: "ECB2", day: "Thursday", start: 750, end: 810, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "" }
];

function comparisonContext(overrides = {}) {
  return {
    calendarDate: "2026-08-16",
    datasetVersion: "rev-42",
    allClasses: comparisonClasses,
    conversation: {},
    ...overrides
  };
}

test("brain 2.2 compares two timetables with scope, revision, and profile safety", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const outcome = brain.process("Compare ECB1 vs ECB2 timetable", comparisonContext());
  assert.equal(outcome.handled, true);
  assert.equal(outcome.intent, "TIMETABLE_COMPARISON");
  assert.match(outcome.answer, /Compared: ECB1 and ECB2/);
  assert.match(outcome.answer, /official GNDEC timetable, rev-42/);
  assert.match(outcome.answer, /Profile unchanged/);
  assert.match(outcome.answer, /DR OTHER TEACHER/);
  assert.match(outcome.answer, /Only in ECB1/);
  assert.match(outcome.answer, /ECONOMICS/);
  assert.match(outcome.answer, /Only in ECB2/);
  assert.match(outcome.answer, /PROGRAMMING FOR PROBLEM SOLVING/);
  assert.equal(outcome.context.comparison.left, "ECB1");
  assert.equal(outcome.context.comparison.right, "ECB2");
  assert.equal(outcome.context.comparison.sourceVersion, "rev-42");
});

test("brain 2.2 comparison follow-up reuses stored selections for a scoped day", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const first = brain.process("Compare ECB1 vs ECB2", comparisonContext());
  const followUp = brain.process("What differs on Tuesday?", comparisonContext({ conversation: first.context }));
  assert.equal(followUp.handled, true);
  assert.equal(followUp.intent, "TIMETABLE_COMPARISON");
  assert.match(followUp.answer, /Tuesday only/);
  assert.match(followUp.answer, /DR OTHER TEACHER/);
  assert.doesNotMatch(followUp.answer, /ECONOMICS/);
});

test("brain 2.2 refuses unverifiable codes and identical comparisons honestly", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const unknown = brain.process("Compare ECB1 vs ZZZ9", comparisonContext());
  assert.equal(unknown.intent, "COMPARE_CLARIFY");
  assert.match(unknown.answer, /could not verify/);
  const same = brain.process("Compare ECB1 vs ECB1", comparisonContext());
  assert.equal(same.intent, "COMPARE_SAME");
});

test("brain 2.2 stale stored comparison is not reused after data changes", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const first = brain.process("Compare ECB1 vs ECB2", comparisonContext());
  const changed = comparisonContext({
    conversation: first.context,
    allClasses: comparisonClasses.filter((item) => item.group !== "ECB2")
  });
  const followUp = brain.process("What differs on Monday?", changed);
  assert.equal(followUp.intent, "COMPARISON_STALE");
  assert.match(followUp.answer, /no longer verifiable/);
});

// ---- Brain 2.2 pending-clarification consumption ----

test("brain 2.2 consumes a numbered choice from an open clarification", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const pendingConversation = {
    recentTurns: [],
    pending: {
      kind: "person",
      candidates: [
        { kind: "student", id: "2610001", name: "AMAN KUMAR", branch: "EC", section: "ECB" },
        { kind: "student", id: "2610002", name: "AMAN KUMAR", branch: "CS", section: "CSA" }
      ],
      turn: 1
    },
    lastIntent: "PERSON_MULTIPLE_MATCHES"
  };
  const outcome = brain.process("2", comparisonContext({ conversation: pendingConversation }));
  assert.equal(outcome.handled, true);
  assert.equal(outcome.intent, "PENDING_RESOLVED");
  assert.match(outcome.answer, /CSA/);
  assert.equal(outcome.context.pending, null);
});

// ---- Suggestions ----

test("brain suggestions adapt to comparison state and typed fragments", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const withComparison = comparisonContext({
    conversation: { recentTurns: [], comparison: { left: "ECB1", right: "ECB2", sourceVersion: "rev-42" } }
  });
  const afterCompare = brain.suggest("", withComparison);
  assert.ok(afterCompare.some((item) => /differs on Monday/i.test(item)), JSON.stringify(afterCompare));
  const typed = brain.suggest("ecb", comparisonContext());
  assert.ok(typed.some((item) => /ECB1 timetable/.test(item)), JSON.stringify(typed));
  assert.ok(brain.suggest("", comparisonContext()).length > 0);
});

// ---- App integration ----

// ---- App integration ----

const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*?(?=function kbClean)/,
  ""
).replace(
  /function kbClean/,
  "globalThis.__brainIntegrationTest = { state, answerWithoutAi, runCompassBrain, setCompassBrainV2Enabled, resetBrainConversation, buildScheduleIndex, sanitizeSchedule };\nfunction kbClean"
);

function createAppHarness() {
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
    fetch: () => { throw new Error("Network access is forbidden in brain tests."); }
  });
  vm.runInContext(kernelSource, context);
  vm.runInContext(v12Source, context);
  vm.runInContext(v22Source, context);
  vm.runInContext(v2Source, context);
  vm.runInContext(sourceUnderTest, context);
  const api = context.__brainIntegrationTest;
  api.state.nowOverride = "2026-08-16T04:30:00.000Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.groups = ["ECB"];
  api.state.schedule = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "tue-physics", group: "ECB", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB1" }
  ];
  api.buildScheduleIndex();
  api.setCompassBrainV2Enabled(true);
  return { api, context, storage };
}

test("the browser loads kernel and new brains before brain-v2 and the application entry point", () => {
  const positions = ["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js", "brain-v2.js", "app.js"].map((file) => {
    const position = pageSource.search(new RegExp(`<script src="${file.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:\\?[^"<>]*)?"></script>`));
    assert.ok(position >= 0, `${file} must be referenced from index.html`);
    return position;
  });
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] > positions[index - 1], `script order broken at ${index}`);
  }
});

test("the service worker shell pre-caches every brain script at the current version", () => {
  ["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js"].forEach((file) => {
    assert.ok(swSource.includes(`/${file}?v=`), `${file} missing from SHELL`);
  });
  const cacheMatch = swSource.match(/CACHE_NAME = `\$\{CACHE_PREFIX\}([^`]+)`/);
  assert.ok(cacheMatch && cacheMatch[1] >= "20260825-1", "cache name must be bumped for the new brains");
});

test("settings and timetable view hooks stay wired to the shipped UI ids and classes", () => {
  assert.match(pageSource, /id="settings-freshness-tag"/);
  assert.match(appSource, /settings-freshness-tag/);
  assert.doesNotMatch(appSource, /settings-freshness-tags/);
  assert.match(pageSource, /id="week-grid-view"/);
  assert.match(appSource, /querySelectorAll\("\.question-chips"\)/);
  assert.match(appSource, /week-grid-view/);
  assert.match(stylesSource, /\.week-list/);
  assert.match(stylesSource, /hide-answer-freshness/);
  assert.match(stylesSource, /reduce-motion/);
});

test("default chain answers through brain 2.2 then falls back to brain 2 facts", () => {
  const { api, context } = createAppHarness();
  api.state.schedule.push(
    { id: "a-wed-econ", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "b-wed-econ", group: "ECB2", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" }
  );
  api.buildScheduleIndex();
  const compared = api.runCompassBrain("Compare ECB vs ECB2");
  assert.ok(compared, "comparison should be handled by the new chain");
  assert.equal(compared.version, "2.2.0");
  assert.match(compared.answer, /Profile unchanged/);

  const calculated = api.runCompassBrain("25% of 240");
  assert.ok(calculated, "calculation should resolve inside the new chain");
  assert.match(calculated.answer, /= 60/);

  // Legacy Brain 2 still answers when both new brains pass.
  const legacy = api.runCompassBrain("Which day has the most classes this week?");
  assert.ok(legacy);
  assert.match(legacy.answer, /Monday/);
  assert.notEqual(context.CompassBrainV2.VERSION, "2.2.0");
});

test("kill switch disables the whole new chain without breaking legacy answers", () => {
  const { api } = createAppHarness();
  api.setCompassBrainV2Enabled(false);
  assert.equal(api.runCompassBrain("Compare ECB vs ECB2"), null);
  assert.equal(api.runCompassBrain("25% of 240"), null);
  const legacyAnswer = api.answerWithoutAi("Friday timetable");
  assert.ok(typeof legacyAnswer === "string");
});

test("conversation memory persists across chained turns and resets on demand", () => {
  const { api } = createAppHarness();
  api.state.schedule.push(
    { id: "a-wed-econ", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "b-wed-econ", group: "ECB2", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" }
  );
  api.buildScheduleIndex();
  api.resetBrainConversation();
  api.runCompassBrain("Compare ECB vs ECB2");
  assert.ok(api.state.brainConversation?.comparison, "comparison should be remembered");
  const followUp = api.runCompassBrain("What differs on Wednesday?");
  assert.ok(followUp);
  assert.equal(followUp.version, "2.2.0");
  assert.match(followUp.answer, /Wednesday only/);
  api.resetBrainConversation();
  assert.equal(api.state.brainConversation, null);
});

// ---- Parity & regression harness ----

test("kernel revision change invalidates pending clarifications and stored comparisons", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  let memory = kernel.createMemory(null);
  // Open a pending clarification under revision "rev-42"
  memory = kernel.updateMemory(memory, {
    pending: { kind: "person", candidates: [{ name: "Aman Kumar", section: "ECB" }], turn: memory.turnCount + 1 }
  }, "find student Aman Kumar", "PERSON_MULTIPLE_MATCHES", "rev-42");
  assert.ok(memory.pending, "pending should exist under rev-42");
  // Store a comparison under the same revision
  memory = kernel.updateMemory(memory, {
    comparison: { left: "ECB1", right: "ECB2", sourceVersion: "rev-42" }
  }, "compare ECB1 vs ECB2", "TIMETABLE_COMPARISON", "rev-42");
  assert.ok(memory.comparison, "comparison should exist under rev-42");
  // Bump the dataset revision to "rev-99"
  memory = kernel.updateMemory(memory, {}, "unrelated question", "OTHER", "rev-99");
  // Pending clarification must be invalidated (different revision)
  assert.equal(memory.pending, null, "pending clarification should be cleared on revision change");
  // Stored comparison must also be invalidated (different revision)
  assert.equal(memory.comparison, null, "stored comparison should be cleared on revision change");
  // New comparison computed against the new revision must survive
  memory = kernel.updateMemory(memory, {
    comparison: { left: "ECB1", right: "ECB2", sourceVersion: "rev-99" }
  }, "compare ECB1 vs ECB2", "TIMETABLE_COMPARISON", "rev-99");
  assert.ok(memory.comparison, "newly computed comparison should survive");
  assert.equal(memory.comparison.sourceVersion, "rev-99", "should reflect the new revision");
});

test("cross-brain fallback chain serves verified facts without external AI", () => {
  const { api, context } = createAppHarness();
  api.state.schedule.push(
    { id: "a-wed-econ", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "b-mon-phys", group: "ECB", day: "Monday", start: 510, end: 570, subject: "PHYSICS", teacher: "DR HARPREET KAUR", room: "G6", type: "L", cohorts: "ECB1" }
  );
  api.buildScheduleIndex();
  api.state.selectedSubgroup = "ECB1";
  api.state.selectedGroup = "ECB";

  // Default chain: "Who teaches Physics?" is handled by Brain 2 (not 2.2), so it must
  // fall through to Brain 2 inside the chain and still return the fact.
  const chained = api.runCompassBrain("Who teaches Physics?");
  assert.ok(chained, "chain must answer via fallback instead of dropping the fact");
  assert.notEqual(chained.version, "2.2.0");
  assert.match(chained.answer, /HARPREET KAUR/i);
  // Explicitly forcing the legacy Brain 2 engine yields the same fact.
  const forced = api.runCompassBrain("Who teaches Physics?", context.CompassBrainV2);
  assert.ok(forced, "explicit Brain 2 engine must stay usable");
  assert.match(forced.answer, /HARPREET KAUR/i);
  // Kill switch disables every brain; the legacy local path still answers.
  api.setCompassBrainV2Enabled(false);
  assert.equal(api.runCompassBrain("Who teaches Physics?"), null);
  const legacyAnswer = api.answerWithoutAi("Friday timetable");
  assert.ok(typeof legacyAnswer === "string" && legacyAnswer.length > 0);
  // The harness throws on any fetch call, so reaching this point proves no
  // step of any chain contacted external AI for these factual questions.
});

// ---- Stress-campaign regressions (wave 1 + wave 2 fixes) ----

test("regression: day-after-tomorrow aliases normalize in Hindi and Punjabi", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  assert.match(kernel.normalize("\u092a\u0930\u0938\u094b\u0902 \u0915\u093e \u091f\u093e\u0907\u092e\u091f\u0947\u092c\u0932"), /day after tomorrow/);
  assert.match(kernel.normalize("\u0a15\u0a32\u0a4d\u0a39 \u0a2a\u0a3f\u0a71\u0a1b\u0a4b\u0a02 \u0a26\u0a3e \u0a1f\u0a3e\u0a07\u0a2e\u0a1f\u0a47\u0a2c\u0a32"), /day after tomorrow/);
});

test("regression: comparison questions are never stolen by selection or view routes", () => {
  const { api } = createAppHarness();
  api.state.schedule.push(
    { id: "b-mon-math", group: "ECB2", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" },
    { id: "b-tue-phys", group: "ECB2", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR OTHER TEACHER", room: "G6", type: "L", cohorts: "ECB2" }
  );
  api.buildScheduleIndex();
  const versus = api.answerWithoutAi("ECB versus ECB2 timetable");
  assert.match(versus, /Compared: ECB and ECB2/);
  // The single-code routes (selection/view) must not own a versus question.
  assert.doesNotMatch(versus, /Switched to|Showing .* timetable<|now viewing/i);
});

test("regression: faculty typo resolves through fuzzy matching", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("faculty Chahat Jainn", personContext());
  assert.equal(outcome.intent, "FACULTY_DETAILS");
  assert.match(outcome.answer, /DR CHAHAT JAIN/);
});

test("regression: India clock question reaches the time answer, not college hours", () => {
  const { api } = createAppHarness();
  const answer = api.answerWithoutAi("What time is it in India?");
  assert.ok(/India/.test(answer) || /\d{1,2}:\d{2}/.test(answer), `unexpected answer: ${answer.slice(0, 120)}`);
  assert.doesNotMatch(answer, /college (?:hours|timing)|opens? at/i);
});

test("regression: non-Latin bare names never trigger roster search", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("ਅਮਨ ਕੁਮਾਰ", personContext());
  if (outcome.handled) assert.notEqual(outcome.intent, "STUDENT_DETAILS");
  assert.doesNotMatch(outcome.answer || "", /2610001|2610002/);
});

test("regression: misspelled weekday resolves to the closest real day", () => {
  const { api } = createAppHarness();
  const answer = api.answerWithoutAi("thusday timetable");
  assert.match(answer, /Thursday/);
  assert.doesNotMatch(answer, /Monday|Tuesday|Wednesday|Friday|Saturday|Sunday/);
});

test("regression: room schedule view lists verified classes for a room code", () => {
  const { api } = createAppHarness();
  const wholeWeek = api.answerWithoutAi("G6 timetable");
  assert.match(wholeWeek, /G6/);
  assert.match(wholeWeek, /PHYSICS/);
  const scoped = api.answerWithoutAi("which classes are in G6 on Tuesday?");
  assert.match(scoped, /G6/);
  assert.match(scoped, /PHYSICS/);
});

test("regression: word-number and modulo arithmetic evaluate safely", () => {
  const kernel = createKernelHarness().CompassBrainKernel;
  assert.equal(kernel.sanitizeArithmetic("forty plus two"), "40 + 2");
  assert.equal(kernel.sanitizeArithmetic("17 mod 5"), "17 % 5");
  assert.equal(kernel.evaluateArithmetic("17 % 5"), 2);
  // Percent-of still wins over modulo when % is not between two numbers.
  assert.equal(kernel.sanitizeArithmetic("12.5% of 80"), "(12.5/100)*80");
  const brain = createBrainHarness().CompassBrainV1_2;
  const outcome = brain.process("17 mod 5", personContext());
  assert.equal(outcome.intent, "CALCULATION");
  assert.match(outcome.answer, /= 2/);
});

test("regression: roster enumeration attempts fail closed without leaking records", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  ["list all students", "show all students of ECB", "how many students are in ECB?"].forEach((question) => {
    const outcome = brain.process(question, personContext());
    const text = String(outcome.answer || "");
    assert.doesNotMatch(text, /2610001|2610002|2617070/, `roster leaked for "${question}"`);
    if (outcome.handled) assert.notEqual(outcome.intent, "STUDENT_DETAILS");
  });
});

// ---- Hierarchy hardening regressions (sections, subgroups, comparisons) ----

const hierarchyClasses = [
  { id: "h1", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9", type: "L", cohorts: "ECB1" },
  { id: "h2", group: "ECB", day: "Monday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB2" },
  { id: "h3", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9", type: "L", cohorts: "" },
  { id: "h4", group: "CSA", day: "Monday", start: 570, end: 630, subject: "PPS", teacher: "NAVJOT SINGH", room: "COMP LAB", type: "L", cohorts: "" },
  { id: "h5", group: "CSD2", day: "Monday", start: 750, end: 810, subject: "CHEMISTRY", teacher: "RANDHIR SINGH", room: "C101", type: "L", cohorts: "" }
];

function hierarchyContext(overrides = {}) {
  return {
    calendarDate: "2026-08-16",
    datasetVersion: "rev-42",
    allClasses: hierarchyClasses,
    conversation: {},
    ...overrides
  };
}

test("brain 2.2 resolves subgroup vs subgroup and subgroup vs parent both ways", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const forward = brain.process("Compare ECB1 vs ECB2", hierarchyContext());
  assert.equal(forward.handled, true);
  assert.equal(forward.intent, "TIMETABLE_COMPARISON");
  assert.match(forward.answer, /Compared: ECB1 and ECB2/);
  assert.match(forward.answer, /Only in ECB1/);
  assert.match(forward.answer, /Only in ECB2/);
  // Reverse order keeps the user's ordering and still diffs both sides.
  const reverse = brain.process("Compare ECB2 vs ECB1", hierarchyContext());
  assert.equal(reverse.intent, "TIMETABLE_COMPARISON");
  assert.match(reverse.answer, /Compared: ECB2 and ECB1/);
  assert.match(reverse.answer, /Only in ECB1/);
  assert.match(reverse.answer, /Only in ECB2/);
  const subVsParent = brain.process("Compare ECB1 vs ECB", hierarchyContext());
  assert.equal(subVsParent.intent, "TIMETABLE_COMPARISON");
  assert.match(subVsParent.answer, /Compared: ECB1 and ECB/);
});

test("brain 2.2 verifies multi-digit codes like CSD2 against loaded timetables", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const outcome = brain.process("Compare CSA vs CSD2", hierarchyContext());
  assert.equal(outcome.handled, true);
  assert.equal(outcome.intent, "TIMETABLE_COMPARISON");
  assert.match(outcome.answer, /Compared: CSA and CSD2/);
  assert.match(outcome.answer, /CHEMISTRY/);
});

test("brain 2.2 reports prefix ambiguity instead of guessing", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const outcome = brain.process("Compare EC vs CSA", hierarchyContext());
  assert.equal(outcome.intent, "COMPARE_CLARIFY");
  assert.match(outcome.answer, /ambiguous/i);
  // All three matching codes are offered (numeric sort), never a guess.
  assert.match(outcome.answer, /ECB, ECB1, ECB2/);
});

test("brain 2.2 personal comparison resolves from the device profile or asks safely", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const withProfile = brain.process("my timetable vs ECB2", hierarchyContext({
    profile: { name: "TEST STUDENT", section: "ECB", subsection: "ECB1" }
  }));
  assert.equal(withProfile.intent, "TIMETABLE_COMPARISON");
  assert.match(withProfile.answer, /Compared: ECB1 and ECB2/);
  const withoutProfile = brain.process("my timetable vs ECB2", hierarchyContext({ profile: {} }));
  assert.equal(withoutProfile.intent, "COMPARE_CLARIFY");
  assert.match(withoutProfile.answer, /Profile page/i);
});

test("brain 2.2 comparison tokenizer keeps weekday words out of code slots", () => {
  const brain = createBrainHarness().CompassBrainV2_2;
  const outcome = brain.process("Compare ECB1 vs ECB2 on Monday", hierarchyContext());
  assert.equal(outcome.intent, "TIMETABLE_COMPARISON");
  assert.match(outcome.answer, /Monday only/);
  assert.doesNotMatch(outcome.answer, /Compared: .*MONDAY/);
});

test("app mentoring answer honors an explicitly named section", () => {
  const { api } = createAppHarness();
  api.state.schedule.push(
    { id: "m1", group: "ECB", day: "Monday", start: 810, end: 870, subject: "MENTORING CLASS & PROFESSIONAL DEVELOPMENT", teacher: "", room: "", type: "L", cohorts: "ECB1" }
  );
  api.buildScheduleIndex();
  api.state.selectedSubgroup = "ECB1";
  const named = api.answerWithoutAi("ecb mentoring class");
  assert.match(named, /Mentoring class (&amp;|&) professional development/i);
  // An unloaded section must never inherit the active selection's entries.
  const otherSection = api.answerWithoutAi("csa mentoring class");
  assert.doesNotMatch(otherSection, /Monday 1:30 PM/);
});

test("brain-kernel holiday registry and calculations", () => {
  const kernel = createBrainHarness().CompassBrainKernel;
  assert.equal(kernel.getHolidaysForYear(2026).length, 27);
  const augustHolidays = kernel.getHolidaysForMonth(7, 2026);
  assert.equal(augustHolidays.length, 2);
  assert.equal(augustHolidays[0].name, "Independence Day");
  assert.equal(augustHolidays[0].date, "2026-08-15");
  const septemberHolidays = kernel.getHolidaysForMonth(8, 2026);
  assert.equal(septemberHolidays.length, 1);
  assert.equal(septemberHolidays[0].name, "Teej");
  assert.equal(septemberHolidays[0].type, "Restricted");
  assert.equal(septemberHolidays[0].closed, false);

  const holidayCheck = kernel.checkDateHoliday("2026-08-15");
  assert.ok(holidayCheck);
  assert.equal(holidayCheck.name, "Independence Day");

  const nonHoliday = kernel.checkDateHoliday("2026-08-17");
  assert.equal(nonHoliday, null);

  const cgpaRes = kernel.evaluateCgpa([
    { credits: 4, grade: "A+" },
    { credits: 4, grade: "A" },
    { credits: 3, grade: "B+" }
  ]);
  assert.ok(cgpaRes);
  // (4*9 + 4*8 + 3*7) / 11 = (36 + 32 + 21) / 11 = 89 / 11 = 8.09
  assert.equal(cgpaRes.cgpa, 8.09);
  assert.equal(cgpaRes.percentage, Math.round(8.09 * 9.5 * 100) / 100);

  assert.equal(kernel.cgpaToPercentage(8.5), 80.75);
  assert.equal(kernel.percentageToCgpa(80.75), 8.5);
});

test("brain 1.2 answers holiday questions across English, Hinglish, Punjabi, and Hindi", () => {
  const brain = createBrainHarness().CompassBrainV1_2;
  const context = { calendarDate: "2026-08-10" };

  // Month count in English
  const augEng = brain.process("how many holidays in august", context);
  assert.equal(augEng.handled, true);
  assert.equal(augEng.intent, "HOLIDAY_COUNT_MONTH");
  assert.match(augEng.answer, /Official Holidays in August 2026 \(2\)/);
  assert.match(augEng.answer, /Independence Day/);

  // Month count in Hinglish
  const augHing = brain.process("august mein kitni chuttiyan hain", context);
  assert.equal(augHing.handled, true);
  assert.equal(augHing.intent, "HOLIDAY_COUNT_MONTH");
  assert.match(augHing.answer, /Official Holidays in August 2026/);

  // Month count in Punjabi
  const augPa = brain.process("ਅਗਸਤ ਵਿੱਚ ਕਿੰਨੀਆਂ ਛੁੱਟੀਆਂ ਹਨ", context);
  assert.equal(augPa.handled, true);
  assert.equal(augPa.intent, "HOLIDAY_COUNT_MONTH");
  assert.match(augPa.answer, /August 2026/);

  // September has one official-list entry, but it is restricted rather than
  // an automatic college closure. Keep that distinction visible to students.
  const september = brain.process("how many holidays in september", context);
  assert.equal(september.handled, true);
  assert.equal(september.intent, "HOLIDAY_COUNT_MONTH");
  assert.match(september.answer, /Official Holidays in September 2026 \(1\)/);
  assert.match(september.answer, /Teej.*Restricted/is);
  assert.match(september.answer, /College may be open/i);

  const restrictedMeaning = brain.process("what is a restricted holiday", context);
  assert.equal(restrictedMeaning.handled, true);
  assert.equal(restrictedMeaning.intent, "RESTRICTED_HOLIDAY_EXPLANATION");
  assert.match(restrictedMeaning.answer, /College may be open/i);

  const gazettedMeaning = brain.process("what is a gazetted holiday", context);
  assert.equal(gazettedMeaning.handled, true);
  assert.equal(gazettedMeaning.intent, "GAZETTED_HOLIDAY_EXPLANATION");
  assert.match(gazettedMeaning.answer, /College is normally closed/i);

  const bareGazetted = brain.process("gazetted", context);
  assert.equal(bareGazetted.intent, "GAZETTED_HOLIDAY_EXPLANATION");
  assert.match(bareGazetted.answer, /Official holiday/i);

  // Date check in English
  const dateEng = brain.process("is on 15 august holiday", context);
  assert.equal(dateEng.handled, true);
  assert.equal(dateEng.intent, "HOLIDAY_DATE_CHECK");
  assert.match(dateEng.answer, /Yes! Saturday, August 15, 2026 is an official holiday/);
  assert.match(dateEng.answer, /Independence Day/);

  const gazettedDate = brain.process("is 27 august holiday", context);
  assert.equal(gazettedDate.intent, "HOLIDAY_DATE_CHECK");
  assert.match(gazettedDate.answer, /Parkash Utsav of Sri Guru Granth Sahib Ji/);
  assert.match(gazettedDate.answer, /Gazetted:.*College is normally closed/is);

  // Date check in Hinglish
  const dateHing = brain.process("15 august ko chutti hai kya", context);
  assert.equal(dateHing.handled, true);
  assert.equal(dateHing.intent, "HOLIDAY_DATE_CHECK");
  assert.match(dateHing.answer, /Independence Day/);

  const tomorrow = brain.process("is tomorrow a holiday", { calendarDate: "2026-08-31" });
  assert.equal(tomorrow.handled, true);
  assert.equal(tomorrow.intent, "HOLIDAY_DATE_CHECK");
  assert.equal(tomorrow.facts.iso, "2026-09-01");
  assert.equal(tomorrow.facts.closed, false);
  assert.match(tomorrow.answer, /Teej/);
  assert.match(tomorrow.answer, /Restricted Holiday/);
  assert.match(tomorrow.answer, /College may be open/i);

  const weekdayAndDate = brain.process("is Tuesday 1 September 2026 a holiday", context);
  assert.equal(weekdayAndDate.handled, true);
  assert.equal(weekdayAndDate.facts.iso, "2026-09-01");
  assert.match(weekdayAndDate.answer, /Tuesday, September 1, 2026/);
  assert.match(weekdayAndDate.answer, /Teej/);

  // Non-holiday check
  const nonHoli = brain.process("is 18 august a holiday", context);
  assert.equal(nonHoli.handled, true);
  assert.equal(nonHoli.intent, "HOLIDAY_DATE_CHECK");
  assert.match(nonHoli.answer, /not an official gazetted festival holiday/);

  // Next holiday
  const nextH = brain.process("when is the next holiday", context);
  assert.equal(nextH.handled, true);
  assert.equal(nextH.intent, "HOLIDAY_NEXT");
  assert.match(nextH.answer, /Independence Day/);

  const restrictedNext = brain.process("when is the next holiday", { calendarDate: "2026-08-31" });
  assert.equal(restrictedNext.handled, true);
  assert.match(restrictedNext.answer, /Teej/);
  assert.match(restrictedNext.answer, /College may be open/i);

  // Year total
  const yearTotal = brain.process("how many holidays in a year", context);
  assert.equal(yearTotal.handled, true);
  assert.equal(yearTotal.intent, "HOLIDAY_YEAR_TOTAL");
  assert.match(yearTotal.answer, /27 Total/);

  for (const question of ["holidays", "all holidays", "all holidays 2026", "list official holidays"]) {
    const allHolidays = brain.process(question, context);
    assert.equal(allHolidays.intent, "HOLIDAY_YEAR_TOTAL", question);
    assert.match(allHolidays.answer, /GNDEC Official Holidays for 2026 \(27 Total\)/, question);
    assert.match(allHolidays.answer, /Saturday, August 15, 2026/, question);
    assert.match(allHolidays.answer, /Independence Day/, question);
  }

  const unavailableYear = brain.process("all holidays 2027", context);
  assert.equal(unavailableYear.intent, "HOLIDAY_YEAR_UNAVAILABLE");
  assert.match(unavailableYear.answer, /will not guess dates for another year/i);

  // Named festival search
  const diwali = brain.process("when is diwali", context);
  assert.equal(diwali.handled, true);
  assert.equal(diwali.intent, "HOLIDAY_FESTIVAL_SEARCH");
  assert.match(diwali.answer, /Diwali/);

  const teej = brain.process("when is teej", context);
  assert.equal(teej.handled, true);
  assert.equal(teej.intent, "HOLIDAY_FESTIVAL_SEARCH");
  assert.match(teej.answer, /College may be open/i);
});

test("brain 1.2 answers marking scheme and CGPA calculations", () => {
  const brain = createBrainHarness().CompassBrainV1_2;

  const marking = brain.process("what is the marking scheme for Physics?");
  assert.equal(marking.handled, true);
  assert.equal(marking.intent, "ACADEMIC_MARKING_SCHEME");
  assert.match(marking.answer, /Continuous Assessment \(CA \/ Internal\)/);
  assert.match(marking.answer, /40 Marks/);
  assert.match(marking.answer, /End Semester Examination \(ESE \/ External\)/);
  assert.match(marking.answer, /60 Marks/);

  const cgpaFormula = brain.process("how is CGPA calculated?");
  assert.equal(cgpaFormula.handled, true);
  assert.equal(cgpaFormula.intent, "ACADEMIC_CGPA_CALCULATION");
  assert.match(cgpaFormula.answer, /SGPA Formula/);
  assert.match(cgpaFormula.answer, /Percentage \(%\) = CGPA × 9.5/);

  const cgpaToPct = brain.process("convert 8.5 CGPA to percentage");
  assert.equal(cgpaToPct.handled, true);
  assert.equal(cgpaToPct.intent, "ACADEMIC_CGPA_CALCULATION");
  assert.match(cgpaToPct.answer, /8.5 CGPA = 80.75%/);

  const pctToCgpa = brain.process("convert 80.75% to CGPA");
  assert.equal(pctToCgpa.handled, true);
  assert.equal(pctToCgpa.intent, "ACADEMIC_CGPA_CALCULATION");
  assert.match(pctToCgpa.answer, /80.75% = 8.5 CGPA/);

  const calcCgpa = brain.process("calculate CGPA: 4 credits A+, 4 credits A, 3 credits B+");
  assert.equal(calcCgpa.handled, true);
  assert.equal(calcCgpa.intent, "ACADEMIC_CGPA_CALCULATION");
  assert.match(calcCgpa.answer, /Calculated SGPA \/ CGPA: 8.09 \/ 10.0/);
});

test("legacyAnswerWithoutAi answers holiday and marking scheme questions reliably", () => {
  const { api } = createAppHarness();

  const augHoli = api.answerWithoutAi("how many holidays in august");
  assert.match(augHoli, /Official Holidays in August 2026/);
  assert.match(augHoli, /Independence Day/);

  const augCheck = api.answerWithoutAi("15 august ko chutti hai kya");
  assert.match(augCheck, /Independence Day/);

  const marking = api.answerWithoutAi("internal marks for theory");
  assert.match(marking, /Continuous Assessment \(CA \/ Internal\)/);
  assert.match(marking, /40 Marks/);

  const cgpa = api.answerWithoutAi("8.5 cgpa to percentage");
  assert.match(cgpa, /8.5 CGPA = 80.75%/);
});

test("attendance calculation in brain-kernel and brain 1.2", () => {
  const { CompassBrainKernel } = createBrainHarness();
  const kernel = CompassBrainKernel;

  // Safe attendance calculation
  const safe = kernel.evaluateAttendance({ attended: 24, total: 30, target: 75 });
  assert.equal(safe.valid, true);
  assert.equal(safe.status, "safe");
  assert.equal(safe.bunksAllowed, 2);
  assert.equal(safe.currentPct, 80);

  // Shortage attendance calculation
  const shortage = kernel.evaluateAttendance({ attended: 12, total: 18, target: 75 });
  assert.equal(shortage.valid, true);
  assert.equal(shortage.status, "shortage");
  assert.equal(shortage.classesNeeded, 6);

  // Brain 1.2 handling
  const brain = createBrainHarness().CompassBrainV1_2;
  const ansSafe = brain.process("attended 24 out of 30 classes, how many can I bunk for 75%?");
  assert.equal(ansSafe.handled, true);
  assert.equal(ansSafe.intent, "ACADEMIC_ATTENDANCE_CALCULATION");
  assert.match(ansSafe.answer, /You are SAFE above 75%/);
  assert.match(ansSafe.answer, /2 more classes/);

  const ansHing = brain.process("18 me se 12 lecture lage hain, kitni chutti le sakta hu?");
  assert.equal(ansHing.handled, true);
  assert.equal(ansHing.intent, "ACADEMIC_ATTENDANCE_CALCULATION");
  assert.match(ansHing.answer, /Attendance Shortage/);
  assert.match(ansHing.answer, /7 consecutive classes/);  // default target is now 76%
});

test("campus room directory and navigation in brain-kernel and brain 1.2", () => {
  const { CompassBrainKernel } = createBrainHarness();
  const kernel = CompassBrainKernel;

  const roomG6 = kernel.lookupCampusRoom("G6");
  assert.equal(roomG6.name, "Room G6");
  assert.equal(roomG6.block, "Civil & Applied Sciences Block");

  const lab = kernel.lookupCampusRoom("Physics lab");
  assert.equal(lab.name, "Physics Laboratory");

  const brain = createBrainHarness().CompassBrainV1_2;
  const g6Ans = brain.process("where is G6 room located?");
  assert.equal(g6Ans.handled, true);
  assert.equal(g6Ans.intent, "CAMPUS_ROOM_LOCATION");
  assert.match(g6Ans.answer, /Civil &amp; Applied Sciences Block/);
  assert.match(g6Ans.answer, /Ground Floor/);

  const physAns = brain.process("physics lab kahan hai?");
  assert.equal(physAns.handled, true);
  assert.equal(physAns.intent, "CAMPUS_ROOM_LOCATION");
  assert.match(physAns.answer, /Physics Laboratory/);
});

test("common free slots comparison in brain 2.2", () => {
  const { CompassBrainV2_2 } = createBrainHarness();
  const brain = CompassBrainV2_2;

  const context = {
    allClasses: [
      { group: "ECB1", day: "Thursday", start: 510, end: 570, subject: "Physics", teacher: "Dr Chahat", room: "G6" },
      { group: "ECB1", day: "Thursday", start: 690, end: 750, subject: "Maths", teacher: "Dr Jasmeet", room: "G6" },
      { group: "CSA1", day: "Thursday", start: 510, end: 570, subject: "PPS", teacher: "Er Amandeep", room: "G4" },
      { group: "CSA1", day: "Thursday", start: 690, end: 750, subject: "Maths", teacher: "Dr Randhir", room: "G4" }
    ],
    bellSlots: [
      { start: 510, end: 570 },
      { start: 570, end: 630 },
      { start: 630, end: 690 },
      { start: 690, end: 750 }
    ]
  };

  const res = brain.process("compare free periods between ECB1 and CSA1 on Thursday", context);
  assert.equal(res.handled, true);
  assert.equal(res.intent, "TIMETABLE_COMMON_FREE");
  assert.match(res.answer, /Common Free Slots Between ECB1 & CSA1/);
});

test("campus administration and leadership in brain-kernel and brain 1.2", () => {
  const { CompassBrainKernel, CompassBrainV1_2 } = createBrainHarness();
  const kernel = CompassBrainKernel;
  const brain = CompassBrainV1_2;

  // Principal lookup
  const principal = kernel.lookupCampusAdministration("who is the principal of gndec");
  assert.equal(principal.name, "Dr. Sehijpal Singh");
  assert.equal(principal.title, "Principal, GNDEC");

  // HOD CSE lookup
  const hodCse = kernel.lookupCampusAdministration("who is hod cse");
  assert.equal(hodCse.name, "Dr. Parminder Singh");
  assert.equal(hodCse.key, "hod_cse");

  // HOD IT lookup
  const hodIt = kernel.lookupCampusAdministration("hod of it department");
  assert.equal(hodIt.name, "Dr. Kiran Jyoti");

  // Dean Student Welfare lookup
  const dsw = kernel.lookupCampusAdministration("who is dsw / dean student welfare");
  assert.equal(dsw.name, "Dr. Jatinder Kapoor");

  // Controller of Examinations lookup
  const coe = kernel.lookupCampusAdministration("controller of examination / coe");
  assert.equal(coe.name, "Dr. Arvind Dhingra");

  // Brain 1.2 answering
  const ansPrincipal = brain.process("Who is the principal of GNDEC?");
  assert.equal(ansPrincipal.handled, true);
  assert.equal(ansPrincipal.intent, "CAMPUS_ADMINISTRATION_INFO");
  assert.match(ansPrincipal.answer, /Dr\. Sehijpal Singh/);
  assert.match(ansPrincipal.answer, /principal@gndec\.ac\.in/);

  const ansHodCse = brain.process("who is HOD CSE?");
  assert.equal(ansHodCse.handled, true);
  assert.equal(ansHodCse.intent, "CAMPUS_ADMINISTRATION_INFO");
  assert.match(ansHodCse.answer, /Dr\. Parminder Singh/);

  const ansAdminList = brain.process("list college administration and deans");
  assert.equal(ansAdminList.handled, true);
  assert.equal(ansAdminList.intent, "CAMPUS_ADMINISTRATION_INFO");
  assert.match(ansAdminList.answer, /Key Administrative Leadership/);
  assert.match(ansAdminList.answer, /Dean \(Academic\)/);
});
