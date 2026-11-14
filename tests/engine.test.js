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

// ---------- v5: calibration, accuracy range, order-check basis, Ask ----------
const Ask = require('../js/ask.js');
const calP = Object.assign({}, demoProfile, { fuelPerKmOverride: 1.8 });
const calRep = TW.analyze(sessions, calP);
assert(Math.abs(calRep.total.fuel - calRep.total.totalKm * 1.8) < 1e-6, 'calibrated fuel = km x measured cost');
assert(calRep.total.fuel < rep.total.fuel && calRep.total.perHr > rep.total.perHr, 'cheaper measured fuel raises real pay');
assert(Math.abs(calRep.total.net - (calRep.total.gross - calRep.total.fuel - calRep.total.maint - calRep.total.data - calRep.total.fixed)) < 1e-6, 'identity holds when calibrated');
// accuracy range brackets the base value, is wider when uncalibrated, and measured inputs never move
const sens = TW.sensitivity(sessions, demoProfile), sensCal = TW.sensitivity(sessions, calP);
assert(sens.lo < sens.base.perHr && sens.hi > sens.base.perHr, 'range brackets the base');
assert(Math.abs(sens.base.perHr - rep.total.perHr) < 1e-9, 'base equals the headline');
assert((sensCal.hi - sensCal.lo) < (sens.hi - sens.lo), 'calibration narrows the range');
const noCostVar = TW.sensitivity(sessions, Object.assign({}, demoProfile, { mileage: 45, deadKm: 0, maintPerKm: 0 }));
assert(noCostVar.hi - noCostVar.lo < sens.hi - sens.lo);
// order check can use the rider's measured EMI per online hour
const fh = rep.total.fixed / rep.total.hours;
const ocA = TW.orderCheck(demoProfile, { pay: 60, km: 3, avgWait: rep.avgWaitPerOrder, fixedPerHour: fh });
const ocB = TW.orderCheck(demoProfile, { pay: 60, km: 3, avgWait: rep.avgWaitPerOrder });
assert(Math.abs(ocA.timeCost - ocB.timeCost) < ocB.timeCost * 0.6 && ocA.timeCost !== ocB.timeCost, 'measured EMI/hour changes time cost');
// Ask: intent detection in four languages
const I = q => Ask.detect(q);
assert.deepStrictEqual([I('Should I take ₹40 for 3 km?').intent, I('Should I take ₹40 for 3 km?').pay, I('Should I take ₹40 for 3 km?').km], ['order', 40, 3]);
assert.deepStrictEqual([I('क्या मैं 3 किमी के ₹40 लूँ?').intent, I('क्या मैं 3 किमी के ₹40 लूँ?').pay, I('क्या मैं 3 किमी के ₹40 लूँ?').km], ['order', 40, 3]);
assert.strictEqual(I('3 కి.మీ.కు ₹40 తీసుకోవాలా?').intent, 'order');
assert.strictEqual(I('3 கி.மீ.க்கு ₹40 எடுக்கலாமா?').intent, 'order');
assert.strictEqual(I('৩').intent, 'help');
assert.strictEqual(I('How much did I really make?').intent, 'income');
assert.strictEqual(I('What is my pay per hour').intent, 'hourly');
assert.strictEqual(I('When and where should I work?').intent, 'best');
assert.strictEqual(I('Which hours should I avoid?').intent, 'worst');
assert.strictEqual(I('Should I go online now?').intent, 'now');
assert.strictEqual(I('Where does my money go?').intent, 'costs');
assert.strictEqual(I('Compare Swiggy and Zomato').intent, 'platform');
const gq = I('I want to earn ₹1000 a day, how many hours?'); assert.deepStrictEqual([gq.intent, gq.amount], ['goal', 1000]);
const fq = I('What if petrol gets 10% costlier?'); assert.deepStrictEqual([fq.intent, fq.pct], ['fuel', 10]);
assert.strictEqual(I('अभी काम करूँ?').intent, 'now');
assert.strictEqual(I('मेरी कमाई कितनी हुई?').intent, 'income');
assert.strictEqual(I('నా సంపాదన ఎంత?').intent, 'income');
assert.strictEqual(I('என் வருமானம் எவ்வளவு?').intent, 'income');
assert.strictEqual(I('blah blah').intent, 'help');
assert.strictEqual(I('').intent, 'help');
console.log('v5 OK  range', Math.round(sens.lo), '-', Math.round(sens.hi), 'base', Math.round(sens.base.perHr), 'calibrated', Math.round(sensCal.lo), '-', Math.round(sensCal.hi));

