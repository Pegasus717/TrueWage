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

// ---------- v7: planner, area switching, weekly coach, Bengaluru ----------
const hyd = D.cityData('Hyderabad'), blr = D.cityData('Bengaluru');
assert.strictEqual(hyd.city, 'Hyderabad'); assert.strictEqual(blr.city, 'Bengaluru');
assert(hyd.medianReal === 82 && hyd.riders === 2846, 'Hyderabad simulated data unchanged');
assert(blr.zones.includes('Koramangala') && blr.zones.includes('Whitefield') && blr.zones.length === 8, 'Bengaluru areas');
assert(blr.cells.some(c => c.hidden) && blr.cells.every(c => c.hidden === (c.n < D.K_ANON)), 'k-anonymity applied to Bengaluru too');
const bSess = D.demoSessions('2026-11-13', 'Bengaluru');
assert(bSess.every(s => ['Whitefield', 'Electronic City', 'Koramangala'].includes(s.orders[0].zone)), 'Bengaluru rider works Bengaluru areas');
const bRep = TW.analyze(bSess, demoProfile);
assert(bRep.total.perHr > 0 && Math.abs(bRep.total.net - (bRep.total.op - bRep.total.fixed)) < 1e-6, 'Bengaluru demo balances');
const bSkip = bRep.insights.find(i => i.key === 'skip' && i.p.zone === 'Electronic City');
assert(bSkip, 'Bengaluru rider is told to skip Electronic City lunch');
// plan my day
const plan = TW.planDay(rep, 800);
assert(plan.segments.length >= 1 && plan.segments.every(g => g.perHr >= demoProfile.minWage), 'only profitable windows');
assert(plan.reached && plan.expected >= 800 && plan.hours <= 12, 'goal reached within the day: ' + plan.expected.toFixed(0) + ' in ' + plan.hours + 'h');
assert(plan.segments.every((g, i, a) => i === 0 || g.start >= a[i - 1].start), 'schedule is chronological');
assert(!plan.segments.some(g => /Kukatpally/.test(g.zone)), 'planner avoids the loss-making lunch window');
const bigGoal = TW.planDay(rep, 99999); assert(!bigGoal.reached && bigGoal.hours <= 12, 'unreachable goal is reported honestly, never faked');
assert.strictEqual(TW.planDay(rep, 0).segments.length, 0);
const planBlr = TW.planDay(bRep, 800); assert(planBlr.segments.every(g => g.zone !== 'Electronic City'));
// area switching
const sw = TW.areaSwitch(rep, hyd.cells);
assert(sw.length >= 1 && sw[0].p.from === 'Kukatpally' && sw[0].p.src === 'city' && sw[0].p.b > sw[0].p.a * 1.25, 'switch advice from city data: ' + JSON.stringify(sw[0] && sw[0].p));
assert.deepStrictEqual(TW.areaSwitch(rep, []).filter(x => x.p.src === 'city'), [], 'no city data => no city claim');
const swBlr = TW.areaSwitch(bRep, blr.cells); assert(swBlr.some(x => x.p.from === 'Electronic City'));
// own-area switch preferred over city when the rider has worked the better area at the same time
const ownSess = JSON.parse(JSON.stringify(sessions)).map(s => s); ownSess.forEach(s => { if (s.platform === 'Zomato') { s.orders.forEach(o => { o.hour = 12 + (o.hour % 2); o.zone = 'Madhapur'; }); s.onlineMin = 150; } });
const ownRep = TW.analyze(ownSess, demoProfile); const ownSw = TW.areaSwitch(ownRep, hyd.cells);
assert(ownSw.some(x => x.p.src === 'own' && x.p.from === 'Kukatpally' && x.p.to === 'Madhapur'), 'own better area at the same time is preferred: ' + JSON.stringify(ownSw.map(x => x.p)));
// weeks + weekly coach
const wk = TW.weeks(rep, 6); assert(wk.length >= 3 && wk[0].to === rep.dates[rep.dates.length - 1], 'weeks end on the latest day');
assert(Math.abs(wk.reduce((a, w) => a + w.net, 0) - rep.orders.filter(o => o.date >= wk[wk.length - 1].from).reduce((a, o) => a + o.net, 0)) < 1e-6, 'weekly cash adds up');
const coach = TW.weeklyCoach(rep); assert(coach && coach.cur && coach.win && coach.cur.days >= 1);
assert.strictEqual(TW.weeklyCoach(TW.analyze(sessions.slice(0, 6), demoProfile)), null, 'no coach with under 8 days');
console.log('v7 OK  plan', plan.segments.map(g => g.start + '-' + g.end + ' ' + g.zone).join(' | '), '| switch', sw[0].p.from, '->', sw[0].p.to, '| coach win', coach.win.key, 'fix', coach.fix && coach.fix.key);

