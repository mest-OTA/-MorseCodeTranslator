/*
 * Morse Code Workbench - local server (zero dependencies, Node.js built-ins only)
 * Binds to 127.0.0.1 only.
 *
 * Wallpaper support is a verbatim port of the user's first task (D:\SteamLens):
 *   wallpaper-core.js  - copied 1:1 from SteamLens
 *   server routes      - same /api/wallpaper/* endpoints as SteamLens/server.js
 *   front-end          - same slWallpaperLayer / wp-touch / wp-focus behaviour
 * Translation + live-state channel (Chinese <-> English <-> Morse) are unchanged.
 */
'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const Morse = require('./morse.js');
const Dict = require('./dictionary.js');
const wallpaper = require('./wallpaper-core.js');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.MORSE_PORT || 18760);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.map': 'application/json; charset=utf-8'
};

/* ------------------------------------------------------------------ *
 * Web-wallpaper compatibility + touch shim (injected into HTML)
 * ------------------------------------------------------------------ */
let SHIM_SOURCE = '';
function shimSource() {
  if (!SHIM_SOURCE) {
    try { SHIM_SOURCE = fs.readFileSync(path.join(ROOT, 'we-shim.js'), 'utf8'); }
    catch (e) { SHIM_SOURCE = '/* shim unavailable */'; }
  }
  return SHIM_SOURCE;
}
function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function injectHtml(html, boot, baseHref) {
  const payload = 'window.__MORSE_WP_BOOT__=' +
    JSON.stringify(boot).replace(/</g, '\\u003c') + ';\n' + shimSource();
  const tag = '<script data-morse-wp-shim>\n' +
    payload.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  const base = baseHref ? '<base href="' + escapeAttr(baseHref) + '">' : '';
  const head = /<head[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + base + tag + html.slice(at);
  }
  return base + tag + html;
}
function serveHtml(req, res, file, boot, baseHref) {
  let html;
  try { html = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
  catch (e) { res.writeHead(404); return res.end('not found'); }
  const body = Buffer.from(injectHtml(html, boot, baseHref), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function coerce(v) {
  const s = String(v).trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function bootFor(it) {
  /* Wallpaper Engine calls applyUserProperties() with { key: { value: ... } }.
     Without this shim many web wallpapers never receive their settings. */
  let props = {};
  try {
    const pj = JSON.parse(fs.readFileSync(path.join(it.dir, 'project.json'), 'utf8'));
    const gp = pj && pj.general && pj.general.properties;
    if (gp && typeof gp === 'object') {
      Object.keys(gp).forEach(k => {
        const raw = gp[k] && typeof gp[k] === 'object' ? gp[k].value : gp[k];
        if (raw !== undefined && raw !== null) props[k] = { value: coerce(raw) };
      });
    }
  } catch (e) { /* no project.json / no properties */ }
  return { id: it.id, src: it.src, title: it.title || '', kind: it.kind || '', props: props, interactive: true };
}

/* Custom web wallpaper: fetch remote HTML and serve it same-origin so the
   touch shim can be injected. Private/loopback hosts are refused (SSRF guard). */
function isPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!h || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') ||
      h === '0.0.0.0' || h === '::1' ||
      /^127\./.test(h) || /^10\./.test(h) ||
      /^192\.168\./.test(h) || /^169\.254\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
  return u;
}
function fetchRemote(raw, redirects) {
  return new Promise((resolve, reject) => {
    const u = isPublicUrl(raw);
    if (!u) return reject(new Error('只允许公网 http/https 网址'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.get(u, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0 (MorseWorkbench)', 'Accept': 'text/html,*/*' } }, res => {
      const code = res.statusCode;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location) {
        res.resume();
        if ((redirects || 0) >= 3) return reject(new Error('重定向过多'));
        return resolve(fetchRemote(new URL(res.headers.location, u).toString(), (redirects || 0) + 1));
      }
      const ct = String(res.headers['content-type'] || '');
      if (code !== 200 || !/text\/html/i.test(ct)) {
        res.resume(); return reject(new Error('目标不是可直接嵌入的网页 (HTTP ' + code + ')'));
      }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; if (buf.length > 4e6) req.destroy(); });
      res.on('end', () => resolve({ html: buf, url: u.toString() }));
    });
    req.on('timeout', () => req.destroy(new Error('请求超时')));
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ *
 * Translation
 * ------------------------------------------------------------------ */
const translationCache = new Map();
function httpsGet(url, timeout) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: timeout || 9000,
      headers: { 'User-Agent': 'Mozilla/5.0 (MorseWorkbench/1.0)', 'Accept': 'application/json' }
    }, res => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', c => { buf += c; });
      res.on('end', () => resolve(buf));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
function unescapeHtml(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
function splitChunks(text, max) {
  const out = [];
  let buf = '';
  String(text).split(/(?<=[\n。！？!?.;；])/).forEach(part => {
    if (!part) return;
    if (buf.length + part.length > max && buf) { out.push(buf); buf = ''; }
    while (part.length > max) { out.push(part.slice(0, max)); part = part.slice(max); }
    buf += part;
  });
  if (buf) out.push(buf);
  return out.length ? out : [String(text).slice(0, max)];
}
async function translateViaMyMemory(text, direction) {
  const pair = direction === 'en2zh' ? 'en|zh-CN' : 'zh-CN|en';
  const results = [];
  for (const chunk of splitChunks(text, 450)) {
    const url = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=' + encodeURIComponent(pair);
    const data = JSON.parse(await httpsGet(url, 9000));
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated || /MYMEMORY WARNING|QUERY LENGTH|INVALID|QUOTA/i.test(translated)) {
      throw new Error('MyMemory rejected: ' + translated);
    }
    results.push(unescapeHtml(translated));
  }
  return results.join('').trim();
}
async function translateViaGoogle(text, direction) {
  const sl = direction === 'en2zh' ? 'en' : 'zh-CN';
  const tl = direction === 'en2zh' ? 'zh-CN' : 'en';
  const results = [];
  for (const chunk of splitChunks(text, 450)) {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl + '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(chunk);
    const arr = JSON.parse(await httpsGet(url, 6000));
    if (!Array.isArray(arr) || !Array.isArray(arr[0])) throw new Error('bad google response');
    results.push(arr[0].map(x => x[0]).filter(Boolean).join(''));
  }
  return results.join('').trim();
}
async function translateText(text, direction) {
  const key = direction + '|' + text;
  if (translationCache.has(key)) return Object.assign({}, translationCache.get(key), { cached: true });
  let result;
  try {
    result = { text: await translateViaMyMemory(text, direction), engine: '在线翻译 (MyMemory)', online: true };
  } catch (e1) {
    try {
      result = { text: await translateViaGoogle(text, direction), engine: '在线翻译 (Google)', online: true };
    } catch (e2) {
      result = { text: Dict.translate(text, direction), engine: '离线词典（联网可获得更准确译文）', online: false, warning: e1.message };
    }
  }
  result.cached = false;
  translationCache.set(key, result);
  if (translationCache.size > 500) translationCache.delete(translationCache.keys().next().value);
  return result;
}

/* ------------------------------------------------------------------ *
 * Live state (browser <-> Wallpaper Engine wallpaper from task #1)
 * ------------------------------------------------------------------ */
let lastState = {
  morse: '.... . .-.. .-.. --- / .-- --- .-. .-.. -..',
  english: 'HELLO WORLD', chinese: '你好，世界',
  direction: 'zh2morse', updatedAt: new Date().toISOString(), preset: true
};

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */
function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => { buf += c; if (buf.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = path.resolve(ROOT, '.' + rel);
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  const ext = path.extname(full).toLowerCase();
  if (!MIME[ext]) { res.writeHead(404); return res.end('Not found'); }
  let data;
  try { data = fs.readFileSync(full); } catch (e) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[ext], 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
  res.end(data);
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://' + HOST + ':' + PORT);
  const p = u.pathname;
  const method = req.method;

  try {
    if (p === '/api/health') return sendJson(res, 200, { ok: true, version: '2.0.0', time: new Date().toISOString() });

    if (p === '/api/config') {
      const st = wallpaper.status();
      return sendJson(res, 200, {
        port: PORT,
        appUrl: 'http://' + HOST + ':' + PORT + '/',
        wallpaperUrl: 'http://' + HOST + ':' + PORT + '/?wallpaper=1',
        weHome: (st.dirs && st.dirs[0]) || '',
        wallpaperDirs: st.dirs || [],
        wallpaperCount: (st.items || []).length
      });
    }

    /* ---- Translation ---- */
    if (p === '/api/translate' && method === 'POST') {
      const b = await readBody(req);
      const text = String(b.text || '').slice(0, 2000).trim();
      const direction = b.direction === 'en2zh' ? 'en2zh' : 'zh2en';
      if (!text) return sendJson(res, 400, { error: 'empty text' });
      return sendJson(res, 200, await translateText(text, direction));
    }

    /* ---- Live state ---- */
    if (p === '/api/state' && method === 'GET') return sendJson(res, 200, lastState);
    if (p === '/api/state' && method === 'POST') {
      const b = await readBody(req);
      lastState = {
        morse: String(b.morse || '').slice(0, 4000),
        english: String(b.english || '').slice(0, 1000),
        chinese: String(b.chinese || '').slice(0, 1000),
        direction: b.direction === 'morse2zh' ? 'morse2zh' : 'zh2morse',
        wpm: Math.max(5, Math.min(60, Number(b.wpm) || 20)),
        updatedAt: new Date().toISOString(), preset: false
      };
      return sendJson(res, 200, { ok: true, state: lastState });
    }

    /* ---- Wallpaper Engine wallpapers (ported from SteamLens) ---- */
    if (p === '/api/status' && method === 'GET') return sendJson(res, 200, wallpaper.status());

    if (p === '/api/wallpaper/status' && method === 'GET') {
      try { return sendJson(res, 200, wallpaper.status()); }
      catch (e) { return sendJson(res, 200, { ok: false, error: e.message, items: [] }); }
    }
    if (p === '/api/wallpaper/scan' && method === 'POST') return sendJson(res, 200, wallpaper.rescan());
    if (p === '/api/wallpaper/config' && method === 'POST') return sendJson(res, 200, wallpaper.setConfig(await readBody(req)));
    if (p === '/api/wallpaper/reset' && method === 'POST') return sendJson(res, 200, { ok: true, status: wallpaper.reset() });
    if (p === '/api/wallpaper/hide' && method === 'POST') {
      const b = await readBody(req);
      return sendJson(res, 200, wallpaper.hideWallpaper(b.id, b.src));
    }
    if ((p === '/api/wallpaper/preview' || p === '/api/wallpaper/media') && method === 'GET') {
      const which = p === '/api/wallpaper/preview' ? 'preview' : 'media';
      return wallpaper.serveFile(req, res, wallpaper.fileFor(u.searchParams.get('id'), u.searchParams.get('src'), which));
    }
    /* Web wallpaper: /api/wallpaper/html/<id>/<src>/<relative path> */
    if (p.startsWith('/api/wallpaper/html/')) {
      const parts = p.slice('/api/wallpaper/html/'.length).split('/');
      const id = decodeURIComponent(parts.shift() || '');
      const src = parts.shift() || 'local';
      let rel = '';
      try { rel = parts.map(decodeURIComponent).join('/'); } catch (e) { rel = ''; }
      const file = wallpaper.fileFor(id, src, 'asset', rel);
      if (file && /\.(html?|htm)$/i.test(file)) {
        const it = wallpaper.findItem(id, src);
        return serveHtml(req, res, file, bootFor(it || { dir: path.dirname(file), id: id, src: src }), '');
      }
      return wallpaper.serveFile(req, res, file);
    }
    /* Custom web wallpaper proxy -> same-origin so touch shim works */
    if (p === '/api/wallpaper/proxy' && method === 'GET') {
      try {
        const r = await fetchRemote(u.searchParams.get('url') || '', 0);
        const body = Buffer.from(injectHtml(r.html, { id: 'custom-web', src: 'url', title: '自定义网页壁纸', kind: 'web', props: {}, interactive: true }, r.url), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
        return res.end(body);
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<html><body style="background:#0b1120;color:#e8eefc;font:14px sans-serif;padding:40px">无法加载这个网页壁纸：' + escapeAttr(e.message) + '<br><br>部分网站禁止被嵌入（X-Frame-Options / CSP）。</body></html>');
      }
    }
    if (p === '/api/wallpaper/workshop' && method === 'GET') {
      try { return sendJson(res, 200, { ok: true, items: await wallpaper.workshopDetails(u.searchParams.get('id') || '') }); }
      catch (e) { return sendJson(res, 200, { ok: false, error: e.message, items: [] }); }
    }
    if (p === '/api/wallpaper/workshop/download' && method === 'POST') {
      const b = await readBody(req);
      try { return sendJson(res, 200, await wallpaper.downloadWorkshop(b.id || b.url || '')); }
      catch (e) { return sendJson(res, 200, { ok: false, error: e.message }); }
    }
    if (p === '/api/wallpaper/shim.js' && method === 'GET') {
      const body = Buffer.from(shimSource(), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': body.length });
      return res.end(body);
    }

    if (p.startsWith('/api/')) { res.writeHead(404); return res.end('Unknown API'); }
    return serveStatic(res, p);
  } catch (err) {
    return sendJson(res, 500, { error: String(err && err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Morse Code Workbench 2.0 is running');
  console.log('  App       : http://' + HOST + ':' + PORT + '/');
  console.log('  Wallpaper : http://' + HOST + ':' + PORT + '/?wallpaper=1');
  try {
    const st = wallpaper.status();
    console.log('  Wallpaper Engine dirs : ' + (st.dirs || []).length);
    console.log('  Wallpapers found      : ' + (st.items || []).length + ' (' + st.playableCount + ' playable)');
  } catch (e) { console.log('  Wallpaper scan: ' + e.message); }
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
