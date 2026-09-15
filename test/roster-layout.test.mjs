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
