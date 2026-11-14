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

  /** Clean a phone screenshot for OCR: scale to a readable size, greyscale, flip dark themes to dark-on-light, stretch contrast. */
  function preprocess(dataUrl) {
    return new Promise(resolve => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.naturalWidth, h = img.naturalHeight;
            const k = w < 1000 ? 1000 / w : w > 1700 ? 1700 / w : 1;
            w = Math.round(w * k); h = Math.round(h * k);
            if (h > 9000) { const f = 9000 / h; w = Math.round(w * f); h = 9000; }
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
            const d = x.getImageData(0, 0, w, h), px = d.data, n = w * h, hist = new Uint32Array(256);
            for (let i = 0, j = 0; i < n; i++, j += 4) { const g = (px[j] * 0.299 + px[j + 1] * 0.587 + px[j + 2] * 0.114) | 0; px[j] = g; hist[g]++; }
            let sum = 0; for (let v = 0; v < 256; v++) sum += v * hist[v];
            const invert = sum / n < 125;
            let lo = 0, hi = 255, acc = 0;
            for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
            acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
            const span = Math.max(40, hi - lo);
            for (let i = 0, j = 0; i < n; i++, j += 4) {
              let g = Math.max(0, Math.min(255, ((px[j] - lo) * 255) / span));
              if (invert) g = 255 - g;
              px[j] = px[j + 1] = px[j + 2] = g; px[j + 3] = 255;
            }
            x.putImageData(d, 0, 0);
            resolve(c.toDataURL('image/png'));
          } catch (e) { resolve(dataUrl); }
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
      } catch (e) { resolve(dataUrl); }
    });
  }

  let worker = null, workerProgress = null;
  async function getWorker() {
    const T = await loadTesseract();
    if (!worker) worker = await T.createWorker('eng', 1, { logger: m => workerProgress && m.status === 'recognizing text' && workerProgress(m.progress || 0) });
    return worker;
  }
  /** psm 6 = one uniform block (best for tables), 4 = columns of varying size, 3 = fully automatic. */
  async function ocr(dataUrl, onProgress, psm) {
    const w = await getWorker();
    workerProgress = onProgress || null;
    await w.setParameters({ tessedit_pageseg_mode: String(psm || 6), preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const { data } = await w.recognize(dataUrl);
    return data.text;
  }

  /** Fix characters OCR commonly confuses inside numbers (O->0, l/I/|->1) and the rupee sign (read as ?, %, ₹ variants). */
  function cleanOcr(text) {
    return String(text || '')
      .replace(/â‚¹|₨/g, '₹')
      .replace(/(?<=\d)[Oo](?=[\d.,:])|(?<=[\d.,:])[Oo](?=\d)/g, '0')
      .replace(/(?<=\d)[lI|](?=[\d.,:])|(?<=[:.,])[lI|](?=\d)/g, '1')
      .replace(/(?<![A-Za-z0-9])[?%¥€£$Zz](?=\s?\d[\d,]*(?:\.\d+)?\b)/g, '₹')
      .replace(/[ \t]+/g, ' ');
  }
  const CUR = /(?:₹|Rs\.?|INR)\s*/i;
  /** First plausible clock time on a line (ignores money like "₹52.30" and distances like "2.30 km"). */
  function findTime(line) {
    const re = /(?<![\d:.])(\d{1,2})([:.])(\d{2})(?!\d)\s*(am|pm)?/gi; let m;
    while ((m = re.exec(line))) {
      const h = +m[1], mi = +m[3], ap = (m[4] || '').toLowerCase();
      if (mi > 59) continue;
      if (ap ? (h < 1 || h > 12) : h > 23) continue;
      if (m[2] === '.') {
        if (!ap && /(?:₹|Rs\.?|INR)\s*$/i.test(line.slice(0, m.index))) continue;
        if (/^\s*(?:km|kms|kilomet)/i.test(line.slice(m.index + m[0].length))) continue;
        if (!ap && line.indexOf(':') >= 0) continue; // a ':' time exists elsewhere on the line, this is a decimal
      }
      return m[0].replace('.', ':').trim();
    }
    return null;
  }
  const firstZone = line => { let best = null, at = 1e9; KNOWN_ZONES.forEach(z => { const m = new RegExp(z.slice(0, 7), 'i').exec(line); if (m && m.index < at) { at = m.index; best = z; } }); return best; };
  const money = str => +String(str).replace(/,/g, '');

  function parseCore(text, hint) {
    const platform = (KNOWN_PLATFORMS.find(p => new RegExp('\\b' + p + '\\b', 'i').test(text)) || (hint && hint.platform) || 'Unknown');
    const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const iso = (y, m, d) => (y < 100 ? 2000 + y : y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const okDate = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && (y < 100 ? 2000 + y : y) >= 2015;
    let date = null, m1;
    const nowY = new Date().getFullYear();
    if ((m1 = /(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(text)) && okDate(+m1[1], +m1[2], +m1[3])) date = iso(+m1[1], +m1[2], +m1[3]);
    else if ((m1 = /(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[,\s-]+(\d{2,4})/i.exec(text)) && okDate(+m1[3], MON[m1[2].toLowerCase()], +m1[1])) date = iso(+m1[3], MON[m1[2].toLowerCase()], +m1[1]);
    else if ((m1 = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i.exec(text)) && okDate(+m1[3], MON[m1[1].toLowerCase()], +m1[2])) date = iso(+m1[3], MON[m1[1].toLowerCase()], +m1[2]);
    else if ((m1 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/.exec(text)) && okDate(+m1[3], +m1[2], +m1[1])) date = iso(+m1[3], +m1[2], +m1[1]); // Indian day-first
    else if ((m1 = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.exec(text)) && okDate(nowY, MON[m1[2].toLowerCase()], +m1[1])) { // "13 Nov" without a year: the most recent such date
      let y = nowY; const t = new Date(y, MON[m1[2].toLowerCase()] - 1, +m1[1]); if (t.getTime() > Date.now() + 864e5) y--; date = iso(y, MON[m1[2].toLowerCase()], +m1[1]);
    } else if ((m1 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(text)) && okDate(nowY, MON[m1[1].toLowerCase()], +m1[2])) {
      let y = nowY; const t = new Date(y, MON[m1[1].toLowerCase()] - 1, +m1[2]); if (t.getTime() > Date.now() + 864e5) y--; date = iso(y, MON[m1[1].toLowerCase()], +m1[2]);
    }
    if (!date) date = (hint && hint.date) || new Date().toISOString().slice(0, 10);
    // online / logged-in time: "Online 5h 30m", "Logged in: 5 hrs 30 mins", "Login hours 5:30", "5h 30m online"
    let onlineMin = 0, om;
    if ((om = /(?:online|logged\s*in|login|duty|active)[^0-9\n]{0,16}(\d{1,2})\s*(?:hours?|hrs?|h|:)\s*(\d{1,2})?\s*(?:minutes|mins|min|m)?/i.exec(text)) || (om = /(\d{1,2})\s*(?:hours?|hrs?|h)\s*(\d{1,2})?\s*(?:minutes|mins|min|m)?\s*(?:online|logged|login|active)/i.exec(text))) onlineMin = (+om[1]) * 60 + (+om[2] || 0);
    if (onlineMin > 24 * 60) onlineMin = 0;
    const orders = [];
    let bonus = 0, unread = 0, lastTime = null, guessedHours = 0, fixedAmounts = 0; const bonusRaw = [];
    text.split(/\r?\n/).forEach(rawLine => {
      const line = rawLine.trim(); if (!line) return;
      const bm = !findTime(line) && /(bonus|incentive|surge|target|peak)\D{0,16}(?:Rs\.?|₹|INR)?\s*([\d,]+)/i.exec(line);
      if (bm) { const sym = /(?:₹|Rs\.?|INR)/i.test(line); bonusRaw.push({ raw: bm[2], sym }); bonus += money(bm[2]); return; }
      if (/\b(total|earnings?|today|this week|weekly|summary|payout|balance|wallet|lifetime)\b/i.test(line) && !findTime(line)) return; // totals lines are not orders
      let time = findTime(line), guessed = false;
      if (/\b(online|logged\s*in|login|duty|active)\b/i.test(line) && !/\d\s*km/i.test(line)) return;
      const kmM = /(\d+(?:\.\d+)?)\s*(?:km|kms|kilomet\w*)\b/i.exec(line);
      let work = line;
      if (time) work = work.replace(/\d{1,2}[:.]\d{2}\s*(?:am|pm)?/i, ' ');
      if (kmM) work = work.replace(kmM[0], ' ');
      const amounts = [];
      work.replace(/(?:₹|Rs\.?|INR)\s*(-?\s*[\d,]+(?:\.\d+)?)/gi, (m, a, off) => { amounts.push({ v: Math.abs(money(a.replace(/\s/g, ''))), raw: '', sym: true, neg: /-/.test(a) || /-\s*$/.test(work.slice(Math.max(0, off - 2), off)) }); return m; });
      if (amounts.length && (time || kmM)) { // bare "38.00" tokens whose rupee sign was dropped, merged in line order
        const all = [];
        work.replace(/(?:(?:₹|Rs\.?|INR)\s*(-?\s*[\d,]+(?:\.\d+)?))|(?<![\w.#])(\d{1,4}\.\d{2})(?![\w.])/gi, (m, sy, bare, off) => { if (sy) all.push({ off, v: Math.abs(money(sy.replace(/\s/g, ''))), raw: '', sym: true, neg: /-/.test(sy) || /-\s*$/.test(work.slice(Math.max(0, off - 2), off)) }); else if (+bare >= 5 && +bare <= 3000) all.push({ off, v: +bare, raw: bare, sym: false, neg: false }); return m; });
        if (all.length > amounts.length) { amounts.length = 0; all.forEach(a => amounts.push(a)); }
      }
      if (!amounts.length && (time || kmM)) { // rupee sign lost by OCR: any plausible standalone numbers left on an order-looking line
        work.replace(/(?<![\w.])(\d{1,4}(?:\.\d{1,2})?)(?![\w.])/g, (m, a) => { const v = +a; if (v >= 5 && v <= 3000) amounts.push({ v, raw: a, sym: false, neg: false }); return m; });
      }
      if (!time) {
        if (amounts.length && kmM && !/distance|km driven/i.test(line)) { time = lastTime || '13:00'; guessed = true; }
        else { if (kmM && !amounts.length) unread++; return; }
      } else lastTime = time;
      if (!amounts.length) { if (kmM || /₹|rs\b/i.test(line) || line.replace(/\D/g, '').length >= 4) unread++; return; }
      const zone = firstZone(line) || (hint && hint.zone) || 'Unknown'; // the pickup area is the one named first
      const km = kmM ? +kmM[1] : 0;
      const fix = a => { // "264.00" for "₹64.00": only when the rider could not have been paid that per km
        if (a.sym || !km || !/^[27]\d{2,3}(\.\d+)?$/.test(a.raw || '')) return a.v;
        const c = +a.raw.slice(1);
        if (a.v / km > 45 && c >= 10 && c / km <= 45) { fixedAmounts++; return c; }
        return a.v;
      };
      amounts[0].v = fix(amounts[0]);
      const o = { hour: toHour(time), zone, km, pay: amounts[0].v, incentive: 0, deduction: 0, durMin: Math.round(10 + (km || 3) * 3.4) };
      amounts.slice(1).forEach(a => { if (a.neg || /penalt|fee|fine|cut|commission|deduct/i.test(line)) o.deduction += a.v; else o.incentive += a.v; });
      if (guessed) guessedHours++;
      orders.push(o);
    });
    if (fixedAmounts) bonusRaw.forEach(b => { if (!b.sym && /^[27]\d{2}$/.test(b.raw)) { bonus += +b.raw.slice(1) - +b.raw; fixedAmounts++; } });
    let summary = false;
    if (!orders.length) { // a totals-only screen ("Today's earnings Rs 1,234 · 12 trips · 8 h online")
      const tot = [];
      text.replace(/(?:total|today'?s?|earnings?|earned|payout|net|income)[^\n\d₹]{0,24}(?:₹|Rs\.?|INR)?\s*([\d,]{2,7}(?:\.\d+)?)/gi, (m, a) => { const v = money(a); if (v >= 50 && v <= 30000) tot.push(v); return m; });
      if (!tot.length) text.replace(/(?:₹|Rs\.?|INR)\s*([\d,]{2,7}(?:\.\d+)?)/gi, (m, a) => { const v = money(a); if (v >= 50 && v <= 30000) tot.push(v); return m; });
      if (tot.length) {
        const total = Math.max.apply(null, tot);
        const tm = /\b(\d{1,3})[ \t]*(?:trips?|orders?|deliver(?:y|ies)|rides?|jobs?|tasks?)\b/i.exec(text) || /\b(?:total\s+)?(?:trips?|orders?|deliver(?:y|ies)|rides?)\s*[:\-]\s*(\d{1,3})\b/i.exec(text);
        const n = Math.min(80, Math.max(1, tm ? +tm[1] : 1));
        const kms = []; text.replace(/(\d+(?:\.\d+)?)\s*(?:km|kms)\b/gi, (m, a) => { kms.push(+a); return m; });
        const tkm = kms.length ? Math.max.apply(null, kms) : 0;
        const per = Math.round((total / n) * 100) / 100, perKm = tkm ? Math.round((tkm / n) * 10) / 10 : 3;
        for (let i = 0; i < n; i++) orders.push({ hour: toHour(lastTime || '13:00'), zone: (hint && hint.zone) || 'Unknown', km: perKm, pay: per, incentive: 0, deduction: 0, durMin: Math.round(10 + perKm * 3.4) });
        summary = true; guessedHours = n; unread = 0;
      }
    }
    return { id: 'ocr-' + Math.random().toString(36).slice(2, 7), date, platform, onlineMin, bonus, orders, unread, guessedHours, summary, fixedAmounts, source: 'ocr' };
  }

  /** Card-style screens put one order over several lines (id / time / distance / amount). Glue each card into one line:
   *  a card starts at a line holding a clock time and ends before the next one (or before a totals line). */
  function mergeBlocks(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = [];
    const header = /\b(online|logged|login|duty|active|updated|as of|last sync)\b/i, stop = /\b(total|wallet|balance|weekly|this week|lifetime|summary|payout summary)\b/i;
    let cur = null;
    lines.forEach(l => {
      const isStart = findTime(l) && !header.test(l);
      if (stop.test(l) && !findTime(l)) { if (cur) out.push(cur); cur = null; out.push(l); return; }
      if (isStart) { if (cur) out.push(cur); cur = l; return; }
      if (cur && !/^(order\s*#?\s*\d+|ride\s*\d+|trip\s*\d+)$/i.test(l) && !/\b(bonus|incentive|surge|target|peak)\b/i.test(l) || (cur && /\b(incentive)\b/i.test(l) && !/total/i.test(l))) cur += ' ' + l;
      else { if (cur) out.push(cur); cur = null; out.push(l); }
    });
    if (cur) out.push(cur);
    return out.join('\n');
  }

  function parseText(rawText, hint) {
    const text = cleanOcr(rawText);
    const a = parseCore(text, hint);
    const b = parseCore(mergeBlocks(text), hint);                  // card-per-order layout
    // prefer the reading that finds more orders with fewer guessed hours and unreadable lines
    const q = r => (r.summary ? 0 : r.orders.length * 10) - r.guessedHours * 6 - r.unread * 4 - (r.summary ? 15 : 0);
    return q(b) > q(a) ? b : a;
  }

  const score = r => r.orders.length * 10 - r.unread * 2 - (r.summary ? 5 : 0) + (r.onlineMin ? 3 : 0) + (r.date ? 0 : -1);
  async function extractWithOCR(dataUrls, onProgress) {
    const out = []; let unread = 0;
    for (let i = 0; i < dataUrls.length; i++) {
      const prog = (p, k) => onProgress && onProgress((i + (k + p) / 3) / dataUrls.length);
      const clean = await preprocess(dataUrls[i]);
      let best = parseText(await ocr(clean, p => prog(p, 0), 6));
      if (best.orders.length < 4 || best.unread > 0) { // weak first reading: try other page layouts and the untouched image
        const alt = [[clean, 4], [dataUrls[i], 3]];
        for (let a = 0; a < alt.length; a++) {
          try { const r = parseText(await ocr(alt[a][0], p => prog(p, a + 1), alt[a][1])); if (score(r) > score(best)) best = r; } catch (e) { /* keep best so far */ }
          if (best.orders.length >= 4 && best.unread === 0) break;
        }
      }
      unread += best.unread || 0;
      if (best.orders.length) out.push(best);
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

  root.TWReader = { isDuplicateSession, validateOrder, readScreenshots, readDataUrls, aiAvailable, sha256Text: async t => sha256(new TextEncoder().encode(t)), parseText, cleanOcr, preprocess, ocr, normalizeSession, toHour, sha256, KNOWN_PLATFORMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TWReader;
})(typeof window !== 'undefined' ? window : globalThis);
