import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DOMParser } from "linkedom";

import {
  COLLEGE_LOOKAHEAD_MINUTES, DAY_NAMES, STUDY_DAYS, addDays, formatDuration, freeGapsBetweenClasses, getIndiaNow, humanTime,
  isHappeningNow, minutesFromTime, nextStudyDay, parseTimeExpression,
  relativeStartLabel, resolveQuestionDay, shouldLookAheadAtFive, weekdayIndex
} from "../next/engine/datetime.js";
import {
  parseFetTimetable, readVerifiedFetTimetable, sanitizeSchedule, mergeSchedules
} from "../next/engine/fet-parser.js";
import {
  compareRooms, computeFreeRooms, freeRoomSummary, groupRooms, isLabRoom, nextFreeRoomSlot,
  isRoomFree, roomZone, zoneFromQuestion
} from "../next/engine/free-rooms.js";
import {
  BELL_SLOTS, FALLBACK_REFUSAL, answerLocally, buildAnswerContext, classesFor,
  currentAndNext, escapeHtml, freeBellSlots, keywordsOf, normalizeQuestion
} from "../next/engine/answer.js";
import { buildIcs, firstMonday } from "../next/engine/ics.js";
import { answerFirstYearSyllabus, parseFirstYearSyllabus } from "../next/engine/syllabus.js";
import {
  digestCopy, dueReminder, isQuietTime, notificationCopy, reminderWindow
} from "../next/engine/reminders.js";
import {
  BRAIN_ENGINES, loadBrainScripts, resetBrainLoader, runBrain,
  toBrainContext, validateBrainResult
} from "../next/engine/brain-bridge.js";

const IST = (iso) => getIndiaNow(new Date(iso));

test("official first-year syllabus supports course and remembered unit follow-ups", async () => {
  const index = JSON.parse(await readFile(new URL("../public/data/first-year-syllabus-index.json", import.meta.url), "utf8"));
  const courses = parseFirstYearSyllabus(index.pages);
  assert.ok(courses.length >= 8);
  const pps = answerFirstYearSyllabus("PPS syllabus", courses);
  assert.equal(pps?.entities.syllabusCourseCode, "ESC103");
  assert.match(pps.html, /Programming for Problem Solving/i);
  const followup = answerFirstYearSyllabus("unit 2", courses, "ESC103");
  assert.match(followup.html, /Unit 2:/);
  assert.equal(followup.entities.syllabusCourseCode, "ESC103");
  assert.equal(answerFirstYearSyllabus("unit 9", courses, "ESC103"), null);
  const mathTwo = answerFirstYearSyllabus("Mathematics 2 syllabus", courses);
  assert.match(mathTwo?.html || "", /Mathematics\s*-\s*II/i);
  assert.match(mathTwo?.html || "", /Unit 5: Linear Algebra/i);
});

