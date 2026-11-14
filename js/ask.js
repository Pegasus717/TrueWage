/* Offline question understanding for "Ask TrueWage". Pure functions (browser + Node).
   Works in English, Hindi, Telugu and Tamil by keyword and number extraction. It never invents numbers:
   it only decides WHICH of the rider's own calculated results to show. */
(function (root) {
  'use strict';

  const DIGITS = [[0x0966, 0x096F], [0x0C66, 0x0C6F], [0x0BE6, 0x0BEF]]; // Devanagari, Telugu, Tamil
  function normalize(q) {
    return String(q || '').toLowerCase().replace(/[०-९౦-౯௦-௯]/g, ch => {
      const c = ch.charCodeAt(0);
      for (const [a, b] of DIGITS) if (c >= a && c <= b) return String(c - a);
      return ch;
    });
  }

  const KM = /^\s*(km|kms|kilometre|kilometer|kilometres|kilometers|किमी|कि\.मी|కి\.?మీ|கி\.?மீ)/;
  const MONEY = /(₹|rs\.?|inr|rupees?|रुपये|रुपए|రూపాయల|ரூபாய்)\s*$/;
  const PCT = /^\s*(%|percent|per cent|प्रतिशत|శాతం|சதவில்|சதவீதம்)/;

  // keyword stems per intent; matched as substrings so Indic scripts work without word boundaries
  const KEYS = {
    order: ['order', 'accept', 'offer', 'worth it', 'should i take', 'take this', 'ऑर्डर', 'लूँ', 'लूं', 'लेना', 'ఆర్డర్', 'తీసుకో', 'ஆர்டர்', 'எடுக்க'],
    fuel: ['petrol price', 'fuel price', 'costlier', 'expensive', 'increase', 'hike', 'diesel', 'महँगा', 'महंगा', 'दाम', 'ధర', 'పెరిగితే', 'விலை', 'உயர்ந்தால்'],
    goal: ['goal', 'target', 'need to earn', 'want to earn', 'to make', 'लक्ष्य', 'चाहिए', 'లక్ష్యం', 'కావాలంటే', 'இலக்கு', 'வேண்டுமானால்'],
    now: ['right now', 'now', 'today', 'tonight', 'go online', 'work now', 'अभी', 'आज', 'ఇప్పుడు', 'ఈరోజు', 'இப்போது', 'இன்று'],
    worst: ['worst', 'avoid', 'skip', 'least', 'lose money', 'losing', 'not worth', 'खराब', 'छोड', 'नुकसान', 'వదిలే', 'నష్ట', 'తక్కువ', 'விடு', 'நஷ்ட', 'குறைவு'],
    best: ['best', 'most profit', 'profitable', 'when should', 'where should', 'which time', 'which area', 'good time', 'busiest', 'सबसे अच्छ', 'कब', 'कहाँ', 'कहां', 'फायदा', 'ఉత్తమ', 'ఎప్పుడు', 'ఎక్కడ', 'లాభం', 'சிறந்த', 'எப்போது', 'எங்கே', 'லாபம்'],
    platform: ['platform', 'swiggy', 'zomato', 'rapido', 'ola', 'uber', 'which app', 'compare', 'प्लेटफ', 'स्विगी', 'ज़ोमैटो', 'जोमैटो', 'యాప్', 'స్విగ్గీ', 'జొమాటో', 'தளம்', 'ஸ்விக்கி', 'சொமேட்டோ'],
    costs: ['cost', 'expense', 'spend', 'where does my money', 'where my money', 'petrol', 'fuel', 'repairs', 'emi', 'खर्च', 'पेट्रोल', 'किस्त', 'ఖర్చు', 'పెట్రోల్', 'செலவு', 'பெட்ரோல்'],
    hours: ['how many hours', 'hours did i', 'how far', 'distance', 'how many km', 'km did i', '\u0915\u093f\u0924\u0928\u0947 \u0918\u0902\u091f\u0947', '\u0915\u093f\u0924\u0928\u0940 \u0926\u0942\u0930', '\u0926\u0942\u0930\u0940', '\u0c0e\u0c28\u0c4d\u0c28\u0c3f \u0c17\u0c02\u0c1f\u0c32\u0c41', '\u0c0e\u0c02\u0c24 \u0c26\u0c42\u0c30\u0c02', '\u0c26\u0c42\u0c30\u0c02', '\u0b8e\u0ba4\u0bcd\u0ba4\u0ba9\u0bc8 \u0bae\u0ba3\u0bbf', '\u0b8e\u0bb5\u0bcd\u0bb5\u0bb3\u0bb5\u0bc1 \u0ba4\u0bc2\u0bb0\u0bae\u0bcd', '\u0ba4\u0bc2\u0bb0\u0bae\u0bcd'],
    plan: ['plan my day', 'my plan', 'schedule', 'plan', '\u092a\u094d\u0932\u093e\u0928', '\u092f\u094b\u091c\u0928\u093e', '\u0c2a\u0c4d\u0c32\u0c3e\u0c28\u0c4d', '\u0ba4\u0bbf\u0b9f\u0bcd\u0b9f\u0bae\u0bcd'],
    week: ['this week', 'last week', 'weekly', 'week', '\u0939\u092b\u093c\u094d\u0924\u093e', '\u0939\u092b\u094d\u0924\u093e', '\u0c35\u0c3e\u0c30\u0c02', '\u0bb5\u0bbe\u0bb0\u0bae\u0bcd'],
    hourly: ['per hour', 'hourly', 'an hour', 'each hour', '/hour', 'घंटा', 'घंटे', 'గంట', 'மணி'],
    income: ['earn', 'made', 'make', 'income', 'kept', 'keep', 'take home', 'take-home', 'cash', 'salary', 'profit', 'कमाई', 'कमाया', 'बचा', 'हाथ', 'సంపాదన', 'మిగిలింది', 'చేతిలో', 'வருமானம்', 'மிஞ்சி', 'கையில்']
  };
  const PRIORITY = ['order', 'fuel', 'plan', 'week', 'goal', 'now', 'worst', 'best', 'platform', 'costs', 'hours', 'hourly', 'income'];

  /** Pull numbers out of the question and decide what each one means (rupees, km, percent). */
  function numbers(q) {
    const out = [], re = /\d+(?:\.\d+)?/g; let m;
    while ((m = re.exec(q))) {
      const before = q.slice(Math.max(0, m.index - 8), m.index), after = q.slice(m.index + m[0].length, m.index + m[0].length + 12);
      out.push({ v: parseFloat(m[0]), km: KM.test(after), money: MONEY.test(before) || /^\s*(rs|rupees?|₹)/.test(after), pct: PCT.test(after) });
    }
    return out;
  }

  /** Decide the intent and extract any numbers. Returns { intent, pay, km, pct, amount }. */
  function detect(question) {
    const q = normalize(question), nums = numbers(q);
    const score = {};
    Object.keys(KEYS).forEach(k => { score[k] = KEYS[k].reduce((a, w) => a + (q.indexOf(w) >= 0 ? (w.length > 3 ? 2 : 1) : 0), 0); });
    const out = { intent: 'help', pay: null, km: null, pct: null, amount: null, q };
    const kmNum = nums.find(n => n.km), pctNum = nums.find(n => n.pct);
    const rest = nums.filter(n => !n.km && !n.pct);
    const moneyNum = rest.find(n => n.money) || rest[0];
    // an order offer: a distance plus an amount, or an order keyword with two numbers
    if ((kmNum && moneyNum) || (score.order && nums.length >= 2)) {
      const pay = moneyNum ? moneyNum.v : nums[0].v, km = kmNum ? kmNum.v : (nums.find(n => n !== moneyNum) || {}).v;
      if (pay > 0 && km > 0) return Object.assign(out, { intent: 'order', pay, km });
    }
    if (pctNum && (score.fuel || !Object.keys(score).some(k => score[k] > 0 && k !== 'fuel'))) return Object.assign(out, { intent: 'fuel', pct: pctNum.v });
    if (score.fuel && nums.length) return Object.assign(out, { intent: 'fuel', pct: (nums[0].v) });
    if (moneyNum && (score.goal || score.income) && !score.hourly) return Object.assign(out, { intent: 'goal', amount: moneyNum.v });
    let best = null;
    PRIORITY.forEach(k => { if (score[k] > 0 && (best === null || score[k] > score[best])) best = k; });
    if (best) out.intent = best;
    return out;
  }

  const API = { detect, normalize, numbers };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TWAsk = API;
})(typeof window !== 'undefined' ? window : globalThis);
