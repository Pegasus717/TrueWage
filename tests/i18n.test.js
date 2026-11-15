// Run: node tests/i18n.test.js   Every language must cover every English string, keep the {placeholders} and HTML tags, and name itself.
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const w = {}; vm.runInNewContext(fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8'), { window: w });
const L = w.I18N.L, en = Object.keys(L.en).filter(k => k[0] !== '_');
const ph = s => (String(s).match(/\{(\w+)\}/g) || []).sort().join(), tags = s => (String(s).match(/<\/?\w+>/g) || []).join();
const langs = Object.keys(L);
assert.deepStrictEqual(langs.sort(), ['bn', 'en', 'hi', 'kn', 'mr', 'ta', 'te'], 'expected languages');
for (const code of langs) {
  const d = L[code]; assert.ok(d._name && /^[a-z]{2}-IN$/.test(d._voice), code + ' needs _name and _voice');
  const miss = en.filter(k => !(k in d)), extra = Object.keys(d).filter(k => k[0] !== '_' && !(k in L.en));
  assert.deepStrictEqual(miss, [], code + ' is missing ' + miss.slice(0, 5)); assert.deepStrictEqual(extra, [], code + ' has unknown keys ' + extra.slice(0, 5));
  const bad = en.filter(k => ph(d[k]) !== ph(L.en[k]) || tags(d[k]) !== tags(L.en[k]) || !String(d[k]).trim());
  assert.deepStrictEqual(bad, [], code + ' placeholder/tag/empty mismatch: ' + bad.slice(0, 5));
}
// the script of each language is actually used (catches an English string pasted into the wrong language)
const script = { hi: /[\u0900-\u097F]/, mr: /[\u0900-\u097F]/, te: /[\u0C00-\u0C7F]/, ta: /[\u0B80-\u0BFF]/, kn: /[\u0C80-\u0CFF]/, bn: /[\u0980-\u09FF]/ };
for (const code of Object.keys(script)) {
  const untranslated = en.filter(k => L.en[k] !== '' && !script[code].test(L[code][k]) && /[A-Za-z]{4,}/.test(L.en[k]) && !/^(dm_|tab_)/.test(k) && L[code][k] === L.en[k]);
  assert.ok(untranslated.length <= 12, code + ' has ' + untranslated.length + ' strings still in English: ' + untranslated.slice(0, 8));
}
console.log('i18n OK  ' + langs.length + ' languages x ' + en.length + ' strings, placeholders and tags intact');
