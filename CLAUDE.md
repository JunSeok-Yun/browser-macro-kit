Patchright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 코드 수정 요청 시 응답 방식

코드 변경이 필요한 작업을 요청받으면, **직접 파일을 수정하지 말고** 사용자가 스스로 적용할 수 있도록 아래 형식으로 상세히 설명한다:

- 파일 경로와 수정 위치(줄 번호 또는 함수명)를 명시
- 변경 전(Before) / 변경 후(After) 코드를 **각각 별도의 전체 코드 블록**으로 제시 (diff `+`/`-` 표기 대신, 변경 전 블록과 변경 후 블록을 통째로 따로 보여줄 것)
- 한 파일 안에 여러 위치를 수정한다면 위치별로 Before/After 쌍을 나눠 제시
- 각 변경마다 **왜** 이렇게 바꿔야 하는지 이유를 설명
- 여러 파일에 걸친 변경이면 파일별로 섹션을 나누고, 마지막에 변경 파일 목록을 표로 정리

사용자가 명시적으로 "직접 수정해줘" 등으로 요청하기 전까지는 Edit/Write 도구로 파일을 변경하지 않는다.

## 기술 스택

- **언어**: TypeScript (CommonJS, ES2022)
- **자동화**: Patchright (playwright-extra + stealth에서 전환, CDP 패치 내장)
- **런타임**: Node.js
- **프록시**: HaiIP 유동IP (HTTP 프록시, OpenVPN 클라이언트 인증 방식)

## 파일 구조

```
src/
  index.ts              - 메인 진입점. Job 기반 idle 루프(LISTEN/NOTIFY), Job 처리만 담당
  session.ts            - 세션 실행 전담 (runSession, applyRecoveryPolicy, acquireProfileSlotWithRetry, logCookies)
                          시크릿/영구 모드 분기, Edge/Chrome 채널 랜덤 선택, 슬롯 세션 횟수 초기화 포함
  runDiagnostics.ts     - 진단 전용 진입점 (creepjs | pixelscan | canvas [slot])
  utils.ts              - 공통 유틸리티 (sleep, gaussianRandom)

  config/
    env.ts              - 모든 환경변수 단일 관리 (ENV 객체, dotenv 로드)
    target.ts           - 비즈니스 타겟 설정 (DEFAULT_TARGET, buildTargetForCategory)

  core/
    types.ts            - 공유 인터페이스 (ProductItem, ProductTarget, Job, FoundProduct)
    errors.ts           - 커스텀 에러 (ProductNotFoundError, NoLinkFoundError, BlockDetectedError, BlockType — 6종)
    blockDetection.ts   - 차단 감지/분류. assertNotBlocked(SELECTOR_BUG/AKAMAI_BLOCK/AKAMAI_IP_BLOCK/COUPANG_APP_BLOCK),
                          assertPortalNotBlocked(PORTAL_CAPTCHA), classifyNavigationError·safeGoto·withNavigationErrorHandling
    recovery.ts         - BlockType별 복구 정책 테이블 (BLOCK_RECOVERY)

  infra/
    browser.ts          - 브라우저 컨텍스트 팩토리
                          launchContext(내부 헬퍼), createPersistentContext(channel), createIncognitoContext(OS tmpdir)
                          profileDirForSlot, clearProfileCache
                          chromePid: (context as any)._browser?.process?.pid (함수 아닌 프로퍼티)
    proxyManager.ts     - HaiIP 유동IP 연동 (ProxyManager.create() 비동기 팩토리, 인메모리+DB 이중 블랙리스트)
    db.ts               - PostgreSQL 연동 (pg, Pool) — block_log/proxy_stats/query_stats/session_log/jobs/profile_pool
                          releaseProfileSlot(slot, incrementCount), checkAndResetSessionCount(slot, threshold)
    debugCapture.ts     - 차단/진단 시점 페이지 HTML 저장 (saveDebugHtml → debug-html/{type}_{timestamp}.html)
    logger.ts           - 구조화 JSONL 로거. setJobId(jobId) → logs/job-{id}-pid-{pid}.jsonl 기록. slotFrom(profileDir) 헬퍼

  automation/
    keyboard.ts         - 인간형 타이핑 (typeLikeHuman, clearSearchInput)
    mouse.ts            - 베지어 곡선 마우스 이동 (moveMouseAlongCurveAndClick)
    scroll.ts           - 랜덤 스크롤 체류 (randomScrollDwell, scrollToTop)

  gateway/
    index.ts            - 포털 게이트웨이 통합 (runPortalGateway). AKAMAI_BLOCK 재진입, 비AKAMAI_BLOCK 포털 진입 차단 위치 로그
    naver.ts            - 네이버 경유 쿠팡 진입 (runNaverGateway, enterCoupangFromNaverResults)
    google.ts           - 구글 경유 쿠팡 진입 (runGoogleGateway, enterCoupangFromGoogleResults)

  coupang/
    search.ts           - 상품 탐색 로직 (buildSearchQuery, findTargetProduct)
    flow.ts             - 쿠팡 검색 → 상품 진입 시퀀스 (runCoupangSearchFlow)
                          검색/상품 페이지 차단 goBack 재시도, 위치별 차단 로그(BLOCK_AT_SEARCH/BLOCK_PRODUCT_PAGE),
                          분류 불가 오류 HTML 캡처(FLOW_UNKNOWN_ERROR)

  test/
    pixelscan.ts        - pixelscan 봇 탐지 검증 게이트웨이
    checker.ts          - pixelscan 스캔 버튼 클릭 모듈
    creepjs.ts          - CreepJS 지문 분석 결과 텍스트 캡처/저장
    canvas.ts           - Canvas 지문 측정 진단 (browserleaks.com 기반, selfTest + BL Signature)

logs/                   - job-{id}-pid-{pid}.jsonl 구조화 로그, cookies_detail.txt
debug-html/             - 차단 시점 HTML 캡처 (AKAMAI_BLOCK/AKAMAI_IP_BLOCK/PORTAL_CAPTCHA/FLOW_UNKNOWN_ERROR 등)
.env                    - 환경변수
proxies.txt             - HaiIP "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT, 약 2000개)
```

