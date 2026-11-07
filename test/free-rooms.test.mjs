import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

const source = await readFile(new URL("../public/free-rooms.js", import.meta.url), "utf8");

function roomsContext() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.CompassFreeRooms;
}

test("free-room grouping keeps published labels and never invents rooms", () => {
  const free = roomsContext();
  const grouped = free.groupRooms(["F101", "F102", "G1", "S203", "A6 (AUTOMOBILE BLOCK)", "COMP LAB CSE DEPT", "DBMS LAB IT DEPT", "", null, "F101"]);
  assert.equal(grouped.total, 7);
  assert.deepEqual(Array.from(grouped.groups, (group) => [group.label, group.count]), [
    ["F block", 2],
    ["G block", 1],
    ["S block", 1],
    ["A block", 1],
    ["Labs and named rooms", 2]
  ]);
  assert.deepEqual(Array.from(grouped.groups[0].rooms), ["F101", "F102"]);
  assert.ok(grouped.groups.flatMap((group) => group.rooms).includes("COMP LAB CSE DEPT"));
});

test("free-room ordering is numeric inside a block and stable for unknown labels", () => {
  const free = roomsContext();
  const grouped = free.groupRooms(["F119", "F9", "F101", "SEMINAR HALL"]);
  assert.deepEqual(Array.from(grouped.groups[0].rooms), ["F9", "F101", "F119"]);
  assert.equal(grouped.groups.at(-1).label, "Other published rooms");
  assert.equal(free.zoneOf("COMP LAB EE"), "Labs and named rooms");
  assert.equal(free.zoneOf("M2"), "Other published rooms");
});

test("free-room summaries and area questions stay within published areas", () => {
  const free = roomsContext();
  assert.match(free.summaryText(["F101", "F102", "G1"]), /3 free rooms: F block \(2\) · G block \(1\)/);
  assert.equal(free.summaryText([]), "No published room is free at this time.");
  assert.equal(free.zoneFromQuestion("free rooms in S block at 2 PM"), "S block");
  assert.equal(free.zoneFromQuestion("empty labs right now"), "Labs and named rooms");
  assert.equal(free.zoneFromQuestion("free rooms now"), "");
});

test("Ask Compass lists every free room grouped by its published block", () => {
  const { api } = createAppHarness();
  api.state.timetableViews.set("rooms", {
    revision: "test",
    schedule: [
      { group: "F101", day: "Monday", start: 600, end: 720, subject: "MATH I", teacher: "T", room: "F101", type: "L", cohorts: "CSA" },
      { group: "F102", day: "Monday", start: 600, end: 660, subject: "MATH I", teacher: "T", room: "F102", type: "L", cohorts: "CSB" },
      { group: "F103", day: "Monday", start: 660, end: 720, subject: "MATH I", teacher: "T", room: "F103", type: "L", cohorts: "CSC" },
      { group: "G1", day: "Monday", start: 660, end: 720, subject: "PHYSICS", teacher: "T", room: "G1", type: "L", cohorts: "MEB" },
      { group: "S203", day: "Monday", start: 600, end: 660, subject: "PPS", teacher: "T", room: "S203", type: "P", cohorts: "ITB" },
      { group: "A6 (AUTOMOBILE BLOCK)", day: "Monday", start: 660, end: 720, subject: "WORKSHOP", teacher: "T", room: "A6 (AUTOMOBILE BLOCK)", type: "P", cohorts: "MEA" },
      { group: "COMP LAB CSE DEPT", day: "Monday", start: 600, end: 660, subject: "OS LAB", teacher: "T", room: "COMP LAB CSE DEPT", type: "P", cohorts: "CSC" }
    ]
  });
  const answer = api.roomAvailabilityAnswer("free rooms on Monday at 11 AM");
  assert.match(answer, /3 of 7 published rooms have no class listed/);
  assert.match(answer, /F102/);
  assert.match(answer, /S203/);
  assert.match(answer, /COMP LAB CSE DEPT/);
  assert.match(answer, /F block/);
  assert.match(answer, /Labs and named rooms/);
  assert.doesNotMatch(answer, /F101/);
  assert.doesNotMatch(answer, /G1</);
  assert.doesNotMatch(answer, /Showing the first 40/);
  assert.match(answer, /official college-wide room timetable/);
});
