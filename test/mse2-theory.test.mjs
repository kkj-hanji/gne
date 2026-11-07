import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { createAppHarness } from "../scripts/stress-probe-harness.mjs";

const source = await readFile(new URL("../public/mse2-theory.js", import.meta.url), "utf8");

function theoryContext() {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return context.CompassMse2Theory;
}

test("MSE-II theory date sheet keeps both Applied Sciences groups and the EDG split", () => {
  const theory = theoryContext();
  assert.equal(theory.source.reference, "APS/11/2368");
  assert.equal(theory.entries.length, 11);
  assert.deepEqual(Array.from(theory.groups.chemistry.sections), ["CSA", "CSB", "CSC", "CSD", "CSE", "CSF", "ITA", "ITB", "ITC"]);
  assert.deepEqual(Array.from(theory.groups.physics.sections), ["MEA", "MEB", "CEA", "CEB", "EEA", "EEB", "ECA", "ECB", "RAI"]);
  assert.equal(theory.groupForSection("CSA2"), "chemistry");
  assert.equal(theory.groupForSection("MEB1"), "physics");
  assert.equal(theory.groupForSection("A9"), "");
  const edg = theory.entries.filter((row) => row.subject === "edg");
  assert.deepEqual(Array.from(edg, (row) => [row.start, row.end, row.sections.join(",")]), [
    [660, 750, "MEA,MEB,CEA,CEB,RAI"],
    [780, 870, "EEA,EEB,ECA,ECB"]
  ]);
});

test("MSE-II theory resolver scopes by group, section, subject and date without inventing rooms", () => {
  const theory = theoryContext();
  assert.equal(theory.resolve("Physics exam"), null);
  assert.equal(theory.resolve("MSE-I date sheet"), null);
  assert.equal(theory.matches("MSE-2 datesheet"), true);

  const all = theory.resolve("MSE-2 date sheet");
  assert.equal(all.entries.length, 11);
  assert.match(all.message, /no room, venue, seat/i);

  const chemistry = theory.resolve("MSE-2 chemistry group date sheet");
  assert.equal(chemistry.entries.length, 5);
  assert.ok(chemistry.entries.every((row) => row.group === "chemistry"));
  assert.match(chemistry.entries.map((row) => row.label).join(" "), /BEEE/);

  const physics = theory.resolve("MSE-2 physics group date sheet");
  assert.equal(physics.entries.length, 6);
  assert.ok(physics.entries.every((row) => row.group === "physics"));

  const meb = theory.resolve("MSE-2 theory date sheet for MEB1");
  assert.ok(meb.entries.length >= 5);
  assert.deepEqual(Array.from(meb.entries.filter((row) => row.subject === "edg"), (row) => row.start), [660]);

  const eca = theory.resolve("MSE-2 EDG date sheet for ECA2");
  assert.deepEqual(Array.from(eca.entries, (row) => [row.start, row.end]), [[780, 870]]);

  const missing = theory.resolve("MSE-2 chemistry Economics paper");
  assert.equal(missing.entries.length, 0);
  assert.match(missing.message, /does not establish/);

  const dated = theory.resolve("MSE-2 datesheet on 26 November 2026", { temporal: { dates: ["2026-11-26"] } });
  assert.deepEqual(Array.from(dated.entries, (row) => [row.group, row.label]), [["chemistry", "Chemistry"], ["physics", "Physics"]]);
});

test("Ask Compass answers the MSE-II theory date sheet in every local engine mode", () => {
  const { api } = createAppHarness();
  for (const mode of ["legacy", "v2", "v12", "v22"]) {
    api.state.settings.brainMode = mode;
    const answer = api.answerWithoutAi("MSE-2 theory date sheet");
    assert.match(answer, /MSE-II/);
    assert.match(answer, /23 Nov 2026/);
    assert.match(answer, /12:45 PM/);
    assert.match(answer, /APS\/11\/2368/);
    assert.match(answer, /user-supplied/i);
    assert.doesNotMatch(answer, /room [A-Z0-9-]+/i);

    const mst = api.answerWithoutAi("MST-2 datesheet");
    assert.match(mst, /MSE-II/);
    assert.doesNotMatch(mst, /HOD meeting minutes/);

    assert.match(api.answerWithoutAi("When does MST-2 start?"), /21 November 2026/);
    assert.match(api.answerWithoutAi("MSE-2 workshop date sheet"), /MP \(Workshops\)/);
  }
});