## 단계별 진행 현황

### 0~2.6단계 - 기반 구현 (완료)

- Patchright + Chrome channel, WebRTC 패치, CreepJS 클린 확인
- 레이어드 아키텍처 분리 (config/core/infra/automation/gateway/coupang/test)
- 행동 모방 모듈 (베지어 마우스, 랜덤 스크롤, 인간형 타이핑)
- 다중 상품/키워드-상품 바인딩 구조 (ProductItem.exactNames, 상품별 keywords)
- `buildSearchQuery` — 브랜드+키워드 쌍, fail_count 가중 랜덤

### 3단계 - 메인 루프 및 예외 처리 (완료, 2026-06-11)

#### 차단 유형 분류 및 복구 전략 (`core/recovery.ts`의 `BLOCK_RECOVERY` 테이블)

| 유형 | 감지 방법 | 프록시 교체 | 프로필 교체 | 재시도 |
|---|---|---|---|---|
| `SELECTOR_BUG` | URL에 `link.coupang.com` 포함 (구글 광고 리다이렉트) | ❌ | ✅ | ✅ |
| `AKAMAI_BLOCK` | `Reference #18.` + "don't have permission" — IP 기반 Access Denied | ✅ | ✅ | ✅ (진입 시 goBack 1회, 검색 시 goBack 후 재검색 1회) |
| `AKAMAI_IP_BLOCK` | "Please contact us" + `Client IP` 명시, 또는 Cloudflare "Sorry, you have been blocked" | ✅ | ✅ | ✅ |
| `COUPANG_APP_BLOCK` | JSON `rCode: "RET9999"` | ✅ | ✅ | ✅ |
| `PORTAL_CAPTCHA` | 네이버 캡차 / 구글 `/sorry/`·reCAPTCHA | ✅ | ❌ | ✅ |
| `PROXY_ERROR` | `page.goto()` 실패 메시지 패턴 매칭 (ERR_TIMED_OUT 등) | ✅ | ❌ | ✅ |
| `HTTP_ERROR` | 응답 상태코드 5xx | ✅ (연속 `HTTP_ERROR_THRESHOLD`회 후) | ❌ | ✅ |

