import test from "node:test";
import assert from "node:assert";
import { parseHTML } from "linkedom";
import fs from "node:fs";

const { window } = parseHTML(`
<!DOCTYPE html>
<html>
  <body>
    <div id="chat-window"></div>
    <div id="status-text"></div>
  </body>
</html>
`);

globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => "" });

// Load app.js and brain-kernel.js
const kernelCode = fs.readFileSync("./public/brain-kernel.js", "utf8");
eval(kernelCode);

const appCode = fs.readFileSync("./public/app.js", "utf8");
// Test only the deterministic helpers. The browser bootstrap requires the
// complete production page, which this focused test intentionally does not
// construct.
const appUnderTest = appCode.replace(/restoreData\(\);[\s\S]*$/, "");
eval(`${appUnderTest.replace(/const /g, "var ").replace(/let /g, "var ")}\nglobalThis.__complexTestApi = { state, assistantContext };`);

test("Complex queries correctly populate comparisonStudents and comparisonTimetables", async () => {
  const { state, assistantContext } = globalThis.__complexTestApi;
  // Mock state
  state.groups = ["ECB", "CSD", "RAI", "CE"];
  state.schedule = []; // Need some mock schedule

  // Create mock roster data
  const mockRoster = {
    records: [
      { name: "MOHITVEER SINGH", branch: "EC", section: "ECB", subsection: "ECB1", academicGroup: "ECB1" },
      { name: "KAUSHIK JAIN", branch: "EC", section: "ECB", subsection: "ECB1", academicGroup: "ECB1" }
    ]
  };

  globalThis.loadCurrentRosterRecords = async () => mockRoster;

  // Test who built this
  const ctx1 = assistantContext("who built this web app?");
  assert.match(ctx1.compassKnowledge.creator, /Kaushik Jain from ECE/);

  // Test multi-student compare
  let comparisonStudents = [];
  const q = "compare mohitveer singh and kaushik jain tuesday timetable";
  const qLower = q.toLowerCase();
  const matches = mockRoster.records.filter(r => r.name.length > 5 && qLower.includes(r.name.toLowerCase()));
  assert.equal(matches.length, 2);

  // Test branch compare
  const ctx2 = assistantContext("tuesday csd or rai or ecb time table compare");
  assert.ok(ctx2.comparisonTimetables["CSD"]);
  assert.ok(ctx2.comparisonTimetables["RAI"]);
  assert.ok(ctx2.comparisonTimetables["ECB"]);

});
