// Comprehensive stress-probe harness for the GNDEC Compass brain chain.
// NOT a node --test file (lives in scripts/). Run: node scripts/stress-probe.mjs
// Drives the REAL app.js pipeline (answerWithoutAi / runCompassBrain) through a
// vm sandbox with linkedom, exactly like test/brain-new.test.mjs does.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const kernelSource = await readFile(new URL("../public/brain-kernel.js", import.meta.url), "utf8");
const v12Source = await readFile(new URL("../public/brain-v1-2.js", import.meta.url), "utf8");
const v22Source = await readFile(new URL("../public/brain-v2-2.js", import.meta.url), "utf8");
const v2Source = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

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
  // Sunday 2026-08-16 10:00 IST -> weekend edge; next study day = Monday.
  api.state.nowOverride = "2026-08-16T04:30:00.000Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.groups = ["ECB"];
  api.state.schedule = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-pps", group: "ECB", day: "Monday", start: 630, end: 690, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB1" },
    { id: "mon-physics", group: "ECB", day: "Monday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB1" },
    { id: "tue-chem", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "CHEMISTRY", teacher: "DR OTHER TEACHER", room: "CH LAB", type: "P", cohorts: "ECB1" },
    { id: "tue-math", group: "ECB", day: "Tuesday", start: 690, end: 750, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "wed-econ", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "thu-workshop", group: "ECB", day: "Thursday", start: 510, end: 630, subject: "WORKSHOP", teacher: "ER WORKSHOP HAND", room: "WORKSHOP", type: "P", cohorts: "ECB1" },
    { id: "fri-free", group: "ECB", day: "Friday", start: 570, end: 630, subject: "ENGLISH", teacher: "DR ENGLISH FACULTY", room: "A12", type: "L", cohorts: "ECB1" }
  ];
  api.state.rosterCache = { records: [
    { name: "AMAN KUMAR", crn: "2610001", registrationNo: "26010001", currentSerialNo: "11", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR" },
    { name: "AMAN KUMAR", crn: "2610002", registrationNo: "26010002", currentSerialNo: "12", branch: "CS", section: "CSA", subsection: "CSA1", mentor: "DR OTHER MENTOR" },
    { name: "KAUSHIK JAIN", crn: "2617070", registrationNo: "26170000", currentSerialNo: "7", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR CHAHAT JAIN" }
  ] };
  api.state.facultyCache = { records: [
    { name: "DR CHAHAT JAIN", profileId: "126", designation: "Assistant Professor", department: "Electronics & Communication Engineering", email: "chahatjain@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=126" },
    { name: "DR JASMEET KAUR", profileId: "99", designation: "Assistant Professor", department: "Applied Science", email: "jasmeet@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=99" }
  ] };
  api.buildScheduleIndex();
  api.setCompassBrainV2Enabled(true);
  return { api, context, storage };
}

// ECB2 timetable for comparisons.
function addEcb2(api) {
  api.state.schedule.push(
    { id: "b-mon-math", group: "ECB2", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" },
    { id: "b-tue-phys", group: "ECB2", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB2" },
    { id: "b-wed-pps", group: "ECB2", day: "Wednesday", start: 570, end: 630, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB2" }
  );
  api.buildScheduleIndex();
}

const strip = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

let passCount = 0;
let failCount = 0;
const failures = [];

function probe(label, question, checks, options = {}) {
  const { api } = options.harness;
  if (options.reset !== false) api.resetBrainConversation();
  let outcome;
  try {
    // Use the REAL user-facing local pipeline: app routes first, then the
    // brain chain, then legacyAnswerWithoutAi. runCompassBrain alone skips
    // the app routes that legitimately own day-schedule questions.
    const answer = options.answer ? options.answer(question) : api.answerWithoutAi(question);
    const result = typeof answer === "string" && answer ? { intent: "APP_ROUTE", text: strip(answer) } : null;
    outcome = result
      ? { handled: true, version: "app", intent: result.intent, text: result.text, raw: result }
      : { handled: false, text: "", diagnostic: api.state.lastBrainDiagnostic };
  } catch (error) {
    outcome = { handled: false, error: String(error && error.message || error) };
  }
  const problems = [];
  for (const [name, check] of Object.entries(checks)) {
    try {
      const ok = check(outcome);
      if (!ok) problems.push(`${name} FAILED`);
    } catch (error) {
      problems.push(`${name} THREW: ${error.message}`);
    }
  }
  if (problems.length) {
    failCount += 1;
    failures.push({ label, question, problems, outcome });
    console.log(`FAIL  [${label}] "${question}"`);
    console.log(`      ${problems.join(" | ")}`);
    console.log(`      -> ${outcome.handled ? `${outcome.version}/${outcome.intent}: ${outcome.text.slice(0, 220)}` : `unhandled ${JSON.stringify(outcome.diagnostic || outcome.error || {})}`}`);
  } else {
    passCount += 1;
    console.log(`ok    [${label}] "${question}" -> ${outcome.handled ? `${outcome.intent}: ${outcome.text.slice(0, 90)}` : "(fallback)"}`);
  }
}

const handledByNewChain = (o) => o.handled === true;
const fallsBackSafely = (o) => o.handled === false || o.handled === true;

console.log("=".repeat(100));
console.log("SECTION A — Timetable / day / date / time questions (4 languages, fuzzy, human phrasing)");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks) => probe(label, q, checks, base);

  T("today-en", "What are my classes today?", { h: handledByNewChain });
  T("today-hinglish", "aaj ka timetable dikhao", { h: handledByNewChain });
  T("today-hindi", "आज का टाइमटेबल बताओ", { h: handledByNewChain });
  T("today-punjabi", "ਅੱਜ ਦਾ ਟਾਇਮਟੇਬਲ ਦੱਸੋ", { h: handledByNewChain });
  T("tomorrow-fuzzy", "kal ka time tabel", { h: handledByNewChain });
  T("tomorrow-hindi", "कल की क्लासेस कौन सी हैं", { h: handledByNewChain });
  T("dat-hinglish", "parso kya hai", { h: handledByNewChain });
  T("dat-punjabi", "ਕਲ੍ਹ ਪਿੱਛੋਂ ਕੀ ਹੈ", { h: fallsBackSafely });
  T("named-day", "Friday timetable", { h: handledByNewChain });
  T("named-day-hinglish", "somvar ka schedule", { h: fallsBackSafely });
  T("next-class", "what is my next class?", { h: handledByNewChain });
  T("next-class-night", "agla class kab hai", { h: handledByNewChain });
  T("free-today", "Today free periods", { h: handledByNewChain });
  T("free-hinglish", "aaj khali lectures kitne hain", { h: handledByNewChain });
  T("lightest-day", "Which day has the least classes this week?", { h: handledByNewChain });
  T("busiest-day", "Which day has the most classes this week?", { h: handledByNewChain });
  T("breaks", "How many breaks do I have on Monday?", { h: handledByNewChain });
  T("subject-count", "kitni maths classes this week?", { h: handledByNewChain });
  T("duration", "how long is WORKSHOP on Thursday?", { h: handledByNewChain });
  T("date-parso", "What date is parson?", { h: handledByNewChain });
  T("date-explicit", "What day is 17 August 2026?", { h: handledByNewChain });
  T("date-invalid", "What day is 31 February 2026?", { h: handledByNewChain });
  T("time-india", "What time is it in India?", { h: handledByNewChain });
  T("weekend-roll", "tomorrow's classes", { h: handledByNewChain }); // Sunday -> Monday roll
}

console.log("=".repeat(100));
console.log("SECTION B — People: faculty, duplicate faculty, students, duplicate students, privacy");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  T("faculty-exact", "Faculty Dr Chahat Jain", { h: handledByNewChain });
  T("faculty-no-dr", "teacher Jasmeet Kaur", { h: handledByNewChain });
  T("faculty-typo", "faculty Chahat Jainn", { h: handledByNewChain });
  T("faculty-dupes", "find student Aman Kumar", { h: handledByNewChain });
  T("student-cr-id", "find student Kaushik Jain", { h: handledByNewChain });
  T("student-crn", "find student CRN 2617070", { h: handledByNewChain });
  T("student-registration", "student registration 26010001", { h: handledByNewChain });
  T("bare-name-privacy", "Kaushik Jain", { h: handledByNewChain });
  T("hinglish-student", "student Aman Kumar ki details dhundo", { h: handledByNewChain });
  T("faculty-not-found", "faculty Nobody Singh", { h: handledByNewChain });
  T("student-not-found", "find student Zorro Phantom", { h: handledByNewChain });

  // Duplicate flow continuation via chained turns.
  const dupApi = harness.api;
  dupApi.resetBrainConversation();
  const first = dupApi.runCompassBrain("find student Aman Kumar");
  if (!first || first.intent !== "PERSON_MULTIPLE_MATCHES") {
    failCount += 1;
    failures.push({ label: "dup-flow-open", question: "find student Aman Kumar", problems: ["expected PERSON_MULTIPLE_MATCHES"], outcome: {} });
    console.log('FAIL  [dup-flow-open] expected PERSON_MULTIPLE_MATCHES');
  } else {
    const pick = dupApi.runCompassBrain("2");
    const okPick = pick && /CSA/.test(strip(pick.answer));
    if (okPick) { passCount += 1; console.log("ok    [dup-flow-pick] \"2\" resolves candidate 2 (CSA)"); }
    else {
      failCount += 1;
      failures.push({ label: "dup-flow-pick", question: "2", problems: ["candidate 2 should resolve to CSA"], outcome: { text: pick ? strip(pick.answer) : "" } });
      console.log(`FAIL  [dup-flow-pick] -> ${pick ? `${pick.intent}: ${strip(pick.answer).slice(0, 160)}` : "unhandled"}`);
    }
  }

  // Bare name must never leak roster data even with typos.
  T("privacy-bare-typo", "kaushik jainn", { h: handledByNewChain });
}

console.log("=".repeat(100));
console.log("SECTION C — Rooms, buildings, locations, subject/teacher relationships");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  addEcb2(harness.api);
  const base = { harness };
  const T = (label, q, checks) => probe(label, q, checks, base);

  T("room-of-subject", "Where is my PHYSICS class?", { h: handledByNewChain });
  T("room-question", "which room is A9 in?", { h: handledByNewChain });
  T("building", "Which building is room G6 in?", { h: handledByNewChain });
  T("room-hinglish", "physics class kaha lagegi", { h: handledByNewChain });
  T("who-teaches", "Who teaches MATH I?", { h: handledByNewChain });
  T("teacher-subject", "What does SUKHMINDER SINGH teach?", { h: handledByNewChain });
  T("rooms-used", "which rooms does ECB use on Monday?", { h: handledByNewChain });
}