const schedule = [
  { id: "cea-mon-math", group: "CEA", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR GAGANDEEP KAUR LOTEY", room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-physics", group: "CEA", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "DR PARAMJIT SINGH", room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-lab", group: "CEA", day: "Monday", start: 630, end: 750, subject: "PHYSICS LAB", teacher: "ER. SATWANT SINGH", room: "S201", type: "P", cohorts: "CEA1,CEA2" },
  { id: "cea-tue-pps", group: "CEA", day: "Tuesday", start: 510, end: 570, subject: "PPS", teacher: "MS SIMRAN", room: "G101", type: "L", cohorts: "" },
  { id: "meb-mon-math", group: "MEB", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR OTHER", room: "G102", type: "L", cohorts: "" }
];

const roomSchedule = [
  { id: "room-f101", group: "F101", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "A", room: "F101", type: "L", cohorts: "CEA" },
  { id: "room-f102", group: "F102", day: "Monday", start: 600, end: 660, subject: "PHYSICS", teacher: "B", room: "F102", type: "L", cohorts: "CEA" },
  { id: "room-g101", group: "G101", day: "Monday", start: 510, end: 570, subject: "PPS", teacher: "C", room: "G101", type: "L", cohorts: "CEA" },
  { id: "room-lab", group: "COMP LAB CSE DEPT", day: "Monday", start: 510, end: 570, subject: "LAB", teacher: "D", room: "COMP LAB CSE DEPT", type: "P", cohorts: "CEA" }
];

const datesheet = {
  checkedAt: "2026-11-07T13:43:03.603Z",
  source: { url: "https://example.invalid/datesheet" },
  tabs: [
    {
      label: "Applied Sciences",
      sessions: [{ label: "Morning", start: 540, end: 720 }],
      entries: [
        { date: "2026-11-20", subject: "PHYSICS", qualifier: "Physics Group", sessionRaw: "9:00-12:00(Morning)" },
        { date: "2026-11-23", subject: "MATH I", qualifier: "All", sessionRaw: "9:00-12:00(Morning)" }
      ]
    }
  ]
};

function context(overrides = {}) {
  return {
    ...buildAnswerContext({
      schedule,
      roomSchedule,
      group: "CEA",
      subgroup: "",
      profile: { name: "Test Student", section: "CEA", subsection: "", branch: "Civil Engineering", mentor: "DR MENTOR" },
      now: IST("2026-11-09T02:30:00Z"), // 08:00 IST on a Monday
      metadata: { version: "17-09-2026", checkedAt: "2026-11-08T10:00:00.000Z" },
      datesheet,
      clock: "12h"
    }),
    ...overrides
  };
}

/* ── datetime ──────────────────────────────────────────────────────────── */

test("IST clock is independent of the host time zone", () => {
  const now = IST("2026-11-09T03:30:00Z");
  assert.equal(now.day, "Monday");
  assert.equal(now.time24, "09:00");
  assert.equal(now.time, "9:00 AM");
  assert.equal(now.dateISO, "2026-11-09");
  assert.equal(now.minutes, 540);

  const late = IST("2026-11-09T20:00:00Z"); // 01:30 next day IST
  assert.equal(late.day, "Tuesday");
  assert.equal(late.dateISO, "2026-11-10");
});

test("addDays and nextStudyDay skip only weekends", () => {
  const friday = IST("2026-11-13T03:30:00Z");
  assert.equal(friday.day, "Friday");
  const saturday = addDays(friday, 1);
  assert.equal(saturday.day, "Saturday");
  assert.equal(saturday.dateISO, "2026-11-14");
  const monday = nextStudyDay(saturday);
  assert.equal(monday.day, "Monday");
  assert.equal(monday.offset, 2);
  assert.equal(nextStudyDay(friday).day, "Monday");
});

test("time parsing is bounded and never guesses meridiem", () => {
  assert.equal(parseTimeExpression("at 2 PM"), 840);
  assert.equal(parseTimeExpression("2:30pm"), 870);
  assert.equal(parseTimeExpression("12 am"), 0);
  assert.equal(parseTimeExpression("12 pm"), 720);
  assert.equal(parseTimeExpression("14:15"), 855);
  assert.equal(parseTimeExpression("at 9"), 540);
  assert.equal(parseTimeExpression("25:00"), null);
  assert.equal(parseTimeExpression("13 pm"), null);
  assert.equal(parseTimeExpression("no time here"), null);
  assert.equal(minutesFromTime("9:00"), 540);
  assert.equal(minutesFromTime("09:00"), 540);
  assert.equal(minutesFromTime("not a time"), null);
});

test("day resolution handles relative words, weekends and short names", () => {
  const now = IST("2026-11-09T03:30:00Z");
  assert.equal(resolveQuestionDay("what about tomorrow?", now).day, "Tuesday");
  assert.equal(resolveQuestionDay("day after tomorrow", now).day, "Wednesday");
  assert.equal(resolveQuestionDay("on Friday", now).day, "Friday");
  assert.equal(resolveQuestionDay("fri schedule", now).day, "Friday");
  assert.equal(resolveQuestionDay("today", now).day, "Monday");
  assert.equal(resolveQuestionDay("no day mentioned", now), null);
  assert.equal(weekdayIndex("Sunday"), 6);
  assert.ok(STUDY_DAYS.every((day) => DAY_NAMES.includes(day)));
});

test("duration and relative labels are human readable", () => {
  assert.equal(humanTime(510), "8:30 AM");
  assert.equal(humanTime(0), "12:00 AM");
  assert.equal(humanTime(720), "12:00 PM");
  assert.equal(humanTime(855, "24h"), "14:15");
  assert.equal(formatDuration(50), "50 min");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(95), "1h 35m");
  assert.equal(relativeStartLabel(520, 510), "in 10 min");
  assert.equal(relativeStartLabel(510, 510), "now");
  assert.equal(relativeStartLabel(500, 510), "10 min ago");
  assert.equal(isHappeningNow({ start: 510, end: 570 }, 540), true);
  assert.equal(isHappeningNow({ start: 510, end: 570 }, 570), false);
});

/* ── parser ────────────────────────────────────────────────────────────── */

test("the new FET parser produces exactly the same entries as the legacy parser", async () => {
  const html = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");
  const { createAppHarness } = await import("../scripts/stress-probe-harness.mjs");
  const { api } = createAppHarness();
  const legacy = api.parseFetTimetable(html, "groups");
  const next = parseFetTimetable(html, "groups", { DOMParser });

  assert.equal(next.length, legacy.length);
  assert.equal(next.unparsedCells, 0);
  const key = (entry) => [entry.group, entry.day, entry.start, entry.end, entry.subject, entry.teacher, entry.room, entry.type, entry.cohorts].join("|");
  assert.equal([...next].map(key).sort().join("\n"), legacy.map(key).sort().join("\n"));
});

test("a verified release is sanitised and refuses unreadable cells", async () => {
  const html = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");
  const clean = readVerifiedFetTimetable(html, "groups", { DOMParser });
  assert.ok(clean.length > 500);
  assert.ok(clean.every((entry) => entry.teacher && entry.room && DAY_NAMES.includes(entry.day)));

  assert.throws(() => readVerifiedFetTimetable("<html><body>too short</body></html>", "groups", { DOMParser }));
  const broken = `<html><body><table><caption><div class="name">CEA</div></caption>
    <thead><tr><th></th><th class="xAxis">Monday</th><th class="xAxis">Tuesday</th><th class="xAxis">Wednesday</th><th class="xAxis">Thursday</th><th class="xAxis">Friday</th></tr></thead>
    <tbody><tr><th class="yAxis">8:30</th><td>UNREADABLE MYSTERY</td><td class="empty"></td><td class="empty"></td><td class="empty"></td><td class="empty"></td></tr></tbody></table></body></html>`;
  assert.throws(() => readVerifiedFetTimetable(broken, "groups", { DOMParser }), /could not be read completely/i);
});

test("the bundled fallback release is complete and parseable", async () => {
  const groups = await readFile(new URL("../next/data/timetable-groups.html", import.meta.url), "utf8");
  const rooms = await readFile(new URL("../next/data/timetable-rooms.html", import.meta.url), "utf8");
  const schedule = readVerifiedFetTimetable(groups, "groups", { DOMParser });
  const roomSchedule = readVerifiedFetTimetable(rooms, "rooms", { DOMParser });
  assert.ok(schedule.length > 500, `groups bundle has ${schedule.length} rows`);
  assert.ok(roomSchedule.length > 500, `rooms bundle has ${roomSchedule.length} rows`);
  assert.ok(new Set(schedule.map((entry) => entry.group)).size > 40, "every section is present");
  assert.ok(schedule.every((entry) => entry.teacher && entry.room && DAY_NAMES.includes(entry.day)));
});

test("sanitizeSchedule drops malformed rows and keeps missing details explicit", () => {
  assert.deepEqual(sanitizeSchedule(null), []);
  const clean = sanitizeSchedule([
    { group: "CEA", day: "Monday", subject: "MATH", start: 510, end: 570 },
    { group: "CEA", day: "Monday", subject: "", start: 510, end: 570 },
    { group: "CEA", day: "Funday", subject: "MATH", start: 510, end: 570 },
    { group: "CEA", day: "Monday", subject: "MATH", start: 570, end: 510 },
    null
  ]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].teacher, "Teacher not listed");
  assert.equal(clean[0].room, "Room not listed");
  assert.equal(clean[0].cohorts, "");
});

