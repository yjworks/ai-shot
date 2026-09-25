// ═══════════════════════════════════════════════════════════
// 갤러리 — 찍은 사진 + 내가 가르친 제스처
// ═══════════════════════════════════════════════════════════
//  · 목록은 썸네일만 만진다. 원본은 크게 볼 때·내려받을 때만 꺼낸다 —
//    1280×720 을 수십 장 동시에 디코딩하면 폰에서 스크롤이 먼저 죽는다.
//  · objectURL 은 화면에 걸 때만 만들고, 지우거나 페이지를 떠날 때 반드시
//    되돌려준다 (안 그러면 메모리가 샌다).
//  · 제스처(모델)는 센스 랩과 같은 저장 형식이라 zip 을 그대로 주고받는다.

import {
  Photos, download, downloadAllZip,
  estimate, formatBytes, requestPersist,
} from './photos.js';
import { Store, exportZip, importZip } from './store.js';
import { SOURCE_LABELS } from './features.js';

const $ = id => document.getElementById(id);
const T = s => (typeof GL_T === 'function' ? GL_T(s) : s);

let photos = [];          // [{ rec, url }]  url 은 썸네일
let viewing = null;       // { rec, url }    url 은 원본
let viewUrl = null;

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// ═══ 저장 공간 ═══
// 브라우저가 용량 압박을 받으면 IndexedDB 를 통째로 비운다. 얼마나 남았는지
// 보이지 않으면 수업 중에 사진이 사라지고 나서야 알게 된다.
async function renderStorage() {
  const bar = $('stBar'), fill = $('stFill'), txt = $('stTxt');
  if (!bar) return;
  const e = await estimate();
  if (!e) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  const pct = Math.min(100, Math.round(e.ratio * 100));
  fill.style.width = pct + '%';
  bar.classList.toggle('warn', e.ratio >= 0.9);
  txt.textContent = formatBytes(e.usage) + ' / ' + formatBytes(e.quota) + ' (' + pct + '%)';
}

// ═══ 사진 ═══
function freePhotos() {
  photos.forEach(p => URL.revokeObjectURL(p.url));
  photos = [];
}

async function loadPhotos() {
  freePhotos();
  let recs = [];
  try { recs = await Photos.list(); } catch (e) { console.error(e); }
  photos = recs.map(rec => {
    const src = Photos.thumbOf(rec);
    return { rec, url: src ? URL.createObjectURL(src) : '' };
  });
  renderPhotos();
}

function renderPhotos() {
  const grid = $('phGrid');
  grid.innerHTML = '';
  photos.forEach(p => {
    const cell = document.createElement('button');
    cell.className = 'shot';
    cell.type = 'button';
    cell.title = fmtDate(p.rec.at) + (p.rec.trigger ? ' · ' + p.rec.trigger : '');
    const im = document.createElement('img');
    im.src = p.url;
    im.alt = '';
    im.loading = 'lazy';
    im.decoding = 'async';
    cell.appendChild(im);
    if (p.rec.trigger) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = p.rec.trigger;
      cell.appendChild(tag);
    }
    cell.addEventListener('click', () => openViewer(p));
    grid.appendChild(cell);
  });
  const n = photos.length;
  $('phEmpty').style.display = n ? 'none' : '';
  $('phCount').textContent = n ? T('N장').replace('N', n) : '';
  $('phZip').disabled = !n;
  $('phClear').disabled = !n;
  renderStorage();
}

// 크게 보기 — 여기서 처음으로 원본을 꺼낸다
async function openViewer(p) {
  viewing = p;
  $('vMeta').textContent = fmtDate(p.rec.at) +
    (p.rec.trigger ? ' · ' + p.rec.trigger : '') +
    (p.rec.w ? ' · ' + p.rec.w + '×' + p.rec.h : '');
  // 원본이 오기 전까지는 썸네일을 늘려 보여 준다 (빈 화면이 깜빡이지 않게)
  $('vImg').src = p.url;
  $('viewer').classList.add('on');

  let blob = null;
  try { blob = await Photos.original(p.rec.id); }
  catch (e) { console.error(e); }
  if (viewing !== p) return;              // 그새 닫혔거나 다른 사진을 열었다
  if (!blob) { toast(T('사진을 열지 못했어요')); return; }
  if (viewUrl) URL.revokeObjectURL(viewUrl);
  viewUrl = URL.createObjectURL(blob);
  $('vImg').src = viewUrl;
}

function closeViewer() {
  viewing = null;
  $('viewer').classList.remove('on');
  $('vImg').removeAttribute('src');
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
}

async function delPhoto(p) {
  try {
    await Photos.remove(p.rec.id);
    URL.revokeObjectURL(p.url);
    photos = photos.filter(x => x !== p);
    renderPhotos();
    toast(T('지웠어요'));
  } catch (e) {
    console.error(e);
    toast(T('지우지 못했어요'));
  }
}

