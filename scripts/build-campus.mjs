// Regenerate the bundled campus directory from public GNDEC pages.
//
//   node scripts/build-campus.mjs
//
// The Worker refreshes the same data into KV on its own schedule. This script
// keeps the first-load/offline fallback honest.
import { writeFileSync } from "node:fs";
import { buildCampus } from "../src/campus.js";

const snapshot = await buildCampus();
snapshot.seededAt = new Date().toISOString();

for (const path of ["src/data/campus-seed.json", "public/data/campus.json"]) {
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
}

console.log(`Wrote ${snapshot.departments.length} departments, ${snapshot.notices.length} notices, ${snapshot.syllabus.length} syllabus documents.`);
for (const department of snapshot.departments) {
  console.log(`- ${department.short}: ${department.hod?.name || "HOD not found"}${department.hod?.email ? ` <${department.hod.email}>` : ""}`);
}
console.log("Unavailable:", snapshot.unavailableDepartments.map((item) => item.name).join(", ") || "none");
