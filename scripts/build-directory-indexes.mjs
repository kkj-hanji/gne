// Explicit refresh only: public official records, parsed with the application's parsers.
// Never import parent details, birth dates or residential contact information.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createAppHarness } from './stress-probe-harness.mjs';
import { parseFacultyProfileHtml } from '../src/worker.js';

const origin = 'https://gndec-compass.koush3069.workers.dev';
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
const registry = await (await get(`${origin}/api/sources`)).json();
const { api } = createAppHarness();
const records = [], sources = [];
for (const source of registry.studentSectionSources) {
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
const generatedAt = new Date().toISOString();
const roster = { schemaVersion: 4, generatedAt, sources, records };
await writeFile('public/data/student-roster-index.json', JSON.stringify(roster));

const directory = await (await get(`${origin}/api/faculty`)).json();
if (!directory.records?.length || directory.unavailableDepartments?.length) throw new Error('Incomplete faculty directory');
let cursor = 0;
const failures = [];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < directory.records.length) {
    const record = directory.records[cursor++];
    try {
      const profile = parseFacultyProfileHtml(await (await get(record.profileUrl)).text(), record.profileId);
      if (!profile.name || profile.name.trim().toUpperCase() !== record.name.trim().toUpperCase()) throw new Error('Profile identity mismatch');
      Object.assign(record, profile, { profileCheckedAt: generatedAt });
    } catch { failures.push(record.profileId); }
  }
}));
await writeFile('public/data/faculty-directory-index.json', JSON.stringify({ ...directory, generatedAt, profileFailures: failures }));
console.log(`Faculty: ${directory.records.length} directory records; ${failures.length} unavailable detailed profiles`);
