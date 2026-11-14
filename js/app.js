/* TrueWage UI v4: one answer per screen, short guided flows, advanced material behind simple switches. */
(function () {
  'use strict';
  const { t } = I18N;
  const T = TW, D = TWDemo, R = TWReader;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = n => (Math.round(n) < 0 ? '−' : '') + '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
  const rd = n => Math.round(n);
  const LOC = { en: 'en-IN', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN' };

  const ICON = {
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    insights: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
    city: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    proof: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    print: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>',
    bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5V14l-3-3 4-3 2 3h2"/>',
    auto: '<path d="M5 17H3v-5l2-5h11l3 5h2v5h-2"/><circle cx="7.5" cy="17" r="2.5"/><circle cx="16.5" cy="17" r="2.5"/><path d="M10 17h4M3 12h16"/>',
    gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'
  };
  const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  const S = {
    sessions: [], profile: T.defaultProfile('petrol'), hashes: [], reader: null, lastBatch: [], shared: false,
    rider: { name: '', phone4: '' }, lang: 'en', report: null, tab: 'home', demo: false,
    day: null, goal: 800, simHour: null, oc: null, fairTarget: null, wi: { hours: {}, days: null, fuel: 0 }, pending: null,
    insSeg: 'coach', city: 'Hyderabad', citySeg: 'map', advAll: false, fullCalc: false, sheet: null, vehicleOk: false, tourDone: false, big: false, shifts: [], shift: null, meas: null, expenses: [], fills: null, user: null, ver: 0, authMode: 'register'
  };
  const ui = { busy: false, msg: null, thumbs: null, open: new Set(), chat: [], ai: false, listening: false, thinking: false, sync: 'idle' };

  /* ---------- persistence (best-effort; the app works without it) ---------- */
  const KEY = 'truewage.v3';
  const PERSIST = ['sessions', 'profile', 'hashes', 'reader', 'lastBatch', 'shared', 'rider', 'lang', 'demo', 'goal', 'vehicleOk', 'tourDone', 'big', 'shifts', 'shift', 'city', 'expenses'];
const SYNC_KEYS = ['sessions', 'profile', 'hashes', 'reader', 'lastBatch', 'shared', 'rider', 'lang', 'demo', 'goal', 'vehicleOk', 'tourDone', 'big', 'shifts', 'city', 'expenses'];
  const LOCALKEY = () => (S.user ? 'truewage.u' + S.user.id : KEY);
  function save() {
    try { const o = {}; PERSIST.forEach(k => o[k] = S[k]); localStorage.setItem(LOCALKEY(), JSON.stringify(o)); } catch (e) { /* private mode */ }
    if (S.user) scheduleSync();
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY), j = JSON.parse(raw || 'null');
      if (j) PERSIST.forEach(k => { if (j[k] !== undefined) S[k] = j[k]; });
      else { const nl = (navigator.language || '').slice(0, 2); if (['hi', 'te', 'ta'].includes(nl)) S.lang = nl; } // first visit: use the phone's language
    } catch (e) { /* ignore */ }
  }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 4200); }
  /* Effective inputs: tracked shifts fill in missing online time, and once 3 shifts are paired with screenshots the
     GPS-measured unpaid-riding factor replaces our assumption. */
  function effective() {
    const sess = T.applyShifts(S.sessions, S.shifts), m = T.measuredDeadKm(S.sessions, S.shifts);
    S.meas = m; S.fills = T.fuelFromFills(S.expenses);
    let prof = m.reliable ? Object.assign({}, S.profile, { deadKm: m.factor, deadMeasured: true }) : Object.assign({}, S.profile);
    if (S.demo) { prof.expenses = []; return { sess, prof }; }                    // the sample rider never mixes with a real rider's logged costs
    if (S.fills.reliable && !(S.profile.fuelPerKmOverride > 0)) prof.fuelPerKmOverride = S.fills.perKm;   // measured petrol cost beats the estimate (a manual value still wins)
    prof.expenses = S.expenses || [];
    return { sess, prof };
  }
  function recompute() { const e = effective(); S.report = S.sessions.length ? T.analyze(e.sess, e.prof) : null; save(); }
  const dLabel = (iso, o) => new Date(iso + 'T00:00:00').toLocaleDateString(LOC[S.lang], o);
  function anonId() { try { let id = localStorage.getItem('truewage.rid'); if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('truewage.rid', id); } return id; } catch (e) { return null; } }
  const resetWi = () => { S.wi = { hours: {}, days: null, fuel: 0 }; };

  /* ---------- shell ---------- */
  const NAV = [['home', 'n_home', 'home'], ['check', 'n_check', 'check'], ['insights', 'n_insights', 'insights'], ['city', 'n_city', 'city'], ['proof', 'n_proof', 'proof']];
  function buildNav() {
    $('#nav').innerHTML = NAV.map(([id, k]) => `<button data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${t(k)}</button>`).join('');
    $('#tabbar').innerHTML = NAV.map(([id, k, i]) => `<button data-tab="${id}" ${S.tab === id ? 'aria-current="page"' : ''}>${ic(i)}<span>${t(k)}</span></button>`).join('');
    $$('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  }
  function applyStatic() { $$('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n)); $('#btn-acct').setAttribute('aria-label', t('au_account')); acctBtn(); document.documentElement.lang = S.lang; document.documentElement.classList.toggle('big', !!S.big); }
  const RENDER = { home: () => renderHome(), check: () => renderCheck(), insights: () => renderInsights(), city: () => renderCity(), proof: () => renderProof() };
  function setTab(name, noScroll) {
    S.tab = name;
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
    buildNav(); RENDER[name](); syncFab();
    if (!noScroll) window.scrollTo({ top: 0 });
  }
  const rerender = () => setTab(S.tab, true);

  /* ---------- shared pieces ---------- */
  function costsHTML() {
    const p = S.profile;
    const f = (k, label, step) => `<div class="field"><label>${t(label)}</label><input type="number" inputmode="decimal" step="${step || 'any'}" min="0" data-cost="${k}" value="${p[k]}"></div>`;
    const veh = ['petrol', 'ev', 'cng', 'car'].map(v => `<option value="${v}" ${p.vehicle === v ? 'selected' : ''}>${t('v_' + v)}</option>`).join('');
    return `<div class="field"><label>${t('vehicle')}</label><select data-cost="vehicle">${veh}</select></div>` +
      f('fixedPerDay', 'fixed', 10) + f('fuelPrice', 'fuel_price') + f('mileage', 'mileage') +
      `<div class="field"><label>${t('cal_field')}</label><input type="number" inputmode="decimal" step="0.1" min="0" data-cost="fuelPerKmOverride" value="${p.fuelPerKmOverride || ''}" placeholder="\u2013"></div>` + f('maintPerKm', 'maint', 0.05) + f('deadKm', 'dead', 0.05) + f('dataPerHour', 'datacost', 0.5) + f('minWage', 'minwage', 5);
  }
  function bindCosts(root) {
    $$('[data-cost]', root).forEach(inp => inp.addEventListener('change', () => {
      const k = inp.dataset.cost;
      if (k === 'vehicle') { const d = T.defaultProfile(inp.value); S.profile = Object.assign({}, S.profile, { vehicle: inp.value, mileage: d.mileage, fuelPrice: d.fuelPrice, maintPerKm: d.maintPerKm, deadKm: d.deadKm, fuelPerKmOverride: 0 }); S.vehicleOk = true; $('#sheet-body') && S.sheet === 'costs' && renderSheet(); }
      else if (k === 'fuelPerKmOverride' && inp.value.trim() === '') S.profile[k] = 0;
      else { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0 && !(k === 'mileage' && v === 0)) S.profile[k] = v; else inp.value = S.profile[k] || ''; }
      S.vehicleOk = true; recompute(); resetWi();
    }));
  }

  let CITIES = {};
  const cityFor = name => CITIES[name] || (CITIES[name] = D.cityData(name));
  const ORDER = ['leak', 'below', 'above', 'skip', 'switch', 'best', 'platform', 'breakeven', 'whatif', 'perkm', 'waitimpact', 'deadkm', 'expense', 'permkm', 'lowdata'];
  function allInsights(rep) {
    const list = rep.insights.concat(T.areaSwitch(rep, cityFor(S.city).cells));
    return list.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  }
  function adviceText(ins) { const p = Object.assign({}, ins.p); if (p.daypart) p.daypart = t('dp_' + p.daypart); return t(ins.key === 'switch' && ins.p.src === 'city' ? 'a_switch_city' : 'a_' + ins.key, p); }
  const TAG = { leak: ['tg_real', 'bad'], below: ['tg_alert', 'bad'], above: ['tg_ok', 'good'], skip: ['tg_skip', 'bad'], best: ['tg_more', 'good'], permkm: ['tg_watch', 'warn'], deadkm: ['tg_watch', 'warn'],
    whatif: ['tg_if', 'good'], perkm: ['tg_real', 'warn'], waitimpact: ['tg_watch', 'warn'], breakeven: ['tg_watch', 'warn'], platform: ['tg_more', 'good'], expense: ['tg_real', 'warn'], lowdata: ['tg_alert', 'warn'], switch: ['tg_more', 'good'] };
  function adviceRows(list) {
    return list.map((a, n) => { const [k, sev] = TAG[a.i.key] || ['tg_watch', 'warn']; return `<div class="adv"><div><span class="tag ${sev}">${t(k)}</span><p>${esc(a.txt)}</p></div><button class="ibtn" data-spk="${n}" aria-label="${t('speak')}">${ic('volume')}</button></div>`; }).join('');
  }
  const bindSpeak = (root, list) => $$('[data-spk]', root).forEach(b => b.onclick = () => speak([list[+b.dataset.spk].txt]));
  function speakable(txt) { const word = { en: 'rupees', hi: 'रुपये', te: 'రూపాయలు', ta: 'ரூபாய்' }[S.lang] || 'rupees'; return txt.replace(/₹\s?([\d,]+)/g, '$1 ' + word); }
  function speak(texts) {
    if (!('speechSynthesis' in window)) { toast('Voice is not supported on this browser.'); return; }
    speechSynthesis.cancel();
    const lang = I18N.voice(), voices = speechSynthesis.getVoices();
    const v = voices.find(x => x.lang.replace('_', '-') === lang) || voices.find(x => x.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    if (!v && S.lang !== 'en') toast('Install the ' + I18N.L[S.lang]._name + ' voice in your device settings to hear this.');
    texts.forEach(txt => { const u = new SpeechSynthesisUtterance(speakable(txt)); u.lang = lang; if (v) u.voice = v; u.rate = 0.92; speechSynthesis.speak(u); });
  }
  const seg = (id, items, cur) => `<div class="seg" id="${id}" role="tablist">${items.map(([k, label]) => `<button data-s="${k}" aria-pressed="${cur === k}">${label}</button>`).join('')}</div>`;
  function noData(v) {
    v.innerHTML = `<div class="empty"><h2 class="h2">${t('empty_t')}</h2><p>${t('empty_p')}</p><div class="rows" style="justify-content:center"><button class="btn lg" id="e-add">${t('add_shots')}</button><button class="btn lg alt" id="e-demo">${t('btn_demo')}</button></div></div>`;
    $('#e-demo', v).onclick = () => loadDemo('Hyderabad'); $('#e-add', v).onclick = () => openSheet('import');
  }

  /* ---------- ledger: from the app's total to cash in hand (each line is a waterfall step) ---------- */
  function ledgerHTML(r, full) {
    const g = Math.max(1, r.appShown);
    let cur = r.appShown;
    const row = (label, v, kind, note) => {
      let l, w;
      if (kind === 'cost') { l = (cur - v) / g; w = v / g; cur -= v; } else { l = 0; w = Math.max(0, v) / g; }
      return `<div class="lg ${kind}"><div class="lg-t"><span>${label}</span><span class="v num">${kind === 'cost' ? '−' : ''}${inr(Math.abs(v))}</span></div>
        <div class="tk" aria-hidden="true"><i class="${kind}" style="left:${Math.max(0, l * 100).toFixed(2)}%;width:${Math.max(0.8, Math.min(100, w * 100)).toFixed(2)}%"></i></div>${note ? `<div class="lg-n">${note}</div>` : ''}</div>`;
    };
    const unpaid = r.deadCost >= 0.5 ? `${t('rc_unpaid')}: ${inr(r.deadCost)} (${Math.round(r.deadKm * 10) / 10} km)` : '';
    const L = [row(t('c_app'), r.appShown, 'start')];
    if (r.deduction >= 0.5) L.push(row(t('c_ded'), r.deduction, 'cost'));
    if (full) L.push(row(t('c_fuel'), r.fuel, 'cost', unpaid), row(t('c_maint'), r.maint, 'cost'));
    else L.push(row(t('g_vehicle'), r.fuel + r.maint, 'cost', unpaid));
    L.push(row(t('c_data'), r.data, 'cost'));
    if (full) L.push(row(t('c_op'), r.op, 'sub'));
    if (r.fixed >= 0.5) L.push(row(t('c_fixed'), r.fixed, 'cost'));
    L.push(row(t('c_cash'), r.net, 'end'));
    return `<div class="ledger">${L.join('')}</div>`;
  }
  const smallReceipt = (r, label, example) => `<div class="card">${example ? `<span class="example-tag">${t('pr_label')}</span>` : ''}<div class="h3" style="margin-bottom:6px">${t('where_went')} <span class="muted" style="font-weight:500;font-size:15px">· ${esc(label)}</span></div>${ledgerHTML(r, false)}</div>`;

  /* ---------- HOME ---------- */
  let EX = null;
  const exampleReport = () => EX || (EX = T.analyze(D.demoSessions(), Object.assign(T.defaultProfile('petrol'), D.DEMO_PROFILE)));

  function routeArt() {
    return `<svg class="routeart" viewBox="0 0 440 190" role="img" aria-label="An auto and a delivery bike on the road" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="118" width="440" height="58" rx="10" fill="#17150F"/><rect x="0" y="118" width="440" height="6" fill="#F5D547"/>
      <g stroke="#F5D547" stroke-width="4" stroke-dasharray="26 22" stroke-linecap="round"><path d="M10 150 H430"/></g>
      <g transform="translate(250 56)"><!-- auto -->
        <path d="M6 40 V22 q0-8 8-8 h46 q8 0 12 8 l12 20 v8 H6z" fill="#F5D547" stroke="#17150F" stroke-width="3" stroke-linejoin="round"/>
        <path d="M10 22 q6-12 20-12 h32 q6 0 9 6 l6 8" fill="#17150F"/><rect x="18" y="22" width="26" height="12" rx="2" fill="#fff" stroke="#17150F" stroke-width="2"/><rect x="48" y="22" width="14" height="12" rx="2" fill="#fff" stroke="#17150F" stroke-width="2"/>
        <circle cx="26" cy="52" r="11" fill="#17150F"/><circle cx="26" cy="52" r="4.5" fill="#F5D547"/><circle cx="72" cy="52" r="11" fill="#17150F"/><circle cx="72" cy="52" r="4.5" fill="#F5D547"/></g>
      <g transform="translate(70 70)"><!-- delivery bike -->
        <circle cx="16" cy="40" r="12" fill="none" stroke="#17150F" stroke-width="4"/><circle cx="66" cy="40" r="12" fill="none" stroke="#17150F" stroke-width="4"/>
        <path d="M16 40 L30 22 H52 L66 40 M30 22 L26 14 H18 M52 22 L48 12 H56" fill="none" stroke="#17150F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="30" y="2" width="22" height="18" rx="3" fill="#F5D547" stroke="#17150F" stroke-width="3"/><circle cx="41" cy="-6" r="8" fill="#17150F"/>
        <path d="M34 11h14M34 15h9" stroke="#17150F" stroke-width="2" stroke-linecap="round"/></g>
      <g transform="translate(18 26)"><path d="M14 0a10 10 0 0 1 10 10c0 8-10 20-10 20S4 18 4 10A10 10 0 0 1 14 0z" fill="#B5371A"/><circle cx="14" cy="10" r="3.5" fill="#fff"/></g>
      <g transform="translate(396 20)"><path d="M14 0a10 10 0 0 1 10 10c0 8-10 20-10 20S4 18 4 10A10 10 0 0 1 14 0z" fill="#0A6A46"/><circle cx="14" cy="10" r="3.5" fill="#fff"/></g>
      <path d="M40 40 C 120 4, 300 4, 400 36" fill="none" stroke="#756F62" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>
    </svg>`;
  }

  /** Speedometer: needle = what you really earn per hour, yellow marker = what the apps imply, white tick = the fair-wage line. */
  function gaugeSVG(real, claimed, fair) {
    const max = Math.max(10, Math.ceil(Math.max(real, claimed, fair) * 1.15 / 10) * 10), W = 300, H = 215, cx = 150, cy = 150, R = 118;
    const ang = v => Math.PI * (1 - Math.max(0, Math.min(max, v)) / max), pt = (v, r) => [cx + r * Math.cos(ang(v)), cy - r * Math.sin(ang(v))];
    const arc = (a, b, r, col, w) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="butt"/>`; };
    const fairV = Math.min(fair, max), [nx, ny] = pt(Math.max(0, real), R - 14), [fx1, fy1] = pt(fairV, R - 17), [fx2, fy2] = pt(fairV, R + 17), [mx, my] = pt(claimed, R + 24), [mx2, my2] = pt(claimed, R + 10);
    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => { const v = max * f, [a, b] = pt(v, R + 8), [c, d] = pt(v, R + 17); return `<path d="M${a.toFixed(1)} ${b.toFixed(1)} L${c.toFixed(1)} ${d.toFixed(1)}" stroke="#8A8376" stroke-width="2"/>`; }).join('');
    return `<svg class="gauge" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('gauge_aria', { real: inr(real), app: inr(claimed), fair: inr(fair) }))}">
      ${arc(0, fairV, R, '#E4572E', 16)}${arc(fairV, max, R, '#3DDC97', 16)}${ticks}
      <path d="M${fx1.toFixed(1)} ${fy1.toFixed(1)} L${fx2.toFixed(1)} ${fy2.toFixed(1)}" stroke="#FF8A6B" stroke-width="4"/>
      <path d="M${mx2.toFixed(1)} ${my2.toFixed(1)} L${(mx + (cx - mx) * 0.06).toFixed(1)} ${(my + (cy - my) * 0.06).toFixed(1)}" stroke="#FFC400" stroke-width="7" stroke-linecap="round"/>
      <g class="needle" style="--from:${(-(180 - ang(Math.max(0, real)) * 180 / Math.PI)).toFixed(1)}deg"><path d="M${cx} ${cy} L${nx.toFixed(1)} ${ny.toFixed(1)}" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g><circle cx="${cx}" cy="${cy}" r="9" fill="#fff"/><circle cx="${cx}" cy="${cy}" r="4" fill="#17150F"/>
      <text x="${cx}" y="${cy + 42}" text-anchor="middle" class="g-big">${esc(inr(real))}</text><text x="${cx}" y="${cy + 62}" text-anchor="middle" class="g-sm">${esc(t('gauge_unit'))}</text>
    </svg>
    <div class="g-leg"><span><i style="background:#fff"></i>${esc(t('gauge_real'))}</span><span><i style="background:#FFC400"></i>${esc(t('gauge_apps', { v: inr(claimed) }))}</span><span><i style="background:#E4572E"></i>${esc(t('gauge_fair', { v: inr(fair) }))}</span></div>`;
  }
  function checklistHTML() {
    const steps = [[S.sessions.length > 0, 'ck_1', 'import'], [(S.expenses || []).some(e => e.category === 'fuel'), 'ck_2', 'expenses'], [S.shifts.length > 0, 'ck_3', null]], done = steps.filter(x => x[0]).length;
    return `<section class="card checklist"><div class="rows between"><h3 class="h3">${t('ck_h')}</h3><span class="pill">${done}/3</span></div><ol class="ck">${steps.map(([ok, k, sheet]) => `<li class="${ok ? 'done' : ''}"><span class="tick" aria-hidden="true">${ok ? '✓' : ''}</span><span>${t(k)}</span>${!ok && sheet ? `<button class="link" data-ck="${sheet}">${t('ck_go')}</button>` : ''}</li>`).join('')}</ol></section>`;
  }
  function renderWelcome(v) {
    v.innerHTML = `<div class="welcome stack"><div><h1 class="h2" style="font-size:32px">${esc(t('au_welcome', { name: S.user.name }))}</h1><p class="muted" style="margin-top:6px">${t('au_welcome_p')}</p></div>
      ${checklistHTML()}<button class="btn lg" id="w-add">${ic('upload')}${t('add_shots')}</button>${shiftCardHTML(null)}
      <section class="card"><h3 class="h3" style="margin-bottom:10px">${t('au_demo_h')}</h3><div class="rows"><button class="btn alt" id="w-hyd">${t('dm_hyd')}</button><button class="btn alt" id="w-blr">${t('dm_blr')}</button></div></section></div>`;
    $$('[data-ck]', v).forEach(b => b.onclick = () => openSheet(b.dataset.ck));
    $('#w-add', v).onclick = () => openSheet('import'); $('#w-hyd', v).onclick = () => loadDemo('Hyderabad'); $('#w-blr', v).onclick = () => loadDemo('Bengaluru'); bindShift(v);
  }
  function renderLanding(v) {
    if (S.user) return renderWelcome(v);
    const ex = exampleReport(), r = T.dayReceipt(ex, 'period');
    const langs = Object.keys(I18N.L).map(k => `<button data-l="${k}" aria-pressed="${S.lang === k}">${I18N.L[k]._name}</button>`).join('');
    v.innerHTML = `
      <div class="landing hero"><div>
          <h1>${t('hero_h')}</h1><p class="lead">${t('hero_p')}</p>
          <div class="langs"><div class="eyebrow">${t('pick_lang')}</div><div class="seg" id="lseg">${langs}</div></div>
          <div class="cta"><button class="btn lg" id="l-signup">${t('au_cta')}</button><button class="btn lg alt" id="l-login">${t('au_login')}</button></div><div class="eyebrow" style="margin:16px 0 6px">${t('au_demo_h')}</div><div class="cta"><button class="btn alt" id="l-demo">${t('dm_hyd')}</button><button class="btn alt" id="l-demo2">${t('dm_blr')}</button></div><p style="margin-top:12px"><button class="link" id="l-add">${t('au_guest')}</button></p></div>
        <div>${routeArt()}${smallReceipt(r, t('period_all'), true)}</div></div>
      <div class="steps">
        <div><span class="n">1</span><div><h3>${t('step_1')}</h3><p>${t('st1_p')}</p></div></div>
        <div><span class="n">2</span><div><h3>${t('step_2')}</h3><p>${t('st2_p')}</p></div></div>
        <div><span class="n">3</span><div><h3>${t('step_3')}</h3><p>${t('st3_p')}</p></div></div></div>`;
    $$('#lseg button', v).forEach(b => b.onclick = () => changeLang(b.dataset.l));
    v.insertAdjacentHTML('beforeend', `<div style="margin-top:28px;max-width:560px">${shiftCardHTML(null)}</div>`); bindShift(v);
    $('#l-add', v).onclick = () => openSheet('import'); $('#l-signup', v).onclick = () => { S.authMode = 'register'; openSheet('auth'); }; $('#l-login', v).onclick = () => { S.authMode = 'login'; openSheet('auth'); }; $('#l-demo', v).onclick = () => loadDemo('Hyderabad'); $('#l-demo2', v).onclick = () => loadDemo('Bengaluru');
  }

  const HOURS_NOW = () => (S.simHour != null ? S.simHour : new Date().getHours());
  function nextStepHTML(rep, plan) {
    let text, btns = '';
    if (!S.vehicleOk) { text = t('ns_vehicle', { vehicle: t('v_' + S.profile.vehicle) }); btns = `<button class="btn sm" id="ns-yes">${t('ns_yes')}</button><button class="btn sm alt" id="ns-change">${t('change')}</button>`; }
    else if (rep.dataQuality.level === 'low' || rep.daysWorked < 7) { text = t('ns_more'); btns = `<button class="btn sm" id="ns-add">${t('add_shots')}</button>`; }
    else if (plan.state === 'good') { text = t('ns_now_good', { zone: plan.now.zone, platform: plan.now.platform, rate: inr(plan.now.perHr) }); btns = `<button class="btn sm alt" id="ns-spk">${ic('volume')}${t('speak')}</button>`; }
    else if (plan.next) { text = t('ns_go', { start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate: inr(plan.next.perHr) }); btns = `<button class="btn sm alt" id="ns-spk">${ic('volume')}${t('speak')}</button>`; }
    else { text = t('ns_share'); btns = `<button class="btn sm" id="ns-proof">${t('n_proof')}</button>`; }
    return `<section class="next"><div class="eyebrow">${t('ns_h')}</div><p>${esc(text)}</p><div class="rows">${btns}</div><span hidden id="ns-text">${esc(text)}</span></section>`;
  }
  function accuracyHTML(rep) {
    const sn = T.sensitivity(T.applyShifts(S.sessions, S.shifts), rep.profile);
    return `<details class="card acc"><summary><span>${t('acc_h')}</span><b class="num">${inr(sn.lo)}\u2013${inr(sn.hi)}/h</b></summary>
      <p style="margin-top:10px">${esc(t('acc_range', { lo: inr(sn.lo), hi: inr(sn.hi) }))}</p>
      <p class="note" style="margin-top:8px"><b>\u2713</b> ${t('acc_measured')}</p><p class="note" style="margin-top:4px"><b>\u2248</b> ${t('acc_assumed')}</p>
      <button class="btn sm alt" id="acc-cal" style="margin-top:12px">${t('cal_field').replace(/\s*\(.*$/, '')}</button></details>`;
  }
  function tourHTML() {
    if (!S.demo || S.tourDone) return '';
    return `<section class="card tour"><div class="rows between"><h3 class="h3">${t('tour_h')}</h3><button class="link" id="tour-x">${t('got_it')}</button></div>
      <ol><li><button data-tour="listen">${t('tour_1')}</button></li><li><button data-tour="ask">${t('tour_2')}</button></li><li><button data-tour="wi">${t('tour_3')}</button></li><li><button data-tour="proof">${t('tour_4')}</button></li></ol></section>`;
  }

  function streakInfo(rep) {
    const days = new Set(rep.byDay.map(d => d.date)); let n = 0; const d = new Date();
    if (!days.has(localDate(d.getTime()))) d.setDate(d.getDate() - 1);
    while (days.has(localDate(d.getTime()))) { n++; d.setDate(d.getDate() - 1); }
    return { n, best: Math.max.apply(null, rep.byDay.map(x => x.net)) };
  }
  function shareToday(rep) {
    const today = localDate(Date.now()), d = (rep.byDay || []).find(x => x.date === today) || rep.byDay[rep.byDay.length - 1];
    const txt = t('td_share_txt', { date: dLabel(d.date, { day: 'numeric', month: 'short' }), kept: inr(d.net), app: inr(d.appShown), real: inr(d.perHr) });
    if (navigator.share) navigator.share({ text: txt }).catch(() => { /* cancelled */ }); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank', 'noopener');
  }
  /** "Today": the first thing a rider sees when they open the app: how far along the day is, and the one action that matters now. */
  function todayCardHTML(rep) {
    if (S.demo) return '';
    const hr = new Date().getHours(), greet = t(hr < 12 ? 'gr_morning' : hr < 17 ? 'gr_afternoon' : 'gr_evening'), first = S.user ? ' ' + esc(S.user.name.trim().split(/\s+/)[0]) : '';
    const today = localDate(Date.now()), d = (rep.byDay || []).find(x => x.date === today), kept = d ? Math.max(0, d.net) : 0, goal = Math.max(100, S.goal || 800), pct = Math.min(100, Math.round(kept / goal * 100));
    const C = 2 * Math.PI * 34, off = C * (1 - pct / 100), running = !!S.shift;
    const plats = S.sessions.length ? S.sessions[S.sessions.length - 1].platform : 'Swiggy';
    const sub = !d ? t('td_none') : pct >= 100 ? t('td_done') : t('td_togo', { n: inr(goal - kept) });
    return `<section class="card today" id="today"><div class="td-top"><div><div class="eyebrow">${esc(dLabel(today, { weekday: 'long', day: 'numeric', month: 'long' }))}</div><h2 class="h2">${greet}${first}</h2></div>
        <svg class="ring" viewBox="0 0 80 80" role="img" aria-label="${esc(t('td_goal'))}: ${pct}%"><circle cx="40" cy="40" r="34" class="ring-bg"/><circle cx="40" cy="40" r="34" class="ring-fg ${pct >= 100 ? 'full' : ''}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 40 40)" style="--c:${C.toFixed(1)};--o:${off.toFixed(1)}"/><text x="40" y="45" text-anchor="middle" class="ring-t">${pct}%</text></svg></div>
      <div class="td-row"><div><div class="td-n num">${inr(kept)}</div><div class="note">${esc(t('td_kept_of', { g: inr(goal) }))} · ${esc(sub)}</div></div></div>
      <div class="td-chips"><span class="pill">${esc(t('td_streak', { n: streakInfo(rep).n }))}</span><span class="pill">${esc(t('td_best', { v: inr(streakInfo(rep).best) }))}</span><button class="link" id="td-share">${ic('share')} ${t('td_share')}</button></div>
      <div class="td-btns"><button class="btn lg ${running ? 'stop' : 'go'}" id="td-shift">${ic('bike')}${running ? t('sh_stop') + ' · <span id="td-t">' + fmtDur(Date.now() - S.shift.start) + '</span>' : t('sh_start')}</button>
        <button class="btn lg alt" id="td-add">${ic('upload')}${t('add_shots')}</button></div></section>`;
  }
  const bindToday = v => {
    const b = $('#td-shift', v); if (b) b.onclick = () => { if (S.shift) shiftStop(); else shiftStart(S.sessions.length ? S.sessions[S.sessions.length - 1].platform : 'Swiggy'); };
    const a = $('#td-add', v); if (a) a.onclick = () => openSheet('import');
    const sh = $('#td-share', v); if (sh) sh.onclick = () => shareToday(S.report);
  };
  /** Numbers climb to their value and the speedometer needle sweeps in: the screen feels live, not printed. */
  function animateHome(v) {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = $('.kept-n', v); if (!el || el.dataset.done === S.report.total.net.toFixed(0)) return;
    const txt = el.textContent, target = Math.round(parseFloat(txt.replace(/[^0-9.]/g, '')) || 0), neg = /^[−-]/.test(txt), t0 = performance.now(), dur = 800;
    if (!target) return;
    const abs = Math.abs(target); el.dataset.done = S.report.total.net.toFixed(0);
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = (neg ? '−' : '') + '₹' + Math.round(abs * e).toLocaleString('en-IN'); if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  }

  function renderHome() {
    const v = $('#view-home'), rep = S.report;
    if (!rep) return renderLanding(v);
    const days = rep.dates.slice(-7).reverse();
    const sel = S.day === 'typical' ? 'typical' : (S.day && days.includes(S.day) ? S.day : 'period');
    const r = sel === 'typical' ? T.dayReceipt(rep, null) : T.dayReceipt(rep, sel);
    const label = sel === 'period' ? t('period_all') : sel === 'typical' ? t('avg_day') : dLabel(sel, { weekday: 'short', day: 'numeric', month: 'short' });
    const range = rep.daysWorked === 1 ? dLabel(rep.dates[0], { weekday: 'short', day: 'numeric', month: 'short' }) : `${dLabel(rep.dates[0], { day: 'numeric', month: 'short' })} – ${dLabel(rep.dates[rep.dates.length - 1], { day: 'numeric', month: 'short' })} · ${rep.daysWorked} ${t('days')}`;
    const plan = T.planNow(rep, HOURS_NOW());
    const advice = allInsights(rep).filter(i => ['skip', 'switch', 'best', 'platform', 'breakeven', 'whatif', 'deadkm', 'waitimpact', 'lowdata'].includes(i.key)).slice(0, 2).map(i => ({ i, txt: adviceText(i) }));
    const keptPct = r.appShown > 0 ? Math.max(0, Math.min(100, rd(r.net / r.appShown * 100))) : 0;
    const p = S.profile, vlabel = t('v_' + p.vehicle);
    v.innerHTML = `
      <div class="period"><div>${S.demo ? `<span class="sim">${t('pr_label')}</span>` : `<span class="eyebrow">${esc(range)}</span>`}</div>
        <select id="period" class="sel" aria-label="${t('period_pick')}"><option value="period" ${sel === 'period' ? 'selected' : ''}>${t('period_all')}</option><option value="typical" ${sel === 'typical' ? 'selected' : ''}>${t('avg_day')}</option>${days.map(d => `<option value="${d}" ${d === sel ? 'selected' : ''}>${dLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>`).join('')}</select></div>
      <div class="cols lead">
        <div class="stack">
          ${todayCardHTML(rep)}
          <section class="kept-card"><div class="kept-lbl">${t('you_kept')} · ${esc(label)}</div>
            <div class="kept-n num ${r.net < 0 ? 'neg' : ''}">${inr(r.net)}</div>
            <p class="kept-sum">${esc(t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) }))}</p>
            <div class="gaugebox">${gaugeSVG(Math.max(0, r.perHr), r.appPerHr, S.profile.minWage)}</div>
            <div class="kbar" aria-hidden="true"><i style="width:${keptPct}%"></i></div>
            <div class="kbar-l"><span>${esc(t('kept_pct', { p: keptPct }))}</span><span>${Math.round(r.hours * 10) / 10} ${t('hours')} · ${rd(r.orders)} ${t('orders_n')}</span></div></section>
          ${nextStepHTML(rep, plan)}
          <div class="acts"><button class="btn lg" id="a-check">${t('n_check')}</button><button class="btn lg alt" id="a-add">${t('add_shots')}</button></div>
          ${tourHTML()}
          ${shiftCardHTML(rep)}
          <div class="rows"><button class="btn sm alt" id="share">${ic('share')}${t('share_btn')}</button><button class="btn sm alt" id="spk-day">${ic('volume')}${t('speak')}</button></div>
          ${accuracyHTML(rep)}
          <div class="assume"><span>${t('assume_h')}: <b>${esc(vlabel)}</b> · ${inr(p.fuelPrice)} · ${p.mileage} km · EMI ${inr(p.fixedPerDay)}/${t('days').replace(/s$/, '')}</span><button class="link" id="a-costs">${t('change')}</button></div>
        </div>
        <div class="stack">
          <section class="card o-where"><div class="rows between" style="margin-bottom:4px"><h3 class="h3">${t('where_went')}</h3><button class="link" id="a-full">${S.fullCalc ? t('imp_hide') : t('full_calc')}</button></div>
            ${ledgerHTML(r, S.fullCalc)}${S.fullCalc ? `<p class="note" style="margin-top:10px">${t('op_note')}</p>` : ''}</section>
          ${advice.length ? `<section class="card o-adv"><div class="rows between"><h3 class="h3">${t('advice_h')}</h3><button class="link" id="to-ins">${t('more_advice')}</button></div>${adviceRows(advice)}</section>` : ''}
          ${planCard(rep, plan)}
          ${planDayCard(rep)}
          ${weekCardHTML(rep)}
        </div>
      </div>`;
    $('#period', v).onchange = e => { S.day = e.target.value; renderHome(); };
    bindToday(v); animateHome(v);
    $('#a-check', v).onclick = () => setTab('check'); $('#a-add', v).onclick = () => openSheet('import'); $('#a-costs', v).onclick = () => openSheet('costs');
    $('#a-full', v).onclick = () => { S.fullCalc = !S.fullCalc; renderHome(); };
    $('#share', v).onclick = () => shareReceipt(r, label);
    $('#spk-day', v).onclick = () => speak([t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) })].concat(advice.map(a => a.txt)));
    const more = $('#to-ins', v); if (more) more.onclick = () => { S.insSeg = 'advice'; setTab('insights'); };
    const on = (id, fn) => { const el = $(id, v); if (el) el.onclick = fn; };
    on('#ns-yes', () => { S.vehicleOk = true; save(); renderHome(); }); on('#ns-change', () => openSheet('costs')); on('#ns-add', () => openSheet('import'));
    on('#ns-spk', () => speak([$('#ns-text', v).textContent])); on('#ns-proof', () => setTab('proof')); on('#acc-cal', () => openSheet('costs'));
    on('#tour-x', () => { S.tourDone = true; save(); renderHome(); });
    $$('[data-tour]', v).forEach(b => b.onclick = () => {
      const k = b.dataset.tour;
      if (k === 'listen') speak([t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) })]);
      else if (k === 'ask') { openSheet('ask'); sendAsk(t('ask_q3')); }
      else if (k === 'wi') { S.insSeg = 'wi'; setTab('insights'); }
      else setTab('proof');
    });
    bindSpeak(v, advice); bindShift(v);
    const sim = $('#sim', v); if (sim) sim.onchange = () => { S.simHour = sim.value === '' ? null : +sim.value; renderHome(); };
    const pg = $('#pd-goal', v); if (pg) pg.onchange = () => { S.goal = Math.max(100, parseFloat(pg.value) || 800); save(); renderHome(); };
    const ps = $('#pd-spk', v); if (ps) ps.onclick = () => speak($$('#pd-lines li', v).map(x => x.textContent).concat([$('#pd-total', v).textContent]));
    const wm = $('#wk-more', v); if (wm) wm.onclick = () => { S.insSeg = 'coach'; setTab('insights'); };
  }

  function planCard(rep, plan) {
    const mw = rep.profile.minWage, cur = plan.hour, hours = []; for (let h = 6; h < 24; h++) hours.push(h);
    const cells = hours.map(h => { const b = plan.best[h]; return `<i class="${b ? (b.perHr >= mw ? 'g' : 'b') : ''} ${h === cur ? 'cur' : ''}" title="${h}:00 ${b ? inr(b.perHr) + '/h · ' + esc(b.platform) + ' ' + esc(b.zone) : ''}"></i>`; }).join('');
    const nx = plan.next ? { start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate2: rd(plan.next.perHr) } : null;
    let msg;
    if (plan.state === 'good') msg = t('plan_good', { rate: rd(plan.now.perHr), zone: plan.now.zone, platform: plan.now.platform });
    else if (plan.state === 'poor') msg = nx ? t('plan_poor', Object.assign({ rate: rd(plan.now.perHr) }, nx)) : t('plan_nodata');
    else msg = t('plan_nodata') + (nx ? ' → ' + nx.start + ':00–' + nx.end + ':00 · ' + nx.zone + ' · ' + nx.platform + ' (' + inr(nx.rate2) + '/h)' : '');
    const opts = [['', t('w_live')], [8, '08:00'], [13, '13:00'], [19, '19:00'], [22, '22:00']].map(([v, l]) => `<option value="${v}" ${String(S.simHour == null ? '' : S.simHour) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
    return `<section class="card o-now"><div class="rows between"><h3 class="h3">${t('plan_h')} · ${String(cur).padStart(2, '0')}:00</h3>
      <select id="sim" class="sel" aria-label="${t('plan_sim')}">${opts}</select></div>
      ${plan.state === 'nodata' ? '' : `<div style="margin-top:8px"><span class="state ${plan.state}"><i></i>${plan.state === 'good' ? t('oc_take') : t('oc_skip')}</span></div>`}
      <p style="margin-top:6px">${esc(msg)}</p><div class="tl">${cells}</div><div class="tlx">${hours.map(h => `<span>${h % 3 === 0 ? h : ''}</span>`).join('')}</div></section>`;
  }
  function planDayCard(rep) {
    const pl = T.planDay(rep, S.goal);
    let body;
    if (!pl.segments.length) body = `<p class="note">${esc(t('pd_none'))}</p>`;
    else body = `<ol class="pd" id="pd-lines">${pl.segments.map(g => `<li>${esc(t('pd_seg', { start: g.start, end: g.end, platform: g.platform, zone: g.zone, rate: inr(g.perHr) }))}</li>`).join('')}</ol>
      <p id="pd-total" style="margin-top:8px"><b>${esc(pl.reached ? t('pd_total', { x: inr(pl.expected), h: pl.hours }) : t('pd_short', { x: inr(pl.expected), h: pl.hours, goal: inr(S.goal) }))}</b></p>`;
    return `<section class="card o-plan"><div class="rows between" style="align-items:end"><h3 class="h3">${t('pd_h')}</h3>
      <div class="field" style="width:150px"><label for="pd-goal">${t('pd_goal')}</label><input id="pd-goal" type="number" inputmode="numeric" step="50" min="100" value="${S.goal}"></div></div>
      <div style="margin-top:10px">${body}</div>${pl.segments.length ? `<button class="btn sm alt" id="pd-spk" style="margin-top:10px">${ic('volume')}${t('speak')}</button>` : ''}</section>`;
  }
  function weekCardHTML(rep) {
    const c = T.weeklyCoach(rep); if (!c) return '';
    const dl = c.deltaPerHr;
    return `<section class="card o-week"><div class="rows between"><h3 class="h3">${t('wk_h')}</h3><button class="link" id="wk-more">${t('more_advice')}</button></div>
      <p style="margin-top:6px">${esc(t('wk_sum', { days: c.cur.days, cash: inr(c.cur.net), hr: inr(c.cur.perHr) }))}${dl !== null && Math.abs(dl) >= 1 ? ' ' + esc(t(dl > 0 ? 'wk_up' : 'wk_down', { d: inr(Math.abs(dl)) })) : ''}</p></section>`;
  }
  function goalCard(rep) {
    const plan = T.planNow(rep, 12), mw = rep.profile.minWage, good = plan.best.filter(b => b && b.perHr >= mw).map(b => b.perHr);
    const bestRate = good.length ? good.reduce((a, b) => a + b, 0) / good.length : 0;
    const h1 = rep.total.perHr > 0 ? S.goal / rep.total.perHr : 0, h2 = bestRate ? S.goal / bestRate : 0;
    return `<div class="card"><div class="rows between" style="align-items:end"><h3 class="h3">${t('goal_h')}</h3>
      <div class="field" style="width:140px"><label for="goal">₹ / ${t('days').replace(/s$/, '')}</label><input id="goal" type="number" inputmode="numeric" step="50" min="100" value="${S.goal}"></div></div>
      ${h1 && h2 ? `<p style="margin-top:8px">${esc(t('goal_text', { goal: S.goal.toLocaleString('en-IN'), h1: Math.round(h1 * 10) / 10, h2: Math.round(h2 * 10) / 10 }))}</p>` : ''}</div>`;
  }

  /* ---------- charts ---------- */
  function hourSVG(rep) {
    const mw = rep.profile.minWage, slots = rep.byHour.filter(h => h.hours >= 0.5);
    if (!slots.length) return '';
    const h0 = slots[0].hour, h1 = slots[slots.length - 1].hour, n = h1 - h0 + 1;
    const W = 520, H = 220, L = 6, B = 24, Tp = 26, bw = (W - L) / n;
    const maxV = Math.max(mw * 1.25, ...slots.map(s => s.perHr)), minV = Math.min(0, ...slots.map(s => s.perHr));
    const y = v => Tp + (maxV - v) / (maxV - minV) * (H - B - Tp);
    const lo = slots.reduce((a, b) => a.perHr < b.perHr ? a : b), hi = slots.reduce((a, b) => a.perHr > b.perHr ? a : b);
    let out = `<line x1="${L}" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--ink)" stroke-width="1"/>`;
    for (let h = h0; h <= h1; h++) {
      const s = rep.byHour[h], x = L + (h - h0) * bw + bw * .12, w = bw * .76;
      if (h % 2 === 0 || n < 10) out += `<text x="${x + w / 2}" y="${H - 7}" text-anchor="middle">${h}</text>`;
      if (s.hours < 0.5) { out += `<rect x="${x}" y="${y(0) - 2}" width="${w}" height="2" fill="var(--rule)"/>`; continue; }
      const col = s.perHr < mw * 0.6 ? 'var(--lost)' : s.perHr < mw ? '#C8912A' : 'var(--kept)';
      const ya = y(Math.max(0, s.perHr)), yb = y(Math.min(0, s.perHr));
      out += `<rect x="${x}" y="${ya}" width="${w}" height="${Math.max(2, yb - ya)}" rx="2" fill="${col}"><title>${h}:00 → ${inr(s.perHr)}/h (${s.n})</title></rect>`;
      if (s === lo || s === hi) out += `<text class="lab" x="${x + w / 2}" y="${ya - 6}" text-anchor="middle">${inr(s.perHr)}</text>`;
    }
    out += `<line x1="${L}" x2="${W}" y1="${y(mw)}" y2="${y(mw)}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".7"/><text class="lab" x="${L + 2}" y="${y(mw) - 5}">${t('minwage').split('(')[0].trim()} ${inr(mw)}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('when_h'))}">${out}</svg>`;
  }
  function heatColor(v, mw) {
    if (v >= mw) { const k = Math.min(1, (v - mw) / (mw * .8)); return `rgba(10,106,70,${(.14 + .4 * k).toFixed(2)})`; }
    const k = Math.min(1, (mw - v) / mw); return `rgba(181,55,26,${(.14 + .4 * k).toFixed(2)})`;
  }
  function heatmapHTML(cells, zones, mine, mw) {
    const dps = T.DAYPARTS;
    const head = `<tr><th></th>${dps.map(d => `<th>${esc(t('dp_' + d))}</th>`).join('')}</tr>`;
    const rows = zones.map(z => `<tr><td class="zn">${esc(z)}</td>${dps.map(d => {
      const c = cells.find(x => x.zone === z && x.daypart === d), m = mine && mine.find(x => x.zone === z && x.daypart === d && x.hours >= 1);
      if (!c) return '<td class="na">–</td>';
      if (c.hidden) return `<td class="na" title="${esc(t('city_hidden'))}">${ic('lock').replace('class="i"', 'class="i" style="width:14px;height:14px"')}</td>`;
      const v = c.real != null ? c.real : c.perHr;
      return `<td class="${m ? 'me' : ''}" style="background:${heatColor(v, mw)}">${inr(v)}<small>${m ? t('city_you') + ' ' + inr(m.perHr) : (c.n != null ? c.n + ' ' + t('city_riders') : rd(c.hours) + 'h')}</small></td>`;
    }).join('')}</tr>`).join('');
    return `<div class="scroll"><table class="hm">${head}${rows}</table></div>`;
  }
  function weekdayHeatHTML(rep) {
    const dps = T.DAYPARTS, order = [1, 2, 3, 4, 5, 6, 0], mw = rep.profile.minWage;
    const wdName = wd => new Date(Date.UTC(2024, 0, 7 + wd)).toLocaleDateString(LOC[S.lang], { weekday: 'short', timeZone: 'UTC' });   // 2024-01-07 was a Sunday
    const head = `<tr><th></th>${dps.map(d => `<th>${esc(t('dp_' + d))}</th>`).join('')}</tr>`;
    const rows = order.map(wd => `<tr><td class="zn">${esc(wdName(wd))}</td>${dps.map(d => {
      const c = rep.weekdayDaypart.find(x => x.wd === wd && x.daypart === d);
      if (!c || c.hours < 1.5) return '<td class="na">–</td>';
      return `<td style="background:${heatColor(c.perHr, mw)}">${inr(c.perHr)}<small>${c.days} ${t('hist_days').toLowerCase()}</small></td>`;
    }).join('')}</tr>`).join('');
    const b = rep.bestSlot;
    return `${b ? `<p class="best-slot">${esc(t('hw_best', { day: wdName(b.wd), part: t('dp_' + b.daypart), r: inr(b.perHr), n: b.days }))}</p>` : `<p class="note">${esc(t('hw_low'))}</p>`}<div class="scroll"><table class="hm">${head}${rows}</table></div>`;
  }
  function weekdaySVG(rep) {
    const order = [1, 2, 3, 4, 5, 6, 0], W = 520, H = 170, Tp = 24, B = 24, bw = W / 7, vals = order.map(w => rep.byWeekday[w]);
    const live = vals.filter(x => x.days); if (!live.length) return '';
    const maxV = Math.max(rep.profile.minWage * 1.2, ...live.map(x => x.perHr)), y = v => Tp + (maxV - Math.max(0, v)) / maxV * (H - B - Tp);
    const best = live.reduce((a, b) => a.perHr > b.perHr ? a : b);
    let out = '';
    vals.forEach((s, i) => {
      const x = i * bw + bw * .16, w = bw * .68, name = new Date(2024, 0, 7 + s.wd).toLocaleDateString(LOC[S.lang], { weekday: 'short' });
      out += `<text x="${x + w / 2}" y="${H - 7}" text-anchor="middle">${esc(name)}</text>`;
      if (!s.days) { out += `<rect x="${x}" y="${H - B - 2}" width="${w}" height="2" fill="var(--rule)"/>`; return; }
      out += `<rect x="${x}" y="${y(s.perHr)}" width="${w}" height="${Math.max(2, H - B - y(s.perHr))}" rx="2" fill="${s === best ? 'var(--kept)' : 'var(--ink3)'}"><title>${s.days} ${t('days')}</title></rect><text class="lab" x="${x + w / 2}" y="${y(s.perHr) - 6}" text-anchor="middle">${rd(s.perHr)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${out}</svg>`;
  }
  function trendSVG(rep) {
    const W = 520, H = 130, B = 18, n = rep.byDay.length, bw = W / n, maxD = Math.max(...rep.byDay.map(x => x.appShown), 1);
    let out = '';
    rep.byDay.forEach((x, i) => {
      const ha = x.appShown / maxD * (H - B - 4), hn = Math.max(0, x.net) / maxD * (H - B - 4), bx = i * bw + 1.5;
      out += `<rect x="${bx}" y="${H - B - ha}" width="${Math.max(1, bw - 3)}" height="${ha}" fill="var(--rule)"><title>${x.date}: ${t('shown')} ${inr(x.appShown)}</title></rect><rect x="${bx}" y="${H - B - hn}" width="${Math.max(1, bw - 3)}" height="${hn}" fill="var(--kept)"><title>${x.date}: ${t('real')} ${inr(x.net)}</title></rect>`;
    });
    out += `<text x="0" y="${H - 4}">${dLabel(rep.dates[0], { day: 'numeric', month: 'short' })}</text><text x="${W}" y="${H - 4}" text-anchor="end">${dLabel(rep.dates[rep.dates.length - 1], { day: 'numeric', month: 'short' })}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${out}</svg>`;
  }
  function stacked(segs) {
    const tot = segs.reduce((a, s) => a + s.v, 0) || 1;
    return `<div class="stk">${segs.map(s => `<i style="width:${(s.v / tot * 100).toFixed(2)}%;background:${s.c}" title="${esc(s.l)} ${inr(s.v)}"></i>`).join('')}</div>
      <div class="legend">${segs.map(s => `<span><i style="background:${s.c}"></i>${esc(s.l)} <b class="num">${inr(s.v)}</b> · ${rd(s.v / tot * 100)}%</span>`).join('')}</div>`;
  }

  /* ---------- INSIGHTS: four short panels ---------- */
  function renderInsights() {
    const v = $('#view-insights'), rep = S.report;
    if (!rep) return noData(v);
    const tt = rep.total, d = rep.daysWorked, dq = rep.dataQuality;
    v.innerHTML = `<h2 class="h2"><span class="hl num">${inr(tt.perHr)}</span> ${t('per_hr_real')}</h2>
      <p class="dq ${dq.level}">${t('dq_based', { days: dq.days, orders: dq.orders, hours: rd(dq.hours) })} · ${t('dq_' + dq.level)}</p>
      <div style="margin:16px 0 18px">${seg('iseg', [['coach', t('sg_coach')], ['advice', t('sg_advice')], ['when', t('sg_when')], ['costs', t('sg_costs')], ['wi', t('wi_tab')]], S.insSeg)}</div><div id="ibody"></div>`;
    $$('#iseg button', v).forEach(b => b.onclick = () => { S.insSeg = b.dataset.s; renderInsights(); });
    const body = $('#ibody', v);
    if (S.insSeg === 'coach') insCoach(body, rep);
    else if (S.insSeg === 'advice') insAdvice(body, rep);
    else if (S.insSeg === 'when') insWhen(body, rep);
    else if (S.insSeg === 'costs') insCosts(body, rep);
    else whatifBody(body);
  }
  function insCoach(b, rep) {
    const c = T.weeklyCoach(rep), wk = T.weeks(rep, 6);
    const lines = [];
    if (c) {
      lines.push({ tag: 'tg_more', sev: 'good', txt: t(c.win.key === 'up' ? 'wk_win_up' : 'wk_win_best', c.win.key === 'up' ? { d: inr(c.win.p.d) } : { date: dLabel(c.win.p.date, { weekday: 'short', day: 'numeric', month: 'short' }), cash: inr(c.win.p.net) }) });
      if (c.fix) lines.push({ tag: 'tg_alert', sev: 'bad', txt: c.fix.key === 'wait' ? t('wk_fix_wait', c.fix.p) : t('wk_fix_skip', { zone: c.fix.p.zone, daypart: t('dp_' + c.fix.p.daypart), rate: inr(c.fix.p.rate) }) });
    }
    const dl = c && c.deltaPerHr;
    b.innerHTML = c ? `<section class="card"><div class="eyebrow">${esc(t('week_of', { from: dLabel(c.cur.from, { day: 'numeric', month: 'short' }) }))}</div>
        <div class="stats" style="margin-top:6px"><div><div class="k">${t('c_cash')}</div><div class="v num">${inr(c.cur.net)}</div><div class="s">${c.prev ? (c.deltaNet >= 0 ? '+' : '−') + inr(Math.abs(c.deltaNet)).replace('−', '') + ' ' + t('wk_vs') : ''}</div></div>
          <div><div class="k">${t('per_hr_real')}</div><div class="v num ${dl !== null && dl < 0 ? 'bad' : 'good'}">${inr(c.cur.perHr)}</div><div class="s">${dl !== null && Math.abs(dl) >= 1 ? esc(t(dl > 0 ? 'wk_up' : 'wk_down', { d: inr(Math.abs(dl)) })) : ''}</div></div>
          <div><div class="k">${t('hrs_online')}</div><div class="v num">${rd(c.cur.hours)}</div><div class="s">${c.cur.days} ${t('days')}</div></div></div>
        ${lines.map((l, i) => `<div class="adv"><div><span class="tag ${l.sev}">${t(l.tag)}</span><p>${esc(l.txt)}</p></div><button class="ibtn" data-cspk="${i}" aria-label="${t('speak')}">${ic('volume')}</button></div>`).join('')}</section>`
      : `<p class="dq low">${esc(t('wk_none'))}</p>`;
    $$('[data-cspk]', b).forEach(x => x.onclick = () => speak([lines[+x.dataset.cspk].txt]));
    if (wk.length) b.insertAdjacentHTML('beforeend', `<section class="card" style="margin-top:20px"><h3 class="h3" style="margin-bottom:6px">${t('sg_weeks')}</h3><table class="cmpt"><thead><tr><th>${t('week_of', { from: '' }).trim()}</th><th>${t('days')}</th><th>${t('c_cash')}</th><th>${t('per_hr_real')}</th></tr></thead><tbody>
      ${wk.map(w => `<tr><td>${dLabel(w.from, { day: 'numeric', month: 'short' })}</td><td class="num">${w.days}</td><td class="num"><b>${inr(w.net)}</b></td><td class="num">${inr(w.perHr)}</td></tr>`).join('')}</tbody></table></section>`);
  }
  function insAdvice(b, rep) {
    const advice = allInsights(rep).map(i => ({ i, txt: adviceText(i) }));
    b.innerHTML = `<div class="rows between"><span class="note">${advice.length}</span><button class="btn sm alt" id="spk-all">${ic('volume')}${t('speak')}</button></div><div class="card" style="margin-top:8px">${adviceRows(advice)}</div>`;
    $('#spk-all', b).onclick = () => speak(advice.map(a => a.txt)); bindSpeak(b, advice);
  }
  function insWhen(b, rep) {
    if (rep.dataQuality.level === 'low') { b.innerHTML = `<p class="dq low">${t('a_lowdata', { days: rep.dataQuality.days, orders: rep.dataQuality.orders })}</p>`; return; }
    const zones = rep.byZone.map(z => z.key), maxP = Math.max(...rep.byPlatform.map(p => Math.max(p.appPerHr, p.perHr)), 1);
    b.innerHTML = `<section class="card" style="margin-bottom:20px"><h3 class="h3">${t('hw_h')}</h3>${weekdayHeatHTML(rep)}</section><div class="cols two">
        <section class="card"><h3 class="h3">${t('when_h')}</h3>${hourSVG(rep)}<div class="legend"><span><i style="background:var(--lost)"></i>&lt; 60%</span><span><i style="background:#C8912A"></i>&lt; ${t('minwage').split('(')[0].trim()}</span><span><i style="background:var(--kept)"></i>≥</span></div></section>
        <section class="card"><h3 class="h3">${t('per_hr_real')}</h3>${weekdaySVG(rep)}</section></div>
      <section class="card sec" style="margin-top:20px"><h3 class="h3">${t('where_h')}</h3>${heatmapHTML(rep.zoneDaypart, zones, null, rep.profile.minWage)}</section>
      <div class="cols two" style="margin-top:20px">
        <section class="card"><h3 class="h3">${t('platform_h')}</h3>${rep.byPlatform.map(p => `<div class="cmp"><b>${esc(p.key)}</b><div>
          <div class="tr"><i class="a" style="width:${Math.max(2, p.appPerHr / maxP * 100)}%"></i></div><small>${t('shown')} ${inr(p.appPerHr)}/h</small>
          <div class="tr"><i class="r ${p.perHr < 0 ? 'neg' : ''}" style="width:${Math.max(2, Math.max(0, p.perHr) / maxP * 100)}%"></i></div><small><b>${t('real')} ${inr(p.perHr)}/h</b> · ${p.n} ${t('orders_n')}</small></div></div>`).join('')}</section>
        <section class="card"><h3 class="h3">${t('trend_h')}</h3>${trendSVG(rep)}<div class="legend"><span><i style="background:var(--rule)"></i>${t('shown')}</span><span><i style="background:var(--kept)"></i>${t('real')}</span></div></section></div>`;
  }
  function insCosts(b, rep) {
    const tt = rep.total, d = rep.daysWorked;
    b.innerHTML = `<div class="cols two">
        <section class="card"><h3 class="h3">${t('cost_h')} · ${inr(tt.cost / d)} / ${t('per_wd')}</h3>
          ${stacked([{ l: t('c_fuel'), v: tt.fuel, c: '#B5371A' }, { l: t('c_maint'), v: tt.maint, c: '#C8912A' }, { l: t('c_data'), v: tt.data, c: '#8A8376' }, { l: t('c_fixed'), v: tt.fixed, c: '#4B463C' }].filter(x => x.v > 0))}
          <p class="note" style="margin-top:8px">${inr(tt.cost / tt.totalKm)} / km · ${t('km_paid')} ${rd(tt.km)} · ${t('km_unpaid')} ${rd(tt.deadKmAbs)} (${inr(tt.deadCost)})</p></section>
        <section class="card"><h3 class="h3">${t('time_h')}</h3>
          ${stacked([{ l: t('time_ride'), v: tt.dur / 60, c: 'var(--kept)' }, { l: t('time_wait'), v: tt.wait / 60, c: 'var(--lost)' }])}
          <p class="note" style="margin-top:8px">${t('hours')}: ${t('time_ride')} ${rd(tt.dur / 60)} · ${t('time_wait')} ${rd(tt.wait / 60)}</p></section></div>
      <section class="card" style="margin-top:20px"><h3 class="h3">${t('km_unpaid')}: ${rd(tt.deadKmAbs)} km \u00B7 ${inr(tt.deadCost)}</h3><p class="note" style="margin-top:6px">${S.meas && S.meas.reliable ? `<span class="pill">${t('sh_badge')}</span> ${esc(t('sh_measured', { f: S.meas.factor.toFixed(2), n: S.meas.pairs }))}` : esc(t('sh_assumed', { f: S.profile.deadKm }))}</p></section>
      <section class="card" style="margin-top:20px"><h3 class="h3" style="margin-bottom:12px">${t('costs_h')}</h3><div class="grid2" id="costs2">${costsHTML()}</div>
        <p class="note" style="margin-top:12px">Break-even per km: ${inr(rep.breakEvenPerKm)} (fuel + repairs, including unpaid riding). ${rd(rep.belowBEPct)}% of your orders paid less.</p></section>`;
    const c2 = $('#costs2', b); bindCosts(c2);
    $$('[data-cost]', c2).forEach(i => i.addEventListener('change', () => { if (i.dataset.cost !== 'vehicle') renderInsights(); else renderInsights(); }));
  }

  /* what-if */
  function whatifBody(v) {
    const rep = S.report;
    if (rep.dataQuality.level === 'low') { v.innerHTML = `<p class="dq low">${t('a_lowdata', { days: rep.dataQuality.days, orders: rep.dataQuality.orders })}</p>`; return; }
    const ws = T.simWindows(rep), top = ws.slice(0, 6), mw = rep.profile.minWage, base = T.simulate(rep, {});
    const wname = w => `${esc(w.platform)} · ${esc(w.zone)} · ${esc(t('dp_' + w.daypart))}`;
    v.innerHTML = `<p class="muted" style="margin-bottom:16px;max-width:62ch">${t('wi_sub')}</p>
      <div id="goalbox" style="margin-bottom:16px">${goalCard(rep)}</div>
      <div class="cols two"><div class="card" id="wi-ctl">
        ${top.map((w, i) => `<div class="sl"><label for="wh${i}"><span>${wname(w)}</span><b class="num" id="whv${i}"></b></label><input type="range" id="wh${i}" min="0" max="10" step="0.5" value="${Math.round(Math.min(10, w.hoursPerDay) * 2) / 2}" data-k="${esc(w.key)}"><small class="note">${t('wi_cur')}: ${Math.round(w.hoursPerDay * 10) / 10} ${t('hours')} · ${inr(w.opPerHr)}/h</small></div>`).join('')}
        ${ws.length > 6 ? `<p class="note">${t('wi_other')}: ${ws.length - 6}</p>` : ''}
        <div class="sl"><label for="wd"><span>${t('wi_days')}</span><b class="num" id="wdv"></b></label><input type="range" id="wd" min="1" max="7" step="0.5" value="${Math.round(base.daysPerWeek * 2) / 2}"></div>
        <div class="sl"><label for="wf"><span>${t('wi_fuel')}</span><b class="num" id="wfv"></b></label><input type="range" id="wf" min="-20" max="50" step="5" value="${S.wi.fuel || 0}"></div>
        <div class="rows"><button class="btn sm alt" id="wi-drop">${t('wi_drop')}</button><button class="btn sm alt" id="wi-reset">${t('wi_reset')}</button></div></div>
        <div class="card"><div id="wi-out"></div><p class="note" style="margin-top:12px">${t('wi_caveat')}</p></div></div>`;
    const weak = ws.filter(w => w.days >= 3 && w.opPerHr < mw * 0.6), baseDays = base.daysPerWeek;
    const g = $('#goal', v); if (g) g.onchange = () => { S.goal = Math.max(100, parseFloat(g.value) || 800); save(); $('#goalbox', v).innerHTML = goalCard(rep); $('#goal', v).onchange = g.onchange; };
    const draw = () => {
      const plan = { hours: S.wi.hours, daysPerWeek: S.wi.days != null ? S.wi.days : undefined, fuelPct: S.wi.fuel || 0 };
      top.forEach((w, i) => { const h = S.wi.hours[w.key] != null ? S.wi.hours[w.key] : w.hoursPerDay; $('#whv' + i, v).textContent = (Math.round(h * 10) / 10) + ' ' + t('hours'); });
      $('#wdv', v).textContent = (Math.round((S.wi.days != null ? S.wi.days : baseDays) * 10) / 10); $('#wfv', v).textContent = ((S.wi.fuel || 0) > 0 ? '+' : '') + (S.wi.fuel || 0) + '%';
      const p = T.simulate(rep, plan);
      const row = (label, a, b, f, goodUp) => { const dl = b - a, cl = Math.abs(dl) < 0.5 ? '' : (dl > 0) === goodUp ? 'up' : 'dn'; return `<tr><td>${label}</td><td class="num">${f(a)}</td><td class="num"><b>${f(b)}</b></td><td class="num ${cl}">${Math.abs(dl) < 0.05 ? '–' : (dl > 0 ? '+' : '−') + f(Math.abs(dl))}</td></tr>`; };
      const h1 = n => (Math.round(n * 10) / 10) + ' h', d1 = n => (Math.round(n * 10) / 10) + '';
      $('#wi-out', v).innerHTML = `<table class="cmpt"><thead><tr><th></th><th>${t('wi_cur')}</th><th>${t('wi_proj')}</th><th>Δ</th></tr></thead><tbody>
        ${row(t('wi_cash'), base.cashMonth, p.cashMonth, inr, true)}${row(t('wi_hr'), base.perHr, p.perHr, inr, true)}${row(t('wi_hpd'), base.hoursPerDay, p.hoursPerDay, h1, false)}${row(t('wi_days'), base.daysPerWeek, p.daysPerWeek, d1, false)}</tbody></table>
        ${p.hoursPerDay > 13 ? `<p class="dq low" style="margin-top:10px">${p.hoursPerDay.toFixed(1)} h/day</p>` : ''}`;
    };
    $$('#wi-ctl input[data-k]', v).forEach(inp => inp.oninput = () => { S.wi.hours[inp.dataset.k] = +inp.value; draw(); });
    $('#wd', v).oninput = e => { S.wi.days = +e.target.value; draw(); };
    $('#wf', v).oninput = e => { S.wi.fuel = +e.target.value; draw(); };
    $('#wi-reset', v).onclick = () => { resetWi(); renderInsights(); };
    $('#wi-drop', v).onclick = () => { weak.forEach(w => { S.wi.hours[w.key] = 0; }); renderInsights(); };
    $('#wi-drop', v).disabled = !weak.length;
    top.forEach((w, i) => { if (S.wi.hours[w.key] != null) $('#wh' + i, v).value = S.wi.hours[w.key]; });
    if (S.wi.days != null) $('#wd', v).value = S.wi.days;
    draw();
  }

  /* ---------- CHECK AN ORDER ---------- */
  function renderCheck() {
    const v = $('#view-check'), rep = S.report;
    if (!S.oc) S.oc = rep ? { pay: rd(rep.total.appShown / rep.total.n), km: Math.round(rep.total.km / rep.total.n * 10) / 10 } : { pay: 45, km: 3 };
    const presets = [[30, 4], [45, 3], [60, 2], [80, 6]];
    v.innerHTML = `<h2 class="h2">${t('oc_h')}</h2><p class="muted" style="margin:6px 0 20px;max-width:60ch">${t('oc_sub')}</p>
      <div class="scanbox"><button class="btn lg alt" id="oc-scan">${ic('image')}${t('oc_scan')}</button><small class="note">${t('oc_scan_hint')}</small></div>
      <div class="oc"><div>
        <label class="fl" for="oc-pay">${t('oc_pay')}</label><div class="bigfield"><span>₹</span><input id="oc-pay" type="number" inputmode="decimal" min="0" value="${S.oc.pay}"></div>
        <label class="fl" for="oc-km">${t('oc_km')}</label><div class="bigfield"><input id="oc-km" type="number" inputmode="decimal" step="0.1" min="0" value="${S.oc.km}"><span style="font-size:20px">km</span></div>
        <input type="range" id="oc-r" min="0.5" max="15" step="0.1" value="${Math.min(15, S.oc.km)}" aria-label="${t('oc_km')}">
        <div class="chips">${presets.map(([p, k]) => `<button data-p="${p}" data-k="${k}">₹${p} · ${k} km</button>`).join('')}</div>
        ${rep ? '' : `<p class="note" style="margin-top:8px">${t('empty_p')}</p>`}</div><div id="oc-out"></div></div>`;
    $('#oc-scan', v).onclick = () => {      // screenshot of a new order offer -> amount and distance -> verdict
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0]; if (!f) return; toast(t('oc_scanning'));
        try {
          const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
          const out = await R.readDataUrls([url], () => {}, false);
          const o = out.offers && out.offers[0];
          if (o) { S.oc = { pay: o.pay, km: o.km }; renderCheck(); toast(t('offer_found')); } else toast(t('oc_scan_none'));
        } catch (e) { toast(t('oc_scan_none')); }
      };
      inp.click();
    };
    const pay = $('#oc-pay', v), km = $('#oc-km', v), rg = $('#oc-r', v);
    const upd = () => { S.oc = { pay: Math.max(0, parseFloat(pay.value) || 0), km: Math.max(0, parseFloat(km.value) || 0) }; if (S.oc.km <= 15) rg.value = S.oc.km; drawCheck(); };
    pay.oninput = upd; km.oninput = upd; rg.oninput = () => { km.value = rg.value; upd(); };
    $$('[data-p]', v).forEach(b => b.onclick = () => { pay.value = b.dataset.p; km.value = b.dataset.k; upd(); });
    drawCheck();
  }
  function drawCheck() {
    const rep = S.report, mw = S.profile.minWage, out = $('#oc-out');
    if (!out) return;
    if (!(S.oc.km > 0)) { out.innerHTML = ''; return; }
    const r = T.orderCheck(rep ? rep.profile : S.profile, { pay: S.oc.pay, km: S.oc.km, avgWait: rep ? rep.avgWaitPerOrder : 6, fixedPerHour: rep && rep.total.hours > 0 ? rep.total.fixed / rep.total.hours : undefined });
    const msg = r.verdict === 'take' ? t('oc_msg_take', { net: inr(r.net), min: rd(r.effMin), hr: inr(r.perHr) }) : t('oc_msg_skip', { net: inr(r.net), hr: inr(r.perHr) });
    const pos = Math.max(2, Math.min(98, r.perHr / (mw * 2) * 100));
    out.innerHTML = `<div class="verdict ${r.verdict}" role="status" aria-live="polite">
      <div class="word">${t('oc_' + r.verdict)}</div><p class="msg">${esc(msg)}${r.verdict !== 'take' ? ' ' + esc(t('oc_need', { mw, need: rd(r.need) })) : ''}</p>
      <div class="meter"><span class="pin" style="left:${pos}%" data-v="${inr(r.perHr)}/h"></span></div>
      <div class="meter-l"><span>₹0</span><span>${t('minwage').split('(')[0].trim()} ${inr(mw)}</span><span>${inr(mw * 2)}+</span></div>
      <div class="ledger" style="margin-top:20px">
        <div class="lg start"><div class="lg-t"><span>${t('oc_pay').replace(/\s*\(.*$/, '')}</span><span class="v">${inr(r.pay)}</span></div></div>
        <div class="lg cost"><div class="lg-t"><span>${t('g_vehicle')} (${r.km} km)</span><span class="v">−${inr(r.vehicleCost)}</span></div></div>
        <div class="lg cost"><div class="lg-t"><span>${t('c_data')} + ${t('c_fixed')} (${rd(r.effMin)} min)</span><span class="v">−${inr(r.timeCost)}</span></div></div>
        <div class="lg"><div class="lg-t"><b>${t('c_net')}</b><b class="v">${inr(r.net)}</b></div></div></div>
      <p class="note" style="margin-top:10px">${inr(r.perKm)}/km · ${t('w_be')} ${inr(r.breakEvenPerKm)}/km</p></div>`;
  }

  /* ---------- CITY ---------- */
  function youVsCity(rep, c) {
    if (!rep) return '';
    const gaps = rep.zoneDaypart.filter(z => z.days >= 3 && z.hours >= 4).map(z => {
      const cc = c.cells.find(x => x.zone === z.zone && x.daypart === z.daypart && !x.hidden);
      return cc ? { z, cc, diff: z.perHr - cc.real } : null;
    }).filter(Boolean).sort((a, b) => a.diff - b.diff);
    if (!gaps.length) return '';
    const w = gaps[0], b = gaps[gaps.length - 1];
    const line = (g, good) => `<div class="adv"><div><span class="tag ${good ? 'good' : 'bad'}">${good ? t('tg_more') : t('tg_alert')}</span><p><b>${esc(g.z.zone)} · ${esc(t('dp_' + g.z.daypart))}</b>: ${t('city_you')} <b>${inr(g.z.perHr)}/h</b> vs ${t('n_city')} <b>${inr(g.cc.real)}/h</b> (${g.cc.n} ${t('city_riders')}, ${t('w_sim')})</p></div><span></span></div>`;
    return `<div class="card" style="margin-bottom:20px">${w.diff < -10 ? line(w, false) : ''}${b.diff > 10 && b !== w ? line(b, true) : ''}</div>`;
  }
  function fairBlock(rep) {
    if (!rep) return `<p class="note">${t('empty_p')}</p>`;
    const target = S.fairTarget || rep.profile.minWage, f = T.fairFloor(rep, target), mx = Math.max(f.floor, f.actual);
    return `<div class="field" style="max-width:300px"><label for="fair-t">${t('minwage')}: <b>${inr(target)}</b></label><input id="fair-t" type="range" min="50" max="200" step="5" value="${target}"></div>
      <p style="margin:12px 0">${esc(t('fair_p', { cost: rd(f.opCostPerOrder), mw: target, floor: rd(f.floor), actual: rd(f.actual) }))}</p>
      <div class="cmp"><b>${t('shown')}</b><div><div class="tr"><i class="a" style="width:${f.actual / mx * 100}%"></i></div><small>${inr(f.actual)} ${t('per_order')} · ${inr(f.perKmActual)}/km</small></div>
      <b>${t('fair_floor')}</b><div><div class="tr"><i class="r" style="width:${f.floor / mx * 100}%"></i></div><small><b>${inr(f.floor)} ${t('per_order')} · ${inr(f.perKmFloor)}/km</b></small></div></div>`;
  }
  function todChart(c) {
    const vis = c.cells.filter(x => !x.hidden), W = 520, H = 160, bw = W / 5, B = 22, Tp = 20;
    const vals = T.DAYPARTS.map(d => { const l = vis.filter(x => x.daypart === d), n = l.reduce((a, x) => a + x.n, 0); return { d, v: n ? l.reduce((a, x) => a + x.real * x.n, 0) / n : 0 }; });
    const mw = S.profile.minWage, mx = Math.max(...vals.map(x => x.v), mw * 1.2), y = v => Tp + (mx - v) / mx * (H - B - Tp);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}">${vals.map((x, i) => `<rect x="${i * bw + bw * .18}" y="${y(x.v)}" width="${bw * .64}" height="${H - B - y(x.v)}" rx="2" fill="${x.v >= mw ? 'var(--kept)' : 'var(--ink3)'}"/><text class="lab" x="${i * bw + bw / 2}" y="${y(x.v) - 6}" text-anchor="middle">${rd(x.v)}</text><text x="${i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(t('dp_' + x.d))}</text>`).join('')}
      <line x1="0" x2="${W}" y1="${y(mw)}" y2="${y(mw)}" stroke="var(--ink)" stroke-dasharray="4 4" opacity=".6"/></svg>`;
  }
  async function fetchLive() { try { const r = await fetch('api/city', { cache: 'no-store' }); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } }

  function renderCity() {
    const v = $('#view-city');
    const rep = S.report, c = cityFor(S.city), zones = c.zones, mine = rep ? rep.zoneDaypart : null;
    const maxP = Math.max(...c.platforms.map(p => p.claimed)), gap = rd((1 - c.medianReal / c.medianClaimed) * 100);
    const panel = {
      map: () => `${youVsCity(rep, c)}<section class="card"><h3 class="h3">${t('where_h')}</h3>${heatmapHTML(c.cells, zones, mine, S.profile.minWage)}<p class="note" style="margin-top:8px">${t('city_hidden')}${rep ? ' · ' + t('city_you') + ': ' + t('w_outlined') : ''}</p></section>
        <section class="card" style="margin-top:20px"><h3 class="h3">${t('city_tod')}</h3>${todChart(c)}</section>`,
      fair: () => `<div class="cols two"><section class="card"><h3 class="h3" style="margin-bottom:12px">${t('fair_h')}</h3>${fairBlock(rep)}</section>
        <section class="card"><h3 class="h3">${t('city_platform_h')}</h3>${c.platforms.slice().sort((a, b) => b.real - a.real).map(p => `<div class="cmp"><b>${esc(p.platform)}</b><div>
          <div class="tr"><i class="a" style="width:${p.claimed / maxP * 100}%"></i></div><small>${t('shown')} ${inr(p.claimed)}/h</small>
          <div class="tr"><i class="r" style="width:${p.real / maxP * 100}%"></i></div><small><b>${t('real')} ${inr(p.real)}/h</b> · ${p.n} ${t('city_riders')}</small></div></div>`).join('')}</section></div>`,
      share: () => `<div class="priv"><h3 class="h3" style="margin-bottom:6px">${t('city_priv_h')}</h3><p style="margin-bottom:10px">${t('city_priv')}</p>
          <p class="note" id="live-n" style="margin-bottom:12px"></p>
          <div class="rows"><button class="btn" id="share-city">${S.shared ? t('city_shared') : t('city_share')}</button><button class="btn alt" id="csv">${ic('download')}${t('city_union')}</button></div></div>`
    };
    v.innerHTML = `
      <div class="rows between"><h2 class="h2">${t('city_h')}</h2><span class="sim">${t('city_sim')}</span></div>
      <div style="margin-top:12px" aria-label="${t('city_pick')}">${seg('cityseg', [['Hyderabad', 'Hyderabad'], ['Bengaluru', 'Bengaluru']], S.city)}</div>
      <div class="stats">
        <div><div class="k">${t('city_claim')}</div><div class="v num">${inr(c.medianClaimed)}</div><div class="s">/h</div></div>
        <div><div class="k">${t('city_med')}</div><div class="v num good">${inr(c.medianReal)}</div><div class="s">−${gap}%</div></div>
        <div><div class="k">${t('city_below')}</div><div class="v num bad">${c.belowMinWagePct}%</div><div class="s">₹${S.profile.minWage}/h</div></div>
        <div><div class="k">${t('city_riders')}</div><div class="v num">${c.riders.toLocaleString('en-IN')}</div><div class="s">k ≥ ${c.k}</div></div></div>
      <div style="margin:18px 0">${seg('cseg', [['map', t('sg_map')], ['fair', t('fair_floor')], ['share', t('sg_share')]], S.citySeg)}</div>
      <div id="cbody">${panel[S.citySeg]()}</div>`;
    $$('#cseg button', v).forEach(b => b.onclick = () => { S.citySeg = b.dataset.s; renderCity(); });
    $$('#cityseg button', v).forEach(b => b.onclick = () => { S.city = b.dataset.s; save(); renderCity(); });
    const ft = $('#fair-t', v); if (ft) ft.oninput = () => { S.fairTarget = +ft.value; renderCity(); };
    const sb = $('#share-city', v);
    if (sb) {
      const setLive = j => { const el = $('#live-n', v); if (!el) return; if (S.demo) { el.textContent = t('share_demo'); sb.disabled = true; return; } if (j) { el.textContent = t('live_label') + ': ' + t('live_n', { n: j.contributors, k: j.k }); sb.disabled = !rep || S.shared; } else { el.textContent = t('share_fail'); sb.disabled = true; } };
      sb.disabled = true; fetchLive().then(setLive);
      sb.onclick = async () => {
        const cells = rep.combos.filter(x => x.hours >= 1).map(x => ({ platform: x.platform, zone: x.zone, daypart: x.daypart, perHr: Math.round(x.perHr * 10) / 10, hours: Math.round(x.hours * 10) / 10 }));
        try {
          const r = await fetch('api/contribute', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TW': '1' }, body: JSON.stringify({ rid: anonId(), cells, demo: !!S.demo }) });
          if (!r.ok) throw new Error((await r.json()).error || r.status);
          S.shared = true; save(); toast(t('city_shared')); fetchLive().then(setLive); sb.textContent = t('city_shared'); sb.disabled = true;
        } catch (e) { toast(t('share_fail') + ' (' + e.message + ')'); }
      };
      $('#csv', v).onclick = () => {
        const rows = ['zone,time_of_day,riders,median_real_rupees_per_hour,median_app_implied_rupees_per_hour,data_source'].concat(c.cells.filter(x => !x.hidden).map(x => [x.zone, x.daypart, x.n, x.real, x.claimed, 'SIMULATED'].join(',')));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = 'truewage-' + c.city.toLowerCase() + '-report-SIMULATED.csv'; a.click();
      };
    }
  }

  /* ---------- PROOF ---------- */
  const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const evidenceTable = () => `<table class="evid"><tr><td>${t('ev_self')}</td><td class="ok">${t('ev_yes')}</td></tr><tr><td>${t('ev_hash')}</td><td class="ok">${t('ev_yes')}</td></tr><tr><td>${t('ev_platform')}</td><td class="no">${t('ev_no')}</td></tr><tr><td>${t('ev_bank')}</td><td class="no">${t('ev_no')}</td></tr></table>`;

  async function renderProof() {
    const v = $('#view-proof'), rep = S.report;
    if (location.hash.startsWith('#verify=')) return renderVerify(v);
    if (!rep) return noData(v);
    v.innerHTML = `<div class="noprint"><h2 class="h2">${t('loan_h')}</h2><p class="muted" style="margin:6px 0 18px;max-width:60ch">${t('loan_p')}</p>
      <div class="rows" style="align-items:end"><div class="field"><label for="r-name">${t('loan_name')}</label><input id="r-name" maxlength="60" value="${esc(S.rider.name)}"></div>
      <div class="field"><label for="r-ph">${t('loan_phone')}</label><input id="r-ph" maxlength="4" inputmode="numeric" value="${esc(S.rider.phone4)}"></div>
      <button class="btn" id="mk">${t('loan_make')}</button></div></div><div id="paper"></div>`;
    $('#mk').onclick = () => { S.rider = { name: $('#r-name').value.trim() || 'Rider', phone4: $('#r-ph').value.replace(/\D/g, '').slice(0, 4) }; save(); buildStatement(); };
    if (S.rider.name) buildStatement();
  }

  async function buildStatement() {
    const rep = S.report, st = T.statementData(rep, { name: S.rider.name, phone: S.rider.phone4 ? 'XXXXXX' + S.rider.phone4 : '' });
    const evRoot = S.hashes.length ? await R.sha256Text(S.hashes.slice().sort().join('')) : null;
    st.evidence = { count: S.hashes.length, root: evRoot ? evRoot.slice(0, 16) : null, demo: !!S.demo };
    const hash = await R.sha256Text(JSON.stringify(st)), id = 'TW-' + hash.slice(0, 12).toUpperCase();
    let registered = false;
    try { const r = await fetch('api/statement', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TW': '1' }, body: JSON.stringify({ id, hash, data: st }) }); registered = r.ok; } catch (e) { /* static hosting */ }
    const base = location.href.split('#')[0], longUrl = base + '#verify=' + b64u(JSON.stringify({ d: st, h: hash })), url = registered ? base + '#verify=' + id : longUrl;
    const tt = st.totals, f = n => inr(n);
    $('#paper').innerHTML = `<div class="paper">
      <div class="rows between" style="align-items:start"><div><h2>Income Statement</h2><small style="color:#555">Self-reported platform earnings · tamper-evident${st.evidence.demo ? ' · DEMO DATA' : ''}</small></div><div style="text-align:right"><b>${esc(id)}</b><br><small>${new Date().toISOString().slice(0, 10)}</small></div></div>
      <p style="margin-top:14px"><b>${esc(st.rider.name)}</b> ${st.rider.phone ? '· ' + esc(st.rider.phone) : ''}<br><span style="color:#555">Platforms: ${st.platforms.map(esc).join(', ')} · ${st.period.from} to ${st.period.to} · ${st.period.daysWorked} days worked</span></p>
      ${st.period.short ? `<p class="note" style="color:#8A5700"><b>${t('short_period')}</b></p>` : ''}
      <div class="sg"><div><small>${t('loan_monthly')}</small><b>${f(st.monthly.beforeEmi)}</b></div><div><small>${t('c_cash')} / month</small><b>${f(st.monthly.net)}</b></div>
        <div><small>${t('loan_emi')}</small><b>${f(st.emiCapacity)}</b></div><div><small>${t('loan_stab')}</small><b>${st.stability}%</b></div></div>
      <table><tr><td>${t('c_app')}</td><td>${f(tt.appShown)}</td></tr><tr><td>− ${t('c_ded')}</td><td>${f(tt.deductions)}</td></tr><tr><td>− ${t('c_fuel')}</td><td>${f(tt.fuel)}</td></tr>
        <tr><td>− ${t('c_maint')}</td><td>${f(tt.maint)}</td></tr><tr><td>− ${t('c_data')}</td><td>${f(tt.data)}</td></tr>
        <tr><td><b>= ${t('c_op')}</b></td><td><b>${f(tt.operatingProfit)}</b></td></tr><tr><td>− ${t('c_fixed')}</td><td>${f(tt.fixed)}</td></tr>
        <tr><td><b>= ${t('c_cash')} (${rd(tt.hours)} h online, ${tt.orders} orders)</b></td><td><b>${f(tt.net)}</b></td></tr></table>
      <div style="color:#555;font-weight:600;margin-top:16px">${t('ev_h')}</div>${evidenceTable()}
      <div class="stamp"><div id="qr"></div><div><div>Verification code <code>${esc(id)}</code></div><small style="color:#555">Scan or open the link to confirm the numbers are untouched.<br>Evidence: ${st.evidence.count} screenshot hashes${st.evidence.root ? ' (root ' + st.evidence.root + ')' : ''}</small></div></div>
      <p class="note" style="color:#666;margin-top:12px">${t('pdf_disclaimer')}</p></div>
      <div class="center noprint rows" style="justify-content:center"><button class="btn" id="print">${ic('print')}${t('loan_print')}</button> <button class="btn alt" id="copy">${ic('link')}Copy verify link</button></div>`;
    $('#print').onclick = () => window.print();
    $('#copy').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(url).then(() => toast('Link copied')); };
    const qr = $('#qr');
    if (window.QRCode) { try { if (url.length > 1800) throw new Error('too long for QR'); qr.textContent = ''; new QRCode(qr, { text: url, width: 112, height: 112 }); } catch (e) { qr.textContent = id; } } else qr.textContent = id;
  }

  async function renderVerify(v) {
    let ok = false, d = null, hash = '', reg = null;
    try {
      const param = location.hash.slice(8);
      if (/^TW-[0-9A-F]{12}$/.test(param)) {
        const rj = await fetch('api/statement/' + param).then(r => r.ok ? r.json() : null);
        if (rj && rj.data) { d = rj.data; hash = rj.hash; reg = 'match'; ok = (await R.sha256Text(JSON.stringify(d))) === hash && ('TW-' + hash.slice(0, 12).toUpperCase()) === param; }
      } else {
        const j = JSON.parse(unb64u(param)); d = j.d; hash = j.h;
        ok = (await R.sha256Text(JSON.stringify(d))) === hash;
        try { const r = await fetch('api/statement/TW-' + hash.slice(0, 12).toUpperCase()); if (r.ok) { const rj = await r.json(); reg = rj.hash === hash ? 'match' : 'mismatch'; } } catch (e) { /* offline */ }
      }
    } catch (e) { ok = false; }
    const good = ok && reg !== 'mismatch';
    v.innerHTML = `<div class="paper"><h2 class="${good ? 'ok' : 'no'}">${good ? '✔ ' + t('loan_verified') : '✖ ' + t('loan_failed')}</h2>
      ${d && ok ? `<p style="margin-top:12px"><b>${esc(d.rider.name || '')}</b> · ${d.period.from} → ${d.period.to}<br>${t('loan_monthly')}: <b>${inr(d.monthly.beforeEmi != null ? d.monthly.beforeEmi : d.monthly.net)}</b> · ${t('loan_emi')}: <b>${inr(d.emiCapacity)}</b> · ${t('loan_stab')}: ${d.stability}%</p>
        <div style="color:#555;font-weight:600;margin-top:14px">${t('ev_h')}</div>${evidenceTable()}${d.evidence && d.evidence.demo ? '<p class="note"><b>DEMO DATA</b></p>' : ''}` : ''}
      <p class="note" style="margin-top:12px">Integrity check: ${ok ? '<span class="ok">numbers match code TW-' + hash.slice(0, 12).toUpperCase() + '</span>' : '<span class="no">tampered or corrupted</span>'}<br>
      Registry check: ${reg === 'match' ? '<span class="ok">registered, hash matches</span>' : reg === 'mismatch' ? '<span class="no">registry hash differs</span>' : 'not reachable (static hosting). Run the server for registry checks.'}</p>
      <p class="note">${t('pdf_disclaimer')}</p><button class="btn alt noprint" style="margin-top:12px" id="vback">${t('back')}</button></div>`;
    $('#vback').onclick = () => { history.replaceState(null, '', location.pathname); rerender(); };
  }

  /* ---------- share card ---------- */
  async function shareReceipt(r, label) {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#F7F5EF'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#17150F'; g.font = '700 54px Georgia, serif'; g.fillText('TrueWage', 70, 110);
    g.font = '500 30px system-ui, sans-serif'; g.fillStyle = '#4B463C'; g.fillText(label + ' · ' + (Math.round(r.hours * 10) / 10) + ' h online', 70, 160);
    g.fillStyle = '#17150F'; g.font = '600 84px Georgia, serif';
    g.fillText('The apps showed', 70, 300); g.fillStyle = '#756F62'; g.fillText(inr(r.appShown), 70, 400);
    g.fillStyle = '#17150F'; g.fillText('I really kept', 70, 540);
    const kept = inr(r.net); g.font = '700 190px Georgia, serif';
    const w = g.measureText(kept).width; g.fillStyle = '#F5D547'; g.fillRect(60, 650, w + 30, 70); g.fillStyle = r.net < 0 ? '#B5371A' : '#17150F'; g.fillText(kept, 70, 720);
    g.font = '500 34px system-ui, sans-serif';
    const lines = [[t('c_ded'), r.deduction], [t('g_vehicle'), r.fuel + r.maint], [t('c_data'), r.data], [t('c_fixed'), r.fixed]].filter(l => l[1] >= 0.5);
    let y = 810; g.fillStyle = '#4B463C';
    lines.forEach(l => { g.fillText(l[0], 70, y); g.textAlign = 'right'; g.fillStyle = '#B5371A'; g.fillText('−' + inr(l[1]), W - 70, y); g.textAlign = 'left'; g.fillStyle = '#4B463C'; y += 52; });
    g.fillStyle = '#17150F'; g.fillRect(70, y + 10, W - 140, 3);
    g.font = '600 52px Georgia, serif'; g.fillStyle = '#0A6A46'; g.fillText(inr(r.perHr) + ' / hour, for real', 70, y + 90);
    g.font = '500 30px system-ui, sans-serif'; g.fillStyle = '#4B463C'; g.fillText('Not ' + inr(r.appPerHr) + ' / hour. Know your TrueWage.', 70, y + 140);
    if (S.demo) { g.fillStyle = '#B5371A'; g.fillText('SAMPLE RIDER · SIMULATED DATA', 70, H - 110); }
    g.fillStyle = '#756F62'; g.fillText('#TrueWage  #GigWorkers', 70, H - 60);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const file = new File([blob], 'truewage-receipt.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: 'The apps showed ' + inr(r.appShown) + '. I really kept ' + inr(r.net) + '. #TrueWage' }); return; } catch (e) { /* cancelled */ } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'truewage-receipt.png'; a.click(); toast('Receipt image saved');
  }

  /* ---------- ACCOUNTS: sign-up, login, per-rider private data ---------- */
  async function api(method, path, body) {
    const r = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-TW': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let j = null; try { j = await r.json(); } catch (e) { /* no body */ }
    if (!r.ok) { const err = new Error((j && j.error) || 'http_' + r.status); err.status = r.status; err.code = j && j.error; err.retry = +r.headers.get('Retry-After') || 0; throw err; }
    return j;
  }
  const pickSync = () => { const o = {}; SYNC_KEYS.forEach(k => o[k] = S[k]); return o; };
  let syncTimer = null, pushing = false;
  function scheduleSync() { ui.sync = 'saving'; clearTimeout(syncTimer); syncTimer = setTimeout(pushData, 800); updateSyncUI(); }
  /** The rider's computed analytics, saved with their data so they are stored per rider in the database (never the sample rider's). */
  function analyticsSnapshot() {
    const r = S.report; if (!r || S.demo || !r.byDay) return null;
    let sn = null; try { sn = T.sensitivity(T.applyShifts(S.sessions, S.shifts), r.profile); } catch (e) { /* range is optional */ }
    const tt = r.total;
    return { from: r.dates[0], to: r.dates[r.dates.length - 1], days: r.daysWorked, orders: tt.n, hours: tt.hours, appShown: tt.appShown, gross: tt.gross, cost: tt.cost, net: tt.net, perHr: tt.perHr, appPerHr: tt.appPerHr,
      lo: sn ? sn.lo : tt.perHr, hi: sn ? sn.hi : tt.perHr,
      byDay: r.byDay.map(d => ({ date: d.date, orders: d.orders, hours: d.hours, appShown: d.appShown, gross: d.gross, net: d.net, perHr: d.perHr })),
      slots: r.zoneDaypart.map(z => ({ zone: z.zone, daypart: z.daypart, orders: z.n, hours: z.hours, perHr: z.perHr })) };
  }
  async function pushData() {
    if (!S.user || pushing) return;
    pushing = true;
    try { const j = await api('PUT', 'api/me/data', { data: Object.assign(pickSync(), { analytics: analyticsSnapshot() }), baseVersion: S.ver }); S.ver = j.version; ui.sync = 'saved'; }
    catch (e) {
      if (e.status === 409) { try { await pullMerge(); } catch (e2) { ui.sync = 'offline'; } }
      else if (e.status === 401) { sessionExpired(); }
      else ui.sync = 'offline';
    } finally { pushing = false; updateSyncUI(); }
  }
  function unionInto(snap) {
    const have = new Set(S.sessions.map(x => x.id)), haveS = new Set(S.shifts.map(x => x.id));
    (snap.sessions || []).forEach(x => { if (!have.has(x.id)) S.sessions.push(x); });
    (snap.shifts || []).forEach(x => { if (!haveS.has(x.id)) S.shifts.push(x); });
    const haveE = new Set((S.expenses || []).map(x => x.id)); S.expenses = S.expenses || [];
    (snap.expenses || []).forEach(x => { if (!haveE.has(x.id)) S.expenses.push(x); });
    S.hashes = Array.from(new Set(S.hashes.concat(snap.hashes || [])));
  }
  async function pullMerge() {      // another device saved first: keep both sets of records
    const j = await api('GET', 'api/me'); const mine = pickSync();
    adoptServer(j.data); unionInto(mine);                       // records: keep both devices' entries
    ['profile', 'goal', 'lang', 'city', 'big', 'vehicleOk', 'tourDone', 'shared', 'demo', 'rider', 'reader', 'lastBatch'].forEach(k => { if (mine[k] !== undefined) S[k] = mine[k]; });   // settings: this device's latest choice wins
    S.ver = j.version; if (j.ai) ui.aiUse = j.ai; recompute();
  }
  function adoptServer(d) {
    d = d || {};
    SYNC_KEYS.forEach(k => { if (d[k] !== undefined) S[k] = d[k]; });
    ['sessions', 'shifts', 'hashes', 'lastBatch'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
    S.profile = Object.assign(T.defaultProfile('petrol'), S.profile || {});
    if (!S.rider || typeof S.rider !== 'object') S.rider = { name: '', phone4: '' };
  }
  function freshState() {
    Object.assign(S, { sessions: [], expenses: [], fills: null, profile: T.defaultProfile('petrol'), hashes: [], reader: null, lastBatch: [], shared: false, rider: { name: '', phone4: '' }, demo: false, goal: 800, vehicleOk: false, tourDone: false, shifts: [], shift: null,
      city: 'Hyderabad', report: null, meas: null, day: null, oc: null, pending: null, simHour: null, fairTarget: null, fullCalc: false, advAll: false, insSeg: 'coach', citySeg: 'map', planSeg: 'order' });
    resetWi(); ui.chat = []; ui.thumbs = null; ui.msg = null; ui.open = new Set();
  }
  function afterAuth(user, data, version, opts) {
    opts = opts || {};
    stopWatch();
    const guestHas = S.sessions.length > 0 || S.shifts.length > 0, snap = pickSync();
    const serverHas = !!(data && ((data.sessions && data.sessions.length) || (data.shifts && data.shifts.length)));
    S.user = user; S.ver = version || 0; S.shift = null; let merged = false;
    try { localStorage.setItem('truewage.last', JSON.stringify({ id: user.id, name: user.name, phone4: user.phone4 })); } catch (e) { /* ignore */ }
    if (serverHas) { adoptServer(data); if (guestHas) { unionInto(snap); merged = true; } }
    else if (guestHas) merged = true;                          // this phone's guest data becomes the account's first data
    else adoptServer(data);
    if (!S.rider.name) S.rider = { name: user.name, phone4: user.phone4 };
    try { const c = JSON.parse(localStorage.getItem('truewage.u' + user.id) || 'null'); if (c && c.shift) S.shift = c.shift; } catch (e) { /* ignore */ }
    if (merged) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } if (!opts.silent) toast(t('au_merged')); }
    I18N.setLang(S.lang); const sel = $('#lang'); if (sel) sel.value = S.lang; applyStatic();
    recompute(); ui.sync = 'saved'; acctBtn(); if (S.shift) { beginWatch(); startTicker(); }
    if (!opts.silent) { closeSheet(); setTab('home'); } else rerender();
    scheduleSync();
  }
  function sessionExpired() { logoutLocal(); toast(t('au_e_bad_credentials')); }
  function logoutLocal() {
    clearTimeout(syncTimer); stopWatch(); const lang = S.lang, big = S.big;
    S.user = null; S.ver = 0; freshState(); S.lang = lang; S.big = big; load(); acctBtn(); applyStatic();
    try { localStorage.removeItem('truewage.last'); } catch (e) { /* ignore */ }
    if (S.sessions.length) recompute();
    closeSheet(); setTab('home');
  }
  async function doLogout() { try { await api('POST', 'api/auth/logout'); } catch (e) { /* offline: still sign out here */ } logoutLocal(); }
  function acctBtn() {
    const b = $('#btn-acct'); if (!b) return;
    b.innerHTML = S.user ? `<span class="avatar" aria-hidden="true">${esc((S.user.name || '?').trim().charAt(0).toUpperCase())}</span>` : ic('user');
    b.title = S.user ? t('au_signed_as', { name: S.user.name }) : t('au_login');
  }
  function updateSyncUI() { const el = $('#sync-state'); if (el) el.textContent = ui.sync === 'saving' ? t('au_syncing') : ui.sync === 'offline' ? t('au_offline') : t('au_synced'); const ab = $('#btn-acct'); if (ab) ab.classList.toggle('off', ui.sync === 'offline'); }
  async function boot() {
    try {
      const j = await api('GET', 'api/me');
      if (j.ai) ui.aiUse = j.ai;
      afterAuth(j.user, j.data, j.version, { silent: true });
    } catch (e) {
      if (e.status === 401) { try { localStorage.removeItem('truewage.last'); } catch (x) { /* ignore */ } return; }
      try {   // server unreachable: open the last signed-in rider's cached dashboard, read-only sync resumes when online
        const last = JSON.parse(localStorage.getItem('truewage.last') || 'null'), c = last && JSON.parse(localStorage.getItem('truewage.u' + last.id) || 'null');
        if (last && c) { S.user = last; PERSIST.forEach(k => { if (c[k] !== undefined) S[k] = c[k]; }); ui.sync = 'offline'; recompute(); acctBtn(); rerender(); }
      } catch (x) { /* ignore */ }
    }
  }
  const authErr = e => {
    if (e.code === 'locked') return t('au_e_locked', { m: Math.max(1, Math.ceil((e.retry || 60) / 60)) });
    const map = { bad_phone: 'au_e_bad_phone', bad_name: 'au_e_bad_name', bad_password: 'au_e_bad_password', phone_exists: 'au_e_phone_exists', bad_credentials: 'au_e_bad_credentials' };
    if (map[e.code]) return t(map[e.code]);
    return e.status ? t('au_e_generic') : t('au_e_net');
  };
  function authSheet(b) {
    const reg = S.authMode === 'register';
    b.innerHTML = `${seg('amode', [['register', t('au_register')], ['login', t('au_login')]], S.authMode)}
      <form id="authform" novalidate style="margin-top:16px" class="stack">
        ${reg ? `<div class="field"><label for="au-name">${t('au_name')}</label><input id="au-name" autocomplete="name" maxlength="60"></div>` : ''}
        <div class="field"><label for="au-phone">${t('au_phone')}</label><input id="au-phone" type="tel" inputmode="numeric" autocomplete="tel" maxlength="14" placeholder="98XXXXXXXX"></div>
        <div class="field"><label for="au-pw">${t('au_password')}</label><div class="pwwrap"><input id="au-pw" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="128"><button type="button" class="link" id="au-show">${t('au_show')}</button></div>${reg ? `<small class="note">${t('au_pw_hint')}</small>` : ''}</div>
        <div class="status err" id="au-err" role="alert" hidden></div>
        <button class="btn lg block" id="au-go" type="submit">${t(reg ? 'au_register' : 'au_login')}</button></form>
      <p class="note" style="margin-top:14px">${t('au_privacy')}</p>
      <div class="center"><button class="link" id="au-guest">${t('au_guest')}</button><p class="note">${t('au_guest_note')}</p></div>`;
    $$('#amode button', b).forEach(x => x.onclick = () => { S.authMode = x.dataset.s; renderSheet(); });
    $('#au-show', b).onclick = () => { const i = $('#au-pw', b), on = i.type === 'password'; i.type = on ? 'text' : 'password'; $('#au-show', b).textContent = t(on ? 'au_hide' : 'au_show'); };
    $('#au-guest', b).onclick = () => { closeSheet(); };
    $('#authform', b).onsubmit = async e => {
      e.preventDefault(); const err = $('#au-err', b), go = $('#au-go', b); err.hidden = true;
      const phone = $('#au-phone', b).value.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''), pw = $('#au-pw', b).value, name = reg ? $('#au-name', b).value.trim() : '';
      const bad = reg && !name ? 'au_e_bad_name' : !/^[6-9]\d{9}$/.test(phone) ? 'au_e_bad_phone' : (reg && pw.length < 8) || !pw ? 'au_e_bad_password' : null;
      if (bad) { err.textContent = t(bad); err.hidden = false; return; }
      go.disabled = true;
      try {
        const j = reg ? await api('POST', 'api/auth/register', { name, phone, password: pw, lang: S.lang }) : await api('POST', 'api/auth/login', { phone, password: pw });
        if (j.ai) ui.aiUse = j.ai;
        afterAuth(j.user, j.data || {}, j.version || 0);
      } catch (e2) { err.textContent = authErr(e2); err.hidden = false; go.disabled = false; }
    };
  }
  function accountSheet(b) {
    if (!S.user) {
      b.innerHTML = `<div class="card"><div class="h3">${t('au_guest_h')}</div><p class="note" style="margin-top:4px">${t('au_guest_note')}</p>
        <div class="menu"><button class="btn block" id="ac-reg">${t('au_register')}</button><button class="btn alt block" id="ac-login">${t('au_login')}</button></div></div>
        <div class="menu" style="margin-top:12px"><button class="btn alt block" id="ac-hist">${t('hist_h')}</button><button class="btn alt block" id="ac-set">${t('set_h')}</button></div>`;
      $('#ac-hist', b).onclick = () => openSheet('history');
      $('#ac-reg', b).onclick = () => { S.authMode = 'register'; openSheet('auth'); }; $('#ac-login', b).onclick = () => { S.authMode = 'login'; openSheet('auth'); };
      $('#ac-set', b).onclick = () => openSheet('data'); return;
    }
    b.innerHTML = `<div class="card acct"><span class="avatar big" aria-hidden="true">${esc(S.user.name.trim().charAt(0).toUpperCase())}</span><div><div class="h3">${esc(S.user.name)}</div><div class="note">XXXXXX${esc(S.user.phone4)}</div><div class="note" id="sync-state"></div></div></div>
      <div class="menu" style="margin-top:12px"><button class="btn alt block" id="ac-hist">${t('hist_h')}</button><button class="btn alt block" id="ac-exp">${t('exp_h')}</button>${S.user.admin ? `<button class="btn alt block" id="ac-adm">${t('adm_h')}</button>` : ''}<button class="btn alt block" id="ac-set">${t('set_h')}</button><button class="btn alt block" id="ac-pw">${t('au_pw_change')}</button><button class="btn alt block" id="ac-out">${t('au_logout')}</button></div>
      <div id="ac-form"></div>
      <div class="menu" style="margin-top:22px"><button class="btn alt block danger" id="ac-del">${t('au_delete')}</button></div>`;
    updateSyncUI();
    $('#ac-set', b).onclick = () => openSheet('data'); $('#ac-out', b).onclick = doLogout; $('#ac-hist', b).onclick = () => openSheet('history'); $('#ac-exp', b).onclick = () => openSheet('expenses'); if ($('#ac-adm', b)) $('#ac-adm', b).onclick = () => openSheet('admin');
    const form = $('#ac-form', b);
    $('#ac-pw', b).onclick = () => {
      form.innerHTML = `<form class="stack card" style="margin-top:12px" id="pwform"><div class="field"><label for="pw-old">${t('au_pw_old')}</label><input id="pw-old" type="password" autocomplete="current-password"></div>
        <div class="field"><label for="pw-new">${t('au_pw_new')}</label><input id="pw-new" type="password" autocomplete="new-password"><small class="note">${t('au_pw_hint')}</small></div><div class="status err" id="pw-err" hidden></div><button class="btn block" type="submit">${t('au_pw_change')}</button></form>`;
      $('#pwform', form).onsubmit = async e => { e.preventDefault(); const er = $('#pw-err', form); er.hidden = true;
        try { await api('POST', 'api/me/password', { old: $('#pw-old', form).value, new: $('#pw-new', form).value }); form.innerHTML = `<div class="status">${esc(t('au_pw_done'))}</div>`; } catch (x) { er.textContent = authErr(x); er.hidden = false; } };
    };
    $('#ac-del', b).onclick = () => {
      form.innerHTML = `<form class="stack card" style="margin-top:12px;border-color:var(--lost)" id="delform"><p>${esc(t('au_delete_q'))}</p><div class="field"><label for="del-pw">${t('au_password')}</label><input id="del-pw" type="password" autocomplete="current-password"></div>
        <div class="status err" id="del-err" hidden></div><button class="btn block danger" type="submit">${t('au_delete')}</button></form>`;
      $('#delform', form).onsubmit = async e => { e.preventDefault(); const er = $('#del-err', form); er.hidden = true;
        try { await api('DELETE', 'api/me', { password: $('#del-pw', form).value }); const id = S.user.id; try { localStorage.removeItem('truewage.u' + id); } catch (x) { /* ignore */ } logoutLocal(); toast(t('au_deleted')); }
        catch (x) { er.textContent = authErr(x); er.hidden = false; } };
    };
  }

  /* ---------- SHIFT TRACKER: the rider's own measured hours and distance ---------- */
  const trk = { watch: null, timer: null, wake: null };
  const pad2 = x => String(x).padStart(2, '0');
  const fmtDur = ms => { const q = Math.max(0, Math.floor(ms / 1000)); return pad2(Math.floor(q / 3600)) + ':' + pad2(Math.floor(q % 3600 / 60)) + ':' + pad2(q % 60); };
  const hm = min => Math.floor(min / 60) + ':' + pad2(Math.round(min % 60));
  const localDate = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  function tick() {
    const td = $('#td-t'); if (S.shift && td) td.textContent = fmtDur(Date.now() - S.shift.start);
    const a = $('#shift-t'); if (!S.shift || !a) return;
    a.textContent = fmtDur(Date.now() - S.shift.start); $('#shift-km').textContent = (S.shift.km || 0).toFixed(2);
    $('#shift-gps').textContent = S.shift.gps === 'off' ? t('sh_gps_off') : S.shift.gps === 'on' ? '' : t('sh_gps_wait');
  }
  function beginWatch() {
    if (trk.watch !== null || !S.shift) return;
    if (!navigator.geolocation) { S.shift.gps = 'off'; return; }
    try {
      trk.watch = navigator.geolocation.watchPosition(pos => {
        if (!S.shift) return; const c = pos.coords;
        S.shift = Object.assign(T.addFix(S.shift, { lat: c.latitude, lon: c.longitude, acc: c.accuracy, t: pos.timestamp || Date.now() }), { gps: 'on' });
        if (window.TWPlaces && c.accuracy <= 200) { // minutes per named area (never the route): used to name the area of screenshots that show none
          const now = pos.timestamp || Date.now(), pl = TWPlaces.nearest(c.latitude, c.longitude);
          if (S.shift.zt && pl) { const dt = Math.min(5, (now - S.shift.zt) / 60000); S.shift.zoneMin = S.shift.zoneMin || {}; S.shift.zoneMin[pl.zone] = (S.shift.zoneMin[pl.zone] || 0) + dt; }
          S.shift.zt = now;
        }
        save(); tick();
      }, () => { if (S.shift) { S.shift.gps = 'off'; save(); tick(); } }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
    } catch (e) { S.shift.gps = 'off'; }
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(w => { trk.wake = w; }).catch(() => { /* optional */ }); } catch (e) { /* optional */ }
  }
  function stopWatch() {
    if (trk.watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(trk.watch);
    trk.watch = null; clearInterval(trk.timer); trk.timer = null; try { if (trk.wake) trk.wake.release(); } catch (e) { /* ignore */ } trk.wake = null;
  }
  const startTicker = () => { clearInterval(trk.timer); trk.timer = setInterval(tick, 1000); };
  function shiftStart(platform) {
    if (S.shift) return;
    S.shift = { start: Date.now(), platform: platform || 'Unknown', km: 0, last: null, gps: 'pending' }; save(); beginWatch(); startTicker(); rerender();
  }
  function shiftStop() {
    if (!S.shift) return;
    const sh = S.shift, end = Date.now(); stopWatch(); S.shift = null;
    const onlineMin = Math.max(1, Math.round((end - sh.start) / 60000)), km = Math.round((sh.km || 0) * 100) / 100;
    if (end - sh.start < 3 * 60000 && km < 0.2) { save(); toast(t('sh_short')); rerender(); return; }
    const zoneMin = {}; Object.entries(sh.zoneMin || {}).forEach(([k, v]) => { zoneMin[k] = Math.round(v * 10) / 10; });
    const dom = window.TWPlaces ? TWPlaces.dominant(zoneMin) : null;
    S.shifts.push({ id: 's' + sh.start, date: localDate(sh.start), platform: sh.platform, startTs: sh.start, endTs: end, onlineMin, km, gps: sh.gps === 'on' ? 'on' : 'off', source: 'tracked', zone: dom ? dom.zone : null, zoneMin });
    S.shifts = S.shifts.slice(-400); recompute(); toast(t('sh_saved', { h: hm(onlineMin), km: km.toFixed(1) })); rerender();
  }
  function shiftCardHTML(rep) {
    if (S.shift) {
      return `<section class="card shift on"><div class="eyebrow">${t('sh_running')} · ${esc(S.shift.platform)}</div>
        <div class="shift-big"><div><span class="num" id="shift-t">${fmtDur(Date.now() - S.shift.start)}</span><small>h : m : s</small></div><div><span class="num" id="shift-km">${(S.shift.km || 0).toFixed(2)}</span><small>${t('sh_km')}</small></div></div>
        <p class="note" id="shift-gps">${S.shift.gps === 'off' ? esc(t('sh_gps_off')) : S.shift.gps === 'on' ? '' : esc(t('sh_gps_wait'))}</p><p class="note">${t('sh_keep')}</p>
        <button class="btn lg block" id="shift-stop" style="margin-top:10px">${t('sh_stop')}</button></section>`;
    }
    const plats = Array.from(new Set(S.sessions.map(x => x.platform).concat(['Swiggy', 'Zomato', 'Rapido', 'Ola', 'Uber', 'Porter']))), last = S.sessions.length ? S.sessions[S.sessions.length - 1].platform : plats[0];
    const real = S.shifts.filter(x => x.source !== 'demo'), all = S.shifts;
    const hrs = all.reduce((a, x) => a + x.onlineMin, 0) / 60, kms = all.reduce((a, x) => a + x.km, 0);
    const paired = new Set(T.pairShifts(S.sessions, S.shifts).map(x => x.shift));
    const un = real.slice().reverse().find(x => !paired.has(x));
    const m = S.meas;
    return `<section class="card shift"><h3 class="h3">${t('sh_h')}</h3><p class="note" style="margin:4px 0 12px">${t('sh_hint')}</p>
      <div class="rows" style="align-items:end"><div class="field" style="flex:1;min-width:150px"><label for="shift-plat">${t('sh_platform')}</label><select id="shift-plat">${plats.map(x => `<option ${x === last ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
        <button class="btn lg" id="shift-start">${ic('bike')}${t('sh_start')}</button></div>
      ${all.length ? `<p class="note" style="margin-top:12px">${esc(t('sh_summary', { n: all.length, h: Math.round(hrs * 10) / 10, km: Math.round(kms) }))}${S.demo ? ' · ' + esc(t('pr_label').split(':')[0]) : ''}</p>` : ''}
      ${rep ? (m && m.reliable ? `<p class="note" style="margin-top:6px"><span class="pill">${t('sh_badge')}</span> ${esc(t('sh_measured', { f: m.factor.toFixed(2), n: m.pairs }))}</p>` : `<p class="note" style="margin-top:6px">${esc(t('sh_assumed', { f: S.profile.deadKm }))}</p>`) : ''}
      ${un ? `<p class="note warn-n" style="margin-top:8px">${esc(t('sh_unmatched', { date: dLabel(un.date, { day: 'numeric', month: 'short' }), h: hm(un.onlineMin), km: un.km.toFixed(1) }))}</p><button class="btn sm alt" id="shift-add" style="margin-top:6px">${t('add_shots')}</button>` : ''}</section>`;
  }
  function bindShift(root) {
    const on = (id, fn) => { const el = $(id, root); if (el) el.onclick = fn; };
    on('#shift-start', () => shiftStart($('#shift-plat', root).value)); on('#shift-stop', shiftStop); on('#shift-add', () => openSheet('import'));
  }

  /* ---------- ASK TRUEWAGE: voice or text question -> answer from the rider's own numbers ---------- */
  function askSummary() {
    const rep = S.report, r = T.dayReceipt(rep, 'period'), plan = T.planNow(rep, HOURS_NOW()), p = S.profile, R0 = n => Math.round(n);
    const solid = rep.combos.filter(c => c.days >= 3 && c.hours >= 4), maxH = Math.max(0, ...solid.map(c => c.hours));
    const win = solid.filter(c => c.hours >= 0.4 * maxH).sort((a, b) => b.perHr - a.perHr).map(c => ({ platform: c.platform, area: c.zone, time: c.daypart, realPerHour: R0(c.perHr), hours: R0(c.hours) }));
    return {
      currency: 'INR', simulatedDemoData: !!S.demo, dataQuality: rep.dataQuality.level, period: { from: rep.dates[0], to: rep.dates[rep.dates.length - 1], daysWorked: rep.daysWorked },
      totals: { appsShowed: R0(r.appShown), cashKept: R0(r.net), realPerHour: R0(r.perHr), appImpliedPerHour: R0(r.appPerHr), onlineHours: R0(r.hours), orders: r.orders },
      costs: { platformCuts: R0(r.deduction), fuel: R0(r.fuel), repairs: R0(r.maint), phoneData: R0(r.data), bikeEmi: R0(r.fixed), profitBeforeEmi: R0(r.op), unpaidRidingCost: R0(r.deadCost) },
      bestWindows: win.slice(0, 3), worstWindows: win.slice(-2).reverse(), platforms: rep.byPlatform.map(x => ({ name: x.key, realPerHour: R0(x.perHr) })),
      nowHour: plan.hour, nowState: plan.state, nextGoodWindow: plan.next ? { from: plan.next.start, to: plan.next.end || 24, area: plan.next.zone, platform: plan.next.platform, realPerHour: R0(plan.next.perHr) } : null,
      moveAdvice: T.areaSwitch(rep, cityFor(S.city).cells).map(x => ({ at: x.p.daypart, from: x.p.from, to: x.p.to, yourPerHour: x.p.a, theirPerHour: x.p.b, source: x.p.src === 'city' ? 'simulated city data' : 'your own history' })),
      tracked: { shifts: S.shifts.length, hours: R0(S.shifts.reduce((a, x) => a + x.onlineMin, 0) / 60), km: R0(S.shifts.reduce((a, x) => a + x.km, 0)), unpaidRidingFactor: Math.round(rep.profile.deadKm * 100) / 100, unpaidRidingMeasuredByGps: !!(S.meas && S.meas.reliable) },
      fairWagePerHour: p.minWage, assumptions: { vehicle: p.vehicle, fuelPricePerUnit: p.fuelPrice, kmPerUnit: p.mileage, emiPerDay: p.fixedPerDay, unpaidKmFactor: p.deadKm }
    };
  }
  function offlineAnswer(det) {
    const rep = S.report;
    if (det.intent === 'order') {
      const r = T.orderCheck(rep ? rep.profile : S.profile, { pay: det.pay, km: det.km, avgWait: rep ? rep.avgWaitPerOrder : 6, fixedPerHour: rep && rep.total.hours > 0 ? rep.total.fixed / rep.total.hours : undefined });
      const msg = r.verdict === 'take' ? t('oc_msg_take', { net: inr(r.net), min: rd(r.effMin), hr: inr(r.perHr) }) : t('oc_msg_skip', { net: inr(r.net), hr: inr(r.perHr) });
      return `${inr(det.pay)} \u00B7 ${det.km} km: ${t('oc_' + r.verdict)}. ${msg}${r.verdict !== 'take' ? ' ' + t('oc_need', { mw: S.profile.minWage, need: rd(r.need) }) : ''}`;
    }
    if (!rep) return t('ask_nodata');
    const find = key => rep.insights.find(i => i.key === key);
    const plan = T.planNow(rep, HOURS_NOW()), r = T.dayReceipt(rep, 'period');
    switch (det.intent) {
      case 'hours': { const tt = rep.total, m = S.meas; return `${rd(tt.hours)} ${t('hrs_online')} \u00B7 ${rd(tt.km)} ${t('km_paid')} \u00B7 ${rd(tt.deadKmAbs)} ${t('km_unpaid')}. ` + (m && m.reliable ? t('sh_measured', { f: m.factor.toFixed(2), n: m.pairs }) : t('sh_assumed', { f: S.profile.deadKm })); }
      case 'income': case 'hourly': return t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) });
      case 'best': { const b = find('best'); if (!b) return t('ask_none'); let out = adviceText(b); if (plan.state !== 'good' && plan.next) out += ' ' + t('ns_go', { start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate: inr(plan.next.perHr) }); return out; }
      case 'worst': { const w = allInsights(rep).filter(i => i.key === 'skip' || i.key === 'switch'); return w.length ? w.map(adviceText).join(' ') : t('ask_none'); }
      case 'plan': { const goal = det.amount || S.goal, pl = T.planDay(rep, goal); return pl.segments.length ? pl.segments.map(g => t('pd_seg', { start: g.start, end: g.end, platform: g.platform, zone: g.zone, rate: inr(g.perHr) })).join('. ') + '. ' + (pl.reached ? t('pd_total', { x: inr(pl.expected), h: pl.hours }) : t('pd_short', { x: inr(pl.expected), h: pl.hours, goal: inr(goal) })) : t('pd_none'); }
      case 'week': { const c = T.weeklyCoach(rep); if (!c) return t('wk_none'); const dl = c.deltaPerHr; return t('wk_sum', { days: c.cur.days, cash: inr(c.cur.net), hr: inr(c.cur.perHr) }) + (dl !== null && Math.abs(dl) >= 1 ? ' ' + t(dl > 0 ? 'wk_up' : 'wk_down', { d: inr(Math.abs(dl)) }) : '') + ' ' + t(c.win.key === 'up' ? 'wk_win_up' : 'wk_win_best', c.win.key === 'up' ? { d: inr(c.win.p.d) } : { date: dLabel(c.win.p.date, { weekday: 'short', day: 'numeric', month: 'short' }), cash: inr(c.win.p.net) }); }
      case 'now':
        if (plan.state === 'good') return t('plan_good', { rate: rd(plan.now.perHr), zone: plan.now.zone, platform: plan.now.platform });
        if (plan.state === 'poor' && plan.next) return t('plan_poor', { rate: rd(plan.now.perHr), start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate2: rd(plan.next.perHr) });
        return plan.next ? t('ns_go', { start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate: inr(plan.next.perHr) }) : t('plan_nodata');
      case 'costs': { const e = find('expense'); return e ? adviceText(e) : t('ask_none'); }
      case 'platform': { const pl = find('platform'); return pl ? adviceText(pl) : t('ask_none'); }
      case 'goal': {
        const goal = det.amount || S.goal, good = plan.best.filter(b => b && b.perHr >= S.profile.minWage).map(b => b.perHr), best = good.length ? good.reduce((a, b) => a + b, 0) / good.length : 0;
        if (!(rep.total.perHr > 0) || !best) return t('ask_none');
        return t('goal_text', { goal: goal.toLocaleString('en-IN'), h1: Math.round(goal / rep.total.perHr * 10) / 10, h2: Math.round(goal / best * 10) / 10 });
      }
      case 'fuel': { const pct = det.price ? Math.round((det.price / (S.profile.fuelPrice || 105) - 1) * 100) : (det.pct || 10), a = T.simulate(rep, {}), b = T.simulate(rep, { fuelPct: pct }); return t('ask_fuel', { p: pct, x: inr(a.cashMonth - b.cashMonth), cash: inr(b.cashMonth), base: inr(a.cashMonth) }); }
      default: return t('ask_help');
    }
  }
  async function sendAsk(q) {
    q = String(q || '').trim().slice(0, 300); if (!q || ui.thinking) return;
    ui.chat.push({ me: true, text: q }); ui.thinking = true; if (S.sheet === 'ask') renderSheet();
    const det = TWAsk.detect(q); let text = null, src = 'off', note = null;
    if (ui.ai && S.report && det.intent !== 'order') {
      try {
        const res = await fetch('api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TW': '1' }, body: JSON.stringify({ q, lang: S.lang, summary: askSummary() }) });
        if (res.ok) { text = (await res.json()).answer; src = 'ai'; } else note = t('ask_unavail');
      } catch (e) { note = t('ask_unavail'); }
    }
    if (text === null) text = offlineAnswer(det);
    ui.chat.push({ me: false, text, src, note, intent: det.intent }); ui.thinking = false;
    if (S.sheet === 'ask') renderSheet();
  }
  function micStart() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast(t('mic_denied')); return; }
    try {
      const rec = new SR(); rec.lang = I18N.voice(); rec.interimResults = false; rec.maxAlternatives = 1; ui.listening = true; renderSheet();
      rec.onresult = e => { const q = e.results[0][0].transcript; ui.listening = false; sendAsk(q); };
      rec.onerror = () => { ui.listening = false; toast(t('mic_denied')); renderSheet(); }; rec.onend = () => { if (ui.listening) { ui.listening = false; renderSheet(); } };
      rec.start();
    } catch (e) { ui.listening = false; toast(t('mic_denied')); renderSheet(); }
  }
  function askSheet(b) {
    const qs = ['ask_q1', 'ask_q2', 'ask_q3', 'ask_q4', 'ask_q5'];
    const msgs = ui.chat.map((m, i) => m.me ? `<div class="bub me">${esc(m.text)}</div>` : `<div class="bub"><p>${esc(m.text)}</p>${m.note ? `<div class="note">${esc(m.note)}</div>` : ''}<div class="rows between"><span class="note">${t(m.src === 'ai' ? 'ask_src_ai' : 'ask_src_off')}</span><button class="ibtn" data-aspk="${i}" aria-label="${t('speak')}">${ic('volume')}</button></div></div>`).join('');
    b.innerHTML = `<div class="chat" id="chat">${msgs || `<p class="muted">${t(S.report ? 'ask_help' : 'ask_nodata')}</p>`}${ui.thinking ? '<div class="bub"><div class="spin"></div></div>' : ''}</div>
      <div class="eyebrow" style="margin-top:12px">${t('ask_try')}</div><div class="chips">${qs.map(k => `<button data-q="${k}">${t(k)}</button>`).join('')}</div>
      <form class="askbar" id="askform"><input id="ask-in" maxlength="300" autocomplete="off" placeholder="${esc(ui.listening ? t('ask_listening') : t('ask_ph'))}" aria-label="${t('ask_ph')}">
        <button type="button" class="ibtn mic ${ui.listening ? 'on' : ''}" id="ask-mic" aria-label="${t('ask_mic')}">${ic('mic')}</button><button class="btn" id="ask-go">${t('ask_send')}</button></form>`;
    $$('[data-q]', b).forEach(c => c.onclick = () => sendAsk(t(c.dataset.q)));
    $$('[data-aspk]', b).forEach(c => c.onclick = () => speak([ui.chat[+c.dataset.aspk].text]));
    $('#askform', b).onsubmit = e => { e.preventDefault(); const i = $('#ask-in', b); const q = i.value; i.value = ''; sendAsk(q); };
    $('#ask-mic', b).onclick = micStart;
    const chat = $('#chat', b); chat.scrollTop = chat.scrollHeight; const last = $('.bub:last-child', chat); if (last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- sheet: add screenshots (pick -> auto-read -> confirm), costs, data ---------- */
  function openSheet(kind) { S.sheet = kind || 'import'; $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; renderSheet(); syncFab(); if (S.sheet !== 'ask' && S.sheet !== 'auth') $('#sheet-x').focus(); }
  function closeSheet() { const was = S.sheet; S.sheet = null; $('#sheet').hidden = true; document.body.style.overflow = ''; if ('speechSynthesis' in window) speechSynthesis.cancel(); if (was === 'costs' || was === 'data') rerender(); syncFab(); }
  const syncFab = () => { const f = $('#fab'); if (f) f.hidden = !S.report || !!S.sheet; };
  function renderSheet() {
    const b = $('#sheet-body');
    $('#sheet-t').textContent = S.sheet === 'costs' ? t('costs_h') : S.sheet === 'data' ? t('set_h') : S.sheet === 'ask' ? t('ask_h') : S.sheet === 'auth' ? t(S.authMode === 'register' ? 'au_register' : 'au_login') : S.sheet === 'account' ? t('au_account') : S.sheet === 'expenses' ? t('exp_h') : S.sheet === 'history' ? t('hist_h') : S.sheet === 'admin' ? t('adm_h') : t('add_shots');
    if (S.sheet === 'costs') costsSheet(b); else if (S.sheet === 'data') dataSheet(b); else if (S.sheet === 'ask') askSheet(b); else if (S.sheet === 'auth') authSheet(b); else if (S.sheet === 'account') accountSheet(b); else if (S.sheet === 'expenses') expensesSheet(b); else if (S.sheet === 'history') historySheet(b); else if (S.sheet === 'admin') adminSheet(b); else importSheet(b);
  }
  function costsSheet(b) {
    b.innerHTML = `<div class="grid2">${costsHTML()}</div><p class="note" style="margin-top:10px">${t('cal_help')}</p>${S.meas && S.meas.reliable ? `<p class="note" style="margin-top:8px"><span class="pill">${t('sh_badge')}</span> ${esc(t('sh_measured', { f: S.meas.factor.toFixed(2), n: S.meas.pairs }))}</p>` : ''}<div class="center"><button class="btn lg" id="c-done">${t('done')}</button></div>`;
    bindCosts(b); $('#c-done', b).onclick = closeSheet;
  }
  /* ---------- expenses & fuel ---------- */
  const EXP_CATS = ['fuel', 'parking_toll', 'fine', 'repair', 'other'];
  function expensesSheet(b) {
    const today = localDate(Date.now()), fills = S.fills || T.fuelFromFills(S.expenses), rep = S.report;
    const list = (S.expenses || []).slice().sort((a, c) => a.date < c.date ? 1 : a.date > c.date ? -1 : 0).slice(0, 60);
    const status = fills.perKm && fills.reliable ? `<div class="status ok">${esc(t('exp_fuel_real', { p: '₹' + fills.perKm.toFixed(2), n: fills.pairs }))}${fills.mileage ? ' ' + esc(t('exp_mileage', { m: fills.mileage.toFixed(1) })) : ''}</div>`
      : `<div class="status">${esc(t('exp_fuel_need'))}</div>`;
    const counted = rep && rep.extras && rep.extras.n ? `<p class="note">${esc(t('exp_counted', { n: rep.extras.n, x: inr(rep.extras.extras) }))}${rep.extras.hasRepair ? ' ' + esc(t('exp_repair_note')) : ''}</p>` : '';
    b.innerHTML = `${status}${counted}
      <form id="exp-form" class="card stack" style="margin-top:12px" novalidate>
        <div class="grid2"><div class="field"><label for="ex-cat">${t('exp_cat')}</label><select id="ex-cat">${EXP_CATS.map(c => `<option value="${c}">${t('exp_c_' + c)}</option>`).join('')}</select></div>
          <div class="field"><label for="ex-amt">${t('exp_amount')}</label><input id="ex-amt" type="number" inputmode="decimal" min="1" step="any"></div></div>
        <div class="grid2"><div class="field"><label for="ex-date">${t('exp_date')}</label><input id="ex-date" type="date" value="${today}" max="${today}"></div>
          <div class="field"><label for="ex-note">${t('exp_note')}</label><input id="ex-note" type="text" maxlength="80"></div></div>
        <div class="grid2" id="ex-fuel"><div class="field"><label for="ex-l">${t('exp_litres')}</label><input id="ex-l" type="number" inputmode="decimal" min="0" step="any"></div>
          <div class="field"><label for="ex-o">${t('exp_odo')}</label><input id="ex-o" type="number" inputmode="numeric" min="0" step="1"></div></div>
        <div class="status err" id="ex-err" hidden></div>
        <button class="btn lg block" type="submit">${t('exp_add')}</button></form>
      <h3 class="h3" style="margin-top:18px">${t('exp_list')}</h3>
      ${list.length ? `<div class="exp-list">${list.map(e => `<div class="exp-row"><div><b>${esc(t('exp_c_' + e.category))}</b><small>${esc(dLabel(e.date, { day: 'numeric', month: 'short' }))}${e.odo ? ' · ' + Math.round(e.odo) + ' km' : ''}${e.litres ? ' · ' + e.litres + ' L' : ''}${e.note ? ' · ' + esc(e.note) : ''}</small></div><span class="num">${inr(e.amount)}</span><button class="link" data-del="${esc(e.id)}" aria-label="${esc(t('exp_del'))}">✕</button></div>`).join('')}</div>` : `<p class="muted">${t('exp_none')}</p>`}`;
    const cat = $('#ex-cat', b), fuel = $('#ex-fuel', b), sync = () => { fuel.hidden = cat.value !== 'fuel'; }; cat.onchange = sync; sync();
    $('#exp-form', b).onsubmit = e => {
      e.preventDefault(); const er = $('#ex-err', b), amt = parseFloat($('#ex-amt', b).value), date = $('#ex-date', b).value, odo = parseFloat($('#ex-o', b).value) || 0, lit = parseFloat($('#ex-l', b).value) || 0;
      if (!(amt > 0 && amt <= 500000) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) { er.textContent = t('exp_bad'); er.hidden = false; return; }
      if (cat.value === 'fuel' && odo > 0 && (S.expenses || []).some(x => x.category === 'fuel' && x.odo > 0 && x.odo === odo)) { er.textContent = t('exp_dup_odo'); er.hidden = false; return; }
      S.expenses = S.expenses || [];
      S.expenses.push({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), date, category: cat.value, amount: amt, litres: cat.value === 'fuel' ? lit : 0, odo: cat.value === 'fuel' ? odo : 0, note: $('#ex-note', b).value.trim().slice(0, 80) });
      recompute(); scheduleSync(); toast(t('exp_saved')); rerender(); renderSheet();
    };
    $$('[data-del]', b).forEach(x => x.onclick = () => { S.expenses = S.expenses.filter(e => e.id !== x.dataset.del); recompute(); scheduleSync(); rerender(); renderSheet(); });
  }

  /* ---------- history (stored in the rider's database) ---------- */
  async function historySheet(b) {
    const n = S.sessions.reduce((a, x) => a + x.orders.length, 0), days = new Set(S.sessions.map(x => x.date)).size;
    if (!S.user) {
      b.innerHTML = `<p class="muted">${esc(t('hist_local', { d: days, o: n }))}</p><div class="status">${esc(t('hist_guest'))}</div><div class="menu"><button class="btn block" id="h-reg">${t('au_register')}</button></div>`;
      $('#h-reg', b).onclick = () => { S.authMode = 'register'; openSheet('auth'); }; return;
    }
    b.innerHTML = `<div class="reading"><div class="spin"></div><span>${t('reading')}</span></div>`;
    let h; try { h = await api('GET', 'api/me/history'); } catch (e) { b.innerHTML = `<div class="status err">${esc(t('au_e_net'))}</div>`; return; }
    if (S.sheet !== 'history') return;
    const st = h.stats, fdate = ts => new Date(ts * 1000).toLocaleString(LOC[S.lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const evName = (k, d) => ({ register: t('ev_register'), login: t('ev_login'), export: t('ev_export'), saved: t('ev_saved') }[k] || k) + (d && k === 'saved' ? ': ' + d : '');
    const sec = (title, rows) => `<section class="card" style="margin-top:12px"><h3 class="h3">${title}</h3>${rows.length ? `<div class="hist">${rows.join('')}</div>` : `<p class="muted">${t('hist_empty')}</p>`}</section>`;
    b.innerHTML = `<div class="stats"><div><div class="k">${t('hist_days')}</div><div class="v num">${st.days}</div></div><div><div class="k">${t('orders_n')}</div><div class="v num">${st.orders}</div></div><div><div class="k">${t('hist_gross')}</div><div class="v num">${inr(st.gross)}</div></div><div><div class="k">km</div><div class="v num">${Math.round(st.km)}</div></div></div>
      <p class="note" style="margin-top:6px">${st.first ? esc(dLabel(st.first, { day: 'numeric', month: 'short', year: 'numeric' })) + ' – ' + esc(dLabel(st.last, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</p>
      ${h.analytics ? `<section class="card" style="margin-top:12px"><h3 class="h3">${t('hist_an')}</h3><div class="stats"><div><div class="k">${t('real')}</div><div class="v num">${inr(h.analytics.per_hr)}/h</div></div><div><div class="k">${t('shown')}</div><div class="v num">${inr(h.analytics.app_per_hr)}/h</div></div><div><div class="k">${t('you_kept')}</div><div class="v num">${inr(h.analytics.net)}</div></div><div><div class="k">${t('hours')}</div><div class="v num">${Math.round(h.analytics.hours)}</div></div></div><p class="note" style="margin-top:6px">${esc(t('acc_range', { lo: inr(h.analytics.lo_per_hr), hi: inr(h.analytics.hi_per_hr) }))}</p>${h.bestSlots.length ? `<p class="best-slot" style="margin-top:10px">${esc(h.bestSlots[0].zone)} · ${esc(t('dp_' + h.bestSlots[0].daypart))}: ${inr(h.bestSlots[0].per_hr)}/h</p>` : ''}</section>` : ''}
      <a class="btn alt block" style="margin-top:10px" href="api/me/export.csv" download>${ic('download')}${t('hist_export')}</a>
      ${sec(t('hist_zones'), h.topZones.map(z => `<div class="hrow"><span>${esc(z.zone)}</span><small>${z.orders} ${t('orders_n')}</small><b class="num">${inr(z.gross)}</b></div>`))}
      ${sec(t('hist_imports'), h.imports.map(i => `<div class="hrow"><span>${esc(fdate(i.ts))}</span><small>${esc(t('imp_line', { n: i.images, c: i.cached, s: i.sent, o: i.orders }))}</small></div>`))}
      ${sec(t('hist_statements'), h.statements.map(x => `<div class="hrow"><span>${esc(x.sid)}</span><small>${esc(fdate(x.ts))}</small><b class="num">${inr(x.monthly_take_home)}</b></div>`))}
      ${sec(t('hist_activity'), h.events.slice(0, 12).map(e => `<div class="hrow"><span>${esc(evName(e.kind, e.detail))}</span><small>${esc(fdate(e.ts))}</small></div>`))}`;
  }

  /* ---------- admin overview (only for riders listed in TRUEWAGE_ADMIN_PHONES) ---------- */
  async function adminSheet(b) {
    b.innerHTML = `<div class="reading"><div class="spin"></div><span>${t('reading')}</span></div>`;
    let j; try { j = await api('GET', 'api/admin/overview'); } catch (e) { b.innerHTML = `<div class="status err">${esc(t('au_e_generic'))}</div>`; return; }
    if (S.sheet !== 'admin') return;
    const T0 = j.totals, ago = ts => ts ? new Date(ts * 1000).toLocaleString(LOC[S.lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–';
    b.innerHTML = `<div class="stats"><div><div class="k">${t('adm_riders')}</div><div class="v num">${T0.riders}</div></div><div><div class="k">${t('hist_days')}</div><div class="v num">${T0.days}</div></div><div><div class="k">${t('orders_n')}</div><div class="v num">${T0.orders}</div></div><div><div class="k">${t('adm_ai')}</div><div class="v num">${T0.aiImagesToday}</div></div></div>
      <p class="note" style="margin-top:8px">${esc(t('adm_note', { i: T0.imports, s: T0.statements, c: T0.contributions, a: T0.aiCached }))}</p>
      <section class="card" style="margin-top:12px"><h3 class="h3">${t('adm_list')}</h3><div class="hist">${j.riders.map(r => `<div class="hrow"><span>${esc(r.name)}<small style="display:block">${esc(r.phone)} · ${esc(ago(r.created))}</small></span><small>${r.days} ${t('hist_days').toLowerCase()} · ${r.orders} ${t('orders_n')} · ${r.imports} ${t('hist_imports').toLowerCase()}<br>${esc(t('adm_last'))}: ${esc(ago(r.last_active))}</small></div>`).join('') || `<p class="muted">${t('hist_empty')}</p>`}</div></section>`;
  }

  function dataSheet(b) {
    const n = S.sessions.reduce((a, s) => a + s.orders.length, 0);
    b.innerHTML = `<p class="muted">${S.sessions.length ? t('imp_records', { s: S.sessions.length, n }) : t('imp_none')}</p>
      <div class="menu"><button class="btn alt block" id="d-costs">${t('costs_h')}</button><button class="btn alt block" id="d-expn">${t('exp_h')}</button><button class="btn alt block" id="d-hist">${t('hist_h')}</button>
        <button class="btn alt block" id="d-exp" ${S.sessions.length ? '' : 'disabled'}>${ic('download')}${t('data_export')}</button>
        <button class="btn alt block" id="d-imp">${ic('upload')}${t('data_import')}</button>
        <button class="btn alt block" id="d-del" ${S.sessions.length ? '' : 'disabled'}>${t('data_delete')}</button>
        <button class="btn alt block" id="d-big" aria-pressed="${!!S.big}">${t('big_text')}: ${S.big ? 'ON' : 'OFF'}</button></div>
      <h3 class="h3" style="margin-top:18px">${t('install_h')}</h3><p class="note">${t('install_p')}</p>
      <p class="note" style="margin-top:16px">${t('pdf_disclaimer')}</p>`;
    $('#d-costs', b).onclick = () => openSheet('costs'); $('#d-expn', b).onclick = () => openSheet('expenses'); $('#d-hist', b).onclick = () => openSheet('history'); $('#d-exp', b).onclick = exportData; $('#d-imp', b).onclick = () => $('#backup-file').click(); $('#d-del', b).onclick = deleteAll;
    $('#d-big', b).onclick = () => { S.big = !S.big; save(); applyStatic(); renderSheet(); };
  }
  function importSheet(b) {
    if (S.pending) return reviewSheet(b);
    if (ui.busy) { b.innerHTML = `<div class="reading"><div class="spin"></div><span>${t('reading')}</span><div class="bar2"><i id="read-bar" style="width:${ui.progress || 6}%"></i></div></div>${thumbsHTML()}`; return; }
    b.innerHTML = `<p class="muted" style="margin-bottom:14px">${t('imp_how')}</p>
      <div class="drop" id="drop">${ic('image').replace('class="i"', 'class="i" style="width:40px;height:40px"')}<button class="btn lg" id="pick">${ic('upload')}${t('imp_pick')}</button><p>${t('drop_s')}</p></div>
      ${ui.msg ? `<div class="status ${ui.msg.err ? 'err' : ''}">${esc(ui.msg.text)}</div>` : ''}${aiMeterHTML()}${aiNoteHTML()}${offerHTML()}${thumbsHTML()}
      <div class="center"><button class="link" id="btn-samples">${t('btn_samples')}</button></div>`;
    const drop = $('#drop', b);
    $('#pick', b).onclick = () => $('#file').click();
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
    $('#btn-samples', b).onclick = trySamples; bindOffer(b);
  }
  const aiMeterHTML = () => ui.aiUse && ui.aiUse.imageLimit ? `<p class="note ai-meter" id="ai-meter">${esc(t('ai_left', { n: Math.max(0, ui.aiUse.imageLimit - ui.aiUse.imagesToday), m: ui.aiUse.imageLimit }))}</p>` : '';
  const offerHTML = () => !ui.offer ? '' : `<div class="card offer"><div class="eyebrow">${esc(t('offer_found'))}</div><p class="h3 num">${inr(ui.offer.pay)} · ${Math.round(ui.offer.km * 10) / 10} km</p><p class="note">${esc(t('offer_note'))}</p><button class="btn lg block" id="go-offer">${esc(t('offer_check'))}</button></div>`;
  const aiNoteHTML = () => ui.aiNote ? `<div class="status ${ui.aiNote === t('ai_fallback') ? 'err' : ''}">${esc(ui.aiNote)}</div>` : '';
  const bindOffer = b => { const g = $('#go-offer', b); if (g) g.onclick = () => { S.oc = { pay: ui.offer.pay, km: ui.offer.km }; ui.offer = null; closeSheet(); setTab('check'); }; };
  const thumbsHTML = review => !ui.thumbs ? '' : `<div class="thumbs">${ui.thumbs.urls.map((u, i) => ui.thumbs.dl ? `<a href="${u}" download="truewage-sample-${i + 1}.png" title="download"><img src="${u}" alt="sample screenshot ${i + 1}"></a>` : `<img src="${u}" alt="screenshot ${i + 1}">`).join('')}${ui.thumbs.dl && !review ? `<p class="note" style="align-self:center;max-width:210px">${t('imp_sample_hint')}</p>` : ''}</div>`;
  const setProgress = p => { const el = $('#read-bar'); ui.progress = Math.max(6, rd(p * 100)); if (el) el.style.width = ui.progress + '%'; };
  const fmtTime = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  const sessionPay = s => s.orders.reduce((a, o) => a + (+o.pay || 0) + (+o.incentive || 0), 0) + (+s.bonus || 0);
  const problems = P => P.sessions.filter(s => s.include).reduce((a, s) => a + s.orders.filter(o => R.validateOrder(o).length).length, 0);

  function reviewSheet(b) {
    const P = S.pending, plats = R.KNOWN_PLATFORMS.concat(['Unknown']);
    const nOrders = P.sessions.reduce((a, s) => a + s.orders.length, 0), bad = problems(P);
    const cards = P.sessions.map((s, si) => {
      const open = ui.open.has(si), hasBad = s.orders.some(o => R.validateOrder(o).length);
      const rows = !open ? '' : s.orders.slice(0, 80).map((o, oi) => {
        const badf = new Set(R.validateOrder(o)), c = f => badf.has(f) ? ' class="bad"' : '';
        return `<tr data-oi="${oi}"><td><input type="time" data-f="hour"${c('hour')} value="${isFinite(o.hour) ? fmtTime(o.hour) : ''}"></td><td><input data-f="zone" maxlength="40" value="${esc(o.zone)}"></td>
          <td><input type="number" step="0.1" min="0" inputmode="decimal" data-f="km"${c('km')} value="${o.km}"></td><td><input type="number" min="0" inputmode="decimal" data-f="pay"${c('pay')} value="${o.pay}"></td>
          <td><input type="number" min="0" inputmode="decimal" data-f="incentive"${c('incentive')} value="${o.incentive}"></td><td><input type="number" min="0" inputmode="decimal" data-f="deduction"${c('deduction')} value="${o.deduction}"></td>
          <td><button class="link" data-del aria-label="Delete">✕</button></td></tr>`;
      }).join('');
      return `<div class="rcard ${s.dup ? 'dup' : ''} ${s.include ? '' : 'off'}" data-si="${si}">
        <div class="rhead"><input type="checkbox" data-inc ${s.include ? 'checked' : ''} aria-label="${t('imp_include')}">
          <div class="info"><b>${esc(s.platform)} · ${esc(dLabel(s.date, { day: 'numeric', month: 'short' }))}</b><span class="sinfo">${s.orders.length} ${t('orders_n')} · ${inr(sessionPay(s))}</span></div>
          <button class="link" data-edit>${open ? t('imp_hide') : t('imp_edit')}</button></div>
        ${s.dup ? `<div style="margin-top:8px"><span class="pill dupp">${t('imp_dup_sess')}</span></div>` : ''}${hasBad ? `<div style="margin-top:8px"><span class="pill dupp">${t('imp_bad')}</span></div>` : ''}
        ${!s.onlineMin && s.include ? `<div class="hrs-q"><label for="h${si}">${t('imp_online_q')}</label><input id="h${si}" type="number" min="0" max="24" step="0.5" inputmode="decimal" data-hrs placeholder="h"></div>` : ''}
        ${open ? `<div class="editor"><div class="meta"><select data-s="platform">${plats.map(p => `<option ${p === s.platform ? 'selected' : ''}>${p}</option>`).join('')}</select><input type="date" data-s="date" value="${esc(s.date)}">
          <label class="note">${t('th_inc')} (day) <input type="number" min="0" style="width:90px" data-s="bonus" value="${s.bonus || 0}"></label></div>
          <div class="scroll"><table class="tbl"><thead><tr><th>${t('th_time')}</th><th>${t('th_zone')}</th><th>${t('th_km')}</th><th>${t('th_pay')}</th><th>${t('th_inc')}</th><th>${t('th_ded')}</th><th></th></tr></thead><tbody>${rows}</tbody>
          <tfoot><tr><td colspan="7"><button class="link" data-add>${t('add_row')}</button></td></tr></tfoot></table></div></div>` : ''}</div>`;
    }).join('');
    const notes = [`<span class="pill">${t(P.reader === 'ai' ? 'reader_ai' : P.reader === 'ocr' ? 'reader_ocr' : 'reader_demo')}</span>`];
    if (P.dupImages) notes.push(`<span class="pill warnp">${esc(t('imp_dup_img', { n: P.dupImages }))}</span>`);
    b.innerHTML = `${aiNoteHTML()}${offerHTML()}${ui.thumbs ? thumbsHTML(true) : ''}<h3 class="h2" style="font-size:22px">${nOrders ? esc(t('imp_found', { n: nOrders, s: P.sessions.length })) : esc(t('imp_none'))}</h3>
      <div class="rows" style="margin:8px 0 4px">${notes.join('')}${bad ? `<span class="pill dupp">${esc(t('imp_check_n', { n: bad }))}</span>` : ''}</div>
      ${P.unread ? `<div class="status err">${esc(t('imp_unread', { n: P.unread }))}</div>` : ''}
      ${P.sessions.some(x => x.filler) ? `<div class="status err">${esc(t('imp_filler', { n: P.sessions.reduce((a, x) => a + (x.filler || 0), 0) }))}</div>` : ''}
      ${P.sessions.some(x => x.guessedKm) ? `<div class="status err">${esc(t('imp_km_guess'))}</div>` : ''}
      ${P.sessions.some(x => x.dateGuessed) ? `<div class="status err">${esc(t('imp_date_guess'))}</div>` : ''}
      ${P.sessions.reduce((a, x) => a + (x.fixedAmounts || 0), 0) ? `<div class="status err">${esc(t('imp_fixed', { n: P.sessions.reduce((a, x) => a + (x.fixedAmounts || 0), 0) }))}</div>` : ''}
      ${P.sessions.some(x => x.summary) ? `<div class="status err">${esc(t('imp_summary'))}</div>` : P.sessions.reduce((a, x) => a + (x.guessedHours || 0), 0) ? `<div class="status err">${esc(t('imp_guess', { n: P.sessions.reduce((a, x) => a + (x.guessedHours || 0), 0) }))}</div>` : ''}
      ${ui.msg && ui.msg.err ? `<div class="status err">${esc(ui.msg.text)}</div>` : ''}${cards}
      <div class="sticky-save"><button class="btn lg" id="p-save" style="flex:1"></button><button class="btn alt lg" id="p-discard">${t('imp_discard')}</button></div>`;
    const sync = () => { const n = P.sessions.filter(s => s.include).reduce((a, s) => a + s.orders.length, 0); const sv = $('#p-save', b); sv.textContent = t('imp_save', { n }); sv.disabled = !n; };
    $$('.rcard', b).forEach(rc => {
      const si = +rc.dataset.si, s = P.sessions[si];
      const refresh = () => { $('.sinfo', rc).textContent = s.orders.length + ' ' + t('orders_n') + ' · ' + inr(sessionPay(s)); sync(); };
      $('[data-inc]', rc).onchange = e => { s.include = e.target.checked; renderSheet(); };
      $('[data-edit]', rc).onclick = () => { if (ui.open.has(si)) ui.open.delete(si); else ui.open.add(si); renderSheet(); };
      const hrs = $('[data-hrs]', rc); if (hrs) hrs.addEventListener('change', () => { s.onlineMin = Math.round(Math.max(0, parseFloat(hrs.value) || 0) * 60); renderSheet(); });
      $$('[data-s]', rc).forEach(inp => inp.addEventListener('change', () => { const k = inp.dataset.s; s[k] = k === 'bonus' ? Math.max(0, parseFloat(inp.value) || 0) : inp.value; refresh(); }));
      $$('tbody tr', rc).forEach(tr => {
        const o = s.orders[+tr.dataset.oi];
        $$('[data-f]', tr).forEach(inp => inp.addEventListener('change', () => {
          const f = inp.dataset.f;
          if (f === 'hour') o.hour = R.toHour(inp.value); else if (f === 'zone') o.zone = inp.value; else o[f] = parseFloat(inp.value);
          if (f !== 'zone') { if (!isFinite(o[f]) && f !== 'hour') o[f] = 0; inp.classList.toggle('bad', R.validateOrder(o).includes(f)); }
          refresh();
        }));
        $('[data-del]', tr).addEventListener('click', () => { s.orders.splice(s.orders.indexOf(o), 1); renderSheet(); });
      });
      const add = $('[data-add]', rc); if (add) add.addEventListener('click', () => { const l = s.orders[s.orders.length - 1]; s.orders.push({ hour: l ? l.hour + 0.25 : 12, zone: l ? l.zone : 'Unknown', km: 2, pay: 40, incentive: 0, deduction: 0, durMin: 15 }); renderSheet(); });
    });
    $('#p-save', b).onclick = savePending;
    $('#p-discard', b).onclick = () => { S.pending = null; ui.thumbs = null; ui.msg = null; renderSheet(); };
    sync();
  }

  function savePending() {
    const P = S.pending; if (!P) return;
    const inc = P.sessions.filter(s => s.include && s.orders.length);
    if (!inc.length) { toast(t('imp_none')); return; }
    const badIdx = P.sessions.map((s, i) => (s.include && s.orders.some(o => R.validateOrder(o).length)) ? i : -1).filter(i => i >= 0);
    if (badIdx.length) { badIdx.forEach(i => ui.open.add(i)); toast(t('imp_bad')); renderSheet(); const b = $('#sheet-body .bad'); if (b) b.focus(); return; }
    const stamp = Date.now();
    const clean = inc.map((s, i) => ({ id: 'u' + stamp + '-' + i, date: s.date, platform: s.platform, zone: s.zone, onlineMin: s.onlineMin || 0, bonus: s.bonus || 0, source: P.reader || 'manual', orders: s.orders.map(o => ({ hour: o.hour, zone: o.zone, km: o.km, pay: o.pay, incentive: o.incentive, deduction: o.deduction, durMin: o.durMin || Math.round(10 + o.km * 3.4) })) }));
    S.sessions = S.sessions.filter(s => s.source !== 'demo').concat(clean);
    S.hashes = (S.demo ? [] : S.hashes).concat(P.hashes || []);
    S.lastBatch = clean.map(s => s.id); S.reader = P.reader; S.demo = false; S.day = null; S.oc = null; resetWi();
    S.pending = null; ui.thumbs = null; ui.msg = null; ui.open = new Set(); recompute();
    const n = clean.reduce((a, s) => a + s.orders.length, 0);
    closeSheet(); setTab('home'); toast(t('imp_saved', { n }));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'truewage', version: 3, exported: new Date().toISOString(), profile: S.profile, sessions: S.sessions, shifts: S.shifts, hashes: S.hashes }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'truewage-backup.json'; a.click();
  }
  function validBackup(j) {
    return j && j.app === 'truewage' && Array.isArray(j.sessions) && j.sessions.length <= 5000 && j.sessions.every(s => s && typeof s.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && typeof s.platform === 'string' && Array.isArray(s.orders) && s.orders.length <= 500 &&
      s.orders.every(o => o && isFinite(o.hour) && isFinite(o.pay) && isFinite(o.km)));
  }
  async function importBackup(file) {
    try {
      if (file.size > 8e6) throw new Error('too large');
      const j = JSON.parse(await file.text());
      if (!validBackup(j)) throw new Error('invalid');
      S.shifts = Array.isArray(j.shifts) ? j.shifts.filter(x => x && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && isFinite(x.onlineMin) && isFinite(x.km) && x.onlineMin >= 0 && x.km >= 0).slice(0, 400) : [];
      S.sessions = j.sessions; S.hashes = Array.isArray(j.hashes) ? j.hashes.filter(h => /^[0-9a-f]{64}$/.test(h)) : []; if (j.profile && typeof j.profile === 'object') S.profile = Object.assign(T.defaultProfile(), j.profile);
      S.demo = j.sessions.every(s => s.source === 'demo'); S.pending = null; S.day = null; recompute(); if (S.sheet) renderSheet(); rerender(); toast(t('imp_records', { s: S.sessions.length, n: S.sessions.reduce((a, s) => a + s.orders.length, 0) }));
    } catch (e) { toast(t('data_bad')); }
  }
  function deleteAll() {
    if (!confirm(t('data_confirm'))) return;
    const lang = S.lang; S.sessions = []; S.hashes = []; S.report = null; S.demo = false; S.pending = null; S.lastBatch = []; S.shared = false; S.day = null; S.oc = null; resetWi(); S.profile = T.defaultProfile('petrol'); S.rider = { name: '', phone4: '' }; S.lang = lang; stopWatch(); S.shift = null; S.shifts = [];
    try { localStorage.removeItem(KEY); localStorage.removeItem('truewage.rid'); } catch (e) { /* ignore */ }
    save(); ui.thumbs = null; ui.msg = null; closeSheet(); setTab('home'); toast(t('data_deleted'));
  }

  function stage(sessions, reader, hashes, extra) {
    const existing = S.sessions.filter(s => s.source !== 'demo');
    sessions.forEach(s => { s.dup = R.isDuplicateSession(s, existing); s.include = !s.dup; });
    S.pending = { sessions, hashes, reader, unread: extra.unread || 0, dupImages: extra.dupImages || 0 };
    ui.open = new Set(); sessions.forEach((s, i) => { if (s.orders.some(o => R.validateOrder(o).length) || !s.orders.length) ui.open.add(i); });
    ui.msg = null; renderSheet();
  }

  async function handleFiles(files) {
    files = Array.from(files).filter(f => /^image\/(png|jpeg|webp)$/.test(f.type) && f.size <= 12e6).slice(0, 12);
    if (!files.length) { ui.msg = { text: 'Choose PNG, JPEG or WebP screenshots (max 12 files, 12 MB each).', err: true }; S.sheet !== 'import' ? openSheet('import') : renderSheet(); return; }
    if (S.sheet !== 'import') { S.sheet = 'import'; $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; }
    ui.busy = true; ui.msg = null; ui.progress = 6; renderSheet();
    try {
      const res = await R.readScreenshots(files, setProgress, S.hashes);
      ui.thumbs = { urls: res.dataUrls, dl: false }; ui.busy = false;
      if (res.usage) ui.aiUse = res.usage;
      ui.offer = (res.offers && res.offers[0]) || null; ui.aiNote = res.fallback ? t('ai_fallback') : (res.notes && res.notes[0]) || null;
      if (!res.sessions.length && ui.offer) { ui.msg = null; renderSheet(); return; }
      if (!res.sessions.length) {
        if (res.dupImages === files.length) { ui.msg = { text: t('imp_dup_img', { n: res.dupImages }), err: true }; renderSheet(); return; }
        stage([{ id: 'manual', date: new Date().toISOString().slice(0, 10), platform: 'Unknown', onlineMin: 0, bonus: 0, orders: [] }], 'manual', res.hashes, { unread: res.unread, dupImages: res.dupImages });
        ui.msg = { text: 'No orders could be read from these images' + (res.unread ? ` (${res.unread} lines looked like orders but were unreadable)` : '') + '. Try clearer, uncropped screenshots, or add the orders by hand.', err: true }; renderSheet();
        return;
      }
      stage(res.sessions, res.reader, res.hashes, res);
    } catch (e) { console.error(e); ui.busy = false; ui.msg = { text: 'Reader unavailable: ' + e.message + '. Try the sample screenshots or the sample rider.', err: true }; renderSheet(); }
  }

  async function trySamples() {
    const all = D.demoSessions(), picks = all.slice(-3), urls = D.renderSampleScreens(picks);
    ui.thumbs = { urls, dl: true };
    const hashes = await Promise.all(urls.map(u => R.sha256Text(u)));
    if (hashes.every(h => S.hashes.includes(h))) { ui.msg = { text: t('imp_dup_img', { n: hashes.length }), err: true }; renderSheet(); return; }
    ui.busy = true; ui.msg = null; ui.progress = 8; renderSheet();
    const truthN = picks.reduce((a, s) => a + Math.min(13, s.orders.length), 0);
    let sessions = null, reader = 'demo', unread = 0;
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 45000));
      const r = await Promise.race([R.readDataUrls(urls, setProgress), timeout]);
      if (r.sessions.reduce((a, s) => a + s.orders.length, 0) >= truthN * 0.6) { sessions = r.sessions; reader = r.reader; unread = r.unread || 0; }
    } catch (e) { console.warn('sample read fallback', e.message); }
    if (!sessions) { sessions = picks.map(s => Object.assign({}, s, { orders: s.orders.slice(0, 13), source: 'sample' })); reader = 'demo'; }
    ui.busy = false;
    stage(sessions, reader, hashes, { unread, dupImages: 0 });
  }

  async function loadDemo(city) {
    city = typeof city === 'string' ? city : 'Hyderabad'; S.city = city;
    S.sessions = D.demoSessions(undefined, city);
    S.profile = Object.assign(T.defaultProfile('petrol'), D.DEMO_PROFILE);
    S.hashes = await Promise.all(S.sessions.map(s => R.sha256Text(JSON.stringify(s))));
    S.reader = 'demo'; S.demo = true; S.lastBatch = []; S.pending = null; stopWatch(); S.shift = null; S.shifts = D.demoShifts(S.sessions, 0.45);
    S.rider = { name: 'Ravi Kumar (demo)', phone4: '4821' }; S.day = null; S.oc = null; resetWi();
    recompute(); if (S.sheet) closeSheet(); setTab('home');
  }
  function changeLang(l) {
    S.lang = l; I18N.setLang(l); save(); $('#lang').value = l; applyStatic();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    rerender(); if (!$('#sheet').hidden) renderSheet();
  }

  /* ---------- init ---------- */
  function init() {
    load(); I18N.setLang(S.lang);
    const sel = $('#lang'); sel.innerHTML = Object.keys(I18N.L).map(k => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${I18N.L[k]._name}</option>`).join('');
    sel.onchange = () => changeLang(sel.value);
    $('#logo').onclick = e => { e.preventDefault(); setTab('home'); };
    $('#btn-add').onclick = () => openSheet('import'); $('#btn-acct').onclick = () => openSheet('account'); $('#sheet-x').onclick = closeSheet;
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
    $('#file').onchange = e => { const fl = Array.from(e.target.files); e.target.value = ''; handleFiles(fl); };
    $('#backup-file').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };
    applyStatic();
    if (S.sessions.length) recompute();
    R.aiAvailable().then(ai => { ui.ai = !!ai; $('#foot-mode').textContent = ai ? 'AI: Claude vision + Ask' : 'AI reader: on-device OCR \u00B7 Ask answers on-device'; });
    $('#fab').onclick = () => openSheet('ask'); syncFab();
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => { /* offline mode is optional */ });
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#verify=')) setTab('proof'); });
    if (S.shift) { beginWatch(); startTicker(); }
    setTab(location.hash.startsWith('#verify=') ? 'proof' : 'home');
    window.addEventListener('online', () => { if (S.user) pushData(); });
    boot();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && S.user && typeof pushData === 'function') { try { pushData(); } catch (e) { /* retried on next open */ } } });
    (async function receiveShared() {      // screenshots sent here from the gallery's Share menu arrive through the service worker (see sw.js)
      try {
        if (!/[?&]share=\d/.test(location.search) || !window.caches) return;
        const c = await caches.open('tw-share'), keys = await c.keys(), files = [];
        for (const k of keys) { const r = await c.match(k); const b = await r.blob(); files.push(new File([b], r.headers.get('X-Name') || 'shared.png', { type: b.type || 'image/png' })); await c.delete(k); }
        history.replaceState(null, '', location.pathname);
        if (files.length) setTimeout(() => handleFiles(files), 600);
      } catch (e) { /* sharing is optional */ }
    })();
    const demoQ = (/[?&]demo=(Hyderabad|Bengaluru)/.exec(location.search) || [])[1];       // /?demo=Hyderabad&tab=insights opens the sample rider (guests only; used for screenshots and demos)
    if (demoQ) setTimeout(() => { if (!S.user && !S.sessions.length) { loadDemo(demoQ); const tb = (/[?&]tab=(\w+)/.exec(location.search) || [])[1]; if (tb) setTimeout(() => setTab(tb), 700); } }, 1200);
    const go = (/[?&]go=(\w+)/.exec(location.search) || [])[1];       // home-screen shortcuts
    if (go === 'check') setTimeout(() => setTab('check'), 300); else if (go === 'add') setTimeout(() => openSheet('import'), 400);
    window.TWApp = { recompute, rerender, api, boot, doLogout, afterAuth, pushData, shiftStart, shiftStop, S, ui, loadDemo, setTab, openSheet, closeSheet, handleFiles, trySamples, sendAsk, offlineAnswer, askSummary };
  }
  init();
})();
