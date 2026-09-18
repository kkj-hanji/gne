import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAppHarness } from '../scripts/stress-probe-harness.mjs';

function harness() {
  const h = createAppHarness();
  Object.assign(h.context, { URL, AbortController });
  vm.runInContext('globalThis.directoryApi = { loadCurrentRosterRecords, rosterIndexUsable, currentRosterCacheKey, resolveChatStudentLookup, resolveChatFacultyLookup, legacyFacultyLookupAnswer, facultyLookupRequest, studentLookupRequest, timetableTypeTag };', h.context);
  h.api.state.rosterCache = null;
  h.api.state.facultyCache = null;
  return { ...h, dir: h.context.directoryApi };
}
function snapshot() {
  const branches = ['CE','CS','EC','EE','IT','ME','RAI'];
  return { schemaVersion: 4, generatedAt: new Date().toISOString(), sources: branches.map(branch => ({ branch, url: `https://appsc.gndec.ac.in/${branch}.pdf`, contentHash: branch, verified: true, count: 1 })), records: branches.map((branch, index) => ({ name: `${branch} TEST STUDENT`, crn: `261000${index}`, branch, section: `${branch}B`, subsection: `${branch}B1` })) };
}

test('roster index: one download for concurrent lookups; device cache works without network', async () => {
  const h = harness(), data = snapshot();
  h.api.state.sourceRegistry = { studentSectionSources: data.sources };
  let calls = 0;
  h.context.fetch = async url => { calls++; assert.equal(url, '/data/student-roster-index.json'); return { ok: true, json: async () => data }; };
  const results = await Promise.all([h.dir.loadCurrentRosterRecords(), h.dir.loadCurrentRosterRecords()]);
  assert.equal(calls, 1);
  assert.equal(results[0].records.length, 7);
  h.api.state.rosterCache = null;
  h.context.fetch = () => { throw new Error('Offline'); };
  assert.equal((await h.dir.loadCurrentRosterRecords()).records.length, 7);
  const lookup = await h.dir.resolveChatStudentLookup('find EC TEST STUDENT');
  assert.equal(lookup.status, 'single');
  assert.equal(lookup.records[0].subsection, 'ECB1');
});

test('roster index rejects outdated, partial, changed-source and malformed data', () => {
  const h = harness(), data = snapshot();
  h.api.state.sourceRegistry = { studentSectionSources: data.sources };
  assert.equal(h.dir.rosterIndexUsable(data), true);
  for (const broken of [{ ...data, schemaVersion: 0 }, { ...data, generatedAt: '2000-01-01' }, { ...data, records: data.records.slice(1) }, { ...data, sources: [] }]) assert.equal(h.dir.rosterIndexUsable(broken), false);
  h.api.state.sourceRegistry.studentSectionSources = data.sources.map(source => ({ ...source, url: source.url + '?revised=1' }));
  assert.equal(h.dir.rosterIndexUsable(data), false);
});

test('missing indexed student retries the existing official PDF loader without changing profile', async () => {
  const h = harness(), data = snapshot();
  h.api.state.sourceRegistry = { studentSectionSources: data.sources };
  h.context.fetch = async () => ({ ok: true, json: async () => data });
  h.context.refreshed = 0;
  vm.runInContext('fetchCurrentRosterRecords = async () => { globalThis.refreshed++; return {records:[{name:"ZXYUVW QZX", crn:"9999999", branch:"EC", section:"ECB", subsection:"ECB2"}], version:"revised", unavailableBranches:[]}; };', h.context);
  const before = JSON.stringify(h.api.state.student);
  const result = await h.dir.resolveChatStudentLookup('find student ZXYUVW QZX');
  assert.equal(h.context.refreshed, 1);
  assert.equal(result.records[0].subsection, 'ECB2');
  assert.equal(JSON.stringify(h.api.state.student), before);
});

