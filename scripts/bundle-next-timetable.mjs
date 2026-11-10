// Bundle the verified official FET releases into the Next app.
//
//   node scripts/bundle-next-timetable.mjs
//
// The Worker normally reads the timetable through the frozen legacy proxy. If
// the college origin is unreachable, the app falls back to these files. They
// are only written when the SHA-256 of the fetched document matches the hash
// published in /api/sources, so a partial or substituted file can never be
// bundled.
//
// A failed fetch keeps the previous bundle and exits 0: the daily refresh must
// not fail because the college site is temporarily down.

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const LEGACY = process.env.LEGACY_ORIGIN || "https://gndec-compass.koush3069.workers.dev";
const SOURCES = ["groups", "rooms", "subgroups"];
const TARGETS = Object.freeze({
  groups: "next/data/timetable-groups.html",
  rooms: "next/data/timetable-rooms.html",
  subgroups: "next/data/timetable-subgroups.html"
});

async function fetchText(url, accept) {
  const response = await fetch(url, { headers: { Accept: accept } });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

let registry = [];
try {
  const raw = await fetchText(`${LEGACY}/api/sources`, "application/json");
  const parsed = JSON.parse(raw);
  registry = Array.isArray(parsed?.sources) ? parsed.sources : [];
} catch (error) {
  console.warn(`Source registry unavailable (${error.message}); keeping the current bundles.`);
  process.exit(0);
}

let updated = 0;
for (const id of SOURCES) {
  const record = registry.find((entry) => entry?.id === id);
  if (!record?.verified) {
    console.warn(`${id}: not listed as a verified source; keeping the current bundle.`);
    continue;
  }
  let text;
  try {
    text = await fetchText(`${LEGACY}/api/timetable?source=${id}`, "text/html");
  } catch (error) {
    console.warn(`${id}: ${error.message}; keeping the current bundle.`);
    continue;
  }
  if (text.includes("\uFFFD")) {
    console.warn(`${id}: unreadable characters; refusing to bundle partial facts.`);
    continue;
  }
  const hash = createHash("sha256").update(text).digest("hex");
  if (record.contentHash && hash !== record.contentHash) {
    console.warn(`${id}: hash does not match the published verified hash; keeping the current bundle.`);
    continue;
  }
  const target = TARGETS[id];
  const previous = existsSync(target) ? await readFile(target, "utf8") : "";
  if (previous === text) {
    console.log(`${id}: unchanged (${record.version || "verified release"}).`);
    continue;
  }
  await writeFile(target, text, "utf8");
  updated += 1;
  console.log(`${id}: bundled ${record.version || "verified release"} (${hash.slice(0, 12)}).`);
}
console.log(`${updated} bundle(s) updated.`);
