import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

// Run actual form handlers with a DOM, without startup refresh timers or an
// external inference service. This replaces the unasserted, leaking smoke script.
test("chat form renders every compound answer and rejects invalid dates", async () => {
  const { document, window } = parseHTML(await readFile("public/index.html", "utf8"));
  const storage = new Map();
  const context = vm.createContext({
    document, console, Date, Intl, URL, setTimeout, clearTimeout,
    window: { setTimeout, clearTimeout, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    location: { hash: "", search: "", href: "http://localhost/" },
    fetch: async () => { throw new Error("Offline fixture"); }
  });
  for (const name of ["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js", "brain-v2.js", "exam-schedule.js", "academic-calendar.js", "schedule-analysis.js"]) vm.runInContext(await readFile(`public/${name}`, "utf8"), context);
  const source = (await readFile("public/app.js", "utf8")).replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "");
  vm.runInContext(source, context);
  vm.runInContext('state.nowOverride = "2026-09-03T04:30:00Z"; initEvents();', context);
  document.getElementById("chat-window").scrollTo = () => {};
  const input = document.getElementById("question-input");
  const submit = async question => {
    document.getElementById("chat-window").innerHTML = "";
    input.value = question;
    input.dispatchEvent(new window.Event("input"));
    const enter = new window.Event("keydown", { cancelable: true });
    Object.defineProperty(enter, "key", { value: "Enter" });
    input.dispatchEvent(enter);
    assert.equal(input.value, question, "Enter without selecting a suggestion must preserve the input");
    document.getElementById("question-form").dispatchEvent(new window.Event("submit", { cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(document.querySelector(".chat-bubble.user")?.textContent, question, "Display exactly the submitted question");
    assert.equal(document.querySelectorAll(".chat-bubble.user").length, 1);
    return document.getElementById("chat-window").textContent;
  };
  const compound = await submit("who built this website and is tomorrow holiday");
  assert.match(compound, /Kaushik Jain/);
  assert.match(compound, /Janam Ashtami|September 4|4 September/);
  const invalid = await submit("ECB1 timetable 31/02/2026");
  assert.match(invalid, /check the date|does not exist/);
  assert.doesNotMatch(invalid, /undefined|\[object Object\]|NaN/);
  for (const q of ["today date", "today day", "aaj ki date kya hai", "what day is tomorrow"]) {
    const answer = await submit(q);
    assert.match(answer, /September 2026/);
    assert.doesNotMatch(answer, /timetable|schedule/i);
  }
  vm.runInContext(`
    state.sourceRegistry = { sources: ["teachers", "rooms"].map(id => ({ id, url: "https://appsc.gndec.ac.in/" + id, contentHash: "fixture" })) };
    state.rosterCache = { records: [{name: "CHAHAT JAIN", section: "CSA", subsection: "CSA2", branch: "CS"}] };
    state.timetableViews.set("teachers", { revision: "fixture", schedule: [{ id: "faculty", group: "DR. CHAHAT JAIN", subject: "FACULTY ONLY COURSE", teacher: "DR. CHAHAT JAIN", room: "F113", day: "Monday", start: 570, end: 630, type: "L" }] });
    state.timetableViews.set("rooms", { revision: "fixture", schedule: [{ id: "room", group: "F113", subject: "ROOM ONLY COURSE", teacher: "ANOTHER TEACHER", room: "F113", day: "Monday", start: 630, end: 690, type: "L" }] });
  `, context);
  const teacher = await submit("teacher timetable dr. chahat jain");
  assert.match(teacher, /FACULTY ONLY COURSE/);
  assert.doesNotMatch(teacher, /CSA2|ROOM ONLY COURSE/);
  assert.match(await submit("room F113 timetable"), /ROOM ONLY COURSE/);
  const unknownRoom = await submit("room F114 timetable");
  assert.doesNotMatch(unknownRoom, /ROOM ONLY COURSE|FACULTY ONLY COURSE|CSA2/);
  vm.runInContext('state.timetableViews.delete("teachers");', context);
  const failedTeacher = await submit("teacher timetable dr. chahat jain");
  assert.match(failedTeacher, /unavailable/i);
  assert.doesNotMatch(failedTeacher, /CSA2|FACULTY ONLY COURSE/);
  vm.runInContext('state.selectedGroup = "ECB"; state.nowOverride = "2026-09-15T10:00:00Z";', context);
  for (const question of ["my exam timetable", "mera next paper kab hai", "EC B EDG exam time"]) {
    const answer = await submit(question);
    assert.match(answer, /MSE-I/);
    assert.match(answer, /User-supplied/);
    assert.match(answer, question.includes("EDG") ? /11:00 AM–12:30 PM/ : /12:45 PM/);
    assert.doesNotMatch(answer, /FACULTY ONLY COURSE|ROOM ONLY COURSE|Checking.*roster/);
  }
  const examsAndDate = await submit("my exam date sheet and what is today date");
  assert.match(examsAndDate, /MSE-I/);
  assert.match(examsAndDate, /India calendar date/);
  assert.match(await submit("first year final exams"), /2026-12-02 onwards/);
  assert.match(await submit("room F113 timetable next week"), /2026-09-21.*ROOM ONLY COURSE/s);
  assert.match(await submit("how many classes in room F113 next week"), /1 scheduled class entries.*60 minutes/s);
  assert.doesNotMatch(await submit("who created this website"), /\bkkj\b|admin|unlock|token/i);
  vm.runInContext('renderReferenceLinks();', context);
  assert.ok(document.querySelector('#reference-links a[href="/data/mse1-sem1-2026-09-14.pdf"]'));
  assert.equal(document.querySelectorAll(".thinking").length, 0);
});
