// ═══════════════════════════════════════════════════════════
// 사진 보관 — 찍은 사진을 브라우저에 저장한다
// ═══════════════════════════════════════════════════════════
//  · IndexedDB 'ai-shot-photos'. 어디로도 전송하지 않는다.
//  · 사진은 Blob 그대로 넣는다. dataURL 로 바꾸면 용량이 33% 늘고 느리다.
//
// 스토어를 둘로 나눈 이유 (v2)
//   'photos'    메타 + 썸네일(작은 Blob)   — 목록이 읽는 쪽
//   'originals' 원본 Blob                  — 크게 볼 때·내려받을 때만 읽는다
//
//   갤러리가 원본을 통째로 열면 폰에서 버틴다는 보장이 없다. 1280×720 JPEG
//   한 장을 디코딩하는 비용이 320px 썸네일의 십수 배라, 사진이 쌓일수록
//   스크롤이 먼저 죽는다. 목록은 썸네일만 만지고 원본은 건드리지 않는다.
//
// v1 호환
//   예전 레코드는 'photos' 안에 원본 blob 을 직접 들고 있고 썸네일이 없다.
//   업그레이드 때 옮기지 않는다 — 수백 MB 를 versionchange 트랜잭션에서
//   나르면 그 동안 앱이 멈춘다. 읽는 쪽에서 blob 이 있으면 그걸 쓴다.
//
// 레코드 (photos): { id, thumb, w, h, at, trigger, effect, mirrored }
//   id      정렬 가능한 문자열 (시각 + 난수)
//   thumb   긴 변 THUMB_MAX 로 줄인 JPEG Blob (v1 레코드에는 없다)
//   at      ISO 문자열
//   trigger 무엇으로 찍혔는지 (화면 표시용 문구)
//   effect  배경 효과 이름 (off | erase | blur | green | blue)

const DB_NAME = 'ai-shot-photos', VER = 2;
const META = 'photos', ORIG = 'originals';

export const THUMB_MAX = 320;      // 썸네일 긴 변 (px)
export const THUMB_QUALITY = 0.72;

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, VER);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ORIG)) db.createObjectStore(ORIG, { keyPath: 'id' });
    };
    rq.onsuccess = () => {
      // 다른 탭이 더 높은 버전으로 열면 이쪽 연결을 닫아 준다.
      // 안 닫으면 그 탭의 업그레이드가 영원히 blocked 상태로 멈춘다.
      rq.result.onversionchange = () => { try { rq.result.close(); } catch (e) {} dbp = null; };
      res(rq.result);
    };
    rq.onerror = () => { dbp = null; rej(rq.error); };
    rq.onblocked = () => { /* 다른 탭이 옛 버전을 쥐고 있다 — 닫히면 이어진다 */ };
  });
  return dbp;
}

// 스토어 하나를 읽고 쓰는 짧은 트랜잭션
function tx(store, mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }));
}

// 메타와 원본을 한 트랜잭션에서 함께 건드린다 — 둘 중 하나만 남는 일이 없다
function tx2(mode, fn) {
  return open().then(db => new Promise((res, rej) => {
    const t = db.transaction([META, ORIG], mode);
    let out;
    try { out = fn(t.objectStore(META), t.objectStore(ORIG)); }
    catch (e) { rej(e); return; }
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('aborted'));
  }));
}

// 용량이 차서 실패한 것인지 — 부르는 쪽이 다른 말을 해 줘야 한다
export function isQuotaError(e) {
  if (!e) return false;
  return e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (typeof e.message === 'string' && /quota/i.test(e.message));
}

// 시각순으로 정렬되는 id — 같은 밀리초에 여러 장(연사)이 들어와도 안 겹친다
function newId() {
  return String(Date.now()).padStart(14, '0') + '-' +
    Math.random().toString(36).slice(2, 7);
}

// ── 저장소 등급 ──
// 부르지 않으면 IndexedDB 는 best-effort 등급이라, 기기 용량이 빠듯해지면
// 브라우저가 통째로 지워 버린다. 수업 중에 찍은 사진과 가르친 모델이 예고
// 없이 사라지는 경로가 바로 이것이다. 한 번은 반드시 요청한다.
export async function requestPersist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (e) { return false; }
}