test("mergeSchedules deduplicates without inventing data", () => {
  const merged = mergeSchedules(schedule, [schedule[0], { ...schedule[0], id: "other", room: "F109" }], []);
  assert.equal(merged.length, schedule.length + 1);
  assert.equal(merged.filter((entry) => entry.subject === "MATH I" && entry.group === "CEA").length, 2);
});

/* ── free rooms ────────────────────────────────────────────────────────── */

test("rooms group by published label only", () => {
  const grouped = groupRooms(["F101", "F9", "F119", "G1", "S203", "A6 (AUTOMOBILE BLOCK)", "COMP LAB CSE DEPT", "", null, "F101"]);
  assert.equal(grouped.total, 7);
  assert.deepEqual(grouped.groups.map((group) => [group.label, group.count]), [
    ["F block", 3],
    ["G block", 1],
    ["S block", 1],
    ["A block", 1],
    ["Labs and named rooms", 1]
  ]);
  assert.deepEqual(grouped.groups[0].rooms, ["F9", "F101", "F119"]);
  assert.equal(roomZone("DBMS LAB IT DEPT"), "Labs and named rooms");
  assert.equal(roomZone("SEMINAR HALL"), "Other published rooms");
  assert.equal(roomZone(""), "Other published rooms");
  assert.equal(isLabRoom("COMP LAB CSE DEPT"), true);
  assert.equal(isLabRoom("F101"), false);
  assert.equal(zoneFromQuestion("which labs are free?"), "Labs and named rooms");
  assert.equal(zoneFromQuestion("free rooms in F block"), "F block");
  assert.equal(zoneFromQuestion("anything free?"), "");
  assert.ok(compareRooms("F9", "F101") < 0);
});

