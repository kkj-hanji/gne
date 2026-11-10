/**
 * Ask Compass language coverage.
 *
 * These tests lock the promise that a student can type plain English,
 * Hinglish, romanised Punjabi, romanised Hindi, SMS shortforms, subject codes
 * and ordinary typos, and still get a verified deterministic answer.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  bestMatch, canonicalize, contentTokens, diceSimilarity, editDistance,
  hasIndicScript, mentions, tokenSimilar, transliterate, VOCAB
} from "../next/engine/language.js";
import { getIndiaNow, resolveQuestionDay } from "../next/engine/datetime.js";
import { answerLocally, buildAnswerContext, roomCodeOf } from "../next/engine/answer.js";

const schedule = [
  { id: "cea-mon-math", group: "CEA", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR GAGANDEEP KAUR LOTEY", room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-physics", group: "CEA", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "DR PARAMJIT SINGH", room: "F108", type: "L", cohorts: "" },
  { id: "cea-mon-lab", group: "CEA", day: "Monday", start: 630, end: 750, subject: "PHYSICS LAB", teacher: "ER. SATWANT SINGH", room: "S201", type: "P", cohorts: "CEA1,CEA2" },
  { id: "cea-tue-pps", group: "CEA", day: "Tuesday", start: 510, end: 570, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "MS SIMRAN", room: "G101", type: "L", cohorts: "" },
  { id: "cea-wed-chem", group: "CEA", day: "Wednesday", start: 510, end: 570, subject: "CHEMISTRY", teacher: "DR NEHA", room: "F110", type: "L", cohorts: "" },
  { id: "ceb-mon-math", group: "CEB", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR OTHER", room: "G102", type: "L", cohorts: "" },
  { id: "ceb-tue-bee", group: "CEB", day: "Tuesday", start: 630, end: 690, subject: "BASIC ELECTRICAL AND ELECTRONICS ENGINEERING", teacher: "DR BEE", room: "E201", type: "L", cohorts: "" }
];

const roomSchedule = [
  { id: "r-f101", group: "F101", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "A", room: "F101", type: "L", cohorts: "CEA" },
  { id: "r-f102", group: "F102", day: "Monday", start: 600, end: 660, subject: "PHYSICS", teacher: "B", room: "F102", type: "L", cohorts: "CEA" },
  { id: "r-g101", group: "G101", day: "Monday", start: 510, end: 570, subject: "PPS", teacher: "C", room: "G101", type: "L", cohorts: "CEA" }
];

const datesheet = {
  tabs: [{
    label: "Applied Sciences",
    entries: [
      { date: "2026-11-20", subject: "PHYSICS" },
      { date: "2026-11-23", subject: "MATH I" }
    ]
  }]
};

const ctx = buildAnswerContext({
  schedule,
  roomSchedule,
  group: "CEA",
  profile: { name: "Test Student", section: "CEA", branch: "Civil Engineering", mentor: "DR MENTOR" },
  now: getIndiaNow(new Date("2026-11-09T02:30:00Z")), // Monday 08:00 IST
  metadata: { version: "17-09-2026" },
  datesheet
});

function intentOf(question, context = ctx, memory = null) {
  return answerLocally(question, context, memory)?.intent || null;
}

function htmlOf(question, context = ctx, memory = null) {
  return answerLocally(question, context, memory)?.html || "";
}

/* ── normalisation ─────────────────────────────────────────────────────── */

test("canonicalisation folds English contractions, SMS and casing", () => {
  assert.equal(canonicalize("  What's   MY next class?? "), "what is my next class");
  assert.equal(canonicalize("wt is my nxt cls"), "what is my next class");
  assert.equal(canonicalize("TLM"), "tlm");
  assert.equal(canonicalize("timetbel bhejo plz"), "timetable show please");
  assert.equal(canonicalize("tommorow ka shedule"), "tomorrow ka schedule");
});

test("Hinglish and romanised Hindi are expanded to canonical English", () => {
  assert.equal(canonicalize("mera agla class kab hai"), "my next class when is");
  assert.equal(canonicalize("physics kahan hai"), "physics where is");
  assert.equal(canonicalize("aaj ka timetable batao"), "today ka timetable show");
  assert.equal(canonicalize("konsi class abhi chal rahi hai"), "which class current is");
  assert.equal(canonicalize("kal ki chutti hai"), "tomorrow ki holiday is");
  assert.equal(canonicalize("kamra khali hai"), "room free is");
});