// ═══ 내가 가르친 동작 ═══
// 폰에서 표는 못 읽는다. 카드 한 줄에 이름·요약·버튼만 둔다.
async function loadModels() {
  let list = [];
  try { list = await Store.list(); } catch (e) { console.error(e); }
  const box = $('mdList');
  box.innerHTML = '';
  $('mdEmpty').style.display = list.length ? 'none' : '';

  list.forEach(m => {
    const total = (m.sampleCount || []).reduce((a, b) => a + b, 0);
    const card = document.createElement('div');
    card.className = 'mdcard';

    const info = document.createElement('div');
    info.className = 'mi';
    const nm = document.createElement('div');
    nm.className = 'mn';
    nm.textContent = m.name;
    const sub = document.createElement('div');
    sub.className = 'ms';
    sub.textContent = [
      T(SOURCE_LABELS[m.source] || m.source || ''),
      (m.classes || []).join(' · '),
      total + T('장'),
      m.accuracy != null ? Math.round(m.accuracy * 100) + '%' : null,
    ].filter(Boolean).join(' | ');
    info.appendChild(nm);
    info.appendChild(sub);
    card.appendChild(info);

    const acts = document.createElement('div');
    acts.className = 'ma';
    const mk = (icon, title, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'db' + (cls ? ' ' + cls : '');
      b.type = 'button';
      b.title = T(title);
      b.innerHTML = '<i class="fa-solid ' + icon + '"></i>';
      b.addEventListener('click', fn);
      acts.appendChild(b);
    };

    mk('fa-graduation-cap', '이어서 배우기', '', () => {
      location.href = 'index.html?load=' + encodeURIComponent(m.name);
    });
    mk('fa-file-export', '내보내기', '', async () => {
      try { await exportZip(m.name); } catch (e) { console.error(e); toast(T('내보내지 못했어요')); }
    });
    mk('fa-pen', '이름 바꾸기', '', async () => {
      const to = prompt(T('새 이름'), m.name);
      if (!to || to.trim() === m.name) return;
      try { await Store.rename(m.name, to.trim()); toast(T('이름을 바꿨어요')); loadModels(); }
      catch (e) { toast(e && e.message === 'exists' ? T('같은 이름이 이미 있어요') : T('바꾸지 못했어요')); }
    });
    mk('fa-trash', '지우기', 'danger', async () => {
      if (!confirm(T('정말 지울까요?') + '\n' + m.name)) return;
      try { await Store.remove(m.name); toast(T('지웠어요')); loadModels(); }
      catch (e) { console.error(e); toast(T('지우지 못했어요')); }
    });

    card.appendChild(acts);
    box.appendChild(card);
  });
}

// ═══ zip 불러오기 ═══
async function takeFile(file) {
  if (!file) return;
  if (!/\.zip$/i.test(file.name)) { toast(T('zip 파일만 넣을 수 있어요')); return; }
  try {
    const rec = await importZip(file);
    toast(T('불러왔어요') + ': ' + rec.name);
    loadModels();
  } catch (e) {
    console.error(e);
    toast(T('불러오지 못했어요. 내보낸 zip 이 맞나요?'));
  }
}

// ═══ 이벤트 ═══
$('phZip').addEventListener('click', async () => {
  if (!photos.length) return;
  const btn = $('phZip');
  btn.disabled = true;
  try {
    await downloadAllZip(photos.map(p => p.rec), (done, total) => {
      // 수백 장이면 시간이 걸린다 — 멈춘 것처럼 보이지 않게 숫자를 보여 준다
      toast(T('모으는 중 D/T').replace('D', done).replace('T', total));
    });
    toast(T('zip 을 만들었어요'));
  } catch (e) {
    console.error(e);
    toast(T('내보내지 못했어요'));
  }
  btn.disabled = false;
});

$('phClear').addEventListener('click', async () => {
  if (!photos.length) return;
  if (!confirm(T('사진을 전부 지울까요? 되돌릴 수 없어요.'))) return;
  try {
    await Photos.clear();
    freePhotos();
    renderPhotos();
    toast(T('전부 지웠어요'));
  } catch (e) { console.error(e); toast(T('지우지 못했어요')); }
});

$('vClose').addEventListener('click', closeViewer);
$('viewer').addEventListener('click', e => { if (e.target === $('viewer')) closeViewer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeViewer(); });
$('vDown').addEventListener('click', async () => {
  if (!viewing) return;
  try { await download(viewing.rec); }
  catch (e) { console.error(e); toast(T('내려받지 못했어요')); }
});
$('vDel').addEventListener('click', async () => {
  if (!viewing) return;
  if (!confirm(T('이 사진을 지울까요?'))) return;
  const p = viewing;
  closeViewer();
  await delPhoto(p);
});

const dz = $('dropZone');
dz.addEventListener('click', () => $('impFile').click());
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
dz.addEventListener('dragleave', () => dz.classList.remove('over'));
dz.addEventListener('drop', e => {
  e.preventDefault();
  dz.classList.remove('over');
  takeFile(e.dataTransfer.files && e.dataTransfer.files[0]);
});
$('impFile').addEventListener('change', e => {
  takeFile(e.target.files && e.target.files[0]);
  e.target.value = '';
});

window.addEventListener('pagehide', () => {
  freePhotos();
  if (viewUrl) { URL.revokeObjectURL(viewUrl); viewUrl = null; }
});

// ═══ 시작 ═══
requestPersist();

loadPhotos().then(() => {
  // 촬영실에서 "#사진id" 로 넘어오면 그 사진을 바로 크게 연다
  const want = decodeURIComponent((location.hash || '').slice(1));
  if (!want) return;
  const hit = photos.find(p => p.rec.id === want);
  if (hit) openViewer(hit);
});
loadModels();
