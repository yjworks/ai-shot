// ═══════════════════════════════════════════════════════════
// 상단 바 — DigitalBrain 공통 상단 바(.db-bar, css/db-tokens.css)
// ═══════════════════════════════════════════════════════════
// 왼쪽: 브랜드 마크(누르면 https://dibrain.dev/ 첫 화면) + 앱 이름.
// 오른쪽: 도움말(tour.js) · 전체화면 · 언어(i18n.js) — 전부 .db-btn.
//
// 카메라 화면에는 탭을 두지 않는다. 갤러리는 셔터 옆 썸네일 버튼으로 간다
// (카메라 앱이 그렇게 한다). 갤러리 화면에만 돌아가기 버튼을 둔다.
//
// 클래스 이름은 바꾸지 말 것 — css/db-tokens.css 와 css/app.css 가 그대로 입혀진다.

(function () {
  const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);
  const header = document.querySelector('header[data-tab]');
  if (!header) return;
  const cur = header.getAttribute('data-tab');
  const isApp = cur === 'index.html';

  // 브랜드 마크 — 경로는 brand/README.md "마크 경로" 그대로 (색·모양 바꾸지 말 것)
  const home = document.createElement('a');
  home.className = 'db-home';
  home.href = 'https://dibrain.dev/';
  home.setAttribute('aria-label', T('DigitalBrain 첫 화면'));
  home.innerHTML = '<svg viewBox="0 0 96 96" aria-hidden="true"><rect width="96" height="96" rx="22" fill="#2f6fed"/><path fill="#fff" d="M25.5 24H40.5a3.5 3.5 0 0 1 3.5 3.5V68.5a3.5 3.5 0 0 1-3.5 3.5H25.5a3.5 3.5 0 0 1-3.5-3.5V27.5a3.5 3.5 0 0 1 3.5-3.5Z M49 23.2a24.8 24.8 0 0 1 0 49.6Z"/></svg>';
  header.appendChild(home);

  // 갤러리에서는 카메라로 돌아가는 버튼이 이름 앞에 온다
  if (!isApp) {
    const back = document.createElement('a');
    back.className = 'db-btn';
    back.href = 'index.html';
    back.innerHTML = '<i class="fa-solid fa-chevron-left" aria-hidden="true"></i>';
    back.title = T('카메라');
    back.setAttribute('aria-label', T('카메라'));
    header.appendChild(back);
  }

  const txt = document.createElement('span');
  txt.className = 'db-title';
  txt.textContent = T(isApp ? 'AI 샷' : '갤러리');
  header.appendChild(txt);

  if (isApp) {
    const engine = document.createElement('span');
    engine.id = 'engine';
    engine.setAttribute('role', 'status');
    engine.textContent = T('준비 중…');
    header.appendChild(engine);
  }

  const sp = document.createElement('span');
  sp.className = 'db-sp';
  header.appendChild(sp);

  // 전체화면 (지원하는 브라우저에서만 — 아이폰 사파리는 미지원)
  // 페이지를 이동하면 브라우저가 전체화면을 강제로 풀기 때문에,
  // 켜 둔 상태를 기억했다가 다음 페이지의 첫 터치에서 다시 켠다.
  if (document.documentElement.requestFullscreen) {
    const FS_KEY = 'gl-fs';
    const remember = v => { try { v ? sessionStorage.setItem(FS_KEY, '1') : sessionStorage.removeItem(FS_KEY); } catch (e) {} };
    const wanted = () => { try { return sessionStorage.getItem(FS_KEY) === '1'; } catch (e) { return false; } };

    const fs = document.createElement('button');
    fs.className = 'db-btn';
    fs.id = 'fsBtn';
    fs.type = 'button';
    fs.title = T('전체화면');
    fs.setAttribute('aria-label', T('전체화면'));
    fs.innerHTML = '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
    fs.addEventListener('click', function () {
      if (document.fullscreenElement) { remember(false); document.exitFullscreen(); }
      else document.documentElement.requestFullscreen().catch(function () {});
    });
    document.addEventListener('fullscreenchange', function () {
      const on = !!document.fullscreenElement;
      remember(on);
      fs.innerHTML = on
        ? '<i class="fa-solid fa-compress" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-expand" aria-hidden="true"></i>';
      fs.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    header.appendChild(fs);

    // 주의: 터치 기기에서 pointerdown 은 사용자 활성화 권한이 없어서
    // requestFullscreen 이 거부된다 — touchend/click 에 걸어야 한다.
    if (wanted()) {
      const revive = function () {
        document.removeEventListener('click', revive, true);
        document.removeEventListener('touchend', revive, true);
        if (!document.fullscreenElement && wanted()) {
          document.documentElement.requestFullscreen().catch(function () {});
        }
      };
      document.addEventListener('click', revive, true);
      document.addEventListener('touchend', revive, true);
    }
  }
})();
