// Regenerate the bundled ESE datesheet snapshot from the official public
// Google Sheet linked by the GNDEC Controller of Examination. Run manually
// after the college publishes a revision:
//
//   node scripts/build-datesheet.mjs
//
// The Worker refreshes the same data into KV on its own schedule; this script
// only keeps the first-load/offline fallback honest. A tab that cannot be read
// keeps its last verified rows, and a total outage keeps the previous bundle.
import { buildDatesheet } from "../src/datesheet.js";
import { readJsonIfPresent, writeJsonWhenChanged } from "./lib/stable-json.mjs";

const previous = readJsonIfPresent("public/data/end-sem-datesheet.json");

let snapshot;
try {
  snapshot = await buildDatesheet();
} catch (error) {
  if (!previous?.tabs?.length) throw error;
  console.warn(`Official datesheet unavailable (${error.message}); keeping the last verified bundle.`);
  process.exit(0);
}

snapshot.seededAt = new Date().toISOString();

if (previous?.tabs?.length) {
  const previousTabs = new Map(previous.tabs.map((tab) => [String(tab.gid), tab]));
  snapshot.tabs = snapshot.tabs.map((tab) => {
    if (tab.entries?.length || !previousTabs.has(String(tab.gid))) return tab;
    return { ...previousTabs.get(String(tab.gid)), stale: true, error: tab.error || "Retained last verified tab" };
  });
  snapshot.totals = {
    tabs: snapshot.tabs.length,
    readableTabs: snapshot.tabs.filter((tab) => tab.entries?.length).length,
    entries: snapshot.tabs.reduce((sum, tab) => sum + (tab.entries?.length || 0), 0)
  };
  snapshot.unavailableTabs = snapshot.tabs
    .filter((tab) => !tab.entries?.length)
    .map((tab) => ({ label: tab.label, gid: tab.gid, error: tab.error || "No dated entries" }));
}

const written = writeJsonWhenChanged(["src/data/datesheet-seed.json", "public/data/end-sem-datesheet.json"], snapshot);

console.log(`${written ? "Wrote" : "Checked"} ${snapshot.totals.entries} entries across ${snapshot.totals.readableTabs}/${snapshot.totals.tabs} official tabs.`);
for (const tab of snapshot.tabs) {
  console.log(`- ${tab.label}: ${tab.entries.length} entries${tab.error ? ` (${tab.error})` : ""}`);
}
