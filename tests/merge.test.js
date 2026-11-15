// Run: node tests/merge.test.js   Checks the two-device merge rules in js/app.js (unionInto) without a browser.
const assert = require('assert'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
const a = src.indexOf('  function unionInto(snap) {'), b = src.indexOf('  async function pullMerge()');
assert(a > 0 && b > a, 'unionInto found');
const make = S => new Function('S', src.slice(a, b) + '; return unionInto;')(S);
const sess = (id, rev, pay) => ({ id, date: '2026-11-01', platform: 'Zomato', rev, orders: [{ pay }] });
const base = () => ({ sessions: [], shifts: [], expenses: [], payouts: [], hashes: [], gone: [] });

{ // the same day edited on both devices: the later edit wins, either way round
  const S = Object.assign(base(), { sessions: [sess('a', 100, 10)] });   // "server" copy, older
  make(S)({ sessions: [sess('a', 200, 99)] });                            // this device's newer edit
  assert.strictEqual(S.sessions.length, 1); assert.strictEqual(S.sessions[0].orders[0].pay, 99);
  const T = Object.assign(base(), { sessions: [sess('a', 300, 7)] });
  make(T)({ sessions: [sess('a', 200, 99)] });
  assert.strictEqual(T.sessions[0].orders[0].pay, 7, 'an older copy never overwrites a newer one');
}
{ // a day deleted on one device does not come back from a stale device
  const S = Object.assign(base(), { sessions: [sess('keep', 0, 1)], gone: [{ id: 'x', ts: 5 }] });     // server already knows x is deleted
  make(S)({ sessions: [sess('x', 0, 2), sess('keep', 0, 1)] });                                    // the stale device still has x
  assert.deepStrictEqual(S.sessions.map(s => s.id), ['keep']);
  const T = Object.assign(base(), { sessions: [sess('x', 0, 2), sess('keep', 0, 1)] });              // server still has x
  make(T)({ sessions: [sess('keep', 0, 1)], gone: [{ id: 'x', ts: 9 }] });                           // this device deleted it
  assert.deepStrictEqual(T.sessions.map(s => s.id), ['keep']); assert.deepStrictEqual(T.gone, [{ id: 'x', ts: 9 }]);
}
{ // new records on both devices are all kept; deleted expenses and payouts stay deleted
  const S = Object.assign(base(), { sessions: [sess('s1', 0, 1)], expenses: [{ id: 'e1' }], payouts: [{ id: 'p1' }] });
  make(S)({ sessions: [sess('s2', 0, 2)], expenses: [{ id: 'e2' }, { id: 'e1' }], payouts: [{ id: 'p2' }], gone: [{ id: 'e1', ts: 1 }, { id: 'p1', ts: 1 }] });
  assert.deepStrictEqual(S.sessions.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepStrictEqual(S.expenses.map(e => e.id), ['e2']); assert.deepStrictEqual(S.payouts.map(p => p.id), ['p2']);
}
{ // the newest deletion time is kept when both devices deleted the same id
  const S = Object.assign(base(), { gone: [{ id: 'x', ts: 50 }] });
  make(S)({ gone: [{ id: 'x', ts: 20 }, { id: 'y', ts: 3 }] });
  assert.deepStrictEqual(S.gone.sort((p, q) => (p.id < q.id ? -1 : 1)), [{ id: 'x', ts: 50 }, { id: 'y', ts: 3 }]);
}
console.log('merge OK  edits, deletions, expenses and payouts merge correctly across two devices');
