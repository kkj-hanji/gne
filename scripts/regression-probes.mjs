// Regression probes for the 2026-08-26 production bug reports.
import { createAppHarness, addEcb2 } from "./stress-probe-harness.mjs";

let passCount = 0;
let failCount = 0;
const failures = [];
const strip = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const answered = (text) => typeof text === "string" && text.length > 0 && !/could not verify/i.test(text);

function check(label, question, setup, checks) {
  const harness = createAppHarness();
  if (setup) setup(harness.api);
  const answer = harness.api.answerWithoutAi(question);
  const problems = checks(answer).filter(Boolean);
  if (!problems.length) {
    passCount += 1;
    console.log(`ok    [${label}] "${question}" -> ${strip(answer).slice(0, 90)}`);
  } else {
    failCount += 1;
    failures.push({ label, question, problems });
    console.log(`FAIL  [${label}] "${question}" -> ${strip(answer).slice(0, 160)} | ${problems.join("; ")}`);
  }
}

// Bug 1: relative-day words must scope an explicit selection to one day.
// Fixture "today" is Sunday; ECB1 has no Sunday classes.
check("sel-today", "ecb1 today time table", null, (a) => [
  !answered(a) && "no answer",
  /Monday|Tuesday|Wednesday|Thursday|Friday/.test(a) && "whole week leaked"
]);
check("sel-tomorrow", "ECB1 timetable tomorrow", null, (a) => [
  !answered(a) && "no answer",
  !/Monday/.test(a) && "tomorrow should be Monday",
  /Tuesday|Wednesday|Thursday|Friday/.test(a) && "wrong day leaked"
]);

// Bug 2: subgroup codes must resolve as comparison selections.
check("sub-vs-sub", "ecb1 vs ecb2", addEcb2, (a) => [
  !/Compared: ECB1 and ECB2/.test(a) && `not compared: ${strip(a).slice(0, 80)}`,
  /could not verify/i.test(a) && "verification failed"
]);
check("sub-vs-group-reversed", "ecb2 vs ecb1", addEcb2, (a) => [
  !/Compared: ECB2 and ECB1/.test(a) && "not compared",
  /could not verify/i.test(a) && "verification failed"
]);

// Bug 3: X vs Y must never be treated as a student name.
check("vs-not-student", "ecb vs cs", addEcb2, (a) => [
  /No verified student found/i.test(a) && "roster search hijacked the comparison"
]);
check("vs-unloaded-code", "ecb1 vs csd2", addEcb2, (a) => [
  /No verified student found/i.test(a) && "roster search hijacked the comparison",
  (/could not verify/i.test(a) || /Compared:/.test(a)) ? false : "neither compared nor clarified"
]);

console.log(`\nRESULT: ${passCount} passed, ${failCount} failed`);
process.exit(failCount ? 1 : 0);
