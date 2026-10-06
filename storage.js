/* تخزين دائم + نسخ localStorage إلى IndexedDB واستعادتها إن مُسحت */
(function () {
  'use strict';
  var DB_NAME = 'pwa-ls-backup', STORE = 'kv', KEY = 'localStorage', MARK = '__pwa_mark';
  var ls;
  try { ls = window.localStorage; ls.length; } catch (e) { return; }

  // هل مُسحت localStorage؟ (العلامة غائبة) — تُحسب قبل أي كتابة
  var wiped = false;
  try { wiped = ls.getItem(MARK) === null; ls.setItem(MARK, '1'); } catch (e) {}

  // طلب التخزين الدائم
  function persist() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  }
  persist();
  document.addEventListener('pointerdown', persist, { once: true, capture: true });

  // IndexedDB
  function open() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function idbGet() {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var q = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        q.onsuccess = function () { res(q.result || null); };
        q.onerror = function () { rej(q.error); };
      });
    });
  }
  function idbPut(v) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, KEY);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  var ready = false, timer = 0, dirty = false;
  function snapshot() {
    var o = {};
    try { for (var i = 0; i < ls.length; i++) { var k = ls.key(i); o[k] = ls.getItem(k); } } catch (e) {}
    return o;
  }
  function flush() {
    clearTimeout(timer); timer = 0;
    if (!ready) { dirty = true; return; }
    dirty = false;
    idbPut(snapshot()).catch(function () {});
  }
  function schedule() {
    if (timer) return;
    timer = setTimeout(flush, 800);
  }

  // اعتراض الكتابة لنسخها تلقائيًا (دون تغيير سلوكها)
  try {
    var P = Storage.prototype, s0 = P.setItem, r0 = P.removeItem, c0 = P.clear;
    P.setItem = function () { var r = s0.apply(this, arguments); if (this === ls) schedule(); return r; };
    P.removeItem = function () { var r = r0.apply(this, arguments); if (this === ls) schedule(); return r; };
    P.clear = function () { var r = c0.apply(this, arguments); if (this === ls) schedule(); return r; };
  } catch (e) {}

  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  addEventListener('pagehide', flush);

  // الاستعادة
  idbGet().then(function (bk) {
    var restored = false;
    if (wiped && bk && typeof bk === 'object') {
      try {
        Object.keys(bk).forEach(function (k) {
          if (k === MARK) return;
          ls.setItem(k, bk[k]); restored = true;
        });
      } catch (e) {}
    }
    ready = true;
    if (restored && !sessionStorage.getItem('__pwa_restored')) {
      try { sessionStorage.setItem('__pwa_restored', '1'); } catch (e) {}
      idbPut(snapshot()).catch(function () {}).then(function () { location.reload(); });
      return;
    }
    flush();
  }).catch(function () { ready = true; if (dirty) flush(); });

  window.pwaStorage = { flush: flush, backup: idbGet };
})();
