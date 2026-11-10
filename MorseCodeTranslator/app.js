/* Morse Code Workbench - UI logic (browser)
 * Dynamic-wallpaper part is a port of the user's first task (D:\SteamLens\assets\app.js):
 * slWallpaperLayer / applyWallpaper / wpTouchMode / wp-focus / wpWakeIframe / wireWebAudio.
 */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var apiRoot = '';
  var state = { dir: 'zh2morse', lastCode: '', lastEnglish: '', lastChinese: '', wpm: 20 };
  var wallpaperMode = new URLSearchParams(location.search).get('wallpaper') === '1';

  /* wallpaper state */
  var WP = null, WP_APPLIED_KEY = '', WP_UI_DRAG = false, WP_LOOKUP = null;
  var TOUCH = { count: 0, last: '等待触摸…', points: 1 };

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    var el = $('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('show'); }, 1900);
  }
  async function api(path, body) {
    var init = {};
    if (body) init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    var r = await fetch(apiRoot + path, init);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  function post(path, obj) { return api(path, obj); }
  function copyText(text) {
    var t = String(text || '');
    if (!t || t === '—') { toast('这里还没有内容'); return; }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, function () { legacyCopy(t); });
    } else legacyCopy(t);
  }
  function legacyCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('复制失败，请手动选择'); }
    document.body.removeChild(ta);
  }

  /* ================================================================ *
   * WALLPAPER MODE (Wallpaper Engine web wallpaper from task #1)
   * ================================================================ */
  var wpTimers = [], wpStamp = '';
  function clearWpTimers() { wpTimers.forEach(clearTimeout); wpTimers = []; }
  function wpAnimate(code, wpm) {
    clearWpTimers();
    var events = Morse.timeline(code, wpm || 20);
    if (!events.length) return;
    var delay = 0;
    events.forEach(function (ev) {
      (function (on, at) {
        wpTimers.push(setTimeout(function () {
          $('wpLamp').classList.toggle('on', on);
          $('wpGlow').classList.toggle('on', on);
        }, at));
      })(ev.on, delay);
      delay += ev.ms;
    });
    wpTimers.push(setTimeout(function () { wpAnimate(code, wpm); }, delay + 1600));
  }
  function renderWallpaper(s) {
    $('wpCode').textContent = Morse.visual(s.morse || '') || '等待翻译…';
    $('wpEn').textContent = s.english || '—';
    $('wpZh').textContent = s.chinese || '—';
    $('wpStamp').textContent = s.preset ? '示例' : '更新于 ' + new Date(s.updatedAt).toLocaleTimeString('zh-CN');
    wpAnimate(s.morse || '', s.wpm || 20);
  }
  function initWallpaper() {
    document.body.classList.add('wallpaper-mode');
    $('wallpaperView').hidden = false;
    var clock = function () { $('wpTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false }); };
    clock(); setInterval(clock, 1000);
    var poll = async function () {
      try {
        var s = await api('/api/state');
        if (s.updatedAt !== wpStamp) { wpStamp = s.updatedAt; renderWallpaper(s); }
      } catch (e) { /* server not ready */ }
    };
    poll(); setInterval(poll, 1800);
  }

  /* ================================================================ *
   * MORSE AUDIO
   * ================================================================ */
  var audioCtx = null, playTimers = [], activeOsc = [], playing = false;
  function setLamp(on) {
    var l = $('lamp'); if (l) l.classList.toggle('on', on);
    var st = $('playStatus'); if (st && playing) st.textContent = on ? '发报中 · 划/点' : '间隔';
  }
  function stopPlay() {
    playTimers.forEach(clearTimeout); playTimers = [];
    activeOsc.forEach(function (o) { try { o.stop(); } catch (e) {} });
    activeOsc = []; playing = false; setLamp(false);
    $('playBtn').disabled = false; $('stopBtn').disabled = true;
  }
  function playMorse(code, wpm) {
    stopPlay();
    var events = Morse.timeline(code, wpm);
    if (!events.length) { toast('没有可播放的电码'); return; }
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { toast('当前浏览器不支持音频'); return; }
      audioCtx = audioCtx || new Ctx(); audioCtx.resume();
    } catch (e) { toast('音频初始化失败'); return; }
    playing = true;
    $('playBtn').disabled = true; $('stopBtn').disabled = false;
    $('playStatus').textContent = '发报中';
    var now = audioCtx.currentTime + 0.08, t = 0;
    events.forEach(function (ev) {
      if (ev.on) {
        var osc = audioCtx.createOscillator(), gain = audioCtx.createGain(), dur = ev.ms / 1000;
        osc.type = 'sine'; osc.frequency.value = 620;
        gain.gain.setValueAtTime(0, now + t);
        gain.gain.linearRampToValueAtTime(0.20, now + t + 0.006);
        gain.gain.setValueAtTime(0.20, now + t + Math.max(0.01, dur - 0.006));
        gain.gain.linearRampToValueAtTime(0, now + t + dur);
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now + t); osc.stop(now + t + dur + 0.01);
        activeOsc.push(osc);
      }
      t += ev.ms / 1000;
    });
    var delay = 0;
    events.forEach(function (ev) {
      (function (on, at) { playTimers.push(setTimeout(function () { setLamp(on); }, at)); })(ev.on, delay);
      delay += ev.ms;
    });
    playTimers.push(setTimeout(function () { stopPlay(); $('playStatus').textContent = '播放完毕'; }, delay + 80));
  }

  /* ================================================================ *
   * TRANSLATION PIPELINE
   * ================================================================ */
  function updateDirectionUI() {
    var zh = state.dir === 'zh2morse';
    document.querySelectorAll('.seg').forEach(function (b) { b.classList.toggle('active', b.dataset.dir === state.dir); });
    $('inputTitle').textContent = zh ? '输入中文' : '输入摩斯电码';
    $('inputText').placeholder = zh ? '在这里输入要发送的中文内容…' : '例如：.... . .-.. .-.. --- / .-- --- .-. .-.. -..';
    $('step1Name').textContent = zh ? '原文 · 中文' : '原文 · 摩斯电码';
    $('step3Name').textContent = zh ? '结果 · 摩斯电码' : '结果 · 中文译文';
    $('arrow2Label').textContent = zh ? '编码' : '解码';
    $('samples').style.display = zh ? '' : 'none';
    $('step3Text').classList.toggle('morse', zh);
  }
  function setStep(id, text, raw) {
    var el = $(id); el.textContent = text || '—'; el.dataset.raw = raw || text || '';
  }
  function showWarn(msg) {
    var box = $('warnBox');
    if (!msg) { box.hidden = true; return; }
    box.textContent = msg; box.hidden = false;
  }
  async function remoteTranslate(text, direction) {
    if ($('offlineOnly') && $('offlineOnly').checked) {
      return { text: Dict.translate(text, direction), engine: '离线词典（手动指定，文字未联网）', online: false };
    }
    try { return await api('/api/translate', { text: text, direction: direction }); }
    catch (e) { return { text: Dict.translate(text, direction), engine: '离线词典（未启动本地服务）', online: false }; }
  }
  function renderBars(code) {
    var box = $('morseBars'); box.innerHTML = '';
    var s = String(code || '').slice(0, 500), frag = document.createDocumentFragment();
    for (var i = 0; i < s.length; i++) {
      var c = s[i], el = document.createElement('i');
      if (c === '.') el.className = 'dot';
      else if (c === '-') el.className = 'dash';
      else if (c === '/') el.className = 'wordgap';
      else if (c === ' ') el.className = 'gap';
      else continue;
      frag.appendChild(el);
    }
    box.appendChild(frag);
  }
  async function runTranslation() {
    var input = $('inputText').value.trim();
    if (!input) { toast('先输入点内容'); return; }
    var btn = $('runBtn'); btn.disabled = true;
    var t0 = Date.now(); showWarn('');
    $('pipelineTime').textContent = '处理中…';
    try {
      var english, chinese, morseCode, r, warn = [];
      if (state.dir === 'zh2morse') {
        r = await remoteTranslate(input, 'zh2en');
        english = r.text || input;
        var enc = Morse.encode(english);
        morseCode = enc.code; chinese = input;
        setStep('step1Text', input, input);
        setStep('step2Text', english, english);
        setStep('step3Text', Morse.visual(morseCode), morseCode);
        if (enc.unknown.length) warn.push('这些字符没有对应的摩斯码，已跳过：' + enc.unknown.join(' '));
        if (!r.online) warn.push('当前使用离线词典，联网后译文会更准确。');
      } else {
        var dec = Morse.decode(input);
        english = dec.text;
        if (!english) { toast('没识别出有效电码'); return; }
        r = await remoteTranslate(english, 'en2zh');
        chinese = r.text || english;
        morseCode = Morse.normalizeMorse(input);
        setStep('step1Text', Morse.visual(morseCode), morseCode);
        setStep('step2Text', english, english);
        setStep('step3Text', chinese, chinese);
        if (dec.unknown.length) warn.push('无法识别的电码符号（显示为 □）：' + dec.unknown.join(' '));
        if (!r.online) warn.push('当前使用离线词典，联网后译文会更准确。');
        warn.push('提示：摩斯码里只有英文字母，反向得到的是「意思」，不保证还原成原来的中文字句。');
      }
      $('engineNotice').textContent = '翻译通道：' + r.engine + (r.cached ? ' · 命中缓存' : '') +
        (r.online ? '　· 在线翻译会把输入文字发给免费翻译服务' : '');
      state.lastCode = morseCode; state.lastEnglish = english; state.lastChinese = chinese;
      var out = $('morseOutput');
      out.textContent = Morse.visual(morseCode) || '（无有效电码）';
      out.classList.toggle('empty', !morseCode);
      renderBars(morseCode);
      showWarn(warn.length ? warn.join('　') : '');
      try {
        await api('/api/state', { morse: morseCode, english: english, chinese: chinese, direction: state.dir, wpm: state.wpm });
      } catch (e) { /* optional */ }
    } catch (err) {
      showWarn('出错了：' + (err && err.message || err));
    } finally {
      btn.disabled = false;
      $('pipelineTime').textContent = (Date.now() - t0) + ' ms';
    }
  }

  /* ================================================================ *
   * CODE TABLE
   * ================================================================ */
  function buildCodeTable() {
    var keys = Object.keys(Morse.TABLE);
    var groups = [
      { name: '字母 A–Z', keys: keys.filter(function (k) { return /^[A-Z]$/.test(k); }) },
      { name: '数字 0–9', keys: keys.filter(function (k) { return /^[0-9]$/.test(k); }) },
      { name: '标点符号', keys: keys.filter(function (k) { return !/^[A-Z0-9]$/.test(k); }) }
    ];
    var host = $('codeTable'); host.innerHTML = '';
    groups.forEach(function (g) {
      var wrap = document.createElement('div');
      var h = document.createElement('div'); h.className = 'group-title'; h.textContent = g.name;
      wrap.appendChild(h);
      var grid = document.createElement('div'); grid.className = 'code-grid';
      g.keys.forEach(function (k) {
        var cell = document.createElement('button');
        cell.className = 'code-cell'; cell.title = '点击填入输入框';
        cell.innerHTML = '<b></b><span></span>';
        cell.querySelector('b').textContent = k;
        cell.querySelector('span').textContent = Morse.visual(Morse.TABLE[k]);
        cell.addEventListener('click', function () {
          if (state.dir !== 'morse2zh') { state.dir = 'morse2zh'; updateDirectionUI(); }
          switchTab('translate');
          var ta = $('inputText');
          ta.value = (ta.value.trim() + ' ' + Morse.TABLE[k]).trim();
          $('charCount').textContent = ta.value.length + ' 字';
          ta.focus(); toast('已填入 ' + k + ' = ' + Morse.TABLE[k]);
        });
        grid.appendChild(cell);
      });
      wrap.appendChild(grid); host.appendChild(wrap);
    });
    var ps = $('prosigns');
    Morse.PROSIGNS.forEach(function (p) {
      var d = document.createElement('div'); d.className = 'prosign';
      d.innerHTML = '<b></b><span class="pn"></span><p></p>';
      d.querySelector('b').textContent = Morse.visual(p.code);
      d.querySelector('.pn').textContent = p.name;
      d.querySelector('p').textContent = p.note;
      ps.appendChild(d);
    });
  }

  /* ================================================================ *
   * DYNAMIC WALLPAPER (ported from SteamLens)
   * ================================================================ */
  function wpPreviewUrl(it) {
    if (it.src === 'url') return '';
    return '/api/wallpaper/preview?id=' + encodeURIComponent(it.id) + '&src=' + encodeURIComponent(it.src);
  }
  function wpMediaSrc(it) {
    if (it.src === 'url') {
      var u = String(it.file || '');
      if (/^data:/i.test(u)) return u;
      return '/api/wallpaper/proxy?url=' + encodeURIComponent(u);
    }
    var f = it.file || it.preview;
    if (!f) return wpPreviewUrl(it);
    if (it.kind === 'web') {
      return '/api/wallpaper/html/' + encodeURIComponent(it.id) + '/' + it.src + '/' + encodeURIComponent(f);
    }
    if (it.kind === 'scene' || !it.playable) return wpPreviewUrl(it);
    return '/api/wallpaper/media?id=' + encodeURIComponent(it.id) + '&src=' + encodeURIComponent(it.src);
  }
  function wpKindLabel(k) {
    return ({ video: '视频', web: '网页', image: '图片', scene: 'Scene', other: '其他' })[k] || k;
  }
  function customWebItem() {
    var u = (WP && WP.config && WP.config.customUrl) || '';
    if (!u) return null;
    return { id: 'custom-web', src: 'url', kind: 'web', title: '自定义网页壁纸', type: 'web',
      file: u, playable: true, preview: '', previewOk: false, dir: '', reason: '' };
  }
  function wpEffectiveItems() {
    var items = ((WP && WP.items) || []).slice();
    var ci = customWebItem();
    if (ci && !items.some(function (x) { return x.id === 'custom-web' && x.src === 'url'; })) items.push(ci);
    return items;
  }
  function wpCardHtml(it) {
    var c = (WP && WP.config) || {};
    var active = c.enabled && c.id === it.id && c.src === it.src;
    var id = esc(it.id), src = esc(it.src);
    var shop = 'https://steamcommunity.com/sharedfiles/filedetails/?id=' + encodeURIComponent(it.id);
    var note = it.reason || (it.subscriptions ? '订阅 ' + it.subscriptions : '');
    return '<div class="wp-card' + (active ? ' is-active' : '') + '">' +
      '<div class="wp-thumb-wrap">' +
        '<img class="wp-thumb" src="' + esc(wpPreviewUrl(it)) + '" loading="lazy" alt="" ' +
          'onerror="this.style.opacity=.15" data-wp-pick="' + id + '" data-wp-src="' + src + '">' +
        '<span class="wp-kind ' + (it.kind === 'scene' ? 'scene' : '') + '">' + wpKindLabel(it.kind) + '</span>' +
      '</div>' +
      '<div class="wp-body"><b title="' + esc(it.title) + '">' + esc(it.title) + '</b>' +
        '<small>ID ' + id + ' · ' + esc(it.type || it.kind) + ' · ' + Number(it.sizeMB || 0) + ' MB' +
          (note ? ' · ' + esc(note) : '') + '</small>' +
        '<div class="wp-actions">' +
          '<button class="btn primary tiny" data-wp-pick="' + id + '" data-wp-src="' + src + '">' +
            (active ? '正在使用' : '设为壁纸') + '</button>' +
          (it.kind === 'web' ? '<button class="btn tiny" data-wp-touch="' + id + '" data-wp-src="' + src + '">触摸模式</button>' : '') +
          '<a class="btn tiny" href="' + esc(shop) + '" target="_blank" rel="noopener noreferrer">工坊页</a>' +
          '<button class="btn tiny" data-wp-hide="' + id + '" data-wp-hide-src="' + src + '">从软件删除</button>' +
        '</div></div></div>';
  }
  function renderWorkshopResult() {
    var el = $('wpWorkshopResult'); if (!el) return;
    if (!WP_LOOKUP) { el.innerHTML = '<div class="mini-empty">还没查询。粘贴工坊链接或 ID，点「读取工坊信息」。</div>'; return; }
    if (!WP_LOOKUP.ok) { el.innerHTML = '<div class="mini-empty">查询失败：' + esc(WP_LOOKUP.error || '未知错误') + '</div>'; return; }
    var d = (WP_LOOKUP.items || [])[0];
    if (!d) { el.innerHTML = '<div class="mini-empty">Steam 没找到这个物品（可能已下架或设为私密）。</div>'; return; }
    el.innerHTML = '<div class="mini-item"><div><b>' + esc(d.title) + '</b>' +
      '<small>ID ' + esc(d.id) + ' · 订阅 ' + Number(d.subscriptions || 0) + ' · 作者 ' + esc(d.author || '—') + '</small>' +
      '<small>' + (d.fileUrl ? 'Steam 提供了本体下载链接，可以完整下载到软件' : 'Steam 未开放本体下载，只能下载预览图；完整壁纸请在 Steam 订阅后重新扫描') + '</small></div></div>';
  }
  function wpFiltered(list) {
    var q = ($('wpSearch') && $('wpSearch').value || '').toLowerCase().trim();
    var k = $('wpKind') && $('wpKind').value || '';
    return list.filter(function (it) {
      if (k && it.kind !== k) return false;
      if (q) {
        var hay = (it.title + ' ' + it.id + ' ' + (it.tags || []).join(' ') + ' ' + (it.description || '')).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }
  function renderWallpaper() {
    var st = WP || {}, c = st.config || {};
    var items = wpEffectiveItems();
    var local = items.filter(function (x) { return x.src === 'local'; });
    var downloaded = items.filter(function (x) { return x.src === 'workshop'; });
    if ($('wpStatusTag')) $('wpStatusTag').textContent = items.length + ' 款 · ' + (st.playableCount || 0) + ' 款可播放';
    if ($('wpLocalTag')) $('wpLocalTag').textContent = local.length + ' 款';
    if ($('wpDownloadedTag')) $('wpDownloadedTag').textContent = downloaded.length + ' 款';
    if ($('wpEnabled')) $('wpEnabled').checked = !!c.enabled;
    if ($('wpCrisp')) $('wpCrisp').checked = c.crisp !== false;
    [['wpUi', c.ui === undefined ? 16 : c.ui], ['wpDim', c.dim], ['wpBlur', c.blur], ['wpVolume', c.volume]].forEach(function (pair) {
      if (pair[0] === 'wpUi' && WP_UI_DRAG) return;
      var el = $(pair[0]); if (el && pair[1] !== undefined) el.value = String(pair[1]);
    });
    if ($('wpFit')) $('wpFit').value = c.fit === 'contain' ? 'contain' : 'cover';
    if ($('wpCurrent')) {
      if (c.enabled && c.id === 'custom-web' && c.customUrl) {
        $('wpCurrent').textContent = '当前壁纸：自定义网页壁纸（网页）· ' + String(c.customUrl).slice(0, 60);
      } else {
        $('wpCurrent').textContent = c.enabled && st.current
          ? '当前壁纸：' + st.current.title + '（' + wpKindLabel(st.current.kind) + '）· ID ' + st.current.id
          : '当前：未启用。选一款壁纸就会变成软件背景。';
      }
    }
    if ($('wpPathHint')) $('wpPathHint').textContent = (st.dirs || []).length
      ? '扫描到的小红车目录：' + st.dirs.join('；')
      : '还没找到小红车（Wallpaper Engine）的工坊目录：先在 Steam 里订阅至少一款壁纸，再点「重新扫描」。';
    if ($('wpList')) {
      var shown = wpFiltered(local);
      $('wpList').innerHTML = shown.length ? shown.map(wpCardHtml).join('')
        : '<div class="mini-empty">没有匹配的壁纸。点「重新扫描本机小红车」，或先在 Steam 里订阅一款。</div>';
    }
    if ($('wpDownloaded')) $('wpDownloaded').innerHTML = downloaded.length ? downloaded.map(wpCardHtml).join('')
      : '<div class="mini-empty">还没下载过工坊物品。在上面粘贴工坊 ID / 链接即可下载预览素材。</div>';
    if ($('wpCustomList')) {
      var ci = customWebItem();
      $('wpCustomList').innerHTML = ci
        ? '<div class="wp-card is-active"><div class="wp-thumb-wrap" style="display:flex;align-items:center;justify-content:center;color:#f0c98a;font:22px monospace">·−·−</div><div class="wp-body"><b>自定义网页壁纸</b><small>' + esc(String(ci.file).slice(0, 64)) + '</small></div></div>'
        : '<div class="mini-empty">还没设置。粘贴网址或选本地 HTML 文件，立刻把它当动态壁纸。</div>';
    }
    renderWorkshopResult();
    applyWallpaper();
  }
  function applyWallpaper() {
    var c = (WP && WP.config) || {};
    var layer = $('slWallpaperLayer');
    var on = !!c.enabled && !!c.id;
    var rawUi = WP_UI_DRAG && $('wpUi') ? $('wpUi').value : (c.ui === undefined ? 16 : c.ui);
    var ui = Math.max(0, Math.min(100, Number(rawUi) || 0));
    var crisp = c.crisp !== false;
    document.body.style.setProperty('--wp-ui-a', (ui / 100).toFixed(2));
    document.body.style.setProperty('--wp-ui-blur', crisp ? '0px' : (ui / 100 * 9).toFixed(1) + 'px');
    document.body.classList.toggle('wp-on', on);
    document.body.classList.toggle('wp-crisp', on && crisp);
    if (!on) { document.body.classList.remove('wp-focus'); wpTouchMode(false); }
    var exitBtn = $('slWpExit');
    if (!exitBtn) {
      exitBtn = document.createElement('button');
      exitBtn.id = 'slWpExit'; exitBtn.type = 'button'; exitBtn.textContent = '返回界面（Esc）';
      exitBtn.addEventListener('click', function () { document.body.classList.remove('wp-focus'); });
      document.body.appendChild(exitBtn);
    }
    layer.hidden = !on;
    if (!on) { layer.innerHTML = ''; WP_APPLIED_KEY = ''; return; }
    var it = wpEffectiveItems().find(function (x) { return String(x.id) === String(c.id) && x.src === c.src; })
      || wpEffectiveItems().find(function (x) { return String(x.id) === String(c.id); });
    if (!it) { layer.innerHTML = ''; WP_APPLIED_KEY = ''; return; }
    var src = wpMediaSrc(it);
    var vol = Math.min(1, Number(c.volume || 0) / 100);
    var isStill = /^data:image\//i.test(src) || /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(src);
    var layerKind = isStill ? 'image' : it.kind;
    if (layerKind !== 'web' && document.body.classList.contains('wp-touch')) wpTouchMode(false);
    var key = [c.id, c.src, c.fit, layerKind, layerKind === 'video' ? c.volume : ''].join('|');
    if (WP_APPLIED_KEY !== key && src) {
      WP_APPLIED_KEY = key;
      layer.innerHTML = layerKind === 'video'
        ? '<video autoplay loop playsinline ' + (vol > 0 ? '' : 'muted') + ' src="' + esc(src) + '"></video>'
        : layerKind === 'web'
          ? '<iframe src="' + esc(src) + '" title="动态壁纸" scrolling="no" allow="autoplay; encrypted-media; fullscreen; pointer-lock; gamepad; clipboard-read; clipboard-write"></iframe>'
          : '<img src="' + esc(src) + '" alt="动态壁纸">';
      if (layerKind === 'web') {
        var fr = layer.querySelector('iframe');
        if (fr) fr.onload = function () {
          wireWebAudio(fr, vol); wpWakeIframe(fr); configureShim(fr); bindIframeEsc(fr);
        };
      } else {
        var mediaEl = layer.firstElementChild;
        if (mediaEl) mediaEl.addEventListener('error', function () {
          var fb = wpPreviewUrl(it);
          if (!fb || fb === src || !mediaEl.isConnected) return;
          var img = document.createElement('img'); img.src = fb; img.alt = '';
          mediaEl.replaceWith(img);
        }, { once: true });
      }
    }
    layer.style.setProperty('--wp-dim', crisp ? '0' : (Number(c.dim || 0) / 100).toFixed(2));
    layer.style.setProperty('--wp-blur', crisp ? '0px' : Number(c.blur || 0) + 'px');
    layer.style.setProperty('--wp-fit', c.fit === 'contain' ? 'contain' : 'cover');
    var v = layer.querySelector('video');
    if (v) { v.volume = vol; v.muted = vol === 0; wpEnsurePlay(v, vol); }
    if (it.kind === 'web') {
      var fr2 = layer.querySelector('iframe');
      if (fr2 && fr2.__wpSetVol) fr2.__wpSetVol(vol);
      if (fr2) { wpWakeIframe(fr2); configureShim(fr2); }
    }
  }
  var WP_BOUND = new WeakSet();
  function wpEnsurePlay(v, vol) {
    if (!v) return;
    var tryPlay = function () {
      if (!v.isConnected || !v.paused || v.ended) return;
      try {
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () {
          try { v.muted = true; } catch (e) {}
          var p2 = v.play();
          if (p2 && typeof p2.then === 'function') p2.then(function () {
            try { v.muted = vol === 0; v.volume = vol; } catch (e) {}
          }).catch(function () {});
        });
      } catch (e) {}
    };
    if (!WP_BOUND.has(v)) {
      WP_BOUND.add(v);
      v.addEventListener('loadeddata', tryPlay);
      v.addEventListener('canplay', tryPlay);
      v.addEventListener('stalled', function () { setTimeout(tryPlay, 600); });
    }
    tryPlay(); setTimeout(tryPlay, 400); setTimeout(tryPlay, 1600);
  }
  function wpWakeIframe(fr) {
    var wake = function () {
      try {
        var w = fr.contentWindow; if (!w) return;
        w.dispatchEvent(new Event('resize'));
        w.dispatchEvent(new Event('focus'));
        if (w.document) w.document.dispatchEvent(new Event('visibilitychange'));
      } catch (e) {}
    };
    wake(); setTimeout(wake, 500); setTimeout(wake, 1800);
  }
  function wireWebAudio(iframe, vol) {
    var setVol = function (val) {
      var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (!doc) return;
      doc.querySelectorAll('audio, video').forEach(function (m) {
        try { m.volume = val; if (val > 0) m.muted = false; } catch (e) {}
      });
    };
    setVol(vol);
    try {
      var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
      if (doc && doc.documentElement) {
        new MutationObserver(function () { setVol(vol); }).observe(doc.documentElement, { childList: true, subtree: true });
      }
    } catch (e) {}
    iframe.__wpSetVol = setVol;
  }
  function activeIframe() {
    var layer = $('slWallpaperLayer');
    return layer ? layer.querySelector('iframe') : null;
  }
  function configureShim(fr) {
    try {
      var t = fr && fr.contentWindow && fr.contentWindow.__MORSE_TOUCH__;
      if (t && t.configure) {
        t.configure({
          mouseToTouch: $('touchMouse') ? $('touchMouse').checked : true,
          ripple: $('touchRipple') ? $('touchRipple').checked : true,
          hud: $('touchHud') ? $('touchHud').checked : true,
          syntheticAudio: true
        });
      }
    } catch (e) {}
  }
  function bindIframeEsc(fr) {
    try {
      var d = fr.contentDocument;
      if (d && !d.__morseTouchEscBound) {
        d.__morseTouchEscBound = true;
        d.addEventListener('keydown', function (ev) {
          if (ev.key === 'Escape' && document.body.classList.contains('wp-touch')) {
            ev.preventDefault(); wpTouchMode(false);
          }
        }, true);
      }
    } catch (e) { /* cross-origin iframe */ }
  }
  function ensureWpTouchBar() {
    var bar = $('slWpTouchBar');
    if (!bar) return null;
    if (!bar.__bound) {
      bar.__bound = true;
      $('slWpTouchExit').addEventListener('click', function () { wpTouchMode(false); });
      ['touchMouse', 'touchRipple', 'touchHud'].forEach(function (id) {
        $(id).addEventListener('change', function () { configureShim(activeIframe()); });
      });
    }
    return bar;
  }
  function wpTouchMode(on) {
    var bar = ensureWpTouchBar();
    if (!on) {
      document.body.classList.remove('wp-touch');
      if (bar) bar.hidden = true;
      return true;
    }
    var c = (WP && WP.config) || {};
    if (!c.enabled || !c.id) { toast('先选一款壁纸，再开启触摸模式'); return false; }
    var it = wpEffectiveItems().find(function (x) { return String(x.id) === String(c.id) && x.src === c.src; })
      || wpEffectiveItems().find(function (x) { return String(x.id) === String(c.id); });
    if (!it || it.kind !== 'web') {
      toast('当前是「' + wpKindLabel(it ? it.kind : '') + '」壁纸，没有可互动的网页内容；请选一款「网页 / HTML」壁纸。');
      return false;
    }
    var fr = activeIframe();
    if (!fr) { toast('网页壁纸还没加载好，稍等一下再试'); return false; }
    document.body.classList.remove('wp-focus');
    document.body.classList.add('wp-touch');
    if (bar) bar.hidden = false;
    TOUCH.count = 0; TOUCH.last = '等待触摸…';
    $('touchStats').textContent = '触摸 0 次 · ' + TOUCH.last;
    try { fr.focus(); } catch (e) {}
    wpWakeIframe(fr); configureShim(fr); bindIframeEsc(fr);
    toast('触摸模式已开启：可直接点击 / 拖动壁纸里的角色与物件，按 Esc 或点悬浮条返回');
    return true;
  }
  async function loadWallpaper() {
    try { WP = await api('/api/wallpaper/status'); } catch (e) { /* keep last data */ }
    renderWallpaper();
  }
  async function wpSet(patch) {
    try {
      var r = await post('/api/wallpaper/config', patch);
      if (r.status) WP = r.status;
      renderWallpaper();
    } catch (e) { toast('壁纸设置失败：' + e.message); }
  }
  async function wpSetWeb(url) {
    try {
      var r = await post('/api/wallpaper/config', { enabled: !!url, id: 'custom-web', src: 'url', customUrl: url || '' });
      if (r.status) WP = r.status;
      renderWallpaper();
      toast(url ? '已应用自定义网页壁纸' : '已清除自定义网页壁纸');
    } catch (e) { toast('设置失败：' + e.message); }
  }
  function updateTouchStats() {
    var el = $('touchStats');
    if (el) el.textContent = '触摸 ' + TOUCH.count + ' 次 · ' + TOUCH.last + ' · ' + TOUCH.points + ' 点';
  }

  /* ================================================================ *
   * INIT
   * ================================================================ */
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    document.querySelectorAll('.page').forEach(function (p) { p.classList.toggle('active', p.id === 'page-' + name); });
    if (name === 'wallpaper' && !WP) loadWallpaper();
  }

  function initApp() {
    updateDirectionUI();
    buildCodeTable();

    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.dataset.tab); });
    });
    document.querySelectorAll('.seg').forEach(function (b) {
      b.addEventListener('click', function () {
        state.dir = b.dataset.dir; updateDirectionUI();
        $('inputText').value = state.dir === 'zh2morse' ? '你好，世界' : '.... . .-.. .-.. --- / .-- --- .-. .-.. -..';
        $('charCount').textContent = $('inputText').value.length + ' 字';
      });
    });
    $('swapBtn').addEventListener('click', function () {
      document.querySelector('.seg[data-dir="' + (state.dir === 'zh2morse' ? 'morse2zh' : 'zh2morse') + '"]').click();
    });
    $('inputText').addEventListener('input', function () { $('charCount').textContent = this.value.length + ' 字'; });
    document.querySelectorAll('.chip').forEach(function (c) {
      c.addEventListener('click', function () {
        $('inputText').value = c.dataset.sample;
        $('charCount').textContent = c.dataset.sample.length + ' 字';
        runTranslation();
      });
    });
    $('runBtn').addEventListener('click', runTranslation);
    $('clearBtn').addEventListener('click', function () {
      $('inputText').value = ''; $('charCount').textContent = '0 字';
      ['step1Text', 'step2Text', 'step3Text'].forEach(function (id) { setStep(id, '—'); });
      $('morseOutput').textContent = '等待翻译…'; $('morseOutput').classList.add('empty');
      $('morseBars').innerHTML = ''; showWarn(''); stopPlay();
    });
    document.querySelectorAll('[data-copy]').forEach(function (b) {
      b.addEventListener('click', function () {
        var el = $(b.dataset.copy); copyText(el.dataset.raw || el.textContent);
      });
    });
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runTranslation(); }
      if (e.key === 'Escape') {
        if (document.body.classList.contains('wp-touch')) wpTouchMode(false);
        else if (document.body.classList.contains('wp-focus')) document.body.classList.remove('wp-focus');
      }
    });
    $('wpm').addEventListener('input', function () {
      state.wpm = Number(this.value); $('wpmVal').textContent = state.wpm + ' WPM';
    });
    $('playBtn').addEventListener('click', function () { playMorse(state.lastCode, state.wpm); });
    $('stopBtn').addEventListener('click', function () { stopPlay(); $('playStatus').textContent = '已停止'; });
    $('offlineOnly').addEventListener('change', function () {
      $('enginePill').className = 'pill ' + (this.checked ? 'warn' : 'ok');
      $('enginePill').innerHTML = '<i class="dot"></i>' + (this.checked ? '离线模式 · 文字不联网' : '在线翻译可用');
    });
    $('copyUrl').addEventListener('click', function () { copyText($('weUrl').textContent); });

    /* ---- wallpaper library click delegation ---- */
    document.addEventListener('click', async function (e) {
      var pick = e.target.closest('[data-wp-pick]');
      if (pick) {
        await wpSet({ enabled: true, id: pick.getAttribute('data-wp-pick'), src: pick.getAttribute('data-wp-src') || 'local' });
        toast('已应用动态壁纸'); return;
      }
      var touchBtn = e.target.closest('[data-wp-touch]');
      if (touchBtn) {
        await wpSet({ enabled: true, id: touchBtn.getAttribute('data-wp-touch'), src: touchBtn.getAttribute('data-wp-src') || 'local' });
        setTimeout(function () { wpTouchMode(true); }, 400); return;
      }
      var hide = e.target.closest('[data-wp-hide]');
      if (hide) {
        try {
          var r = await post('/api/wallpaper/hide', {
            id: hide.getAttribute('data-wp-hide'), src: hide.getAttribute('data-wp-hide-src') || 'local'
          });
          if (r.status) WP = r.status;
          renderWallpaper();
          toast('已从软件列表删除（小红车里的文件没动，点「重新扫描」会回来）');
        } catch (err) { toast('删除失败：' + err.message); }
      }
    });

    $('btnWpScan').addEventListener('click', async function () {
      var b = this; b.disabled = true; b.textContent = '扫描中…';
      try {
        var r = await post('/api/wallpaper/scan', {});
        if (r.status) WP = r.status;
        renderWallpaper(); toast('扫描完成：' + ((WP && WP.items || []).length) + ' 款壁纸');
      } catch (err) { toast('扫描失败：' + err.message); }
      b.disabled = false; b.textContent = '重新扫描本机小红车';
    });
    $('btnWpOff').addEventListener('click', function () { wpSet({ enabled: false }); });
    $('wpEnabled').addEventListener('change', function (e) { wpSet({ enabled: e.target.checked }); });
    [['wpDim', 'dim'], ['wpBlur', 'blur'], ['wpVolume', 'volume']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function (e) { wpSet({ [pair[1]]: Number(e.target.value) }); });
    });
    $('wpFit').addEventListener('change', function (e) { wpSet({ fit: e.target.value }); });
    $('wpUi').addEventListener('input', function (e) {
      WP_UI_DRAG = true;
      if (WP && WP.config) WP.config.ui = Number(e.target.value);
      applyWallpaper();
    });
    $('wpUi').addEventListener('change', async function (e) { WP_UI_DRAG = false; await wpSet({ ui: Number(e.target.value) }); });
    $('wpUi').addEventListener('pointerup', function () { WP_UI_DRAG = false; });
    $('wpCrisp').addEventListener('change', function (e) { wpSet({ crisp: e.target.checked }); });
    $('btnWpCrisp').addEventListener('click', function () {
      wpSet({ ui: 12, dim: 0, blur: 0, crisp: true });
      toast('已切到高清模式：界面最透，壁纸不压暗、不模糊');
    });
    $('btnWpReset').addEventListener('click', async function () {
      try {
        var r = await post('/api/wallpaper/reset', {});
        if (r && r.config) WP = r; else if (r && r.status) WP = r.status;
        WP_UI_DRAG = false; renderWallpaper();
        toast('已恢复动态壁纸默认设置');
      } catch (e) { toast('恢复默认失败：' + e.message); }
    });
    $('btnWpFocus').addEventListener('click', function () {
      var c = (WP && WP.config) || {};
      if (!c.enabled || !c.id) { toast('先选一款壁纸，再进入沉浸模式'); return; }
      wpTouchMode(false); document.body.classList.add('wp-focus');
    });
    $('btnWpTouch').addEventListener('click', function () { wpTouchMode(true); });
    ensureWpTouchBar();

    $('wpSearch').addEventListener('input', renderWallpaper);
    $('wpKind').addEventListener('change', renderWallpaper);

    $('btnWpLookup').addEventListener('click', async function () {
      var q = String($('wpWorkshopInput').value || '').trim();
      if (!q) { toast('先粘贴工坊链接或 ID'); return; }
      var b = this; b.disabled = true; b.textContent = '读取中…';
      try { WP_LOOKUP = await api('/api/wallpaper/workshop?id=' + encodeURIComponent(q)); }
      catch (err) { WP_LOOKUP = { ok: false, error: err.message }; }
      renderWorkshopResult(); b.disabled = false; b.textContent = '读取工坊信息';
    });
    $('btnWpDownload').addEventListener('click', async function () {
      var q = String($('wpWorkshopInput').value || '').trim();
      if (!q) { toast('先粘贴工坊链接或 ID'); return; }
      var b = this; b.disabled = true; b.textContent = '下载中…';
      try {
        var r = await post('/api/wallpaper/workshop/download', { id: q });
        if (r.status) WP = r.status;
        renderWallpaper();
        toast(r.ok ? '已下载到软件：' + (r.title || q) : ('未下载成功：' + (r.error || r.note || '未知原因')));
      } catch (err) { toast('下载失败：' + err.message); }
      b.disabled = false; b.textContent = '下载到软件';
    });
    $('btnWpWebUrl').addEventListener('click', function () {
      var u = String($('wpWebUrl').value || '').trim();
      if (!u) { toast('先粘贴一个网页地址（http/https）'); return; }
      wpSetWeb(u);
    });
    $('btnWpWebFile').addEventListener('click', function () { $('wpWebFile').click(); });
    $('wpWebFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { wpSetWeb('data:text/html;charset=utf-8,' + encodeURIComponent(String(r.result))); };
      r.readAsText(f);
    });
    $('btnWpWebClear').addEventListener('click', function () { $('wpWebUrl').value = ''; wpSetWeb(''); });

    /* ---- touch event channel from injected shim ---- */
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.source !== 'morse-wp-touch') return;
      if (d.type === 'escape') { wpTouchMode(false); return; }
      if (d.type === 'ready') { configureShim(activeIframe()); return; }
      if (['down', 'move', 'up', 'touchstart', 'touchmove', 'touchend'].indexOf(d.type) === -1) return;
      if (d.type === 'move' || d.type === 'touchmove') {
        TOUCH.last = d.type + ' ' + d.x + ',' + d.y;
      } else {
        TOUCH.count++;
        TOUCH.last = d.type + ' ' + d.x + ',' + d.y;
      }
      TOUCH.points = d.points || 1;
      updateTouchStats();
    });

    /* keep video playing / wake iframe animations */
    setInterval(function () {
      var layer = $('slWallpaperLayer');
      if (!layer || layer.hidden) return;
      var v = layer.querySelector('video');
      if (v && v.paused && !v.ended && v.isConnected) {
        try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
      }
    }, 3000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      var layer = $('slWallpaperLayer');
      if (!layer || layer.hidden) return;
      var v = layer.querySelector('video');
      if (v && v.paused) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      var fr = layer.querySelector('iframe'); if (fr) wpWakeIframe(fr);
    });

    /* service + engine probe */
    api('/api/config').then(function (cfg) {
      $('weUrl').textContent = cfg.wallpaperUrl;
      $('enginePill').className = 'pill ok';
      $('enginePill').innerHTML = '<i class="dot"></i>本地服务已连接';
    }).catch(function () {
      $('enginePill').className = 'pill warn';
      $('enginePill').innerHTML = '<i class="dot"></i>离线模式（请用 start.bat 启动）';
      $('engineNotice').textContent = '未检测到本地服务：摩斯编码与离线词典仍可用，但无法播放小红车壁纸。';
    });
    api('/api/status').then(function (st) {
      $('wePill').className = 'pill ' + ((st.items || []).length ? 'ok' : 'warn');
      $('wePill').innerHTML = '<i class="dot"></i>' + ((st.items || []).length
        ? '小红车已连接 · ' + st.items.length + ' 款壁纸' : '未检测到小红车壁纸');
    }).catch(function () {
      $('wePill').className = 'pill warn';
      $('wePill').innerHTML = '<i class="dot"></i>本地服务未启动';
    });
    api('/api/translate', { text: '连接测试', direction: 'zh2en' }).then(function (r) {
      if ($('offlineOnly').checked) return;
      $('enginePill').className = 'pill ' + (r.online ? 'ok' : 'warn');
      $('enginePill').innerHTML = '<i class="dot"></i>' + (r.online ? '在线翻译可用' : '离线词典模式');
      $('engineNotice').textContent = '翻译通道：' + r.engine + '　· 在线翻译会把输入文字发给免费翻译服务，勾选「仅离线翻译」可完全断网。';
    }).catch(function () {});

    loadWallpaper();
    runTranslation();
  }

  if (wallpaperMode) initWallpaper();
  else initApp();
})();
