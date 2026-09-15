import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

const files = ["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js", "brain-v2.js", "exam-schedule.js", "academic-calendar.js", "schedule-analysis.js", "app.js"];
const sources = await Promise.all(files.map((file) => readFile(new URL(`../public/${file}`, import.meta.url), "utf8")));
const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

function harness() {
  const { document, window } = parseHTML(html);
  const storage = new Map();
  let fetches = 0;
  const context = vm.createContext({
    document, console, Date, Intl, URL, Event: window.Event, setTimeout, clearTimeout,
    window: { setTimeout, clearTimeout, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: (key) => storage.delete(key) },
    location: { hash: "#chat", search: "", href: "http://localhost/#chat" },
    fetch: async () => { fetches++; throw new Error("Card must not fetch a roster or faculty directory"); }
  });
  for (let i = 0; i < sources.length; i++) vm.runInContext(files[i] === "app.js" ? sources[i].replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "") : sources[i], context);
  vm.runInContext(`
    globalThis.api = { state, answerWithoutAi, legacyAnswerWithoutAi, prepareCompassQuestion, namedPersonTimetableRequest, isTomorrowCardQuestion };
    state.nowOverride = "2026-09-15T18:00:00Z";
    state.selectedGroup = "ECB";
    state.selectedSubgroup = "ECB1";
    state.groups = ["ECB", "CSD"];
    state.schedule = [
      { id: "own", group: "ECB", cohorts: "ECB1", day: "Wednesday", start: 570, end: 630, subject: "OWN PHYSICS", room: "G6", teacher: "OWN TEACHER", type: "L" },
      { id: "sibling", group: "ECB", cohorts: "ECB2", day: "Wednesday", start: 570, end: 630, subject: "SIBLING LAB", room: "F113", teacher: "OTHER TEACHER", type: "P" },
      { id: "other", group: "CSD", cohorts: "CSD2", day: "Wednesday", start: 630, end: 690, subject: "OTHER SECTION", room: "F114", teacher: "ANOTHER TEACHER", type: "L" }
    ];
    buildScheduleIndex();
    initEvents();
    renderQuestionChips();
  `, context);
  document.getElementById("chat-window").scrollTo = () => {};
  return { api: context.api, context, document, window, fetches: () => fetches };
}

test("clearing chat then clicking the rendered Tomorrow card uses the selected subsection without lookup", async () => {
  const { api, context, document, window, fetches } = harness();
  vm.runInContext('state.queryConversation = { target: "CSD2", at: Date.now() }; state.rosterLookupConversation = { name: "Simple Card" };', context);
  document.getElementById("clear-chat").click();
  assert.equal(api.state.queryConversation, null);
  assert.equal(api.state.rosterLookupConversation, null);
  const chip = document.querySelector('.question-chips [data-quick="Show tomorrow as a simple card"]');
  assert.ok(chip, "The actual fresh-chat suggestion exists");
  chip.dispatchEvent(new window.Event("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(document.querySelector(".chat-bubble.user")?.textContent, "Show tomorrow as a simple card");
  const answer = document.querySelector(".chat-bubble.assistant");
  assert.ok(answer.querySelector(".answer-day-card"));
  assert.match(answer.textContent, /16 Sept/);
  assert.match(answer.textContent, /9:30 AM-10:30 AM/);
  assert.match(answer.textContent, /OWN PHYSICS/);
  assert.match(answer.textContent, /G6 · OWN TEACHER/);
  assert.doesNotMatch(answer.textContent, /Simple Card|student|faculty|SIBLING LAB|OTHER SECTION/);
  assert.equal(fetches(), 0);
  assert.equal(api.state.selectedGroup, "ECB");
  assert.equal(api.state.selectedSubgroup, "ECB1");
});

test("personal card wording stays out of name parsing across every Brain mode and legacy fallback", () => {
  const { api } = harness();
  for (const mode of ["legacy", "v12", "v2", "v22"]) {
    api.state.settings.brainMode = mode;
    for (const query of ["Show tomorrow as a simple card", "tomorrow card", "Please show tomorrow timetable in card format", "kal ka timetable card", "Show tomorrow as a simple card timetable"]) {
      assert.equal(api.namedPersonTimetableRequest(query), null, query);
      assert.match(api.answerWithoutAi(query), /answer-day-card/);
      assert.match(api.legacyAnswerWithoutAi(query), /OWN PHYSICS/);
    }
  }
  assert.equal(api.prepareCompassQuestion("Show tomorrow as a simple card"), "show tomorrow as a simple card");
  assert.equal(api.isTomorrowCardQuestion("teacher Mohitveer tomorrow timetable card"), false);
  assert.equal(api.isTomorrowCardQuestion("room G6 tomorrow timetable card"), false);
  assert.ok(api.namedPersonTimetableRequest("Mohitveer Singh tomorrow timetable"));
});

test("empty data, changed device selection and India midnight remain safe", () => {
  const { api } = harness();
  api.state.selectedGroup = "CSD";
  api.state.selectedSubgroup = "CSD2";
  const selected = api.answerWithoutAi("tomorrow card");
  assert.match(selected, /OTHER SECTION/);
  assert.doesNotMatch(selected, /OWN PHYSICS/);
  api.state.nowOverride = "2026-09-15T19:00:00Z"; // 16 September in India: tomorrow is Thursday.
  assert.match(api.answerWithoutAi("tomorrow card"), /17 Sept/);
  assert.match(api.answerWithoutAi("tomorrow card"), /No classes are listed/);
  api.state.selectedGroup = "";
  assert.match(api.answerWithoutAi("Show tomorrow as a simple card"), /Choose your timetable first/);
  api.state.selectedGroup = "ECB";
  api.state.schedule = [];
  assert.match(api.answerWithoutAi("tomorrow card"), /Load the official timetable/);
});
