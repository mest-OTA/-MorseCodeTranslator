/* Morse code core - shared by browser and Node (no dependencies) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Morse = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var TABLE = {
    A: '.-',    B: '-...',  C: '-.-.',  D: '-..',   E: '.',
    F: '..-.',  G: '--.',   H: '....',  I: '..',    J: '.---',
    K: '-.-',   L: '.-..',  M: '--',    N: '-.',    O: '---',
    P: '.--.',  Q: '--.-',  R: '.-.',   S: '...',   T: '-',
    U: '..-',   V: '...-',  W: '.--',   X: '-..-',  Y: '-.--',
    Z: '--..',
    0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.',
    '.': '.-.-.-', ',': '--..--',  '?': '..--..', "'": '.----.',
    '!': '-.-.--', '/': '-..-.',  '(': '-.--.',  ')': '-.--.-',
    '&': '.-...',  ':': '---...', ';': '-.-.-.', '=': '-...-',
    '+': '.-.-.',  '-': '-....-', '_': '..--.-', '"': '.-..-.',
    '$': '...-..-', '@': '.--.-.'
  };

  var REVERSE = {};
  Object.keys(TABLE).forEach(function (k) { REVERSE[TABLE[k]] = k; });

  var PROSIGNS = [
    { code: '...---...', name: 'SOS', note: '国际求救信号' },
    { code: '.-.-.',     name: 'AR',  note: '报文结束' },
    { code: '...-.-',    name: 'SK',  note: '通信结束' },
    { code: '-...-',     name: 'BT',  note: '段落 / 换行分隔' },
    { code: '.-.-.-',    name: 'AAA', note: '句号（也可用 .-.-.-）' },
    { code: '........',  name: 'HH',  note: '更正 / 错误' }
  ];

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u2018|\u2019/g, "'")
      .replace(/\u201C|\u201D/g, '"')
      .replace(/\u2014|\u2013|\u2212/g, '-')
      .replace(/\u3002/g, '.')
      .replace(/\uFF0C/g, ',')
      .replace(/\uFF1F/g, '?')
      .replace(/\uFF01/g, '!')
      .toUpperCase();
  }

  /** Encode Latin text into Morse. Returns { code, unknown } */
  function encode(text) {
    var clean = normalizeText(text);
    var unknown = [];
    var words = clean.split(/\s+/).filter(Boolean).map(function (word) {
      var letters = [];
      for (var i = 0; i < word.length; i++) {
        var ch = word[i];
        if (TABLE[ch]) letters.push(TABLE[ch]);
        else if (unknown.indexOf(ch) === -1) unknown.push(ch);
      }
      return letters.join(' ');
    }).filter(Boolean);
    return { code: words.join(' / '), unknown: unknown };
  }

  /** Normalize user-typed Morse (supports . - / dot dash and unicode variants) */
  function normalizeMorse(code) {
    return String(code || '')
      .replace(/[\u00B7\u2022\u2219\u25CF\uFF0E\u3007\u2027]/g, '.')
      .replace(/[\u2014\u2013\u2212\uFF0D\uFF3F\u2015_]/g, '-')
      .replace(/[\uFF0F|]/g, '/')
      .replace(/\r/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /** Decode Morse into Latin text. Returns { text, unknown } */
  function decode(code) {
    var clean = normalizeMorse(code);
    var unknown = [];
    var words = clean.split(/\s*\/\s*/).filter(function (w) { return w.trim().length; });
    var out = words.map(function (word) {
      return word.trim().split(/\s+/).map(function (sym) {
        var s = sym.replace(/[^.\-]/g, '');
        if (!s) return '';
        if (REVERSE[s]) return REVERSE[s];
        if (unknown.indexOf(sym) === -1) unknown.push(sym);
        return '□';
      }).join('');
    });
    return { text: out.join(' '), unknown: unknown };
  }

  /** Pretty display: dots as ·, dashes as − */
  function visual(code) {
    return String(code || '').replace(/\./g, '·').replace(/-/g, '−');
  }

  /**
   * Build an on/off timeline for audio + lamp animation.
   * Standard PARIS timing: unit(ms) = 1200 / WPM.
   */
  function timeline(code, wpm) {
    var unit = 1200 / Math.max(5, Math.min(60, Number(wpm) || 20));
    var clean = normalizeMorse(code);
    var events = [];
    var words = clean.split(/\s*\/\s*/).filter(Boolean);

    words.forEach(function (word, wi) {
      var letters = word.trim().split(/\s+/).filter(Boolean);
      letters.forEach(function (sym, li) {
        var s = sym.replace(/[^.\-]/g, '');
        for (var i = 0; i < s.length; i++) {
          events.push({ on: true, ms: unit * (s[i] === '.' ? 1 : 3) });
          if (i < s.length - 1) events.push({ on: false, ms: unit });
        }
        if (li < letters.length - 1) events.push({ on: false, ms: unit * 3 });
      });
      if (wi < words.length - 1) events.push({ on: false, ms: unit * 7 });
    });
    return events;
  }

  return {
    TABLE: TABLE,
    REVERSE: REVERSE,
    PROSIGNS: PROSIGNS,
    encode: encode,
    decode: decode,
    visual: visual,
    timeline: timeline,
    normalizeMorse: normalizeMorse
  };
});