- AKAMAI_BLOCK/AKAMAI_IP_BLOCK/COUPANG_APP_BLOCK 모두 `rotateProfile: true`
- SELECTOR_BUG: `rotateProxy: false, rotateProfile: true` — 구글 광고 클릭 후 link.coupang.com에 머무는 일시적 현상. 프록시는 정상이므로 프록시 교체 없이 프로필만 교체

### 3.1~3.3단계 (완료, 2026-06-11~15)

- AKAMAI_BLOCK 감지 정규식 버그 수정 (`Reference #18.` 콜론/해시 모두 매칭)
- `NAVER_NO_LINK`/`GOOGLE_NO_LINK` HTML 캡처 추가
- `assertNotBlocked`의 "Execution context was destroyed" 레이스 컨디션 처리
- `clearProfileCache` — 세션 종료마다 캐시 폴더만 삭제, 추적 쿠키 보존
- `NoLinkFoundError` — 광고 미노출을 차단으로 오인하지 않음, 프록시/프로필 유지 재시도
- `completed_count` 원자적 증가, `finished_at` 미기록 버그 수정

### 4단계 - 운영 환경 검증 + 코드 안정화 (2026-06-18~19)

- [x] **Canvas 지문 다양화** — 슬롯별 결정적 해시 기반 노이즈 (toDataURL/getImageData/readPixels/getChannelData)
- [x] **`AKAMAI_CHALLENGE` 제거** — 실제 발생 0건 확인. 관련 코드/환경변수 전부 삭제
- [x] **차단 경로 3종 구분** — debug-html 2,948건 분석:
  - 단순 Access Denied (1,555건): Reference #18., IP 미표시 → `AKAMAI_BLOCK`
  - 쿠팡 커스텀 차단 (46건): Client IP 명시 → `AKAMAI_IP_BLOCK`
  - Cloudflare (90건): "Sorry, you have been blocked" → `AKAMAI_IP_BLOCK`
- [x] **오류 추적 완전화** — 모든 경로에서 위치(location) + HTML 캡처 추적 가능:
  - `BLOCK_PORTAL_ENTRY` — 포털 진입 시 AKAMAI_BLOCK
  - `BLOCK_AT_PORTAL_ENTRY` — 포털 진입 시 비AKAMAI_BLOCK (AKAMAI_IP_BLOCK 등)
  - `BLOCK_SEARCH_RETRY` — 검색 후 AKAMAI_BLOCK + goBack 재시도
  - `BLOCK_AT_SEARCH` — 검색 후 비AKAMAI_BLOCK
  - `BLOCK_PRODUCT_PAGE` — 상품 페이지 차단 (모든 유형)
  - `FLOW_UNKNOWN_ERROR` — 분류 불가 예외 + 현재 페이지 HTML 캡처
- [x] **검색 차단 goBack 재시도** (`flow.ts`) — `hadSearchBlock` 플래그로 1회 제한
- [x] **Google AKAMAI_BLOCK 재진입 수정** — goBack 실패 (Akamai defer script 간섭) → `safeGoto("google.com/search?q=쿠팡")`으로 대체
- [x] **구조화 로깅 (`infra/logger.ts`)** — JSONL, `logs/job-{id}-pid-{pid}.jsonl`, 프로세스별 파일
- [x] **좀비 Chrome 프로세스 정리** — `{context, chromePid}` 반환, finally에서 `process.kill(chromePid)`. chromePid는 `.process?.pid` (함수 아닌 프로퍼티)
- [x] **`session.ts` 분리** — `index.ts`는 메인 루프 + Job 처리만 담당 (276줄 → 84줄)
- [x] **아키텍처 정리** — `launchContext` 내부 헬퍼, `profileDirForSlot` → browser.ts, `buildTargetForCategory` → target.ts, `FoundProduct` → types.ts
- [x] **Edge + 시크릿 모드** (`infra/browser.ts`, `session.ts`) — 아래 "프로필 다양화" 섹션 참고

### 5단계 - PostgreSQL 전환 및 운영 자동화 (①②③ 완료 2026-06-14, ④⑤ 계획)

#### ① DB: SQLite → PostgreSQL (완료)
- `macro_app` 롤 + `macro_kit` DB, KST 타임존 설정
- `infra/db.ts` 전면 재작성 — `pg`(Pool) 비동기 API

