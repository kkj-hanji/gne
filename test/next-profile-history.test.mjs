import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { formatHeaderDate } from "../next/engine/datetime.js";
import { normalizeProfileHistory, PROFILE_HISTORY_LIMIT, rememberProfile } from "../next/engine/profile-history.js";

test("header date uses the requested weekday, day, month, and year format", () => {
  assert.equal(formatHeaderDate("2026-11-22"), "Sun, 22 Nov, 2026");
  assert.equal(formatHeaderDate("2026-02-01"), "Sun, 1 Feb, 2026");
  assert.equal(formatHeaderDate("2026-02-30"), "");
});

test("profile history keeps the latest seven unique roster identities", () => {
  const initial = Array.from({ length: 9 }, (_, index) => ({ name: `Student ${index}`, crn: `26170${index}` }));
  const history = normalizeProfileHistory(initial);
  assert.equal(PROFILE_HISTORY_LIMIT, 7);
  assert.equal(history.length, 7);
  assert.deepEqual(history.map((profile) => profile.name), initial.slice(0, 7).map((profile) => profile.name));
  assert.equal(rememberProfile(history, { name: "Student 8", crn: "261708" })[0].name, "Student 8");
  assert.equal(rememberProfile(history, { name: "Same student", crn: "261703" }).filter((profile) => profile.crn === "261703").length, 1);
  assert.deepEqual(normalizeProfileHistory([{ name: "Unverified profile", section: "ECB" }]), [{ name: "Unverified profile", crn: "" }]);
});

test("profile history is device-local and recent entries trigger a fresh roster lookup", async () => {
  const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");
  const html = await readFile(new URL("../next/index.html", import.meta.url), "utf8");
  const profile = app.slice(app.indexOf("function renderRecentProfiles()"), app.indexOf("function queueProfileSuggestions("));
  assert.match(app, /const PROFILE_HISTORY_KEY = "gndec-compass-next-profile-history-v1"/);
  assert.match(app, /storageSet\(PROFILE_HISTORY_KEY, JSON\.stringify\(history\)\)/);
  assert.match(profile, /data-action="lookup-profile-history"/);
  assert.match(profile, /data-profile-history-index=/);
  assert.match(app, /input\.value = record\.crn \|\| record\.name;\s*await lookupProfileFromSettings\(\)/);
  assert.match(app, /rememberVerifiedProfile\(record\)/);
  assert.match(profile, /<details class="profile-history">/);
  assert.match(html, /aria-label="Current date and time in India"/);
  assert.match(html, /topbar-clock-time/);
  assert.match(app, /formatHeaderDate\(clock\.dateISO\)/);
  assert.match(app, /time\.textContent = `\$\{clock\.time\} IST`/);
});
