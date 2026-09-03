import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import test from "node:test";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const manifestSource = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const syllabusIndex = JSON.parse(await readFile(new URL("../public/data/first-year-syllabus-index.json", import.meta.url), "utf8"));
const officialGroupFixture = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");
const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*?(?=function kbClean)/,
  ""
).replace(
  /function kbClean/,
  "globalThis.__parserTest = { parseFetTimetable, state, classFor, subgroupsFor, preferredGroup, groupLabel, activeTimetableLabel, buildScheduleIndex, renderWeek, renderReferenceLinks, safeStoredChatHtml, answerQuestion, isStructuredQuestion, isHeavyQuestion, shouldUseActualAi, canonicalTimetableQuestion, requestedTime, requestedTimetableDate, requestedTimetableWindow, timetableWindowAnswer, formatAiAnswer, assistantContext, redactSensitiveAiText, normalizeStudentName, normalizeStudentIdentifier, normalizeStudentRecord, studentIdentifierValues, studentIdentifierMatch, resolveStudentIdentifierMatches, mergeStudentRecord, mergeStudentRosterHistory, studentMatchScore, parseStudentSectionText, answerSyllabusQuestion, answerSyllabusFollowup, contextualLocalFollowupAnswer, parseSyllabusText, answerSyllabusPageSearch, syllabusQuestionSuggestions, localQuestionSuggestions, rankQuestionSuggestions, normalizeQuestionSuggestion, chooseQuestionSuggestion, activateQuestionSuggestion, followupSuggestions, answerCompassQuestion, answerFromKnowledgeBase, answerWithoutAi, legacyAnswerWithoutAi, isSyllabusQuestion, getIndiaNow, indiaCalendarDate, nextStudyDayInfo, nextScheduledDay, officialFreeLectureSlots, dayPlanEntries, dayScheduleAnswer, engineeringBranchesAnswer, verifiedAiAnswerOverride, localClarificationAnswer, isKaushikAdminProfile, adminProfileFingerprint, revokeAdminAiView, hasAdminAiView, adminAiMode, adminRequestedModel, adminForcesActualAi, isStudentRosterReference, currentTimetableNoticeLinks, studentDetailFlags, looksLikePlainStudentNameQuery, isHolidayCalendarQuestion, studentLookupRequest, safeRosterLookupRecord, studentLookupContextFromRecords, rosterCountRequest, rosterCountAnswer, legacyStudentLookupAnswer, facultyLookupRequest, legacyFacultyLookupAnswer, saveManualProfile, profileMatchesTimetableSelection, populateStudentLookupInput, mentoringClassAnswer, officialTimetableViewAnswer, requestedOfficialTimetableView, explicitTimetableSelectionAnswer, isTimetableComparisonQuestion, compareTimetableReleases, detectedTimetableUpdate, timetableUpdateAnswer, namedPersonTimetableRequest, namedPersonComparisonRequest, timetablePersonCaption, readOnlyStudentTimetableAnswer, readOnlyTeacherTimetableAnswer, scheduleAnswer };\nfunction kbClean"
);
const { document } = parseHTML("<!doctype html><html><body></body></html>");
const storage = new Map();
const context = vm.createContext({
  URL,
  Event: document.defaultView.Event,
  DOMParser: class {
    parseFromString(html) {
      return parseHTML(html).document;
    }
  },
  document,
  location: { origin: "https://compass.example", hash: "" },
  history: { pushState() {} },
  window: document.defaultView,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  }
});
vm.runInContext(sourceUnderTest, context);

const FET_FIXTURE = `
  <table>
    <caption><span class="name">CSA</span></caption>
    <thead><tr><td></td><th class="xAxis">Monday</th><th class="xAxis">Tuesday</th><th class="xAxis">Wednesday</th><th class="xAxis">Thursday</th><th class="xAxis">Friday</th></tr></thead>
    <tbody>
      <tr>
        <th class="yAxis">08:30</th>
        <td><table class="detailed"><tr class="studentsset"><td>CSA1</td><td>CSA2</td></tr><tr class="line1"><td><span class="subject">PROGRAMMING</span><span class="activitytag"> P</span></td><td><span class="subject">PHYSICS</span><span class="activitytag"> P</span></td></tr><tr class="teacher"><td>ER. SINGH</td><td>DR. KAUR</td></tr><tr class="room"><td>LAB A</td><td>LAB B</td></tr></table></td>
        <td><div class="studentsset">CSA</div><span class="subject">MATH I</span><span class="activitytag"> L</span><div class="teacher">DR. SHARMA</div><div class="room">F101</div></td>
      </tr>
      <tr><th class="yAxis">09:30</th><td class="empty">---</td><td class="empty">---</td></tr>
    </tbody>
  </table>`;

test("parses nested FET subgroup cells without losing teacher, room, or cohort", () => {
  const { parseFetTimetable, state, classFor, subgroupsFor, buildScheduleIndex } = context.__parserTest;
  const schedule = parseFetTimetable(FET_FIXTURE);

  assert.equal(schedule.length, 3);
  assert.deepEqual([...subgroupsFor.call(null, "CSA")], []);
  state.schedule = schedule;
  assert.deepEqual([...subgroupsFor("CSA")], ["CSA1", "CSA2"]);
  state.selectedGroup = "CSA";
  state.selectedSubgroup = "CSA1";
  buildScheduleIndex();
  assert.deepEqual([...classFor("CSA", "Monday")].map((item) => item.subject), ["PROGRAMMING"]);
  assert.deepEqual([...classFor("CSA", "Tuesday")].map((item) => item.subject), ["MATH I"]);
  state.selectedSubgroup = "CSA2";
  assert.deepEqual([...classFor("CSA", "Monday")].map((item) => item.subject), ["PHYSICS"]);
  state.selectedSubgroup = "";
  assert.equal(classFor("CSA", "Monday").length, 2);
});

test("records a dismissible update only for a real verified timetable release difference", () => {
  const { state, parseFetTimetable, detectedTimetableUpdate, timetableUpdateAnswer, answerCompassQuestion } = context.__parserTest;
  const previousSchedule = parseFetTimetable(FET_FIXTURE);
  const nextSchedule = previousSchedule.map((entry) => entry.subject === "MATH I" ? { ...entry, room: "A12", teacher: "DR NEW TEACHER" } : entry);
  state.selectedGroup = "CSA";
  state.selectedSubgroup = "CSA1";
  const sourceInfo = {
    version: "Revised w.e.f. 01-09-2026",
    sources: [
      { id: "groups", contentHash: "new-groups", sourceFooter: "FET 7.6.4 · 9/1/26 9:00 AM", url: "https://appsc.gndec.ac.in/time_tables" },
      { id: "subgroups", contentHash: "new-subgroups" }
    ]
  };
  const update = detectedTimetableUpdate({
    source: "Official GNDEC group timetable",
    sourceInfo,
    previousSchedule,
    previousOverlay: [],
    previousMetadata: { sourceRevision: "old-groups|old-subgroups", version: "Revised w.e.f. 24-08-2026", sourceFooter: "FET 7.6.4 · 8/30/26 10:39 PM" },
    nextSchedule,
    nextOverlay: []
  });
  assert.ok(update);
  assert.equal(update.selectedAffected, true);
  assert.deepEqual([...update.affectedGroups], ["CSA"]);
  assert.equal(update.oldFooter, "FET 7.6.4 · 8/30/26 10:39 PM");
  assert.equal(update.newFooter, "FET 7.6.4 · 9/1/26 9:00 AM");
  assert.ok(update.changes.some((change) => change.fields?.includes("room") && change.fields?.includes("teacher")));
  assert.equal(detectedTimetableUpdate({
    source: "Official GNDEC group timetable", sourceInfo: { ...sourceInfo, fallback: { version: "previous" } }, previousSchedule, previousOverlay: [],
    previousMetadata: { sourceRevision: "old-groups|old-subgroups" }, nextSchedule, nextOverlay: []
  }), null, "a temporary fallback must never announce a new timetable");
  state.timetableUpdate = update;
  assert.match(timetableUpdateAnswer(), /New timetable detected/);
  assert.match(timetableUpdateAnswer(), /FET 7\.6\.4/);
  assert.match(answerCompassQuestion("What changed in my timetable?"), /New timetable detected/);
  state.timetableUpdate = null;
});

test("defaults to ECB when the official group list includes ECE sections", () => {
  const { preferredGroup } = context.__parserTest;
  assert.equal(preferredGroup(["CSA", "ECB", "ECA", "MEB"]), "ECB");
  assert.equal(preferredGroup(["CSA", "ECB", "MEB"]), "ECB");
});

test("labels all live groups with their department while retaining the source code", () => {
  const { groupLabel } = context.__parserTest;
  assert.equal(groupLabel("ECB"), "ECB - Electronics and Communication Engineering");
  assert.equal(groupLabel("D3CSA"), "D3CSA - Computer Science Engineering");
  assert.match(groupLabel("BCA1A"), /Computer Applications/);
});

test("keeps the original full weekly grid on narrow screens so timetable gaps remain visible", () => {
  const { state, parseFetTimetable, buildScheduleIndex, renderWeek } = context.__parserTest;
  document.body.innerHTML = `<select id="timetable-group"><option value="CSA" selected>CSA</option></select><input id="timetable-search" value="" /><p id="timetable-result-status"></p><div id="week-table"></div>`;
  state.schedule = parseFetTimetable(FET_FIXTURE);
  state.selectedGroup = "CSA";
  state.selectedSubgroup = "";
  buildScheduleIndex();
  renderWeek();
  assert.ok(document.querySelector(".week-grid"));
  assert.equal(document.querySelectorAll(".week-head").length, 6);
  const timeRows = [...document.querySelectorAll(".week-time")];
  assert.equal(timeRows.length, 8);
  assert.equal(timeRows[0].querySelector(".week-time-start").textContent, "8:30 AM");
  assert.equal(timeRows[0].querySelector(".week-time-end").textContent, "9:30 AM");
  assert.equal(timeRows[7].querySelector(".week-time-start").textContent, "3:30 PM");
  assert.equal(timeRows[7].querySelector(".week-time-end").textContent, "4:20 PM");
  timeRows.forEach((row) => assert.equal(row.querySelectorAll(".week-time-start, .week-time-end").length, 2));
  assert.equal(document.querySelectorAll(".week-mobile, .mobile-day").length, 0);
  assert.match(document.getElementById("week-table").textContent, /PROGRAMMING/);
  assert.match(document.getElementById("timetable-result-status").textContent, /3 classes across 2 days/);

  document.getElementById("timetable-search").value = "math";
  renderWeek();
  assert.ok(document.querySelector(".week-grid"));
  assert.equal(document.querySelectorAll(".week-mobile, .mobile-day").length, 0);
  assert.match(document.getElementById("timetable-result-status").textContent, /1 class across 1 day/);
});

