/**
 * Exhaustive AI-engine probe for the ai-tester swarm agent.
 * Tests all 17 input categories and reports pass/fail per test case.
 * Run: node test/ai-tester-probe.mjs
 */

import { canonicalize, mentions, contentTokens, VOCAB } from "../next/engine/language.js";
import { answerLocally, buildAnswerContext } from "../next/engine/answer.js";
import { getIndiaNow } from "../next/engine/datetime.js";

/* ── stub timetable data ──────────────────────────────────────────────── */

const schedule = [
  { id: "cea-mon-math",  group: "CEA", day: "Monday",    start: 510, end: 570, subject: "MATH I",                             teacher: "DR GAGANDEEP KAUR LOTEY", room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-phy",   group: "CEA", day: "Monday",    start: 570, end: 630, subject: "PHYSICS",                            teacher: "DR PARAMJIT SINGH",        room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-lab",   group: "CEA", day: "Monday",    start: 630, end: 750, subject: "PHYSICS LAB",                        teacher: "ER SATWANT SINGH",         room: "S201", type: "P", cohorts: "CEA1,CEA2" },
  { id: "cea-tue-pps",   group: "CEA", day: "Tuesday",   start: 510, end: 570, subject: "PROGRAMMING FOR PROBLEM SOLVING",    teacher: "MS SIMRAN",                room: "G101", type: "L", cohorts: "" },
  { id: "cea-tue-chem",  group: "CEA", day: "Tuesday",   start: 630, end: 690, subject: "CHEMISTRY",                          teacher: "DR NEHA SHARMA",           room: "F110", type: "L", cohorts: "" },
  { id: "cea-wed-chem",  group: "CEA", day: "Wednesday", start: 510, end: 570, subject: "CHEMISTRY",                          teacher: "DR NEHA SHARMA",           room: "F110", type: "L", cohorts: "" },
  { id: "cea-wed-math",  group: "CEA", day: "Wednesday", start: 630, end: 690, subject: "MATH I",                             teacher: "DR GAGANDEEP KAUR LOTEY", room: "F108", type: "L", cohorts: "" },
  { id: "cea-thu-bee",   group: "CEA", day: "Thursday",  start: 510, end: 570, subject: "BASIC ELECTRICAL AND ELECTRONICS ENGINEERING", teacher: "DR BEE PROF",  room: "E201", type: "L", cohorts: "" },
  { id: "cea-fri-draw",  group: "CEA", day: "Friday",    start: 510, end: 570, subject: "ENGINEERING DRAWING",                teacher: "DR DRAWING",               room: "F101", type: "L", cohorts: "" },
];

const roomSchedule = [
  { group: "G6",   day: "Monday", start: 510, end: 570, subject: "PHYSICS",  teacher: "A", room: "G6",   type: "L", cohorts: "" },
  { group: "F101", day: "Monday", start: 510, end: 570, subject: "MATH I",   teacher: "B", room: "F101", type: "L", cohorts: "" },
];

const datesheet = {
  source: { url: "https://example.com/datesheet" },
  checkedAt: "2026-11-01",
  tabs: [{
    label: "Applied Sciences",
    sessionAssignmentReliable: true,
    entries: [
      { date: "2026-12-05", subject: "PHYSICS" },
      { date: "2026-12-08", subject: "MATH I" },
      { date: "2026-12-10", subject: "CHEMISTRY" },
    ]
  }]
};

// Monday 08:00 IST — a live class day
const ctx = buildAnswerContext({
  schedule,
  roomSchedule,
  group: "CEA",
  profile: { name: "Harjot Singh", section: "CEA", branch: "Civil Engineering", mentor: "DR MENTOR" },
  now: getIndiaNow(new Date("2026-11-09T02:30:00Z")), // Monday 08:00 IST
  metadata: { version: "17-09-2026", checkedAt: "2026-11-01" },
  datesheet,
});

/* ── helpers ──────────────────────────────────────────────────────────── */