test("free-room computation respects the window, filters and published days", () => {
  const monday = computeFreeRooms({ roomSchedule, day: "Monday", minutes: 570, duration: 60 });
  assert.equal(monday.error, "");
  assert.deepEqual(monday.rooms.map((item) => item.room), ["COMP LAB CSE DEPT", "F101", "G101"]);
  assert.equal(monday.busy.length, 1);
  assert.equal(monday.busy[0].room, "F102");

  const noLabs = computeFreeRooms({ roomSchedule, day: "Monday", minutes: 570, duration: 60, includeLabs: false });
  assert.equal(noLabs.rooms.some((item) => item.room.includes("LAB")), false);

  const onlyLabs = computeFreeRooms({ roomSchedule, day: "Monday", minutes: 570, duration: 60, includeLectureHalls: false });
  assert.deepEqual(onlyLabs.rooms.map((item) => item.room), ["COMP LAB CSE DEPT"]);

  const gOnly = computeFreeRooms({ roomSchedule, day: "Monday", minutes: 570, duration: 60, zone: "G block" });
  assert.deepEqual(gOnly.rooms.map((item) => item.room), ["G101"]);

  const sunday = computeFreeRooms({ roomSchedule, day: "Sunday", minutes: 570, duration: 60 });
  assert.match(sunday.error, /does not publish Sunday/);

  const unavailable = computeFreeRooms({ roomSchedule: [], day: "Monday", minutes: 570 });
  assert.match(unavailable.error, /not loaded/);

  assert.equal(isRoomFree(roomSchedule, "F101", "Monday", 570, 60), true);
  assert.equal(isRoomFree(roomSchedule, "F102", "Monday", 570, 60), false);
  assert.match(freeRoomSummary(monday), /free rooms/);
});

test("next free room slot starts at the next published boundary and respects duration and filters", () => {
  const rows = [
    { group: "F101", day: "Monday", start: 510, end: 540, subject: "MATH" },
    { group: "F101", day: "Monday", start: 600, end: 660, subject: "PPS" },
    { group: "F102", day: "Monday", start: 540, end: 600, subject: "PHYSICS" },
    { group: "G101", day: "Monday", start: 510, end: 570, subject: "CHEMISTRY" },
    { group: "COMP LAB CSE DEPT", day: "Monday", start: 570, end: 630, subject: "LAB" }
  ];
  const next = nextFreeRoomSlot({ roomSchedule: rows, day: "Monday", after: 510, duration: 60 });
  assert.equal(next.start, 540);
  assert.equal(next.end, 600);
  assert.deepEqual(next.rooms.map((item) => item.room), ["F101"]);
  assert.equal(nextFreeRoomSlot({ roomSchedule: rows, day: "Monday", after: 510, duration: 60, includeLabs: false }).rooms.some((item) => item.room.includes("LAB")), false);
  assert.equal(nextFreeRoomSlot({ roomSchedule: rows, day: "Monday", after: 16 * 60, duration: 60 }), null);
});

