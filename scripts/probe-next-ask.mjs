/**
 * Developer probe for the Ask Compass language layer.
 *
 * Runs a fixed set of English, Hinglish, Punjabi, Hindi, SMS and typo queries
 * against synthetic verified data. It prints the chosen intent and a short
 * excerpt; it does not call the network. Run: node scripts/probe-next-ask.mjs
 */
import { answerLocally, buildAnswerContext } from "../next/engine/answer.js";
import { getIndiaNow } from "../next/engine/datetime.js";

const schedule = [
  { id: "1", group: "CEA", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR GAGANDEEP KAUR LOTEY", room: "F108", type: "L", cohorts: "" },
  { id: "2", group: "CEA", day: "Monday", start: 570, end: 630, subject: "PHYSICS", teacher: "DR PARAMJIT SINGH", room: "F108", type: "L", cohorts: "" },
  { id: "3", group: "CEA", day: "Monday", start: 630, end: 750, subject: "PHYSICS LAB", teacher: "ER. SATWANT SINGH", room: "S201", type: "P", cohorts: "CEA1,CEA2" },
  { id: "4", group: "CEA", day: "Tuesday", start: 810, end: 870, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "MS SIMRAN", room: "G101", type: "L", cohorts: "" },
  { id: "5", group: "CEA", day: "Wednesday", start: 510, end: 570, subject: "CHEMISTRY", teacher: "DR NEHA", room: "F110", type: "L", cohorts: "" },
  { id: "6", group: "CEB", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "DR OTHER", room: "F111", type: "L", cohorts: "" }
];

const roomSchedule = [
  { id: "r1", group: "F101", day: "Monday", start: 510, end: 570, subject: "X", teacher: "A", room: "F101", type: "L", cohorts: "" },
  { id: "r2", group: "F102", day: "Monday", start: 600, end: 660, subject: "Y", teacher: "B", room: "F102", type: "L", cohorts: "" },
  { id: "r3", group: "G101", day: "Monday", start: 510, end: 570, subject: "Z", teacher: "C", room: "G101", type: "L", cohorts: "" }
];

const datesheet = {
  checkedAt: "2026-11-07T13:43:03.603Z",
  tabs: [{ label: "Applied Sciences", entries: [{ date: "2026-11-20", subject: "PHYSICS" }, { date: "2026-11-23", subject: "MATH I" }] }]
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

const queries = [
  "What is my next class?",
  "mera agla class kab hai",
  "kaha hai physics ka class",
  "tommorow ka timetable batao",
  "PPS ka teacher kaun hai",
  "kithay hai F101 room",
  "wt is my nxt cls",
  "free rooms at 2pm khali",
  "sir paramjit ka schedule",
  "whole week timetable",
  "classs shedule plz",
  "physics kal",
  "period 2 free?",
  "is F101 free now",
  "what class do i have",
  "when do i finish today",
  "mera section kya hai",
  "exam kab hai",
  "holiday tomorrow?",
  "my attendance",
  "my next class and free rooms today",
  "who teaches pps",
  "CEB timetable",
  "CEA1 timetable",
  "गुरुवार की timetable",
  "ਕੱਲ੍ਹ ਦੀ ਟਾਈਮਟੇਬਲ",
  "physcs teacher",
  "ticher of chemistry",
  "room f 108 free?",
  "where is math lab",
  "free labs right now",
  "and tomorrow?",
  "who teaches it?",
  "what about its room?"
];

let failures = 0;
for (const query of queries) {
  const result = answerLocally(query, ctx);
  const excerpt = result ? result.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 96) : "";
  console.log(`${result ? result.intent.padEnd(22) : "NULL".padEnd(22)} ${query}${excerpt ? ` → ${excerpt}` : ""}`);
  if (!result) failures += 1;
}

// Follow-up memory uses the previous verified entities only.
const first = answerLocally("who teaches physics", ctx);
const follow = answerLocally("and where?", ctx, first?.memory);
console.log(`\nfollow-up: ${follow?.intent} → ${follow?.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 90)}`);

console.log(`\n${queries.length - failures}/${queries.length} queries handled locally.`);
