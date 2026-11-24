import test from "node:test";
import assert from "node:assert/strict";
import { inferSeatingPlanMetadata, isSeatingQuestion, normalizeCrn, parseSeatingPlanText, seatAnswerHtml, seatingStudentForQuestion, selectSeatingPlan, selectSeatingPlanForExam } from "../next/engine/seating.js";
import { handleRequest } from "../src/next-core.js";
import { TRANSCRIBED_EXAMS } from "../next/engine/exams.js";

const roomBlock = (room, crns, printed = crns.length) => `Room No. ${room}\nS. No. CRN\n${crns.map((crn, index) => `${index + 1} ${crn}`).join("\n")}\nSECTION ALLOTTED\nTOTAL STU. ${printed}\n`;

function createKv() {
  const values = new Map();
  return {
    values,
    async get(key, type) {
      const row = values.get(key);
      if (!row) return null;
      return type === "json" ? JSON.parse(row.value) : row.value;
    },
    async put(key, value, options = {}) { values.set(key, { value: String(value), options }); },
    async delete(key) { values.delete(key); }
  };
}

const OWNER = "owner-token-with-enough-length";
const ORIGIN = "https://next.test";
const env = () => ({ ADMIN_API_TOKEN: OWNER, CONTENT: createKv() });
const ctx = () => ({ waitUntil() {} });
function req(path, { method = "GET", token = "", body, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body
  });
}
function jsonReq(path, value, token = OWNER, extraHeaders = {}) {
  return req(path, { method: "POST", token, headers: { "Content-Type": "application/json", ...extraHeaders }, body: JSON.stringify(value) });
}

test("seating PDF text parser verifies each room total and rejects incomplete or duplicate rows", () => {
  const parsed = parseSeatingPlanText(`${roomBlock("F-101", ["1234567", "2345678"])}\n${roomBlock("G-204", ["3456789"])}`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.rooms, 2);
  assert.deepEqual(parsed.seats, [
    { crn: "1234567", room: "F-101", row: 1 },
    { crn: "2345678", room: "F-101", row: 2 },
    { crn: "3456789", room: "G-204", row: 1 }
  ]);

  const splitLines = parseSeatingPlanText("Room No. A-101\nS. No. CRN\n1 4567890\n5678901\n2 6789012\nSECTION ALLOTTED\nTOTAL STU. 3");
  assert.equal(splitLines.ok, true);
  assert.deepEqual(splitLines.seats.map(({ crn, row }) => [crn, row]), [["4567890", 1], ["5678901", 1], ["6789012", 2]]);

  const mismatch = parseSeatingPlanText(roomBlock("F-101", ["1234567"], 2));
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.warnings[0], /printed total 2, extracted 1/);
  assert.equal(parseSeatingPlanText(roomBlock("F-101", ["1234567"]) + roomBlock("G-204", ["1234567"])).ok, false);
  assert.equal(parseSeatingPlanText("a scanned document with no selectable table").ok, false);
});

test("seating PDF layout preserves the physical row label as well as its numbered seat", () => {
  const parsed = parseSeatingPlanText(roomBlock("A8 (Automobile block)", ["1234567", "2345678"]), {
    layout: [[
      { value: "Room No. A8 (Automobile block)", x: 100, y: 100 },
      { value: "S.No", x: 10, y: 80 },
      { value: "Row-I", x: 30, y: 80 },
      { value: "Row-II", x: 60, y: 80 },
      { value: "1", x: 10, y: 60 },
      { value: "1234567", x: 30, y: 60 },
      { value: "2345678", x: 60, y: 60 }
    ]]
  });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.seats.map(({ crn, row, rowLabel }) => [crn, row, rowLabel]), [
    ["1234567", 1, "Row-I"],
    ["2345678", 2, "Row-II"]
  ]);
});

