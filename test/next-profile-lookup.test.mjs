import test from "node:test";
import assert from "node:assert/strict";
import { findProfileRosterMatches, matchProfileRecord, normalizeRosterName } from "../next/engine/profile-lookup.js";

const roster = [
  { name: "Lovepreet Singh", crn: "2621101", registrationNo: "2621101", section: "ITA" },
  { name: "Lovepreet Singh", crn: "2621102", registrationNo: "2621102", section: "ITB" },
  { name: "Gurpreet Kaur", crn: "2621103", registrationNo: "2621103", section: "ITC" }
];

test("profile lookup matches CRN exactly and only auto-matches a unique exact name", () => {
  assert.equal(matchProfileRecord(roster, { crn: "2621101" }), roster[0]);
  assert.equal(matchProfileRecord(roster, { name: "Gurpreet Kaur" }), roster[2]);
  assert.equal(matchProfileRecord(roster, { name: "Lovepreet Singh" }), null, "duplicate exact names require a student choice");
  assert.equal(matchProfileRecord(roster, { name: "Gurpreet Kaur", crn: "9999999" }), null, "a wrong identifier must not fall back to a name");
});

test("interactive profile search offers exact or partial choices without changing the profile", () => {
  assert.deepEqual(findProfileRosterMatches(roster, "2621101"), [roster[0]]);
  assert.deepEqual(findProfileRosterMatches(roster, "Lovepreet Singh"), roster.slice(0, 2));
  assert.deepEqual(findProfileRosterMatches(roster, "Lovepreet"), roster.slice(0, 2));
  assert.deepEqual(findProfileRosterMatches(roster, "Lo"), []);
  assert.equal(normalizeRosterName("  GURPREET—KAUR  "), "gurpreet kaur");
});
