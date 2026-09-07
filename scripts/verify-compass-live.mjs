// Explicit, read-only live verification. Ordinary tests and user questions
// never run this network audit. No roster records are printed or saved.
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { createAppHarness } from "./stress-probe-harness.mjs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const pending = [];
let registry;
await worker.scheduled(null, {
  SOURCE_REGISTRY: { get: async () => null, put: async (_key, value) => { registry = JSON.parse(value); } }
}, { waitUntil: promise => pending.push(promise) });
await Promise.all(pending);
assert.ok(registry?.version, "Official source discovery must produce a validated registry");
const { api } = createAppHarness();
api.state.nowOverride = "2026-09-07T04:00:00Z";
api.state.rosterCache = null;
api.state.facultyCache = null;
api.state.metadata = { version: registry.version };
for (const id of ["groups", "teachers", "rooms", "subjects", "years", "subgroups"]) {
  const source = registry.sources[id];
  assert.equal(source.verified, true, id);
  const response = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.ok, true, id);
  const rows = api.sanitizeSchedule(api.parseFetTimetable(await response.text(), id));
  assert.ok(rows.length, `${id} must parse real FET rows`);
  api.state.timetableViews.set(id, { schedule: rows, revision: source.contentHash });
  if (id === "groups") api.state.schedule = rows;
  console.log(`${id}: ${rows.length} valid rows, ${source.sourceFooter || registry.version}`);
}
api.state.groups = [...new Set(api.state.schedule.map(row => row.group))];
api.state.selectedGroup = "ECB";
api.state.selectedSubgroup = "ECB1";
api.buildScheduleIndex();
const rosterRecords = [];
for (const [branch, source] of Object.entries(registry.studentSectionSources)) {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(20000) });
  const pdf = await getDocument({ data: new Uint8Array(await response.arrayBuffer()), verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    const rows = new Map();
    for (const item of content.items.filter(item => item.str)) {
      const y = Math.round(item.transform[5] * 10) / 10;
      rows.set(y, [...(rows.get(y) || []), { x: item.transform[4], text: item.str }]);
    }
    pages.push([...rows.entries()].sort(([a], [b]) => b - a).map(([, items]) => items.sort((a, b) => a.x - b.x).map(item => item.text).join("\t")).join("\n"));
  }
  const records = api.parseStudentSectionText(pages.join("\n\f\n"), branch);
  assert.ok(records.length, `${branch} must have parsed official roster records`);
  rosterRecords.push(...records);
  await pdf.destroy();
  console.log(`${branch}: official roster parsed (${records.length} records); identifiers omitted from audit output.`);
}
api.state.rosterCache = { records: rosterRecords, version: registry.version, unavailableBranches: [] };
// Exercise every published caption through the application, checking facts
// against source rows while keeping the active profile unchanged.
let checkedQueries = 0;
const failures = [];
for (const [view, prefix] of [["teachers", "teacher"], ["rooms", "room"], ["subjects", "subject"], ["years", "programme"], ["groups", "section"], ["subgroups", "subsection"]]) {
  const rows = api.state.timetableViews.get(view).schedule;
  const captions = [...new Set(rows.map(row => row.group))];
  for (const caption of captions) {
    for (const day of ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) {
      const question = `${prefix} timetable ${caption}${day ? ` ${day}` : ""}`;
      const answer = api.answerWithoutAi(question);
      const expected = rows.filter(row => row.group === caption && (!day || row.day === day));
      const plain = answer.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&");
      if (expected.length) {
        if (!plain.includes(caption) || expected.some(row => !plain.includes(row.subject)) || (answer.match(/<br\s*\/>/g) || []).length !== expected.length) failures.push(question);
      } else if (!/No matching classes are listed/.test(answer)) failures.push(question);
      assert.equal(api.state.selectedSubgroup, "ECB1", "Queries must not change the active selection");
      checkedQueries++;
    }
  }
  console.log(`${view}: checked ${captions.length} official captions across weekly and five daily queries.`);
}
console.log(`Official entity matrix: ${checkedQueries} queries; ${failures.length} failures.`);
if (failures.length) console.log(failures.slice(0, 30));
assert.equal(failures.length, 0, "Every exact published timetable caption must resolve to its own rows");
const chahat = api.answerWithoutAi("teacher timetable dr. chahat jain");
assert.doesNotMatch(chahat, /CSA2|came from the current official GNDEC roster/);
console.log(`Reported faculty query: ${chahat.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 230)}`);
for (const [code, day] of [["ECB1", "Monday"], ["CSD2", "Tuesday"], ["RAI", "Friday"]]) {
  const answer = api.answerWithoutAi(`${code} ${day}`);
  assert.ok(answer.includes(code) && answer.includes(day), code);
  assert.doesNotMatch(answer, /could not verify|cannot verify|NaN|undefined/);
}
for (const question of ["mohitveeer kal tt", "Mohitveer Singh tomorrow", "A9 timetable today", "compare ECB1 CSD2 Tuesday"]) {
  const answer = api.answerWithoutAi(question);
  assert.ok(answer.trim(), question);
  assert.doesNotMatch(answer, /could not verify|cannot verify|NaN|undefined/, question);
  if (question.includes("Mohitveer") || question.includes("mohitveeer")) assert.match(answer, /Mohitveer Singh.*CSD2/);
  if (question.startsWith("A9")) { assert.match(answer, /Monday/); assert.doesNotMatch(answer, /Name a verified room/); }
  if (question.startsWith("compare")) assert.match(answer, /Compared: ECB1 and CSD2/);
  console.log(`${question}: ${answer.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 170)}`);
}
console.log(`Verified current official release: ${registry.version}; ${Object.keys(registry.studentSectionSources).length} roster sources validated.`);