// ---- v9: reader copes with other screenshot layouts ----
{
  const a = Rd.parseText('Swiggy Delivery\n13 Nov 2026\nLogged in: 5 hrs 30 mins\n12:10 Madhapur 3.2 km ₹52\n13:05 Kondapur 2.0 km ₹41 + ₹10\n');
  assert.strictEqual(a.date, '2026-11-13'); assert.strictEqual(a.onlineMin, 330); assert.strictEqual(a.orders.length, 2); assert.strictEqual(a.platform, 'Swiggy');
  const b = Rd.parseText('Zomato\nNov 9, 2026\nOnline time 6h 5m\nOrder ₹48 2.5 km\nOrder ₹60 4.1 km\n19:10 Gachibowli 3.0 km ₹55');
  assert.strictEqual(b.date, '2026-11-09'); assert.strictEqual(b.onlineMin, 365); assert.strictEqual(b.orders.length, 3);
  assert.strictEqual(b.guessedHours, 2, 'orders without a time are accepted but flagged'); assert.strictEqual(b.orders[0].hour, 13);
  const c = Rd.parseText('Rapido Captain\n09/11/2026\n5h 20m online\n8:30 am Uppal 1.8 km Rs 38\nTotal earnings Rs 1,450 for 24 km');
  assert.strictEqual(c.date, '2026-11-09'); assert.strictEqual(c.onlineMin, 320); assert.strictEqual(c.orders.length, 1, 'a totals line is not an order');
  const d = Rd.parseText('99/99/2026 nothing useful'); assert.strictEqual(d.orders.length, 0);
  console.log('v9 OK  reader layouts');
}

// ---- v10: noisy OCR, lost rupee signs, totals-only screens ----
{
  const a = Rd.parseText('Zomato\n13/11/2026\nOnline 7 hrs 10 mins\nl2:10 Madhapur 3.2 km ?52\nI3:05 Kondapur 2.0 km %41\n14.30 Gachibowli 4.5 km ₹60.50 - ₹5');
  assert.strictEqual(a.orders.length, 3, 'OCR confusions fixed'); assert.strictEqual(a.orders[0].pay, 52); assert.strictEqual(a.orders[1].pay, 41);
  assert.ok(Math.abs(a.orders[2].hour - 14.5) < 1e-9); assert.strictEqual(a.orders[2].deduction, 5); assert.strictEqual(a.onlineMin, 430);
  const b = Rd.parseText('Swiggy\n12 Nov\n19:10 Uppal 3.0 km 55\n20:05 Uppal 2.2 km 48 12');
  assert.strictEqual(b.orders.length, 2, 'rupee sign lost'); assert.strictEqual(b.orders[1].incentive, 12);
  const c = Rd.parseText('Rapido Captain\nToday 13 Nov\nToday\'s earnings Rs 1,240\n14 trips\nOnline 6h 30m\nDistance 72 km');
  assert.ok(c.summary && c.orders.length === 14, 'totals-only screen becomes a flagged summary'); assert.strictEqual(Math.round(c.orders.reduce((x, o) => x + o.pay, 0)), 1240);
  assert.strictEqual(c.guessedHours, 14); assert.strictEqual(c.onlineMin, 390);
  const d = Rd.parseText('Wallet balance ₹ 2,300\nTotal earnings ₹ 9,000\n12:10 Madhapur 3.2 km ₹52'); assert.strictEqual(d.orders.length, 1); assert.ok(!d.summary);
  const e = Rd.parseText('lorem ipsum nothing here'); assert.strictEqual(e.orders.length, 0);
  console.log('v10 OK  noisy OCR, summary screens');
}

