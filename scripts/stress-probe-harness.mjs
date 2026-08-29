// Shared vm harness for probe scripts. Mirrors the app environment used by
// scripts/stress-probe.mjs so regression probes exercise the real pipeline.
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

const kernelSource = await readFile(new URL("../public/brain-kernel.js", import.meta.url), "utf8");
const v12Source = await readFile(new URL("../public/brain-v1-2.js", import.meta.url), "utf8");
const v22Source = await readFile(new URL("../public/brain-v2-2.js", import.meta.url), "utf8");
const v2Source = await readFile(new URL("../public/brain-v2.js", import.meta.url), "utf8");
const appSource = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

const sourceUnderTest = appSource.replace(
  /restoreData\(\);[\s\S]*?(?=function kbClean)/,
  ""
).replace(
  /function kbClean/,
  "globalThis.__brainIntegrationTest = { state, answerWithoutAi, runCompassBrain, setCompassBrainV2Enabled, resetBrainConversation, buildScheduleIndex, sanitizeSchedule };\nfunction kbClean"
);

export function createAppHarness() {
  const storage = new Map();
  const context = vm.createContext({
    console,
    DOMParser: class { parseFromString(html) { return parseHTML(html).document; } },
    document: { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key)
    },
    window: { setTimeout, clearTimeout },
    setTimeout,
    clearTimeout,
    Intl,
    Date,
    URL,
    fetch: () => { throw new Error("Network access is forbidden in brain tests."); }
  });
  vm.runInContext(kernelSource, context);
  vm.runInContext(v12Source, context);
  vm.runInContext(v22Source, context);
  vm.runInContext(v2Source, context);
  vm.runInContext(sourceUnderTest, context);
  const api = context.__brainIntegrationTest;
  // Sunday 2026-08-16 10:00 IST -> weekend edge; next study day = Monday.
  api.state.nowOverride = "2026-08-16T04:30:00.000Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.groups = ["ECB"];
  api.state.schedule = [
    { id: "mon-math", group: "ECB", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "mon-pps", group: "ECB", day: "Monday", start: 630, end: 690, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB1" },
    { id: "mon-physics", group: "ECB", day: "Monday", start: 750, end: 810, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB1" },
    { id: "tue-chem", group: "ECB", day: "Tuesday", start: 570, end: 630, subject: "CHEMISTRY", teacher: "DR OTHER TEACHER", room: "CH LAB", type: "P", cohorts: "ECB1" },
    { id: "tue-math", group: "ECB", day: "Tuesday", start: 690, end: 750, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "wed-econ", group: "ECB", day: "Wednesday", start: 750, end: 810, subject: "ECONOMICS", teacher: "SANJAM KAUR SIDHU", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB1" },
    { id: "thu-workshop", group: "ECB", day: "Thursday", start: 510, end: 630, subject: "WORKSHOP", teacher: "ER WORKSHOP HAND", room: "WORKSHOP", type: "P", cohorts: "ECB1" },
    { id: "fri-free", group: "ECB", day: "Friday", start: 570, end: 630, subject: "ENGLISH", teacher: "DR ENGLISH FACULTY", room: "A12", type: "L", cohorts: "ECB1" }
  ];
  api.state.rosterCache = { records: [
    { name: "AMAN KUMAR", crn: "2610001", registrationNo: "26010001", currentSerialNo: "11", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR TEST MENTOR" },
    { name: "AMAN KUMAR", crn: "2610002", registrationNo: "26010002", currentSerialNo: "12", branch: "CS", section: "CSA", subsection: "CSA1", mentor: "DR OTHER MENTOR" },
    { name: "KAUSHIK JAIN", crn: "2617070", registrationNo: "26170000", currentSerialNo: "7", branch: "EC", section: "ECB", subsection: "ECB1", mentor: "DR CHAHAT JAIN" }
  ] };
  api.state.facultyCache = { records: [
    { name: "DR CHAHAT JAIN", profileId: "126", designation: "Assistant Professor", department: "Electronics & Communication Engineering", email: "chahatjain@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=126" },
    { name: "DR JASMEET KAUR", profileId: "99", designation: "Assistant Professor", department: "Applied Science", email: "jasmeet@gndec.ac.in", profileUrl: "https://gndec.ac.in/faculty/?id=99" }
  ] };
  api.buildScheduleIndex();
  api.setCompassBrainV2Enabled(true);
  return { api, context, storage };
}

// ECB2 timetable for comparisons.
export function addEcb2(api) {
  api.state.schedule.push(
    { id: "b-mon-math", group: "ECB2", day: "Monday", start: 570, end: 630, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "A9 (AUTOMOBILE BLOCK)", type: "L", cohorts: "ECB2" },
    { id: "b-tue-phys", group: "ECB2", day: "Tuesday", start: 630, end: 690, subject: "PHYSICS", teacher: "DR JASMEET KAUR", room: "G6", type: "L", cohorts: "ECB2" },
    { id: "b-wed-pps", group: "ECB2", day: "Wednesday", start: 570, end: 630, subject: "PROGRAMMING FOR PROBLEM SOLVING", teacher: "NAVJOT SINGH (EC)", room: "COMP LAB EC", type: "P", cohorts: "ECB2" }
  );
  api.buildScheduleIndex();
}
