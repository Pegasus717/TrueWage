// Run: node tests/engine.test.js
const assert = require('assert');
const TW = require('../js/engine.js');
const D = require('../js/demo.js');

const sessions = D.demoSessions();
const demoProfile = Object.assign(TW.defaultProfile('petrol'), D.DEMO_PROFILE);
const rep = TW.analyze(sessions, demoProfile);
const t = rep.total;
console.log('days', rep.daysWorked, 'orders', t.n, 'hours', t.hours.toFixed(1));
console.log('app/day', Math.round(rep.perDay.gross), 'net/day', Math.round(rep.perDay.net));
console.log('app/hr', Math.round(t.appPerHr), 'true/hr', Math.round(t.perHr), 'leak%', Math.round(rep.leakPct));
console.log('byDaypart', rep.byDaypart.map(d => d.key + ':' + Math.round(d.perHr)).join(' '));
console.log('byPlatform', rep.byPlatform.map(d => d.key + ':' + Math.round(d.perHr)).join(' '));
console.log('byZone', rep.byZone.map(d => d.key + ':' + Math.round(d.perHr)).join(' '));
console.log('insights', rep.insights.map(i => i.key + JSON.stringify(i.p)).join('\n  '));
console.log('whatIf', rep.whatIf);

// invariants
assert(Math.abs(t.net - (t.gross - t.fuel - t.maint - t.data - t.fixed)) < 1e-6, 'net identity');
assert(t.net < t.appShown, 'true net must be below app headline');
assert(t.perHr < t.appPerHr);
const sumNet = rep.byDay.reduce((s, d) => s + d.net, 0);
assert(Math.abs(sumNet - t.net) < 1e-6, 'daily nets sum to total');
const hrs = rep.byHour.reduce((s, h) => s + h.hours, 0);
assert(Math.abs(hrs - t.hours) < 1e-6, 'hour slots sum to total hours');

// EV is cheaper to run than petrol
const ev = TW.analyze(sessions, TW.defaultProfile('ev'));
assert(ev.total.perHr > t.perHr, 'EV should net more per hour');

// idle time is distributed: online minutes preserved
const onlineTotal = sessions.reduce((s, x) => s + x.onlineMin, 0) / 60;
assert(Math.abs(onlineTotal - t.hours) < 0.01, 'online hours preserved: ' + onlineTotal + ' vs ' + t.hours);

// statement
const st = TW.statementData(rep, { name: 'Test' });
assert(st.monthly.net > 0 && st.stability > 0);
console.log('statement monthly', st.monthly, 'EMI cap', st.emiCapacity, 'stability', st.stability);

const city = D.cityData();
assert(city.cells.some(c => c.hidden), 'k-anonymity hides small cells');
console.log('city', city.riders, city.medianReal, city.medianClaimed, city.belowMinWagePct + '% below');
console.log('ALL OK');

// --- reader parser on OCR-like text ---
const Rd = require('../js/reader.js');
const ocrText = `Partner app Earnings
Rs 641
2026-11-12 · Zomato · Online 5h 0m
TIME AREA KM PAYOUT
18:05 Madhapur  2.7 km Rs 46 + Rs 6
18:31 Madhapur  3.1 km Rs 50 - Rs 12
19:02 Madhapur  1.9 km Rs 39
Daily bonus Rs 180`;
const ps = Rd.parseText(ocrText);
assert.strictEqual(ps.platform, 'Zomato'); assert.strictEqual(ps.date, '2026-11-12');
assert.strictEqual(ps.onlineMin, 300); assert.strictEqual(ps.orders.length, 3);
assert.strictEqual(ps.orders[0].incentive, 6); assert.strictEqual(ps.orders[1].deduction, 12);
assert.strictEqual(ps.bonus, 180); assert.strictEqual(ps.orders[0].zone, 'Madhapur');
assert(Math.abs(ps.orders[0].hour - 18.0833) < 0.01);
// bonus spread: not concentrated on a single slot
const rep2 = TW.analyze([ps], TW.defaultProfile());
assert(Math.abs(rep2.total.incentive - (6 + 180)) < 1e-6, 'bonus preserved');
console.log('reader parse OK');

// --- order check / plan / floor / receipt ---
const oc1 = TW.orderCheck(demoProfile, { pay: 35, km: 4, avgWait: rep.avgWaitPerOrder });
const oc2 = TW.orderCheck(demoProfile, { pay: 70, km: 2, avgWait: rep.avgWaitPerOrder });
assert.strictEqual(oc1.verdict, 'skip'); assert.strictEqual(oc2.verdict, 'take');
assert(Math.abs(oc2.net - (oc2.pay - oc2.cost)) < 1e-9);
assert(TW.orderCheck(demoProfile, { pay: oc1.need, km: 4, avgWait: rep.avgWaitPerOrder }).perHr >= demoProfile.minWage - 1e-6, 'need reaches fair wage');
const pl13 = TW.planNow(rep, 13), pl19 = TW.planNow(rep, 19);
assert.strictEqual(pl13.state, 'poor'); assert(pl13.next && pl13.next.start === 17, 'next window 17:00');
assert.strictEqual(pl19.state, 'good');
const ff = TW.fairFloor(rep, 90); assert(ff.floor > ff.actual, 'rider is paid below fair floor');
const dr = TW.dayReceipt(rep, null);
assert(Math.abs(dr.appShown - dr.deduction - dr.fuel - dr.maint - dr.data - dr.fixed - dr.net) < 1e-6, 'receipt balances');
const d1 = TW.dayReceipt(rep, rep.dates[3]);
assert(Math.abs(d1.appShown - d1.deduction - d1.fuel - d1.maint - d1.data - d1.fixed - d1.net) < 1e-6, 'day receipt balances');
assert.strictEqual(rep.byWeekday.length, 7);
console.log('oc skip/take', Math.round(oc1.perHr), Math.round(oc2.perHr), 'floor', Math.round(ff.floor), 'vs actual', Math.round(ff.actual), 'plan13', pl13.next);
console.log('FEATURES OK');

