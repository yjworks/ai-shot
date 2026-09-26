// ═══════════════════════════════════════════════════════════
// 서비스 워커 — 최초 로드 뒤에는 망 없이도 돌게 한다
// ═══════════════════════════════════════════════════════════
// 이 앱은 모델과 wasm 만 70MB 가까이 된다. 교실에서 스물몇 대가 같은
// 와이파이로 매번 다시 받으면 수업이 시작되지 않고, 망이 끊기면 앱이 아예
// 안 뜬다. 한 번 받은 것은 여기서 붙잡아 둔다.
//
// 두 가지 전략을 쓴다 —
//
//  1) 큰 붙박이 파일 (models/ vendor/ webfonts/ assets/)
//     캐시 우선. 있으면 그대로 주고 망에 묻지 않는다. 내용이 바뀌지 않는
//     파일들이라 다시 확인할 이유가 없고, 확인하는 순간 오프라인에서 느려진다.
//
//  2) 앱 껍데기 (html · css · lib/*.js)
//     캐시를 먼저 주고 뒤에서 조용히 새로 받아 둔다(stale-while-revalidate).
//     그래서 화면은 늘 즉시 뜨고, 다음 번 열 때 새 버전이 적용된다.
//
// 캐시를 통째로 비워야 할 때는 CACHE_VERSION 을 올린다. HTML 의 `?v=N` 은
// 여기서 무시하므로(ignoreSearch), 배포 때 둘 다 손대야 확실히 갈린다.
//
// skipWaiting 은 일부러 쓰지 않는다. 돌고 있는 화면 밑에서 모듈이 바뀌면
// 촬영 중에 깨질 수 있다. 새 버전은 탭을 모두 닫았다 열 때 올라온다.

const CACHE_VERSION = 'v2';
const SHELL = 'aishot-shell-' + CACHE_VERSION;
const RUNTIME = 'aishot-runtime-' + CACHE_VERSION;
const KEEP = [SHELL, RUNTIME];

// 껍데기 — 이것만 설치 때 미리 받는다.
// 모델·wasm 은 넣지 않는다. 설치 한 번에 70MB 를 받게 하면 폰에서 그대로
// 실패한다. 쓰는 순간 런타임 캐시에 들어가고, 그 뒤로는 오프라인이다.
const SHELL_FILES = [
  './',
  './index.html',
  './gallery.html',
  './manifest.webmanifest',

  './css/db-tokens.css',
  './css/app.css',
  './css/all.min.css',
  './assets/fonts/pretendard.css',

  './lib/app.js',
  './lib/gallery.js',
  './lib/engine.js',
  './lib/mode-shoot.js',
  './lib/mode-train.js',
  './lib/shutter.js',
  './lib/photos.js',
  './lib/store.js',
  './lib/features.js',
  './lib/trainer.js',
  './lib/landmarker.js',
  './lib/sound.js',
  './lib/bgfx.js',
  './lib/wakelock.js',
  './lib/nav.js',
  './lib/i18n.js',
  './lib/tour.js',
  './lib/swreg.js',
  './lib/jszip.min.js',

  './vendor/tfjs/tf.min.js',

  './assets/img/favicon.ico',
  './assets/img/favicon.png',
  './assets/img/icon.svg',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png',
  './assets/img/maskable-512.png',
  './assets/img/apple-touch-icon.png',
];

// 한 번 받으면 바뀌지 않는 것들 — 캐시 우선
const IMMUTABLE = /\/(models|vendor|webfonts|assets)\//;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // addAll 은 하나라도 404 면 전부 실패한다. 파일 목록이 코드와 어긋났을 때
    // 설치 자체가 막히면 디버깅이 어려우므로 한 장씩 담고 실패는 넘긴다.
    await Promise.all(SHELL_FILES.map(u => c.add(u).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith('aishot-') && KEEP.indexOf(n) < 0)
      .map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  // opaque 응답(no-cors)은 크기를 알 수 없어 할당량을 크게 먹는다. 같은 출처만 담는다.
  if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fresh) || new Response('', { status: 504 });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 외부 CDN 은 애초에 쓰지 않는다

  // 주소창으로 들어온 페이지 — 망이 없으면 캐시에 있는 문서를 준다
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(SHELL);
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match(req, { ignoreSearch: true })) ||
          (await c.match('./index.html', { ignoreSearch: true })) ||
          new Response('', { status: 504 });
      }
    })());
    return;
  }

  if (IMMUTABLE.test(url.pathname)) {
    e.respondWith(cacheFirst(req, RUNTIME));
    return;
  }

  e.respondWith(staleWhileRevalidate(req, SHELL));
});
