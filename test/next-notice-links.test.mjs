import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { TRANSCRIBED_NOTICES } from "../next/engine/notices.js";

test("transcribed notice links resolve to pages bundled on the Next origin", async () => {
  const notices = TRANSCRIBED_NOTICES.filter((notice) => /^(mse2-theory-2026-11|mse2-workshops-2026-11|hod-meeting-2026-11-03)$/.test(notice.id));
  assert.equal(notices.length, 3);
  for (const notice of notices) {
    assert.match(notice.url, /^\/notices\/[a-z0-9-]+\.html$/);
    const page = await readFile(new URL(`../next${notice.url}`, import.meta.url), "utf8");
    assert.match(page, /User-supplied notice transcription/);
    assert.match(page, /<h1>/);
  }
});
