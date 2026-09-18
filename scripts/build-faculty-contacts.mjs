import { writeFile, readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
const source = 'https://gndec.ac.in/?q=node/6';
const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error('Administration source unavailable');
const { document } = parseHTML((await response.text()).replace(/<!--[\s\S]*?-->/g, ''));
const roles = [];
for (const row of document.querySelectorAll('tr')) {
  const cells = [...row.querySelectorAll(':scope > td')];
  if (cells.length !== 2 || !cells[0].querySelector('u') || !/Phone|Email/i.test(cells[1].textContent)) continue;
  const lines = cells[0].innerHTML.split(/<br\s*\/?>/i).map(text => parseHTML(`<div>${text}</div>`).document.querySelector('div').textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const role = lines[0].replace(/\s*:\s*$/, '');
  const name = lines[1]?.split(/,|\. Assistant/)[0].trim();
  if (!name || !/^(?:Principal|HoD|Controller|AR |Dean|HR |Training|Chief)/i.test(role)) continue;
  const contact = parseHTML(`<div>${cells[1].innerHTML.replace(/<br\s*\/?>/gi, ' ')}</div>`).document.querySelector('div').textContent.replace(/\s+/g, ' ');
  const phones = [...contact.matchAll(/\b(?:0\d{3}-\d{7}|[6-9]\d{9})\b/g)].map(match => match[0]);
  const emails = [...cells[1].querySelectorAll('a[href^="mailto:"]')].map(link => link.getAttribute('href').slice(7));
  roles.push({ role, name, landline: phones.filter(value => value.startsWith('0')).join(', '), phone: phones.filter(value => !value.startsWith('0')).join(', '), email: emails.join(', '), source, contactScope: 'Office contact published for this role; not necessarily a direct personal line.' });
}
if (roles.length < 15) throw new Error('Administration layout requires review');
// Official portals disagree about these appointments. Preserve that uncertainty.
for (const role of roles.filter(item => /Alumni|Chief Warden/.test(item.role))) {
  role.conflict = 'Official administration and ERP pages list different holders. Current appointment needs confirmation.';
  role.conflictSource = 'https://erp.gndec.ac.in/gndec';
}
// Individually verified supplements; no office inferred from teaching/mentoring rooms.
const people = [
  { profileId: '42', office: 'Ground Floor, Electronics Block, GNDEC, Ludhiana', source: 'https://ece.gndec.ac.in/' },
];
const directory = JSON.parse(await readFile('public/data/faculty-directory-index.json', 'utf8'));
const mann = directory.records.find(record => /kulvinder.*mann/i.test(record.name));
if (mann) people.push({ profileId: mann.profileId, phone: '9915507920', source: 'https://it.gndec.ac.in/' });
const roster = JSON.parse(await readFile('public/data/student-roster-index.json', 'utf8'));
const canonical = value => value.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\b(dr|er|prof|pf|mr|ms|mrs)\b/g, ' ').replace(/\s+/g, ' ').trim();
for (const record of directory.records) {
  const matches = roster.records.filter(student => canonical(student.mentor) === canonical(record.name));
  const phones = [...new Set(matches.map(student => student.mentorPhone).filter(phone => /^[6-9]\d{9}$/.test(phone)))];
  if (phones.length !== 1) continue; // conflicting phones are not silently resolved
  const existing = people.find(person => person.profileId === record.profileId);
  if (existing?.phone) continue;
  const person = existing || { profileId: record.profileId };
  person.phone = phones[0];
  person.phoneSource = roster.sources.find(source => source.branch === matches[0].branch).url;
  person.phoneLabel = 'Public mentoring contact from the official student roster';
  if (!existing) people.push(person);
}
await writeFile('public/data/faculty-contacts.json', JSON.stringify({ checkedAt: new Date().toISOString(), source, roles, people }, null, 2));
console.log(`${roles.length} published administrative roles; ${people.length} individually sourced supplements`);