#### ② 스키마 확장 (완료)
- `ProductItem.category`, `session_log`, `jobs`(`idx_jobs_one_running`), `jobs.failed_session_count`
- `profile_pool.session_count` — 슬롯별 세션 횟수 누적 (`ALTER TABLE profile_pool ADD COLUMN IF NOT EXISTS session_count INTEGER DEFAULT 0;`)

#### ③ Job 기반 실행 흐름 (완료)
- `while(true)` + `getRunningJob()` + `LISTEN/NOTIFY job_created`
- 알려진 트레이드오프: 멀티 인스턴스 동시 마지막 세션 → `completed_count` 소폭 초과 가능

#### ④ API 서버 (계획)
- PostgreSQL 매개 간접 통신. 엔드포인트: `POST /jobs`, `GET /jobs`, `GET /stats`, `GET /logs`

#### ⑤ 웹 대시보드 (계획)
- 분리형 SPA (React + Vite) + 독립 API 서버

## 프로필 풀

- **고정 슬롯**: `{USER_DATA_ROOT}/profile-0` ~ `profile-19` (20개)
- **`profile_pool` 테이블**: `acquireProfileSlot(staleMs)` — `FOR UPDATE SKIP LOCKED`로 원자적 점유, `releaseProfileSlot(slot, incrementCount)` — 반납 + last_used 갱신
- **세션 횟수 초기화**: `PROFILE_RESET_THRESHOLD`회 도달 시 `fs.rmSync` + `session_count = 0` 리셋. 다음 세션이 새 프로필로 시작
- **시크릿 세션은 session_count 미증가**: `releaseProfileSlot(slot, false)` — 영구 프로필 미사용
- **차단 시 로테이션**: 슬롯 번호 유지, 폴더 내용만 `fs.rmSync` 후 재생성 (`_abck` 초기화)
- **DB 권한**: 신규 테이블 생성 시 `GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO macro_app;` 필요
- 슬롯 확장 시: `INSERT INTO profile_pool (slot, in_use, locked_at, last_used, session_count) SELECT s, false, NULL, NULL, 0 FROM generate_series(20, {N}) AS s;`

## 프로필 다양화 (Edge + 시크릿 모드, 2026-06-19)

세션마다 브라우저 채널과 프로필 모드를 랜덤 선택해 지문 다양화:

```typescript
// session.ts
const useIncognito = Math.random() < ENV.INCOGNITO_RATIO;
const channel = useIncognito ? "chrome"
  : (Math.random() < ENV.EDGE_RATIO ? "msedge" : "chrome");
```

| 모드 | 채널 | 프로필 | `_abck` 누적 | session_count 증가 |
|------|------|--------|-------------|-------------------|
| 영구 Chrome | chrome | 슬롯 재사용 | ✅ | ✅ |
| 영구 Edge | msedge | 슬롯 재사용 | ✅ | ✅ |
| 시크릿 | chrome | OS tmpdir (세션 후 삭제) | ❌ (매번 초기화) | ❌ |

- `createIncognitoContext` — `fs.mkdtempSync(os.tmpdir())` + `launchContext` + 세션 후 `fs.rmSync`
- `createPersistentContext(channel)` — `launchContext(profileDir, channel)` 내부 헬퍼 공용
- Edge는 Windows 기본 설치 브라우저 사용 (별도 설치 불필요)
- 시크릿 모드에서 AKAMAI_BLOCK 발생 시 프록시만 교체 (매 iteration 자동으로 새 tmpdir)

## 방문자수 집계 이슈 조사 (2026-06-19)

250회 세션 실행 → 쿠팡 판매자 대시보드: **방문자 1, 조회수 250**

- PCID 쿠키값이 슬롯별로 다른 것 확인 → PCID가 방문자 집계 기준 아님
- **유력 원인**: HaiIP 프록시 IP 대역이 쿠팡에서 봇 트래픽으로 분류되어 방문자 집계 제외, 또는 하드웨어 지문(WebGL GPU 등 JS 스푸핑 불가 값) 기반 동일 기기 집계
- **검증 필요**: VM에서 HaiIP 끄고 직접 방문 → 방문자 증가 여부 확인

