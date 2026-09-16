import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";

test("Timetable and Profile selectors share validated subsection state and update answers", async () => {
  const { document, window } = parseHTML(await readFile("public/index.html", "utf8"));
  // Linkedom exposes select.value as getter-only; emulate browser form state.
  for (const select of document.querySelectorAll("select")) Object.defineProperty(select, "value", { writable: true, value: "" });
  const storage = new Map();
  const context = vm.createContext({ document, console, Date, Intl, URL, setTimeout, clearTimeout,
    window: { setTimeout, clearTimeout, addEventListener() {}, matchMedia: () => ({ matches: false }) },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) },
    location: { hash: "#timetable", search: "", href: "http://localhost/#timetable" },
    fetch: () => { throw new Error("Selection must use loaded data"); }
  });
  for (const file of ["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js", "brain-v2.js", "exam-schedule.js", "academic-calendar.js", "schedule-analysis.js", "app.js"]) {
    const source = await readFile(`public/${file}`, "utf8");
    vm.runInContext(file === "app.js" ? source.replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "") : source, context);
  }
  vm.runInContext(`
    globalThis.api = {state, hydrateGroupControls, answerWithoutAi, changeTimetableSelection};
    state.nowOverride = "2026-09-16T04:00:00Z";
    state.groups = ["ECB", "CSD", "RAI"];
    state.selectedGroup = "ECB"; state.selectedSubgroup = "ECB1";
    state.student = {name:"TEST STUDENT", crn:"1234567", branch:"EC", section:"ECB", subsection:"ECB1", mentor:"TEST MENTOR"};
    state.schedule = [
      {id:"one",group:"ECB",cohorts:"ECB1",day:"Wednesday",start:570,end:630,subject:"FIRST LAB",teacher:"TEACHER",room:"A9",type:"P"},
      {id:"two",group:"ECB",cohorts:"ECB2",day:"Wednesday",start:570,end:630,subject:"SECOND LAB",teacher:"TEACHER",room:"A10",type:"P"},
      {id:"shared",group:"ECB",cohorts:"ECB",day:"Wednesday",start:630,end:690,subject:"SHARED THEORY",teacher:"TEACHER",room:"A9",type:"L"},
      {id:"cs",group:"CSD",cohorts:"CSD2",day:"Wednesday",start:570,end:630,subject:"CS CLASS",teacher:"TEACHER",room:"A9",type:"L"},
      {id:"rai",group:"RAI",cohorts:"RAI",day:"Wednesday",start:570,end:630,subject:"RAI CLASS",teacher:"TEACHER",room:"A9",type:"L"}
    ];
    buildScheduleIndex(); hydrateGroupControls(); initEvents();
  `, context);
  const { api } = context;
  const profile = JSON.stringify(api.state.student);
  const select = id => document.getElementById(id);
  const change = (id, value) => { select(id).value = value; select(id).dispatchEvent(new window.Event("change")); };
  const choices = () => [...select("timetable-subgroup").querySelectorAll("option")].map(option => option.getAttribute("value"));
  assert.deepEqual(choices(), ["", "ECB1", "ECB2"]);
  assert.equal(select("timetable-subgroup").value, "ECB1");
  change("timetable-subgroup", "ECB2");
  assert.equal(select("subgroup-select").value, "ECB2");
  assert.equal(api.state.selectedSubgroup, "ECB2");
  assert.match(select("week-table").textContent, /SECOND LAB|SHARED THEORY/);
  assert.doesNotMatch(select("week-table").textContent, /FIRST LAB/);
  const answer = api.answerWithoutAi("my timetable today");
  assert.match(answer, /SECOND LAB/); assert.doesNotMatch(answer, /FIRST LAB/);
  change("subgroup-select", "ECB1");
  assert.equal(select("timetable-subgroup").value, "ECB1");
  change("timetable-subgroup", ""); api.hydrateGroupControls();
  assert.equal(api.state.selectedSubgroup, "", "Whole section survives hydration");
  assert.match(select("week-table").textContent, /FIRST LAB/); assert.match(select("week-table").textContent, /SECOND LAB/);
  change("timetable-group", "CSD");
  assert.deepEqual(choices(), ["", "CSD2"]); assert.equal(select("group-select").value, "CSD");
  assert.equal(api.state.selectedSubgroup, "");
  api.changeTimetableSelection("CSD", "ECB1"); assert.equal(api.state.selectedSubgroup, "");
  change("group-select", "RAI");
  assert.equal(select("timetable-group").value, "RAI");
  assert.equal(select("timetable-subgroup").disabled, true);
  assert.match(select("timetable-subgroup").textContent, /no subsections/);
  assert.equal(JSON.stringify(api.state.student), profile, "Verified identity must not be rewritten");
  api.state.groups = []; api.state.schedule = []; api.hydrateGroupControls();
  assert.equal(select("timetable-subgroup").disabled, true);
  assert.equal(select("timetable-group").disabled, true);
});
