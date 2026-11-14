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
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    insights: '<path d="M4 20V11M10 20V4M16 20v-6M22 20H2"/>',
    city: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    proof: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    volume: '<path d="M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14"/>',
    print: '<path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>'
  };
  const ic = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  const S = {
    sessions: [], profile: T.defaultProfile('petrol'), hashes: [], reader: null, lastBatch: [], shared: false,
    rider: { name: '', phone4: '' }, lang: 'en', report: null, tab: 'home', demo: false,
    day: null, goal: 800, simHour: null, oc: null, fairTarget: null, wi: { hours: {}, days: null, fuel: 0 }, pending: null,
    insSeg: 'advice', citySeg: 'map', advAll: false, fullCalc: false, sheet: null
  };
  const ui = { busy: false, msg: null, thumbs: null, open: new Set() };

  /* ---------- persistence (best-effort; the app works without it) ---------- */
  const KEY = 'truewage.v3';
  const PERSIST = ['sessions', 'profile', 'hashes', 'reader', 'lastBatch', 'shared', 'rider', 'lang', 'demo', 'goal'];
  function save() { try { const o = {}; PERSIST.forEach(k => o[k] = S[k]); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } }
  function load() { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j) PERSIST.forEach(k => { if (j[k] !== undefined) S[k] = j[k]; }); } catch (e) { /* ignore */ } }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => el.hidden = true, 4200); }
  function recompute() { S.report = S.sessions.length ? T.analyze(S.sessions, S.profile) : null; save(); }
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
  function applyStatic() { $$('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n)); $('#btn-set').setAttribute('aria-label', t('set_h')); document.documentElement.lang = S.lang; }
  const RENDER = { home: () => renderHome(), check: () => renderCheck(), insights: () => renderInsights(), city: () => renderCity(), proof: () => renderProof() };
  function setTab(name, noScroll) {
    S.tab = name;
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + name));
    buildNav(); RENDER[name]();
    if (!noScroll) window.scrollTo({ top: 0 });
  }
  const rerender = () => setTab(S.tab, true);

  /* ---------- shared pieces ---------- */
  function costsHTML() {
    const p = S.profile;
    const f = (k, label, step) => `<div class="field"><label>${t(label)}</label><input type="number" inputmode="decimal" step="${step || 'any'}" min="0" data-cost="${k}" value="${p[k]}"></div>`;
    const veh = ['petrol', 'ev', 'cng', 'car'].map(v => `<option value="${v}" ${p.vehicle === v ? 'selected' : ''}>${t('v_' + v)}</option>`).join('');
    return `<div class="field"><label>${t('vehicle')}</label><select data-cost="vehicle">${veh}</select></div>` +
      f('fixedPerDay', 'fixed', 10) + f('fuelPrice', 'fuel_price') + f('mileage', 'mileage') + f('maintPerKm', 'maint', 0.05) + f('deadKm', 'dead', 0.05) + f('dataPerHour', 'datacost', 0.5) + f('minWage', 'minwage', 5);
  }
  function bindCosts(root) {
    $$('[data-cost]', root).forEach(inp => inp.addEventListener('change', () => {
      const k = inp.dataset.cost;
      if (k === 'vehicle') { const d = T.defaultProfile(inp.value); S.profile = Object.assign({}, S.profile, { vehicle: inp.value, mileage: d.mileage, fuelPrice: d.fuelPrice, maintPerKm: d.maintPerKm, deadKm: d.deadKm }); $('#sheet-body') && S.sheet === 'costs' && renderSheet(); }
      else { const v = parseFloat(inp.value); if (isFinite(v) && v >= 0 && !(k === 'mileage' && v === 0)) S.profile[k] = v; else inp.value = S.profile[k]; }
      recompute(); resetWi();
    }));
  }

  function adviceText(ins) { const p = Object.assign({}, ins.p); if (p.daypart) p.daypart = t('dp_' + p.daypart); return t('a_' + ins.key, p); }
  const TAG = { leak: ['tg_real', 'bad'], below: ['tg_alert', 'bad'], above: ['tg_ok', 'good'], skip: ['tg_skip', 'bad'], best: ['tg_more', 'good'], permkm: ['tg_watch', 'warn'], deadkm: ['tg_watch', 'warn'],
    whatif: ['tg_if', 'good'], perkm: ['tg_real', 'warn'], waitimpact: ['tg_watch', 'warn'], breakeven: ['tg_watch', 'warn'], platform: ['tg_more', 'good'], expense: ['tg_real', 'warn'], lowdata: ['tg_alert', 'warn'] };
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
    $('#e-demo', v).onclick = loadDemo; $('#e-add', v).onclick = () => openSheet('import');
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

  function renderLanding(v) {
    const ex = exampleReport(), r = T.dayReceipt(ex, 'period');
    const langs = Object.keys(I18N.L).map(k => `<button data-l="${k}" aria-pressed="${S.lang === k}">${I18N.L[k]._name}</button>`).join('');
    v.innerHTML = `
      <div class="landing hero"><div>
          <h1>${t('hero_h')}</h1><p class="lead">${t('hero_p')}</p>
          <div class="langs"><div class="eyebrow">${t('pick_lang')}</div><div class="seg" id="lseg">${langs}</div></div>
          <div class="cta"><button class="btn lg" id="l-add">${ic('upload')}${t('add_shots')}</button><button class="btn lg alt" id="l-demo">${t('btn_demo')}</button></div></div>
        <div>${smallReceipt(r, t('period_all'), true)}</div></div>
      <div class="steps">
        <div><span class="n">1</span><div><h3>${t('step_1')}</h3><p>${t('st1_p')}</p></div></div>
        <div><span class="n">2</span><div><h3>${t('step_2')}</h3><p>${t('st2_p')}</p></div></div>
        <div><span class="n">3</span><div><h3>${t('step_3')}</h3><p>${t('st3_p')}</p></div></div></div>`;
    $$('#lseg button', v).forEach(b => b.onclick = () => changeLang(b.dataset.l));
    $('#l-add', v).onclick = () => openSheet('import'); $('#l-demo', v).onclick = loadDemo;
  }

  function renderHome() {
    const v = $('#view-home'), rep = S.report;
    if (!rep) return renderLanding(v);
    const days = rep.dates.slice(-7).reverse();
    const sel = S.day === 'typical' ? 'typical' : (S.day && days.includes(S.day) ? S.day : 'period');
    const r = sel === 'typical' ? T.dayReceipt(rep, null) : T.dayReceipt(rep, sel);
    const label = sel === 'period' ? t('period_all') : sel === 'typical' ? t('avg_day') : dLabel(sel, { weekday: 'short', day: 'numeric', month: 'short' });
    const range = rep.daysWorked === 1 ? dLabel(rep.dates[0], { weekday: 'short', day: 'numeric', month: 'short' }) : `${dLabel(rep.dates[0], { day: 'numeric', month: 'short' })} – ${dLabel(rep.dates[rep.dates.length - 1], { day: 'numeric', month: 'short' })} · ${rep.daysWorked} ${t('days')}`;
    const plan = T.planNow(rep, S.simHour != null ? S.simHour : new Date().getHours());
    const advice = rep.insights.filter(i => ['skip', 'best', 'platform', 'breakeven', 'whatif', 'deadkm', 'waitimpact', 'lowdata'].includes(i.key)).slice(0, 2).map(i => ({ i, txt: adviceText(i) }));
    const keptPct = r.appShown > 0 ? Math.max(0, Math.min(100, rd(r.net / r.appShown * 100))) : 0;
    const p = S.profile, vlabel = t('v_' + p.vehicle);
    v.innerHTML = `
      <div class="period"><div>${S.demo ? `<span class="sim">${t('pr_label')}</span>` : `<span class="eyebrow">${esc(range)}</span>`}</div>
        <select id="period" class="sel" aria-label="${t('period_pick')}"><option value="period" ${sel === 'period' ? 'selected' : ''}>${t('period_all')}</option><option value="typical" ${sel === 'typical' ? 'selected' : ''}>${t('avg_day')}</option>${days.map(d => `<option value="${d}" ${d === sel ? 'selected' : ''}>${dLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>`).join('')}</select></div>
      <div class="cols lead">
        <div class="stack">
          <section class="kept-card"><div class="kept-lbl">${t('you_kept')} · ${esc(label)}</div>
            <div class="kept-n num ${r.net < 0 ? 'neg' : ''}">${inr(r.net)}</div>
            <p class="kept-sum">${esc(t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) }))}</p>
            <div class="kbar" aria-hidden="true"><i style="width:${keptPct}%"></i></div>
            <div class="kbar-l"><span>${esc(t('kept_pct', { p: keptPct }))}</span><span>${Math.round(r.hours * 10) / 10} ${t('hours')} · ${rd(r.orders)} ${t('orders_n')}</span></div></section>
          <div class="acts"><button class="btn lg" id="a-check">${t('n_check')}</button><button class="btn lg alt" id="a-add">${t('add_shots')}</button></div>
          <div class="rows"><button class="btn sm alt" id="share">${ic('share')}${t('share_btn')}</button><button class="btn sm alt" id="spk-day">${ic('volume')}${t('speak')}</button></div>
          <div class="assume"><span>${t('assume_h')}: <b>${esc(vlabel)}</b> · ${inr(p.fuelPrice)} · ${p.mileage} km · EMI ${inr(p.fixedPerDay)}/${t('days').replace(/s$/, '')}</span><button class="link" id="a-costs">${t('change')}</button></div>
        </div>
        <div class="stack">
          <section class="card"><div class="rows between" style="margin-bottom:4px"><h3 class="h3">${t('where_went')}</h3><button class="link" id="a-full">${S.fullCalc ? t('imp_hide') : t('full_calc')}</button></div>
            ${ledgerHTML(r, S.fullCalc)}${S.fullCalc ? `<p class="note" style="margin-top:10px">${t('op_note')}</p>` : ''}</section>
          ${advice.length ? `<section class="card"><div class="rows between"><h3 class="h3">${t('advice_h')}</h3><button class="link" id="to-ins">${t('more_advice')}</button></div>${adviceRows(advice)}</section>` : ''}
          ${planCard(rep, plan)}
        </div>
      </div>`;
    $('#period', v).onchange = e => { S.day = e.target.value; renderHome(); };
    $('#a-check', v).onclick = () => setTab('check'); $('#a-add', v).onclick = () => openSheet('import'); $('#a-costs', v).onclick = () => openSheet('costs');
    $('#a-full', v).onclick = () => { S.fullCalc = !S.fullCalc; renderHome(); };
    $('#share', v).onclick = () => shareReceipt(r, label);
    $('#spk-day', v).onclick = () => speak([t('h_sum', { app: inr(r.appShown), kept: inr(r.net), real: inr(r.perHr), appHr: inr(r.appPerHr) })].concat(advice.map(a => a.txt)));
    const more = $('#to-ins', v); if (more) more.onclick = () => { S.insSeg = 'advice'; setTab('insights'); };
    bindSpeak(v, advice);
    const sim = $('#sim', v); if (sim) sim.onchange = () => { S.simHour = sim.value === '' ? null : +sim.value; renderHome(); };
  }

  function planCard(rep, plan) {
    const mw = rep.profile.minWage, cur = plan.hour, hours = []; for (let h = 6; h < 24; h++) hours.push(h);
    const cells = hours.map(h => { const b = plan.best[h]; return `<i class="${b ? (b.perHr >= mw ? 'g' : 'b') : ''} ${h === cur ? 'cur' : ''}" title="${h}:00 ${b ? inr(b.perHr) + '/h · ' + esc(b.platform) + ' ' + esc(b.zone) : ''}"></i>`; }).join('');
    const nx = plan.next ? { start: plan.next.start, end: plan.next.end || 24, zone: plan.next.zone, platform: plan.next.platform, rate2: rd(plan.next.perHr) } : null;
    let msg;
    if (plan.state === 'good') msg = t('plan_good', { rate: rd(plan.now.perHr), zone: plan.now.zone, platform: plan.now.platform });
    else if (plan.state === 'poor') msg = nx ? t('plan_poor', Object.assign({ rate: rd(plan.now.perHr) }, nx)) : t('plan_nodata');
    else msg = t('plan_nodata') + (nx ? ' → ' + nx.start + ':00–' + nx.end + ':00 · ' + nx.zone + ' · ' + nx.platform + ' (' + inr(nx.rate2) + '/h)' : '');
    const opts = [['', 'Live'], [8, '08:00'], [13, '13:00'], [19, '19:00'], [22, '22:00']].map(([v, l]) => `<option value="${v}" ${String(S.simHour == null ? '' : S.simHour) === String(v) ? 'selected' : ''}>${l}</option>`).join('');
    return `<section class="card"><div class="rows between"><h3 class="h3">${t('plan_h')} · ${String(cur).padStart(2, '0')}:00</h3>
      <select id="sim" class="sel" aria-label="${t('plan_sim')}">${opts}</select></div>
      ${plan.state === 'nodata' ? '' : `<div style="margin-top:8px"><span class="state ${plan.state}"><i></i>${plan.state === 'good' ? t('oc_take') : t('oc_skip')}</span></div>`}
      <p style="margin-top:6px">${esc(msg)}</p><div class="tl">${cells}</div><div class="tlx">${hours.map(h => `<span>${h % 3 === 0 ? h : ''}</span>`).join('')}</div></section>`;
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
      <div style="margin:16px 0 18px">${seg('iseg', [['advice', t('sg_advice')], ['when', t('sg_when')], ['costs', t('sg_costs')], ['wi', t('wi_tab')]], S.insSeg)}</div><div id="ibody"></div>`;
    $$('#iseg button', v).forEach(b => b.onclick = () => { S.insSeg = b.dataset.s; renderInsights(); });
    const body = $('#ibody', v);
    if (S.insSeg === 'advice') insAdvice(body, rep);
    else if (S.insSeg === 'when') insWhen(body, rep);
    else if (S.insSeg === 'costs') insCosts(body, rep);
    else whatifBody(body);
  }
  function insAdvice(b, rep) {
    const advice = rep.insights.map(i => ({ i, txt: adviceText(i) }));
    b.innerHTML = `<div class="rows between"><span class="note">${advice.length}</span><button class="btn sm alt" id="spk-all">${ic('volume')}${t('speak')}</button></div><div class="card" style="margin-top:8px">${adviceRows(advice)}</div>`;
    $('#spk-all', b).onclick = () => speak(advice.map(a => a.txt)); bindSpeak(b, advice);
  }
  function insWhen(b, rep) {
    if (rep.dataQuality.level === 'low') { b.innerHTML = `<p class="dq low">${t('a_lowdata', { days: rep.dataQuality.days, orders: rep.dataQuality.orders })}</p>`; return; }
    const zones = rep.byZone.map(z => z.key), maxP = Math.max(...rep.byPlatform.map(p => Math.max(p.appPerHr, p.perHr)), 1);
    b.innerHTML = `<div class="cols two">
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
      <div class="oc"><div>
        <label class="fl" for="oc-pay">${t('oc_pay')}</label><div class="bigfield"><span>₹</span><input id="oc-pay" type="number" inputmode="decimal" min="0" value="${S.oc.pay}"></div>
        <label class="fl" for="oc-km">${t('oc_km')}</label><div class="bigfield"><input id="oc-km" type="number" inputmode="decimal" step="0.1" min="0" value="${S.oc.km}"><span style="font-size:20px">km</span></div>
        <input type="range" id="oc-r" min="0.5" max="15" step="0.1" value="${Math.min(15, S.oc.km)}" aria-label="${t('oc_km')}">
        <div class="chips">${presets.map(([p, k]) => `<button data-p="${p}" data-k="${k}">₹${p} · ${k} km</button>`).join('')}</div>
        ${rep ? '' : `<p class="note" style="margin-top:8px">${t('empty_p')}</p>`}</div><div id="oc-out"></div></div>`;
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
    const r = T.orderCheck(S.profile, { pay: S.oc.pay, km: S.oc.km, avgWait: rep ? rep.avgWaitPerOrder : 6 });
    const msg = r.verdict === 'take' ? t('oc_msg_take', { net: rd(r.net), min: rd(r.effMin), hr: rd(r.perHr) }) : t('oc_msg_skip', { net: rd(r.net), hr: rd(r.perHr) });
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
      <p class="note" style="margin-top:10px">${inr(r.perKm)}/km · break-even ${inr(r.breakEvenPerKm)}/km</p></div>`;
  }

  /* ---------- CITY ---------- */
  let CITY = null;
  function youVsCity(rep, c) {
    if (!rep) return '';
    const gaps = rep.zoneDaypart.filter(z => z.days >= 3 && z.hours >= 4).map(z => {
      const cc = c.cells.find(x => x.zone === z.zone && x.daypart === z.daypart && !x.hidden);
      return cc ? { z, cc, diff: z.perHr - cc.real } : null;
    }).filter(Boolean).sort((a, b) => a.diff - b.diff);
    if (!gaps.length) return '';
    const w = gaps[0], b = gaps[gaps.length - 1];
    const line = (g, good) => `<div class="adv"><div><span class="tag ${good ? 'good' : 'bad'}">${good ? t('tg_more') : t('tg_alert')}</span><p><b>${esc(g.z.zone)} · ${esc(t('dp_' + g.z.daypart))}</b>: ${t('city_you')} <b>${inr(g.z.perHr)}/h</b> vs ${t('n_city')} <b>${inr(g.cc.real)}/h</b> (${g.cc.n} ${t('city_riders')}, simulated)</p></div><span></span></div>`;
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
    const v = $('#view-city'); CITY = CITY || D.cityData();
    const rep = S.report, c = CITY, zones = Object.keys(D.CITY_ZONES), mine = rep ? rep.zoneDaypart : null;
    const maxP = Math.max(...c.platforms.map(p => p.claimed)), gap = rd((1 - c.medianReal / c.medianClaimed) * 100);
    const panel = {
      map: () => `${youVsCity(rep, c)}<section class="card"><h3 class="h3">${t('where_h')}</h3>${heatmapHTML(c.cells, zones, mine, S.profile.minWage)}<p class="note" style="margin-top:8px">${t('city_hidden')}${rep ? ' · ' + t('city_you') + ': outlined' : ''}</p></section>
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
      <div class="stats">
        <div><div class="k">${t('city_claim')}</div><div class="v num">${inr(c.medianClaimed)}</div><div class="s">/ ${t('hours')}</div></div>
        <div><div class="k">${t('city_med')}</div><div class="v num good">${inr(c.medianReal)}</div><div class="s">−${gap}%</div></div>
        <div><div class="k">${t('city_below')}</div><div class="v num bad">${c.belowMinWagePct}%</div><div class="s">₹${S.profile.minWage}/h</div></div>
        <div><div class="k">${t('city_riders')}</div><div class="v num">${c.riders.toLocaleString('en-IN')}</div><div class="s">k ≥ ${c.k}</div></div></div>
      <div style="margin:18px 0">${seg('cseg', [['map', t('sg_map')], ['fair', t('fair_floor')], ['share', t('sg_share')]], S.citySeg)}</div>
      <div id="cbody">${panel[S.citySeg]()}</div>`;
    $$('#cseg button', v).forEach(b => b.onclick = () => { S.citySeg = b.dataset.s; renderCity(); });
    const ft = $('#fair-t', v); if (ft) ft.oninput = () => { S.fairTarget = +ft.value; renderCity(); };
    const sb = $('#share-city', v);
    if (sb) {
      const setLive = j => { const el = $('#live-n', v); if (!el) return; if (S.demo) { el.textContent = t('share_demo'); sb.disabled = true; return; } if (j) { el.textContent = t('live_label') + ': ' + t('live_n', { n: j.contributors, k: j.k }); sb.disabled = !rep || S.shared; } else { el.textContent = t('share_fail'); sb.disabled = true; } };
      sb.disabled = true; fetchLive().then(setLive);
      sb.onclick = async () => {
        const cells = rep.combos.filter(x => x.hours >= 1).map(x => ({ platform: x.platform, zone: x.zone, daypart: x.daypart, perHr: Math.round(x.perHr * 10) / 10, hours: Math.round(x.hours * 10) / 10 }));
        try {
          const r = await fetch('api/contribute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rid: anonId(), cells, demo: !!S.demo }) });
          if (!r.ok) throw new Error((await r.json()).error || r.status);
          S.shared = true; save(); toast(t('city_shared')); fetchLive().then(setLive); sb.textContent = t('city_shared'); sb.disabled = true;
        } catch (e) { toast(t('share_fail') + ' (' + e.message + ')'); }
      };
      $('#csv', v).onclick = () => {
        const rows = ['zone,time_of_day,riders,median_real_rupees_per_hour,median_app_implied_rupees_per_hour,data_source'].concat(c.cells.filter(x => !x.hidden).map(x => [x.zone, x.daypart, x.n, x.real, x.claimed, 'SIMULATED'].join(',')));
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); a.download = 'truewage-city-report-SIMULATED.csv'; a.click();
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
    try { const r = await fetch('api/statement', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, hash, data: st }) }); registered = r.ok; } catch (e) { /* static hosting */ }
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

  /* ---------- sheet: add screenshots (pick -> auto-read -> confirm), costs, data ---------- */
  function openSheet(kind) { S.sheet = kind || 'import'; $('#sheet').hidden = false; document.body.style.overflow = 'hidden'; renderSheet(); $('#sheet-x').focus(); }
  function closeSheet() { const was = S.sheet; S.sheet = null; $('#sheet').hidden = true; document.body.style.overflow = ''; if (was === 'costs' || was === 'data') rerender(); }
  function renderSheet() {
    const b = $('#sheet-body');
    $('#sheet-t').textContent = S.sheet === 'costs' ? t('costs_h') : S.sheet === 'data' ? t('set_h') : t('add_shots');
    if (S.sheet === 'costs') costsSheet(b); else if (S.sheet === 'data') dataSheet(b); else importSheet(b);
  }
  function costsSheet(b) {
    b.innerHTML = `<div class="grid2">${costsHTML()}</div><div class="center"><button class="btn lg" id="c-done">${t('done')}</button></div>`;
    bindCosts(b); $('#c-done', b).onclick = closeSheet;
  }
  function dataSheet(b) {
    const n = S.sessions.reduce((a, s) => a + s.orders.length, 0);
    b.innerHTML = `<p class="muted">${S.sessions.length ? t('imp_records', { s: S.sessions.length, n }) : t('imp_none')}</p>
      <div class="menu"><button class="btn alt block" id="d-costs">${t('costs_h')}</button>
        <button class="btn alt block" id="d-exp" ${S.sessions.length ? '' : 'disabled'}>${ic('download')}${t('data_export')}</button>
        <button class="btn alt block" id="d-imp">${ic('upload')}${t('data_import')}</button>
        <button class="btn alt block" id="d-del" ${S.sessions.length ? '' : 'disabled'}>${t('data_delete')}</button></div>
      <p class="note" style="margin-top:16px">${t('pdf_disclaimer')}</p>`;
    $('#d-costs', b).onclick = () => openSheet('costs'); $('#d-exp', b).onclick = exportData; $('#d-imp', b).onclick = () => $('#backup-file').click(); $('#d-del', b).onclick = deleteAll;
  }
  function importSheet(b) {
    if (S.pending) return reviewSheet(b);
    if (ui.busy) { b.innerHTML = `<div class="reading"><div class="spin"></div><span>${t('reading')}</span><div class="bar2"><i id="read-bar" style="width:${ui.progress || 6}%"></i></div></div>${thumbsHTML()}`; return; }
    b.innerHTML = `<p class="muted" style="margin-bottom:14px">${t('imp_how')}</p>
      <div class="drop" id="drop">${ic('image').replace('class="i"', 'class="i" style="width:40px;height:40px"')}<button class="btn lg" id="pick">${ic('upload')}${t('imp_pick')}</button><p>${t('drop_s')}</p></div>
      ${ui.msg ? `<div class="status ${ui.msg.err ? 'err' : ''}">${esc(ui.msg.text)}</div>` : ''}${thumbsHTML()}
      <div class="center"><button class="link" id="btn-samples">${t('btn_samples')}</button></div>`;
    const drop = $('#drop', b);
    $('#pick', b).onclick = () => $('#file').click();
    ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
    $('#btn-samples', b).onclick = trySamples;
  }
  const thumbsHTML = () => !ui.thumbs ? '' : `<div class="thumbs">${ui.thumbs.urls.map((u, i) => ui.thumbs.dl ? `<a href="${u}" download="truewage-sample-${i + 1}.png" title="download"><img src="${u}" alt="sample screenshot ${i + 1}"></a>` : `<img src="${u}" alt="screenshot ${i + 1}">`).join('')}${ui.thumbs.dl ? `<p class="note" style="align-self:center;max-width:210px">${t('imp_sample_hint')}</p>` : ''}</div>`;
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
    b.innerHTML = `${ui.thumbs ? thumbsHTML() : ''}<h3 class="h2" style="font-size:22px">${nOrders ? esc(t('imp_found', { n: nOrders, s: P.sessions.length })) : esc(t('imp_none'))}</h3>
      <div class="rows" style="margin:8px 0 4px">${notes.join('')}${bad ? `<span class="pill dupp">${esc(t('imp_check_n', { n: bad }))}</span>` : ''}</div>
      ${P.unread ? `<div class="status err">${esc(t('imp_unread', { n: P.unread }))}</div>` : ''}
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
    const blob = new Blob([JSON.stringify({ app: 'truewage', version: 3, exported: new Date().toISOString(), profile: S.profile, sessions: S.sessions, hashes: S.hashes }, null, 1)], { type: 'application/json' });
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
      S.sessions = j.sessions; S.hashes = Array.isArray(j.hashes) ? j.hashes.filter(h => /^[0-9a-f]{64}$/.test(h)) : []; if (j.profile && typeof j.profile === 'object') S.profile = Object.assign(T.defaultProfile(), j.profile);
      S.demo = j.sessions.every(s => s.source === 'demo'); S.pending = null; S.day = null; recompute(); if (S.sheet) renderSheet(); rerender(); toast(t('imp_records', { s: S.sessions.length, n: S.sessions.reduce((a, s) => a + s.orders.length, 0) }));
    } catch (e) { toast(t('data_bad')); }
  }
  function deleteAll() {
    if (!confirm(t('data_confirm'))) return;
    const lang = S.lang; S.sessions = []; S.hashes = []; S.report = null; S.demo = false; S.pending = null; S.lastBatch = []; S.shared = false; S.day = null; S.oc = null; resetWi(); S.profile = T.defaultProfile('petrol'); S.rider = { name: '', phone4: '' }; S.lang = lang;
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

  async function loadDemo() {
    S.sessions = D.demoSessions();
    S.profile = Object.assign(T.defaultProfile('petrol'), D.DEMO_PROFILE);
    S.hashes = await Promise.all(S.sessions.map(s => R.sha256Text(JSON.stringify(s))));
    S.reader = 'demo'; S.demo = true; S.lastBatch = []; S.pending = null;
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
    $('#btn-add').onclick = () => openSheet('import'); $('#btn-set').onclick = () => openSheet('data'); $('#sheet-x').onclick = closeSheet;
    $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
    $('#file').onchange = e => { const fl = Array.from(e.target.files); e.target.value = ''; handleFiles(fl); };
    $('#backup-file').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };
    applyStatic();
    if (S.sessions.length) recompute();
    R.aiAvailable().then(ai => { $('#foot-mode').textContent = ai ? 'AI reader: Claude vision' : 'AI reader: on-device OCR'; });
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    window.addEventListener('hashchange', () => { if (location.hash.startsWith('#verify=')) setTab('proof'); });
    setTab(location.hash.startsWith('#verify=') ? 'proof' : 'home');
    window.TWApp = { S, loadDemo, setTab, openSheet, closeSheet, handleFiles, trySamples };
  }
  init();
})();
