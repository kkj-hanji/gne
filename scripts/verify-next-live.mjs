/**
 * Read-only live verification for the Next build.
 *
 * This is the scheduled "is the outside world still the same shape?" check.
 * It never writes to KV, never deploys, never prints roster records and never
 * calls an inference API. It only:
 *
 *   1. asks the frozen legacy Worker for its verified public source registry,
 *   2. downloads every required official FET file,
 *   3. parses each file with the Next parser and asserts that real rows exist,
 *   4. confirms the origin and the proxied API still answer.
 *
 * Run locally:
 *   node scripts/verify-next-live.mjs
 *
 * Environment:
 *   LEGACY_ORIGIN  default https://gndec-compass.koush3069.workers.dev
 *   NEXT_ORIGIN    optional; when set, health and proxy health are checked too
 */
import assert from "node:assert/strict";
import { DOMParser } from "linkedom";

import { parseFetTimetable } from "../next/engine/fet-parser.js";

const LEGACY_ORIGIN = (process.env.LEGACY_ORIGIN || "https://gndec-compass.koush3069.workers.dev").replace(/\/+$/, "");
const NEXT_ORIGIN = (process.env.NEXT_ORIGIN || "").replace(/\/+$/, "");
const REQUIRED_VIEWS = ["groups", "teachers", "rooms", "subjects", "years", "subgroups"];
const TIMEOUT_MS = 25_000;

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

async function get(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response;
}

async function checkLegacyRegistry() {
  const response = await get(`${LEGACY_ORIGIN}/api/sources`, { headers: { "X-Compass-Next": "verify" } });
  const payload = await response.json();
  assert.ok(Array.isArray(payload.sources), "the legacy registry must expose a sources array");
  assert.ok(payload.version, "the legacy registry must expose a release version");
  const byId = new Map(payload.sources.map((source) => [source.id, source]));
  for (const id of REQUIRED_VIEWS) {
    const source = byId.get(id);
    assert.ok(source, `the legacy registry is missing ${id}`);
    assert.equal(source.verified, true, `${id} must be verified`);
    assert.match(source.url, /^https:\/\//, `${id} must use HTTPS`);
  }
  console.log(`legacy registry: ${payload.version} (${payload.sources.length} sources)`);
  return byId;
}

async function checkView(id, source) {
  const response = await get(source.url, { headers: { "X-Compass-Next": "verify" } });
  const html = await response.text();
  const rows = parseFetTimetable(html, id, { DOMParser });
  assert.ok(rows.length > 0, `${id} parsed zero rows`);
  assert.equal(rows.unparsedCells, 0, `${id} has unreadable timetable cells`);
  for (const entry of rows) {
    assert.ok(entry.subject, `${id} produced a row without a subject`);
    assert.ok(Number.isFinite(entry.start) && Number.isFinite(entry.end), `${id} produced a row without times`);
  }
  console.log(`${id}: ${rows.length} verified rows`);
  return { id, rows: rows.length, hash: source.contentHash || "" };
}

async function checkNextOrigin() {
  const health = await get(`${NEXT_ORIGIN}/api/health`, { headers: { "X-Compass-Next": "verify" } });
  const body = await health.json();
  assert.equal(body.ok, true, "the Next Worker must report ok");
  console.log(`next health: ${body.app} ${body.version}`);

  const proxied = await get(`${NEXT_ORIGIN}/api/legacy/api/sources`, { headers: { "X-Compass-Next": "verify" } });
  const payload = await proxied.json();
  assert.ok(Array.isArray(payload.sources), "the Next proxy must forward the legacy registry");
  console.log(`next proxy: ${payload.sources.length} sources reachable`);
}

async function main() {
  const byId = await checkLegacyRegistry();
  const results = [];
  for (const id of REQUIRED_VIEWS) results.push(await checkView(id, byId.get(id)));

  if (NEXT_ORIGIN) await checkNextOrigin();
  else console.log("next origin: skipped (set NEXT_ORIGIN to check the deployed Worker)");

  if (process.exitCode) return;
  console.log(`OK ${results.length} official timetable views parsed without guessed data.`);
}

main().catch((error) => {
  fail(error?.message || String(error));
  process.exitCode = 1;
});
