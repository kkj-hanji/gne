// Explicit refresh only: builds the public 2025-batch roster index from the
// official GNDEC section PDFs. Uses the application's own parser so the bundle
// and the live browser loader agree on field order.
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createAppHarness } from './stress-probe-harness.mjs';

const BATCH = '2025';
const SOURCES = {
  CE: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/CE%20Sections%20sem-2%202025.pdf',
  CS: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/CS%20Sections%20sem-2%202025.pdf',
  EC: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/EC%20Sections%20sem-2%202025.pdf',
  EE: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/EE%20Sections%20sem-2%202025.pdf',
  IT: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/IT%20Sections%20sem-2%202025.pdf',
  ME: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/ME%20Sections%20sem-2%202025.pdf',
  RAI: 'https://appsc.gndec.ac.in/sites/default/files/2026-02/RAI%20Sections%20sem-2%202025.pdf'
};

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}

const { api } = createAppHarness();
const records = [];
const sources = [];
for (const [branch, url] of Object.entries(SOURCES)) {
  if (new URL(url).hostname !== 'appsc.gndec.ac.in') throw new Error('Unverified roster source');
  const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
  const pdf = await getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  try {
    const pages = [];
    for (let page = 1; page <= pdf.numPages; page++) pages.push(api.pdfTextFromItems((await (await pdf.getPage(page)).getTextContent()).items));
    const text = pages.join('\n\f\n');
    const parsed = api.parseStudentSectionText(text, branch, BATCH);
    const rows = text.split('\n').filter((line) => /^\d+\t/.test(line) && line.split(/\t+/).filter((value) => value.trim()).length >= 10);
    if (!parsed.length || parsed.length !== rows.length) throw new Error(`Incomplete ${branch} ${BATCH} roster: ${parsed.length}/${rows.length}`);
    records.push(...parsed);
    sources.push({ batch: BATCH, branch, url, verified: true, pdfSha256: createHash('sha256').update(bytes).digest('hex'), count: parsed.length });
    console.log(`${branch} ${BATCH}: ${parsed.length} verified rows`);
  } finally { await pdf.destroy(); }
}

const generatedAt = new Date().toISOString();
await writeFile('public/data/student-roster-index-2025.json', JSON.stringify({ schemaVersion: 4, generatedAt, sources, records }));
console.log(`Wrote ${records.length} ${BATCH} records across ${sources.length} branches.`);
