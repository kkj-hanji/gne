import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { parseHTML } from "linkedom";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const examSource = await read("../public/exam-schedule.js");
const appSource = await read("../public/app.js");
const brainSources = await Promise.all(["brain-kernel.js", "brain-v1-2.js", "brain-v2-2.js", "brain-v2.js"].map((name) => read(`../public/${name}`)));
function harness(mode = "v22") {
  const context = vm.createContext({ console, Intl, Date, URL, setTimeout, clearTimeout,
    DOMParser: class { parseFromString(html) { return parseHTML(html).document; } },
    document: { getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    window: { setTimeout, clearTimeout }, fetch: async () => { throw new Error("Exam questions must not fetch rosters or timetables"); } });
  for (const source of [...brainSources, examSource]) vm.runInContext(source, context);
  vm.runInContext(appSource.replace(/restoreData\(\);[\s\S]*?(?=function kbClean)/, "").replace("function kbClean", "globalThis.api = { state, answerWithoutAi, legacyAnswerWithoutAi, prepareCompassQuestion, examQuestionAnswer, buildScheduleIndex, answerFromKnowledgeBase };\nfunction kbClean"), context);
  const { api } = context;
  api.state.settings.brainMode = mode;
  api.state.nowOverride = "2026-09-15T10:00:00Z";
  api.state.selectedGroup = "ECB";
  api.state.selectedSubgroup = "ECB1";
  api.state.groups = ["ECB", "CSD", "MEA", "RAI"];
  api.state.schedule = [{ id: "math", group: "ECB", cohorts: "ECB1, ECB2", subject: "MATH I", teacher: "EXAMPLE", room: "F113", day: "Monday", start: 570, end: 630, type: "L" }];
  api.buildScheduleIndex();
  return { api, exams: context.CompassExams };
}

test("date sheet bytes, issuer and all printed exam rows are preserved", async () => {
  const { exams } = harness();
  const bytes = await readFile(new URL("../public/data/mse1-sem1-2026-09-14.pdf", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), exams.source.sha256);
  const pdf = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  assert.equal(pdf.numPages, 1);
  const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => item.str).join(" ").replace(/\s+/g, "");
  assert.match(text, /Dated:14\/09\/2026/);
  assert.match(text, /30-09-202611:00am-12:30pmEDGEEA,EEB,ECA,ECB/);
  assert.equal(exams.entries.length, 11);
  assert.equal(exams.source.officialUrl, null);
  await pdf.destroy();
});

for (const mode of ["legacy", "v12", "v2", "v22"]) {
  test(`${mode}: exam queries answer from date sheet before weekly timetable or student search`, () => {
    const { api } = harness(mode);
    for (const query of ["my exam timetable", "meri date sheet batao", "mse 1 date sheet", "ECB1 exams", "mera next paper kab hai"]) {
      const answer = api.answerWithoutAi(query);
      assert.match(answer, /MSE-I/);
      assert.match(answer, /Physics/);
      assert.match(answer, /12:45 PM/);
      assert.match(answer, /User-supplied/);
      assert.doesNotMatch(answer, /EXAMPLE|F113|weekly timetable|choose a student/i);
    }
    assert.equal(api.state.selectedGroup, "ECB");
    assert.equal(api.state.selectedSubgroup, "ECB1");
    assert.match(api.legacyAnswerWithoutAi("my EDG exam time"), /11:00 AM/);
    assert.match(api.answerFromKnowledgeBase("exam date sheet").reply, /MSE-I/);
  });
}

const physicsSections = ["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"];
const chemistrySections = ["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"];
for (const section of [...physicsSections, ...chemistrySections]) {
  test(`${section}: every subject, date and time agrees with the applicable printed group`, () => {
    const { exams } = harness();
    const rows = exams.resolve(`${section} date sheet`).entries;
    assert.equal(rows.length, 5);
    const physics = physicsSections.includes(section);
    const expected = [
      ["2026-09-25", physics ? "physics" : "chemistry", physics ? 765 : 555],
      ["2026-09-28", "maths", 555], ["2026-09-29", "pps", 555],
      ["2026-09-30", physics ? "edg" : "beee", /^(EC|EE)/.test(section) ? 660 : 555],
      ["2026-10-01", physics ? "economics" : "english", physics ? 765 : 555]
    ];
    assert.deepEqual(Array.from(rows, (row) => [row.date, row.subject, row.start]), expected);
    assert.ok(rows.every((row) => row.end - row.start === 90 && row.sections.includes(section)));
  });
}

