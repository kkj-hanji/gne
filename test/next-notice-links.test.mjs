import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TRANSCRIBED_NOTICES } from "../next/engine/notices.js";
import { TRANSCRIBED_EXAMS } from "../next/engine/exams.js";

test("transcribed notice links resolve to pages bundled on the Next origin", async () => {
  const notices = TRANSCRIBED_NOTICES.filter((notice) => /^(mse2-theory-2026-11|mse2-workshops-2026-11|hod-meeting-2026-11-03)$/.test(notice.id));
  assert.equal(notices.length, 3);
  for (const notice of notices) {
    assert.match(notice.url, /^\/notices\/[a-z0-9-]+(?:\.html)?$/);
    const assetPath = notice.url.endsWith(".html") ? notice.url : `${notice.url}.html`;
    const page = await readFile(new URL(`../next${assetPath}`, import.meta.url), "utf8");
    assert.match(page, /User-supplied notice transcription/);
    assert.match(page, /<h1>/);
  }
});

test("transcribed MSE-II datesheet entries link directly to the bundled notice page", async () => {
  const exams = TRANSCRIBED_EXAMS.filter((exam) => exam.category === "MSE-II theory");
  assert.ok(exams.length > 0);
  for (const exam of exams) {
    assert.equal(exam.sourceUrl, "/notices/mse2-theory-2026");
    const page = await readFile(new URL("../next/notices/mse2-theory-2026.html", import.meta.url), "utf8");
    assert.match(page, /User-supplied notice transcription/);
    assert.match(page, /MSE-II/);
  }
});
