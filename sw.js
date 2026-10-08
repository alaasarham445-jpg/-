const VERSION = 'v1.3.0';
const CACHE = 'watar-' + VERSION;
const FONT_CACHE = 'watar-fonts';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap';
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'storage.js',
  'check.html',
  'icon-192.png',
  'icon-512.png',
  'maskable-192.png',
  'maskable-512.png',
  'apple-touch-icon.png',
  'favicon-32.png',
  'splash-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(CACHE);
    await Promise.all(FILES.map(function (f) {
      return c.add(new Request(f, { cache: 'reload' }));
    }));
    // الخط: محاولة تخزينه للعمل دون إنترنت (لا تفشل التثبيت إن تعذّر)
    try {
      const fc = await caches.open(FONT_CACHE);
      const r = await fetch(FONT_CSS);
      if (r && r.ok) {
        const css = await r.clone().text();
        await fc.put(FONT_CSS, r);
        const urls = (css.match(/https:\/\/fonts\.gstatic\.com[^)'"\s]+/g) || []);
        await Promise.all(urls.map(function (u) {
          return fetch(u).then(function (x) { if (x && x.ok) return fc.put(u, x); }).catch(function () {});
        }));
      }
    } catch (err) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.filter(function (k) {
      return k !== CACHE && k !== FONT_CACHE;
    }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.headers.has('range')) return;

  // الخطوط: من الذاكرة أولًا ثم الشبكة مع تحديث في الخلفية
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async function () {
      const fc = await caches.open(FONT_CACHE);
      const hit = await fc.match(req);
      const net = fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) fc.put(req, r.clone());
        return r;
      }).catch(function () { return null; });
      return hit || (await net) || Response.error();
    })());
    return;
  }

  if (url.origin !== self.location.origin) return;

  // ملفات الموقع: من الذاكرة فورًا + تحديث في الخلفية؛ وعند الصفحات ارجع إلى index.html دون اتصال
  e.respondWith((async function () {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(function (r) {
      if (r && r.ok) c.put(req, r.clone());
      return r;
    }).catch(function () { return null; });
    if (hit) { e.waitUntil(net); return hit; }
    const r = await net;
    if (r) return r;
    if (req.mode === 'navigate') {
      const idx = await c.match('index.html');
      if (idx) return idx;
    }
    return Response.error();
  })());
});