test("explicit section wins over the device; no section returns labelled groups", () => {
  const { api } = harness();
  assert.match(api.answerWithoutAi("CS D date sheet"), /Chemistry/);
  assert.doesNotMatch(api.answerWithoutAi("CS D date sheet"), /Physics|Economics/);
  api.state.selectedGroup = "";
  assert.match(api.answerWithoutAi("my date sheet"), /Choose your section/);
  const all = api.answerWithoutAi("all date sheets");
  assert.match(all, /CSA, CSB/);
  assert.match(all, /EEA, EEB, ECA, ECB/);
});

test("exam query preparation does not append timetable or pollute date/day queries", () => {
  const { api, exams } = harness();
  assert.equal(api.prepareCompassQuestion("ECB exam 30 September"), "ecb exam 30 september");
  for (const query of ["today date", "today day", "physics credits", "physics exam duration", "exam pattern", "exam syllabus", "exam results", "next class"]) {
    if (query === "physics exam duration") continue;
    assert.equal(exams.matches(query), false, query);
  }
});

test("exact dates, relative dates, invalid dates and mixed questions retain exam meaning", () => {
  const { api } = harness();
  for (const query of ["my exam on 30 September", "EDG paper 30/09/2026", "EC B exam 30-09", "mera 30 September ka exam"]) {
    const answer = api.answerWithoutAi(query);
    assert.match(answer, /EDG/);
    assert.match(answer, /11:00 AM–12:30 PM/);
    assert.doesNotMatch(answer, /Physics<\/strong>/);
  }
  api.state.nowOverride = "2026-09-24T20:00:00Z"; // Already 25 September in India.
  assert.match(api.answerWithoutAi("aaj exam kya hai"), /Physics/);
  assert.match(api.answerWithoutAi("kal exam hai"), /No matching exam/);
  assert.match(api.answerWithoutAi("exam 31 September"), /does not exist|check the date/i);
  assert.match(api.answerWithoutAi("Monday 25 September exam"), /does not match|check the date/i);
  const multi = api.answerWithoutAi("my exam date sheet and what is today date");
  assert.match(multi, /MSE-I/);
  assert.match(multi, /India calendar date/);
});

test("next/current exam respects India time and stops after the final known exam", () => {
  const { api } = harness();
  api.state.nowOverride = "2026-09-25T07:00:00Z"; // 12:30 IST
  assert.match(api.answerWithoutAi("next exam"), /Physics/);
  api.state.nowOverride = "2026-09-25T07:15:00Z"; // Exam has started.
  assert.match(api.answerWithoutAi("current exam"), /Physics/);
  assert.match(api.answerWithoutAi("next exam"), /Mathematics-I/);
  api.state.nowOverride = "2026-10-01T09:00:00Z";
  assert.match(api.answerWithoutAi("next exam"), /No matching exam/);
});

test("missing data, unknown sections and unsupported sessions do not invent answers", () => {
  const { api, exams } = harness();
  for (const query of ["MSE-II date sheet", "semester 3 exams", "sem II exams", "2nd year date sheet", "2027 exam timetable", "end semester exam dates", "MBA exams"]) {
    assert.match(api.answerWithoutAi(query), /only|do not have/);
    assert.doesNotMatch(api.answerWithoutAi(query), /11:00 AM/);
  }
  assert.match(api.answerWithoutAi("ECB9 exam timetable"), /cannot verify/i);
  assert.match(api.answerWithoutAi("CSZ date sheet"), /cannot verify/i);
  assert.match(api.answerWithoutAi("where is my Physics exam room"), /does not list rooms/);
  assert.equal(exams.resolve("how many exams", { section: "ECB" }).entries.length, 5);
  assert.equal(exams.resolve("maths exam", { section: "ECB" }).entries.length, 1);
  for (const question of ["Aman exam timetable", "history exam date", "BSC999 exam date"]) {
    assert.match(api.answerWithoutAi(question), /could not match/);
    assert.doesNotMatch(api.answerWithoutAi(question), /12:45 PM/);
  }
  assert.match(api.answerWithoutAi("exams in November"), /No matching exam/);
  assert.match(api.answerWithoutAi("next month exams"), /Economics/);
  assert.doesNotMatch(api.answerWithoutAi("next month exams"), /Physics<\/strong>/);
  assert.match(api.answerWithoutAi("IT exam date sheet"), /Chemistry/);
  assert.doesNotMatch(api.answerWithoutAi("IT exam date sheet"), /Physics<\/strong>/);
});

test("app loads exam data before the entry point and caches both module and PDF", async () => {
  const html = await read("../public/index.html");
  const sw = await read("../public/sw.js");
  assert.ok(html.indexOf('src="exam-schedule.js') < html.indexOf('src="app.js'));
  assert.match(sw, /\/exam-schedule\.js\?v=20260915-1/);
  assert.match(sw, /\/data\/mse1-sem1-2026-09-14\.pdf/);
});