// ---- v11: the rupee sign read as a digit (the most common real OCR failure) ----
{
  const txt = 'Swiggy Delivery Partner\n13 Nov 2026\nLogged in 6 hrs 40 mins\n12:10 PM Order #4821 3.2km 52.00\n12:48 PM Order #4830 1.8 km ¥38.00 +%10.00\n01:35 PM Order #4851 4.5km 264.00\n02:20 PM Order #4866 2.4 km 241.00\n07:15 PM Order #4902 3.9 km %58.00 +%15.00\nPeak hour bonus 260\n';
  const r = Rd.parseText(txt);
  assert.strictEqual(r.orders.length, 5); assert.deepStrictEqual(r.orders.map(o => o.pay), [52, 38, 64, 41, 58]);
  assert.strictEqual(r.orders[1].incentive, 10); assert.strictEqual(r.orders[4].incentive, 15); assert.strictEqual(r.bonus, 60);
  assert.strictEqual(r.fixedAmounts, 3, 'three amounts were corrected and will be flagged');
  const ok = Rd.parseText('Zomato\n12:00 Madhapur 8.0 km ₹264\n'); assert.strictEqual(ok.orders[0].pay, 264, 'a plausible high fare is left alone');
  console.log('v11 OK  rupee-as-digit correction');
}

// ---- v12: card-style screens (one order over several lines) ----
{
  const card = 'Zomato Delivery Partner\nEarnings history\nFri, 13 Nov 2026\nOnline 7h 5m\nOrder #4821\n12:10 PM · Delivered\nDistance 3.2 km\n₹52.00\nOrder #4830\n12:48 PM · Delivered\nDistance 1.8 km\nOrder payout ₹38.00\nIncentive ₹10.00\nOrder #4851\n01:35 PM · Delivered\n4.5 km\n₹64.00\nTotal earnings ₹164.00';
  const a = Rd.parseText(card);
  assert.strictEqual(a.orders.length, 3); assert.deepStrictEqual(a.orders.map(o => o.pay), [52, 38, 64]); assert.strictEqual(a.orders[1].incentive, 10); assert.strictEqual(a.onlineMin, 425);
  assert.deepStrictEqual(a.orders.map(o => o.km), [3.2, 1.8, 4.5]);
  const b = Rd.parseText('Rapido Captain\n13/11/2026\nRide 1\n12:10 PM Madhapur to Kondapur\n3.2 km Cash\n₹52\nRide 2\n01:05 PM Uppal to Secunderabad\n6.1 km UPI\n₹88');
  assert.strictEqual(b.orders.length, 2); assert.strictEqual(b.orders[1].zone, 'Uppal'); assert.strictEqual(b.orders[1].pay, 88); assert.ok(!b.summary);
  console.log('v12 OK  card layouts');
}

// ---- v13: output captured from real in-browser OCR of generated Zomato/Rapido style screens ----
{
  const z = 'Zomato Delivery Partner\nEarnings - Fri, 13 Nov 2026\nOnline 7h 5m\nOrder #4821 Delivered\n12:10 PM\nDistance 3.2 km\nOrder payout ¥52.00\nOrder #4830 Delivered\n12:48 PM\nDistance 1.8 km\nOrder payout 38.00\nIncentive ~~ +¥10.00\nOrder #4851 Delivered\n01:35 PM\nDistance 4.5 km\nOrder payout ¥64.00\nTotal earnings ¥278\n';
  const a = Rd.parseText(z);
  assert.deepStrictEqual(a.orders.map(o => [o.pay, o.incentive]), [[52, 0], [38, 10], [64, 0]]); assert.strictEqual(a.onlineMin, 425);
  const r = 'Rapido Captain\n13/11/2026 - Login hours 5:40\nRide 1 09:30 AM\nUppal to Secunderabad 6.1 km 788\nRide 2 10:25 AM\nUppal to Dilsukhnagar 4.4 Km Z64\nRide 3 12:05 PM\nMadhapur to Kondapur 3.2 km 52\nRide 4 06:40 PM\nGachibowli to Madhapur 5.0 km Z79\nTotal earnings ¥283\n';
  const b = Rd.parseText(r);
  assert.deepStrictEqual(b.orders.map(o => o.pay), [88, 64, 52, 79], JSON.stringify(b.orders.map(o => o.pay))); assert.strictEqual(b.onlineMin, 340); assert.strictEqual(b.fixedAmounts, 1);
  assert.strictEqual(b.orders[1].zone, 'Uppal');
  console.log('v13 OK  real OCR output of card/table screens');
}

