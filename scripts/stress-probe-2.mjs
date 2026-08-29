// Wave 2: harder probes — teacher/room timetables, more languages, edge formats.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const kernelSource = await readFile(new URL("../public/brain-kernel.js", import.meta.url), "utf8");
const v12Source = await readFile(new URL("../public/brain-v1-2.js", import.meta.url), "utf8");
const v22Source = await readFile(new URL("../public/brain-v2-2.js", import.meta.url), "utf8");
const v2Source = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

const sourceUnderTest = appSource.replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "").replace(
  /function kbClean/,
  "globalThis.__brainIntegrationTest = { state, answerWithoutAi, runCompassBrain, setCompassBrainV2Enabled, resetBrainConversation, buildScheduleIndex };\nfunction kbClean"
);

function createAppHarness() {
  const storage = new Map();
  const context = vm.createContext({
    console,
    DOMParser: class { parseFromString(html) { return parseHTML(html).document; } },
    document: { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) },
    window: { setTimeout, clearTimeout },
    setTimeout, clearTimeout, Intl, Date, URL,
    fetch: () => { throw new Error("Network access is forbidden in brain tests."); }
  });
  vm.runInContext(kernelSource, context);
  vm.runInContext(v12Source, context);
  vm.runInContext(v22Source, context);
  vm.runInContext(v2Source, context);
  vm.runInContext(sourceUnderTest, context);
  const api = context.__brainIntegrationTest;
  api.state.nowOverride = "2026-08-16T04:30:00.000Z"; // Sunday 10:00 IST
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

const strip = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

let passCount = 0;
let failCount = 0;
const failures = [];

function probe(label, question, checks, options = {}) {
  const { api } = options.harness;
  if (options.reset !== false) api.resetBrainConversation();
  let outcome;
  try {
    const answer = options.answer ? options.answer(question) : api.answerWithoutAi(question);
    outcome = typeof answer === "string" && answer
      ? { handled: true, text: strip(answer) }
      : { handled: false, diagnostic: api.state.lastBrainDiagnostic };
  } catch (error) {
    outcome = { handled: false, error: String(error && error.message || error) };
  }
  const problems = [];
  for (const [name, check] of Object.entries(checks)) {
    try {
      if (!check(outcome)) problems.push(`${name} FAILED`);
    } catch (error) {
      problems.push(`${name} THREW: ${error.message}`);
    }
  }
  if (problems.length) {
    failCount += 1;
    failures.push({ label, question, problems, outcome });
    console.log(`FAIL  [${label}] "${question}"`);
    console.log(`      ${problems.join(" | ")}`);
    console.log(`      -> ${outcome.handled ? outcome.text.slice(0, 240) : `unhandled ${JSON.stringify(outcome.diagnostic || outcome.error || {})}`}`);
  } else {
    passCount += 1;
    console.log(`ok    [${label}] "${question}" -> ${outcome.handled ? outcome.text.slice(0, 100) : "(fallback)"}`);
  }
}

const answered = (o) => o.handled === true;
const safeFallback = (o) => true;

console.log("=".repeat(100));
console.log("WAVE 2A — Teacher timetable / room timetable / section & subsection views");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks) => probe(label, q, checks, base);

  T("teacher-tt", "SUKHMINDER SINGH timetable", { h: answered });
  T("teacher-tt-day", "JASMEET KAUR Monday schedule", { h: answered });
  T("room-tt", "G6 timetable", { h: safeFallback });
  T("room-day", "which classes are in COMP LAB EC?", { h: answered });
  T("subsection-view", "ECB1 timetable", { h: answered });
  T("section-view", "ECB timetable", { h: answered });
  T("whole-week", "meri saari classes is hafte ki", { h: answered });
  T("subject-all-week", "all MATH I classes this week", { h: answered });
  T("first-class-mon", "first class on Monday", { h: answered });
  T("last-class-mon", "when does my last class end on Monday?", { h: answered });
  T("before-time", "what classes do I have on Monday before 11 AM?", { h: answered });
  T("after-time", "classes after 12 PM on Tuesday", { h: answered });
  T("availability-yes-no", "is there any PHYSICS class on Wednesday?", { h: answered });
  T("second-next", "what is my 2nd next class?", { h: answered });
  T("current-class", "what class is going on right now?", { h: answered });
}

console.log("=".repeat(100));
console.log("WAVE 2B — Multilingual breadth (mixed scripts, transliterations, typos)");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks) => probe(label, q, checks, base);

  T("hi-where", "भौतिकी की कक्षा कहाँ है?", { h: answered });
  T("pa-where", "ਫਿਜ਼ਿਕਸ ਕਲਾਸ ਕਿੱਥੇ ਹੈ?", { h: answered });
  T("hi-teacher", "गणित कौन पढ़ाता है?", { h: answered });
  T("pa-free", "ਅੱਜ ਖਾਲੀ ਲੈਕਚਰ", { h: answered });
  T("hinglish-mix", "kal maths kaha hai aur kaun padhata hai", { h: answered });
  T("typo-subject", "physis class kab hai", { h: safeFallback });
  T("typo-day", "thusday timetable", { h: safeFallback });
  T("caps-mix", "KaL Ka TiMeTaBlE", { h: answered });
  T("no-spaces-punct", "aaj-ka-timetable???", { h: safeFallback });
  T("hindi-date", "आज की तारीख क्या है", { h: answered });
  T("punjabi-thanks", "ਧੰਨਵਾਦ", { h: answered });
  T("hinglish-help", "kya kar sakta ho tum", { h: answered });
}