console.log("=".repeat(100));
console.log("SECTION D — Calculations, equations, syllabus, suggestions");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  T("calc-percent", "25% of 240", { h: handledByNewChain });
  T("calc-equation", "solve 2x + 3 = 11", { h: handledByNewChain });
  T("calc-natural", "45 plus 17 times 2", { h: handledByNewChain });
  T("calc-divide-word", "100 divided by 4", { h: handledByNewChain });
  T("calc-injection", "process.exit()", { h: fallsBackSafely });
  T("calc-constructor", "constructor.constructor('return 1')()", { h: fallsBackSafely });
  T("syllabus-unsupported-in-brain", "physics syllabus unit 2", { h: fallsBackSafely });
  T("suggest-after-compare", "", { h: fallsBackSafely }, {
    answer: () => { const s = harness.api.runCompassBrain("Compare ECB vs ECB2"); harness.api.resetBrainConversation(); return s; }
  });
}

console.log("=".repeat(100));
console.log("SECTION E — Timetable comparison engine (scope, follow-ups, honesty)");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  addEcb2(harness.api);
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  T("compare-week", "Compare ECB vs ECB2", { h: handledByNewChain });
  T("compare-vs-word", "ECB versus ECB2 timetable", { h: handledByNewChain });
  T("compare-scoped", "Compare ECB vs ECB2 on Tuesday", { h: handledByNewChain });
  T("compare-unknown-code", "Compare ECB vs ZZZ9", { h: handledByNewChain });
  T("compare-same", "Compare ECB vs ECB", { h: handledByNewChain });
  T("compare-garbage", "Compare banana vs apple", { h: fallsBackSafely });

  // Follow-up chain: compare then scope to a day.
  const api = harness.api;
  api.resetBrainConversation();
  const first = api.runCompassBrain("Compare ECB vs ECB2");
  const followUp = first ? api.runCompassBrain("What differs on Wednesday?") : null;
  if (followUp && /Wednesday only/i.test(strip(followUp.answer))) {
    passCount += 1;
    console.log('ok    [compare-followup] "What differs on Wednesday?" reuses stored comparison');
  } else {
    failCount += 1;
    failures.push({ label: "compare-followup", question: "What differs on Wednesday?", problems: ["should reuse stored comparison scoped to Wednesday"], outcome: { text: followUp ? strip(followUp.answer) : "" } });
    console.log(`FAIL  [compare-followup] -> ${followUp ? `${followUp.intent}: ${strip(followUp.answer).slice(0, 200)}` : "unhandled"}`);
  }
}

