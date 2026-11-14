/* Place detection for Hyderabad and Bengaluru. Pure functions (browser + Node), no network, no map service.
   Three ways a rider's area is found, from most to least reliable:
     1. GPS: nearest known area centroid (only while a shift is tracked; only minutes per area are stored, never the route)
     2. Address text on a screenshot: alias match, prefix match for truncated addresses ("Cherlapa..."), then fuzzy match for OCR typos
     3. Nothing found: the area stays "Unknown" and is never guessed.
   Centroids are approximate (about 1 km); they are used to pick the nearest named area, not to navigate. */
(function (root) {
  'use strict';

  // [name, city, lat, lon, extra aliases]
  const RAW = [
    // Hyderabad
    ['Madhapur', 'Hyderabad', 17.4483, 78.3915, ['madhapur', 'madapur', 'hi-tec', 'image hospital']],
    ['Gachibowli', 'Hyderabad', 17.4401, 78.3489, ['gachibowli', 'gachibowly', 'gachibouli', 'financial district', 'nanakramguda']],
    ['Kondapur', 'Hyderabad', 17.4600, 78.3640, ['kondapur', 'kothaguda']],
    ['Hitech City', 'Hyderabad', 17.4435, 78.3772, ['hitech city', 'hitec city', 'hi-tech city', 'hitechcity']],
    ['Banjara Hills', 'Hyderabad', 17.4156, 78.4347, ['banjara hills', 'banjarahills', 'banjara']],
    ['Jubilee Hills', 'Hyderabad', 17.4326, 78.4071, ['jubilee hills', 'jubileehills']],
    ['Ameerpet', 'Hyderabad', 17.4375, 78.4483, ['ameerpet', 'sr nagar', 'sanjeeva reddy nagar']],
    ['Begumpet', 'Hyderabad', 17.4440, 78.4676, ['begumpet', 'begumpeta']],
    ['Secunderabad', 'Hyderabad', 17.4399, 78.4983, ['secunderabad', 'secundrabad', 'sec-bad', 'trimulgherry', 'paradise']],
    ['Bowenpally', 'Hyderabad', 17.4730, 78.4780, ['bowenpally', 'bowenpalli', 'boinpally', 'boianpally']],
    ['Alwal', 'Hyderabad', 17.5030, 78.5070, ['alwal']],
    ['Kukatpally', 'Hyderabad', 17.4948, 78.3996, ['kukatpally', 'kukatpalli', 'kphb', 'kp hb', 'moosapet']],
    ['Miyapur', 'Hyderabad', 17.4967, 78.3535, ['miyapur', 'miyapura']],
    ['Nizampet', 'Hyderabad', 17.5170, 78.3830, ['nizampet', 'nizampeta']],
    ['Bachupally', 'Hyderabad', 17.5440, 78.3700, ['bachupally', 'bachupalli']],
    ['Uppal', 'Hyderabad', 17.3984, 78.5583, ['uppal', 'habsiguda', 'nacharam', 'tarnaka']],
    ['Cherlapally', 'Hyderabad', 17.4850, 78.5800, ['cherlapally', 'cherlapalli', 'cherlapalle', 'cherlapa', 'ecil', 'kushaiguda']],
    ['Jawahar Nagar', 'Hyderabad', 17.4890, 78.5400, ['jawahar nagar', 'jawaharnagar', 'jawahar', 'srt']],
    ['Dilsukhnagar', 'Hyderabad', 17.3688, 78.5247, ['dilsukhnagar', 'dilsukh nagar', 'dsnr', 'kothapet', 'chaitanyapuri']],
    ['LB Nagar', 'Hyderabad', 17.3457, 78.5522, ['lb nagar', 'l b nagar', 'lal bahadur nagar', 'vanasthalipuram', 'hayathnagar']],
    ['Mehdipatnam', 'Hyderabad', 17.3950, 78.4400, ['mehdipatnam', 'mehidipatnam', 'tolichowki', 'masab tank']],
    ['Charminar', 'Hyderabad', 17.3616, 78.4747, ['charminar', 'old city', 'abids', 'nampally', 'koti']],
    ['Manikonda', 'Hyderabad', 17.4010, 78.3880, ['manikonda', 'puppalaguda', 'narsingi', 'tellapur']],
    ['Shamshabad', 'Hyderabad', 17.2543, 78.4300, ['shamshabad', 'airport']],
    // Bengaluru
    ['Koramangala', 'Bengaluru', 12.9352, 77.6245, ['koramangala', 'kormangala']],
    ['Indiranagar', 'Bengaluru', 12.9784, 77.6408, ['indiranagar', 'indira nagar']],
    ['HSR Layout', 'Bengaluru', 12.9116, 77.6474, ['hsr layout', 'hsr', 'hsrlayout']],
    ['Marathahalli', 'Bengaluru', 12.9591, 77.6974, ['marathahalli', 'marathalli', 'marathahalli bridge']],
    ['Whitefield', 'Bengaluru', 12.9698, 77.7500, ['whitefield', 'itpl', 'kadugodi']],
    ['Jayanagar', 'Bengaluru', 12.9250, 77.5938, ['jayanagar', 'jaya nagar']],
    ['Hebbal', 'Bengaluru', 13.0358, 77.5970, ['hebbal', 'hebbala']],
    ['Electronic City', 'Bengaluru', 12.8452, 77.6602, ['electronic city', 'electronics city', 'e-city']],
    ['BTM Layout', 'Bengaluru', 12.9166, 77.6101, ['btm layout', 'btm', 'btm 2nd stage']],
    ['JP Nagar', 'Bengaluru', 12.9063, 77.5857, ['jp nagar', 'j p nagar', 'jayaprakash nagar']],
    ['Bellandur', 'Bengaluru', 12.9304, 77.6784, ['bellandur', 'bellandoor', 'sarjapur road']],
    ['MG Road', 'Bengaluru', 12.9757, 77.6094, ['mg road', 'm g road', 'brigade road', 'church street', 'shivajinagar']],
    ['Yelahanka', 'Bengaluru', 13.1007, 77.5963, ['yelahanka', 'yelahanka new town']],
    ['Malleshwaram', 'Bengaluru', 13.0031, 77.5643, ['malleshwaram', 'malleswaram']],
    ['Rajajinagar', 'Bengaluru', 12.9910, 77.5520, ['rajajinagar', 'rajaji nagar']],
    ['Banashankari', 'Bengaluru', 12.9255, 77.5468, ['banashankari', 'banashankri']],
    ['Domlur', 'Bengaluru', 12.9610, 77.6387, ['domlur']],
    ['KR Puram', 'Bengaluru', 13.0072, 77.6957, ['kr puram', 'k r puram', 'krishnarajapuram', 'ramamurthy nagar']]
  ];

  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-෿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const PLACES = RAW.map(([name, city, lat, lon, al]) => ({ name, city, lat, lon, aliases: Array.from(new Set([norm(name)].concat(al.map(norm)))) }));
  const BY_NAME = {}; PLACES.forEach(p => { BY_NAME[p.name] = p; });
  const ALIAS = []; PLACES.forEach(p => p.aliases.forEach(a => ALIAS.push([a, p])));
  ALIAS.sort((a, b) => b[0].length - a[0].length);                       // longest alias first: "banjara hills" before "banjara"
  const STOP = new Set(['road', 'street', 'near', 'opposite', 'colony', 'nagar', 'layout', 'phase', 'lane', 'number', 'ward', 'hyderabad', 'bengaluru', 'bangalore', 'telangana', 'karnataka', 'bus', 'stop', 'complex', 'apartments', 'residency', 'main', 'cross', 'floor', 'block']);

  function lev(a, b) {
    if (a === b) return 0; if (Math.abs(a.length - b.length) > 2) return 3;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }

  /** Find a known area inside free text such as a pickup address. Returns {zone, city, how} or null.
   *  how: 'alias' (named in the text), 'prefix' (truncated word such as "Cherlapa..."), 'fuzzy' (one or two OCR typos). */
  function fromText(text) {
    const t = ' ' + norm(text) + ' ';
    if (t.trim().length < 3) return null;
    let hit = null;                                                       // earliest mention wins ("Old Bowenpally ... Secunderabad" starts in Bowenpally)
    for (const [a, p] of ALIAS) { if (a.length < 3) continue; const i = t.indexOf(' ' + a + ' '); if (i >= 0 && (!hit || i < hit.i || (i === hit.i && a.length > hit.len))) hit = { i, len: a.length, p }; }
    if (hit) return { zone: hit.p.name, city: hit.p.city, how: 'alias' };
    const words = t.trim().split(' ').filter(w => w.length >= 5 && !STOP.has(w) && !/\d/.test(w));
    for (const w of words) {                                              // truncated by the app: "cherlapa", "secunderab"
      for (const [a, p] of ALIAS) { const first = a.split(' ')[0]; if (first.length >= 6 && w.length >= 6 && first.startsWith(w) && w.length < first.length) return { zone: p.name, city: p.city, how: 'prefix' }; }
    }
    for (const w of words) {                                              // one or two characters wrong
      if (w.length < 7) continue;
      for (const [a, p] of ALIAS) { const first = a.split(' ')[0]; if (first.length >= 7 && lev(w, first) <= (w.length >= 9 ? 2 : 1)) return { zone: p.name, city: p.city, how: 'fuzzy' }; }
    }
    return null;
  }

  /** Canonical area name for a zone string from an AI or OCR reader; unknown names are kept (cleaned) instead of dropped. */
  function canon(zone) {
    const z = String(zone || '').trim();
    if (!z || /^unknown$/i.test(z)) return { zone: 'Unknown', city: null, known: false };
    const m = fromText(z);
    if (m) return { zone: m.zone, city: m.city, known: true, how: m.how };
    return { zone: z.replace(/[<>]/g, '').slice(0, 40), city: null, known: false };
  }

  const rad = d => d * Math.PI / 180;
  function distKm(la1, lo1, la2, lo2) {
    const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  }
  /** Nearest known area to a GPS position, or null when it is more than maxKm from every centroid (outside the covered cities). */
  function nearest(lat, lon, maxKm) {
    let best = null;
    PLACES.forEach(p => { const d = distKm(lat, lon, p.lat, p.lon); if (!best || d < best.km) best = { zone: p.name, city: p.city, km: d }; });
    return best && best.km <= (maxKm || 6) ? best : null;
  }
  /** Dominant area from accumulated minutes {zone: minutes}; needs at least 10 minutes and 40% of the tracked time. */
  function dominant(zoneMin) {
    const e = Object.entries(zoneMin || {}).sort((a, b) => b[1] - a[1]); if (!e.length) return null;
    const total = e.reduce((a, x) => a + x[1], 0);
    return e[0][1] >= 10 && e[0][1] / total >= 0.4 ? { zone: e[0][0], share: e[0][1] / total } : null;
  }
  function cityOf(zone) { const p = BY_NAME[zone]; return p ? p.city : null; }
  function zonesIn(city) { return PLACES.filter(p => !city || p.city === city).map(p => p.name); }

  const API = { PLACES, fromText, canon, nearest, dominant, distKm, cityOf, zonesIn, norm };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TWPlaces = API;
})(typeof window !== 'undefined' ? window : globalThis);
