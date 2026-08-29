// Run the app's own parseFetTimetable on the downloaded official HTML and print per-group weekly schedule
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../fet_groups.html", import.meta.url), "utf8");
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

const groups = process.argv.slice(2);
const { parseFetTimetable } = context.__parserTest;
const schedule = parseFetTimetable(html);
console.log("total entries:", schedule.length);
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
for (const g of groups) {
  console.log(`\n===== ${g} (as parsed by app) =====`);
  for (const d of DAYS) {
    const entries = schedule.filter((e) => e.group === g && e.day === d);
    console.log(`\n--- ${d} ---`);
    if (!entries.length) console.log("(empty)");
    for (const e of entries) {
      console.log(`  ${String(Math.floor(e.start / 60)).padStart(2, "0")}:${String(e.start % 60).padStart(2, "0")}  ${e.subject} [${e.type}] ${e.teacher} ${e.room} ${e.cohorts ? "(" + e.cohorts + ")" : ""}`);
    }
  }
}
