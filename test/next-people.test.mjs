import test from "node:test";
import assert from "node:assert/strict";
import { answerPersonQuestion, parsePersonQuestion } from "../next/engine/people.js";

const students = [
  { name: "Mohitveer Singh", crn: "2615231", registrationNo: "REG2615231", serialNo: "42", branch: "EC", section: "ECB", subsection: "ECB2", mentor: "Mentor One", mentorPhone: "9990000001", mentorVenue: "Room E1", academicGroup: "ECB2-M1" },
  { name: "Mohitveer Singh", crn: "2617123", registrationNo: "REG2617123", serialNo: "43", branch: "CE", section: "CEA", subsection: "CEA1", mentor: "Mentor Two", mentorPhone: "9990000002", venue: "Room C1", academicGroup: "CEA1-M1" }
];

const schedule = [
  { group: "ECB", day: "Monday", start: 510, end: 570, subject: "MATH I", teacher: "SUKHMINDER SINGH", room: "F108", cohorts: "" }
];

test("a name without a role produces clickable student and faculty choices", () => {
  const person = parsePersonQuestion("mohitveer singh");
  assert.equal(person?.role, "ambiguous");
  const answer = answerPersonQuestion(person);
  assert.equal(answer.intent, "PERSON_DISAMBIGUATION");
  assert.deepEqual(answer.suggestions, ["Student mohitveer singh", "Faculty mohitveer singh"]);
  assert.doesNotMatch(answer.html, /SUKHMINDER|CRN|registration/i);
});

test("student lookup asks before resolving duplicates and shows the chosen verified profile fields", () => {
  const person = parsePersonQuestion("student Mohitveer Singh");
  assert.equal(person?.role, "student");
  const answer = answerPersonQuestion(person, { students, schedule, group: "ECB" });
  assert.equal(answer.intent, "STUDENT_LOOKUP_AMBIGUOUS");
  assert.deepEqual(answer.suggestions, [
    "Student Mohitveer Singh in section ECB subsection ECB2",
    "Student Mohitveer Singh in section CEA subsection CEA1"
  ]);
  assert.doesNotMatch(answer.html, /2615231|2617123|9990000001|9990000002/);

  const selectedPerson = parsePersonQuestion(answer.suggestions[0]);
  const selected = answerPersonQuestion(selectedPerson, { students, schedule, group: "ECB" });
  assert.equal(selected.intent, "STUDENT_LOOKUP");
  for (const field of ["Mohitveer Singh", "CRN", "2615231", "Registration number", "REG2615231", "Serial number", "42", "Group / branch", "EC", "Section", "ECB", "Subgroup", "ECB2", "Mentor", "Mentor One", "Mentor phone", "9990000001", "Venue", "Room E1", "Mentoring group", "ECB2-M1"]) {
    assert.ok(selected.html.includes(field), `profile response includes ${field}`);
  }
  assert.doesNotMatch(selected.html, /2617123|9990000002|SUKHMINDER/);
});

test("partial student names and exact roster identifiers require a choice before disclosure", () => {
  const partial = answerPersonQuestion(parsePersonQuestion("student Mohit Singh"), { students });
  assert.equal(partial.intent, "STUDENT_LOOKUP_AMBIGUOUS");
  assert.ok(partial.suggestions.length);
  assert.doesNotMatch(partial.html, /2615231|REG2615231/);

  assert.equal(parsePersonQuestion("student CRN 2615231")?.rawName, "2615231");
  const exact = answerPersonQuestion(parsePersonQuestion("student CRN 2615231"), { students });
  assert.equal(exact.intent, "STUDENT_LOOKUP");
  assert.ok(exact.html.includes("REG2615231"));
  assert.doesNotMatch(exact.html, /2617123|9990000002/);
});

test("duplicate names within the same section get distinct CRN choices", () => {
  const duplicates = [students[0], { ...students[0], crn: "2615999", registrationNo: "REG2615999", serialNo: "44" }];
  const answer = answerPersonQuestion(parsePersonQuestion("student Mohitveer Singh"), { students: duplicates });
  assert.deepEqual(answer.suggestions, ["Student CRN 2615231", "Student CRN 2615999"]);
  const selected = answerPersonQuestion(parsePersonQuestion(answer.suggestions[1]), { students: duplicates });
  assert.equal(selected.intent, "STUDENT_LOOKUP");
  assert.ok(selected.html.includes("2615999"));
  assert.doesNotMatch(selected.html, /2615231/);
});

test("an explicit faculty choice uses exact public data and never substitutes a similar-surname teacher", () => {
  const noMatch = answerPersonQuestion(parsePersonQuestion("faculty Mohitveer Singh"), {
    students,
    faculty: [],
    schedule,
    group: "ECB"
  });
  assert.equal(noMatch.intent, "FACULTY_LOOKUP_NOT_FOUND");
  assert.match(noMatch.html, /could not verify Mohitveer Singh/);
  assert.doesNotMatch(noMatch.html, /SUKHMINDER/);

  const exactTeacher = answerPersonQuestion(parsePersonQuestion("faculty Sukhminder Singh"), {
    faculty: [],
    schedule,
    group: "ECB"
  });
  assert.equal(exactTeacher.intent, "FACULTY_TIMETABLE_LOOKUP");
  assert.match(exactTeacher.html, /SUKHMINDER SINGH/);
  assert.match(exactTeacher.html, /MATH I/);
});

test("public faculty lookup can return an exact directory record", () => {
  const answer = answerPersonQuestion(parsePersonQuestion("faculty Mohitveer Singh"), {
    faculty: [{ name: "Mohitveer Singh", department: "Applied Sciences", designation: "Assistant Professor" }],
    schedule: [],
    group: "ECB"
  });
  assert.equal(answer.intent, "FACULTY_LOOKUP");
  assert.match(answer.html, /Applied Sciences/);
  assert.match(answer.html, /Assistant Professor/);
  assert.doesNotMatch(answer.html, /CRN|registration|SUKHMINDER/);
});

test("person routing ignores ordinary subject and schedule questions", () => {
  for (const question of ["PPS semester 2", "Who teaches Math?", "chemistry syllabus", "What is my next class?"]) {
    assert.equal(parsePersonQuestion(question), null, question);
  }
});