// ---- v14: a screenshot from months ago must not make the rider "pay" EMI for the gap ----
{
  const mk = (date, pay) => ({ id: 'x' + date, date, platform: 'Rapido', onlineMin: 300, bonus: 0, orders: [{ hour: 12, zone: 'Uppal', km: 4, pay, incentive: 0, deduction: 0, durMin: 20 }] });
  const rep2 = TW.analyze([mk('2025-07-27', 521), mk('2026-11-14', 280)], Object.assign(TW.defaultProfile('petrol'), { fixedPerDay: 120 }));
  assert.strictEqual(rep2.calSpan, 4, 'long gap counts as 3 days');
  assert.ok(rep2.total.net > 0, 'net stays positive: ' + rep2.total.net);
  const demoRep = TW.analyze(D.demoSessions(), Object.assign(TW.defaultProfile('petrol'), { fixedPerDay: 120 }));
  assert.strictEqual(Math.round(demoRep.total.fixed), 120 * demoRep.calSpan);
  console.log('v14 OK  sparse history span', rep2.calSpan, 'demo span', demoRep.calSpan);
}

// ---- v15: place detection (addresses from real screenshots, truncation, typos, GPS) ----
{
  const P = require('../js/places.js');
  const z = t => (P.fromText(t) || {}).zone;
  assert.strictEqual(z('Old Bowenpally - 1-30-121, Ward No 7 Secunderabad, Padmavathi Nagar Colony, Alwal, Hyderabad, Secunderabad, 500010'), 'Bowenpally');
  assert.strictEqual(z('121, Phase 4, Railway Colony, Cherlapa...'), 'Cherlapally');
  assert.strictEqual(z('SRT-213, Lane Number 6, Jawahar Nag...'), 'Jawahar Nagar');
  assert.strictEqual(z('Mytrivanam Bus Stop - Times House, Road Number 2, Green Valley, Banjara Hills'), 'Banjara Hills');
  assert.strictEqual(z('Flat 4, Gachibowly, near DLF'), 'Gachibowli');               // misspelling in the alias table
  assert.strictEqual(z('Koramangla 5th block'), 'Koramangala');                       // fuzzy: one letter missing
  assert.strictEqual(z('Matrix Orchids, Matrix Orchids, Linga...'), undefined);        // nothing known: never guessed
  assert.strictEqual(P.canon('hsr layout sector 2').zone, 'HSR Layout'); assert.strictEqual(P.canon('Unknown').zone, 'Unknown'); assert.strictEqual(P.canon('Some Colony').known, false);
  assert.strictEqual(P.nearest(17.4490, 78.3900).zone, 'Madhapur'); assert.strictEqual(P.nearest(12.9340, 77.6250).zone, 'Koramangala');
  assert.strictEqual(P.nearest(28.6139, 77.2090), null, 'Delhi is outside the covered cities');
  assert.deepStrictEqual(P.dominant({ Madhapur: 90, Kondapur: 20 }).zone, 'Madhapur'); assert.strictEqual(P.dominant({ Madhapur: 5 }), null);
  assert.strictEqual(P.cityOf('Whitefield'), 'Bengaluru');
  console.log('v15 OK  places:', P.PLACES.length, 'areas');
}

