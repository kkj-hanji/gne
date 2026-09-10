import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

// Representative cells from GNDEC's 10 September 2026 FET 7.10.4 export.
// Low HTML detail has no subject/teacher/room CSS markers.
function table(name, firstCell, secondRow = "<td>---</td>") {
  return `<table><caption><span class="name">${name}</span></caption><thead><tr><td></td>${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"].map(day => `<th class="xAxis">${day}</th>`).join("")}</tr></thead><tbody><tr><th class="yAxis">08:30</th>${firstCell}<td>---</td><td>---</td><td>---</td><td>---</td></tr><tr><th class="yAxis">09:30</th>${secondRow}<td>---</td><td>---</td><td>---</td><td>---</td></tr><tr><th class="yAxis">10:30</th><td>---</td><td>---</td><td>---</td><td>---</td><td>---</td></tr></tbody></table>`;
}
const detail = rows => `<td><table class="detailed">${rows.map(row => `<tr>${row.map(value => `<td class="detailed">${value}</td>`).join("")}</tr>`).join("")}</table></td>`;
const fields = row => [row.subject, row.type, row.teacher, row.room, row.cohorts];

test("plain group and subgroup exports preserve rowspans and absent teachers", () => {
  const { api } = createAppHarness();
  for (const view of ["groups", "subgroups"]) {
    const html = table("MEA", '<td rowspan="2">MEA, RAI<br>MANUFACTURING PRACTICES P<br>WORKSHOPS<br></td>', "");
    const rows = api.parseFetTimetable(html, view);
    assert.equal(rows.length, 1);
    assert.equal(rows.unparsedCells, 0);
    assert.deepEqual(fields(rows[0]), ["MANUFACTURING PRACTICES", "P", "Teacher not listed", "WORKSHOPS", "MEA, RAI"]);
    assert.equal(rows[0].start, 510);
    assert.equal(rows[0].end, 630);
  }
});

test("plain simultaneous classes keep each subject, teacher, room and cohort aligned", () => {
  const { api } = createAppHarness();
  const html = table("MEA", detail([["MEA1", "MEA2"], ["PROGRAMMING FOR PROBLEM SOLVING P", "ENGG DRAWING AND GRAPHICS P"], ["ER. MANMOHAN SINGH", "DR. DEEPINDER SINGH"], ["CGL LAB ME DEPT", "S202"]]));
  const rows = api.parseFetTimetable(html);
  assert.equal(rows.length, 2);
  assert.equal(rows.unparsedCells, 0);
  assert.deepEqual(fields(rows.find(row => row.cohorts === "MEA1")), ["PROGRAMMING FOR PROBLEM SOLVING", "P", "ER. MANMOHAN SINGH", "CGL LAB ME DEPT", "MEA1"]);
  assert.deepEqual(fields(rows.find(row => row.cohorts === "MEA2")), ["ENGG DRAWING AND GRAPHICS", "P", "DR. DEEPINDER SINGH", "S202", "MEA2"]);
});