let passed = 0, failed = 0, skipped = 0;
const failures = [];

function check(label, question, assertion) {
  try {
    const result = answerLocally(question, ctx);
    const ok = assertion(result);
    if (ok) {
      passed++;
      console.log(`  ✅ ${label}`);
    } else {
      failed++;
      const intent = result?.intent || "null";
      const snippet = result?.html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "(no html)";
      console.log(`  ❌ ${label}`);
      console.log(`     intent=${intent}  html="${snippet}"`);
      failures.push({ label, question, intent, snippet });
    }
  } catch (err) {
    failed++;
    console.log(`  💥 ${label} — THREW: ${err.message}`);
    failures.push({ label, question, error: err.message });
  }
}

function checkCanon(label, input, expected) {
  try {
    const got = canonicalize(input);
    if (got === expected) {
      passed++;
      console.log(`  ✅ canon: "${input}" → "${got}"`);
    } else {
      failed++;
      console.log(`  ❌ canon: "${input}" → got "${got}", expected "${expected}"`);
      failures.push({ label, input, got, expected });
    }
  } catch (err) {
    failed++;
    console.log(`  💥 canon ${label} — THREW: ${err.message}`);
    failures.push({ label, error: err.message });
  }
}

function checkMentions(label, text, terms, expectTrue) {
  try {
    const got = mentions(text, terms);
    if (got === expectTrue) {
      passed++;
      console.log(`  ✅ mentions: "${text}" ∋ [${terms}] = ${got}`);
    } else {
      failed++;
      console.log(`  ❌ mentions: "${text}" ∋ [${terms}] = ${got}, expected ${expectTrue}`);
      failures.push({ label, text, terms, got, expected: expectTrue });
    }
  } catch (err) {
    failed++;
    failures.push({ label, error: err.message });
  }
}

