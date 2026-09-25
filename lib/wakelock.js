// ═══════════════════════════════════════════════════════════
// 화면 꺼짐 방지 — 손을 들고 기다리는 동안 화면이 자면 안 된다
// ═══════════════════════════════════════════════════════════
// 동작을 유지해서 찍는 앱이라, 폰의 화면 자동 꺼짐이 그대로 걸리면
// 삼각대에 세워 두고 쓰는 방식이 아예 성립하지 않는다.
//
// 주의할 점 두 가지 —
//  · wake lock 은 탭이 가려지면 브라우저가 알아서 푼다. 다시 보일 때
//    직접 잡아 줘야 한다. 그래서 '원하는 상태'(want)를 따로 들고 있다.
//  · 문서가 보이는 상태에서만 요청이 통한다. 카메라를 켜는 순간(사용자가
//    셔터를 누른 직후)에 부르므로 조건은 늘 만족한다.
//
// 지원하지 않는 브라우저(아이폰 사파리 구버전 등)에서는 조용히 아무것도
// 하지 않는다 — 없다고 앱이 덜 돌아가면 안 된다.

export function createWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  let sentinel = null;   // 지금 잡고 있는 잠금
  let want = false;      // 잡고 있어야 하는 상태인가

  async function acquire() {
    if (!supported || sentinel) return false;
    if (document.visibilityState !== 'visible') return false;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      // 브라우저가 스스로 푼 경우에도 손에 든 참조를 비운다
      sentinel.addEventListener('release', () => { sentinel = null; });
      return true;
    } catch (e) {
      sentinel = null;   // 배터리 절약 모드 등에서 거부될 수 있다 — 그대로 둔다
      return false;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (want && document.visibilityState === 'visible') acquire();
  });

  return {
    get supported() { return supported; },
    get held() { return !!sentinel; },

    async request() { want = true; return acquire(); },

    async release() {
      want = false;
      if (!sentinel) return;
      try { await sentinel.release(); } catch (e) { /* 이미 풀렸다 */ }
      sentinel = null;
    },
  };
}