/* ── local answers ─────────────────────────────────────────────────────── */

test("local answers use the active section, day and time", () => {
  const ctx = context();

  const next = answerLocally("What is my next class?", ctx);
  assert.match(next.html, /MATH I/);
  assert.equal(next.intent, "NEXT_CLASS");
  assert.ok(next.confidence >= 0.9);
  assert.ok(next.plan.length <= 8);

  const currentCtx = context({ now: IST("2026-11-09T04:00:00Z") }); // 09:30 IST, PHYSICS
  const current = answerLocally("What class do I have now?", currentCtx);
  assert.match(current.html, /PHYSICS/);
  assert.ok(["CURRENT_CLASS", "NEXT_CLASS"].includes(current.intent));

  const day = answerLocally("Show my timetable for tomorrow", ctx);
  assert.match(day.html, /PPS/);
  assert.equal(day.intent, "DAY_SCHEDULE");

  const free = answerLocally("Do I have any free periods today?", ctx);
  assert.equal(free.intent, "FREE_PERIODS");
  assert.match(free.html, /Free slots/);

  const subject = answerLocally("Where is Physics?", ctx);
  assert.equal(subject.intent, "SUBJECT_ROOMS");
  assert.match(subject.html, /F108/);

  const teacher = answerLocally("Who teaches Physics?", ctx);
  assert.equal(teacher.intent, "SUBJECT_TEACHERS");
  assert.match(teacher.html, /DR PARAMJIT SINGH/);

  const first = answerLocally("What is my first class today?", ctx);
  assert.equal(first.intent, "FIRST_CLASS");
  assert.match(first.html, /MATH I/);

  const last = answerLocally("When do I finish today?", ctx);
  assert.equal(last.intent, "LAST_CLASS");
  assert.match(last.html, /PHYSICS LAB/);
});

test("sub-group filtering follows the published cohort", () => {
  const cea1 = context({ subgroup: "CEA1" });
  const cea2 = context({ subgroup: "CEA2" });
  const outsider = context({ subgroup: "XXX9" });

  assert.equal(classesFor(schedule, "CEA", "Monday", "").length, 3);
  assert.equal(classesFor(schedule, "CEA", "Monday", "CEA1").length, 3);
  assert.equal(classesFor(schedule, "CEA", "Monday", "CEA2").length, 3);
  // A cohort that the release does not publish keeps only shared classes.
  assert.equal(classesFor(schedule, "CEA", "Monday", "XXX9").length, 2);

  const free = answerLocally("free periods on Monday", cea2);
  assert.match(free.html, /Free slots|Every published bell slot/);
  assert.ok(outsider.group);
});

test("free-room answers refuse to guess and respect the requested time", () => {
  const ctx = context();
  const now = answerLocally("Which rooms are free now?", ctx);
  assert.equal(now.intent, "FREE_ROOMS");
  assert.match(now.html, /F102/);
  assert.doesNotMatch(now.html, /F101/);

  const atTwo = answerLocally("Which rooms are free at 2 PM?", ctx);
  assert.equal(atTwo.intent, "FREE_ROOMS");
  assert.match(atTwo.html, /2:00 PM/);

  const noRooms = answerLocally("Which rooms are free?", context({ roomSchedule: [] }));
  assert.equal(noRooms.intent, "FREE_ROOMS_UNAVAILABLE");
  assert.match(noRooms.html, /will not guess/);
});