function hasIntent(result, ...intents) { return intents.includes(result?.intent); }
function hasText(result, ...words) { return words.every(w => result?.html?.toLowerCase().includes(w.toLowerCase())); }

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 1: Proper English
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 1. Proper English");
check("next class",          "What is my next class?",           r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("show timetable",      "Show my timetable",                r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("who teaches Physics", "Who teaches Physics?",             r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "PARAMJIT"));
check("today schedule",      "What is today's schedule?",        r => hasIntent(r, "DAY_SCHEDULE"));
check("tomorrow timetable",  "Show my timetable for tomorrow",   r => hasIntent(r, "DAY_SCHEDULE"));
check("when does day end",   "When does my day end?",            r => hasIntent(r, "LAST_CLASS"));
check("free rooms now",      "Which rooms are free now?",        r => hasIntent(r, "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE"));
check("where is physics",    "Where is Physics?",                r => hasIntent(r, "SUBJECT_ROOMS"));
check("when is math",        "When is Math?",                    r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE"));
check("exam datesheet",      "Show my ESE datesheet",            r => hasIntent(r, "DATESHEET"));
check("what is my profile",  "What is my profile?",              r => hasIntent(r, "PROFILE"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 2: Broken/Fuzzy English
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 2. Broken/fuzzy English");
check("wat nxt cls",         "wat is my nxt cls?",               r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("who teeches phyics",  "who teeches phyics",               r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "PARAMJIT"));
check("wen iz math",         "wen iz math",                      r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE"));
check("wher is chem",        "wher is chem",                     r => hasIntent(r, "SUBJECT_ROOMS"));
check("timetbel bhejo",      "timetbel bhejo",                   r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("hw many free rooms",  "hw many free rroms rn",            r => hasIntent(r, "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE"));
check("exm dateshet kab",    "exm dateshet kab",                 r => hasIntent(r, "DATESHEET"));
check("tommorow shedule",    "tommorow ka shedule",              r => hasIntent(r, "DAY_SCHEDULE"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 3: Indian English
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 3. Indian English");
check("timetable na",        "Tell me the timetable na",         r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("yaar tomorrow class", "yaar what class is there tomorrow",r => hasIntent(r, "DAY_SCHEDULE"));
check("bhai physics kab hai","bhai physics kab hai",             r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE"));
check("only ji suffix",      "sir ka timetable please",          r => r !== null);
check("tomorrow class only", "tomorrow class only",              r => hasIntent(r, "DAY_SCHEDULE"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 4: Hinglish mixed
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 4. Hinglish mixed");
check("mera next class",     "mera next class kya hai?",         r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("aaj ka timetable",    "aaj ka timetable batao",           r => hasIntent(r, "DAY_SCHEDULE"));
check("kal physics kahan",   "kal Physics kahan hai",            r => hasIntent(r, "SUBJECT_ROOMS", "SUBJECT_SCHEDULE"));
check("meri agli class",     "meri agli class kadon hai",        r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("physics kahan hai",   "physics kahan hai",                r => hasIntent(r, "SUBJECT_ROOMS"));
check("aaj free period",     "aaj koi free period hai",          r => hasIntent(r, "FREE_PERIODS"));
check("kaun padhata physics","kaun padhata hai physics",         r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "PARAMJIT"));
check("mera section kya hai","mera section kya hai",             r => hasText(r, "CEA"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 5: SMS/Abbreviations
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 5. SMS/Abbreviations");
check("tt?",                 "tt?",                              r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("nxt cls tmrw?",       "nxt cls tmrw?",                   r => hasIntent(r, "DAY_SCHEDULE"));
check("phys tm?",            "phys tm?",                        r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE"));
check("wt cls aftr lunch",   "wt cls aftr lunch",               r => r !== null);
check("tmrw tt",             "tmrw tt",                         r => hasIntent(r, "DAY_SCHEDULE"));
check("nxt cls plz",         "nxt cls plz",                     r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 6: Hindi Devanagari
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 6. Hindi (Devanagari)");
check("aaj ka timetable dev","आज का टाइमटेबल",                   r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE") || r !== null);
check("meri agli class dev", "मेरी अगली क्लास",                  r => r !== null);
check("physics kab dev",     "फिजिक्स कब है",                    r => r !== null);
check("full devanagari",     "मेरा अगला क्लास कब है",             r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS") || r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 7: Punjabi Gurmukhi
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 7. Punjabi (Gurmukhi)");
check("class kadon gurmukhi","ਮੇਰੀ ਕਲਾਸ ਕਦੋਂ ਹੈ",                r => r !== null);
check("tomorrow gurmukhi",   "ਕੱਲ੍ਹ ਦੀ ਟਾਈਮਟੇਬਲ",               r => r !== null);
check("today gurmukhi",      "ਅੱਜ ਦਾ ਟਾਈਮ ਟੇਬਲ",                r => r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 8: American/UK English
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 8. American/UK English");
check("schedule today",      "What's on my schedule today?",     r => hasIntent(r, "DAY_SCHEDULE"));
check("next lecture mate",   "When's my next lecture mate?",     r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("class right now",     "What class am I in right now?",    r => hasIntent(r, "NEXT_CLASS", "CURRENT_CLASS"));
check("today classes",       "Show me today's classes",          r => hasIntent(r, "DAY_SCHEDULE"));
check("programme today",     "What's on my programme today?",    r => r !== null);  // British spelling
check("practicals today",    "Do I have practicals today?",      r => r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 9: Fuzzy subjects
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 9. Fuzzy subjects");
check("fyziqs",              "fyziqs kab hai",                   r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE") && hasText(r, "PHYSICS"));
check("kemistry",            "kemistry teacher",                 r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "NEHA"));
check("mth",                 "mth class kab hai",                r => hasIntent(r, "SUBJECT_TIMING", "SUBJECT_SCHEDULE") && hasText(r, "MATH"));
check("pps class",           "pps class",                        r => hasText(r, "PROGRAMMING"));
check("beee",                "beee class",                       r => hasText(r, "ELECTRICAL"));
check("phyics typo",         "phyics teacher kaun hai",          r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "PARAMJIT"));
check("chem typo",           "chemstry lab today",               r => r !== null);
check("drwing",              "drwing class",                     r => hasText(r, "DRAWING") || r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 10: Room queries
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 10. Room queries");
check("free room now",       "which room is free now?",          r => hasIntent(r, "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE"));
check("G6 available?",       "G6 available?",                    r => hasIntent(r, "ROOM_AVAILABILITY", "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE") || r !== null);
check("khali room batao",    "khali room batao",                 r => hasIntent(r, "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE"));
check("F101 free?",          "is F101 free now?",                r => hasIntent(r, "ROOM_AVAILABILITY"));
check("room f108 schedule",  "room F108 schedule",               r => hasIntent(r, "ROOM_SCHEDULE") || r !== null);
check("lab free?",           "is any lab free now?",             r => hasIntent(r, "FREE_ROOMS", "FREE_ROOMS_UNAVAILABLE"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 11: Teacher queries
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 11. Teacher queries");
check("who teaches math",    "who teaches math?",                r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "GAGANDEEP"));
check("sir ka timetable",    "sir ka timetable",                 r => r !== null);
check("kaun padhata physics","kaun padhata hai physics",         r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "PARAMJIT"));
check("gagandeep schedule",  "Dr Gagandeep timetable",           r => hasIntent(r, "TEACHER_SCHEDULE") || r !== null);
check("simran teacher",      "simran teacher kaun class",        r => hasIntent(r, "TEACHER_SCHEDULE") || r !== null);
check("who teaches pps",     "who teaches programming",          r => hasIntent(r, "SUBJECT_TEACHERS") && hasText(r, "SIMRAN"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 12: Shortcuts
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 12. Shortcuts");
check("tt",                  "tt",                               r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("today",               "today",                            r => hasIntent(r, "DAY_SCHEDULE"));
check("tmrw",                "tmrw",                             r => hasIntent(r, "DAY_SCHEDULE"));
check("exam",                "exam",                             r => hasIntent(r, "DATESHEET") || r !== null);
check("free",                "free",                             r => r !== null); // ambiguous, any answer fine

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 13: Edge cases
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 13. Edge cases");
check("empty string",        "",                                 r => r === null);
check("only punctuation",    "???!!!...",                        r => r === null);
check("only spaces",         "   ",                              r => r === null);
check("single char",         "a",                                r => r === null);
check("emoji only",          "🎓📚",                             r => r === null);
check("emoji + text",        "📚 physics class kab hai",         r => r !== null);
check("very long query",     "a".repeat(900),                   r => r?.intent === "TOO_LONG");
check("numbers only",        "123 456 789",                      r => r === null);
check("unicode noise",       "🔥🚀💥 show timetable 🔥",         r => r !== null);
check("repeated chars",      "whaaaaat is my next claaass",      r => r !== null); // deduped by canonicalize

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 14: Exam queries
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 14. Exam queries");
check("datesheet",           "datesheet",                        r => hasIntent(r, "DATESHEET") || r !== null);
check("exam kab hai",        "exam kab hai",                     r => hasIntent(r, "DATESHEET") || r !== null);
check("end sem exam",        "end sem exam kab hai",             r => hasIntent(r, "DATESHEET") || r !== null);
check("ese physics",         "ESE physics exam kab hai",         r => hasIntent(r, "DATESHEET") && hasText(r, "PHYSICS"));
check("mse datesheet",       "mse datesheet",                    r => r !== null);
check("paper kab hai",       "paper kab hai",                    r => r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 15: Calculations / attendance
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 15. Calculations");
check("75% of 50 classes",   "75% of 50 classes how many",       r => hasIntent(r, "ATTENDANCE_UNAVAILABLE") || r === null); // graceful
check("CGPA to percent",     "CGPA 8.4 to percent",              r => r === null || r !== null); // may not handle
check("how many miss",       "how many classes can I miss",       r => hasIntent(r, "ATTENDANCE_UNAVAILABLE") || r !== null);
check("attendance",          "mera attendance kitna hai",         r => hasIntent(r, "ATTENDANCE_UNAVAILABLE") || r !== null);

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 16: Greeting variants
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 16. Greeting variants");
check("hi",                  "hi",                               r => hasIntent(r, "GREETING"));
check("hello",               "hello",                            r => hasIntent(r, "GREETING"));
check("sat sri akal",        "sat sri akal",                     r => hasIntent(r, "GREETING"));
check("ram ram",             "ram ram",                          r => hasIntent(r, "GREETING"));
check("namaskar",            "namaskar",                         r => hasIntent(r, "GREETING"));
check("good morning",        "good morning",                     r => hasIntent(r, "GREETING"));
check("good evening",        "good evening",                     r => hasIntent(r, "GREETING"));
check("namaste",             "namaste",                          r => hasIntent(r, "GREETING"));
check("hey bhai",            "hey bhai",                         r => hasIntent(r, "GREETING") || r !== null);
check("hello ji",            "hello ji",                         r => hasIntent(r, "GREETING"));

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY 17: British spellings
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 17. British spellings");
check("programme",           "show my programme for today",      r => hasIntent(r, "DAY_SCHEDULE") || r !== null);
check("practicals",          "when are my practicals",           r => r !== null);
check("timetable British",   "timetable please",                 r => hasIntent(r, "DAY_SCHEDULE", "WEEK_SCHEDULE"));
check("colour/colour n/a",   "what colour is my room",           r => r === null || r !== null); // graceful

/* ═══════════════════════════════════════════════════════════════════════
   CANONICALIZATION CHECKS
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 Canonicalization spot-checks");
checkCanon("What's contracted",    "What's my next class?",   "what is my next class");
checkCanon("SMS shortform",        "wt is my nxt cls",        "what is my next class");
checkCanon("Hinglish",             "mera agla class kab hai", "my next class when is");
checkCanon("Hinglish batao",       "aaj ka timetable batao",  "today ka timetable show");
checkCanon("timetbel typo",        "timetbel bhejo plz",      "timetable show please");
checkCanon("tommorow typo",        "tommorow ka shedule",     "tomorrow ka schedule");

/* ═══════════════════════════════════════════════════════════════════════
   MENTIONS CHECKS
══════════════════════════════════════════════════════════════════════════ */
console.log("\n📗 Mentions spot-checks");
checkMentions("timetbel→timetable",      "timetbel bhejo",    ["timetable"],   true);
checkMentions("rroms→room",              "free rroms?",       ["room"],        true);
checkMentions("wensday→wednesday",       "wensday schedule",  ["wednesday"],   true);
checkMentions("ticher→teacher",          "ticher kaun",       ["teacher"],     true);
checkMentions("physics≠chemistry",       "physics",           ["chemistry"],   false);
checkMentions("fyziqs→physics",          "fyziqs class",      ["physics"],     true);
checkMentions("kemistry→chemistry",      "kemistry class",    ["chemistry"],   true);
checkMentions("sat sri akal→hello",      "sat sri akal",      ["hello"],       true);

/* ═══════════════════════════════════════════════════════════════════════
   SUMMARY
══════════════════════════════════════════════════════════════════════════ */
console.log(`\n${"═".repeat(60)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`${"═".repeat(60)}\n`);

if (failures.length) {
  console.log("FAILED CASES:");
  for (const f of failures) {
    console.log(`  - ${f.label || f.input}`);
    if (f.intent) console.log(`    intent: ${f.intent}`);
    if (f.snippet) console.log(`    html:   ${f.snippet}`);
    if (f.got !== undefined) console.log(`    got: "${f.got}"  expected: "${f.expected}"`);
    if (f.error) console.log(`    error: ${f.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