// ---- v15b: the area of a screenshot with none is taken from the GPS-tracked shift of that day; AI zones become canonical ----
{
  const sess = [{ id: 'a', date: '2026-11-13', platform: 'Rapido', onlineMin: 0, bonus: 0, orders: [{ hour: 12, zone: 'Unknown', km: 3, pay: 50, incentive: 0, deduction: 0, durMin: 20 }, { hour: 13, zone: 'Uppal', km: 3, pay: 50, incentive: 0, deduction: 0, durMin: 20 }] }];
  const sh = [{ id: 's1', date: '2026-11-13', platform: 'Rapido', onlineMin: 300, km: 30, zone: 'Madhapur', zoneMin: { Madhapur: 200, Kondapur: 40 } }];
  const out = TW.applyShifts(sess, sh)[0];
  assert.strictEqual(out.orders[0].zone, 'Madhapur'); assert.strictEqual(out.orders[0].zoneSrc, 'gps'); assert.strictEqual(out.orders[1].zone, 'Uppal', 'a zone read from the screenshot is never overwritten');
  assert.strictEqual(out.onlineMin, 300); assert.strictEqual(sess[0].orders[0].zone, 'Unknown', 'input is not mutated');
  const n = Rd.normalizeSession({ platform: 'Rapido', date: '2026-11-13', orders: [{ time: '10:00', zone: 'Old Bowenpally - 1-30-121, Ward 7', km: 3, pay: 50 }, { time: '11:00', zone: 'Cherlapa...', km: 2, pay: 40 }, { time: '12:00', zone: 'Some Colony', km: 2, pay: 40 }] }, 't');
  assert.deepStrictEqual(n.orders.map(o => o.zone), ['Bowenpally', 'Cherlapally', 'Some Colony']);
  console.log('v15b OK  zone fill from GPS shift, canonical zones');
}

// ---- v16: expenses (actual costs) and fuel calibration from fill-ups ----
{
  const prof = Object.assign(TW.defaultProfile('petrol'), D.DEMO_PROFILE);
  const base = TW.analyze(sessions, prof), dts = base.dates;
  const ex = [{ id: 'a', date: dts[3], category: 'parking_toll', amount: 300 }, { id: 'b', date: dts[5], category: 'fine', amount: 500 }, { id: 'c', date: '2000-01-01', category: 'other', amount: 9999 }, { id: 'd', date: dts[4], category: 'fuel', amount: 700, odo: 5000 }];
  const withEx = TW.analyze(sessions, Object.assign({}, prof, { expenses: ex }));
  assert.ok(Math.abs((base.total.net - withEx.total.net) - 800) < 1e-6, 'only the two in-period non-fuel expenses reduce cash (out-of-period and fuel entries do not): ' + (base.total.net - withEx.total.net));
  assert.ok(Math.abs(withEx.total.gross - withEx.total.fuel - withEx.total.maint - withEx.total.data - withEx.total.fixed - withEx.total.net) < 1e-6, 'costs still balance to the paisa');
  assert.ok(Math.abs(withEx.total.maint - base.total.maint - 800) < 1e-6); assert.strictEqual(withEx.extras.n, 2);
  // an actual repair replaces the per-km repairs estimate instead of being added to it
  const rep = TW.analyze(sessions, Object.assign({}, prof, { expenses: [{ id: 'r', date: dts[2], category: 'repair', amount: 1200 }] }));
  assert.ok(Math.abs(rep.total.maint - 1200) < 1e-6, 'maint is exactly the logged repair: ' + rep.total.maint); assert.ok(rep.total.net > base.total.net - 1200 + base.total.maint - 1);
  // fill-ups with odometer -> real petrol cost per km
  const fills = [{ category: 'fuel', amount: 500, odo: 10000, litres: 5 }, { category: 'fuel', amount: 420, odo: 10100, litres: 4 }, { category: 'fuel', amount: 450, odo: 10190, litres: 4.2 }, { category: 'fuel', amount: 60, odo: 10195 }];
  const f = TW.fuelFromFills(fills);
  assert.strictEqual(f.pairs, 2); assert.ok(Math.abs(f.perKm - (420 + 450) / 190) < 1e-9); assert.ok(f.reliable); assert.ok(Math.abs(f.mileage - 190 / 8.2) < 1e-9);
  assert.strictEqual(TW.fuelFromFills([{ category: 'fuel', amount: 500, odo: 10000 }]).perKm, null);
  console.log('v16 OK  expenses balance, repair replaces estimate, fuel calibrated at', f.perKm.toFixed(2), 'per km');
}

