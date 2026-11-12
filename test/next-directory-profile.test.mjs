import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("directory faculty cards open an in-app profile from photo or name", async () => {
  const app = await read("../next/app.js");
  const card = app.slice(app.indexOf("function facultyCard(record)"), app.indexOf("function facultyProfileKey(record)"));
  const dialog = app.slice(app.indexOf("function facultyProfileDialog(record)"), app.indexOf("function studentRow(record)"));
  assert.match(card, /data-faculty-profile/);
  assert.match(card, /faculty-profile-trigger/);
  assert.match(card, /faculty-profile-name/);
  assert.match(card, /View details/);
  assert.doesNotMatch(card, /href=.*profileUrl/);
  for (const field of ["qualifications", "experience", "journalPublications", "conferencePublications", "memberships", "researchInterests"]) {
    assert.ok(dialog.includes(`record.${field}`), `faculty dialog includes published ${field}`);
  }
  assert.match(dialog, /role="dialog" aria-modal="true"/);
  assert.match(dialog, /record\.profileUrl/);
  assert.match(app, /event\.key === "Escape"/);
});

test("Today always shows verified empty bell periods with their time range", async () => {
  const app = await read("../next/app.js");
  const timeline = app.slice(app.indexOf("function renderTodayTimeline("), app.indexOf("function renderFreeRoomsCard("));
  assert.match(timeline, /if \(classes\.length\)/);
  assert.match(timeline, /No class listed in this bell slot/);
  assert.match(timeline, /timeline-time-end/);
  assert.match(timeline, /\.slice\(0, 16\)/);
});

test("automatic accent follows the selected theme and includes non-green alternatives", async () => {
  const [registry, css, app] = await Promise.all([
    read("../next/settings-registry.js"), read("../next/styles.css"), read("../next/app.js")
  ]);
  assert.match(registry, /default: "teal", values: \[\s*\{ value: "auto"/);
  for (const accent of ["auto", "cyan", "plum", "orange"]) assert.ok(css.includes(`[data-accent="${accent}"]`));
  assert.match(css, /\[data-accent="auto"\]\[data-theme="light"\]/);
  assert.match(css, /\.page-today \.timeline-item:not\(\.is-free\) \.timeline-body/);
  assert.match(css, /\.msg\.assistant \.msg-bubble/);
  assert.match(app, /root\.dataset\.accent = v\("appearance\.accent"\)/);
});
