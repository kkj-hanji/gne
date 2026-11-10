// Regenerate the bundled campus directory from public GNDEC pages.
//
//   node scripts/build-campus.mjs
//
// The Worker refreshes the same data into KV on its own schedule. This script
// keeps the first-load/offline fallback honest: when a department page cannot
// be read, the last verified HOD, contact and syllabus stay in place instead
// of being replaced with blanks.
import { buildCampus } from "../src/campus.js";
import { readJsonIfPresent, writeJsonWhenChanged } from "./lib/stable-json.mjs";

const previous = readJsonIfPresent("public/data/campus.json");
const snapshot = await buildCampus({ previous });
snapshot.seededAt = new Date().toISOString();

const written = writeJsonWhenChanged(["src/data/campus-seed.json", "public/data/campus.json"], snapshot);

console.log(`${written ? "Wrote" : "Checked"} ${snapshot.departments.length} departments, ${snapshot.notices.length} notices, ${snapshot.syllabus.length} syllabus documents.`);
for (const department of snapshot.departments) {
  console.log(`- ${department.short}: ${department.hod?.name || "HOD not found"}${department.hod?.email ? ` <${department.hod.email}>` : ""}`);
}
console.log("Unavailable:", snapshot.unavailableDepartments.map((item) => item.name).join(", ") || "none");
