# 개발·배포 안내

사용자용 소개는 [README.md](./README.md).

## 원칙

- 백엔드 없음 — 전부 정적 파일. 외부 CDN 금지, 라이브러리·모델 전부 셀프호스팅
- 최초 로드 후 오프라인 동작
- 계정명·절대 URL 하드코딩 금지 (전부 상대경로 — 하위 경로 배포 대비)
- 사진·모델은 브라우저 밖으로 나가지 않는다. 업로드 경로를 만들지 말 것

## 실행

`file://` 로는 못 연다. http 로 서빙할 것.

```bash
python3 -m http.server 8080      # 또는 npx http-server -p 8080
```

MIME 이 틀리면 wasm 스트리밍 컴파일이 실패한다:
`.wasm` → `application/wasm`, `.task`/`.tflite` → `application/octet-stream`,
`.mjs` → `text/javascript`.

## 구조

```
index.html      앱 셸 한 장 — 촬영/학습을 시트 안에서 좌우로 넘긴다
gallery.html    사진 + 가르친 동작
sw.js           서비스 워커 — 최초 로드 뒤 오프라인
css/app.css     앱 셸 전부 (색 토큰 내장)
lib/
  app.js          셸 배선 — 판 넘기기·시트·소스 칩·모드에 따른 셔터
  engine.js       카메라·마이크·감지기 (촬영/학습 공용) + cover 맞춤
  mode-shoot.js   촬영 — 트리거 선택, HUD, 게이지, 촬영
  mode-train.js   학습 — 예시 모으기, 학습, 저장
  shutter.js      셔터 상태 기계 (hold → count → shoot → cool)
  photos.js       찍은 사진 저장 (IndexedDB, Blob)
  landmarker.js   MediaPipe 로드/추론 (GPU 실패 시 CPU 폴백)
  sound.js        마이크 + YAMNet (16kHz, 250ms 주기, 521차원)
  features.js     특징 벡터 + 내장 신호 (손 63 / 얼굴 52 / 포즈 75 / 소리 521)
  trainer.js      TF.js 분류기 (Dense32-Dropout-Softmax, CPU 백엔드)
  store.js        모델 저장 + zip 주고받기
  bgfx.js         배경 바꾸기 (셀피 세그멘테이션)
  wakelock.js     카메라가 켜져 있는 동안 화면이 자지 않게
  swreg.js        서비스 워커 등록 (상대경로 — 하위 경로 배포 대비)
  nav.js          떠 있는 상단 바 · i18n.js 한/영 · tour.js 튜토리얼
  gallery.js      갤러리 페이지
vendor/           tasks-vision · tasks-audio · tfjs (셀프호스팅)
models/           hand/face/pose_lite .task · selfie_segmenter · yamnet .tflite
design/           웹 도구 쪽 공용 디자인 킷 (이 앱에서는 쓰지 않는다)
```

### 왜 엔진이 하나인가

촬영과 학습이 한 화면에 있으므로 `getUserMedia` 와 랜드마커는 하나만 둔다.
모드마다 부르면 카메라가 두 번 열리고, 기기에 따라 두 번째가 그냥 실패한다.
`engine.js` 가 프레임마다 한 번 감지해서 두 모드에 같은 결과를 넘긴다.

### 화면 채우기(cover) 와 오버레이

비디오에 `object-fit:cover` 를 걸면 잘린 만큼 랜드마크 오버레이가 어긋난다.
그래서 video 와 캔버스를 `#frame` 한 장에 넣고, `#frame` 을 무대를 덮는
크기로 `engine.fit()` 이 직접 키운다. 셋 다 `#frame` 을 100% 로 채우니 항상
맞는다. 좌우 반전도 `#frame` 에 한 번만 건다 — 개별 요소에 걸지 말 것.

사진은 잘리지 않은 원본 프레임 전체를 저장한다. 화면은 cover 로 잘라
보여 주지만 저장할 때 버릴 이유가 없다.

좌우 방향은 촬영 시트의 **거울로 저장** 토글이 정한다 (기본 켜짐 = 화면에
보이던 그대로). 끄면 카메라가 실제로 본 방향으로 저장된다. 뼈대 선도 같은
변환 안에서 그리므로 어느 쪽이든 영상과 맞는다. 레코드에 `mirrored` 로
남는다.