test('faculty contact questions resolve the faculty, expose sourced contacts collapsed and never invent offices', async () => {
  const h = harness();
  const faculty = JSON.parse(await readFile('public/data/faculty-directory-index.json', 'utf8'));
  faculty.generatedAt = new Date().toISOString();
  const contacts = JSON.parse(await readFile('public/data/faculty-contacts.json', 'utf8'));
  h.context.fetch = async url => ({ ok: true, json: async () => url.includes('contacts') ? contacts : faculty });
  for (const question of ['Dr Chahat Jain phone', 'give me Chahat Jain phone', 'Chahat Jain landline number', 'teacher Chahat Jain email', 'where is Chahat Jain office']) {
    assert.equal(h.dir.studentLookupRequest(question), null);
    const lookup = await h.dir.resolveChatFacultyLookup(question, { includeProfile: false });
    assert.equal(lookup.status, 'single', question);
    assert.equal(lookup.records[0].profileId, '126');
    const answer = h.dir.legacyFacultyLookupAnswer(lookup);
    assert.match(answer, /faculty-contact-disclosure/);
    assert.match(answer, /chahatjain@gndec.ac.in/);
    assert.match(answer, /Office \/ Cabin:<\/strong> Not published/);
    assert.doesNotMatch(answer, /<details[^>]*\bopen\b/);
    for (const mode of ['legacy', 'v12', 'v2', 'v22']) {
      h.api.state.settings = { ...h.api.state.settings, brainMode: mode };
      const result = h.api.runCompassBrain(question, h.context.CompassBrainV2, { facultyLookup: lookup });
      if (result) assert.match(result.answer, /faculty-contact-disclosure/);
    }
  }
  const munish = await h.dir.resolveChatFacultyLookup('Munish Rattan office', { includeProfile: false });
  assert.equal(munish.records[0].office, 'Ground Floor, Electronics Block, GNDEC, Ludhiana');
});

test('administrative roles use active branch and preserve source conflicts', async () => {
  const h = harness();
  const contacts = JSON.parse(await readFile('public/data/faculty-contacts.json', 'utf8'));
  h.context.fetch = async () => ({ ok: true, json: async () => contacts });
  h.api.state.student = { name: 'TEST', branch: 'EC', section: 'ECB', subsection: 'ECB1' };
  const hod = await h.dir.resolveChatFacultyLookup('who is our HOD');
  assert.equal(hod.status, 'roles'); assert.equal(hod.records.length, 1);
  assert.match(hod.records[0].name, /Munish Rattan/);
  assert.match(h.dir.legacyFacultyLookupAnswer(hod), /ece@gndec.ac.in/);
  const dean = await h.dir.resolveChatFacultyLookup('dean academics phone');
  assert.equal(dean.records.length, 1); assert.match(dean.records[0].name, /Akshay/);
  const alumni = await h.dir.resolveChatFacultyLookup('dean alumni');
  assert.match(h.dir.legacyFacultyLookupAnswer(alumni), /different holders/);
  const ambiguous = await h.dir.resolveChatFacultyLookup('who is dean');
  assert.match(h.dir.legacyFacultyLookupAnswer(ambiguous), /Which dean/);
});

test('tutorial badges depend only on published type, never subject wording', () => {
  const { dir } = harness();
  assert.match(dir.timetableTypeTag({ type: 't' }), /aria-label="Tutorial"/);
  for (const type of ['L','P','',undefined]) assert.equal(dir.timetableTypeTag({ type, subject: 'tutorial' }), '');
});

test('every bundled official faculty name resolves to its own identity or an explicit ambiguity', async () => {
  const h = harness();
  const faculty = JSON.parse(await readFile('public/data/faculty-directory-index.json', 'utf8'));
  faculty.generatedAt = new Date().toISOString();
  const contacts = JSON.parse(await readFile('public/data/faculty-contacts.json', 'utf8'));
  h.context.fetch = async url => ({ ok: true, json: async () => url.includes('contacts') ? contacts : faculty });
  for (const person of faculty.records) {
    const lookup = await h.dir.resolveChatFacultyLookup(`teacher ${person.name} phone`, { includeProfile: false });
    assert.ok(['single', 'multiple'].includes(lookup?.status), `${person.name}: ${lookup?.status}`);
    assert.ok(lookup.records.some(record => record.profileId === person.profileId), `${person.name}: wrong identity`);
    if (lookup.status === 'single') assert.equal(lookup.records[0].profileId, person.profileId);
  }
});
