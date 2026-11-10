// Explicit refresh only: public official records, parsed with the application's parsers.
// Never import parent details, birth dates or residential contact information.
//
// Each section is independent: an unreachable roster PDF or faculty page keeps
// the last verified bundle for that section while the rest can still refresh.
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createAppHarness } from './stress-probe-harness.mjs';
import { parseFacultyProfileHtml } from '../src/worker.js';
import { readJsonIfPresent, writeJsonWhenChanged } from './lib/stable-json.mjs';

const origin = 'https://gndec-compass.koush3069.workers.dev';
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}

async function refreshRoster() {
  const registry = await (await get(`${origin}/api/sources`)).json();
  const { api } = createAppHarness();
  const records = [], sources = [];
  for (const source of registry.studentSectionSources || []) {
    if (!source.verified || new URL(source.url).hostname !== 'appsc.gndec.ac.in') throw new Error('Unverified roster source');
    const bytes = new Uint8Array(await (await get(source.url)).arrayBuffer());
    const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    try {
      const pages = [];
      for (let page = 1; page <= pdf.numPages; page++) pages.push(api.pdfTextFromItems((await (await pdf.getPage(page)).getTextContent()).items));
      const text = pages.join('\n\f\n');
      const parsed = api.parseStudentSectionText(text, source.branch);
      const rows = text.split('\n').filter(line => /^\d+\t/.test(line) && line.split(/\t+/).filter(value => value.trim()).length >= 10);
      if (!parsed.length || parsed.length !== rows.length) throw new Error(`Incomplete ${source.branch} roster`);
      records.push(...parsed);
      sources.push({ ...source, pdfSha256: createHash('sha256').update(bytes).digest('hex'), count: parsed.length });
      console.log(`${source.branch}: ${parsed.length} verified rows`);
    } finally { await pdf.destroy(); }
  }
  if (!records.length) throw new Error('No verified roster rows were parsed');
  const roster = { schemaVersion: 4, generatedAt: new Date().toISOString(), sources, records };
  return writeJsonWhenChanged('public/data/student-roster-index.json', roster);
}

async function refreshFaculty() {
  const directory = await (await get(`${origin}/api/faculty`)).json();
  if (!directory.records?.length) throw new Error('Empty faculty directory');
  const previous = readJsonIfPresent('public/data/faculty-directory-index.json');
  if (directory.unavailableDepartments?.length && previous?.records?.length) {
    throw new Error(`Faculty directory is incomplete (${directory.unavailableDepartments.map((item) => item.name || item.id).join(', ')})`);
  }
  const previousById = new Map((previous?.records || []).filter((record) => record?.profileId).map((record) => [record.profileId, record]));
  const budgetMs = 8 * 60 * 1000;
  const startedAt = Date.now();
  let cursor = 0;
  let attempted = 0;
  let failed = 0;
  const failures = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < directory.records.length) {
      const record = directory.records[cursor++];
      const old = previousById.get(record.profileId);
      // When the college origin is down, do not spend the whole job timing out:
      // keep the verified profile facts and stop asking after a clear outage.
      const outage = attempted >= 12 && failed === attempted;
      if (outage || Date.now() - startedAt > budgetMs) {
        if (old) Object.assign(record, old, { name: record.name, designation: record.designation || old.designation, department: record.department || old.department });
        continue;
      }
      attempted += 1;
      try {
        const profile = parseFacultyProfileHtml(await (await get(record.profileUrl)).text(), record.profileId);
        if (!profile.name || profile.name.trim().toUpperCase() !== record.name.trim().toUpperCase()) throw new Error('Profile identity mismatch');
        Object.assign(record, profile, { profileCheckedAt: new Date().toISOString() });
      } catch {
        failed += 1;
        failures.push(record.profileId);
        // Keep verified profile facts, but never overwrite the fresh directory identity.
        if (old) Object.assign(record, old, { name: record.name, designation: record.designation || old.designation, department: record.department || old.department });
      }
    }
  }));
  const index = { ...directory, generatedAt: new Date().toISOString(), profileFailures: failures };
  const written = writeJsonWhenChanged('public/data/faculty-directory-index.json', index);
  console.log(`Faculty: ${directory.records.length} directory records; ${failures.length} unavailable detailed profiles (${written ? 'updated' : 'unchanged'}).`);
}

try {
  await refreshRoster();
} catch (error) {
  console.warn(`Roster refresh skipped (${error.message}); keeping the last verified roster.`);
}

try {
  await refreshFaculty();
} catch (error) {
  console.warn(`Faculty refresh skipped (${error.message}); keeping the last verified directory.`);
}