### 테마

`css/theme-maker.css`(학습지 종이 테마)는 이 앱에서 쓰지 않는다. 흰 종이
바탕 + 흰 헤더 상자 + 명조 제목을 전제하는 문서형 레이아웃용이라, 화면을
카메라로 채우는 앱에는 정반대로 걸린다. 대신 파이보 계열 강조색(`#1F5F7A`)을
`app.css` 안에 그대로 가져와 한 제품으로 보이게 했다.

### 만질 때 주의할 상수

`lib/shutter.js`

- `MISS_GRACE_MS = 220` — 인식은 한두 프레임씩 깜빡인다. 잠깐 놓친 것으로
  유지시간을 되돌리지 않는다. 0 으로 두면 실기기에서 거의 안 찍힌다.
- `BURST_GAP_MS = 420` — 연사 간격
- `cooldownMs = 1500` (`mode-shoot.js` 에서 주입) — 찍은 직후 재발동 차단.
  셔터음이 마이크로 되돌아와 소리 트리거가 연쇄 발동하는 것도 이게 막는다.
  소리 트리거를 쓰면서 줄이면 연쇄 촬영이 난다.
- 타이머(`setTimeout`)를 쓰지 않고 화면 루프에서 굴린다. 탭이 백그라운드로
  가면 타이머는 느려지고 프레임은 멈추는데, 프레임 기준으로 세면 어긋나지
  않는다.

`lib/mode-shoot.js`

- `MODEL_THRESHOLD = 0.75` — 낮추면 잘 찍히고 오발이 늘어난다. 유지시간
  슬라이더가 이미 같은 역할을 하니 그쪽을 먼저 권할 것.

### 저장소

- 사진: IndexedDB `ai-shot-photos` **버전 2**, 스토어 둘.

  | 스토어 | 내용 | 읽는 곳 |
  |---|---|---|
  | `photos` | 메타 + 썸네일(긴 변 320px JPEG) | 갤러리 목록, 방금 찍은 줄 |
  | `originals` | 원본 Blob | 크게 볼 때, 내려받을 때 |

  나눈 이유는 목록이 원본을 건드리지 않게 하려는 것이다. 1280×720 을
  수십 장 동시에 디코딩하면 폰에서 스크롤이 먼저 죽는다. 썸네일은 찍는
  순간 합성이 끝난 캔버스를 줄여 만들므로 추가 디코딩이 없다.

  v1 레코드(`photos` 안에 원본 blob, 썸네일 없음)는 업그레이드 때 옮기지
  **않는다** — 수백 MB 를 versionchange 트랜잭션에서 나르면 그 동안 앱이
  멈춘다. 읽는 쪽(`Photos.original`, `Photos.thumbOf`)이 blob 이 있으면
  그걸 쓴다. 이 폴백을 지울 때는 옛 사진이 전부 사라진다는 뜻이다.

- dataURL 로 바꾸지 말 것 — 용량 33% 늘고 느리다. 화면에 걸 때만
  `createObjectURL` 하고 지울 때·페이지 떠날 때 반드시 `revokeObjectURL`.
- 모델: IndexedDB `sense-lab`. **이 이름을 바꾸지 말 것** — 브라우저가 새 빈
  DB 로 인식해서 이미 저장된 모델이 전부 안 보이게 된다.
- `requestPersist()` 를 두 페이지 시작에서 부른다. 부르지 않으면 저장소가
  best-effort 등급이라 기기 용량이 빠듯해질 때 브라우저가 **통째로 비운다**.
  수업 중 사진과 모델이 예고 없이 사라지는 경로가 이것이다.
- 갤러리 위쪽 막대가 `navigator.storage.estimate()` 로 남은 용량을 보여 준다.
  90% 를 넘으면 촬영 중에도 한 번 알린다. 다 찬 뒤에 말하면 늦다.

### 오프라인 (서비스 워커)

모델과 wasm 만 70MB 가까이 된다(`models/` 21M + `vendor/` 49M). 교실에서
스물몇 대가 같은 와이파이로 매번 다시 받으면 수업이 시작되지 않는다.