test("seating intent handles English, shorthand, misspelling, Hinglish and Hindi without catching timetable questions", () => {
  for (const question of [
    "Where is my exam room?",
    "exam rm pls",
    "mera paper kidhar hai",
    "MSE 2 ka sitting plan",
    "siting arrangment for maths",
    "mohitveer singh sitting plab",
    "mohitveer singh sitting class",
    "2615231",
    "मेरा पेपर किस कमरे में है?"
  ]) assert.equal(isSeatingQuestion(question), true, question);
  assert.equal(isSeatingQuestion("Show my timetable for tomorrow"), false);
  assert.equal(isSeatingQuestion("When is the exam?"), false);
});

test("seat lookup resolves exact or unique partial roster identities and chooses the matching upcoming paper", () => {
  const records = [
    { name: "Aarav Singh", crn: "1234567", section: "ECB", subsection: "ECB1" },
    { name: "Aarav Singh", crn: "2345678", section: "ECB", subsection: "ECB1" },
    { name: "Mira Kaur", crn: "3456789", section: "ECB", subsection: "ECB2" },
    { name: "Mohitveer Singh", crn: "2615231", section: "ECB", subsection: "ECB2" },
    { name: "Mohit Sharma", crn: "5678901", section: "ECB", subsection: "ECB2" }
  ];
  assert.equal(normalizeCrn("123-4567"), "1234567");
  assert.equal(seatingStudentForQuestion("exam room CRN 123-4567", records).record.crn, "1234567");
  assert.equal(seatingStudentForQuestion("exam room CRN 123 4567", records).record.crn, "1234567");
  assert.equal(seatingStudentForQuestion("Aarav Singh exam room", records).status, "ambiguous");
  assert.equal(seatingStudentForQuestion("exam room CRN 9999999", records).status, "not-found");
  assert.equal(seatingStudentForQuestion("my exam room", records, { crn: "3456789" }).status, "active-profile");
  assert.equal(seatingStudentForQuestion("mohitveer sitting plan", records, { crn: "1234567" }).record.crn, "2615231");
  const explicitOtherStudentQuestion = "mohitveer singh sitting plab";
  assert.equal(isSeatingQuestion(explicitOtherStudentQuestion, records), true);
  assert.equal(seatingStudentForQuestion(explicitOtherStudentQuestion, records, { crn: "2617070", name: "Kaushik Jain" }).record.crn, "2615231", "an exact name query can select a different verified student without switching device profile");
  assert.equal(seatingStudentForQuestion("2615231 sitting plan", records, { crn: "2617070" }).record.crn, "2615231");
  assert.equal(seatingStudentForQuestion("mohit sitting plan", records).status, "ambiguous");
  assert.equal(seatingStudentForQuestion("unknownname sitting plan", records, { crn: "1234567" }).status, "not-found", "an unverified named student must not fall back to the active profile");
  assert.equal(seatingStudentForQuestion("sitting plan for maths", records, { crn: "1234567" }).status, "active-profile");
  assert.equal(isSeatingQuestion("Aarav Singh which room", records), true, "an exact roster name plus a room question is recognized");
  assert.equal(isSeatingQuestion("CRN 1234567 room", records), true, "a CRN plus a room question is recognized");

  const plans = [
    { id: "chem-23", subject: "Chemistry", date: "2026-11-23", start: 555, end: 645 },
    { id: "math-24", subject: "Mathematics-I", date: "2026-11-24", start: 555, end: 645 },
    { id: "math-23", subject: "Mathematics-I", date: "2026-11-23", start: 555, end: 645 }
  ];
  assert.equal(selectSeatingPlan(plans, "mera maths room tmrw", { dateISO: "2026-11-22", minutes: 900 }).plan.id, "math-23");
  assert.equal(selectSeatingPlan(plans.slice(0, 1).concat(plans[2]), "my exam room tomorrow", { dateISO: "2026-11-22", minutes: 900 }).status, "ambiguous");
  const html = seatAnswerHtml({ subject: "Maths", date: "2026-11-23", sourceName: "seating.pdf" }, { room: "<F-101>", row: 6 }, (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  assert.match(html, /&lt;F-101&gt;/);
  assert.match(html, /Row <strong>6<\/strong>/);
  const locatedHtml = seatAnswerHtml({ subject: "PPS", date: "2026-11-25", sourceName: "pps-seating.pdf" }, { room: "A8", row: 4, rowLabel: "Row-I" }, (value) => String(value));
  assert.match(locatedHtml, /Row-I &middot; Seat <strong>4<\/strong>/);
  const namedHtml = seatAnswerHtml({ subject: "Maths", date: "2026-11-23", sourceName: "seating.pdf" }, { room: "F-101", row: 2 }, (value) => String(value), "Mohitveer Singh (CRN 2615231)");
  assert.match(namedHtml, /Published seating for <strong>Mohitveer Singh \(CRN 2615231\)<\/strong>/);
  assert.match(namedHtml, /exact CRN in the verified roster/);
});

test("Today shows only the seating plan for the same exam date and matching paper/session", () => {
  const plans = [
    { id: "math-23", subject: "Mathematics-I", title: "Mathematics-I · MSE-II theory", date: "2026-11-23", start: 555, end: 645 },
    { id: "pps-25", subject: "PPS", title: "PPS · MSE-II theory", date: "2026-11-25", start: 555, end: 645 }
  ];
  const maths = { title: "Mathematics-I", category: "MSE-II theory", date: "2026-11-23", start: 555, end: 645 };
  const pps = { title: "PPS", category: "MSE-II theory", date: "2026-11-25", start: 555, end: 645 };
  const missingPaper = { title: "Physics", category: "MSE-II theory", date: "2026-11-26", start: 765, end: 855 };
  assert.equal(selectSeatingPlanForExam(plans, maths)?.id, "math-23");
  assert.equal(selectSeatingPlanForExam(plans, pps)?.id, "pps-25");
  assert.equal(selectSeatingPlanForExam(plans, missingPaper), null, "an earlier subject's plan never carries to a later exam");
  assert.equal(selectSeatingPlanForExam([{ ...plans[1], subject: "MSE-II theory", title: "MSE-II theory" }], { ...pps, title: "MSE-II theory" })?.id, "pps-25", "a generic title can use one unique plan for the exact date and session");
});

test("admin PDF metadata matches a unique subject in the selected datesheet and supports replacing its plan", () => {
  const inferred = inferSeatingPlanMetadata("Seating Plan For PPS MSE-II Nov 2026.pdf", TRANSCRIBED_EXAMS);
  assert.equal(inferred.subject, "PPS");
  assert.equal(inferred.date, "2026-11-25");
  assert.equal(inferred.start, "09:15");
  assert.equal(inferred.end, "10:45");
  assert.equal(inferred.id, "seat-2026-11-25-pps");
  assert.equal(inferSeatingPlanMetadata("unknown MSE-II seating.pdf", TRANSCRIBED_EXAMS), null);
});

test("seating API publishes privately, reveals one exact assignment, and deletes it", async () => {
  const e = env();
  const plan = {
    id: "seat-math-20261123", title: "Mathematics-I MSE-II", subject: "Mathematics-I", date: "2026-11-23",
    start: 555, end: 645, category: "MSE-II theory", sourceName: "maths-seating.pdf",
    seats: [{ crn: "1234567", room: "F-101", row: 6, rowLabel: "Row-IV" }, { crn: "2345678", room: "G-204", row: 1 }]
  };

  assert.equal((await handleRequest(req("/api/admin/seatings"), e, ctx())).status, 401);
  const publish = await handleRequest(jsonReq("/api/admin/seatings", { action: "upsert", plan }), e, ctx());
  assert.equal(publish.status, 200);

  const publicList = await handleRequest(req("/api/seatings"), e, ctx());
  const publicBody = await publicList.json();
  assert.equal(publicBody.plans[0].rows, 2);
  assert.doesNotMatch(JSON.stringify(publicBody), /1234567|2345678|F-101|G-204/);
  const content = await handleRequest(req("/api/content"), e, ctx());
  assert.doesNotMatch(await content.text(), /1234567|2345678|F-101|G-204/);

  const crossSite = await handleRequest(jsonReq("/api/seatings/lookup", { planId: plan.id, crn: "1234567" }, "", { Origin: "https://attacker.test", "CF-Connecting-IP": "203.0.113.8" }), e, ctx());
  assert.equal(crossSite.status, 403);
  const lookup = await handleRequest(jsonReq("/api/seatings/lookup", { planId: plan.id, crn: "1234567" }, "", { "CF-Connecting-IP": "203.0.113.8" }), e, ctx());
  assert.equal(lookup.status, 200);
  const result = await lookup.json();
  assert.deepEqual(result.seat, { room: "F-101", row: 6, rowLabel: "Row-IV" });
  assert.doesNotMatch(JSON.stringify(result), /1234567|2345678|G-204/);

  const badCrn = await handleRequest(jsonReq("/api/seatings/lookup", { planId: plan.id, crn: "123" }), e, ctx());
  assert.equal(badCrn.status, 400);
  const remove = await handleRequest(jsonReq("/api/admin/seatings", { action: "delete", id: plan.id }), e, ctx());
  assert.equal(remove.status, 200);
  const afterDelete = await handleRequest(jsonReq("/api/seatings/lookup", { planId: plan.id, crn: "1234567" }), e, ctx());
  assert.equal(afterDelete.status, 404);
  assert.equal([...e.CONTENT.values.keys()].some((key) => key.includes("203.0.113.8")), false, "lookup limiter never stores raw IP addresses");
});

test("seating API limits public lookups and validates plan rows", async () => {
  const e = env();
  const plan = {
    id: "seat-limit-20261123", title: "Physics", subject: "Physics", date: "2026-11-23", sourceName: "physics.pdf",
    seats: [{ crn: "1234567", room: "F-101" }, { crn: "1234567", room: "G-204" }]
  };
  const invalid = await handleRequest(jsonReq("/api/admin/seatings", { action: "upsert", plan }), e, ctx());
  assert.equal(invalid.status, 400);

  plan.seats = [{ crn: "1234567", room: "F-101", row: 0 }];
  const invalidRow = await handleRequest(jsonReq("/api/admin/seatings", { action: "upsert", plan }), e, ctx());
  assert.equal(invalidRow.status, 400);

  plan.seats = [{ crn: "1234567", room: "F-101", row: 1 }];
  const publish = await handleRequest(jsonReq("/api/admin/seatings", { action: "upsert", plan }), e, ctx());
  assert.equal(publish.status, 200);
  let final;
  for (let index = 0; index < 31; index += 1) {
    final = await handleRequest(jsonReq("/api/seatings/lookup", { planId: plan.id, crn: "1234567" }, "", { "CF-Connecting-IP": "203.0.113.9" }), e, ctx());
  }
  assert.equal(final.status, 429);
});

test("Ask and the profile/date UI route seating queries locally and keep profile history collapsed", async () => {
  const app = await (await import("node:fs/promises")).readFile(new URL("../next/app.js", import.meta.url), "utf8");
  const html = await (await import("node:fs/promises")).readFile(new URL("../next/index.html", import.meta.url), "utf8");
  assert.match(app, /if \(seatingQuestion\) answer = await answerSeatingQuestion\(question\)/);
  assert.match(app, /const explicitlyNamed = target\.status === "matched"/);
  assert.match(app, /const crn = normalizeCrn\(record\?\.crn\)/);
  assert.match(app, /body: JSON\.stringify\(\{ planId: selected\.plan\.id, crn \}\)/);
  assert.match(app, /seatAnswerHtml\(answerPlan, result\.seat, escapeHtml, studentLabel\)/);
  assert.match(app, /if \(!answer && v\("ask\.engine"\) === "auto"/);
  assert.match(app, /Your active profile changed during lookup/);
  assert.match(app, /class="exam-seat-inline"/);
  assert.doesNotMatch(app, /This request names a different roster profile/);
  assert.doesNotMatch(app, /today-seating-card/);
  assert.match(app, /data-admin-sign-in-form/);
  assert.match(app, /element\?\.closest\("\.send-button"\)/);
  assert.match(app, /<details class="profile-history">/);
  assert.match(html, /topbar-clock-time/);
  assert.match(app, /time\.textContent = `\$\{clock\.time\} IST`/);
});