// ---- v17: weekday x time-of-day heatmap ----
{
  assert.ok(rep.weekdayDaypart.length > 5); assert.ok(rep.bestSlot && rep.bestSlot.days >= 2 && rep.bestSlot.hours >= 1.5);
  const top = Math.max.apply(null, rep.weekdayDaypart.filter(c => c.days >= 2 && c.hours >= 1.5).map(c => c.perHr)); assert.ok(Math.abs(rep.bestSlot.perHr - top) < 1e-9);
  const sumN = rep.weekdayDaypart.reduce((a, c) => a + c.n, 0); assert.strictEqual(sumN, rep.total.n, 'every order lands in exactly one weekday/daypart cell');
  console.log('v17 OK  best slot', rep.bestSlot.wd, rep.bestSlot.daypart, Math.round(rep.bestSlot.perHr));
}

// ---- v18: a logged service is a real repair-type cost (replaces the per-km estimate, never doubled) ----
{
  const prof = Object.assign(TW.defaultProfile('petrol'), D.DEMO_PROFILE);
  const base = TW.analyze(sessions, prof), dts = base.dates;
  const svc = TW.analyze(sessions, Object.assign({}, prof, { expenses: [{ id: 's', date: dts[2], category: 'service', amount: 900, odo: 12000 }] }));
  assert.ok(Math.abs(svc.total.maint - 900) < 1e-6, 'maint is exactly the logged service: ' + svc.total.maint);
  assert.ok(svc.extras.hasRepair && svc.extras.n === 1);
  assert.ok(Math.abs(svc.total.gross - svc.total.fuel - svc.total.maint - svc.total.data - svc.total.fixed - svc.total.net) < 1e-6, 'costs still balance to the paisa');
  console.log('v18 OK  service logged as a repair-type cost');
}

// ---- v19: cost model: owned / rented, detailed wear, traffic, cycle ----
{
  const base = Object.assign(TW.defaultProfile('petrol'), { fixedPerDay: 0 });
  assert.strictEqual(TW.fixedDaily(base), 0);
  const owned = Object.assign({}, base, { emiPerMonth: 3000, insurancePerYear: 3650 });
  assert.ok(Math.abs(TW.fixedDaily(owned) - (100 + 10)) < 1e-9, 'owned: EMI/30 + insurance/365: ' + TW.fixedDaily(owned));
  const rented = Object.assign({}, owned, { ownership: 'rented', rentPerDay: 350 });
  assert.ok(Math.abs(TW.fixedDaily(rented) - 350) < 1e-9, 'rented: rent only, loan and insurance ignored');
  assert.strictEqual(TW.maintKm(rented), 0, 'the owner pays repairs on a rented vehicle');
  assert.ok(Math.abs(TW.fixedDaily(Object.assign({}, owned, { fixedPerDay: 20 })) - 130) < 1e-9, 'the old single box still counts');
  const detail = Object.assign({}, base, { detailWear: 1, tyrePrice: 2400, tyreLife: 20000, oilPrice: 500, oilEvery: 2500 });
  assert.ok(Math.abs(TW.maintKm(detail) - (0.12 + 0.2 + TW.VEHICLES.petrol.miscPerKm)) < 1e-9, 'detailed wear = tyres + oil + small parts');
  assert.strictEqual(TW.maintKm(Object.assign({}, detail, { detailWear: 0 })), base.maintPerKm, 'switching detail off restores the single estimate');
  const heavy = Object.assign({}, base, { traffic: 'heavy' }), light = Object.assign({}, base, { traffic: 'light' });
  assert.ok(TW.fuelKm(heavy) > TW.fuelKm(base) && TW.fuelKm(base) > TW.fuelKm(light));
  assert.strictEqual(TW.fuelKm(Object.assign({}, heavy, { fuelPerKmOverride: 3 })), 3, 'a measured fuel cost is never scaled');
  assert.strictEqual(TW.fuelKm(TW.defaultProfile('cycle')), 0, 'a cycle burns nothing');
  const rA = TW.analyze(sessions, Object.assign({}, demoProfile, { fixedPerDay: 0 })), rB = TW.analyze(sessions, Object.assign({}, demoProfile, { fixedPerDay: 0, ownership: 'rented', rentPerDay: 300 }));
  assert.ok(rB.total.fixed > 0 && rB.total.maint < rA.total.maint, 'rented: rent charged, repairs not');
  assert.ok(Math.abs(rB.total.gross - rB.total.fuel - rB.total.maint - rB.total.data - rB.total.fixed - rB.total.net) < 1e-6, 'balances');
  const sn = TW.sensitivity(sessions, Object.assign({}, demoProfile, { detailWear: 1, tyrePrice: 2400, tyreLife: 20000 })); assert.ok(sn.lo <= sn.base.perHr && sn.hi >= sn.base.perHr);
  const c = TW.costPerKm(detail); assert.ok(Math.abs(c.perKm - (c.fuel + c.wear)) < 1e-12 && c.perKmAll > c.perKm);
  console.log('v19 OK  owned/rented, detailed wear, traffic, cycle');
}

