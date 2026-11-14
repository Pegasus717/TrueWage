/* Demo data: a realistic (synthetic) rider month + a simulated city dataset. Deterministic via seeded RNG. */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = n => String(n).padStart(2, '0');
  function addDays(iso, d) { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); }
  function dow(iso) { return new Date(iso + 'T00:00:00Z').getUTCDay(); }

  // window templates: the "hidden truths" of this rider's month
  const WINDOWS = [
    { platform: 'Rapido', zone: 'Gachibowli', start: 8.0,  hours: 2.5, rate: 1.9,  km: 4.4, base: 20, perKm: 8.0, bonusAt: 0, label: 'morning' },
    { platform: 'Swiggy', zone: 'Kukatpally', start: 11.5, hours: 3.5, rate: 1.35, km: 3.6, base: 17, perKm: 7.5, bonusAt: 0, label: 'lunch' },
    { platform: 'Zomato', zone: 'Madhapur',   start: 17.5, hours: 5.0, rate: 3.1,  km: 2.7, base: 22, perKm: 9.0, surge: 6, bonusAt: 14, bonus: 180, label: 'evening' }
  ];

  function makeSession(r, date, w, idx) {
    const wk = [0, 5, 6].includes(dow(date));
    const hours = w.hours + (wk && w.label === 'evening' ? 0.5 : 0);
    const n = Math.max(1, Math.round(w.rate * hours * (0.85 + r() * 0.3) * (wk && w.label === 'evening' ? 1.15 : 1)));
    const onlineMin = Math.round(hours * 60);
    const orders = [];
    for (let i = 0; i < n; i++) {
      const km = Math.max(0.8, +(w.km * (0.6 + r() * 0.8)).toFixed(1));
      const hour = w.start + (hours * (i + r() * 0.8)) / n;
      const pay = Math.round(w.base + w.perKm * km + (r() - 0.5) * 8);
      const o = {
        hour: +Math.min(hour, 23.9).toFixed(2), zone: w.zone, km,
        pay, incentive: w.surge && r() < 0.6 ? Math.round(w.surge * (0.6 + r())) : 0,
        deduction: r() < 0.07 ? Math.round(10 + r() * 15) : 0,
        durMin: Math.round(9 + km * 3.4 + r() * 5)
      };
      orders.push(o);
    }
    const bonus = w.bonusAt && n >= w.bonusAt ? w.bonus : 0; // daily target bonus
    return { id: date + '-' + idx, date, platform: w.platform, zone: w.zone, onlineMin, bonus, orders, source: 'demo' };
  }

  function demoSessions(endDate) {
    const end = endDate || '2026-11-13';
    const r = rng(2026);
    const sessions = [];
    for (let d = 27; d >= 0; d--) {
      const date = addDays(end, -d);
      if (dow(date) === 2) continue; // weekly off: Tuesday
      WINDOWS.forEach((w, i) => {
        if (w.label === 'morning' && [0, 6].includes(dow(date))) return; // commute rides on weekdays only
        sessions.push(makeSession(r, date, w, i));
      });
    }
    return sessions;
  }

  /* ---------------- simulated city data (labelled as simulated everywhere in the UI) --------------- */
  const CITY_ZONES = {
    Madhapur: 1.18, Gachibowli: 1.12, Kondapur: 1.05, 'Banjara Hills': 1.0,
    Secunderabad: 0.9, Uppal: 0.8, Dilsukhnagar: 0.74, Kukatpally: 0.7
  };
  const CITY_DP = { morning: 0.58, lunch: 0.7, afternoon: 0.46, evening: 1.15, night: 0.92 };
  const CITY_PLATFORMS = { Swiggy: 1.0, Zomato: 1.03, Rapido: 0.9, Ola: 0.84, Uber: 0.95 };
  const K_ANON = 20;

  function cityData() {
    const r = rng(7);
    const cells = [];
    Object.entries(CITY_ZONES).forEach(([zone, zf]) => {
      Object.entries(CITY_DP).forEach(([dp, df]) => {
        const n = Math.round(6 + r() * 380 * (zf > 0.9 ? 1 : 0.55));
        const real = 108 * zf * df * (0.94 + r() * 0.12);
        const keep = 0.58 + r() * 0.12;
        cells.push({ zone, daypart: dp, n, real: Math.round(real), claimed: Math.round(real / keep), hidden: n < K_ANON });
      });
    });
    const platforms = Object.entries(CITY_PLATFORMS).map(([k, f]) => {
      const real = Math.round(100 * f * (0.97 + r() * 0.06));
      return { platform: k, n: Math.round(300 + r() * 900), real, claimed: Math.round(real / (0.6 + r() * 0.08)) };
    });
    const visible = cells.filter(c => !c.hidden);
    const wtd = (k) => visible.reduce((s, c) => s + c[k] * c.n, 0) / visible.reduce((s, c) => s + c.n, 0);
    const real = wtd('real'), claimed = wtd('claimed');
    return {
      simulated: true, riders: 2846, contributions: 61432, k: K_ANON, cells, platforms,
      medianReal: Math.round(real), medianClaimed: Math.round(claimed),
      belowMinWagePct: Math.round(visible.reduce((s, c) => s + (c.real < 90 ? c.n : 0), 0) / visible.reduce((s, c) => s + c.n, 0) * 100)
    };
  }

  /* ---------------- sample "screenshots" (generic partner-app look, no real brand) ---------------- */
  function renderSampleScreens(sessions) {
    if (typeof document === 'undefined') return [];
    return sessions.map(s => {
      const W = 360, H = 560, S = 2;
      const c = document.createElement('canvas'); c.width = W * S; c.height = H * S;
      const g = c.getContext('2d'); g.scale(S, S);
      g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#1f2937'; g.fillRect(0, 0, W, 92);
      g.fillStyle = '#fff'; g.font = '600 15px system-ui, sans-serif'; g.fillText('Partner app · Earnings', 16, 28);
      g.font = '700 30px system-ui, sans-serif';
      const total = s.orders.reduce((a, o) => a + o.pay + o.incentive, 0) + (s.bonus || 0);
      g.fillText('Rs ' + total.toLocaleString('en-IN'), 16, 66);
      g.font = '12px system-ui, sans-serif'; g.fillStyle = '#cbd5e1';
      const h = Math.floor(s.onlineMin / 60), m = s.onlineMin % 60;
      g.fillText(s.date + '   ·   ' + s.platform + '   ·   Online ' + h + 'h ' + m + 'm', 16, 84);
      g.fillStyle = '#6b7280'; g.font = '600 11px system-ui, sans-serif';
      g.fillText('TIME     AREA            KM        PAYOUT', 16, 116);
      let y = 140;
      s.orders.slice(0, 13).forEach((o, i) => {
        g.fillStyle = i % 2 ? '#ffffff' : '#eef0f3'; g.fillRect(8, y - 17, W - 16, 28);
        g.fillStyle = '#111827'; g.font = '13px ui-monospace, Consolas, monospace';
        const hh = Math.floor(o.hour), mm = Math.round((o.hour - hh) * 60);
        const line = pad(hh) + ':' + pad(mm) + '  ' + o.zone.slice(0, 10).padEnd(10) + ' ' + o.km.toFixed(1).padStart(4) + ' km  Rs ' + o.pay +
          (o.incentive ? ' + Rs ' + o.incentive : '') + (o.deduction ? ' - Rs ' + o.deduction : '');
        g.fillText(line, 14, y);
        y += 29;
      });
      if (s.bonus) { g.fillStyle = '#065f46'; g.font = '600 13px ui-monospace, Consolas, monospace'; g.fillText('Daily bonus Rs ' + s.bonus, 14, y + 6); }
      return c.toDataURL('image/png');
    });
  }

  // a rider paying off a financed bike: Rs 3,600/month EMI (~Rs 120/day)
  const DEMO_PROFILE = { fixedPerDay: 120 };
  const API = { demoSessions, cityData, renderSampleScreens, rng, WINDOWS, CITY_ZONES, K_ANON, DEMO_PROFILE };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TWDemo = API;
})(typeof window !== 'undefined' ? window : globalThis);