// 남은 용량 (모르면 null)
export async function estimate() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const e = await navigator.storage.estimate();
    if (!e || !e.quota) return null;
    return { usage: e.usage || 0, quota: e.quota, ratio: (e.usage || 0) / e.quota };
  } catch (e) { return null; }
}

export function formatBytes(n) {
  if (!n && n !== 0) return '';
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 10 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}

export const Photos = {
  // blob 원본, thumb 썸네일(없으면 원본을 목록에서도 쓴다)
  async add(blob, thumb, meta) {
    const rec = Object.assign({
      id: newId(),
      at: new Date().toISOString(),
      w: 0, h: 0, trigger: '', effect: 'off', mirrored: true,
    }, meta || {});
    rec.thumb = thumb || null;
    delete rec.blob;                       // 메타 쪽에는 원본을 두지 않는다

    await tx2('readwrite', (m, o) => {
      o.put({ id: rec.id, blob });
      m.put(rec);
    });
    return rec;
  },

  // 최근에 찍은 것이 먼저 온다. 원본은 읽지 않는다.
  async list() {
    const a = await tx(META, 'readonly', s => s.getAll());
    return (a || []).sort((x, y) => (y.id || '').localeCompare(x.id || ''));
  },

  async get(id) { return tx(META, 'readonly', s => s.get(id)); },

  // 원본 Blob. v1 레코드는 메타 쪽에 blob 을 들고 있으므로 그쪽도 본다.
  async original(id) {
    const row = await tx(ORIG, 'readonly', s => s.get(id));
    if (row && row.blob) return row.blob;
    const legacy = await this.get(id);
    return (legacy && legacy.blob) || null;
  },

  // 목록에 걸 그림 — 썸네일이 있으면 썸네일, 옛 레코드면 원본
  thumbOf(rec) {
    if (!rec) return null;
    return rec.thumb || rec.blob || null;
  },

  async remove(id) {
    return tx2('readwrite', (m, o) => { m.delete(id); o.delete(id); });
  },

  async clear() {
    return tx2('readwrite', (m, o) => { m.clear(); o.clear(); });
  },

  async count() { return tx(META, 'readonly', s => s.count()); },
};

// 파일 이름: aishot-20260903-142530-ab12.jpg
export function fileNameOf(rec) {
  const d = new Date(rec.at || Date.now());
  const p = n => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  const tail = String(rec.id || '').split('-')[1] || '0000';
  return 'aishot-' + stamp + '-' + tail + '.jpg';
}

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 한 장 내려받기 — 원본을 그때 꺼낸다
export async function download(rec) {
  const blob = await Photos.original(rec.id);
  if (!blob) throw new Error('missing');
  saveBlob(blob, fileNameOf(rec));
}

// 전부 zip 하나로 (JSZip 전역)
//
// compression 을 STORE 로 두는 것이 핵심이다. JPEG 는 이미 압축된 데이터라
// DEFLATE 를 걸어도 크기는 거의 그대로인데 CPU 와 메모리만 몇 배로 쓴다.
// streamFiles 는 파일을 통째로 들고 있지 않게 해 준다.
//
// onProgress(done, total) 로 진행 상황을 넘긴다 — 수백 장이면 시간이 걸린다.
export async function downloadAllZip(recs, onProgress) {
  const zip = new JSZip();
  let done = 0;
  for (const r of recs) {
    const blob = await Photos.original(r.id);
    if (blob) zip.file(fileNameOf(r), blob);
    done++;
    if (onProgress) onProgress(done, recs.length);
  }
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'STORE',
    streamFiles: true,
  });
  saveBlob(blob, 'aishot-photos.zip');
}

// ── 썸네일 만들기 ──
// 찍는 쪽에서 합성이 끝난 캔버스를 그대로 넘긴다. 원본을 다시 디코딩하지
// 않으므로 촬영 흐름이 끊기지 않는다.
export function makeThumb(srcCanvas) {
  const w = srcCanvas.width, h = srcCanvas.height;
  if (!w || !h) return Promise.resolve(null);
  const scale = Math.min(1, THUMB_MAX / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const cv = document.createElement('canvas');
  cv.width = tw; cv.height = th;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(srcCanvas, 0, 0, tw, th);
  return new Promise(res => cv.toBlob(res, 'image/jpeg', THUMB_QUALITY));
}
