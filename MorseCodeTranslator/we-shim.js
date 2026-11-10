/*
 * Injected into every web wallpaper HTML served by Morse Code Workbench.
 * Two jobs:
 *   1) Wallpaper Engine API compatibility (applyUserProperties / audio listener ...)
 *      so WE web wallpapers actually receive their project.json settings.
 *   2) Touch system: real mouse/touch pass-through, mouse -> synthetic TouchEvent,
 *      tap ripple, multi-touch reporting and Esc forwarding to the parent app.
 * Runs inside a same-origin iframe; the parent controls it via __MORSE_TOUCH__.
 */
(function () {
  'use strict';
  var boot = window.__MORSE_WP_BOOT__ || {};
  var cfg = { mouseToTouch: true, ripple: true, hud: true, syntheticAudio: true };
  var touchRegistered = false;
  var lastRealTouch = 0;
  var dragging = false;

  function post(type, x, y, points, extra) {
    if (!cfg.hud && type !== 'escape') return;
    try {
      parent.postMessage({
        source: 'morse-wp-touch', type: type, x: Math.round(x || 0), y: Math.round(y || 0),
        points: points || 1, id: boot.id || '', t: Date.now(), extra: extra || null
      }, '*');
    } catch (e) { /* cross-origin parent */ }
  }

  /* --- Detect whether this wallpaper listens to touch events at all --- */
  try {
    var origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (typeof type === 'string' && /^touch(start|move|end|cancel)$/.test(type)) touchRegistered = true;
      return origAdd.call(this, type, fn, opts);
    };
  } catch (e) { /* strict mode / frozen prototype */ }

  /* --- Wallpaper Engine API compatibility --- */
  var audioListeners = [];
  window.wallpaperRegisterAudioListener = function (fn) {
    if (typeof fn === 'function' && audioListeners.indexOf(fn) === -1) audioListeners.push(fn);
  };
  window.wallpaperEngine = window.wallpaperEngine || {
    isPreview: false, version: '2.0', model: 'MorseCodeWorkbench'
  };
  window.wallpaperMediaIntegration = window.wallpaperMediaIntegration || {
    registerStatusListener: function () {}, requestStatus: function () {},
    play: function () {}, pause: function () {}, next: function () {}, previous: function () {}
  };
  window.wallpaperLog = function () {};
  window.wallpaperRegisterMediaStatusListener = function () {};
  window.wallpaperSetProperty = function () {};
  window.wallpaperRequestRandom = function () { return Math.random(); };

  function applyProps() {
    try {
      var L = window.wallpaperPropertyListener;
      if (!L) return;
      if (typeof L.applyUserProperties === 'function') L.applyUserProperties(boot.props || {});
      if (typeof L.applyGeneralProperties === 'function') {
        L.applyGeneralProperties({ volume: { value: 50 }, fps: { value: 60 } });
      }
    } catch (e) { post('shim-error', 0, 0, 1, String(e && e.message || e)); }
  }

  /* Some audio-reactive wallpapers freeze without WE's audio stream. Feed a
     gentle synthetic spectrum so they stay animated (can be switched off). */
  setInterval(function () {
    if (!cfg.syntheticAudio || !audioListeners.length) return;
    var t = Date.now() / 1000, L = [], R = [], i, v;
    for (i = 0; i < 128; i++) {
      v = (Math.sin(t * 2.1 + i * 0.19) * 0.5 + 0.5) * Math.exp(-i / 95) * 0.34;
      L.push(v); R.push(v);
    }
    audioListeners.forEach(function (fn) {
      try { fn.length > 1 ? fn(L, R) : fn(L); } catch (e) { /* ignore */ }
    });
  }, 66);

  /* --- Touch point ripple --- */
  var overlay = null;
  function ensureOverlay() {
    if (overlay) return overlay;
    if (!document.body) return null;
    overlay = document.createElement('div');
    overlay.setAttribute('data-morse-touch-overlay', '1');
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483000;overflow:hidden;';
    document.body.appendChild(overlay);
    return overlay;
  }
  function ripple(x, y) {
    if (!cfg.ripple) return;
    var o = ensureOverlay();
    if (!o) return;
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:' + (x - 14) + 'px;top:' + (y - 14) + 'px;width:28px;height:28px;' +
      'border:2px solid rgba(240,201,138,.9);border-radius:50%;box-shadow:0 0 16px rgba(240,201,138,.6);' +
      'transition:transform .5s ease-out,opacity .5s ease-out;opacity:.95;';
    o.appendChild(d);
    try { requestAnimationFrame(function () { d.style.transform = 'scale(2.6)'; d.style.opacity = '0'; }); }
    catch (e) { d.style.opacity = '0'; }
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 560);
  }

  /* --- Desktop mouse -> synthetic TouchEvent for touch-only wallpapers --- */
  function makeTouch(x, y, target, id) {
    if (typeof Touch !== 'function') return null;
    try {
      return new Touch({
        identifier: id, target: target, clientX: x, clientY: y,
        pageX: x + window.scrollX, pageY: y + window.scrollY,
        screenX: x, screenY: y, radiusX: 2, radiusY: 2, force: 1
      });
    } catch (e) { return null; }
  }
  function fireTouch(type, x, y, target) {
    if (typeof TouchEvent !== 'function' || !target) return;
    var t = makeTouch(x, y, target, 1);
    if (!t) return;
    var active = (type === 'touchend' || type === 'touchcancel') ? [] : [t];
    try {
      target.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true, view: window,
        touches: active, targetTouches: active, changedTouches: [t]
      }));
    } catch (e) { /* unsupported in this browser */ }
  }
  function mouseBlocked() { return Date.now() - lastRealTouch < 800; }

  document.addEventListener('mousedown', function (e) {
    if (mouseBlocked()) return;
    dragging = true;
    ripple(e.clientX, e.clientY);
    post('down', e.clientX, e.clientY, 1);
    if (cfg.mouseToTouch && touchRegistered) fireTouch('touchstart', e.clientX, e.clientY, e.target);
  }, true);
  document.addEventListener('mousemove', function (e) {
    if (!dragging || mouseBlocked()) return;
    post('move', e.clientX, e.clientY, 1);
    if (cfg.mouseToTouch && touchRegistered) fireTouch('touchmove', e.clientX, e.clientY, e.target);
  }, true);
  document.addEventListener('mouseup', function (e) {
    if (!dragging) return;
    dragging = false;
    if (mouseBlocked()) return;
    post('up', e.clientX, e.clientY, 1);
    if (cfg.mouseToTouch && touchRegistered) fireTouch('touchend', e.clientX, e.clientY, e.target);
  }, true);

  ['touchstart', 'touchmove', 'touchend'].forEach(function (type) {
    document.addEventListener(type, function (e) {
      lastRealTouch = Date.now();
      var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
      if (!t) return;
      var n = Math.max((e.touches && e.touches.length) || 0, (e.changedTouches && e.changedTouches.length) || 0, 1);
      ripple(t.clientX, t.clientY);
      post(type, t.clientX, t.clientY, n);
    }, true);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') post('escape', 0, 0, 0);
  }, true);

  /* --- Volume control from the parent (web wallpapers' own audio) --- */
  function setVolume(v) {
    var val = Math.max(0, Math.min(1, Number(v) || 0));
    try {
      var list = document.querySelectorAll('audio, video');
      for (var i = 0; i < list.length; i++) {
        try { list[i].volume = val; if (val > 0) list[i].muted = false; } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  window.__MORSE_TOUCH__ = {
    cfg: cfg,
    configure: function (p) {
      if (p && typeof p === 'object') {
        Object.keys(p).forEach(function (k) { if (k in cfg) cfg[k] = !!p[k]; });
      }
      post('config', 0, 0, 0, cfg);
    },
    setVolume: setVolume,
    applyProperties: applyProps,
    report: post,
    needsTouch: function () { return touchRegistered; }
  };

  function bootNow() {
    ensureOverlay();
    applyProps();
    post('ready', 0, 0, 1, { needsTouch: touchRegistered });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootNow);
  } else {
    bootNow();
  }
  window.addEventListener('load', function () {
    bootNow();
    setTimeout(applyProps, 350);
    setTimeout(applyProps, 1200);
  });
})();
