import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { parseHTML } from "linkedom";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";
import worker from "../src/worker.js";

const practicalSource = await readFile(new URL("../public/practical-exams.js", import.meta.url), "utf8");
function harness() {
  const h = createAppHarness();
  Object.assign(h.context, { URLSearchParams, Response });
  vm.runInContext(practicalSource, h.context);
  h.extra = vm.runInContext("({ loadSourceRegistry, facultyLookupRequest, prepareCompassQuestion, examQuestionAnswer, ensureChatBubble, persistChat, restoreChat, renderReferenceLinks })", h.context);
  h.api.state.nowOverride = "2026-09-24T10:00:00Z";
  return h;
}

test("supplied workshop schedule preserves all nine rows and confirmed times", () => {
  const { context } = harness();
  const p = context.CompassPracticals;
  assert.equal(p.workshops.length, 9);
  assert.deepEqual(Array.from(p.workshops, r => [r.section, r.date, r.start, r.end]), [
    ["MEB", "2026-10-07", 630, 750], ["MEA", "2026-10-08", 510, 630], ["RAI", "2026-10-08", 510, 630],
    ["CEB", "2026-10-08", 870, 990], ["ECA", "2026-10-08", 870, 990], ["CEA", "2026-10-09", 630, 750],
    ["EEA", "2026-10-09", 750, 870], ["ECB", "2026-10-09", 750, 870], ["EEB", "2026-10-09", 870, 990]
  ]);
  assert.equal(p.workshops.filter(r => r.correctedTime).length, 3);
  assert.ok(Object.isFrozen(p.workshops[0]));
});

test("practical questions use device selection, explicit scopes and supplied provenance in every mode", () => {
  const { api, extra, context } = harness();
  for (const mode of ["legacy", "v2", "v12", "v22"]) {
    api.state.settings.brainMode = mode;
    const answer = api.answerWithoutAi("my workshop MSE1");
    assert.match(answer, /ECB1 \/ ECB2|ECB1.*ECB2/);
    assert.match(answer, /2026-10-09/);
    assert.match(answer, /12:30 PM to 2:30 PM/);
    assert.match(answer, /supplying user|User-supplied/);
    assert.doesNotMatch(answer, /AM to 2:30 AM|End time unconfirmed/);
  }
  api.state.selectedGroup = "MEA";
  assert.match(extra.examQuestionAnswer("my workshop exam"), /8:30 AM to 10:30 AM/);
  assert.match(extra.examQuestionAnswer("ECE B2 workshop exam"), /ECB1.*ECB2/);
  assert.equal(api.state.selectedGroup, "MEA");
  assert.match(extra.examQuestionAnswer("CSD2 workshop exam"), /not listed/);
  assert.match(extra.examQuestionAnswer("ECB9 workshop exam"), /not listed/);
  assert.match(extra.examQuestionAnswer("workshop MSE2"), /October 2026 only/);
  assert.match(extra.examQuestionAnswer("physics lab MSE1"), /5–9 October 2026/);
  assert.match(extra.examQuestionAnswer("chem lab exam"), /corresponding day of the following week/);
  assert.match(extra.examQuestionAnswer("English lab MSE1"), /Exact individual lab dates and times are not listed/);
  assert.equal(context.CompassPracticals.resolve("physics syllabus"), null);
  assert.match(extra.examQuestionAnswer("physics exam"), /25 Sept/);
  api.state.selectedGroup = "";
  assert.match(extra.examQuestionAnswer("my workshop exam"), /Choose your timetable section/);
});

test("syllabus details never become faculty searches, and spaced rooms use full room view", () => {
  const { api, extra } = harness();
  for (const question of ["Physics unit 1 details", "Physics unit 2 information", "Chemistry syllabus details", "Unit 1 physics"]) assert.equal(extra.facultyLookupRequest(question), null, question);
  assert.ok(extra.facultyLookupRequest("Dr Chahat Jain details"));
  api.state.timetableViews.set("rooms", { schedule: [{ group: "F108", day: "Thursday", start: 630, end: 690, subject: "ROOM CATALOGUE COURSE", teacher: "TEACHER", room: "F108", cohorts: "CSD2" }] });
  assert.equal(api.requestedOfficialTimetableView("F 108 timetable"), "rooms");
  assert.match(api.answerWithoutAi("F 108 timetable"), /ROOM CATALOGUE COURSE/);
  assert.equal(api.requestedOfficialTimetableView("my classes in A9"), "");
  assert.deepEqual({ ...api.requestedTimetableDate("today") }, { iso: "2026-09-24", day: "Thursday" });
  api.state.nowOverride = "2026-09-24T18:31:00Z";
  assert.deepEqual({ ...api.requestedTimetableDate("tomorrow") }, { iso: "2026-09-26", day: "Saturday" });
});

test("HTML and malformed registry responses retry once without changing verified data", async () => {
  const { api, context, extra } = harness();
  vm.runInContext("renderStatus = () => {}; renderReferenceLinks = () => {};", context);
  const previous = api.state.sourceRegistry = { version: "previous", sources: [] };
  const calls = [];
  context.fetch = async (url, init) => { calls.push({ url, init }); return new Response("<!doctype html><title>Compass</title>"); };
  await assert.rejects(extra.loadSourceRegistry(), /unreadable response/);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /retry=/);
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.equal(api.state.sourceRegistry, previous);
  context.fetch = async () => Response.json({ sources: "bad" });
  await assert.rejects(extra.loadSourceRegistry(), /unreadable response/);
  assert.equal(api.state.sourceRegistry, previous);
  let count = 0;
  context.fetch = async () => ++count === 1 ? new Response("<html>proxy</html>") : Response.json({ version: "new", sources: ["groups", "subgroups"].map(id => ({ id, url: `https://appsc.gndec.ac.in/${id}.html` })) });
  const registry = await extra.loadSourceRegistry();
  assert.equal(registry.version, "new");
  assert.equal(count, 2);
});

test("unknown API routes cannot become a successful HTML app response", async () => {
  const response = await worker.fetch(new Request("https://compass.test/api/missing"), { ASSETS: { fetch() { throw new Error("API must not reach assets"); } } }, {});
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, "Unknown API endpoint.");
});

test("saved chat keeps original dates and labels older messages without inventing dates", () => {
  const { context, storage, extra } = harness();
  const { document } = parseHTML('<html><body><div id="chat-window"></div><div id="reference-links"></div></body></html>');
  context.document = document;
  extra.ensureChatBubble("assistant", "<p>Wednesday timetable</p>", "2026-09-23T06:36:00Z");
  extra.persistChat();
  document.getElementById("chat-window").innerHTML = "";
  extra.restoreChat();
  assert.match(document.querySelector(".chat-timestamp").textContent, /23 Sept 2026/);
  assert.equal(document.querySelectorAll(".chat-timestamp").length, 1);
  const key = [...storage.keys()].find(k => storage.get(k).includes("Wednesday timetable"));
  storage.set(key, JSON.stringify([{ role: "assistant", html: "<p>Old answer</p>" }]));
  document.getElementById("chat-window").innerHTML = "";
  extra.restoreChat();
  assert.match(document.querySelector(".chat-timestamp").textContent, /date not recorded/);
  vm.runInContext("state.sourceRegistry = null", context);
  extra.renderReferenceLinks();
  assert.match(document.getElementById("reference-links").textContent, /Supplied exam notices/);
});