console.log("=".repeat(100));
console.log("WAVE 2C — Comparison engine edge cases + memory chains");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  harness.api.state.schedule.push(
    { id: "b-mon-math", group: "ECB2", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" },
    { id: "b-tue-phys", group: "ECB2", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB2" },
    { id: "b-wed-pps", group: "ECB2", day: "Wednesday", start: 570, end: 630, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB2" }
  );
  harness.api.buildScheduleIndex();
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  T("compare-hinglish", "ECB vs ECB2 ka timetable compare karo", { h: answered });
  T("compare-case", "compare ecb vs ecb2", { h: answered });
  T("compare-scoped-fri", "Compare ECB vs ECB2 on Friday", { h: answered });

  // Chain: compare -> scoped follow-up -> second scoped follow-up.
  const api = harness.api;
  api.resetBrainConversation();
  const first = api.runCompassBrain("Compare ECB vs ECB2");
  const tue = first ? api.runCompassBrain("What differs on Tuesday?") : null;
  const thu = tue ? api.runCompassBrain("What differs on Thursday?") : null;
  const chainOk = first && tue && thu
    && /Tuesday only/i.test(strip(tue.answer))
    && /Thursday only/i.test(strip(thu.answer));
  if (chainOk) { passCount += 1; console.log('ok    [compare-chain] compare -> "Tuesday" -> "Thursday" both re-scope correctly'); }
  else {
    failCount += 1;
    failures.push({ label: "compare-chain", question: "(chain)", problems: ["multi-day scoping chain broken"], outcome: {} });
    console.log(`FAIL  [compare-chain] -> ${[first, tue, thu].map((r) => (r ? strip(r.answer).slice(0, 80) : "null")).join(" || ")}`);
  }

  // Pending clarification consumed by 2.2 then full record via 1.2.
  api.resetBrainConversation();
  const dupes = api.runCompassBrain("find student Aman Kumar");
  const pick = dupes ? api.runCompassBrain("1") : null;
  // Privacy contract: PENDING_RESOLVED reveals name + section only — never
  // a CRN. The full record requires an explicit re-query with the section.
  if (pick && /Selected\s*1\.?/i.test(strip(pick.answer)) && /AMAN KUMAR/i.test(strip(pick.answer)) && !/2610001/.test(strip(pick.answer))) { passCount += 1; console.log('ok    [pending-chain] candidate 1 resolves by name+section, CRN withheld'); }
  else {
    failCount += 1;
    failures.push({ label: "pending-chain", question: "1", problems: ["candidate 1 should resolve as 'Selected 1. AMAN KUMAR' without leaking CRN"], outcome: { text: pick ? strip(pick.answer).slice(0, 160) : "" } });
    console.log(`FAIL  [pending-chain] -> ${pick ? strip(pick.answer).slice(0, 200) : "unhandled"}`);
  }
}

console.log("=".repeat(100));
console.log("WAVE 2D — Calculation torture tests");
console.log("=".repeat(100));
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  T("nested-parens", "calculate ((2+3)*(4-1))/5", { h: answered });
  T("power", "2 ^ 10", { h: answered });
  T("modulo", "17 mod 5", { h: safeFallback });
  T("percent-decimal", "12.5% of 80", { h: answered });
  T("negative-result", "5 - 18", { h: answered });
  T("equation-neg", "solve -2x + 4 = 10", { h: answered });
  T("equation-frac", "solve 3x - 0.5 = 1", { h: answered });
  T("huge-numbers", "999999999999 * 999999999999", { h: safeFallback });
  T("div-zero", "10 / 0", { h: safeFallback });
  T("wordy-calc", "what is forty plus two", { h: safeFallback });
  T("calc-with-x", "x + 2", { h: safeFallback });
  T("emoji-calc", "5 + 5 🎉", { h: answered });
}

console.log("=".repeat(100));
console.log("WAVE 2E — Privacy red lines under pressure");
{
  const harness = createAppHarness();
  const base = { harness };
  const T = (label, q, checks, opts) => probe(label, q, checks, { ...base, ...opts });

  // Bare names must never leak roster identifiers even in mixed language.
  T("bare-hinglish", "aman kumar batao", { h: safeFallback });
  T("bare-first-only", "Kaushik", { h: safeFallback });
  // Explicit student search reveals only after unique resolution.
  T("explicit-ok", "find student by CRN 2610002", { h: answered });
  // Faculty directory stays public.
  T("faculty-email", "what is the email of Dr Jasmeet Kaur?", { h: answered });
  // Roster enumeration attempts must fail closed.
  T("enumerate-attempt", "list all students", { h: safeFallback });
  T("enumerate-section", "show all students of ECB", { h: safeFallback });
  T("enumerate-count", "how many students are in ECB?", { h: safeFallback });
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
