import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

test("PDF column anchors preserve blank parent cells and joined CRN/branch and phone/venue runs", () => {
  const { api } = createAppHarness();
  const token = (text, x, y = 567) => ({ str: text, transform: [1, 0, 0, 1, x, y] });
  const headings = [["Sr.", 3, 577], ["Registration", 18, 577], ["College", 58, 577], ["Branch", 91], ["Student Name", 119], ["Mother Name", 215], ["Father Name", 295], ["Section", 390], ["Sub", 416, 577], ["Section", 416], ["Mentoring", 446, 577], ["Mentor Name", 489], ["Mentor's", 578, 577], ["Venue", 622], ["Class Coordinator", 696]];
  const row = [["46", 9], ["26012345", 27], ["2612345 EE", 65], ["TEST STUDENT", 119], ["MOTHER NAME", 215], ["EEA", 390], ["EEA2", 417], ["EEAM2", 446], ["DR TEST MENTOR", 489], ["9999999999 G5", 585], ["COORDINATOR", 697]];
  const text = api.pdfTextFromItems([...headings.map(values => token(...values)), ...row.map(([value, x]) => token(value, x, 558))]);
  const records = api.parseStudentSectionText(text, "EE");
  assert.equal(records.length, 1);
  const [record] = records;
  for (const [field, expected] of Object.entries({ name: "TEST STUDENT", registrationNo: "26012345", crn: "2612345", branch: "EE", section: "EEA", subsection: "EEA2", academicGroup: "EEAM2", mentor: "DR TEST MENTOR", mentorPhone: "9999999999", mentorVenue: "G5" })) assert.equal(record[field], expected, field);
  assert.doesNotMatch(JSON.stringify(record), /MOTHER NAME|COORDINATOR/);
  assert.equal(api.parseStudentSectionText(text, "EC").length, 0);
  assert.equal(api.pdfTextFromItems([token("First", 10, 20), token("Second", 40, 20)]), "First\tSecond", "Non-roster extraction stays compatible");
});

test("2025 batch layout parses cross-listed MX and ECBITD sections without dropping the branch", () => {
  const { api } = createAppHarness();
  const header = "Sr. No.\tClass Sr. No.\tCollege Roll No.\tRegistration Number\tStudent Name\tFather's Name\tMother's Name\tBranch\tSection\tSubsection\tMentor Group\tMentor Name\tVenue";
  const rows = [
    "1\t1\t2514001\t2513794\tAalamjit Singh\tBaljinder Singh\tParamjeet Kaur\tCE\tCEA\tCEA1\tCEMC1\tEr. Varinder Singh\tGEOTECH LAB",
    "103\t---\t2514106\t2513896\tSachin\tSho Karan\tNeelam Devi\tCE\tMX\tMX1\tCEMC5\tEr. Avneet Kaur\tDEPTT. LIB (CE)",
    "55\t1\t2517056\t2514468\tNaunidh Singh Grover\tDilpreet Singh\tHarpreet Kaur\tEC\tECBITD\tECB\tMEC4\tEr. Simranjit Kaur\tMP Lab (EC Dept.)"
  ];
  const records = api.parseStudentSectionText([header, rows[0], rows[1]].join("\n"), "CE", "2025");
  assert.equal(records.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(records.map((record) => [record.batch, record.branch, record.section, record.subsection, record.crn, record.registrationNo]))), [
    ["2025", "CE", "CEA", "CEA1", "2514001", "2513794"],
    ["2025", "CE", "MX", "MX1", "2514106", "2513896"]
  ]);
  const ecRecords = api.parseStudentSectionText([header, rows[2]].join("\n"), "EC", "2025");
  assert.equal(ecRecords.length, 1);
  assert.equal(ecRecords[0].section, "ECBITD");
  assert.equal(ecRecords[0].subsection, "ECB");
});

test("bundled 2025 roster index is complete, batched, and free of parent fields", async () => {
  const { readFile } = await import("node:fs/promises");
  const index = JSON.parse(await readFile(new URL("../public/data/student-roster-index-2025.json", import.meta.url), "utf8"));
  assert.equal(index.schemaVersion, 4);
  assert.equal(index.sources.length, 7);
  assert.ok(index.sources.every((source) => source.batch === "2025" && source.verified && source.count > 0));
  assert.ok(index.records.length > 900);
  assert.ok(index.records.every((record) => record.batch === "2025" && record.name && record.section && record.crn));
  assert.doesNotMatch(JSON.stringify(index.records), /father|mother/i);
});
