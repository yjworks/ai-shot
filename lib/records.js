// ═══════════════════════════════════════════════════════════
// 이 기기에 남기는 기록 — 이름 옮기기 · 전체 삭제
// ═══════════════════════════════════════════════════════════
// dibrain.dev 는 모든 앱이 같은 출처(origin)를 쓴다. localStorage·IndexedDB·
// Cache 가 한 통에 들어 있으므로, 이 앱이 쓰는 것은 전부 'ai-shot' 으로 시작한다
// (블로그 저장소 brand/README.md "기록 전체 삭제").
//
//  localStorage   ai-shot:language        언어 (i18n.js)
//                 ai-shot:tour-<페이지>    안내를 한 번 봤는지 (tour.js)
//  sessionStorage ai-shot:fs              전체화면을 켜 두었는지 (nav.js, 탭 하나 동안)
//  IndexedDB      ai-shot-photos          사진 보관함 (photos.js)
//                 ai-shot-models          가르친 동작 목록 (store.js)
//                 tensorflowjs 안의 ai-shot-model-*   가르친 동작의 가중치 (tf.js 가 DB 이름을
//                                         정한다. 다른 앱과 같이 쓰는 DB 라 통째로 지우지 않고
//                                         우리 키만 지운다)
//  Cache          ai-shot-shell-* · ai-shot-runtime-*   서비스 워커(sw.js)가 붙잡아 둔 앱 코드와
//                                         모델 파일. 기록이 아니므로 전체 삭제에서도 두고 간다.
//
// 이 파일은 다른 스크립트보다 먼저 읽힌다 — 옛 이름을 새 이름으로 옮긴 뒤에
// i18n.js · tour.js · nav.js 가 새 이름으로 읽게 하려는 것이다.

(function () {
  var NS = 'ai-shot:';

  // ── 옛 이름 → 새 이름 (한 번만) ──
  // 옛 이름은 모두 이 앱만 쓰던 것이라 옮긴 뒤 지운다.
  function move(store, from, to) {
    try {
      var v = store.getItem(from);
      if (v === null) return;
      if (store.getItem(to) === null) store.setItem(to, v);
      store.removeItem(from);
    } catch (e) { /* 저장소를 못 쓰는 브라우저 — 옮길 것도 없다 */ }
  }
  function keysOf(store) {
    var out = [];
    try { for (var i = 0; i < store.length; i++) out.push(store.key(i)); } catch (e) {}
    return out;
  }

  move(localStorage, 'ai-shot-language', NS + 'language');
  keysOf(localStorage).forEach(function (k) {
    if (k && k.indexOf('gl-tour-') === 0) move(localStorage, k, NS + 'tour-' + k.slice(8));
  });
  try { move(sessionStorage, 'gl-fs', NS + 'fs'); } catch (e) {}

  // ── 전체 삭제 ──
  // 옛 이름(ai-shot-language, gl-tour-*, gl-fs)도 이 앱만 쓰던 것이라 같이 지운다.
  var LEGACY_LS = /^(ai-shot-language$|gl-tour-)/;
  var LEGACY_SS = /^gl-fs$/;
  var DBS = ['ai-shot-photos', 'ai-shot-models'];
  var TF_PREFIXES = ['indexeddb://ai-shot-model-'];

  function clearStore(store, legacy) {
    keysOf(store)
      .filter(function (k) { return k && (k.indexOf(NS) === 0 || legacy.test(k)); })
      .forEach(function (k) { try { store.removeItem(k); } catch (e) {} });
  }

  // 결과: 'ok' | 'blocked' (다른 탭이 쥐고 놓지 않음) | 'error'
  // 이 앱의 연결은 versionchange 를 받으면 스스로 닫는다(photos.js · store.js).
  // 옛 코드가 도는 다른 탭이 있으면 blocked 가 나는데, 그때는 몇 초 기다려 본다.
  function dropDB(name) {
    return new Promise(function (res) {
      var done = false, timer = null;
      function end(v) { if (done) return; done = true; clearTimeout(timer); res(v); }
      var rq;
      try { rq = indexedDB.deleteDatabase(name); } catch (e) { end('error'); return; }
      rq.onsuccess = function () { end('ok'); };
      rq.onerror = function () { end('error'); };
      rq.onblocked = function () { timer = setTimeout(function () { end('blocked'); }, 4000); };
    });
  }

  // tf.js 의 'tensorflowjs' DB 는 이름을 우리가 정할 수 없어 다른 앱과 겹칠 수 있다.
  // 통째로 지우지 않고 우리 접두사의 모델만 tf.io 로 지운다.
  function dropTfModels() {
    if (!(window.tf && tf.io && tf.io.listModels)) return Promise.resolve();
    var has = (indexedDB.databases
      ? indexedDB.databases().then(function (l) { return l.some(function (d) { return d.name === 'tensorflowjs'; }); })
      : Promise.resolve(true)).catch(function () { return true; });
    return has.then(function (yes) {
      if (!yes) return;   // 없는 DB 를 listModels 가 새로 만들지 않게
      return tf.io.listModels().then(function (all) {
        var urls = Object.keys(all || {}).filter(function (u) {
          return TF_PREFIXES.some(function (p) { return u.indexOf(p) === 0; });
        });
        return Promise.all(urls.map(function (u) { return tf.io.removeModel(u).catch(function () {}); }));
      });
    }).catch(function () {});
  }

  function clearKeys() {
    clearStore(localStorage, LEGACY_LS);
    try { clearStore(sessionStorage, LEGACY_SS); } catch (e) {}
  }

  function clearAll() {
    clearKeys();
    return dropTfModels().then(function () {
      return Promise.all(DBS.map(dropDB));
    }).then(function (r) {
      // 버튼을 누른 그 터치로 전체화면이 다시 켜지면(nav.js) 그 사이 ai-shot:fs 가 다시 쓰인다.
      // DB 를 지우는 동안 생긴 키까지 마지막에 한 번 더 지운다.
      clearKeys();
      return r.indexOf('blocked') >= 0 ? 'blocked' : (r.indexOf('error') >= 0 ? 'error' : 'ok');
    });
  }

  window.AIShotRecords = { clearAll: clearAll };

  // ── 맨 아래 줄의 버튼 (#dbReset, 갤러리) ──
  function wire() {
    var b = document.getElementById('dbReset');
    if (!b) return;
    var T = function (s) { return typeof GL_T === 'function' ? GL_T(s) : s; };
    b.addEventListener('click', function () {
      if (!confirm(T('이 앱에 저장된 기록을 모두 지웁니다(사진 보관함, 가르친 동작, 언어·안내 설정). 되돌릴 수 없습니다. 계속할까요?'))) return;
      b.disabled = true;
      clearAll().then(function (r) {
        if (r !== 'ok') alert(T('다른 탭에 AI 샷이 열려 있어 다 지우지 못했을 수 있어요. 그 탭을 닫고 한 번 더 눌러 주세요.'));
      }, function () {}).then(function () { location.reload(); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