test("romanised Punjabi is understood", () => {
  assert.equal(canonicalize("meri agli class kadon hai"), "my next class when is");
  assert.equal(canonicalize("kithay hai physics da class"), "where is physics da class");
  assert.equal(canonicalize("kallh di timetable"), "tomorrow di timetable");
  assert.equal(canonicalize("ajj da timetable bhejo"), "today da timetable show");
  assert.equal(canonicalize("kamra f101 khali hai"), "room f101 free is");
  assert.equal(canonicalize("ticher kaun hai"), "teacher who is");
});

test("Indic script is transliterated deterministically without a model", () => {
  assert.equal(hasIndicScript("मेरा"), true);
  assert.equal(hasIndicScript("mera"), false);
  assert.match(transliterate("मेरा अगला क्लास"), /meraa|mera/);
  assert.equal(canonicalize("मेरा अगला क्लास कब है"), "my next class when is");
  assert.equal(canonicalize("ਕੱਲ੍ਹ ਦੀ ਟਾਈਮਟੇਬਲ"), "tomorrow dee timetable");
  assert.equal(canonicalize("ਅੱਜ ਦਾ ਟਾਈਮ ਟੇਬਲ"), "today daa timetable");
  assert.equal(canonicalize("गुरुवार की timetable"), "thursday kee timetable");
});

test("subject codes and nicknames stay meaningful", () => {
  assert.deepEqual(contentTokens("PPS ka teacher kaun hai"), ["pps"]);
  assert.deepEqual(contentTokens("BEE dept faculty"), ["bee", "dept"]);
  assert.ok(contentTokens("MCPD class").includes("mcpd"));
});

test("mentions and fuzzy matching tolerate realistic typos", () => {
  assert.equal(mentions("timetbel bhejo", ["timetable"]), true);
  assert.equal(mentions("free rroms?", ["free", "room"]), true);
  assert.equal(mentions("wensday schedule", ["wednesday"]), true);
  assert.equal(mentions("ticher kaun", ["teacher"]), true);
  assert.equal(mentions("physics", ["chemistry"]), false);

  assert.ok(editDistance("physics", "physcs", 3) <= 2);
  assert.ok(diceSimilarity("physics", "physcs") > 0.5);
  assert.ok(tokenSimilar("gagan", "gagandeep") > 0.9);
  assert.deepEqual(bestMatch("physcs", ["PHYSICS", "CHEMISTRY"]), { value: "PHYSICS", score: 1 });
});

/* ── date parsing across languages ─────────────────────────────────────── */

test("weekday names work in English, Hindi and Punjabi spellings", () => {
  const now = getIndiaNow(new Date("2026-11-09T02:30:00Z"));
  for (const question of ["monday", "somvar", "somwar", "ਸੋਮਵਾਰ", "सोमवार"]) {
    assert.equal(resolveQuestionDay(question, now)?.day, "Monday", question);
  }
  for (const question of ["thursday", "guruvaar", "ਗੁਰੂਵਾਰ", "गुरुवार"]) {
    assert.equal(resolveQuestionDay(question, now)?.day, "Thursday", question);
  }
  for (const question of ["wensday", "wednsday", "budhvar"]) {
    assert.equal(resolveQuestionDay(question, now)?.day, "Wednesday", question);
  }
  assert.equal(resolveQuestionDay("kallh", now)?.day, "Tuesday");
  assert.equal(resolveQuestionDay("parso", now)?.day, "Wednesday");
  assert.equal(resolveQuestionDay("aaj", now)?.day, "Monday");
});

/* ── end-to-end deterministic answers ──────────────────────────────────── */

test("English questions route to verified intents", () => {
  assert.equal(intentOf("What is my next class?"), "NEXT_CLASS");
  assert.equal(intentOf("Where is Physics?"), "SUBJECT_ROOMS");
  assert.equal(intentOf("Who teaches PPS?"), "SUBJECT_TEACHERS");
  assert.equal(intentOf("Which rooms are free now?"), "FREE_ROOMS");
  assert.equal(intentOf("When is my ESE exam?"), "DATESHEET");
  assert.equal(intentOf("What is my profile?"), "PROFILE");
});

test("Hinglish questions reach the same answers", () => {
  assert.equal(intentOf("mera agla class kab hai"), "NEXT_CLASS");
  assert.equal(intentOf("physics kahan hai"), "SUBJECT_ROOMS");
  assert.equal(intentOf("PPS ka teacher kaun hai"), "SUBJECT_TEACHERS");
  assert.equal(intentOf("aaj ka timetable batao"), "DAY_SCHEDULE");
  assert.equal(intentOf("free room kaha milega"), "FREE_ROOMS");
  assert.match(htmlOf("mera section kya hai"), /CEA/);
});