`sw.js` 가 두 가지로 나눠 잡는다.

- `models/` `vendor/` `webfonts/` `assets/` → **캐시 우선**. 바뀌지 않는
  파일이라 망에 묻지 않는다. 물어보는 순간 오프라인에서 느려진다.
- html · css · `lib/*.js` → **캐시 먼저 주고 뒤에서 갱신**
  (stale-while-revalidate). 화면은 늘 즉시 뜨고, 새 버전은 다음에 열 때 붙는다.

설치 때는 껍데기만 받는다. 모델까지 미리 받게 하면 설치 한 번에 70MB 라
폰에서 그대로 실패한다. 쓰는 순간 런타임 캐시에 들어가고 그 뒤로 오프라인이다.

`skipWaiting` 은 일부러 쓰지 않는다 — 돌고 있는 화면 밑에서 모듈이 바뀌면
촬영 중에 깨진다. 새 버전은 탭을 모두 닫았다 열 때 올라온다.

**배포할 때 반드시**: 코드를 고쳤으면 `sw.js` 의 `CACHE_VERSION` 을 올린다.
서비스 워커는 `?v=N` 을 무시하고(`ignoreSearch`) 매칭하므로, HTML 쪽
`?v=N` 만 올리면 캐시가 그대로 남는다. 둘 다 손대야 확실히 갈린다.

`SHELL_FILES` 목록도 파일을 더하거나 이름을 바꿀 때 같이 고친다. 빠뜨려도
설치가 실패하지는 않지만(한 장씩 담고 실패는 넘긴다) 그 파일만 오프라인에서
안 뜬다.

### 화면 꺼짐 방지

동작을 유지해서 찍는 앱이라 폰의 화면 자동 꺼짐이 그대로 걸리면 삼각대에
세워 두고 쓰는 방식이 성립하지 않는다. `wakelock.js` 가 카메라를 켤 때 잡고
끌 때 놓는다. 탭이 가려지면 브라우저가 알아서 푸니 다시 보일 때 직접 잡아야
한다 — `visibilitychange` 처리를 지우지 말 것.

## 벤더 파일 갱신

```bash
npm i @mediapipe/tasks-vision @mediapipe/tasks-audio @tensorflow/tfjs
cp node_modules/@mediapipe/tasks-vision/wasm/*             vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-vision/vision_bundle.mjs  vendor/tasks-vision/
cp node_modules/@mediapipe/tasks-audio/wasm/audio_wasm*    vendor/tasks-audio/
cp node_modules/@mediapipe/tasks-audio/audio_bundle.mjs    vendor/tasks-audio/
cp node_modules/@tensorflow/tfjs/dist/tf.min.js            vendor/tfjs/
```

모델은 MediaPipe 공식 저장소에서 받아 `models/` 에. `node_modules` 는 커밋
안 하고, 벤더 파일은 커밋한다.

## 배포

- **GitHub Pages** 만 쓴다: `main` 에 올리면 서빙된다
  (Settings → Pages → Deploy from a branch → `main` / `/ (root)`)
- `.nojekyll` 이 루트에 있어야 한다 — Jekyll 은 `_headers` 같은 밑줄 경로를
  건너뛰고 소스로 판단한 파일을 다시 쓴다
- **Cloudflare 는 보류.** `wrangler.toml`·`.assetsignore` 는 그대로 두었고
  `npx wrangler deploy` 를 실행하지 않는 한 아무 동작도 하지 않는다
  (다시 켤 때 워커 이름은 `ai-shot`)
- 캐시 버스팅: 코드 파일만 `?v=N`. 모델·wasm 에는 붙이지 않는다.
  **`?v=N` 을 올렸으면 `sw.js` 의 `CACHE_VERSION` 도 같이 올린다** (위 참고)

## 오프라인 exe

`v*` 태그를 푸시하면 Actions 가 사이트 전체를 담은 단일 `AIShot.exe` 를
빌드해 Release 에 붙인다 (`.github/workflows/build-exe.yml` +
`tools/portable/` Go embed 서버).

```bash
git tag v0.1.0 && git push origin v0.1.0
```