test("typing suggestions rank intent, typos, and active timetable facts locally", () => {
  const { state, buildScheduleIndex, localQuestionSuggestions, rankQuestionSuggestions, normalizeQuestionSuggestion } = context.__parserTest;
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.groups = ["ECB"];
  state.schedule = [
    { id: "math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9", type: "L", cohorts: "ECB1" },
    { id: "physics", group: "ECB", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6", type: "L", cohorts: "ECB1" }
  ];
  buildScheduleIndex();

  assert.equal(normalizeQuestionSuggestion("nxt clas"), "next class");
  assert.equal(localQuestionSuggestions("nxt clas")[0], "What is my next class?");
  assert.equal(localQuestionSuggestions("mat wher")[0], "Where is MATH I?");
  assert.equal(rankQuestionSuggestions("mat unt", ["Physics syllabus", "Math units", "What is my next class?"])[0], "Math units");
  assert.ok(localQuestionSuggestions("sukh teach").some((suggestion) => /SUKHMINDER SINGH/.test(suggestion)));
  assert.ok(localQuestionSuggestions("mentor").some((suggestion) => /mentoring class/i.test(suggestion)));
  assert.ok(localQuestionSuggestions("faculty time").some((suggestion) => /Faculty timetable/i.test(suggestion)));
  assert.ok(localQuestionSuggestions("solve").some((suggestion) => /Solve 2x \+ 3 = 11/i.test(suggestion)));
  assert.ok(localQuestionSuggestions("").length > 0, "focus should offer useful starter actions on a new device");
});

test("clicking a live question suggestion fills and submits it exactly once", () => {
  const { activateQuestionSuggestion } = context.__parserTest;
  document.body.innerHTML = `<form id="question-form"><input id="question-input" /><div id="question-live-suggestions"><button type="button" data-question-suggestion="Where is PHYSICS?"><span>Where is PHYSICS?</span></button></div></form>`;
  let submissions = 0;
  document.getElementById("question-form").addEventListener("submit", (event) => { event.preventDefault(); submissions += 1; });
  const button = document.querySelector("[data-question-suggestion]");
  assert.equal(activateQuestionSuggestion(button), true);
  assert.equal(document.getElementById("question-input").value, "Where is PHYSICS?");
  assert.equal(submissions, 1);
  assert.equal(document.getElementById("question-live-suggestions").hidden, true);
});

test("answer follow-ups use verified context and never repeat the user's question", () => {
  const { state, parseSyllabusText, followupSuggestions } = context.__parserTest;
  state.syllabus = parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  const upcoming = followupSuggestions("What is my next class?", {
    intent: "UPCOMING_CLASS",
    facts: { class: { subject: "MATH I", day: "Monday", room: "A9", teacher: "SUKHMINDER SINGH" } }
  });
  const upcomingDocument = parseHTML(`<body>${upcoming}</body>`).document;
  const upcomingLabels = [...upcomingDocument.querySelectorAll("[data-kb-followup]")].map((button) => button.textContent);
  assert.deepEqual(upcomingLabels, ["Where is MATH I?", "Who teaches MATH I?", "2nd next class"]);
  assert.ok(!upcomingLabels.includes("What is my next class?"));

  const syllabus = followupSuggestions("Math units");
  assert.match(syllabus, /Mathematics - I course outcomes/);
  assert.match(syllabus, /Mathematics - I assessment marks/);
  assert.match(syllabus, /Mathematics - I textbooks/);
  assert.doesNotMatch(syllabus, /Physics textbooks/);

  const roomFollowups = followupSuggestions("Physics kahan hai?", { intent: "SUBJECT_LOCATION", facts: { subject: "PHYSICS" } });
  assert.doesNotMatch(roomFollowups, />Where is PHYSICS\?</);
  assert.match(roomFollowups, />Who teaches PHYSICS\?</);
  assert.match(roomFollowups, />PHYSICS syllabus</);
});

test("ships progressive accessibility and a privacy-safe installable offline shell", () => {
  const manifest = JSON.parse(manifestSource);
  assert.match(pageSource, /id="question-input" role="combobox"/);
  assert.match(pageSource, /aria-label="Suggested Compass questions"/);
  assert.match(pageSource, /<noscript>/);
  assert.match(pageSource, /rel="manifest"/);
  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.display, "standalone");
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorkerSource, /request\.mode === "navigate"/);
  assert.match(stylesSource, /\.question-suggestion\[aria-selected="true"\]/);
  assert.match(stylesSource, /\.question-suggestion,\.kb-followup/);
});

test("restored chat markup keeps official faculty media but strips executable content", () => {
  const { safeStoredChatHtml } = context.__parserTest;
  const cleaned = safeStoredChatHtml(`<p onclick="alert(1)">Safe</p><script>alert(1)</script><a href="javascript:alert(1)">bad</a><a href="https://gndec.ac.in/faculty/?id=12">official</a><img src="/api/faculty/photo?id=12" data-faculty-photo-fallback="https://gndec.ac.in/images/photo.jpg" referrerpolicy="no-referrer" onerror="alert(1)" /><img src="https://evil.example/photo.jpg" />`);
  assert.match(cleaned, />Safe</);
  assert.match(cleaned, /https:\/\/gndec\.ac\.in\/faculty\/\?id=12/);
  assert.match(cleaned, /\/api\/faculty\/photo\?id=12/);
  assert.match(cleaned, /data-faculty-photo-fallback="https:\/\/gndec\.ac\.in\/images\/photo\.jpg"/);
  assert.match(cleaned, /referrerpolicy="no-referrer"/);
  assert.doesNotMatch(cleaned, /script|onclick|onerror|javascript:|evil\.example/i);
});

test("Hindi and Hinglish timetable commands can never be mistaken for student names", () => {
  const { studentLookupRequest } = context.__parserTest;
  const remembered = { name: "REMEMBERED STUDENT", section: "ECB", subsection: "ECB1" };
  [
    "Aaj ka timetable batao",
    "Kal ka timetable batao",
    "monday timetable",
    "free lectures today",
    "Math units"
  ].forEach((question) => {
    assert.equal(studentLookupRequest(question), null, question);
    assert.equal(studentLookupRequest(question, remembered), null, `${question} with roster conversation`);
  });
});

test("answers room questions in English, Hindi, Hinglish, and Punjabi", () => {
  const { state, buildScheduleIndex, answerQuestion } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.groups = ["ECA"];
  state.schedule = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].flatMap((day) => [
    { id: `${day}-physics`, group: "ECA", day, start: 510, end: 560, subject: "PHYSICS", teacher: "DR KAUR", room: "PHY LAB 1", type: "P", cohorts: "ECA" },
    { id: `${day}-math`, group: "ECA", day, start: 570, end: 620, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" }
  ]);
  buildScheduleIndex();

  [
    "Where is Physics?",
    "Physics kahaan hai?",
    "Physics कहाँ है?",
    "Physics ਕਿੱਥੇ ਹੈ?"
  ].forEach((question) => assert.match(answerQuestion(question), /PHY LAB 1/));
});

test("answers tomorrow and next-to-next schedule questions without a network call", () => {
  const { answerQuestion } = context.__parserTest;
  assert.match(answerQuestion("Tomorrow next to next class?"), /Second upcoming class: MATH I/);
});

test("answers named-day time table questions locally instead of sending them to AI", () => {
  const { answerQuestion, isStructuredQuestion } = context.__parserTest;
  const answer = answerQuestion("my monday time table");
  assert.equal(isStructuredQuestion("my monday time table"), true);
  assert.match(answer, /ECA.*Monday/);
  assert.match(answer, /PHYSICS/);
  assert.match(answer, /Official GNDEC weekly timetable/);
});

