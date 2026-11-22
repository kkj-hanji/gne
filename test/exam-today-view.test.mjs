import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import "../public/exam-domain.js";

const scripts = Object.fromEntries(await Promise.all(["exam-domain", "exam-desk", "end-sem-datesheet", "mse2-theory"].map(async (name) => [
  name,
  await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8")
])));
const emptyPublication = { schemaVersion: 1, revision: "empty", publishedAt: "", events: [], seats: [] };

function harness(initialContext, datesheet) {
  const { document } = parseHTML('<html><body><main id="today"><div id="today-exam-card" hidden></div><div id="today-timetable-content"></div><div id="exam-update-status"></div></main></body></html>');
  const storage = new Map();
  const context = {
    document,
    console,
    Intl,
    Date,
    Map,
    Set,
    JSON,
    URL,
    AbortController,
    Response,
    setTimeout,
    clearTimeout,
    setInterval() {},
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    async fetch(url) { return Response.json(String(url).includes("/api/datesheet") ? datesheet : emptyPublication); }
  };
  vm.createContext(context);
  for (const name of ["exam-domain", "exam-desk", "end-sem-datesheet", "mse2-theory"]) vm.runInContext(scripts[name], context);
  let now = { ...initialContext };
  context.CompassExamDesk.init({ context: () => now, ask() {} });
  context.CompassExamDesk.setData(emptyPublication);
  return {
    context,
    document,
    setNow(value) { now = { ...value }; context.CompassExamDesk.render(); }
  };
}

test("Today keeps the full selected exam date sheet visible through gaps and returns after the final paper", () => {
  const { context, document, setNow } = harness({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-19", minutes: 600 }, { tabs: [] });
  const card = document.getElementById("today-exam-card");
  const timetable = document.getElementById("today-timetable-content");
  assert.equal(card.hasAttribute("hidden"), true, "Auto keeps the timetable until three days before the first exam");
  assert.equal(timetable.hasAttribute("hidden"), false);

  setNow({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-20", minutes: 600 });
  assert.match(card.innerHTML, /Your exam date sheet/);
  assert.match(card.innerHTML, /Mathematics-I/);
  assert.match(card.innerHTML, /PPS/);
  assert.match(card.innerHTML, /MSE-II theory/);
  assert.equal(card.hasAttribute("hidden"), false);
  assert.equal(timetable.hasAttribute("hidden"), true);

  setNow({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-23", minutes: 600 });
  assert.equal(card.hasAttribute("hidden"), false);

  setNow({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-24", minutes: 600 });
  assert.equal(card.hasAttribute("hidden"), false, "the date sheet remains visible during a gap day");
  assert.equal(timetable.hasAttribute("hidden"), true);
  assert.match(card.textContent, /Completed/);
  assert.match(card.textContent, /PPS/);

  setNow({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-28", minutes: 749 });
  assert.equal(card.hasAttribute("hidden"), false);
  assert.match(card.textContent, /EDG/);
  setNow({ section: "CEA", subgroup: "", todayView: "auto", today: "2026-11-28", minutes: 750 });
  assert.equal(card.hasAttribute("hidden"), true);
  assert.equal(timetable.hasAttribute("hidden"), false);

  setNow({ section: "CEA", subgroup: "", todayView: "timetable", today: "2026-11-24", minutes: 600 });
  assert.equal(card.hasAttribute("hidden"), true, "a manual Timetable preference remains in control");
});

test("Today maps an upper-year timetable selection to its own branch and semester datesheet rows", async () => {
  const datesheet = {
    source: { url: "https://docs.google.com/spreadsheets/d/example/edit" },
    tabs: [
      { id: "ece", label: "ECE", gid: "42", entries: [{ date: "2026-12-04", subject: "Electronic Devices and Circuits", semesterNumber: 3, header: "III(M)", sessionStart: 540, sessionEnd: 720, sessionRaw: "9:00-12:00(Morning)" }] },
      { id: "cse", label: "CSE", gid: "43", entries: [{ date: "2026-12-04", subject: "Unrelated CSE paper", semesterNumber: 3, header: "III(M)", sessionStart: 540, sessionEnd: 720, sessionRaw: "9:00-12:00(Morning)" }] }
    ]
  };
  const { context, document } = harness({ section: "D2ECB1", subgroup: "", todayView: "auto", today: "2026-12-01", minutes: 600 }, datesheet);
  await context.CompassEseDatesheet.load();
  const card = document.getElementById("today-exam-card");
  assert.match(card.innerHTML, /Electronic Devices and Circuits/);
  assert.doesNotMatch(card.innerHTML, /Unrelated CSE paper/);
  assert.match(card.innerHTML, /Official date sheet/);
  assert.match(card.innerHTML, /9:00 AM/);
  context.CompassExamDesk.render();
  assert.equal(card.hasAttribute("hidden"), false);
});

test("untimed published exams stay visible for the exam date without inventing a time", async () => {
  const datesheet = {
    source: { url: "https://docs.google.com/spreadsheets/d/example/edit" },
    tabs: [{ id: "ece", label: "ECE", gid: "42", entries: [{ date: "2026-12-04", subject: "Untimed ECE paper", semesterNumber: 3, header: "III(M)" }] }]
  };
  const { context, document, setNow } = harness({ section: "D2ECB1", subgroup: "", todayView: "auto", today: "2026-12-04", minutes: 900 }, datesheet);
  await context.CompassEseDatesheet.load();
  const card = document.getElementById("today-exam-card");
  assert.match(card.innerHTML, /Untimed ECE paper/);
  assert.match(card.innerHTML, /Time not listed/);
  assert.equal(card.hasAttribute("hidden"), false);

  setNow({ section: "D2ECB1", subgroup: "", todayView: "auto", today: "2026-12-04", minutes: 1439 });
  assert.equal(card.hasAttribute("hidden"), false);
  setNow({ section: "D2ECB1", subgroup: "", todayView: "auto", today: "2026-12-05", minutes: 600 });
  assert.equal(card.hasAttribute("hidden"), true);
});