test("faculty, room, subject and programme formats use their own field order", () => {
  const { api } = createAppHarness();
  const fixtures = [
    ["teachers", "DR D S PATHANIA", "<td>ECB1<br>MATH I T<br>F113<br></td>", ["MATH I", "T", "DR D S PATHANIA", "F113", "ECB1"]],
    ["teachers", "DR PARAMJIT SINGH", "<td>DR PARAMJIT SINGH, DR MANDEEP KAUR<br>MEA1<br>PHYSICS P<br>PHY LAB<br></td>", ["PHYSICS", "P", "DR PARAMJIT SINGH, DR MANDEEP KAUR", "PHY LAB", "MEA1"]],
    ["rooms", "F101", "<td>D2EEA<br>Ms. KIRAN<br>APP MATH EE L<br></td>", ["APP MATH EE", "L", "Ms. KIRAN", "F101", "D2EEA"]],
    ["subjects", "PHYSICS", detail([["P"], ["EEA2"], ["DR JASPREET SINGH, Ms. KOMALPREET KAUR"], ["PHY LAB"]]), ["PHYSICS", "P", "DR JASPREET SINGH, Ms. KOMALPREET KAUR", "PHY LAB", "EEA2"]],
    ["years", "BTECH FIRST YEAR PHYSICS GROUP", detail([["MEA, RAI"], ["MANUFACTURING PRACTICES P"], [""], ["WORKSHOPS"]]), ["MANUFACTURING PRACTICES", "P", "Teacher not listed", "WORKSHOPS", "MEA, RAI"]]
  ];
  for (const [view, caption, cell, expected] of fixtures) {
    const rows = api.parseFetTimetable(table(caption, cell), view);
    assert.equal(rows.length, 1, view);
    assert.equal(rows.unparsedCells, 0, view);
    assert.deepEqual(fields(rows[0]), expected, view);
  }
});

test("empty fields and optional activity tags do not shift or invent facts", () => {
  const { api } = createAppHarness();
  const subject = "MENTORING CLASS &amp; PROFESSIONAL DEVELOPMENT";
  const rows = api.parseFetTimetable(table("CSF", detail([["CSF1", "CSF2"], [`${subject} P`, subject], ["ER. KAJAL CHUGH", "ER. LOVEJEET SINGH"]])));
  assert.equal(rows.length, 2);
  assert.equal(rows.unparsedCells, 0);
  assert.ok(rows.every(row => row.room === "Room not listed"));
  assert.equal(rows.find(row => row.cohorts === "CSF2").type, "");
});

test("unrecognized and partially readable sources cannot replace saved data", () => {
  const { api, context } = createAppHarness();
  const read = vm.runInContext("readVerifiedFetTimetable", context);
  const before = JSON.stringify(api.state.schedule);
  const partial = table("ECB", "<td>PHYSICS L<br>DR JASMEET KAUR<br>G6<br></td>", "<td>Unknown future export layout</td>");
  assert.equal(api.parseFetTimetable(partial).unparsedCells, 1);
  assert.throws(() => read(partial), /could not be read completely/);
  assert.throws(() => read("<html>Maintenance</html>"), /saved timetable/);
  assert.equal(JSON.stringify(api.state.schedule), before);
});

test("HTTP 200 with unreadable HTML retries both previous views and preserves release metadata", async () => {
  const { api, context } = createAppHarness();
  const load = vm.runInContext("loadReadableTimetableRelease", context);
  const calls = [];
  context.fetch = async url => {
    calls.push(url);
    const fallback = url.includes("fallback=1");
    return new Response(fallback ? table("ECB", "<td>PHYSICS L<br>DR JASMEET KAUR<br>G6<br></td>") : "<html>Unknown export</html>", { headers: {
      "X-GNDEC-Version": fallback ? "07-09-2026" : "10-09-2026",
      "X-GNDEC-Source-Footer": fallback ? "FET 7.6.4" : "FET 7.10.4",
      ...(fallback ? { "X-GNDEC-Fallback": "previous-verified" } : {})
    } });
  };
  const before = JSON.stringify(api.state.schedule);
  const release = await load({ version: "10-09-2026", sources: [] });
  assert.equal(release.schedule.length, 1);
  assert.equal(release.subgroupSchedule.length, 1);
  assert.ok(release.sourceInfo.fallback);
  assert.equal(release.sourceInfo.version, "07-09-2026");
  assert.equal(calls.length, 4);
  assert.ok(calls.slice(2).every(url => url.includes("fallback=1")));
  assert.equal(JSON.stringify(api.state.schedule), before, "retrieval must not mutate profile/timetable state");
  context.fetch = async () => new Response("<html>Unreadable</html>");
  await assert.rejects(load({ sources: [] }), /saved timetable is unchanged/);
  assert.equal(JSON.stringify(api.state.schedule), before);
});