// ---- v20: weekly and monthly periods ----
{
  const wk = TW.periods(rep, 'week'), mo = TW.periods(rep, 'month');
  assert.ok(wk.length >= 3 && mo.length >= 1);
  [wk, mo].forEach(list => {
    const o = list.reduce((a, p) => a + p.orders, 0), n = list.reduce((a, p) => a + p.net, 0), h = list.reduce((a, p) => a + p.hours, 0);
    assert.strictEqual(o, rep.total.n, 'every order is in exactly one period');
    assert.ok(Math.abs(n - rep.total.net) < 1e-6 && Math.abs(h - rep.total.hours) < 1e-6, 'period nets and hours add up to the whole');
    list.forEach(p => assert.ok(Math.abs(p.gross - p.fuel - p.maint - p.data - p.fixed - p.net) < 1e-6, 'each period balances'));
  });
  wk.forEach(p => { assert.strictEqual(new Date(p.from + 'T00:00:00Z').getUTCDay(), 1, 'weeks start on Monday'); assert.strictEqual(new Date(p.to + 'T00:00:00Z').getUTCDay(), 0); });
  assert.ok(wk.slice(1).some(p => p.vsPrev), 'consecutive weeks know their change');
  const w1 = wk.find(p => p.vsPrev); const prev = wk.find(p => p.key === new Date(Date.parse(w1.key + 'T00:00:00Z') - 7 * 864e5).toISOString().slice(0, 10));
  assert.ok(Math.abs(w1.vsPrev.net - (w1.net - prev.net)) < 1e-9);
  assert.ok(mo.every(p => /^\d{4}-\d{2}$/.test(p.key) && p.from.endsWith('-01')));
  assert.deepStrictEqual(TW.periods(null, 'week'), []);
  console.log('v20 OK  periods:', wk.length, 'weeks,', mo.length, 'months');
}

// ---- v21: payout reconciliation ----
{
  const s = [{ id: 'a', date: '2026-11-02', platform: 'Zomato', bonus: 50, orders: [{ pay: 100, incentive: 20, deduction: 10 }, { pay: 80, incentive: 0, deduction: 0 }] },
             { id: 'b', date: '2026-11-04', platform: 'Swiggy', bonus: 0, orders: [{ pay: 200, incentive: 0, deduction: 0 }] },
             { id: 'c', date: '2026-11-12', platform: 'Zomato', bonus: 0, orders: [{ pay: 500, incentive: 0, deduction: 0 }] }];
  const mk = (amount, extra) => Object.assign({ id: 'p', platform: 'Zomato', from: '2026-11-02', to: '2026-11-08', amount }, extra || {});
  const exp = 100 + 20 - 10 + 80 + 50;                                                          // 240: the other platform and the other week are excluded
  const r = TW.reconcile(s, [mk(240)])[0]; assert.strictEqual(r.expected, exp); assert.strictEqual(r.status, 'match'); assert.strictEqual(r.orders, 2);
  assert.strictEqual(TW.reconcile(s, [mk(200)])[0].status, 'short'); assert.strictEqual(TW.reconcile(s, [mk(200)])[0].gap, -40);
  assert.strictEqual(TW.reconcile(s, [mk(300)])[0].status, 'over');
  assert.strictEqual(TW.reconcile(s, [mk(245)])[0].status, 'match', 'a few rupees of rounding is not a gap');
  assert.strictEqual(TW.reconcile(s, [mk(100, { from: '2026-10-01', to: '2026-10-07' })])[0].status, 'nodata', 'no orders in the period: no verdict');
  assert.strictEqual(TW.reconcile(s, [mk(440, { platform: 'All' })])[0].expected, exp + 200, 'All platforms');
  assert.deepStrictEqual(TW.reconcile(s, []), []);
  const two = TW.reconcile(s, [mk(240), mk(500, { id: 'q', from: '2026-11-09', to: '2026-11-15' })]); assert.strictEqual(two[0].id, 'q', 'newest first');
  console.log('v21 OK  payout reconciliation');
}