test("profile and datesheet answers come from device data only", () => {
  const profile = answerLocally("What is my section and mentor?", context());
  assert.equal(profile.intent, "PROFILE");
  assert.match(profile.html, /CEA/);
  assert.match(profile.html, /DR MENTOR/);
  assert.match(profile.html, /device only/i);

  const fullProfile = context({
    profile: {
      name: "Test Student", section: "CEA", subsection: "", branch: "Civil Engineering",
      mentor: "DR MENTOR", mentorPhone: "9876543210", academicGroup: "CEAM1", mentorVenue: "LH-101"
    }
  });
  const phone = answerLocally("what is my mentor phone number", fullProfile);
  assert.equal(phone.intent, "PROFILE_MENTOR_PHONE");
  assert.match(phone.html, /9876543210/);
  const venue = answerLocally("my mentor venue", fullProfile);
  assert.equal(venue.intent, "PROFILE_MENTOR_VENUE");
  assert.match(venue.html, /LH-101/);
  const group = answerLocally("what is my mentoring group", fullProfile);
  assert.equal(group.intent, "PROFILE_ACADEMIC_GROUP");
  assert.match(group.html, /CEAM1/);
  const summary = answerLocally("who am i", fullProfile);
  assert.match(summary.html, /Mentor phone: 9876543210/);
  assert.match(summary.html, /Mentoring group: CEAM1/);

  const exam = answerLocally("When is my ESE exam?", context());
  assert.equal(exam.intent, "DATESHEET");
  assert.match(exam.html, /2026-11-20/);
  assert.match(exam.html, /PHYSICS/);

  const dated = answerLocally("exam on 23 November", context());
  assert.equal(dated.intent, "DATESHEET");
  assert.match(dated.html, /MATH I/);

  const missing = answerLocally("exam on 30 December", context());
  assert.equal(missing.intent, "DATESHEET_NONE");
  assert.match(missing.html, /will not guess/);
});

test("admin-published date sheets answer without replacing the official ESE sheet", () => {
  const publishedDatesheets = [{
    title: "MSE-II Chemistry date sheet",
    scope: "MSE",
    department: "Applied Sciences",
    date: "2026-11-20",
    url: "https://gndec.ac.in/notice.pdf",
    body: "23 Nov Chemistry\n24 Nov Physics"
  }];
  const mse = answerLocally("MSE chemistry date sheet", context({ publishedDatesheets }));
  assert.equal(mse.intent, "PUBLISHED_DATESHEET");
  assert.match(mse.html, /MSE-II Chemistry/);
  assert.match(mse.html, /notice\.pdf/);
  assert.match(mse.html, /23 Nov Chemistry/);

  const generic = answerLocally("show the date sheet", context({ publishedDatesheets }));
  assert.equal(generic.intent, "PUBLISHED_DATESHEET");

  const ese = answerLocally("When is my ESE exam?", context({ publishedDatesheets }));
  assert.equal(ese.intent, "DATESHEET");
});

test("refusals are explicit, bounded and never fabricated", () => {
  const noData = answerLocally("What is my next class?", context({ schedule: [] }));
  assert.equal(noData.intent, "NO_DATA");

  const noGroup = answerLocally("What is my next class?", context({ group: "" }));
  assert.equal(noGroup.intent, "NO_SECTION");

  const unknown = answerLocally("What is the meaning of life?", context());
  assert.equal(unknown, null, "an unknown open question is offered to the optional AI relay, not guessed locally");

  const tooLong = answerLocally("a".repeat(900), context());
  assert.equal(tooLong.intent, "TOO_LONG");

  const greeting = answerLocally("hello", context());
  assert.equal(greeting.intent, "GREETING");

  const capabilities = answerLocally("who are you?", context());
  assert.equal(capabilities.intent, "CAPABILITIES");
  assert.match(capabilities.html, /not an LLM/);

  assert.match(FALLBACK_REFUSAL, /cannot verify/i);
});