## 주요 설계 결정

- **Patchright 선택**: `channel: 'chrome'`과 조합으로 TLS 지문 + CDP 동시 해결. AKAMAI_CHALLENGE는 실제 발생하지 않음 — 바로 Access Denied(AKAMAI_BLOCK)로 처리됨
- **레이어드 아키텍처**: `config` / `core` / `infra` / `automation` / `gateway` / `coupang` + `session.ts`(오케스트레이션)
- **브라우저 다양화**: `launchContext(channel)` 내부 헬퍼로 Chrome/Edge/시크릿 세 가지 모드 통합. `INCOGNITO_RATIO`/`EDGE_RATIO` 환경변수로 비율 제어
- **chromePid 추출**: `(context as any)._browser?.process?.pid` — Patchright에서 `.process`는 함수가 아닌 ChildProcess 프로퍼티. try-catch로 안전 추출
- **세션 실행 흐름**: `index.ts`(Job 루프) → `session.ts`(`runSession`) → `gateway/index.ts`(`runPortalGateway`) → `coupang/flow.ts`(`runCoupangSearchFlow`)
- **차단 복구**: `BLOCK_RECOVERY` 테이블 조회 → `applyRecoveryPolicy`. AKAMAI_BLOCK/AKAMAI_IP_BLOCK 모두 `rotateProxy+rotateProfile: true`
- **AKAMAI_BLOCK goBack 재시도**: 진입 시 포털로 goBack 후 재클릭, 검색 시 쿠팡 메인으로 goBack 후 재검색. 각 1회. 구글 진입 goBack은 Akamai defer script 간섭으로 실패 → `safeGoto("google.com/search?q=쿠팡")`으로 대체
- **오류 위치 추적**: 차단/오류마다 `location` 필드(PORTAL_ENTRY/SEARCH/PRODUCT) + event 이름으로 JSONL에 기록. 분류 불가 예외는 `FLOW_UNKNOWN_ERROR` + HTML 캡처
- **구조화 로깅**: JSONL 프로세스별 파일. `setJobId` 호출 전 startup 로그는 console.log 유지
- **`_abck` vs 프록시 IP**: Akamai 복합 추적. 프록시만 교체로 부족, 프로필 교체로 `_abck` 리셋 필요
- **SELECTOR_BUG rotateProfile: true**: 구글 광고 클릭 후 link.coupang.com 체류. 프록시 잘못 아님 → 프로필만 교체
- **시크릿 모드 회복 정책**: 매 iteration 자동으로 새 tmpdir → rotateProfile 자동 충족. 프록시 교체만 적용
- **WebRTC 패치**: `iceServers: []`. `RTCPeerConnection` 자체는 유지해 API 완전성 체크 통과
- **WebGL `getParameter` 스푸핑 기각**: `toString()` 탐지 위험 — vendor/renderer는 실제 GPU 값 유지

## 현재 브라우저 실행 옵션

```typescript
// infra/browser.ts — launchContext(proxy, profileDir, slot, channel)
channel: "chrome" | "msedge"  // session.ts에서 랜덤 결정
headless: ENV.HEADLESS

args: [
  `--window-size=${w},${h}`,   // 슬롯별 해상도 (SLOT_RESOLUTIONS 20종)
  "--disable-blink-features=AutomationControlled",
  "--remote-debugging-port=0",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-popup-blocking",
  "--disable-dev-shm-usage",
]
```

addInitScript (context 레벨, 슬롯별 파라미터):
- **창 크기 정합성**: `outerWidth`/`outerHeight` → innerWidth/innerHeight. `screen.*` 슬롯 해상도 패치
- **WebRTC ICE 차단**: `iceServers: []`
- **Canvas 노이즈**: `toDataURL` / `getImageData` 오버라이드 — 슬롯 해시 기반 1픽셀 수정
- **WebGL readPixels 노이즈**: `readPixels` 오버라이드
- **AudioBuffer 노이즈**: `getChannelData` 오버라이드 — 첫 샘플 ±1e-7

## 환경변수 (.env)

