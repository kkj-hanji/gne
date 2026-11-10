import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isSameContent, readJsonIfPresent, writeJsonWhenChanged } from "../scripts/lib/stable-json.mjs";

async function read(relative) {
  return readFile(new URL(`../${relative}`, import.meta.url), "utf8");
}

test("freshness timestamps never count as a data change", () => {
  const older = { departments: [{ id: "ce", hod: { name: "Dr. A" }, checkedAt: "2026-01-01" }], checkedAt: "2026-01-01" };
  const newer = { departments: [{ id: "ce", hod: { name: "Dr. A" }, checkedAt: "2026-11-10" }], checkedAt: "2026-11-10" };
  assert.equal(isSameContent(older, newer), true);
  assert.equal(isSameContent(older, { ...newer, departments: [{ id: "ce", hod: { name: "Dr. B" }, checkedAt: "2026-11-10" }] }), false);
  assert.equal(isSameContent(null, newer), false);
});

test("stable bundles are not rewritten just to move a timestamp", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "compass-stable-"));
  const file = path.join(folder, "snapshot.json");
  assert.equal(writeJsonWhenChanged(file, { records: [{ id: 1 }], generatedAt: "2026-01-01" }), true);
  assert.equal(writeJsonWhenChanged(file, { records: [{ id: 1 }], generatedAt: "2026-11-10" }), false);
  assert.equal(writeJsonWhenChanged(file, { records: [{ id: 2 }], generatedAt: "2026-11-10" }), true);
  assert.equal(readJsonIfPresent(file).records[0].id, 2);
  assert.equal(readJsonIfPresent(path.join(folder, "missing.json")), null);
});

test("the daily builders keep every verified source when an origin is down", async () => {
  const papers = await read("scripts/build-papers.mjs");
  assert.match(papers, /retained/);
  assert.match(papers, /keeping the previous index/);
  assert.doesNotMatch(papers, /writeFile\(.next\/data\/papers-index\.json/);

  const campus = await read("scripts/build-campus.mjs");
  assert.match(campus, /buildCampus\(\{ previous \}\)/);
  assert.match(campus, /writeJsonWhenChanged/);

  const datesheet = await read("scripts/build-datesheet.mjs");
  assert.match(datesheet, /Retained last verified tab/);
  assert.match(datesheet, /keeping the last verified bundle/);

  const syllabus = await read("scripts/build-syllabus-index.mjs");
  assert.match(syllabus, /keeping the last verified index/);

  const directory = await read("scripts/build-directory-indexes.mjs");
  assert.match(directory, /Roster refresh skipped/);
  assert.match(directory, /Faculty refresh skipped/);
});

test("live verification warns on an outage but fails on unreadable data", async () => {
  const verify = await read("scripts/verify-next-live.mjs");
  assert.match(verify, /isOfficialOutage/);
  assert.match(verify, /keeping the last verified bundle/);
  assert.match(verify, /Published bundles stay unchanged/);
  assert.match(verify, /assert\.equal\(rows\.unparsedCells, 0/);
});

test("the sitemap keeps a real lastmod instead of stamping today on every run", async () => {
  const seo = await read("scripts/build-next-seo.mjs");
  assert.match(seo, /seo-lastmod\.json/);
  assert.match(seo, /previousState\[item\.loc\]/);
  assert.doesNotMatch(seo, /const lastmod = new Date\(\)/);

  const state = JSON.parse(await read("src/data/seo-lastmod.json"));
  const entries = Object.entries(state);
  assert.ok(entries.length > 200, "the freshness ledger covers every sitemap URL");
  for (const [loc, record] of entries) {
    assert.match(loc, /^https:\/\//);
    assert.match(record.hash, /^[a-f0-9]{64}$/);
    assert.match(record.lastmod, /^\d{4}-\d{2}-\d{2}$/);
  }
});
