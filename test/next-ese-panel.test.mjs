import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");

function evaluateHelper(name, endMarker) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(`\nfunction ${endMarker}(`, start);
  assert.ok(start >= 0 && end > start, `${name} must remain defined in the Next app`);
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${app.slice(start, end)}\nglobalThis.result = ${name};`, context);
  return context.result;
}

test("ESE picker uses the selected semester's Full Time schedule and falls back to published Part Time", () => {
  const selectSchedule = evaluateHelper("selectedProvisionalEseRows", "filteredProvisionalEseRows");
  const data = { programmes: [
    { id: "2,34", studyMode: "Full Time", entries: [{ semesterNumber: 1, date: "2026-12-01", subject: "Full Time paper" }] },
    { id: "2,34", studyMode: "Part Time", entries: [{ semesterNumber: 4, date: "2026-12-21", subject: "Part Time paper" }] }
  ] };

  const semesterOne = selectSchedule(data, "2,34", "1");
  assert.equal(semesterOne.mode, "Full Time");
  assert.equal(semesterOne.rows[0].subject, "Full Time paper");

  const semesterFour = selectSchedule(data, "2,34", "4");
  assert.equal(semesterFour.mode, "Part Time");
  assert.equal(semesterFour.rows[0].subject, "Part Time paper");
});

test("ESE branch detection preserves the official lateral-entry programme instead of using the regular branch schedule", () => {
  const profileCode = evaluateHelper("profileEseProgrammeCode", "preferredEseProgramme");
  assert.equal(profileCode("B.Tech.(Civil Engineering - Lateral Entry (for Working Professional))"), "CE-LE-WP");
  assert.equal(profileCode("B.Tech.(Mechanical Engineering - Lateral Entry (for Working Professional))"), "ME-LE-WP");
});
