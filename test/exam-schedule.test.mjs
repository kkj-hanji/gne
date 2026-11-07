import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import "../public/exam-domain.js";
import { examResponse } from "../src/exam-store.js";

const source = await readFile(new URL("../public/exam-schedule.js", import.meta.url), "utf8");

test("withdrawn MSE-I date sheet has no active rows or source document", async () => {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  const result = context.CompassExams.resolve("MSE-I date sheet");
  assert.deepEqual(Array.from(result.entries), []);
  assert.match(result.message, /removed from Compass/);
  assert.equal(result.source.url, "");

  const seed = JSON.parse(await readFile(new URL("../src/data/exam-seed.json", import.meta.url), "utf8"));
  const summary = JSON.parse(await readFile(new URL("../public/data/exam-summary.json", import.meta.url), "utf8"));
  assert.deepEqual(seed.events, []);
  assert.deepEqual(seed.seats, []);
  assert.deepEqual(summary.events, []);
  assert.deepEqual(summary.seats, []);
});

test("Cloudflare publication filters MSE-I events and their seating from current and rollback data", async () => {
  class MemoryKv {
    values = new Map();
    async get(key) { return this.values.has(key) ? JSON.parse(this.values.get(key)) : null; }
    async put(key, value) { this.values.set(key, value); }
  }
  const event = { id: "mse1-test", kind: "theory", title: "Physics", date: "2026-10-01", start: 555, end: 645, report: null, sections: ["ECB"], source: "test MSE-I date sheet", sourceUrl: "/notices/mse1-test.html", note: "test" };
  const publication = { schemaVersion: 1, revision: "test", publishedAt: "2026-10-01T00:00:00Z", events: [event], seats: [{ eventId: event.id, crn: "2612345", room: "A1", row: "Row-I", seat: "1", page: 1 }] };
  const kv = new MemoryKv();
  await kv.put("gndec-compass:exam-publication:v1", JSON.stringify(publication));
  await kv.put("gndec-compass:exam-publication:v1:previous", JSON.stringify(publication));
  const response = await examResponse(new Request("https://compass.test/api/exams"), { SOURCE_REGISTRY: kv });
  assert.deepEqual((await response.json()).events, []);
  for (const key of ["gndec-compass:exam-publication:v1", "gndec-compass:exam-publication:v1:previous"]) {
    const cleaned = await kv.get(key);
    assert.deepEqual(cleaned.events, []);
    assert.deepEqual(cleaned.seats, []);
  }
});

test("active app keeps MSE-II workshop support and does not preload the withdrawn MSE-I notice", async () => {
  const [practicals, html, sw] = await Promise.all([
    readFile(new URL("../public/practical-exams.js", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8")
  ]);
  assert.match(practicals, /2026-11-18/);
  assert.doesNotMatch(practicals, /2026-10-0[789]/);
  assert.doesNotMatch(html + sw, /mse1-practicals-2026\.html/);
});