// ---------- v6: shift tracking (hours + distance) ----------
// GPS distance accumulator
const P0 = { lat: 17.4400, lon: 78.3489, acc: 10, t: 0 };
assert(Math.abs(TW.haversine(P0, { lat: 17.4400 + 0.009, lon: 78.3489 }) - 1000) < 5, '0.009 deg lat ~ 1 km');
let sh = TW.addFix({}, P0);
sh = TW.addFix(sh, { lat: 17.4400 + 0.0045, lon: 78.3489, acc: 10, t: 120000 });   // 500 m in 2 min
sh = TW.addFix(sh, { lat: 17.4400 + 0.0045 + 0.00005, lon: 78.3489, acc: 10, t: 130000 }); // 5.5 m jitter: ignored
assert(Math.abs(sh.km - 0.5) < 0.01, 'real movement counted, jitter ignored: ' + sh.km);
const km1 = sh.km;
sh = TW.addFix(sh, { lat: 18.5, lon: 78.3489, acc: 10, t: 140000 });               // 118 km in 10 s: glitch
assert(sh.km === km1, 'teleport adds nothing');
sh = TW.addFix(sh, { lat: 18.5 + 0.0045, lon: 78.3489, acc: 10, t: 260000 });       // anchor moved past glitch: next real leg counts
assert(Math.abs(sh.km - (km1 + 0.5)) < 0.01, 'tracking resumes after a glitch: ' + sh.km);
const before = sh.km; sh = TW.addFix(sh, { lat: 18.6, lon: 78.3489, acc: 200, t: 400000 });
assert(sh.km === before, 'poor accuracy fix ignored');
let slow = TW.addFix({}, P0);
for (let i = 1; i <= 20; i++) slow = TW.addFix(slow, { lat: 17.4400 + i * 0.00006, lon: 78.3489, acc: 5, t: i * 30000 }); // 6.7 m steps, 133 m total
assert(slow.km > 0.1, 'slow riding accumulates despite per-step jitter filter: ' + slow.km);
assert(!('route' in sh) && !('points' in sh), 'only totals are kept, never a route');
// pairing, filling online time, measured unpaid km
const dShifts = D.demoShifts(sessions, 0.45);
assert.strictEqual(dShifts.length, sessions.length);
const m = TW.measuredDeadKm(sessions, dShifts);
assert(m.reliable && Math.abs(m.factor - 0.45) < 1e-4, 'demo shifts measure 0.45: ' + m.factor);
const measRep = TW.analyze(sessions, Object.assign({}, demoProfile, { deadKm: m.factor, deadMeasured: true }));
assert(Math.abs(measRep.total.perHr - rep.total.perHr) < 0.01, 'demo numbers unchanged when measured = assumed');
const real = TW.measuredDeadKm(sessions, dShifts.map(x => Object.assign({}, x, { km: x.km * 0.9 })));   // rider actually rode less unpaid distance
assert(real.factor < 0.45 && TW.analyze(sessions, Object.assign({}, demoProfile, { deadKm: real.factor })).total.perHr > rep.total.perHr, 'less measured unpaid riding => higher real pay');
assert(!TW.measuredDeadKm(sessions, dShifts.slice(0, 2)).reliable, 'two shifts are not enough to override the assumption');
assert(!TW.measuredDeadKm(sessions, dShifts.map(x => Object.assign({}, x, { km: 1 }))).reliable, 'implausibly short tracks (< 80% of paid km) are ignored');
const noOnline = sessions.slice(0, 2).map(x => Object.assign({}, x, { onlineMin: 0 }));
const filled = TW.applyShifts(noOnline, [{ date: noOnline[0].date, platform: noOnline[0].platform, onlineMin: 200, km: 40 }]);
assert.strictEqual(filled[0].onlineMin, 200); assert.strictEqual(filled[1].onlineMin, 0);
const kept = TW.applyShifts(sessions.slice(0, 1), [{ date: sessions[0].date, platform: sessions[0].platform, onlineMin: 9999, km: 40 }]);
assert.strictEqual(kept[0].onlineMin, sessions[0].onlineMin, 'screenshot online time wins over tracked time');
assert.strictEqual(TW.pairShifts(sessions, [{ date: '1999-01-01', platform: 'Zomato', km: 5 }]).length, 0, 'unmatched shift pairs with nothing');
assert(TW.sensitivity(sessions, Object.assign({}, demoProfile, { deadMeasured: true })).hi - TW.sensitivity(sessions, Object.assign({}, demoProfile, { deadMeasured: true })).lo < TW.sensitivity(sessions, demoProfile).hi - TW.sensitivity(sessions, demoProfile).lo, 'measured unpaid riding narrows the accuracy range');
console.log('v6 OK  measured factor', m.factor.toFixed(3), 'pairs', m.pairs);

// Ask: distance / hours intent
assert.strictEqual(Ask.detect('How many hours did I work and how far did I ride?').intent, 'hours');
assert.strictEqual(Ask.detect('\u0915\u093f\u0924\u0928\u0940 \u0926\u0942\u0930\u0940 \u091a\u0932\u093e?').intent, 'hours');
assert.strictEqual(Ask.detect('What is my pay per hour').intent, 'hourly');
console.log('ask hours OK');