// ---- v22: platform comparison ----
{
  const cp = TW.comparePlatforms(rep), plats = new Set(rep.orders.map(o => o.platform));
  assert.strictEqual(cp.rows.length, plats.size);
  assert.ok(cp.rows.every((r, i, a) => !i || a[i - 1].perHr >= r.perHr), 'best first');
  cp.rows.filter(r => r.enough).forEach(r => assert.ok(r.lo <= r.perHr + 1e-9 && r.hi >= r.perHr - 1e-9, 'the range contains the estimate'));
  assert.deepStrictEqual(TW.comparePlatforms(rep).rows.map(r => [r.lo, r.hi]), cp.rows.map(r => [r.lo, r.hi]), 'deterministic');
  const thin = TW.analyze([{ id: 'x', date: '2026-11-01', platform: 'Zomato', onlineMin: 120, bonus: 0, orders: [{ hour: 12, zone: 'A', km: 2, pay: 50, incentive: 0, deduction: 0, durMin: 15 }] }], TW.defaultProfile('petrol'));
  const tc = TW.comparePlatforms(thin); assert.ok(!tc.comparable && !tc.rows[0].enough && tc.rows[0].lo === null, 'one day gives no range');
  assert.ok(cp.byDaypart.every(d => ['none', 'only', 'clear', 'close'].includes(d.verdict)));
  cp.byDaypart.filter(d => d.runner).forEach(d => assert.ok(d.best.perHr >= d.runner.perHr));
  assert.deepStrictEqual(TW.comparePlatforms(null).rows, []);
  console.log('v22 OK  platform comparison', cp.rows.map(r => r.platform + ' ' + Math.round(r.perHr) + (r.enough ? ' [' + Math.round(r.lo) + '-' + Math.round(r.hi) + ']' : '')).join(', '));
}

// ---- v23: statement v2 ----
{
  const st = TW.statementData(rep, { name: 'Test' }, { provenance: TW.provenance(sessions) });
  assert.strictEqual(st.version, 2); assert.ok(st.months.length >= 1 && st.months.every(m => m.length === 7));
  const ms = TW.periods(rep, 'month'); assert.deepStrictEqual(st.months.map(m => m[0]), ms.map(m => m.key));
  assert.ok(st.monthStats.counted >= 1 && st.monthStats.lowestBeforeEmi <= st.monthStats.avgBeforeEmi);
  assert.ok(st.emiCapacityLow <= st.emiCapacity + 1, 'the weakest month never supports more EMI than the typical one');
  assert.strictEqual(st.provenance.orders, rep.total.n);
  const p = TW.provenance([{ source: 'ai', orders: [1, 2] }, { source: 'ocr', orders: [1], edited: true }, { source: 'manual', orders: [1] }, { orders: [1] }, { source: 'demo', orders: [1] }]);
  assert.deepStrictEqual([p.orders, p.bySource.ai, p.bySource.ocr, p.bySource.manual, p.bySource.demo, p.editedOrders, p.editedSessions], [6, 2, 1, 2, 1, 1, 1]);
  assert.ok(JSON.stringify(st).length < 20000, 'small enough to register');
  console.log('v23 OK  statement v2:', st.months.length, 'months, lowest', st.monthStats.lowestBeforeEmi);
}