test("romanised Punjabi reaches the same answers", () => {
  assert.equal(intentOf("meri agli class kadon hai"), "NEXT_CLASS");
  assert.equal(intentOf("kithay hai physics da class"), "SUBJECT_ROOMS");
  assert.equal(intentOf("kallh di timetable bhejo"), "DAY_SCHEDULE");
  assert.equal(intentOf("ajj da shedule"), "DAY_SCHEDULE");
  assert.equal(intentOf("PPS da ticher kaun hai"), "SUBJECT_TEACHERS");
});

test("broken SMS-style input still routes", () => {
  assert.equal(intentOf("wt is my nxt cls"), "NEXT_CLASS");
  assert.equal(intentOf("wher is physcs"), "SUBJECT_ROOMS");
  assert.equal(intentOf("hw many free rroms rn"), "FREE_ROOMS");
  assert.equal(intentOf("exm dateshet kab"), "DATESHEET");
});

test("subject codes and nicknames are matched to real subjects only", () => {
  assert.match(htmlOf("PPS teacher"), /PROGRAMMING FOR PROBLEM SOLVING/);
  const edgCtx = buildAnswerContext({
    schedule: [...schedule, { id: "cea-thu-edg", group: "CEA", day: "Thursday", start: 510, end: 570, subject: "ENGINEERING DRAWING", teacher: "DR DRAWING", room: "F101", type: "L", cohorts: "" }],
    roomSchedule, group: "CEA", profile: { section: "CEA" }, now: ctx.now, metadata: ctx.metadata, datesheet
  });
  assert.match(htmlOf("EDG teacher", edgCtx), /DR DRAWING/);
  assert.match(htmlOf("CEB BEE class"), /BASIC ELECTRICAL AND ELECTRONICS ENGINEERING/);
  assert.equal(answerLocally("MCPD kab hai", ctx), null, "an unpublished subject is not invented");
  assert.equal(intentOf("XYZ nonsense subject"), null);
});

test("section scope is respected without inventing a section", () => {
  const ceb = answerLocally("CEB timetable", ctx);
  assert.equal(ceb.intent, "WEEK_SCHEDULE");
  assert.match(ceb.html, /CEB/);
  assert.match(ceb.html, /BASIC ELECTRICAL/);
  const unknown = answerLocally("ZZZ timetable", ctx);
  assert.equal(unknown.intent, "WEEK_SCHEDULE");
  assert.doesNotMatch(unknown.html, /ZZZ/);
  assert.match(unknown.html, /CEA/);
});

test("follow-up memory reuses only published entities", () => {
  const first = answerLocally("who teaches physics", ctx);
  assert.equal(first.intent, "SUBJECT_TEACHERS");
  const follow = answerLocally("and where?", ctx, first.memory);
  assert.equal(follow.intent, "SUBJECT_ROOMS");
  assert.match(follow.html, /F108/);
  assert.equal(follow.memory.subject, "PHYSICS");
});

test("room questions never confuse a time with a room code", () => {
  assert.equal(roomCodeOf("which rooms are free at 2 pm?"), "");
  assert.equal(roomCodeOf("free at 9 am"), "");
  assert.equal(roomCodeOf("is F101 free now"), "F101");
  assert.equal(roomCodeOf("room f 102 khali"), "F102");
  assert.equal(intentOf("is F101 free now"), "ROOM_AVAILABILITY");
  assert.match(htmlOf("is F101 free now"), /F101/);
});

test("unknown entities are refused rather than fabricated", () => {
  const unknown = answerLocally("who teaches quantum basket weaving", ctx);
  assert.equal(unknown, null);
  const room = answerLocally("is Z101 free now", ctx);
  assert.equal(room.intent, "ROOM_AVAILABILITY");
  assert.match(room.html, /not in the loaded official room release|cannot verify/);
  const subjectDay = answerLocally("chemistry on Sunday", ctx);
  assert.match(subjectDay.html, /no published class|No class/i);
});

test("vocabulary lists cover the supported concepts", () => {
  assert.ok(VOCAB.next.includes("next"));
  assert.ok(VOCAB.freeRoom.includes("available"));
  assert.ok(VOCAB.exam.includes("datesheet"));
});
