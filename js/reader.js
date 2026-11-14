/* Screenshot reader. Tier 1: Claude vision via the optional local server (/api/extract).
   Tier 2: on-device OCR (Tesseract.js, lazy-loaded) + a forgiving parser. Rider can always correct rows. */
(function (root) {
  'use strict';
  const KNOWN_PLATFORMS = ['Swiggy', 'Zomato', 'Rapido', 'Ola', 'Uber', 'Porter', 'Blinkit', 'Zepto', 'Dunzo', 'Shadowfax', 'Ecom Express'];
  const KNOWN_ZONES = ['Madhapur', 'Gachibowli', 'Kondapur', 'Banjara Hills', 'Secunderabad', 'Uppal', 'Dilsukhnagar', 'Kukatpally', 'Hitech City', 'Koramangala', 'Indiranagar', 'Whitefield', 'HSR Layout', 'Marathahalli', 'Jayanagar', 'Hebbal', 'Electronic City', 'BTM Layout', 'JP Nagar', 'Andheri', 'Bandra', 'Connaught Place', 'T Nagar', 'Adyar'];

  async function sha256(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const fileToDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });

  async function aiAvailable() {
    try { const r = await fetch('api/health', { cache: 'no-store' }); if (!r.ok) return false; const j = await r.json(); return !!j.ai; } catch (e) { return false; }
  }

  async function extractWithAI(dataUrls) {
    const r = await fetch('api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TW': '1' }, body: JSON.stringify({ images: dataUrls }) });
    if (!r.ok) throw new Error('AI reader failed: ' + r.status);
    const j = await r.json();
    return (j.sessions || []).map((s, i) => normalizeSession(s, 'ai-' + i));
  }

  function normalizeSession(s, id) {
    const orders = (s.orders || []).map(o => ({
      hour: toHour(o.time != null ? o.time : o.hour),
      zone: o.zone || o.area || s.zone || 'Unknown',
      km: +o.km || +o.distance_km || 0,
      pay: +o.pay || +o.payout || 0,
      incentive: +o.incentive || +o.bonus || 0,
      deduction: +o.deduction || +o.penalty || 0,
      durMin: +o.duration_min || +o.durMin || Math.round(10 + (+o.km || 3) * 3.4)
    })).filter(o => isFinite(o.hour));
    return { id: s.id || id, date: s.date || new Date().toISOString().slice(0, 10), platform: s.platform || 'Unknown', zone: s.zone, onlineMin: +s.online_minutes || +s.onlineMin || 0, bonus: +s.bonus || 0, orders, source: s.source || 'ai' };
  }

  function toHour(t) {
    if (typeof t === 'number') return t;
    const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(t || ''));
    if (!m) return NaN;
    let h = +m[1]; const mm = +m[2], ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
    return h + mm / 60;
  }

  /* ----- on-device OCR ----- */
  let tessPromise = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (!tessPromise) tessPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = () => res(root.Tesseract); s.onerror = () => rej(new Error('OCR engine unavailable offline'));
      document.head.appendChild(s);
    });
    return tessPromise;
  }

  async function ocr(dataUrl, onProgress) {
    const T = await loadTesseract();
    const { data } = await T.recognize(dataUrl, 'eng', { logger: m => onProgress && m.progress != null && onProgress(m.progress) });
    return data.text;
  }

  function parseText(text, hint) {
    const platform = (KNOWN_PLATFORMS.find(p => new RegExp('\\b' + p + '\\b', 'i').test(text)) || (hint && hint.platform) || 'Unknown');
    const dm = /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/.exec(text) || null;
    const date = dm ? dm[1] + '-' + String(dm[2]).padStart(2, '0') + '-' + String(dm[3]).padStart(2, '0') : (hint && hint.date) || new Date().toISOString().slice(0, 10);
    const om = /online[^0-9]{0,12}(\d+)\s*h[^0-9]{0,4}(\d+)?\s*m?/i.exec(text);
    const onlineMin = om ? (+om[1]) * 60 + (+om[2] || 0) : 0;
    const orders = [];
    let bonus = 0, unread = 0;
    text.split(/\r?\n/).forEach(line => {
      const bm = !/\d[:.]\d{2}/.test(line) && /(bonus|incentive|surge|target)\D{0,16}(?:Rs\.?|₹|INR)?\s*([\d,]+)/i.exec(line);
      if (bm) { bonus += +bm[2].replace(/,/g, ''); return; }
      const tm = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i.exec(line);
      if (!tm) return;
      const amounts = [];
      line.replace(/(?:₹|Rs\.?|INR|â‚¹|\?)\s*([\d,]+(?:\.\d+)?)/gi, (m, a, off) => { amounts.push({ v: +a.replace(/,/g, ''), before: line.slice(Math.max(0, off - 2), off) }); return m; });
      if (!amounts.length) { if (/km|\u20B9|rs\b/i.test(line) || line.replace(/\D/g, '').length >= 4) unread++; return; }
      const km = /(\d+(?:\.\d+)?)\s*km/i.exec(line);
      const zone = KNOWN_ZONES.find(z => new RegExp(z.slice(0, 7), 'i').test(line)) || (hint && hint.zone) || 'Unknown';
      const o = { hour: toHour(tm[0].replace('.', ':')), zone, km: km ? +km[1] : 0, pay: amounts[0].v, incentive: 0, deduction: 0, durMin: Math.round(10 + (km ? +km[1] : 3) * 3.4) };
      amounts.slice(1).forEach(a => { if (/-\s*$/.test(a.before) || /penalt|fee|fine|cut/i.test(line)) o.deduction += a.v; else o.incentive += a.v; });
      orders.push(o);
    });
    return { id: 'ocr-' + Math.random().toString(36).slice(2, 7), date, platform, onlineMin, bonus, orders, unread, source: 'ocr' };
  }

  async function extractWithOCR(dataUrls, onProgress) {
    const out = []; let unread = 0;
    for (let i = 0; i < dataUrls.length; i++) {
      const text = await ocr(dataUrls[i], p => onProgress && onProgress((i + p) / dataUrls.length));
      const s = parseText(text);
      unread += s.unread || 0;
      if (s.orders.length) out.push(s);
    }
    return { sessions: out, unread };
  }

  async function readDataUrls(dataUrls, onProgress, forceOCR) {
    let sessions, reader, unread = 0;
    if (!forceOCR && await aiAvailable()) {
      try { sessions = await extractWithAI(dataUrls); reader = 'ai'; } catch (e) { console.warn(e); }
    }
    if (!sessions) { const o = await extractWithOCR(dataUrls, onProgress); sessions = o.sessions; unread = o.unread; reader = 'ocr'; }
    return { sessions, reader, unread };
  }

  /** Main entry for uploaded files. Screenshots whose SHA-256 is already in `known` are skipped (duplicate imports).
   *  Returns {sessions, reader, hashes (new only), dataUrls (all, for thumbnails), dupImages, unread}. */
  async function readScreenshots(files, onProgress, known) {
    const seen = new Set(known || []);
    const dataUrls = await Promise.all(files.map(fileToDataURL));
    const hashes = await Promise.all(files.map(async f => sha256(await f.arrayBuffer())));
    const fresh = [], freshHashes = [];
    hashes.forEach((h, i) => { if (!seen.has(h)) { seen.add(h); fresh.push(dataUrls[i]); freshHashes.push(h); } });
    const dupImages = files.length - fresh.length;
    if (!fresh.length) return { sessions: [], reader: null, hashes: [], dataUrls, dupImages, unread: 0 };
    const r = await readDataUrls(fresh, onProgress);
    return { sessions: r.sessions, reader: r.reader, hashes: freshHashes, dataUrls, dupImages, unread: r.unread || 0 };
  }

  /** Duplicate-session detection: same app + day and (almost) the same orders. */
  function isDuplicateSession(s, existing) {
    return existing.some(e => {
      if (e.platform !== s.platform || e.date !== s.date || !e.orders.length || !s.orders.length) return false;
      const hit = s.orders.filter(o => e.orders.some(x => Math.abs(x.hour - o.hour) < 0.05 && Math.abs(x.pay - o.pay) < 0.5)).length;
      return hit / s.orders.length >= 0.8;
    });
  }

  /** Sanity checks on a single extracted order; returns a list of problem field names. */
  function validateOrder(o) {
    const bad = [];
    if (!isFinite(o.hour) || o.hour < 0 || o.hour >= 30) bad.push('hour');
    if (!(o.pay >= 0) || o.pay > 5000) bad.push('pay');
    if (!(o.km >= 0) || o.km > 150) bad.push('km');
    if (!(o.incentive >= 0) || o.incentive > 5000) bad.push('incentive');
    if (!(o.deduction >= 0) || o.deduction > 5000) bad.push('deduction');
    if (o.pay === 0 && o.incentive === 0) bad.push('pay');
    return bad;
  }

  root.TWReader = { isDuplicateSession, validateOrder, readScreenshots, readDataUrls, aiAvailable, sha256Text: async t => sha256(new TextEncoder().encode(t)), parseText, normalizeSession, toHour, sha256, KNOWN_PLATFORMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TWReader;
})(typeof window !== 'undefined' ? window : globalThis);
