import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { academicYearForSection, examGroupForSection, examEventsForSelection } from "../next/engine/exams.js";
import datesheet from "../src/data/datesheet-seed.json" with { type: "json" };

const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../next/styles.css", import.meta.url), "utf8");
const settings = await readFile(new URL("../next/settings-registry.js", import.meta.url), "utf8");

test("Today replaces side-column Ask prompts with exam details and official notices", () => {
  const today = app.slice(app.indexOf("function renderToday()"), app.indexOf("function renderHero("));
  assert.match(today, /\$\{examCard\}[\s\S]*\$\{notices\}/);
  assert.doesNotMatch(today, /renderQuickAsk|suggestedQuestions/);
  assert.match(app, /exam \? escapeHtml\(exam\.title\) : "No published date"/);
  assert.match(app, /class="exam-next-link" href="\/calendar#exam-datesheet"/);
  assert.match(app, /notice\.attachments\.slice\(0, 3\)/);
  assert.doesNotMatch(settings, /today\.quickAsk/);
});

test("full datesheet is grouped for the active profile section and names its exam cohort", () => {
  assert.equal(examGroupForSection("CSD"), "Chemistry group");
  assert.equal(examGroupForSection("ECB"), "Physics group");
  const chemistry = examEventsForSelection({ datesheet, group: "CSD" });
  const physics = examEventsForSelection({ datesheet, group: "ECB" });
  assert.ok(chemistry.length > 0 && physics.length > 0);
  assert.ok(chemistry.every((event) => !/physics group/i.test(`${event.tab} ${event.title}`)));
  assert.ok(physics.every((event) => !/chemistry group/i.test(`${event.tab} ${event.title}`)));
  assert.match(app, /Exam datesheet for your selection/);
  assert.match(app, /selected-group exams only/);
  assert.equal(academicYearForSection("ECB"), 1);
  assert.equal(academicYearForSection("D2ECB1"), 2);
  assert.equal(academicYearForSection("D3CEB"), 3);
  assert.equal(examGroupForSection("D2ECB1"), "", "upper-year sections should not inherit first-year Chemistry/Physics labels");
  assert.ok(physics.filter((event) => event.tab).every((event) => event.tab === "Applied Sciences"), "a first-year Physics selection must not include other programme tabs");
  assert.ok(examEventsForSelection({ datesheet, group: "D2ECB1" }).every((event) => event.tab === "ECE" && event.year === 2), "a second-year ECE selection must only include its own ESE tab and year");
  assert.match(app, /<details class="exam-other-group">/);
  assert.match(app, /Other year · other programmes|year · other programmes/);
});

test("Today notice and exam cards keep readable, responsive colors from the selected theme", () => {
  assert.match(css, /\.today-notice\.is-pinned/);
  assert.match(css, /\.exam-next-link:hover/);
  assert.match(css, /\.stat-link \.stat-sub \{ grid-column: 1 \/ -1/);
  assert.match(css, /--accent/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*\.exam-datesheet-row/);
});