test("answer helpers escape user-visible data", () => {
  assert.equal(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.deepEqual(keywordsOf("Where is my Physics class?"), ["physics"]);
  assert.equal(normalizeQuestion("  A   B  "), "a b");
  assert.equal(currentAndNext(schedule.filter((entry) => entry.group === "CEA" && entry.day === "Monday"), 540).current.subject, "MATH I");
  assert.equal(freeBellSlots([]).length, BELL_SLOTS.length);
});

test("calendar export is valid, bounded and only uses published entries", () => {
  const ics = buildIcs({ schedule, group: "CEA", subgroup: "", version: "17-09-2026", startDate: "2026-11-09", weeks: 4 });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR$/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4/);
  assert.match(ics, /SUMMARY:MATH I/);
  assert.match(ics, /LOCATION:F108/);
  assert.match(ics, /TZID:Asia\/Kolkata/);
  assert.equal(firstMonday("2026-11-09"), "2026-11-09");
  assert.equal(firstMonday("2026-11-10"), "2026-11-16");

  assert.throws(() => buildIcs({ schedule, group: "" }), /Choose a section/);
  assert.throws(() => buildIcs({ schedule, group: "NOPE" }), /No published class/);
});

test("free timetable gaps are derived from class boundaries and merge overlaps safely", () => {
  assert.deepEqual(freeGapsBetweenClasses([
    { start: 600, end: 650 },
    { start: 510, end: 570 },
    { start: 640, end: 660 },
    { start: 700, end: 750 }
  ]), [{ start: 570, end: 600 }, { start: 660, end: 700 }]);
  assert.deepEqual(freeGapsBetweenClasses([{ start: 510, end: 560 }, { start: 570, end: 600 }]), []);
  assert.deepEqual(freeGapsBetweenClasses([{ start: 600, end: 600 }, { start: "600", end: 650 }]), []);
});

test("the legacy dashboard look-ahead starts at 5 PM, not at the last class bell", () => {
  assert.equal(COLLEGE_LOOKAHEAD_MINUTES, 1020);
  assert.equal(shouldLookAheadAtFive(1019, true), false);
  assert.equal(shouldLookAheadAtFive(1020, true), true);
  assert.equal(shouldLookAheadAtFive(800, false), true);
});

test("reminders respect lead time and quiet hours", () => {
  const classes = schedule.filter((entry) => entry.group === "CEA" && entry.day === "Monday");
  const now = { minutes: 500 };
  assert.equal(dueReminder(classes, now, 10).subject, "MATH I");
  assert.equal(dueReminder(classes, now, 10, new Set(["cea-mon-math"])), null);
  assert.equal(dueReminder(classes, { minutes: 570 }, 10), null);

  assert.deepEqual(reminderWindow(now, 10), { from: 500, to: 510 });
  assert.equal(isQuietTime(23 * 60, "22:00", "07:00"), true);
  assert.equal(isQuietTime(6 * 60, "22:00", "07:00"), true);
  assert.equal(isQuietTime(12 * 60, "22:00", "07:00"), false);
  assert.equal(isQuietTime(8 * 60, "09:00", "17:00"), false);
  assert.equal(isQuietTime(9 * 60, "09:00", "17:00"), true);

  const copy = notificationCopy(classes[0], 10);
  assert.match(copy.title, /MATH I in 10 min/);
  assert.match(copy.body, /F108/);

  const digest = digestCopy(classes, "Monday");
  assert.match(digest.title, /3 classes/);
  assert.match(digest.body, /MATH I/);
  assert.match(digestCopy([], "Sunday").title, /no classes/);
});

/* ── Brain bridge ──────────────────────────────────────────────────────── */

test("the Brain adapter exposes the legacy context shape", () => {
  const brain = toBrainContext(context());
  assert.ok(Array.isArray(brain.classes));
  assert.equal(brain.classes.length, 4, "the Brain receives the whole active section, not just today");
  assert.equal(brain.profile.section, "CEA");
  assert.equal(brain.profileLabel, "CEA");
  assert.equal(brain.bellSlots.length, 8);
  assert.equal(brain.calendarDate, "2026-11-09");
  assert.equal(brain.currentYear, 2026);
  assert.equal(brain.datasetVersion, "17-09-2026");
  assert.deepEqual(brain.syllabus, []);
  assert.deepEqual(brain.studentRoster, []);
});