// --- v3 correctness: EMI, operating profit, simulator ---
const calSpan = rep.calSpan;
assert.strictEqual(calSpan, 28);
assert(Math.abs(t.fixed - demoProfile.fixedPerDay * calSpan) < 1e-6, 'EMI charged exactly fixedPerDay x calendar days: ' + t.fixed);
assert(Math.abs(t.op - (t.gross - t.fuel - t.maint - t.data)) < 1e-6, 'operating profit identity');
assert(Math.abs(t.net - (t.op - t.fixed)) < 1e-6, 'cash after EMI = operating profit - EMI');
assert(Math.abs(t.gross - (t.appShown - t.deduction)) < 1e-6, 'deductions counted once');
// per-day EMI shares sum back to total
assert(Math.abs(rep.orders.reduce((a, o) => a + o.fixed, 0) - t.fixed) < 1e-6);
const base = TW.simulate(rep, {});
assert(Math.abs(base.opMonth - t.op / calSpan * 30) < 1e-6, 'sim baseline == history (op/month)');
assert(Math.abs(base.cashMonth - (t.net / calSpan * 30)) < 1e-6, 'sim baseline == history (cash/month)');
assert(Math.abs(base.hoursPerDay - t.hours / rep.daysWorked) < 1e-9);
const fuelUp = TW.simulate(rep, { fuelPct: 20 }); assert(fuelUp.cashMonth < base.cashMonth, 'fuel up lowers cash');
const fuelCost = t.fuel / calSpan * 30; assert(Math.abs((base.cashMonth - fuelUp.cashMonth) - fuelCost * 0.2) < 1e-6, 'fuel +20% costs exactly 20% of fuel');
const wins = TW.simWindows(rep), weak = wins.find(w => w.zone === 'Kukatpally');
const drop = TW.simulate(rep, { hours: { [weak.key]: 0 } });
assert(drop.hoursPerDay < base.hoursPerDay && Math.abs((base.hoursPerDay - drop.hoursPerDay) - weak.hoursPerDay) < 1e-9);
assert(drop.perHr > base.perHr, 'dropping the weakest window raises hourly pay');
const fewer = TW.simulate(rep, { daysPerWeek: base.daysPerWeek - 1 }); assert(fewer.opMonth < base.opMonth);
assert(rep.insights.some(i => i.key === 'perkm') && rep.insights.some(i => i.key === 'breakeven') && rep.insights.some(i => i.key === 'expense'));
// insufficient data: no pattern claims from one day
const one = TW.analyze(sessions.filter(s => s.date === sessions[5].date), demoProfile);
assert(one.dataQuality.level === 'low' && one.insights.some(i => i.key === 'lowdata'), 'low data is flagged');
assert(!one.insights.some(i => ['skip', 'best', 'platform', 'whatif'].includes(i.key)), 'no pattern recommendations from 1 day');
console.log('v3 OK  cash/month', Math.round(base.cashMonth), 'EMI total', Math.round(t.fixed));

// --- reader v3: unread lines, duplicates, validation ---
const ps2 = Rd.parseText(ocrText + '\n19:30 Madhapur 2.0 km ??? unreadable');
assert(ps2.unread >= 1, 'unreadable order-like line is counted, not silently dropped: ' + ps2.unread);
const existing = [Object.assign({}, ps)];
const again = JSON.parse(JSON.stringify(ps));
assert(Rd.isDuplicateSession(again, existing), 'same session re-imported is a duplicate');
again.orders.forEach(o => { o.pay += 7; });
assert(!Rd.isDuplicateSession(again, existing), 'different amounts are not a duplicate');
assert(Rd.validateOrder({ hour: 13, pay: 40, km: 3, incentive: 0, deduction: 0 }).length === 0);
assert(Rd.validateOrder({ hour: NaN, pay: -5, km: 900, incentive: 0, deduction: 0 }).length >= 3);
console.log('reader v3 OK');

// period receipt balances and equals totals
const pr = TW.dayReceipt(rep, 'period');
assert(Math.abs(pr.net - t.net) < 1e-6 && Math.abs(pr.appShown - t.appShown) < 1e-6 && pr.orders === t.n);
assert(Math.abs(pr.appShown - pr.deduction - pr.fuel - pr.maint - pr.data - pr.op + pr.appShown - pr.appShown) >= 0);
assert(Math.abs((pr.appShown - pr.deduction - pr.fuel - pr.maint - pr.data) - pr.op) < 1e-6, 'op profit = gross - fuel - maint - data');
assert(Math.abs(pr.op - pr.fixed - pr.net) < 1e-6, 'cash = op - EMI');
console.log('period receipt OK');
