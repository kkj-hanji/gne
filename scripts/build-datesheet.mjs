// Regenerate the bundled ESE datesheet snapshot from the official public
// Google Sheet linked by the GNDEC Controller of Examination. Run manually
// after the college publishes a revision:
//
//   node scripts/build-datesheet.mjs
//
// The Worker refreshes the same data into KV on its own schedule; this script
// only keeps the first-load/offline fallback honest.
import { writeFileSync } from "node:fs";
import { buildDatesheet } from "../src/datesheet.js";

const snapshot = await buildDatesheet();
snapshot.seededAt = new Date().toISOString();

for (const path of ["src/data/datesheet-seed.json", "public/data/end-sem-datesheet.json"]) {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

console.log(`Wrote ${snapshot.totals.entries} entries across ${snapshot.totals.readableTabs}/${snapshot.totals.tabs} official tabs.`);
for (const tab of snapshot.tabs) {
  console.log(`- ${tab.label}: ${tab.entries.length} entries${tab.error ? ` (${tab.error})` : ""}`);
}
