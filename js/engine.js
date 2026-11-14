/* TrueWage engine — pure functions, no DOM. Works in browser (window.TW) and Node (module.exports). */
(function (root) {
  'use strict';

  const VEHICLES = {
    petrol: { mileage: 45, fuelPrice: 105, maintPerKm: 1.2, deadKm: 0.45 }, // km/l, Rs/l
    ev:     { mileage: 28, fuelPrice: 9,   maintPerKm: 0.45, deadKm: 0.45 }, // km/kWh, Rs/kWh
    cng:    { mileage: 24, fuelPrice: 80,  maintPerKm: 1.6, deadKm: 0.6 },  // km/kg, Rs/kg
    car:    { mileage: 16, fuelPrice: 100, maintPerKm: 2.6, deadKm: 0.55 }
  };

  const DAYPARTS = ['morning', 'lunch', 'afternoon', 'evening', 'night'];
  const DAYPART_HOURS = { morning: '6–11', lunch: '11–15', afternoon: '15–18', evening: '18–23', night: '23–6' };

  function daypartOf(hour) {
    const h = Math.floor(hour) % 24;
    if (h >= 6 && h < 11) return 'morning';
    if (h >= 11 && h < 15) return 'lunch';
    if (h >= 15 && h < 18) return 'afternoon';
    if (h >= 18 && h < 23) return 'evening';
    return 'night';
  }

  function defaultProfile(vehicle) {
    const v = VEHICLES[vehicle || 'petrol'];
    return {
      vehicle: vehicle || 'petrol',
      mileage: v.mileage, fuelPrice: v.fuelPrice, maintPerKm: v.maintPerKm, deadKm: v.deadKm,
      dataPerHour: 2.5,   // Rs per online hour (mobile data + battery/phone wear)
      fixedPerDay: 0,     // EMI / rent / insurance per day
      minWage: 90,        // fair-wage benchmark, Rs/hour (illustrative, editable)
      fuelPerKmOverride: 0 // optional: the rider's own measured fuel cost per km (Rs). 0 = derive from mileage and price
    };
  }

  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const fuelKm = p => (p.fuelPerKmOverride > 0 ? p.fuelPerKmOverride : p.fuelPrice / p.mileage);
  const round = (n, d = 0) => { const m = Math.pow(10, d); return Math.round(n * m) / m; };

  /** Flatten sessions into orders, filling idle (unpaid waiting) time, and attach cost fields.
   *  Cost model (each rupee is counted once):
   *    gross  = pay + incentive + day-bonus share - platform deductions
   *    fuel   = (paid km + unpaid km) * fuel price / mileage
   *    maint  = (paid km + unpaid km) * repairs per km
   *    data   = online hours * data cost per hour
   *    EMI    = fixedPerDay * calendar days of the period, spread over worked days, then by online minutes
   *  operating profit = gross - fuel - maint - data ; cash after EMI = operating profit - EMI. */
  function enrich(sessions, profile) {
    const p = Object.assign(defaultProfile(), profile || {});
    const fuelPerKm = fuelKm(p);
    const vehicleKm = fuelPerKm + p.maintPerKm;
    const out = [];
    sessions.forEach((s, si) => {
      const orders = (s.orders || []).slice();
      if (!orders.length) return;
      const orderMin = sum(orders, o => +o.durMin || 0);
      const known = sum(orders, o => (o.waitMin != null ? +o.waitMin : 0));
      const missing = orders.filter(o => o.waitMin == null).length;
      // trust the app's "online time" when present: scale if the order times overshoot it
      const scale = s.onlineMin && orderMin + known > s.onlineMin ? s.onlineMin / (orderMin + known) : 1;
      let idle = 0;
      if (s.onlineMin) idle = Math.max(0, s.onlineMin - (orderMin + known) * scale);
      const share = missing ? idle / missing : 0;
      const bonusEach = (+s.bonus || 0) / orders.length; // day-level bonus spread evenly so it can't distort one time slot
      orders.forEach((o, oi) => {
        const wait = o.waitMin != null ? +o.waitMin * scale : share;
        const dur = (+o.durMin || 0) * scale;
        const mins = wait + dur;
        const km = +o.km || 0;
        const totalKm = km * (1 + p.deadKm);
        const incentive = (+o.incentive || 0) + bonusEach;
        const gross = (+o.pay || 0) + incentive - (+o.deduction || 0);
        const fuel = totalKm * fuelPerKm;
        const maint = totalKm * p.maintPerKm;
        const data = mins / 60 * p.dataPerHour;
        const hour = +o.hour;
        out.push({
          sid: s.id != null ? s.id : si, idx: oi,
          date: s.date, platform: s.platform, zone: o.zone || s.zone || 'Unknown',
          hour, slot: Math.floor(hour) % 24, daypart: daypartOf(hour),
          km, totalKm, deadKmAbs: totalKm - km, deadCost: (totalKm - km) * vehicleKm,
          pay: +o.pay || 0, incentive, deduction: +o.deduction || 0,
          wait, dur, mins, gross, fuel, maint, data, fixed: 0,
          op: gross - fuel - maint - data
        });
      });
    });
    if (out.length) {
      const dates = Array.from(new Set(out.map(o => o.date))).sort();
      const calSpan = effSpan(dates);
      const perWorkedDay = p.fixedPerDay * calSpan / dates.length;
      const dayMins = new Map(), dayN = new Map();
      out.forEach(o => { dayMins.set(o.date, (dayMins.get(o.date) || 0) + o.mins); dayN.set(o.date, (dayN.get(o.date) || 0) + 1); });
      out.forEach(o => {
        const dm = dayMins.get(o.date);
        o.fixed = dm > 0 ? perWorkedDay * o.mins / dm : perWorkedDay / dayN.get(o.date);
        o.cost = o.fuel + o.maint + o.data + o.fixed;
        o.net = o.gross - o.cost;
      });
    }
    return out;
  }

  function aggregate(list) {
    const a = {
      n: list.length, pay: 0, incentive: 0, deduction: 0, gross: 0, fuel: 0, maint: 0, data: 0, fixed: 0,
      cost: 0, net: 0, mins: 0, wait: 0, dur: 0, km: 0, totalKm: 0, deadKmAbs: 0, deadCost: 0, op: 0
    };
    list.forEach(o => { for (const k in a) if (k !== 'n' && o[k] != null) a[k] += o[k]; });
    a.hours = a.mins / 60;
    a.appShown = a.pay + a.incentive;
    a.perHr = a.hours > 0 ? a.net / a.hours : 0;
    a.appPerHr = a.hours > 0 ? a.appShown / a.hours : 0;
    a.keepRatio = a.appShown > 0 ? a.net / a.appShown : 0;
    a.waitShare = a.mins > 0 ? a.wait / a.mins : 0;
    a.opPerHr = a.hours > 0 ? a.op / a.hours : 0;           // operating profit per online hour (before EMI)
    a.appPerRideHr = a.dur > 0 ? a.appShown / (a.dur / 60) : 0; // what the app pays per hour actually spent on orders
    return a;
  }

  function groupBy(list, keyFn) {
    const m = new Map();
    list.forEach(o => { const k = keyFn(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); });
    return m;
  }

  function dayDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
  /** Calendar days a set of worked dates stands for. Gaps of up to 3 days count in full (ordinary days off); a longer gap counts as 3, because a
   *  stretch with no screenshots is missing data, not proof the rider paid EMI for those days out of these few orders. */
  function effSpan(dates) { let n = 1; for (let i = 1; i < dates.length; i++) n += Math.min(3, Math.max(1, dayDiff(dates[i - 1], dates[i]))); return n; }

  function median(a) {
    if (!a.length) return 0;
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Full analysis. Returns numbers + structured insights (rendered to text by the UI, in any language). */
  function analyze(sessions, profile) {
    const p = Object.assign(defaultProfile(), profile || {});
    const orders = enrich(sessions, p);
    if (!orders.length) return null;

    const total = aggregate(orders);
    const dates = Array.from(new Set(orders.map(o => o.date))).sort();
    const calSpan = effSpan(dates), spanDays = Math.max(7, calSpan);
    const daysWorked = dates.length;
    const dataQuality = { days: daysWorked, orders: total.n, hours: total.hours, level: daysWorked >= 7 && total.n >= 40 ? 'good' : daysWorked >= 3 && total.n >= 15 ? 'ok' : 'low' };

    const byDay = Array.from(groupBy(orders, o => o.date)).map(([date, l]) => {
      const a = aggregate(l); return { date, net: a.net, gross: a.gross, appShown: a.appShown, hours: a.hours, orders: a.n, perHr: a.perHr };
    }).sort((x, y) => x.date < y.date ? -1 : 1);

    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, ...aggregate(orders.filter(o => o.slot === h)) }));
    const byPlatform = Array.from(groupBy(orders, o => o.platform)).map(([k, l]) => ({ key: k, ...aggregate(l) })).sort((a, b) => b.perHr - a.perHr);
    const byZone = Array.from(groupBy(orders, o => o.zone)).map(([k, l]) => ({ key: k, ...aggregate(l) })).sort((a, b) => b.perHr - a.perHr);
    const byDaypart = DAYPARTS.map(k => ({ key: k, ...aggregate(orders.filter(o => o.daypart === k)) }));

    // zone x daypart (+ platform) windows
    const combos = Array.from(groupBy(orders, o => o.platform + '|' + o.zone + '|' + o.daypart)).map(([k, l]) => {
      const [platform, zone, daypart] = k.split('|');
      const a = aggregate(l);
      return { key: k, platform, zone, daypart, days: new Set(l.map(o => o.date)).size, ...a };
    });
    const zoneDaypart = Array.from(groupBy(orders, o => o.zone + '|' + o.daypart)).map(([k, l]) => {
      const [zone, daypart] = k.split('|');
      const a = aggregate(l);
      return { key: k, zone, daypart, days: new Set(l.map(o => o.date)).size, ...a };
    });

    const solid = c => c.days >= 3 && c.hours >= 4;
    const solidCombos = combos.filter(solid);
    const solidZD = zoneDaypart.filter(solid);

    // breakeven pay per paid km: what an order must pay just to cover fuel+repairs (incl. unpaid riding)
    const vehicleKm = fuelKm(p) + p.maintPerKm;
    const breakEvenPerKm = vehicleKm * (1 + p.deadKm);
    const belowBE = orders.filter(o => o.km > 0 && (o.pay + o.incentive - o.deduction) / o.km < breakEvenPerKm);
    const belowBEPct = orders.length ? belowBE.length / orders.length * 100 : 0;

    const deadKmPerDay = total.deadKmAbs / daysWorked;
    const deadCostPerDay = deadKmPerDay * vehicleKm;

    // ---- insights (structured) ----
    const insights = [];
    const leakPct = total.appShown > 0 ? (1 - total.net / total.appShown) * 100 : 0;
    insights.push({
      key: 'leak', sev: leakPct > 35 ? 'bad' : 'warn',
      p: { app: round(total.appPerHr), real: round(total.perHr), leakPct: round(leakPct) }
    });
    insights.push(total.perHr < p.minWage
      ? { key: 'below', sev: 'bad', p: { mw: p.minWage } }
      : { key: 'above', sev: 'good', p: { mw: p.minWage } });

    const weakest = solidZD.filter(c => c.perHr < Math.min(p.minWage * 0.6, total.perHr * 0.6)).sort((a, b) => a.perHr - b.perHr);
    weakest.slice(0, 2).forEach(c => insights.push({
      key: 'skip', sev: 'bad', impact: c.hours,
      p: { zone: c.zone, daypart: c.daypart, range: DAYPART_HOURS[c.daypart], rate: round(c.perHr) }
    }));

    // "best window": highest pay among windows the rider actually works a lot (not a 30-minute sliver)
    const maxH = Math.max(0, ...solidCombos.map(c => c.hours));
    const best = solidCombos.filter(c => c.hours >= 0.4 * maxH).sort((a, b) => b.perHr - a.perHr)[0];
    if (best) insights.push({
      key: 'best', sev: 'good',
      p: { platform: best.platform, zone: best.zone, daypart: best.daypart, range: DAYPART_HOURS[best.daypart], rate: round(best.perHr) }
    });

    if (belowBEPct >= 15) insights.push({ key: 'permkm', sev: 'warn', p: { x: round(breakEvenPerKm, 1), pct: round(belowBEPct) } });
    if (deadCostPerDay > 40) insights.push({ key: 'deadkm', sev: 'warn', p: { km: round(deadKmPerDay), cost: round(deadCostPerDay) } });

    // evidence-based extras: each only appears when the data supports it
    if (dataQuality.level === 'low') insights.push({ key: 'lowdata', sev: 'warn', p: { days: daysWorked, orders: total.n } });
    if (total.totalKm > 0) insights.push({ key: 'perkm', sev: 'warn', p: { gross: round(total.appShown / total.km, 1), net: round(total.net / total.totalKm, 1), paid: round(total.km), all: round(total.totalKm) } });
    if (total.waitShare > 0.15) insights.push({ key: 'waitimpact', sev: 'warn', p: { active: round((1 - total.waitShare) * 100), rideHr: round(total.appPerRideHr), allHr: round(total.appPerHr) } });
    if (total.n >= 15) {
      const opPerOrder = (total.fuel + total.maint + total.data + total.fixed) / total.n, effMin = total.mins / total.n;
      insights.push({ key: 'breakeven', sev: 'warn', p: { cover: round(opPerOrder), fair: round(opPerOrder + p.minWage * effMin / 60), avg: round((total.appShown - total.deduction) / total.n), km: round(total.km / total.n, 1), min: round(effMin) } });
    }
    const plats = byPlatform.filter(x => x.hours >= 4 && new Set(orders.filter(o => o.platform === x.key).map(o => o.date)).size >= 3);
    if (plats.length >= 2 && plats[0].perHr - plats[plats.length - 1].perHr >= 15) {
      const a = plats[0], b = plats[plats.length - 1];
      insights.push({ key: 'platform', sev: 'good', p: { best: a.key, a: round(a.perHr), worst: b.key, b: round(b.perHr), days: daysWorked } });
    }
    if (total.cost > 0) insights.push({ key: 'expense', sev: 'warn', p: { fuel: round(total.fuel / total.cost * 100), maint: round(total.maint / total.cost * 100), data: round(total.data / total.cost * 100), emi: round(total.fixed / total.cost * 100), cost: round(total.cost / daysWorked) } });

    // what-if: skip the 2 weakest windows
    let whatIf = null;
    const skip = weakest.slice(0, 2);
    if (skip.length) {
      const skipSet = new Set(skip.map(c => c.key));
      const keep = orders.filter(o => !skipSet.has(o.zone + '|' + o.daypart));
      const ka = aggregate(keep);
      const weekFactor = 7 / spanDays;
      const savedHrs = sum(skip, c => c.hours) * weekFactor;
      const lostNet = sum(skip, c => c.net) * weekFactor;
      whatIf = { from: total.perHr, to: ka.perHr, savedHrsPerWeek: savedHrs, netChangePerWeek: -lostNet, windows: skip.map(c => ({ zone: c.zone, daypart: c.daypart, perHr: c.perHr })) };
      insights.push({ key: 'whatif', sev: 'good', p: { hrs: round(savedHrs, 1), from: round(total.perHr), to: round(ka.perHr) } });
    }

    const byWeekday = Array.from({ length: 7 }, (_, wd) => {
      const l = orders.filter(o => new Date(o.date + 'T00:00:00Z').getUTCDay() === wd);
      return { wd, days: new Set(l.map(o => o.date)).size, ...aggregate(l) };
    });
    const avgWaitPerOrder = total.wait / total.n;

    return {
      byWeekday, avgWaitPerOrder,
      calSpan, dataQuality, profile: p, orders, total, spanDays, daysWorked, dates, byDay, byHour, byPlatform, byZone, byDaypart,
      combos, zoneDaypart, breakEvenPerKm, belowBEPct, deadKmPerDay, deadCostPerDay, leakPct, insights, whatIf,
      perDay: { gross: total.appShown / daysWorked, net: total.net / daysWorked, hours: total.hours / daysWorked },
      medianDayNet: median(byDay.map(d => d.net))
    };
  }

  /** Loan-ready income statement numbers derived from the analysis. */
  function statementData(rep, rider) {
    const t = rep.total;
    const existingEmi = (rep.profile.fixedPerDay || 0) * 30;               // monthly vehicle EMI is a fixed obligation
    const monthlyBeforeEmi = t.op / rep.spanDays * 30;                      // lenders look at income BEFORE the loan being serviced
    const monthlyNet = monthlyBeforeEmi - existingEmi;
    const monthlyGross = t.appShown / rep.spanDays * 30;
    const med = rep.medianDayNet;
    const stable = rep.byDay.filter(d => d.net >= 0.5 * med).length / rep.byDay.length;
    return {
      rider: rider || {},
      period: { from: rep.dates[0], to: rep.dates[rep.dates.length - 1], daysWorked: rep.daysWorked, spanDays: rep.spanDays, short: rep.daysWorked < 14 },
      platforms: rep.byPlatform.map(p => p.key),
      totals: { appShown: round(t.appShown), deductions: round(t.deduction), fuel: round(t.fuel), maint: round(t.maint), data: round(t.data), fixed: round(t.fixed), operatingProfit: round(t.op), net: round(t.net), hours: round(t.hours, 1), orders: t.n },
      monthly: { gross: round(monthlyGross), net: round(monthlyNet), beforeEmi: round(monthlyBeforeEmi) },
      medianDayNet: round(med),
      stability: round(stable * 100),
      emiCapacity: Math.max(0, round(monthlyBeforeEmi * 0.4 - existingEmi)),   // indicative: 40% FOIR guideline minus existing vehicle EMI
      daily: rep.byDay.map(d => [d.date, round(d.appShown), round(d.net), round(d.hours, 1)])
    };
  }

  /** Should I take this order? Costs the ride the same way the whole analysis does. */
  function orderCheck(profile, o) {
    const p = Object.assign(defaultProfile(), profile || {});
    const km = Math.max(0.1, +o.km || 0), pay = +o.pay || 0;
    const rideMin = +o.mins || (10 + km * 3.4);
    const effMin = rideMin + (+o.avgWait || 0);               // include the unpaid waiting an order usually costs
    const vehicleKm = fuelKm(p) + p.maintPerKm;
    // EMI per online hour: measured from the rider's own history when available, else an even 9-hour day
    const fixedHr = o.fixedPerHour != null ? o.fixedPerHour : p.fixedPerDay / 9;
    const vehicleCost = km * (1 + p.deadKm) * vehicleKm, timeCost = effMin / 60 * (p.dataPerHour + fixedHr);
    const cost = vehicleCost + timeCost;
    const net = pay - cost, perHr = net / (effMin / 60);
    const need = cost + p.minWage * effMin / 60;               // pay needed to reach the fair-wage line
    const verdict = perHr >= p.minWage ? 'take' : perHr >= p.minWage * 0.6 ? 'border' : 'skip';
    return { km, pay, effMin, cost, vehicleCost, timeCost, net, perHr, need, perKm: pay / km, breakEvenPerKm: vehicleKm * (1 + p.deadKm), verdict };
  }

  /** Best (platform, zone) per hour-of-day from the rider's own history, then what to do right now. */
  function planNow(rep, hour) {
    const m = new Map();
    rep.orders.forEach(o => {
      const k = o.slot + '|' + o.platform + '|' + o.zone;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(o);
    });
    const best = Array(24).fill(null);
    m.forEach((l, k) => {
      const [slot, platform, zone] = k.split('|');
      const days = new Set(l.map(o => o.date)).size;
      if (days < 3) return;
      const a = aggregate(l);
      if (a.hours < 1.5) return;
      const h = +slot;
      if (!best[h] || a.perHr > best[h].perHr) best[h] = { hour: h, platform, zone, perHr: a.perHr, days };
    });
    const mw = rep.profile.minWage, h0 = Math.floor(hour) % 24;
    const now = best[h0];
    let next = null;
    for (let i = (now && now.perHr >= mw) ? 0 : 1; i <= 24 && !next; i++) {
      const h = (h0 + i) % 24;
      if (best[h] && best[h].perHr >= mw) {
        let end = h, rates = [best[h].perHr];
        while (best[(end + 1) % 24] && best[(end + 1) % 24].perHr >= mw && rates.length < 12) { end = (end + 1) % 24; rates.push(best[end].perHr); }
        next = { start: h, end: (end + 1) % 24, inHours: i, platform: best[h].platform, zone: best[h].zone, perHr: rates.reduce((a, b) => a + b, 0) / rates.length };
      }
    }
    const state = !now ? 'nodata' : now.perHr >= mw ? 'good' : 'poor';
    return { state, now, next, hour: h0, best };
  }

  /** What an order would have to pay for the rider's own typical order to reach a target hourly wage. */
  function fairFloor(rep, target) {
    const t = rep.total, n = t.n;
    const opCostPerOrder = (t.fuel + t.maint + t.data + t.fixed) / n;
    const effMin = t.mins / n, km = t.km / n;
    const floor = opCostPerOrder + target * effMin / 60;
    const actual = t.appShown / n - t.deduction / n;
    return { floor, actual, gapPct: (1 - actual / floor) * 100, perKmFloor: floor / km, perKmActual: actual / km, effMin, km, opCostPerOrder };
  }

  /** One day's receipt (or the typical day when date is null). */
  function dayReceipt(rep, date) {
    const one = date && date !== 'period';                      // a single day, or the whole period as one total
    const l = one ? rep.orders.filter(o => o.date === date) : rep.orders;
    const d = date ? 1 : rep.daysWorked, a = aggregate(l);     // no date = the typical (average) working day
    return {
      date, orders: a.n / d, hours: a.hours / d, appShown: a.appShown / d, deduction: a.deduction / d, fuel: a.fuel / d, maint: a.maint / d,
      data: a.data / d, fixed: a.fixed / d, op: a.op / d, deadCost: a.deadCost / d, deadKm: a.deadKmAbs / d, km: a.km / d, net: a.net / d,
      perHr: a.perHr, opPerHr: a.opPerHr, appPerHr: a.appPerHr
    };
  }

  /** How far could the real hourly pay move if our cost assumptions are off?
   *  Pessimistic: worse mileage, more unpaid riding, dearer repairs. Optimistic: the reverse.
   *  Measured values (pay, km, times, bonuses, cuts, EMI) never vary. If the rider calibrated petrol cost, fuel varies only +/-10%. */
  function sensitivity(sessions, profile) {
    const p = Object.assign(defaultProfile(), profile || {});
    const calibrated = p.fuelPerKmOverride > 0;
    const run = (fuelK, deadK, maintK) => {
      const q = Object.assign({}, p, { deadKm: Math.max(0, p.deadKm * deadK), maintPerKm: p.maintPerKm * maintK });
      if (calibrated) q.fuelPerKmOverride = p.fuelPerKmOverride * fuelK; else q.mileage = p.mileage / fuelK;
      const a = aggregate(enrich(sessions, q));
      return { perHr: a.perHr, cash: a.net };
    };
    const base = run(1, 1, 1);
    const fk = calibrated ? 0.1 : 0.2;
    const dv = p.deadMeasured ? [1, 1] : [1.45, 0.55];          // GPS-measured unpaid riding is not an assumption
    const lo = run(1 + fk, dv[0], 1.3), hi = run(1 - fk, dv[1], 0.7);
    return { base, lo: Math.min(lo.perHr, base.perHr), hi: Math.max(hi.perHr, base.perHr), loCash: Math.min(lo.cash, base.cash), hiCash: Math.max(hi.cash, base.cash), calibrated };
  }

  /* ---------------- shift tracking: the rider's own measured hours and distance ---------------- */
  function haversine(a, b) {                       // metres between two lat/lon points
    const R = 6371000, rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** Add one GPS fix to a running shift { km, last }. Honest filtering, nothing is invented:
   *  - poor fixes (accuracy worse than 50 m) are ignored
   *  - movement smaller than the GPS jitter (15 m or the fix's own accuracy) is ignored without moving the anchor, so slow riding still adds up
   *  - jumps implying more than 45 m/s (162 km/h) are treated as glitches: the anchor moves, no distance is added
   *  Only the running total is kept, never the route. */
  function addFix(shift, fix) {
    const st = Object.assign({ km: 0, last: null }, shift);
    if (!(fix.acc <= 50)) return st;
    if (!st.last) { st.last = { lat: fix.lat, lon: fix.lon, t: fix.t }; return st; }
    const d = haversine(st.last, fix), dt = Math.max(1, (fix.t - st.last.t) / 1000);
    if (d < Math.max(15, fix.acc || 0)) return st;
    if (d / dt <= 45) st.km += d / 1000;
    st.last = { lat: fix.lat, lon: fix.lon, t: fix.t };
    return st;
  }

  /** Pair each tracked shift with a screenshot session of the same day (and same app when known). One shift per session. */
  function pairShifts(sessions, shifts) {
    const used = new Set(), pairs = [];
    (shifts || []).forEach(sh => {
      let idx = sessions.findIndex((x, i) => !used.has(i) && x.date === sh.date && x.platform === sh.platform);
      if (idx < 0 && (sh.platform === 'Unknown' || !sh.platform)) idx = sessions.findIndex((x, i) => !used.has(i) && x.date === sh.date);
      if (idx >= 0) { used.add(idx); pairs.push({ session: sessions[idx], shift: sh }); }
    });
    return pairs;
  }

  /** Fill in online time from a tracked shift when the screenshot did not show it. Screenshot values always win. */
  function applyShifts(sessions, shifts) {
    const m = new Map(pairShifts(sessions, shifts).map(p => [p.session, p.shift]));
    return sessions.map(x => (m.has(x) && !x.onlineMin && m.get(x).onlineMin > 0) ? Object.assign({}, x, { onlineMin: m.get(x).onlineMin }) : x);
  }

  /** Unpaid riding measured from GPS: (all kilometres ridden - kilometres the apps paid for) / paid kilometres.
   *  Only shifts with a plausible track (>= 80% of the paid km) count. Reliable after 3 paired shifts and 30 paid km. */
  function measuredDeadKm(sessions, shifts) {
    let paid = 0, tracked = 0, n = 0;
    pairShifts(sessions, shifts).forEach(({ session, shift }) => {
      const pk = sum(session.orders || [], o => +o.km || 0);
      if (shift.km > 0 && pk > 0 && shift.km >= pk * 0.8) { paid += pk; tracked += shift.km; n++; }
    });
    return { factor: paid > 0 ? Math.max(0, (tracked - paid) / paid) : null, pairs: n, paidKm: paid, trackedKm: tracked, reliable: n >= 3 && paid >= 30 };
  }

  /* ---------------- planner, area switching, weekly coach ---------------- */

  /** Build today's schedule from the rider's own best hours until the take-home goal is covered.
   *  Rates are the rider's real (after-cost) pay per hour for that hour of day, app and area, from at least 3 days of history. */
  function planDay(rep, goal, maxHours) {
    const best = planNow(rep, 0).best, mw = rep.profile.minWage, cap = maxHours || 12;
    const cands = best.filter(b => b && b.perHr >= mw).sort((a, b) => b.perHr - a.perHr);
    if (!cands.length || !(goal > 0)) return { segments: [], hours: 0, expected: 0, reached: false, goal };
    const picked = []; let total = 0;
    for (const c of cands) { if (picked.length >= cap) break; picked.push(c); total += c.perHr; if (total >= goal) break; }
    picked.sort((a, b) => a.hour - b.hour);
    const segs = [];
    picked.forEach(c => {
      const l = segs[segs.length - 1];
      if (l && l.end === c.hour && l.platform === c.platform && l.zone === c.zone) { l.end = c.hour + 1; l.expected += c.perHr; l.n++; }
      else segs.push({ start: c.hour, end: c.hour + 1, platform: c.platform, zone: c.zone, expected: c.perHr, n: 1 });
    });
    segs.forEach(g => { g.perHr = g.expected / g.n; g.end = g.end % 24 || 24; });
    return { segments: segs, hours: picked.length, expected: total, reached: total >= goal, goal };
  }

  /** "Move to another area": compare a weak area-and-time with the rider's own other areas first, then with city data (simulated in the demo). */
  function areaSwitch(rep, cityCells) {
    const mw = rep.profile.minWage, out = [];
    DAYPARTS.forEach(dp => {
      const own = rep.zoneDaypart.filter(z => z.daypart === dp && z.hours >= 2 && z.days >= 2);
      const weak = own.filter(z => z.days >= 3 && z.hours >= 4).sort((a, b) => a.perHr - b.perHr)[0];
      if (!weak || weak.perHr >= mw * 0.8) return;
      const need = weak.perHr * 1.25 + 10;
      const alt = own.filter(z => z.zone !== weak.zone && z.perHr >= need).sort((a, b) => b.perHr - a.perHr)[0];
      if (alt) { out.push({ key: 'switch', sev: 'good', p: { daypart: dp, from: weak.zone, to: alt.zone, a: round(weak.perHr), b: round(alt.perHr), src: 'own' } }); return; }
      const city = (cityCells || []).filter(c => !c.hidden && c.daypart === dp && c.zone !== weak.zone && c.real >= need && c.real >= mw * 0.8).sort((a, b) => b.real - a.real)[0];
      if (city) out.push({ key: 'switch', sev: 'good', p: { daypart: dp, from: weak.zone, to: city.zone, a: round(weak.perHr), b: round(city.real), src: 'city' } });
    });
    return out.sort((x, y) => (y.p.b - y.p.a) - (x.p.b - x.p.a)).slice(0, 2);
  }

  const addDays = (iso, d) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

  /** Week-by-week history: 7-day blocks ending on the latest day of data. */
  function weeks(rep, count) {
    const last = rep.dates[rep.dates.length - 1], out = [];
    for (let i = 0; i < (count || 6); i++) {
      const to = addDays(last, -7 * i), from = addDays(to, -6);
      const l = rep.orders.filter(o => o.date >= from && o.date <= to);
      if (!l.length) { if (i > 0 && out.length) break; continue; }
      const a = aggregate(l);
      out.push({ from, to, days: new Set(l.map(o => o.date)).size, net: a.net, hours: a.hours, perHr: a.perHr, orders: a.n });
    }
    return out;
  }

  /** One win and one thing to fix, from the last 7 days against the 7 before. Needs at least 8 days of data. */
  function weeklyCoach(rep) {
    if (rep.daysWorked < 8) return null;
    const w = weeks(rep, 2), cur = w[0], prev = w[1] || null;
    const days = rep.byDay.filter(d => d.date >= cur.from && d.date <= cur.to);
    const bestDay = days.slice().sort((a, b) => b.net - a.net)[0];
    const wl = rep.orders.filter(o => o.date >= cur.from && o.date <= cur.to), agg = aggregate(wl);
    let win;
    if (prev && cur.perHr - prev.perHr >= 5) win = { key: 'up', p: { d: round(cur.perHr - prev.perHr) } };
    else win = { key: 'best', p: { date: bestDay.date, net: round(bestDay.net) } };
    let fix = null;
    if (agg.waitShare > 0.2) fix = { key: 'wait', p: { pct: round(agg.waitShare * 100) } };
    else {
      const sk = rep.insights.find(i => i.key === 'skip');
      if (sk) fix = { key: 'skip', p: sk.p };
    }
    return { cur, prev, deltaPerHr: prev ? cur.perHr - prev.perHr : null, deltaNet: prev ? cur.net - prev.net : null, bestDay, win, fix };
  }

  /** Historical working windows (platform x zone x time of day) with their per-hour economics. */
  function simWindows(rep) {
    return rep.combos.filter(c => c.hours > 0).map(c => ({
      key: c.key, platform: c.platform, zone: c.zone, daypart: c.daypart, days: c.days,
      hoursPerDay: c.hours / rep.daysWorked,
      grossPerHr: c.gross / c.hours, fuelPerHr: c.fuel / c.hours, maintPerHr: c.maint / c.hours, dataPerHr: c.data / c.hours,
      opPerHr: c.op / c.hours
    })).sort((a, b) => b.hoursPerDay - a.hoursPerDay);
  }

  /** What-if projection. plan = { hours: {windowKey: hoursPerWorkedDay}, daysPerWeek, fuelPct }.
   *  Assumes each window keeps the per-hour economics seen in the rider's own history. */
  function simulate(rep, plan) {
    plan = plan || {};
    const ws = simWindows(rep), fuelK = 1 + (plan.fuelPct || 0) / 100;
    const dpw = plan.daysPerWeek != null ? plan.daysPerWeek : rep.daysWorked / rep.calSpan * 7;
    let hrs = 0, gross = 0, fuel = 0, maint = 0, data = 0;
    ws.forEach(w => {
      const h = plan.hours && plan.hours[w.key] != null ? Math.max(0, plan.hours[w.key]) : w.hoursPerDay;
      hrs += h; gross += h * w.grossPerHr; fuel += h * w.fuelPerHr * fuelK; maint += h * w.maintPerHr; data += h * w.dataPerHr;
    });
    const daysPerMonth = dpw * 30 / 7, opDay = gross - fuel - maint - data, emiMonth = rep.profile.fixedPerDay * 30;
    const opMonth = opDay * daysPerMonth, cashMonth = opMonth - emiMonth, hoursMonth = hrs * daysPerMonth;
    return { hoursPerDay: hrs, daysPerWeek: dpw, daysPerMonth, grossDay: gross, fuelDay: fuel, maintDay: maint, dataDay: data, opDay, opMonth, emiMonth, cashMonth, hoursMonth,
      perHr: hoursMonth > 0 ? cashMonth / hoursMonth : 0, opPerHr: hrs > 0 ? opDay / hrs : 0 };
  }

  const API = { planDay, areaSwitch, weeks, weeklyCoach, haversine, addFix, pairShifts, applyShifts, measuredDeadKm, sensitivity, fuelKm, simulate, simWindows, orderCheck, planNow, fairFloor, dayReceipt, VEHICLES, DAYPARTS, DAYPART_HOURS, daypartOf, defaultProfile, enrich, aggregate, analyze, statementData, median, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TW = Object.assign(root.TW || {}, API);
})(typeof window !== 'undefined' ? window : globalThis);