test("Brain results are rejected unless handled, verified and confident", () => {
  assert.equal(validateBrainResult(null).accepted, false);
  assert.equal(validateBrainResult({ handled: false, verified: true, confidence: 0.99, answer: "<p>x</p>" }).reason, "INVALID_RESULT");
  assert.equal(validateBrainResult({ handled: true, verified: false, confidence: 0.99, answer: "<p>x</p>" }).reason, "INVALID_RESULT");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.5, answer: "<p>x</p>" }).reason, "LOW_CONFIDENCE");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "" }).reason, "INVALID_RESULT");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "<script>alert(1)</script>" }).reason, "VERIFICATION_FAILED");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "<img onerror=x>" }).reason, "VERIFICATION_FAILED");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "<p>NaN</p>" }).reason, "VERIFICATION_FAILED");
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "<p>Physics is at 9:30 AM.</p>", plan: ["a", "b"] }).accepted, true);
  assert.equal(validateBrainResult({ handled: true, verified: true, confidence: 0.99, answer: "<p>x</p>", plan: new Array(9).fill("x") }).accepted, false);
});

test("the Brain chain falls through invalid engines to the next valid one", () => {
  const previousV22 = globalThis.CompassBrainV2_2;
  const previousV12 = globalThis.CompassBrainV1_2;
  const previousV2 = globalThis.CompassBrainV2;
  try {
    globalThis.CompassBrainV2_2 = { MIN_CONFIDENCE: 0.95, process: () => ({ handled: true, verified: true, confidence: 0.4, answer: "<p>unsafe</p>" }) };
    globalThis.CompassBrainV1_2 = { MIN_CONFIDENCE: 0.82, process: () => ({ handled: true, verified: true, confidence: 0.9, answer: "<p>Physics is at 9:30 AM.</p>", plan: ["read release"] }) };
    delete globalThis.CompassBrainV2;

    const { result, attempts } = runBrain("when is physics", context());
    assert.ok(result);
    assert.equal(result.engine, "brain-1.2");
    assert.equal(result.engineLabel, "Brain 1.2");
    assert.match(result.answer, /9:30 AM/);
    assert.ok(attempts.some((attempt) => attempt.engine === "Brain 2.2" && attempt.reason === "LOW_CONFIDENCE"));
    assert.ok(attempts.some((attempt) => attempt.engine === "Brain 1.2" && attempt.reason === "ACCEPTED"));
  } finally {
    globalThis.CompassBrainV2_2 = previousV22;
    globalThis.CompassBrainV1_2 = previousV12;
    globalThis.CompassBrainV2 = previousV2;
  }
});

test("the Brain chain never throws and reports unavailable engines", () => {
  const previousV22 = globalThis.CompassBrainV2_2;
  const previousV12 = globalThis.CompassBrainV1_2;
  const previousV2 = globalThis.CompassBrainV2;
  try {
    delete globalThis.CompassBrainV2_2;
    globalThis.CompassBrainV1_2 = { MIN_CONFIDENCE: 0.82, process: () => { throw new Error("boom"); } };
    globalThis.CompassBrainV2 = { MIN_CONFIDENCE: 0.82, process: () => ({ handled: false }) };
    const { result, attempts } = runBrain("hello", context());
    assert.equal(result, null);
    assert.ok(attempts.some((attempt) => attempt.reason === "UNAVAILABLE"));
    assert.ok(attempts.some((attempt) => attempt.reason === "EXCEPTION"));
    assert.equal(BRAIN_ENGINES.length, 3);
  } finally {
    globalThis.CompassBrainV2_2 = previousV22;
    globalThis.CompassBrainV1_2 = previousV12;
    globalThis.CompassBrainV2 = previousV2;
  }
});

test("the Brain loader is bounded and tolerates missing assets", async () => {
  const previousDoc = globalThis.document;
  resetBrainLoader();
  try {
    globalThis.document = null;
    assert.equal(await loadBrainScripts(null, []), false);

    const appended = [];
    const fakeDocument = {
      createElement: () => ({ set src(value) { this._src = value; }, get src() { return this._src; } }),
      head: { appendChild: (script) => { appended.push(script.src); queueMicrotask(() => script.onerror()); } },
      documentElement: { appendChild: () => {} }
    };
    assert.equal(await loadBrainScripts(fakeDocument, ["/missing.js"]), false);
    assert.deepEqual(appended, ["/missing.js"]);
  } finally {
    globalThis.document = previousDoc;
    resetBrainLoader();
  }
});