```dotenv
MAX_RETRY=5
USER_DATA_ROOT=./user-data-2      # 프로필 풀 루트 — profile-0 ~ profile-19
PROFILE_LOCK_STALE_MS=600000      # 비정상 종료 슬롯 재사용 허용 기준(ms)
PROXY_FILE_PATH=./proxies.txt
HEADLESS=false
NAVER_RATIO=0.5                   # 0~1, 1이면 항상 네이버

# 브라우저 다양화
INCOGNITO_RATIO=0.2               # 0~1: 시크릿 모드 비율
EDGE_RATIO=0.3                    # 0~1: 비시크릿 시 Edge 사용 비율
PROFILE_RESET_THRESHOLD=20        # 슬롯당 N회 사용 후 프로필 전체 초기화

# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=macro_kit
PGUSER=macro_app
PGPASSWORD=...

# 타이밍 (ms)
NAVER_ENTRY_DELAY=2000
NAVER_SEARCH_DELAY=3000
GOOGLE_ENTRY_DELAY_MIN=3000
GOOGLE_ENTRY_DELAY_RANGE=2000
GOOGLE_SEARCH_DELAY=3000
COUPANG_ENTRY_DELAY=4000
COUPANG_SEARCH_DELAY=3000
PORTAL_AFTER_ENTRY_DELAY=3000
NAV_TIMEOUT=30000

# 차단/프록시 임계값
HTTP_ERROR_THRESHOLD=3
PROXY_FAIL_THRESHOLD=2
```

## 실행 환경

- **로컬 개발**: Windows 11 + VS Code
- **운영 환경**: VM (HaiIP OpenVPN 클라이언트 실행 후 proxies.txt 갱신 필요)

## 실행 방법

```bash
npm install
npx patchright install chromium
cp .env.example .env   # 값 수정 후 사용

# pgAdmin에서 Job 등록:
# INSERT INTO jobs (category, target_count, status) VALUES ('보쌈', 100, 'running'); NOTIFY job_created;

npx ts-node src/index.ts                          # 자동화 루프 (ts-node)
node dist/index.js                                # 컴파일 후 실행 (빠름)
npx ts-node src/runDiagnostics.ts                 # CreepJS 지문 분석
npx ts-node src/runDiagnostics.ts pixelscan       # pixelscan 봇 탐지 테스트
npx ts-node src/runDiagnostics.ts canvas [slot]   # Canvas 지문 슬롯별 측정
```

## 보류 작업

- [ ] `query_stats` 키가 `query` 단독이라 brand 단독 쿼리가 여러 product와 페어링될 때 통계가 섞임 — `(query, productId)` 복합키 전환은 운영 데이터 확인 후 재검토
- [ ] `NoLinkFoundError` DB 미기록 — `block_log`/`session_log` 어디에도 안 남아 SQL 집계 불가. 로깅 추가 필요

## 다음 작업

> 4단계 완료 (2026-06-19). Edge+시크릿 모드, 프로필 세션 횟수 초기화, 오류 추적 완전화, 구조화 로깅 등 완료.

### 방문자수 집계 문제
- **검증 필요**: HaiIP 끄고 VM에서 직접 방문 → 방문자 증가 여부 (IP 필터링 vs 하드웨어 지문 구분)
- IP 필터링이 원인이면 → 주거용(residential) IP 프록시 전환 검토
- 하드웨어 지문이 원인이면 → 다른 VM/물리 기기 필요

### 지속 모니터링
- **`Execution context was destroyed` 재발** — 재발 시 AKAMAI_BLOCK으로 정상 분류되는지 확인
- **인스턴스 수 증가 시 `NAVER_NO_LINK` 비율 급증** — HaiIP IP 대역 좁음 → 동시 다발 요청 차단 가설
- **Edge 모드에서 `NAVER_NO_LINK` 비율** — Edge UA에서 네이버 브랜드검색 광고 미노출 가능성

### 향후 작업
- **방문자수 문제 해결** — 위 검증 결과에 따라 방향 결정
- **5단계 ④⑤**: API 서버(Express/Fastify) + React+Vite 대시보드
- **스케줄러**: HaiIP 갱신 시간(07:00~10:00) 회피 자동 실행
- **프록시 동시 사용 조율** — `proxy_locks` 테이블(`FOR UPDATE SKIP LOCKED`) 검토
