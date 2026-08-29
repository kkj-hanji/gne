// Strict comparison: official FET source vs app parser, for selected groups
// Source side uses linkedom DOM queries (like the browser) for exact text.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");

// ---- app parser (browser behavior: directCells filters TH) ----
const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*$/,
  "globalThis.__parserTest = { parseFetTimetable };"
);
const storage = new Map();
const context = vm.createContext({
  DOMParser: class {
    parseFromString(src) { return parseHTML(src).document; }
  },
  document: parseHTML("<!doctype html><html><body></body></html>").document,
  localStorage: {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k)
  }
});
vm.runInContext(sourceUnderTest, context);
const { parseFetTimetable } = context.__parserTest;
const appSchedule = parseFetTimetable(html);

// ---- independent source parser using linkedom DOM ----
const doc = parseHTML(html).document;
function textOf(el) {
  return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
}
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const sourceDays = {}; // group -> { day -> [{time,subject,teacher,room,cohorts}] }
[...doc.querySelectorAll("table")].forEach((table) => {
  const group = textOf(table.querySelector("caption .name"));
  const body = table.querySelector("tbody");
  if (!group || !body) return;
  const rows = [...body.querySelectorAll("tr")].filter((row) => row.closest("table") === table);
  const dayHeaders = [...table.querySelectorAll("thead .xAxis")].map((h) => textOf(h));
  if (dayHeaders.length < 5) return;
  const days = {};
  const activeSpans = Array(5).fill(0);
  rows.forEach((row, rowIndex) => {
    const time = textOf(row.querySelector("th.yAxis"));
    if (!time) return;
    const cells = [...row.querySelectorAll("td")].filter((c) => c.closest("table") === table);
    let nextCell = 0;
    for (let column = 0; column < 5; column++) {
      if (activeSpans[column] > 0) { activeSpans[column]--; continue; }
      const cell = cells[nextCell++];
      if (!cell) continue;
      const rowSpan = Number(cell.getAttribute("rowspan") || 1);
      const colSpan = Number(cell.getAttribute("colspan") || 1);
      const detailed = cell.querySelector("table.detailed");
      if (!cell.classList.contains("empty") && textOf(cell) && textOf(cell) !== "---") {
        const entries = [];
        if (detailed) {
          const cohortCells = detailed.querySelectorAll("tr.studentsset td");
          const subjectCells = detailed.querySelectorAll("tr.line1 td");
          const teacherCells = detailed.querySelectorAll("tr.teacher td");
          const roomCells = detailed.querySelectorAll("tr.room td");
          subjectCells.forEach((s, i) => {
            entries.push({
              subject: textOf(s.querySelector(".subject")),
              type: textOf(s.querySelector(".activitytag")),
              teacher: textOf(teacherCells[i]),
              room: textOf(roomCells[i]),
              cohorts: textOf(cohortCells[i])
            });
          });
        } else {
          entries.push({
            subject: textOf(cell.querySelector(".subject")),
            type: textOf(cell.querySelector(".activitytag")),
            teacher: textOf(cell.querySelector(".teacher")),
            room: textOf(cell.querySelector(".room")),
            cohorts: textOf(cell.querySelector(".studentsset"))
          });
        }
        for (let c = 0; c < colSpan; c++) {
          const day = dayHeaders[column + c];
          days[day] = days[day] || [];
          entries.forEach((e) => days[day].push({ time, ...e }));
        }
      }
      for (let s = 0; s < colSpan; s++) {
        if (rowSpan > 1) activeSpans[column + s] = rowSpan - 1;
      }
      column += colSpan - 1;
    }
  });
  sourceDays[group] = days;
});

const groups = process.argv.slice(2);
let issues = 0;
for (const g of groups) {
  const source = sourceDays[g];
  if (!source) { console.log(`== ${g}: group NOT in source`); continue; }
  const app = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [] };
  appSchedule.filter((e) => e.group === g).forEach((e) => (app[e.day] ||= []).push(e));

  console.log(`\n########## ${g} ##########`);
  for (const d of DAYS) {
    const s = (source[d] || []).map((e) => ({ time: e.time, subject: e.subject, teacher: e.teacher, room: e.room, cohorts: e.cohorts }));
    const a = (app[d] || []).map((e) => ({ time: `${String(Math.floor(e.start / 60)).padStart(2, "0")}:${String(e.start % 60).padStart(2, "0")}`, subject: e.subject, teacher: e.teacher, room: e.room, cohorts: e.cohorts }));
    const norm = (list) => list.map((e) => `${e.time} ${e.subject} | ${e.teacher === "Teacher not listed" ? "" : e.teacher} | ${e.room === "Room not listed" ? "" : e.room} | ${e.cohorts}`).sort();
    const sKey = norm(s), aKey = norm(a);
    const onlySrc = sKey.filter((x) => !aKey.includes(x));
    const onlyApp = aKey.filter((x) => !sKey.includes(x));
    if (!onlySrc.length && !onlyApp.length) {
      console.log(`  ${d}: OK (${sKey.length} classes)`);
    } else {
      issues++;
      console.log(`  ${d}: MISMATCH`);
      onlySrc.forEach((x) => console.log(`    [src-only] ${x}`));
      onlyApp.forEach((x) => console.log(`    [app-only] ${x}`));
    }
  }
}
console.log(`\nTotal mismatching days: ${issues}`);
