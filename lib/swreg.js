// ═══════════════════════════════════════════════════════════
// 서비스 워커 등록
// ═══════════════════════════════════════════════════════════
// 'sw.js' 를 상대경로로 등록하므로 범위(scope)는 이 페이지가 있는 폴더가
// 된다. 하위 경로 배포(…/ai-shot/)에서도 계정명을 박지 않고 그대로 맞는다.
//
// https 또는 localhost 가 아니면 브라우저가 등록을 거부한다. 개발 중
// http 로 서빙할 때 콘솔이 빨개지지 않도록 조용히 넘긴다.
//
// 로드가 끝난 뒤에 등록하는 것은, 설치가 첫 화면 렌더와 대역폭을 다투지
// 않게 하기 위해서다 — 첫 방문이 느려지면 안 된다.

(function () {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js').catch(function () { /* 조용히 */ });
  });
})();
