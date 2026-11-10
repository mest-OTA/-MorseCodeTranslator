/* Self-check: node selftest.js */
'use strict';
const Morse = require('./morse.js');
const Dict = require('./dictionary.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  [OK]   ' + name); }
  else { fail++; console.log('  [FAIL] ' + name + (detail ? '  -> ' + detail : '')); }
}

console.log('\n== Morse table ==');
const letters = Object.keys(Morse.TABLE).filter(k => /^[A-Z]$/.test(k)).length;
const digits = Object.keys(Morse.TABLE).filter(k => /^[0-9]$/.test(k)).length;
check('26 letters', letters === 26, String(letters));
check('10 digits', digits === 10, String(digits));
check('A = .-', Morse.TABLE.A === '.-');
check('SOS prosign present', Morse.PROSIGNS.some(p => p.name === 'SOS'));

console.log('\n== Encode / decode round-trip ==');
const cases = [
  'HELLO WORLD',
  'SOS',
  'MORSE CODE 2026',
  'GOOD MORNING, CHINA!',
  'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG 0123456789'
];
cases.forEach(txt => {
  const enc = Morse.encode(txt);
  const dec = Morse.decode(enc.code);
  check(txt.slice(0, 34), dec.text === txt.toUpperCase() && enc.unknown.length === 0,
    'enc=' + enc.code.slice(0, 50) + ' | dec=' + dec.text.slice(0, 50) + ' | unknown=' + enc.unknown.join(','));
});

console.log('\n== Encode output shape ==');
const hello = Morse.encode('HELLO WORLD');
check('word separator is /', hello.code.includes(' / '), hello.code);
check('visual uses dot/dash glyphs', Morse.visual('.-').includes('·') && Morse.visual('.-').includes('−'));

console.log('\n== Input tolerance ==');
check('unicode dots/dashes', Morse.decode('·− ·−').text === 'AA', Morse.decode('·− ·−').text);
check('long dashes normalized', Morse.decode('— −').text === 'TT', Morse.decode('— −').text);
check('pipe as word separator', Morse.decode('.-| -...').text === 'A B', Morse.decode('.-| -...').text);
check('..... is digit 5', Morse.decode('.....').text === '5', Morse.decode('.....').text);
check('unknown symbol marked', Morse.decode('......').text.includes('□'));

console.log('\n== Timeline ==');
const tl = Morse.timeline('.- -...', 20);
check('timeline has on/off events', tl.length > 0 && tl.some(e => e.on) && tl.some(e => !e.on));
check('unit = 60ms at 20 WPM', Math.round(tl[0].ms) === 60, String(tl[0].ms));

console.log('\n== Offline dictionary fallback ==');
check('zh2en basic', /HELLO/i.test(Dict.translate('你好', 'zh2en')), Dict.translate('你好', 'zh2en'));
check('zh2en sentence', /WORLD/i.test(Dict.translate('你好，世界', 'zh2en')), Dict.translate('你好，世界', 'zh2en'));
check('en2zh basic', Dict.translate('Hello World', 'en2zh').includes('你好'), Dict.translate('Hello World', 'en2zh'));

console.log('\n== Wallpaper Engine core (ported from task #1) ==');
try {
  const WP = require('./wallpaper-core.js');
  check('mimeOf mp4', WP.mimeOf('a.mp4') === 'video/mp4', WP.mimeOf('a.mp4'));
  check('mimeOf html', /text\/html/.test(WP.mimeOf('index.html')), WP.mimeOf('index.html'));
  const st = WP.status();
  check('status returns items', Array.isArray(st.items) && st.items.length > 0, String((st.items || []).length));
  const kinds = {};
  (st.items || []).forEach(i => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
  check('has video + web wallpapers', !!kinds.video && !!kinds.web, JSON.stringify(kinds));
  const sample = st.items.find(i => i.playable && i.src === 'local');
  if (sample) {
    const f = WP.fileFor(sample.id, sample.src, 'media');
    check('fileFor resolves inside project', !!f && f.startsWith(require('path').resolve(sample.dir)), String(f));
    check('fileFor blocks traversal', WP.fileFor(sample.id, sample.src, 'asset', '..\\..\\Windows\\win.ini') === null);
  }
  check('htmlIndexUrl shape', /\/api\/wallpaper\/html\//.test(WP.htmlIndexUrl('abc', 'local', { file: 'index.html' })));
} catch (e) {
  check('wallpaper-core loads', false, e.message);
}

console.log('\n----------------------------------------');
console.log('  PASS: ' + pass + '   FAIL: ' + fail);
console.log('----------------------------------------\n');
process.exit(fail ? 1 : 0);