test("keeps typoed weekdays and free-lecture questions on the local timetable path", () => {
  const { state, buildScheduleIndex, answerQuestion, isStructuredQuestion } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [
    { id: "thu-programming", group: "ECA", day: "Thursday", start: 570, end: 620, subject: "PROGRAMMING", teacher: "ER SINGH", room: "LAB A", type: "P", cohorts: "ECA" },
    { id: "thu-math", group: "ECA", day: "Thursday", start: 750, end: 800, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  assert.equal(isStructuredQuestion("thrusday"), true);
  assert.match(answerQuestion("thrusday"), /Thursday/);
  assert.match(answerQuestion("thrusday"), /PROGRAMMING/);
  const free = answerQuestion("free lectures on thrusday");
  assert.match(free, /Thursday free lectures/);
  assert.match(free, /8:30 AM - 9:30 AM/);
  assert.doesNotMatch(free, /PROGRAMMING/);
});

test("adds only genuinely unoccupied official bell slots to the daily plan", () => {
  const { officialFreeLectureSlots, dayPlanEntries } = context.__parserTest;
  const classes = [
    { id: "math", start: 570, end: 630, subject: "MATH I" },
    { id: "workshop", start: 750, end: 870, subject: "MANUFACTURING PRACTICES" }
  ];
  const free = officialFreeLectureSlots(classes);
  assert.deepEqual([...free].map((item) => item.start), [510, 630, 690, 870, 930]);
  assert.deepEqual([...free].map((item) => item.end), [570, 690, 750, 930, 980]);
  assert.deepEqual([...dayPlanEntries(classes)].map((item) => item.start), [510, 570, 630, 690, 750, 870, 930]);
});

test("preserves the official Friday ECB workshop as one two-hour practical", () => {
  const { parseFetTimetable } = context.__parserTest;
  const workshop = parseFetTimetable(officialGroupFixture).find((item) => item.group === "ECB" && item.day === "Friday" && item.subject === "MANUFACTURING PRACTICES" && item.room === "WORKSHOPS");
  assert.ok(workshop);
  assert.equal(workshop.start, 750); // 12:30 PM
  assert.equal(workshop.end, 870); // 2:30 PM
  assert.match(workshop.cohorts, /ECB/);
});

test("answers complete ECB1 day and multi-subject availability questions locally", () => {
  const { state, parseFetTimetable, buildScheduleIndex, answerWithoutAi, activeTimetableLabel } = context.__parserTest;
  state.schedule = parseFetTimetable(officialGroupFixture);
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  buildScheduleIndex();
  assert.equal(activeTimetableLabel(), "ECB1");

  const friday = answerWithoutAi("Friday timetable");
  assert.match(friday, /ECB1 · Friday/);
  assert.match(friday, /8:30 AM - 9:30 AM:<\/strong> Free lecture/);
  assert.match(friday, /12:30 PM - 2:30 PM:<\/strong> MANUFACTURING PRACTICES/);

  const availability = answerWithoutAi("is there any physics economics class on Friday; if yes give location and teacher name");
  assert.match(availability, /Yes — PHYSICS/);
  assert.match(availability, /(?:A6|F101) \(AUTOMOBILE BLOCK\).*DR JASMEET KAUR/s);
  assert.match(availability, /No — ECONOMICS/);
  assert.doesNotMatch(availability, /ENGG DRAWING/);
});

test("answers an explicitly requested subgroup without changing the active profile selection", () => {
  const { state, buildScheduleIndex, answerWithoutAi } = context.__parserTest;
  state.schedule = [
    { id: "ecb1-class", group: "ECB", day: "Monday", start: 510, end: 570, subject: "ECB1 ONLY", teacher: "Teacher One", room: "A1", type: "L", cohorts: "ECB1" },
    { id: "ecb2-class", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "ECB2 ONLY", teacher: "Teacher Two", room: "A2", type: "L", cohorts: "ECB2" }
  ];
  state.student = { name: "Test Student", section: "ECB", subsection: "ECB1", academicGroup: "ECBM1" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.academicOverlay = [];
  state.academicOverlayGroup = "";
  buildScheduleIndex();

  const answer = answerWithoutAi("Show ECB2 timetable");
  assert.match(answer, /ECB2 timetable/);
  assert.match(answer, /ECB2 ONLY/);
  assert.doesNotMatch(answer, /ECB1 ONLY/);
  assert.equal(state.selectedGroup, "ECB");
  assert.equal(state.selectedSubgroup, "ECB1");
  state.student = null;
});

test("answers timetable verification directly and never substitutes the active timetable for a named friend", () => {
  const { state, buildScheduleIndex, answerWithoutAi } = context.__parserTest;
  state.schedule = [
    { id: "ecb1-monday", group: "ECB", day: "Monday", start: 510, end: 570, subject: "ACTIVE MONDAY COURSE", teacher: "Teacher One", room: "A1", type: "L", cohorts: "ECB1" },
    { id: "ecb1-tuesday", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "ACTIVE TUESDAY COURSE", teacher: "Teacher One", room: "A1", type: "L", cohorts: "ECB1" },
    { id: "ecb2-tuesday", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "ECB2 TUESDAY COURSE", teacher: "Teacher Two", room: "A2", type: "L", cohorts: "ECB2" }
  ];
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.student = { name: "Active Student", section: "ECB", subsection: "ECB1" };
  state.metadata = { source: "Official GNDEC group timetable", version: "24-08-2026", sourceFooter: "FET 7.6.4 · 8/30/26 10:39 PM", fallback: null };
  state.sourceRegistry = { checkedAt: "2026-08-31T14:59:40.133Z", sources: [{ id: "groups", verified: true, url: "https://appsc.gndec.ac.in/current-groups.html", sourceFooter: "FET 7.6.4 · 8/30/26 10:39 PM" }] };
  buildScheduleIndex();

  const verification = answerWithoutAi("Is my timetable verified?");
  assert.match(verification, /Yes — your selected ECB1 timetable is verified/);
  assert.match(verification, /FET file footer/);
  assert.doesNotMatch(verification, /ACTIVE MONDAY COURSE/);

  const friend = answerWithoutAi("Mohitveer or Mohitveer Singh Tuesday timetable");
  assert.match(friend, /cannot verify mohitveer mohitveer singh’s timetable from a name alone/i);
  assert.match(friend, /will not show your active/i);
  assert.doesNotMatch(friend, /ACTIVE TUESDAY COURSE/);

  const explicit = answerWithoutAi("ECB2 Tuesday timetable");
  assert.match(explicit, /ECB2 timetable · Tuesday/);
  assert.match(explicit, /ECB2 TUESDAY COURSE/);
  assert.equal(state.selectedGroup, "ECB");
  assert.equal(state.selectedSubgroup, "ECB1");
  state.sourceRegistry = null;
  state.metadata = null;
  state.student = null;
});

test("resolves a named student or faculty timetable from verified source data without changing the active profile", () => {
  const { state, buildScheduleIndex, canonicalTimetableQuestion, requestedTimetableDate, explicitTimetableSelectionAnswer, namedPersonTimetableRequest, namedPersonComparisonRequest, studentLookupContextFromRecords, readOnlyStudentTimetableAnswer, timetablePersonCaption, readOnlyTeacherTimetableAnswer } = context.__parserTest;
  state.schedule = [
    { id: "active-tuesday", group: "ECB", day: "Tuesday", start: 510, end: 570, subject: "ACTIVE TUESDAY COURSE", teacher: "Teacher One", room: "A1", type: "L", cohorts: "ECB1" },
    { id: "mohitveer-monday", group: "CSD", day: "Monday", start: 510, end: 570, subject: "MOHITVEER MONDAY COURSE", teacher: "Teacher Two", room: "C1", type: "L", cohorts: "CSD2" },
    { id: "mohitveer-tuesday-first", group: "CSD", day: "Tuesday", start: 510, end: 570, subject: "MOHITVEER FIRST COURSE", teacher: "Teacher Two", room: "C1", type: "L", cohorts: "CSD2" },
    { id: "mohitveer-tuesday", group: "CSD", day: "Tuesday", start: 570, end: 630, subject: "MOHITVEER TUESDAY COURSE", teacher: "Teacher Two", room: "C2", type: "L", cohorts: "CSD2" },
    { id: "mohitveer-tuesday-last", group: "CSD", day: "Tuesday", start: 750, end: 810, subject: "MOHITVEER LAST COURSE", teacher: "Teacher Four", room: "C4", type: "L", cohorts: "CSD2" },
    { id: "mohitveer-friday", group: "CSD", day: "Friday", start: 630, end: 690, subject: "MOHITVEER FRIDAY COURSE", teacher: "Teacher Three", room: "C3", type: "L", cohorts: "CSD2" }
  ];
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.student = { name: "Active Student", section: "ECB", subsection: "ECB1" };
  state.nowOverride = "2026-09-01T04:30:00.000Z";
  buildScheduleIndex();

  const studentRequest = namedPersonTimetableRequest("Mohitveer or Mohitveer Singh Tuesday or tomorrow timetable");
  assert.deepEqual({ term: studentRequest.term, day: studentRequest.day, teacherCue: studentRequest.teacherCue }, { term: "mohitveer singh", day: "Tuesday", teacherCue: false });
  const studentLookup = studentLookupContextFromRecords(`find student ${studentRequest.term}`, [
    { name: "Mohitveer Singh", crn: "2601001", branch: "Computer Science", section: "CSD", subsection: "CSD2" }
  ], { version: "31-08-2026" });
  const studentAnswer = readOnlyStudentTimetableAnswer(studentRequest, studentLookup);
  assert.match(studentAnswer, /MOHITVEER TUESDAY COURSE/);
  assert.match(studentAnswer, /current official GNDEC roster/i);
  assert.doesNotMatch(studentAnswer, /ACTIVE TUESDAY COURSE/);
  assert.equal(state.selectedGroup, "ECB");
  assert.equal(state.selectedSubgroup, "ECB1");

  const firstRequest = namedPersonTimetableRequest("Mohitveer Singh Tuesday first class");
  assert.equal(firstRequest.window, "first");
  assert.match(readOnlyStudentTimetableAnswer(firstRequest, studentLookup), /MOHITVEER FIRST COURSE/);
  const lastRequest = namedPersonTimetableRequest("Mohitveer Singh Tuesday last class");
  assert.equal(lastRequest.window, "last");
  assert.match(readOnlyStudentTimetableAnswer(lastRequest, studentLookup), /MOHITVEER LAST COURSE/);
  const morningRequest = namedPersonTimetableRequest("Mohitveer Singh Tuesday morning classes");
  const morningAnswer = readOnlyStudentTimetableAnswer(morningRequest, studentLookup);
  assert.equal(morningRequest.window, "morning");
  assert.match(morningAnswer, /MOHITVEER FIRST COURSE/);
  assert.doesNotMatch(morningAnswer, /MOHITVEER LAST COURSE/);
  const freeRequest = namedPersonTimetableRequest("Mohitveer Singh Tuesday free classes");
  assert.equal(freeRequest.window, "free");
  assert.match(readOnlyStudentTimetableAnswer(freeRequest, studentLookup), /No class listed/);

  const versusMe = namedPersonComparisonRequest("Mohitveer Singh vs me tomorrow");
  assert.equal(versusMe.person.term, "mohitveer singh");
  assert.equal(versusMe.personOnLeft, true);
  assert.ok(versusMe.person.day);

  const casualSir = namedPersonTimetableRequest("Mohitveer Singh sir ka kl morning tt");
  assert.equal(canonicalTimetableQuestion("Mohitveer Singh sir ka kl morning tt"), "mohitveer singh teacher ka tomorrow morning timetable");
  assert.equal(casualSir.term, "mohitveer singh");
  assert.equal(casualSir.teacherCue, true);
  assert.equal(casualSir.window, "morning");
  assert.ok(casualSir.day);

  const casualComparison = namedPersonComparisonRequest("Mohitveer Singh sir ka kl ka tt and my compare krdo");
  assert.equal(casualComparison.type, "student_vs_me");
  assert.equal(casualComparison.person.term, "mohitveer singh");

  const personVsPersonTt = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh timetable");
  assert.equal(personVsPersonTt.type, "two_students");
  assert.equal(personVsPersonTt.leftPerson.term, "kaushik jain");
  assert.equal(personVsPersonTt.rightPerson.term, "mohitveer singh");

  const personVsPersonWed = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh wednesday");
  assert.equal(personVsPersonWed.type, "two_students");
  assert.equal(personVsPersonWed.day, "Wednesday");

  const personVsPersonToday = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh today timetable");
  assert.equal(personVsPersonToday.type, "two_students");
  assert.ok(personVsPersonToday.day);
  assert.ok(personVsPersonToday.dateIso);

  const personVsPersonTomorrow = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh tommorow");
  assert.equal(personVsPersonTomorrow.type, "two_students");
  assert.ok(personVsPersonTomorrow.day);
  assert.ok(personVsPersonTomorrow.dateIso);

  const personVsPersonWeek = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh any week");
  assert.equal(personVsPersonWeek.type, "two_students");
  assert.equal(personVsPersonWeek.wholeWeek, true);
  assert.equal(personVsPersonWeek.day, "");

  const personVsPersonFree = namedPersonComparisonRequest("Kaushik Jain vs Mohitveer Singh free periods");
  assert.equal(personVsPersonFree.type, "two_students");
  assert.equal(personVsPersonFree.free, true);

  const personBothFreeWed = namedPersonComparisonRequest("when are Kaushik Jain and Mohitveer Singh both free on wednesday");
  assert.equal(personBothFreeWed.type, "two_students");
  assert.equal(personBothFreeWed.leftPerson.term, "kaushik jain");
  assert.equal(personBothFreeWed.rightPerson.term, "mohitveer singh");
  assert.equal(personBothFreeWed.day, "Wednesday");
  assert.equal(personBothFreeWed.free, true);

  assert.equal(namedPersonTimetableRequest("which classes are in the same lab today"), null);
  assert.equal(namedPersonTimetableRequest("what class is going on right now"), null);

  const dayAfterTomorrow = requestedTimetableDate("day after tomorrow timetable");
  assert.deepEqual({ iso: dayAfterTomorrow.iso, day: dayAfterTomorrow.day }, { iso: "2026-09-03", day: "Thursday" });

  const multiDayRequest = namedPersonTimetableRequest("Mohitveer Singh Monday and Tuesday timetable");
  const multiDayAnswer = readOnlyStudentTimetableAnswer(multiDayRequest, studentLookup);
  assert.deepEqual([...multiDayRequest.days], ["Monday", "Tuesday"]);
  assert.match(multiDayAnswer, /MOHITVEER MONDAY COURSE/);
  assert.match(multiDayAnswer, /MOHITVEER TUESDAY COURSE/);

  assert.match(explicitTimetableSelectionAnswer("CSD2 Tuesday first class"), /MOHITVEER FIRST COURSE/);
  assert.match(explicitTimetableSelectionAnswer("CSD2 Tuesday last class"), /MOHITVEER LAST COURSE/);
  assert.match(explicitTimetableSelectionAnswer("CSD2 Tuesday morning classes"), /MOHITVEER TUESDAY COURSE/);
  assert.match(explicitTimetableSelectionAnswer("CSD2 Tuesday free classes"), /No class listed/);

  const fridayRequest = namedPersonTimetableRequest("Mohitveer Singh Friday timetable");
  const fridayAnswer = readOnlyStudentTimetableAnswer(fridayRequest, studentLookup);
  assert.match(fridayAnswer, /MOHITVEER FRIDAY COURSE/);
  assert.doesNotMatch(fridayAnswer, /MOHITVEER TUESDAY COURSE/);

  const datedRequest = namedPersonTimetableRequest("Mohitveer Singh 4 September 2026 timetable");
  assert.equal(datedRequest.day, "Friday");
  assert.equal(datedRequest.dateIso, "2026-09-04");
  assert.equal(datedRequest.term, "mohitveer singh");
  assert.match(readOnlyStudentTimetableAnswer(datedRequest, studentLookup), /MOHITVEER FRIDAY COURSE/);

  const weekRequest = namedPersonTimetableRequest("Mohitveer Singh timetable");
  const weekAnswer = readOnlyStudentTimetableAnswer(weekRequest, studentLookup);
  assert.match(weekAnswer, /MOHITVEER TUESDAY COURSE/);
  assert.match(weekAnswer, /MOHITVEER FRIDAY COURSE/);

  const teacherRequest = namedPersonTimetableRequest("Dr Test Faculty Tuesday timetable");
  const facultySchedule = [{ id: "faculty-tuesday", group: "DR TEST FACULTY", day: "Tuesday", start: 630, end: 690, subject: "FACULTY TUESDAY COURSE", teacher: "DR TEST FACULTY", room: "F1", type: "L", cohorts: "" }];
  const facultyAnswer = readOnlyTeacherTimetableAnswer(teacherRequest, timetablePersonCaption(teacherRequest.term, facultySchedule), facultySchedule);
  assert.match(facultyAnswer, /FACULTY TUESDAY COURSE/);
  assert.match(facultyAnswer, /official GNDEC faculty timetable/i);
  assert.doesNotMatch(facultyAnswer, /ACTIVE TUESDAY COURSE/);
  assert.equal(state.selectedGroup, "ECB");
  assert.equal(state.selectedSubgroup, "ECB1");
  state.nowOverride = null;
  state.student = null;
});

test("counts one exact official branch, section, or subsection without combining results", () => {
  const { rosterCountRequest, rosterCountAnswer } = context.__parserTest;
  const rosterData = {
    version: "01-09-2026",
    records: [
      { name: "A", branch: "EC", section: "ECB", subsection: "ECB1" },
      { name: "B", branch: "EC", section: "ECB", subsection: "ECB1" },
      { name: "C", branch: "EC", section: "ECB", subsection: "ECB2" },
      { name: "D", branch: "CS", section: "CSD", subsection: "CSD2" }
    ]
  };
  assert.ok(rosterCountRequest("how many students in ECB1"));
  assert.match(rosterCountAnswer("how many students in ECB1", rosterData), /ECB1: 2 verified students/);
  assert.match(rosterCountAnswer("how many EC branch students", rosterData), /EC: 3 verified students/);
  assert.match(rosterCountAnswer("how many students in ECB and CSD", rosterData), /more than one roster target/i);
});

test("adds only a verified academic-group event to its matching section and subgroup", () => {
  const { state, buildScheduleIndex, classFor } = context.__parserTest;
  state.schedule = [
    { id: "ecb-physics", group: "ECB", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6", type: "L", cohorts: "ECB1" }
  ];
  state.student = { name: "Test Student", section: "ECB", subsection: "ECB1", academicGroup: "ECBM1", mentor: "Dr. Chahat Jain", mentorVenue: "G6" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.academicOverlayGroup = "ECBM1";
  state.academicOverlay = [
    { id: "ecbm1-physics", group: "ECBM1", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "A6", type: "L", cohorts: "ECB" },
    { id: "ecbm1-mentor", group: "ECBM1", day: "Monday", start: 810, end: 870, subject: "MENTORING CLASS & PROFESSIONAL DEVELOPMENT", teacher: "Teacher not listed", room: "Room not listed", type: "P", cohorts: "" }
  ];
  buildScheduleIndex();
  const classes = classFor("ECB", "Monday");
  assert.deepEqual([...classes].map((item) => item.subject), ["PHYSICS", "MENTORING CLASS & PROFESSIONAL DEVELOPMENT"]);
  assert.equal(classes[1].teacher, "Dr. Chahat Jain");
  assert.equal(classes[1].room, "G6");

  state.selectedSubgroup = "ECB2";
  assert.deepEqual([...classFor("ECB", "Monday")].map((item) => item.subject), []);
  state.student = null;
  state.academicOverlay = [];
  state.academicOverlayGroup = "";
});

test("using a matching timetable preserves the verified profile and mentoring overlay", () => {
  const { state, buildScheduleIndex, classFor, saveManualProfile, profileMatchesTimetableSelection, populateStudentLookupInput } = context.__parserTest;
  document.body.innerHTML = '<input id="student-name-input" value="" /><div id="toast"></div>';
  state.schedule = [
    { id: "ecb-physics", group: "ECB", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "Dr. Physics", room: "A6", type: "L", cohorts: "ECB1" }
  ];
  state.student = { name: "Kaushik Jain", crn: "2617070", section: "ECB", subsection: "ECB1", academicGroup: "ECBM1", mentor: "Dr. Chahat Jain", mentorVenue: "G6" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.academicOverlayGroup = "ECBM1";
  state.academicOverlay = [
    { id: "ecbm1-mentor", group: "ECBM1", day: "Monday", start: 810, end: 870, subject: "MENTORING CLASS & PROFESSIONAL DEVELOPMENT", teacher: "Teacher not listed", room: "Room not listed", type: "P", cohorts: "" }
  ];
  buildScheduleIndex();

  assert.equal(profileMatchesTimetableSelection(), true);
  populateStudentLookupInput();
  assert.equal(document.getElementById("student-name-input").value, "Kaushik Jain");
  saveManualProfile();
  assert.equal(state.student.name, "Kaushik Jain");
  assert.equal(state.student.academicGroup, "ECBM1");
  const mentoring = classFor("ECB", "Monday").find((item) => item.subject === "MENTORING CLASS & PROFESSIONAL DEVELOPMENT");
  assert.equal(mentoring.teacher, "Dr. Chahat Jain");
  assert.equal(mentoring.room, "G6");

  let confirmation = "";
  context.window.confirm = (message) => { confirmation = message; return true; };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB2";
  assert.equal(profileMatchesTimetableSelection(), false);
  saveManualProfile();
  assert.match(confirmation, /ECB \/ ECB2/);
  assert.equal(state.student.name, "Kaushik Jain");
  assert.equal(state.student.academicGroup, "ECBM1");
  context.window.confirm = undefined;
  state.student = null;
  state.academicOverlay = [];
  state.academicOverlayGroup = "";
});

test("mentoring-class questions return verified time and venue before profile mentor facts", () => {
  const { state, buildScheduleIndex, answerWithoutAi } = context.__parserTest;
  state.schedule = [
    { id: "ecb-physics", group: "ECB", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "Dr. Physics", room: "A6", type: "L", cohorts: "ECB1" }
  ];
  state.student = { name: "Kaushik Jain", section: "ECB", subsection: "ECB1", academicGroup: "ECBM1", mentor: "Dr. Chahat Jain", mentorVenue: "G6" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  state.academicOverlayGroup = "ECBM1";
  state.academicOverlay = [
    { id: "ecbm1-mentor", group: "ECBM1", day: "Monday", start: 810, end: 870, subject: "MENTORING CLASS & PROFESSIONAL DEVELOPMENT", teacher: "Teacher not listed", room: "Room not listed", type: "P", cohorts: "" }
  ];
  buildScheduleIndex();

  for (const question of ["Where is my mentoring class?", "Where and when is my mentoring class?"]) {
    const answer = answerWithoutAi(question);
    assert.match(answer, /MENTORING CLASS &amp; PROFESSIONAL DEVELOPMENT/);
    assert.match(answer, /Monday 1:30 PM/);
    assert.match(answer, /G6/);
    assert.match(answer, /Dr\. Chahat Jain/);
  }
  const followup = answerWithoutAi("location");
  assert.match(followup, /MENTORING CLASS &amp; PROFESSIONAL DEVELOPMENT/);
  assert.match(followup, /G6/);
  state.student = null;
  state.academicOverlay = [];
  state.academicOverlayGroup = "";
});

test("answers loaded official faculty, room, subject, programme, section, and subsection views locally", () => {
  const { state, officialTimetableViewAnswer, requestedOfficialTimetableView } = context.__parserTest;
  const entry = (group, subject) => ({ id: `${group}-${subject}`, group, day: "Monday", start: 510, end: 570, subject, teacher: "DR. EXAMPLE", room: "G6", type: "L", cohorts: "ECB1" });
  state.timetableViews = new Map([
    ["teachers", { schedule: [entry("DR. CHAHAT JAIN", "MENTORING CLASS")] }],
    ["rooms", { schedule: [entry("G6", "MENTORING CLASS")] }],
    ["subjects", { schedule: [entry("PHYSICS", "PHYSICS")] }],
    ["years", { schedule: [entry("B.TECH FIRST YEAR", "PHYSICS")] }],
    ["groups", { schedule: [entry("ECB", "PHYSICS")] }],
    ["subgroups", { schedule: [entry("ECB1", "MENTORING CLASS")] }]
  ]);
  const cases = [
    ["faculty timetable Dr Chahat Jain", "teachers", /DR\. CHAHAT JAIN/],
    ["room timetable G6", "rooms", /G6/],
    ["subject timetable physics", "subjects", /PHYSICS/],
    ["programme timetable B.Tech first year", "years", /B\.TECH FIRST YEAR/],
    ["section timetable ECB", "groups", /ECB/],
    ["subsection timetable ECB1", "subgroups", /ECB1/]
  ];
  cases.forEach(([question, view, expected]) => {
    assert.equal(requestedOfficialTimetableView(question), view);
    assert.match(officialTimetableViewAnswer(question), expected);
  });
  state.timetableViews = new Map();
});

test("does not expose a personal default profile and answers saved device profiles", () => {
  const { answerQuestion, state } = context.__parserTest;
  state.student = null;
  assert.match(answerQuestion("Who is my mentor?"), /Set up this device first/);
  state.student = { name: "Rahul Sharma", registrationNo: "26019999", branch: "Computer Science Engineering", section: "CSA", subsection: "CSA1", mentor: "Dr. Example" };
  assert.match(answerQuestion("Who is my mentor?"), /Dr\. Example/);
  assert.match(answerQuestion("Who am I?"), /Rahul Sharma/);
  assert.match(answerQuestion("Who is my mentor?"), /saved on this device/);
  state.student = null;
});

test("explains identifiers absent from a verified roster without inventing them", () => {
  const { answerQuestion, state } = context.__parserTest;
  state.student = { name: "Kaushik Jain", crn: "2617070", currentSerialNo: "7", oldSerialNos: [], branch: "EC", section: "ECB", subsection: "ECB1", rosterVersion: "12-08-2026" };
  assert.match(answerQuestion("what is my registration number"), /Not published in current roster/);
  assert.match(answerQuestion("my previous serial number"), /No previous serial in saved history/);
  state.student = null;
});

test("filters stale roster PDFs and sorts only current official timetable notices", () => {
  const { isStudentRosterReference, currentTimetableNoticeLinks } = context.__parserTest;
  const staleRoster = { label: "EC Branch Students", url: "https://appsc.gndec.ac.in/sites/default/files/2026-02/EC%20Sections.pdf" };
  assert.equal(isStudentRosterReference(staleRoster), true);
  const links = [
    staleRoster,
    { label: "One-day activity schedule", url: "https://appsc.gndec.ac.in/sites/default/files/2026-08/activity.pdf" },
    { label: "Old lecture schedule", url: "https://appsc.gndec.ac.in/sites/default/files/2025-10/lecture.pdf" },
    { label: "Untrusted schedule", url: "https://example.com/schedule.pdf" }
  ];
  const notices = currentTimetableNoticeLinks(links, [], "2026-08");
  assert.deepEqual([...notices].map((link) => link.label), ["One-day activity schedule"]);

  const { renderReferenceLinks, state } = context.__parserTest;
  state.sourceRegistry = {
    version: "2026-08",
    sources: [{ id: "groups", url: "https://appsc.gndec.ac.in/sites/default/files/2026-08/groups.html", verified: true }],
    studentSectionSources: [],
    extraLinks: links
  };
  const refContainer = document.createElement("div");
  refContainer.id = "reference-links";
  document.body.appendChild(refContainer);
  assert.doesNotThrow(() => renderReferenceLinks());
  assert.match(refContainer.innerHTML, /One-day activity schedule/);
  refContainer.remove();
});

test("returns only matching subject classes for an all-week question", () => {
  const { state, buildScheduleIndex, answerQuestion } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [
    { id: "math-mon", group: "ECA", day: "Monday", start: 570, end: 620, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" },
    { id: "econ-wed", group: "ECA", day: "Wednesday", start: 630, end: 680, subject: "ECONOMICS", teacher: "DR KAUR", room: "F102", type: "L", cohorts: "ECA" },
    { id: "math-fri", group: "ECA", day: "Friday", start: 810, end: 860, subject: "MATH I", teacher: "DR SHARMA", room: "F103", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  const answer = answerQuestion("all math classes locations all days this week");
  assert.match(answer, /Monday 9:30 AM:.*MATH I/s);
  assert.match(answer, /Friday 1:30 PM:.*MATH I/s);
  assert.doesNotMatch(answer, /ECONOMICS/);
});

test("parses clock times including meridiem suffixes", () => {
  const { requestedTime } = context.__parserTest;
  assert.equal(requestedTime("9:30 class which subject"), 570);
  assert.equal(requestedTime("class at 9:30pm"), 1290);
  assert.equal(requestedTime("class at 9:30 pm"), 1290);
  assert.equal(requestedTime("what time is 2:30 lab"), 150);
  assert.equal(requestedTime("monday 3:30 class"), 210);
  assert.equal(requestedTime("no time here"), null);
});

test("matches an afternoon class when the user says a bare 3:30", () => {
  const { state, buildScheduleIndex, answerQuestion } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.groups = ["ECA"];
  state.schedule = [
    { id: "mon-math", group: "ECA", day: "Monday", start: 570, end: 620, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" },
    { id: "mon-prog", group: "ECA", day: "Monday", start: 930, end: 1010, subject: "PROGRAMMING", teacher: "ER SINGH", room: "LAB A", type: "P", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  const answer = answerQuestion("monday 3:30 class");
  assert.match(answer, /PROGRAMMING/);
  assert.match(answer, /3:30 PM/);
});

test("rolls a late-night next-class question forward to tomorrow morning", () => {
  const { state, buildScheduleIndex, answerQuestion, getIndiaNow } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.groups = ["ECA"];
  // Tuesday has morning classes only (8:30-11:30); Wednesday has a 9:30 class.
  state.schedule = [
    { id: "tue-phys", group: "ECA", day: "Tuesday", start: 510, end: 560, subject: "PHYSICS", teacher: "DR KAUR", room: "PHY LAB 1", type: "P", cohorts: "ECA" },
    { id: "tue-math", group: "ECA", day: "Tuesday", start: 570, end: 620, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" },
    { id: "wed-econ", group: "ECA", day: "Wednesday", start: 570, end: 620, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "G8", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  const realNow = getIndiaNow;
  context.getIndiaNow = () => ({ day: "Tuesday", minutes: 22 * 60 + 40, time: "10:40 PM", time24: "22:40", time12: "10:40 PM", date: "Tue, 11 Aug, 2026" });
  try {
    const answer = answerQuestion("next class?");
    // The next class after Tuesday's classes finish is Wednesday's ECONOMICS.
    assert.match(answer, /Next class: ECONOMICS/);
    assert.match(answer, /9:30 AM/);
    assert.doesNotMatch(answer, /PHYSICS/);
  } finally {
    context.getIndiaNow = realNow;
  }
});

test("does not confuse a generic next-class question with MENTORING CLASS", () => {
  const { state, buildScheduleIndex, answerQuestion, getIndiaNow } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [
    { id: "thu-programming", group: "ECA", day: "Thursday", start: 570, end: 620, subject: "PROGRAMMING", teacher: "ER SINGH", room: "LAB A", type: "P", cohorts: "ECA" },
    { id: "thu-mentoring", group: "ECA", day: "Thursday", start: 810, end: 860, subject: "MENTORING CLASS & PROFESSIONAL DEVELOPMENT", teacher: "DR EXAMPLE", room: "F101", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  const realNow = getIndiaNow;
  context.getIndiaNow = () => ({ day: "Thursday", minutes: 8 * 60 + 45, time: "8:45 AM", time24: "08:45", time12: "8:45 AM", date: "Thu, 13 Aug, 2026" });
  try {
    const answer = answerQuestion("what is my next class?");
    assert.match(answer, /Next class: PROGRAMMING/);
    assert.doesNotMatch(answer, /MENTORING CLASS/);
  } finally {
    context.getIndiaNow = realNow;
  }
});

test("prepares the next scheduled study day after 5 PM and restores today the next morning", () => {
  const { state, buildScheduleIndex, nextScheduledDay } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [
    { id: "thu", group: "ECA", day: "Thursday", start: 570, end: 620, subject: "PROGRAMMING", teacher: "ER SINGH", room: "LAB A", type: "P", cohorts: "ECA" },
    { id: "fri", group: "ECA", day: "Friday", start: 510, end: 560, subject: "PHYSICS", teacher: "DR KAUR", room: "F101", type: "L", cohorts: "ECA" },
    { id: "mon", group: "ECA", day: "Monday", start: 510, end: 560, subject: "MATH I", teacher: "DR SHARMA", room: "F102", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  assert.equal(nextScheduledDay("Thursday"), "Friday");
  assert.equal(nextScheduledDay("Friday"), "Monday");
});

test("uses the real Monday date after Friday and skips Saturday and Sunday", () => {
  const { state, buildScheduleIndex, nextStudyDayInfo } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [
    { id: "fri", group: "ECA", day: "Friday", start: 510, end: 560, subject: "PHYSICS", teacher: "DR KAUR", room: "F101", type: "L", cohorts: "ECA" },
    { id: "mon", group: "ECA", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "DR SHARMA", room: "F102", type: "L", cohorts: "ECA" }
  ];
  buildScheduleIndex();
  const RealDate = vm.runInContext("Date", context);
  context.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ["2026-08-14T12:00:00.000Z"])); }
    static now() { return new RealDate("2026-08-14T12:00:00.000Z").getTime(); }
  };
  try {
    const next = nextStudyDayInfo(false);
    assert.equal(next.day, "Monday");
    assert.equal(next.offset, 3);
    assert.match(next.label, /Monday.*17 Aug.*2026/);
    assert.match(next.compactLabel, /Monday.*17 Aug/);
  } finally { delete context.Date; }
});

test("keeps Monday as the next study day throughout the weekend", () => {
  const { nextStudyDayInfo } = context.__parserTest;
  const RealDate = vm.runInContext("Date", context);
  context.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : ["2026-08-15T12:00:00.000Z"])); }
    static now() { return new RealDate("2026-08-15T12:00:00.000Z").getTime(); }
  };
  try {
    const next = nextStudyDayInfo(false);
    assert.equal(next.day, "Monday");
    assert.equal(next.offset, 2);
    assert.match(next.label, /Monday.*17 Aug.*2026/);
  } finally { delete context.Date; }
});

test("admin view is bound to the exact enrolled profile and cannot reappear after identity changes", () => {
  const { state, adminProfileFingerprint, hasAdminAiView } = context.__parserTest;
  state.student = { name: "Kaushik Jain", crn: "2617070", registrationNo: "", branch: "EC", section: "ECB", subsection: "ECB1" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  const enroll = () => storage.set("gndec-compass-ai-admin-view-v1", JSON.stringify({ expiresAt: new Date(Date.now() + 60_000).toISOString(), profileFingerprint: adminProfileFingerprint() }));
  enroll();
  assert.equal(hasAdminAiView(), true);

  state.selectedGroup = "ECA";
  assert.equal(hasAdminAiView(), false);
  assert.equal(storage.has("gndec-compass-ai-admin-view-v1"), false);
  state.selectedGroup = "ECB";
  assert.equal(hasAdminAiView(), false, "switching back must still require KKJ");

  enroll();
  assert.equal(hasAdminAiView(), true);
  state.student.crn = "CHANGED";
  assert.equal(hasAdminAiView(), false);
  state.student.crn = "2617070";
  assert.equal(hasAdminAiView(), false, "restoring the CRN must not restore enrollment");

  enroll();
  state.student.registrationNo = "26000000";
  assert.equal(hasAdminAiView(), false);
  enroll();
  state.student.name = "Another Student";
  assert.equal(hasAdminAiView(), false);
  state.student = null;
});

test("routes heavy open questions to the AI and keeps schedule questions local", () => {
  const { isHeavyQuestion, isStructuredQuestion, shouldUseActualAi } = context.__parserTest;
  assert.equal(isHeavyQuestion("meri physics weak hai, kuch study tips do"), true);
  assert.equal(isHeavyQuestion("what to do in free time"), true);
  assert.equal(isHeavyQuestion("give me some study tips for physics"), true);
  assert.equal(isHeavyQuestion("can you make a plan for my week"), true);
  assert.equal(isHeavyQuestion("What is my next class?"), false);
  assert.equal(isHeavyQuestion("monday time table"), false);
  assert.equal(isStructuredQuestion("meri physics weak hai, kuch study tips do"), false);
  assert.equal(isStructuredQuestion("What is my next class?"), true);
  assert.equal(isStructuredQuestion("physics kahan hai?"), true);
  assert.equal(shouldUseActualAi("explain Physics in detail"), true);
  assert.equal(shouldUseActualAi("what is my next class?"), false);
  assert.equal(shouldUseActualAi("what can you do?"), false);
});

test("uses DOM selectors that exist in the application shell", () => {
  assert.match(appSource, /document\.querySelector\("\.menu-button"\)\.addEventListener/);
  assert.doesNotMatch(appSource, /\$\("class-state"\)/);
});

test("only the Ask Compass control is interactive inside a holiday banner", () => {
  assert.equal([...appSource.matchAll(/<button type="button" class="holiday-action"/g)].length, 3);
  assert.doesNotMatch(appSource, /holidayBanner\.setAttribute\("role", "button"\)/);
  assert.doesNotMatch(appSource, /holidayBanner\.addEventListener\("keydown"/);
  assert.match(appSource, /event\.target\.closest\?\.\("\.holiday-action"\)/);
  assert.match(appSource, /if \(!action \|\| !holidayBanner\.contains\(action\)\) return/);
  assert.match(appSource, /holidayBanner\.hidden = true/);
  assert.doesNotMatch(stylesSource, /\.holiday-banner\{[^}]*cursor:pointer/);
  assert.match(stylesSource, /\.holiday-banner \.holiday-action\{[^}]*cursor:pointer/);
});

test("service worker caches only an unused response copy and absorbs cache-write failures", () => {
  assert.match(serviceWorkerSource, /function cacheResponse\(event, request, response\)/);
  assert.match(serviceWorkerSource, /response\.bodyUsed/);
  assert.match(serviceWorkerSource, /copy = response\.clone\(\)/);
  assert.match(serviceWorkerSource, /cache\.put\(request, copy\)\)\.catch\(\(\) => \{\}\)/);
  assert.match(appSource, /serviceWorker\.register\("\/sw\.js\?v=20260903-1"/);
});

test("keeps actual Hindi and Punjabi timetable questions on the fast local path", () => {
  const { isStructuredQuestion } = context.__parserTest;
  assert.equal(isStructuredQuestion("\u092e\u0947\u0930\u0940 \u0905\u0917\u0932\u0940 \u0915\u094d\u0932\u093e\u0938 \u0915\u094d\u092f\u093e \u0939\u0948?"), true);
  assert.equal(isStructuredQuestion("\u0a05\u0a17\u0a32\u0a40 \u0a15\u0a32\u0a3e\u0a38 \u0a15\u0a40 \u0a39\u0a48?"), true);
});

test("keeps mixed Hindi, Punjabi, Hinglish, and typoed subject questions local", () => {
  const { state, buildScheduleIndex, answerQuestion, isStructuredQuestion } = context.__parserTest;
  state.selectedGroup = "ECA";
  state.selectedSubgroup = "";
  state.schedule = [{ id: "mon-math-local", group: "ECA", day: "Monday", start: 570, end: 620, subject: "MATH I", teacher: "DR SHARMA", room: "F101", type: "L", cohorts: "ECA" }];
  buildScheduleIndex();
  [
    "meri maths class kahan hai?",
    "मेरी maths क्लास कहाँ है?",
    "ਮੇਰੀ maths ਕਲਾਸ ਕਿੱਥੇ ਹੈ?"
  ].forEach((question) => {
    assert.equal(isStructuredQuestion(question), true);
    assert.match(answerQuestion(question), /MATH I/);
  });
});

test("formats model emphasis safely without allowing model HTML", () => {
  const { formatAiAnswer } = context.__parserTest;
  assert.equal(formatAiAnswer("**Next:** __Physics__ <script>"), "<strong>Next:</strong> <u>Physics</u> &lt;script&gt;");
});

test("keeps compatibility with legacy registration-number roster rows", () => {
  const { parseStudentSectionText, normalizeStudentName } = context.__parserTest;
  const rows = parseStudentSectionText("68 KAUSHIK JAIN 26011000 EC ECB ECB1 Dr. Chahat Jain", "EC");
  assert.deepEqual([...rows].map((record) => ({ ...record, oldSerialNos: [...record.oldSerialNos] })), [{ serialNo: "68", currentSerialNo: "68", newSerialNo: "", oldSerialNos: [], crn: "", name: "KAUSHIK JAIN", registrationNo: "26011000", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "Dr. Chahat Jain", mentorPhone: "", academicGroup: "", mentorVenue: "", venue: "", rosterVersion: "", rosterRevision: "", rosterSchemaVersion: 0 }]);
  assert.equal(normalizeStudentName(" Kaushik  Jain "), "kaushik jain");
});

test("parses Permanent Sections mentor phone and venue without retaining parent details", () => {
  const { parseStudentSectionText } = context.__parserTest;
  const row = ["12", "1234567", "TEST STUDENT", "FATHER NAME", "MOTHER NAME", "EC", "ECB", "ECB1", "ECBM1", "DR TEST MENTOR", "9999999999", "F108"].join("\t");
  const [record] = [...parseStudentSectionText(row, "EC")].map((value) => ({ ...value, oldSerialNos: [...value.oldSerialNos] }));
  assert.deepEqual(record, { serialNo: "12", currentSerialNo: "12", newSerialNo: "", oldSerialNos: [], crn: "1234567", name: "TEST STUDENT", registrationNo: "", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR", mentorPhone: "9999999999", academicGroup: "ECBM1", mentorVenue: "F108", venue: "F108", rosterVersion: "", rosterRevision: "", rosterSchemaVersion: 3 });
  assert.doesNotMatch(JSON.stringify(record), /FATHER NAME|MOTHER NAME/);
});

test("parses the current Permanent Sections layout with CRN and registration number", () => {
  const { parseStudentSectionText } = context.__parserTest;
  const row = ["42", "2615231", "26012797", "MOHITVEER SINGH", "KARAMJIT SINGH", "ARPINDER KAUR", "CS", "CSD", "CSD2", "CSDM2", "ER. JAGDEEP KAUR", "9592007098", "G17"].join("\t");
  const [record] = [...parseStudentSectionText(row, "CS")].map((value) => ({ ...value, oldSerialNos: [...value.oldSerialNos] }));
  assert.deepEqual(record, { serialNo: "42", currentSerialNo: "42", newSerialNo: "", oldSerialNos: [], crn: "2615231", name: "MOHITVEER SINGH", registrationNo: "26012797", branch: "CS", section: "CSD", subsection: "CSD2", mentor: "ER. JAGDEEP KAUR", mentorPhone: "9592007098", academicGroup: "CSDM2", mentorVenue: "G17", venue: "G17", rosterVersion: "", rosterRevision: "", rosterSchemaVersion: 3 });
  assert.doesNotMatch(JSON.stringify(record), /KARAMJIT SINGH|ARPINDER KAUR/);
});

test("matches every supported exact student identifier and preserves serial history on roster refresh", () => {
  const { studentIdentifierMatch, mergeStudentRecord } = context.__parserTest;
  const previous = { name: "TEST STUDENT", crn: "1234567", registrationNo: "26010000", serialNo: "41", currentSerialNo: "41", oldSerialNos: ["19"], branch: "EC", section: "ECA", subsection: "ECA1" };
  const current = { name: "TEST STUDENT", crn: "1234567", serialNo: "68", currentSerialNo: "68", newSerialNo: "68", oldSerialNos: [], branch: "EC", section: "ECB", subsection: "ECB1" };
  const merged = mergeStudentRecord(current, previous);
  ["1234567", "26010000", "68", "41", "19"].forEach((identifier) => assert.equal(studentIdentifierMatch(merged, identifier), true, identifier));
  assert.equal(studentIdentifierMatch(merged, "9999999"), false);
  assert.equal(merged.section, "ECB");
  assert.deepEqual([...merged.oldSerialNos], ["19", "41"]);
});

test("read-only chat lookup finds verified students fuzzily without changing the active profile", () => {
  const { state, studentLookupRequest, studentLookupContextFromRecords, legacyStudentLookupAnswer } = context.__parserTest;
  const activeProfile = { name: "MOHITVEER SINGH", crn: "2615231", branch: "CS", section: "CSD", subsection: "CSD2" };
  state.student = { ...activeProfile };
  state.selectedGroup = "CSD";
  state.selectedSubgroup = "CSD2";
  const records = [
    { name: "KAUSHIK JAIN", crn: "2617070", currentSerialNo: "7", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "Dr. Chahat Jain", mentorPhone: "7837005620", academicGroup: "ECBM1", mentorVenue: "G6" },
    { name: "MOHITVEER SINGH", crn: "2615231", currentSerialNo: "42", branch: "CS", section: "CSD", subsection: "CSD2", mentor: "Er. Jagdeep Kaur", mentorPhone: "9592007098", academicGroup: "CSDM2", mentorVenue: "G17" }
  ];
  const lookup = studentLookupContextFromRecords("show full details of Kaushuk Jain", records, { version: "12-08-2026" });
  assert.equal(lookup.status, "single");
  assert.equal(lookup.matchKind, "confident-fuzzy-name");
  const answer = legacyStudentLookupAnswer(lookup);
  ["KAUSHIK JAIN", "2617070", "7", "ECB1", "Dr. Chahat Jain", "7837005620", "ECBM1", "G6", "Read-only lookup"].forEach((value) => assert.match(answer, new RegExp(value, "i")));
  assert.doesNotMatch(answer, /father|mother|parent/i);
  assert.deepEqual({ ...state.student }, activeProfile);
  assert.equal(state.selectedGroup, "CSD");
  assert.equal(state.selectedSubgroup, "CSD2");
  assert.equal(studentLookupRequest("what is my mentor phone"), null);
  assert.equal(studentLookupRequest("what is his mentor phone?", lookup.records[0]).followup, true);
});

test("student chat lookup understands English, Hinglish, Hindi, and Punjabi commands", () => {
  const { studentLookupRequest, looksLikePlainStudentNameQuery } = context.__parserTest;
  [
    "find student Kaushik Jain",
    "Kaushik Jain ki poori jankari batao",
    "Kaushik Jain की पूरी जानकारी बताओ",
    "Kaushik Jain ਦੀ ਪੂਰੀ ਜਾਣਕਾਰੀ ਦੱਸੋ",
    "who is CRN 2617070",
    "mentor phone of Kaushik Jain"
  ].forEach((question) => {
    const request = studentLookupRequest(question);
    assert.ok(request, question);
    assert.match(request.term, /Kaushik Jain|2617070/i, question);
  });
  assert.equal(studentLookupRequest("Kaushik Jain").term, "kaushik jain");
  assert.equal(studentLookupRequest("Kaushik Jain ka CRN").term, "kaushik jain");
  assert.equal(studentLookupRequest("Kaushik Jain da registration number").term, "kaushik jain");
  assert.equal(studentLookupRequest("Kaushik Jain का CRN").term, "kaushik jain");
  assert.equal(studentLookupRequest("Kaushik Jain ਦਾ registration number").term, "kaushik jain");
  assert.equal(studentLookupRequest("show mentor phone and old serial of 26011000").term, "26011000");
  assert.equal(studentLookupRequest("serial 7").term, "7");
  assert.equal(studentLookupRequest("old serial: 68").term, "68");
  assert.equal(studentLookupRequest("CRN: 2617070").term, "2617070");
  assert.equal(studentLookupRequest("Mohitveer").term, "mohitveer");
  assert.equal(looksLikePlainStudentNameQuery("Mohitveer"), true);
  assert.equal(looksLikePlainStudentNameQuery("math"), false);
  assert.equal(studentLookupRequest("good morning"), null);
});

test("faculty questions are separated from private student lookup", () => {
  const { facultyLookupRequest, studentLookupRequest, assistantContext, state } = context.__parserTest;
  const request = facultyLookupRequest("show full details and research of Dr Chahat Jain");
  assert.ok(request);
  assert.equal(request.term, "chahat jain");
  assert.equal(request.fields.research, true);
  assert.equal(studentLookupRequest("show full details and research of Dr Chahat Jain"), null);
  const department = facultyLookupRequest("list all EC faculty");
  assert.equal(department.listDepartment, true);
  assert.equal(department.department, "Electronics & Communication Engineering");
  assert.equal(facultyLookupRequest("faculty timetable"), null);
  assert.equal(facultyLookupRequest("Dr Chahat Jain की योग्यता बताओ").term, "chahat jain");
  assert.equal(facultyLookupRequest("Dr Chahat Jain ਦਾ ਤਜਰਬਾ ਦੱਸੋ").fields.experience, true);
  state.activeFacultyAiContext = { facultyDisplayName: "DR. CHAHAT JAIN", designation: "Assistant Professor", researchInterests: "Antenna design", source: "https://gndec.ac.in/faculty/" };
  const aiContext = assistantContext("How can Dr Chahat Jain's research help an antenna project?");
  assert.equal(aiContext.officialFaculty.facultyDisplayName, "DR. CHAHAT JAIN");
  assert.equal(aiContext.officialFaculty.researchInterests, "Antenna design");
  state.activeFacultyAiContext = null;
});

test("student chat lookup never silently chooses duplicate names or enumerates the roster", () => {
  const { studentLookupContextFromRecords, legacyStudentLookupAnswer } = context.__parserTest;
  const duplicates = [
    { name: "AMANDEEP SINGH", crn: "1001", branch: "CS", section: "CSA", subsection: "CSA1" },
    { name: "AMANDEEP SINGH", crn: "2002", branch: "EE", section: "EEA", subsection: "EEA2" }
  ];
  const ambiguous = studentLookupContextFromRecords("find student Amandeep Singh", duplicates, { version: "current" });
  assert.equal(ambiguous.status, "multiple");
  assert.match(legacyStudentLookupAnswer(ambiguous), /More than one student may match/);
  const enumeration = studentLookupContextFromRecords("show all student details", duplicates, { version: "current" });
  assert.equal(enumeration.status, "needs-query");
  assert.match(legacyStudentLookupAnswer(enumeration), /does not reveal or enumerate the whole roster/);
});

test("an old serial saved on this device resolves through stable identity, not a reused current serial", () => {
  const { resolveStudentIdentifierMatches } = context.__parserTest;
  const saved = { name: "ORIGINAL STUDENT", crn: "1234567", currentSerialNo: "68", oldSerialNos: ["41"] };
  const current = [
    { name: "ORIGINAL STUDENT", crn: "1234567", currentSerialNo: "68" },
    { name: "ANOTHER STUDENT", crn: "7654321", currentSerialNo: "41" }
  ];
  assert.deepEqual([...resolveStudentIdentifierMatches(current, "41", saved)].map((record) => record.crn), ["1234567"]);
  assert.deepEqual([...resolveStudentIdentifierMatches(current, "41", null)].map((record) => record.crn), ["7654321"]);
});

test("enriches a unique current student with verified temporary-roster registration and serial history", () => {
  const { parseStudentSectionText, mergeStudentRosterHistory, studentIdentifierMatch } = context.__parserTest;
  const current = parseStudentSectionText("7\t2617070\tKaushik Jain\tTarun Jain\tTania Jain\tEC\tECB\tECB1\tECBM1\tDr. Chahat Jain\t7837005620\tG6", "EC");
  const history = parseStudentSectionText("68\tKAUSHIK JAIN\t26011000\tEC\tECB\tECB1\tDr. Chahat Jain", "EC");
  const [record] = mergeStudentRosterHistory(current, history);
  assert.equal(record.currentSerialNo, "7");
  assert.deepEqual([...record.oldSerialNos], ["68"]);
  assert.equal(record.crn, "2617070");
  assert.equal(record.registrationNo, "26011000");
  assert.equal(studentIdentifierMatch(record, "68"), true);
  assert.equal(studentIdentifierMatch(record, "26011000"), true);
});

test("does not attach historical identifiers when an exact student name is duplicated", () => {
  const { mergeStudentRosterHistory } = context.__parserTest;
  const current = [
    { name: "AMANDEEP SINGH", crn: "2617001", currentSerialNo: "1", branch: "EC" },
    { name: "AMANDEEP SINGH", crn: "2617002", currentSerialNo: "2", branch: "EC" }
  ];
  const history = [{ name: "AMANDEEP SINGH", registrationNo: "26010001", currentSerialNo: "44", branch: "EC" }];
  const merged = mergeStudentRosterHistory(current, history);
  assert.deepEqual(merged.map((record) => record.registrationNo), ["", ""]);
  assert.deepEqual(merged.map((record) => [...record.oldSerialNos]), [[], []]);
});

test("ranks tolerant student-name matches without treating them as exact", () => {
  const { studentMatchScore } = context.__parserTest;
  const record = { name: "KAUSHIK JAIN" };
  assert.equal(studentMatchScore(record, "kaushik jain"), 10000);
  assert.ok(studentMatchScore(record, "kaushik jan") > 0);
  assert.equal(studentMatchScore(record, "unrelated person"), 0);
});

test("answers official syllabus facts locally without an AI request", () => {
  const { state, parseSyllabusText, answerSyllabusQuestion, isSyllabusQuestion } = context.__parserTest;
  state.syllabus = parseSyllabusText(`
Course Code: BSC101 Course Title: Physics Programme: B.Tech. Semester: 1 Credits: 5
On completion of the course, the student will have the ability to:
1 Understand electromagnetic theory.
2 Apply physics principles.
Contents
Unit-1 Electromagnetic theory 8(L) hrs
Unit-2 Lasers and fiber optics 7(L) hrs
Text Books
Course Code: BSC102 Course Title: Mathematics-I Programme: B.Tech. Semester: 1 Credits: 4
On completion of the course, the student will have the ability to:
1 Solve mathematical problems.
Contents
Unit-1 Differential calculus 8(L) hrs
Text Books`);
  assert.equal(isSyllabusQuestion("physics syllabus ke units"), true);
  const answer = answerSyllabusQuestion("physics syllabus ke units");
  assert.match(answer, /BSC101/);
  assert.match(answer, /Unit 1:<\/strong> Electromagnetic theory/);
  assert.match(answer, /Official GNDEC syllabus/);
  assert.match(answerSyllabusQuestion("maths course outcomes"), /Solve mathematical problems/);
});

test("keeps fuzzy multilingual syllabus requests ahead of labs and timetable matches", () => {
  const { answerFromKnowledgeBase, isSyllabusQuestion } = context.__parserTest;
  ["my math syllabus", "math sylabus units", "गणित पाठ्यक्रम इकाई", "ਗਣਿਤ ਸਿਲੇਬਸ ਯੂਨਿਟ"].forEach((question) => {
    assert.equal(isSyllabusQuestion(question), true);
    const answer = answerFromKnowledgeBase(question)?.reply || "";
    assert.match(answer, /Mathematics-I/);
    assert.match(answer, /Differential calculus/);
    assert.doesNotMatch(answer, /Labs & practicals/);
    assert.doesNotMatch(answer, /Next class:/);
  });
});

test("ships a searchable official index for all 33 syllabus pages", () => {
  const { state, parseSyllabusText, answerQuestion, answerSyllabusPageSearch, answerSyllabusQuestion, answerFromKnowledgeBase, syllabusQuestionSuggestions } = context.__parserTest;
  assert.equal(syllabusIndex.pages.length, 33);
  state.syllabusPages = syllabusIndex.pages;
  state.syllabus = parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  assert.equal(state.syllabus.length, 11);
  assert.equal(state.syllabus.find((course) => course.code === "BSC101")?.units.length, 6);
  assert.equal(state.syllabus.find((course) => course.code === "BSC102")?.semester, "1");
  const answer = answerSyllabusPageSearch("mathematics ii continuous assessment marks", 4);
  assert.match(answer, /Page 30/);
  assert.match(answer, /all 33 pages searched locally/);
  assert.match(answerSyllabusPageSearch("electromagnatism syllabus"), /Page [245]/);
  assert.match(answerSyllabusPageSearch("fibre optics syllabus", 4), /Page [345]/);
  const summary = answerSyllabusQuestion("total units of physics, maths and total subjects in syllabus");
  assert.match(summary, /Physics:<\/strong> 6 units/);
  assert.match(summary, /Mathematics - I:<\/strong> 4 units/);
  assert.match(summary, /Total official subjects:<\/strong> 11/);
  ["total maths units", "maths total units", "how many units are in maths"].forEach((question) => assert.match(answerSyllabusQuestion(question), /Mathematics - I:<\/strong> 4 units/));
  assert.match(answerSyllabusQuestion("how many subjects are there"), /Total official subjects:<\/strong> 11/);
  assert.match(answerSyllabusQuestion("list all subjects"), /Official first-year subjects \(11\)/);
  assert.match(answerSyllabusQuestion("how many total units are there"), /Total units across all official subjects/);
  assert.match(answerFromKnowledgeBase("list them")?.reply || "", /Official first-year subjects \(11\)/);
  assert.match(answerFromKnowledgeBase("list them")?.reply || "", /Physics/);
  assert.equal(answerQuestion("how many subjects are there"), "");
  assert.ok(syllabusQuestionSuggestions("total units in maths").some((item) => /How many units are in Mathematics - I/.test(item)));
  assert.match(appSource, /SYLLABUS_INDEX_URL/);
  assert.match(appSource, /warmSyllabusIndex/);
});

test("recognises every published first-year subject and offers syllabus suggestions before preload", () => {
  const { state, parseSyllabusText, answerWithoutAi, isSyllabusQuestion, syllabusQuestionSuggestions } = context.__parserTest;
  state.syllabus = [];
  assert.ok(syllabusQuestionSuggestions("how many units in chemistry").some((item) => /Chemistry/.test(item)));
  assert.ok(syllabusQuestionSuggestions("electrical syllabus").some((item) => /Electrical and Electronics/.test(item)));
  assert.equal(isSyllabusQuestion("how many subjets are there"), true);

  state.syllabusPages = syllabusIndex.pages;
  state.syllabus = parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  [
    ["physics units", /Physics/, /Unit 6/],
    ["chemistry units", /Chemistry/, /Unit 4/],
    ["english units", /Professional English Communication/, /Unit 6/],
    ["economics units", /Economics/, /Unit 7/],
    ["electrical units", /Basic Electrical and Electronics Engineering/, /Unit 6/],
    ["drawing units", /Engineering Drawing and Graphics/, /Unit 6/],
    ["pps units", /Programming for Problem Solving/, /Unit 6/],
    ["manufacturing units", /Manufacturing Practices/, /Unit 1/],
    ["python units", /Programming Fundamentals using Python/, /Unit 5/]
  ].forEach(([question, title, unit]) => {
    const answer = answerWithoutAi(question);
    assert.match(answer, title);
    assert.match(answer, unit);
    assert.doesNotMatch(answer, /Next class:/);
  });
});

test("answers a realistic no-AI syllabus conversation without falling back to a timetable", () => {
  const { state, parseSyllabusText, answerWithoutAi } = context.__parserTest;
  state.syllabusPages = syllabusIndex.pages;
  state.syllabus = parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));

  const maths = answerWithoutAi("maths total units");
  assert.match(maths, /Mathematics - I/);
  assert.match(maths, /Total units:<\/strong> 4/);
  assert.doesNotMatch(maths, /Next class:/);

  const units = answerWithoutAi("list them");
  assert.match(units, /Unit 1:<\/strong> Differential Calculus/);
  assert.match(units, /Unit 4:<\/strong> Complex Numbers/);
  assert.doesNotMatch(units, /Next class:/);

  const outcomes = answerWithoutAi("its outcomes");
  assert.match(outcomes, /Taylor series/);
  assert.doesNotMatch(outcomes, /Next class:/);

  const allSubjects = answerWithoutAi("how many subjects are there");
  assert.match(allSubjects, /Total official subjects:<\/strong> 11/);
  const listedSubjects = answerWithoutAi("list them");
  assert.match(listedSubjects, /Official first-year subjects \(11\)/);
  assert.match(listedSubjects, /Physics/);
  assert.match(listedSubjects, /Mathematics - I/);

  const typo = answerWithoutAi("math sylabus units");
  assert.match(typo, /Differential Calculus/);
  const pageQuestion = answerWithoutAi("mathematics ii continuous assessment marks");
  assert.match(pageQuestion, /Page 30/);
  const physicsBooks = answerWithoutAi("physics textbooks");
  assert.match(physicsBooks, /Physics · Textbooks/);
  assert.match(physicsBooks, /A Text Book of Engineering Physics/);
  assert.doesNotMatch(physicsBooks, /Next class:/);
});

test("list-them syllabus follow-ups outrank stale context and never become a student search", () => {
  const { state, parseSyllabusText, answerWithoutAi, studentLookupRequest } = context.__parserTest;
  state.syllabusPages = syllabusIndex.pages;
  state.syllabus = parseSyllabusText(syllabusIndex.pages.map((page) => page.text).join("\f"));
  state.syllabusConversation = null;
  state.brainConversation = { lastIntent: "COUNT_SUBJECTS", recentTurns: [] };

  assert.equal(studentLookupRequest("list them"), null);
  const syllabusCount = answerWithoutAi("from syllabus how many subjects do i have");
  assert.match(syllabusCount, /Total official subjects:<\/strong> 11/);
  const syllabusList = answerWithoutAi("list them");
  assert.match(syllabusList, /Official first-year subjects \(11\)/);
  assert.match(syllabusList, /Physics/);
  assert.doesNotMatch(syllabusList, /Subjects in ECB1/);
});

test("searches indexed syllabus pages and handles popular Compass questions locally", () => {
  const { state, answerSyllabusQuestion, answerCompassQuestion } = context.__parserTest;
  state.syllabus = [];
  state.syllabusPages = [{ number: 1, text: "Course scheme includes internal marks 90 and end semester marks 60." }, { number: 33, text: "Reference material and course information." }];
  assert.match(answerSyllabusQuestion("syllabus marks"), /Page 1/);
  assert.match(answerSyllabusQuestion("syllabus marks"), /all 2 pages searched locally/);
  assert.match(answerCompassQuestion("what can you do?"), /Compass can help/);
  assert.match(answerCompassQuestion("hello"), /Hello/);
  assert.match(answerCompassQuestion("what is ai limit"), /do not use AI/);
  assert.match(answerCompassQuestion("what should I do in my free time?"), /Useful free-period choices/);
});

test("answers common profile, privacy, sharing, offline, and update questions locally", () => {
  const { answerCompassQuestion } = context.__parserTest;
  [
    ["my section is wrong how to change it", /Profile/],
    ["is my chat private", /browser/],
    ["how can my friend use compass", /Share/],
    ["does compass work offline", /Previously loaded/],
    ["when does compass update official data", /four hours/]
  ].forEach(([question, expected]) => assert.match(answerCompassQuestion(question), expected));
});

test("answers typoed branch questions precisely and keeps unsupported clarification implementation-neutral", () => {
  const { answerCompassQuestion, engineeringBranchesAnswer, verifiedAiAnswerOverride, localClarificationAnswer } = context.__parserTest;
  for (const question of ["how many brances do we have", "count the branches", "which brnches are offered at GNDEC?"]) {
    const answer = answerCompassQuestion(question);
    assert.match(answer, /7 current B\.Tech engineering branches/i, question);
    ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"].forEach((code) => assert.match(answer, new RegExp(`<strong>${code}<\\/strong>`), question));
    assert.match(answer, /Official GNDEC programme catalogue/i);
  }
  assert.equal(engineeringBranchesAnswer("what is my branch"), "", "a personal branch question must stay with the profile route");
  assert.match(verifiedAiAnswerOverride("how many brances do we have", "The timetable does not include that information."), /7 current B\.Tech engineering branches/i);
  assert.equal(verifiedAiAnswerOverride("how many brances do we have", "GNDEC has 7 engineering branches."), "");
  const clarification = localClarificationAnswer();
  assert.match(clarification, /not certain|rephrase/i);
  assert.doesNotMatch(clarification, /locally|connected|offline|network|actual ai|external model/i);
});

test("AI context receives the safe Brain catalogues needed for branch and timetable facts", () => {
  const { state, parseFetTimetable, buildScheduleIndex, assistantContext } = context.__parserTest;
  state.schedule = parseFetTimetable(FET_FIXTURE);
  state.groups = ["CSA"];
  state.selectedGroup = "CSA";
  state.selectedSubgroup = "CSA1";
  buildScheduleIndex();
  const payload = assistantContext("how many brances do we have");
  assert.equal(payload.officialAcademicCatalogue.engineeringBranchCount, 7);
  assert.deepEqual(Array.from(payload.officialAcademicCatalogue.engineeringBranches, (branch) => branch.code), ["CE", "CS", "EC", "EE", "IT", "ME", "RAI"]);
  assert.match(payload.officialAcademicCatalogue.officialProgramsUrl, /academics\.gndec\.ac\.in\/programs/);
  assert.ok(payload.selectedTimetable.catalogue.subjects.includes("MATH I"));
  assert.ok(payload.selectedTimetable.catalogue.teachers.includes("DR. SHARMA"));
  assert.ok(payload.selectedTimetable.catalogue.rooms.includes("F101"));
  assert.ok(payload.compassKnowledge.availableVerifiedDomains.includes("public professional faculty details"));
  assert.ok(JSON.stringify(payload).length < 36000);

  state.schedule = parseFetTimetable(officialGroupFixture);
  state.groups = [...new Set(state.schedule.map((item) => item.group))];
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  buildScheduleIndex();
  assert.ok(JSON.stringify(assistantContext("explain my weekly workload")).length < 36000, "the complete active FET timetable plus shared catalogues must fit the Worker limit");
});

test("external AI context and question redaction never include student identifiers", () => {
  const { state, assistantContext, redactSensitiveAiText } = context.__parserTest;
  state.student = { name: "Test Student", crn: "1234567", registrationNo: "26019999", currentSerialNo: "68", oldSerialNos: ["41"], branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR PRIVATE MENTOR", mentorPhone: "9999999999" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  const payload = JSON.stringify(assistantContext("Give me a detailed study plan"));
  ["Test Student", "1234567", "26019999", "\"68\"", "\"41\"", "DR PRIVATE MENTOR", "9999999999"].forEach((secret) => assert.doesNotMatch(payload, new RegExp(secret, "i")));
  assert.match(payload, /\"branch\":\"EC\"/);
  const redacted = redactSensitiveAiText("Make a plan for Test Student, CRN 1234567, registration 26019999, old serial 41, mentor DR PRIVATE MENTOR, mentor phone 9999999999");
  ["Test Student", "1234567", "26019999", "DR PRIVATE MENTOR", "9999999999"].forEach((secret) => assert.doesNotMatch(redacted, new RegExp(secret, "i")));
  assert.match(redacted, /removed/i);
  assert.doesNotMatch(redactSensitiveAiText("Help CRN A9X771 with Physics"), /A9X771/i);
});

test("exposes the student lookup control and uses only the Worker section-list route", () => {
  assert.match(pageSource, /<title>GNDEC Compass/);
  assert.match(pageSource, /class="skip-link"/);
  assert.match(pageSource, /class="skip-link" href="#main-content"/);
  assert.match(pageSource, /id="main-content" tabindex="-1"/);
  assert.match(pageSource, /aria-controls="primary-sidebar" aria-expanded="false"/);
  assert.match(pageSource, /id="source-status-button"/);
  assert.match(pageSource, />Ask Compass</);
  assert.match(pageSource, /id="student-lookup-form"/);
  assert.match(pageSource, /id="student-name-input"/);
  assert.match(pageSource, /current serial, or a previously published serial/i);
  assert.match(pageSource, /id="profile-crn"/);
  assert.match(pageSource, /id="profile-old-serials"/);
  assert.match(pageSource, /id="profile-mentor-phone"/);
  assert.match(pageSource, /Mentor venue/);
  assert.match(pageSource, /registration number/);
  assert.match(pageSource, /Student searches in chat are read-only and never change your profile/i);
  assert.match(pageSource, /id="timetable-search-suggestions"/);
  assert.match(pageSource, /id="compass-question-suggestions"/);
  assert.match(pageSource, /aria-autocomplete="list"[^>]*aria-controls="question-live-suggestions"[^>]*aria-expanded="false"/);
  assert.match(pageSource, /id="chat-window"[^>]*role="log"/);
  assert.match(pageSource, /id="timetable-result-status"[^>]*role="status"/);
  assert.match(pageSource, /id="week-table"[^>]*role="region"[^>]*tabindex="0"/);
  assert.match(pageSource, /id="admin-ai-mode"/);
  assert.match(pageSource, /id="admin-ai-control" hidden/);
  assert.match(pageSource, /id="admin-html-import" hidden/);
  assert.match(pageSource, /viewport-fit=cover/);
  assert.match(pageSource, /class="sidebar-scrim"/);
  assert.doesNotMatch(pageSource, /id="profile-disclosure"/);
  assert.match(pageSource, /id="chat-model-badge"[^>]*hidden/);
  assert.match(stylesSource, /\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*\}/i);
  assert.match(pageSource, /Registration and previous serial history appear only when a verified source publishes them/i);
  assert.doesNotMatch(pageSource, /Fast · Nemotron/);
  assert.match(appSource, /ADMIN_AI_MODE_STORAGE_KEY/);
  assert.match(appSource, /keyboard-open/);
  assert.match(appSource, /syncMobileNavigationAccessibility/);
  assert.match(appSource, /sidebar\.inert = mobile && !open/);
  assert.doesNotMatch(appSource, /class="week-mobile"/);
  assert.match(appSource, /MAX_CHAT_MESSAGES = 60/);
  assert.match(appSource, /safeStoredChatHtml/);
  assert.match(appSource, /history\.pushState/);
  assert.match(pageSource, /id="day-plan-toggle"/);
  assert.match(appSource, /adminAiMode\(\) === "local-only"/);
  assert.match(appSource, /if \(htmlImport\) htmlImport\.hidden = !visible/);
  assert.match(appSource, /if \(!hasAdminAiView\(\)\)[\s\S]{0,300}Admin authorization required/);
  assert.match(stylesSource, /\.answer-disclosure>summary/);
  assert.match(stylesSource, /100dvh/);
  assert.match(stylesSource, /-webkit-text-size-adjust:100%/);
  assert.match(stylesSource, /@media\(max-width:280px\)/);
  assert.match(stylesSource, /\.week-table\{[^}]*overflow:auto/);
  assert.match(stylesSource, /\.week-grid\{[^}]*min-width:880px/);
  assert.match(stylesSource, /\.week-time\{[^}]*flex-direction:column/);
  assert.match(appSource, /class="week-time-start"/);
  assert.match(appSource, /class="week-time-end"/);
  assert.doesNotMatch(stylesSource, /\.week-grid\{display:none/);
  assert.match(stylesSource, /safe-area-inset-top/);
  assert.match(stylesSource, /100svh/);
  assert.match(stylesSource, /@media\(forced-colors:active\)/);
  assert.match(stylesSource, /@media print/);
  assert.doesNotMatch(pageSource, /Kaushik Jain/);
  assert.doesNotMatch(pageSource, /Temporary Sections/i);
  assert.doesNotMatch(pageSource, /DELHI · INDIA/);
  assert.match(appSource, /fetch\(`\/api\/section-list\?branch=\$\{branch\}`\)/);
  assert.match(appSource, /const SECTION_LIST_BRANCHES = \["CE", "CS", "EC", "EE", "IT", "ME", "RAI"\]/);
  const chatSubmit = appSource.slice(appSource.indexOf('$("question-form").addEventListener("submit"'), appSource.indexOf('const clearChat = $("clear-chat")'));
  assert.ok(chatSubmit.indexOf("contextualLocalFollowupAnswer(question)") < chatSubmit.indexOf("studentLookupRequest(question"), "contextual syllabus follow-ups must resolve before roster lookup");
  assert.ok(chatSubmit.indexOf("resolveChatStudentLookup(question)") < chatSubmit.indexOf("adminForcesActualAi()"), "verified roster lookup must run before any external AI route");
  const readOnlyLookup = appSource.slice(appSource.indexOf("async function resolveChatStudentLookup"), appSource.indexOf("function legacyStudentLookupAnswer"));
  assert.doesNotMatch(readOnlyLookup, /applyStudentRecord\s*\(/);
});

test("explicit Muse and GPT-OSS admin modes force the real AI before local routing", () => {
  const { state, adminProfileFingerprint, adminAiMode, adminRequestedModel, adminForcesActualAi } = context.__parserTest;
  state.student = { name: "Kaushik Jain", crn: "2617070", branch: "Electronics and Communication Engineering", section: "ECB", subsection: "ECB1" };
  state.selectedGroup = "ECB";
  state.selectedSubgroup = "ECB1";
  storage.set("gndec-compass-ai-admin-view-v1", JSON.stringify({ expiresAt: new Date(Date.now() + 60_000).toISOString(), profileFingerprint: adminProfileFingerprint() }));

  storage.set("gndec-compass-admin-ai-mode-v1", "local-first");
  assert.equal(adminAiMode(), "local-first");
  assert.equal(adminForcesActualAi(), false);

  storage.set("gndec-compass-admin-ai-mode-v1", "local-only");
  assert.equal(adminForcesActualAi(), false);

  storage.set("gndec-compass-admin-ai-mode-v1", "muse");
  assert.equal(adminRequestedModel(), "meta/muse-glimmer-30b");
  assert.equal(adminForcesActualAi(), true);

  storage.set("gndec-compass-admin-ai-mode-v1", "gpt-oss");
  assert.equal(adminRequestedModel(), "openai/gpt-oss-120b");
  assert.equal(adminForcesActualAi(), true);

  const submitRoute = appSource.slice(appSource.indexOf('$("question-form").addEventListener("submit"'), appSource.indexOf('const clearChat = $("clear-chat")'));
  assert.ok(submitRoute.indexOf("adminForcesActualAi()") < submitRoute.indexOf("runCompassBrain(question)"));

  state.student = null;
  storage.delete("gndec-compass-ai-admin-view-v1");
  storage.delete("gndec-compass-admin-ai-mode-v1");
});

test("does not present a weekly class as a verified one-day timetable", () => {
  const { state, parseFetTimetable, buildScheduleIndex, answerWithoutAi } = context.__parserTest;
  state.schedule = parseFetTimetable(FET_FIXTURE);
  state.groups = ["CSA"];
  state.selectedGroup = "CSA";
  state.selectedSubgroup = "";
  buildScheduleIndex();
  const answer = answerWithoutAi("my timetable on 17 August 2026");
  assert.match(answer, /Date-specific timetable not verified/i);
  assert.match(answer, /will not guess a special-day lecture/i);
});

test("Complex queries and comparisons populate assistantContext correctly", async () => {
  const { state, assistantContext } = context.__parserTest;
  state.groups = ["ECB", "CSD", "RAI", "CE"];

  // Test creator info
  const ctx1 = assistantContext("who built this web app?");
  assert.match(ctx1.compassKnowledge.creator, /Kaushik Jain from ECE/);

  // Test batch info
  assert.match(ctx1.compassKnowledge.batch2026Details, /2026 Batch Section details/);

  // Test branch comparisons via regex
  const ctx2 = assistantContext("tuesday csd or rai or ecb time table compare");
  assert.ok("CSD" in ctx2.comparisonTimetables, "CSD should be in comparisonTimetables");
  assert.ok("RAI" in ctx2.comparisonTimetables, "RAI should be in comparisonTimetables");
  assert.ok("ECB" in ctx2.comparisonTimetables, "ECB should be in comparisonTimetables");
  assert.ok(!("CE" in ctx2.comparisonTimetables), "CE should not be in comparisonTimetables");
});

test("Multilingual, fuzzy, broken queries are accepted by AI proxy", async () => {
  const { redactSensitiveAiText } = context.__parserTest;
  // Test multiple questions in one sentence in Hinglish
  const query = "mohitveer singh tommorow or today or yesterday or x day or x date timetable ki class kahan hai aur kitne baje, who built this app?";
  const redacted = redactSensitiveAiText(query);
  assert.doesNotMatch(redacted, /\[removed\]/); // Assuming no profile loaded, should just pass through
});