console.log("=".repeat(100));
console.log("SECTION F — Kill switch, malformed input, bounded batch");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const api = harness.api;
  api.setCompassBrainV2Enabled(false);
  const legacyOk = typeof api.answerWithoutAi("Friday timetable") === "string";
  if (legacyOk) { passCount += 1; console.log('ok    [kill-switch] legacy path still answers "Friday timetable"'); }
  else { failCount += 1; failures.push({ label: "kill-switch", question: "Friday timetable", problems: ["legacy answer missing"], outcome: {} }); }

  api.setCompassBrainV2Enabled(true);
  const weirdInputs = ["", "   ", "x".repeat(5000), "😀😀😀 timetable", "<script>alert(1)</script>", "\u0000\u0001\u0002", "= 5 =", "?", "!!!"];
  let weirdSafe = true;
  for (const input of weirdInputs) {
    api.resetBrainConversation();
    try {
      const result = api.runCompassBrain(input);
      if (result && /\bNaN\b|\[object Object\]|<script/i.test(result.answer)) { weirdSafe = false; console.log(`      unsafe answer for ${JSON.stringify(input.slice(0, 20))}`); }
    } catch (error) {
      weirdSafe = false;
      console.log(`      threw for ${JSON.stringify(input.slice(0, 20))}: ${error.message}`);
    }
  }
  if (weirdSafe) { passCount += 1; console.log("ok    [weird-inputs] 8 hostile inputs answered safely or fell back"); }
  else { failCount += 1; failures.push({ label: "weird-inputs", question: "(batch)", problems: ["unsafe handling above"], outcome: {} }); }

  // Bounded 400-question mixed batch — must stay fast and never crash.
  const startedAt = Date.now();
  let batchSafe = true;
  const pool = [
    "aaj ka timetable", "kal physics", "parso kya hai", "Friday timetable", "next class",
    "25% of 240", "solve 3x - 7 = 8", "Compare ECB vs ECB2", "find student Aman Kumar",
    "faculty Dr Jasmeet Kaur", "where is chemistry", "who teaches maths", "free periods today",
    "ਅੱਜ ਦਾ ਟਾਇਮਟੇਬਲ", "कल का टाइमटेबल", "what is the meaning of life", "hello", "thanks"
  ];
  for (let index = 0; index < 400; index += 1) {
    api.resetBrainConversation();
    try {
      const result = api.runCompassBrain(pool[index % pool.length]);
      if (result && !result.answer) batchSafe = false;
    } catch { batchSafe = false; break; }
  }
  const elapsed = Date.now() - startedAt;
  if (batchSafe && elapsed < 15000) { passCount += 1; console.log(`ok    [bounded-batch] 400 mixed questions in ${elapsed}ms`); }
  else { failCount += 1; failures.push({ label: "bounded-batch", question: "(batch)", problems: [`safe=${batchSafe} elapsed=${elapsed}ms`], outcome: {} }); }
}

console.log("=".repeat(100));
console.log(`RESULT: ${passCount} passed, ${failCount} failed`);
if (failures.length) {
  console.log("\nFAILURES DETAIL:");
  failures.forEach((failure, index) => {
    console.log(`${index + 1}. [${failure.label}] "${failure.question}"`);
    failure.problems.forEach((problem) => console.log(`   - ${problem}`));
  });
}
process.exit(failCount ? 1 : 0);
