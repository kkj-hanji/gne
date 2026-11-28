import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("../next/app.js", import.meta.url), "utf8");

function createLoader(fetchJson) {
  const start = app.indexOf("async function loadIndexedSyllabusKnowledge() {");
  const end = app.indexOf("\nasync function loadSyllabusIndex()", start);
  assert.ok(start >= 0 && end > start, "renderSyllabus dependencies must stay defined in the Next app");
  const context = {
    state: {
      indexedSyllabusStatus: "idle",
      indexedSyllabusCourses: [],
      indexedSyllabusSources: [],
      indexedSyllabusPromise: null
    },
    fetchJson,
    console: { warn() {} }
  };
  vm.createContext(context);
  vm.runInContext(`${app.slice(start, end)}\nglobalThis.loadIndexedSyllabusKnowledge = loadIndexedSyllabusKnowledge;`, context);
  return context;
}

const validIndex = {
  courses: [{
    id: "cse-3-test",
    department: "Computer Science & Engineering",
    title: "Test course",
    code: "CSE101",
    semesters: ["3"],
    units: [{ number: "1", title: "Foundations" }],
    sourceUrl: "https://gndec.ac.in/syllabus.pdf"
  }],
  sources: [{
    department: "Computer Science & Engineering",
    sourceTitle: "Current B.Tech syllabus",
    sourceUrl: "https://gndec.ac.in/syllabus.pdf",
    semesters: ["3"]
  }]
};

test("indexed syllabus loader exists, validates the response, and shares concurrent requests", async () => {
  let requests = 0;
  let resolveResponse;
  const pendingResponse = new Promise((resolve) => { resolveResponse = resolve; });
  const context = createLoader(async () => { requests += 1; return pendingResponse; });

  const first = context.loadIndexedSyllabusKnowledge();
  const second = context.loadIndexedSyllabusKnowledge();
  assert.equal(requests, 1, "render and Ask must share one in-flight index download");
  resolveResponse(validIndex);
  const [courses, concurrentCourses] = await Promise.all([first, second]);

  assert.equal(courses.length, 1);
  assert.equal(concurrentCourses.length, 1);
  assert.equal(context.state.indexedSyllabusStatus, "ready");
  assert.equal(context.state.indexedSyllabusSources.length, 1);
  assert.equal(context.state.indexedSyllabusPromise, null);
});

test("indexed syllabus loader contains fetch failures and returns a safe empty fallback", async () => {
  const context = createLoader(async () => { throw new Error("offline"); });
  const result = await context.loadIndexedSyllabusKnowledge();

  assert.equal(result.length, 0);
  assert.equal(context.state.indexedSyllabusStatus, "error");
  assert.equal(context.state.indexedSyllabusSources.length, 0);
  assert.equal(context.state.indexedSyllabusPromise, null);
});
