import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createAppHarness } from '../scripts/stress-probe-harness.mjs';

const source = await readFile('public/room-availability.js', 'utf8');
const labels = ['S101', 'S102', 'F113', 'G6', 'A9', 'AUTOMOBILE LAB', 'IT LAB', 'OS LAB CSE DEPT'];
const rows = labels.map((group, i) => ({ group, day: 'Monday', start: i === 0 ? 840 : 600, end: i === 0 ? 900 : 660 }));
function harness() {
  const h = createAppHarness();
  vm.runInContext(source, h.context);
  vm.runInContext('globalThis.roomsAnswer = roomAvailabilityAnswer;', h.context);
  return h;
}

test('room areas, codes and exact boundary occupancy use published room rows', () => {
  const engine = harness().context.CompassRoomAvailability;
  for (const [area, expected] of [['S',['S102']],['F',['F113']],['G',['G6']],['A',['A9']],['Automobile',['AUTOMOBILE LAB']],['IT',['IT LAB']],['CSE',['OS LAB CSE DEPT']]]) {
    for (const word of ['free','empty','available','khali']) {
      const result = engine.resolve(`which rooms are ${word} in ${area} Monday at 2 PM`, rows, 'Monday', 840);
      assert.deepEqual(Array.from(result.rooms || []), expected, `${word} ${area}: ${result.error}`);
    }
  }
  assert.equal(engine.resolve('is room S101 free', rows, 'Monday', 899).rooms.length, 0);
  assert.deepEqual(Array.from(engine.resolve('is room S 101 free', rows, 'Monday', 900).rooms), ['S101']);
  assert.equal(engine.resolve('free rooms in S and F', rows, 'Monday', 840).checked, 3);
});

test('unknown areas, missing days, malformed times and ranges never claim availability', () => {
  const engine = harness().context.CompassRoomAvailability;
  for (const [query, day, time] of [['free rooms in Z','Monday',840],['room S999 free','Monday',840],['free rooms','Sunday',840],['free rooms','Monday',NaN],['free rooms after 2 PM','Monday',840],['free rooms between 1 PM and 3 PM','Monday',840]]) {
    assert.ok(engine.resolve(query,rows,day,time).error, query);
  }
});

test('app room answer uses full room view, date/time, safe source checks and honest availability wording', () => {
  const h = harness();
  h.api.state.sourceRegistry = { sources: [{ id: 'rooms', contentHash: 'current', url: 'https://appsc.gndec.ac.in/rooms.html' }] };
  h.api.state.timetableViews.set('rooms', { revision: 'current', schedule: rows });
  const answer = h.context.roomsAnswer('which rooms are free in S Monday at 2 PM');
  assert.match(answer, /S102/); assert.doesNotMatch(answer, /S101/);
  assert.match(answer, /no class listed/); assert.match(answer, /does not confirm access/);
  assert.match(h.context.roomsAnswer('free rooms in S tomorrow'), /What time/);
  assert.match(h.context.roomsAnswer('free rooms at 25:90'), /check the date|What time/i);
  h.api.state.timetableViews.set('rooms', { revision: 'obsolete', schedule: rows });
  assert.match(h.context.roomsAnswer('free rooms in S Monday at 2 PM'), /unavailable/);
  assert.match(h.context.roomsAnswer('free rooms 31 February at 2 PM'), /check the date/i);
});
