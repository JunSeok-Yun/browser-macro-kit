Patchright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글/다음/네이트)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회 검증 완료.

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
- **프록시**: HaiIP 유동IP (KT 가정용 주거용 IP, HTTP 프록시, OpenVPN 클라이언트 인증 방식)

## 파일 구조

```
src/
  index.ts              - 메인 진입점. Job 기반 idle 루프(LISTEN/NOTIFY), Job 처리만 담당
  session.ts            - 세션 실행 전담 (runSession, applyRecoveryPolicy, acquireProfileSlotWithRetry)
                          시크릿/영구 모드 분기, Edge/Chrome 채널 랜덤 선택, 슬롯 세션 횟수 초기화
                          슬롯 기반 세션 시차(1회차) + 랜덤 지터(2회차~) 포함
  utils.ts              - 공통 유틸리티 (sleep, gaussianRandom)

  config/
    env.ts              - 모든 환경변수 단일 관리 (ENV 객체, dotenv 로드)
    target.ts           - 비즈니스 타겟 설정 (DEFAULT_TARGET, buildTargetForCategory)

  core/
    types.ts            - 공유 인터페이스 (ProductItem, ProductTarget, Job, FoundProduct)
    errors.ts           - 커스텀 에러 (ProductNotFoundError, NoLinkFoundError, BlockDetectedError, BlockType — 6종)
    blockDetection.ts   - 차단 감지/분류. assertNotBlocked, assertPortalNotBlocked(PORTAL_CAPTCHA),
                          classifyNavigationError·safeGoto·withNavigationErrorHandling
                          PortalType: "naver" | "google" | "daum" | "nate"
    recovery.ts         - BlockType별 복구 정책 테이블 (BLOCK_RECOVERY)

  infra/
    browser.ts          - 브라우저 컨텍스트 팩토리
                          launchContext(내부 헬퍼), createPersistentContext(channel), createIncognitoContext(OS tmpdir)
                          profileDirForSlot, clearProfileCache
                          chromePid: (context as any)._browser?.process?.pid (함수 아닌 프로퍼티)
    proxyManager.ts     - HaiIP 유동IP 연동 (ProxyManager.create() 비동기 팩토리, 인메모리+DB 이중 블랙리스트)
                          fs.watch mtime 비교로 실제 내용 변경 시에만 리로드 (읽기 이벤트 무시)
    db.ts               - PostgreSQL 연동 (pg, Pool) — block_log/proxy_stats/query_stats/session_log/jobs/profile_pool
                          releaseProfileSlot(slot, incrementCount), checkAndResetSessionCount(slot, threshold)
                          Client: LISTEN/NOTIFY 전용 영구 연결 (listenForJobCreated)
    debugCapture.ts     - 차단/진단 시점 페이지 HTML 저장 (saveDebugHtml → debug-html/{type}_{timestamp}.html)
    logger.ts           - 구조화 JSONL 로거. setJobId(jobId) → logs/job-{id}-pid-{pid}.jsonl 기록. slotFrom(profileDir) 헬퍼
    networkCapture.ts   - 네트워크 캡처 모듈. attachNetworkCapture(context, slot)
                          LOG_BEACONS=true 시 coupang 요청을 network-logs/session_slot{N}_{ts}.json 저장
                          session.ts에서 context 생성 직후 호출, finally에서 flush

  automation/
    keyboard.ts         - 인간형 타이핑 (typeLikeHuman, clearSearchInput)
    mouse.ts            - 베지어 곡선 마우스 이동 (moveMouseAlongCurveAndClick)
    scroll.ts           - 스크롤 모듈 (randomScrollDwell, scrollToTop, deepScrollToBottom)
                          deepScrollToBottom: 매 스텝 pageHeight 재측정, 15% 역방향, 20~30초 소요

  gateway/
    index.ts            - 포털 게이트웨이 통합 (runPortalGateway).
                          selectPortal() 누적 확률 4-way 선택, FALLBACK 맵, activePortal 추적
                          AKAMAI_BLOCK: 네이버 goBack 재진입, 구글/다음/네이트 safeGoto 직접 재검색
    naver.ts            - 네이버 경유 쿠팡 진입 (runNaverGateway, enterCoupangFromNaverResults)
    google.ts           - 구글 경유 쿠팡 진입 (runGoogleGateway, enterCoupangFromGoogleResults)
    daum.ts             - 다음 경유 쿠팡 진입 (runDaumGateway, enterCoupangFromDaumResults → Promise<Page>)
                          새 탭 처리: Promise.race(sameTabNav, newPageEvent), 검색 탭 자동 close()
    nate.ts             - 네이트 경유 쿠팡 진입 (runNateGateway, enterCoupangFromNateResults → Promise<Page>)
                          검색 결과가 search.daum.net에 호스팅 → waitForURL(!daum.net && !nate.com)

  coupang/
    search.ts           - 상품 탐색 로직 (buildSearchQuery, findTargetProduct)
    flow.ts             - 쿠팡 검색 → 상품 진입 시퀀스 (runCoupangSearchFlow)
                          runProductPageInteraction:
                            "상품정보 더보기" 클릭 → deepScrollToBottom(양방향) → 리뷰 탭 클릭
                            → ADD_TO_CART_RATIO 확률로 장바구니 담기(button.prod-cart-btn) → 토스트 확인 → Escape
                          검색/상품 페이지 차단 goBack 재시도, 위치별 차단 로그(BLOCK_AT_SEARCH/BLOCK_PRODUCT_PAGE)

logs/                   - job-{id}-pid-{pid}.jsonl 구조화 로그
network-logs/           - LOG_BEACONS=true 시 네트워크 캡처 JSON (session_slot{N}_{ts}.json)
debug-html/             - 차단 시점 HTML 캡처 (AKAMAI_BLOCK/AKAMAI_IP_BLOCK/PORTAL_CAPTCHA/FLOW_UNKNOWN_ERROR 등)
.env                    - 환경변수
proxies.txt             - HaiIP "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT, 약 2000개)
```

## 단계별 진행 현황

### 0~4단계 (완료)

- Patchright + Chrome/Edge 채널, Canvas/WebGL/Audio 노이즈, WebRTC 패치
- 레이어드 아키텍처 (config/core/infra/automation/gateway/coupang)
- 행동 모방: 베지어 마우스, 인간형 타이핑, 랜덤 스크롤
- 차단 유형 6종 분류 + BLOCK_RECOVERY 테이블 기반 복구
- 구조화 JSONL 로깅, 좀비 Chrome 정리, session.ts 분리
- Edge + 시크릿 모드, 프로필 세션 횟수 초기화

### 5단계 - PostgreSQL 전환 및 운영 자동화

#### ①②③ 완료 (2026-06-14)
- `macro_app` 롤 + `macro_kit` DB, KST 타임존 / `infra/db.ts` pg(Pool) 재작성
- `profile_pool.session_count`, `session_log`, `jobs`(`idx_jobs_one_running`) 스키마 확장
- `while(true)` + `getRunningJob()` + `LISTEN/NOTIFY job_created` Job 기반 흐름
- 트레이드오프: 멀티 인스턴스 동시 마지막 세션 → `completed_count` 소폭 초과 가능

#### ④ API 서버 (계획)
- PostgreSQL 매개. 엔드포인트: `POST /jobs`, `GET /jobs`, `GET /stats`, `GET /logs`

#### ⑤ 웹 대시보드 (계획)
- 분리형 SPA (React + Vite) + 독립 API 서버

### 5.1단계 - 포털 다양화 + 상품 페이지 행동 개선 (2026-06-20 완료)

- [x] **포털 4종** — 네이버/구글/다음/네이트. `selectPortal()` 누적 확률, `FALLBACK` 맵
- [x] **다음/네이트 새 탭 처리** — `Promise.race(sameTabNav, newPageEvent)`, 검색 탭 `close()`
- [x] **Nate waitForURL** — 검색 결과가 `search.daum.net`에 호스팅 → `!daum.net && !nate.com`
- [x] **aboutcoupang.com 오진 수정** — 셀렉터 `a[href*=".coupang.com"]`, URL 체크 `.coupang.com`
- [x] **AKAMAI_BLOCK 재진입 URL** — 다음: `search.daum.net/search?q=쿠팡`, 네이트: `search.daum.net/nate?w=tot&q=쿠팡`
- [x] **상품 페이지 행동 개선** (`runProductPageInteraction`)
  - "상품정보 더보기" 버튼 클릭 (있을 경우) → 페이지 확장
  - `deepScrollToBottom`: 15% 역방향 포함 양방향 스크롤, 20~30초 소요
  - 리뷰 탭 클릭 (`a:has-text("리뷰")`) → 리뷰 영역 스크롤
  - 장바구니 담기: `button.prod-cart-btn` 우선 셀렉터, 토스트(`div.cart-success-message`) 확인 후 Escape
  - `ADD_TO_CART_RATIO`(기본 20%) 확률로 장바구니 담기

### 5.2단계 - 타임아웃 개선 + 네트워크 캡처 (2026-06-21 완료)

- [x] **슬롯 기반 세션 시차** (`session.ts`)
  - 1회차: `delay = (slot % 20) * 1500 + 2000 + random(0, 300)` (2~31초) — 다중 인스턴스 초기 분산
  - 2회차~: 랜덤 지터 1~4초 — 재동기화 방지
  - 슬롯이 DB 락으로 프로세스 간 고유 → 자연 분산, 프로세스당 첫 세션에만 결정론적 지연
- [x] **네트워크 캡처 모듈** (`infra/networkCapture.ts`)
  - `LOG_BEACONS=true` 시 세션당 coupang 전체 요청 JSON 저장
  - `session.ts`에서 context 생성 직후 연결, finally에서 flush
  - `network-logs/session_slot{N}_{ts}.json`으로 저장

## 차단 유형 분류 및 복구 전략

(`core/recovery.ts`의 `BLOCK_RECOVERY` 테이블)

| 유형 | 감지 방법 | 프록시 교체 | 프로필 교체 | 재시도 |
|---|---|---|---|---|
| `SELECTOR_BUG` | URL에 `link.coupang.com` 포함 | ❌ | ✅ | ✅ |
| `AKAMAI_BLOCK` | `Reference #18.` | ✅ | ✅ | ✅ |
| `AKAMAI_IP_BLOCK` | "Please contact us" + Client IP, 또는 Cloudflare | ✅ | ✅ | ✅ |
| `COUPANG_APP_BLOCK` | JSON `rCode: "RET9999"` | ✅ | ✅ | ✅ |
| `PORTAL_CAPTCHA` | 네이버 캡차 / 구글 `/sorry/` / 다음·네이트 봇 차단 / 카카오 인증 | ✅ | ❌ | ✅ |
| `PROXY_ERROR` | ERR_TIMED_OUT 등 패턴 매칭 | ✅ | ❌ | ✅ |
| `HTTP_ERROR` | 5xx | ✅ (임계값 초과 시) | ❌ | ✅ |

## 프로필 풀

- **고정 슬롯**: `{USER_DATA_ROOT}/profile-0` ~ `profile-19` (20개)
- **`profile_pool` 테이블**: `acquireProfileSlot(staleMs)` — `FOR UPDATE SKIP LOCKED`, `releaseProfileSlot(slot, incrementCount)`
- **세션 횟수 초기화**: `PROFILE_RESET_THRESHOLD`회 도달 시 `fs.rmSync` + `session_count = 0` → 다음 세션이 새 프로필(새 PCID) 시작
- **시크릿 세션**: `releaseProfileSlot(slot, false)` — session_count 미증가
- **차단 시 로테이션**: 슬롯 번호 유지, 폴더 내용만 `fs.rmSync` 후 재생성 (`_abck` 초기화)
- **DB 권한**: 신규 테이블 생성 시 `GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO macro_app;`
- 슬롯 확장: `INSERT INTO profile_pool (slot, in_use, locked_at, last_used, session_count) SELECT s, false, NULL, NULL, 0 FROM generate_series(20, {N}) AS s;`

## 프로필 다양화 (Edge + 시크릿 모드)

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
| 시크릿 | chrome | OS tmpdir (세션 후 삭제) | ❌ | ❌ |

## 방문자수(UV) 집계 현황

### 확인된 사실

**직접 방문 테스트 결과 (2026-06-20)**:
- 동일 PC: Chrome + Chrome 시크릿 + Edge → 방문자 **1**, 조회수 3
- 핸드폰 접속 → 방문자 **추가**
- HaiIP = KT 가정용 유동IP (주거용, 데이터센터 IP 아님)
- 250회+ 세션, 다른 HaiIP IP 사용 → UV 여전히 1 → **IP 유형 문제 아님 확정**

**HAR 분석 결과 (2026-06-21)**:
- UV 관련 핵심 엔드포인트: `mercury.coupang.com/e.gif?t=101&r=암호화데이터` (트래킹 픽셀)
- `r` 파라미터: 클라이언트 JS가 수집한 하드웨어 지문을 서버 키로 암호화한 이진 데이터
- Akamai 센서(`5kG6Up2G3tu-n4OA9RjO/...`): 자동화 세션에서 실 사용자보다 4배 많이 수집됨 (의심 트래픽 신호)
- referrer 체인(네이버→쿠팡→검색→상품)과 sdp_product_page_view 비콘은 **정상 발송 확인**

**결론**: 쿠팡 UV 기준은 **하드웨어 지문(WebGL GPU 렌더러 등)** 우선. 동일 VM = 동일 하드웨어 = UV 1.

### UV 수 증가 방안 (검토 중)

- **AdsPower 안티디텍트 브라우저**: 프로필마다 다른 WebGL GPU 메타데이터 스푸핑
  - 2026-06-21: 프로필 2개 생성 (NVIDIA GTX 1050 / Intel UHD 630 각각), 수동 4회 테스트 완료
  - 2026-06-22: 판매자 대시보드에서 방문자 수 변화 확인 예정
  - 증가 시 → AdsPower API 연동 구현 (`/api/v1/browser/start` → CDP 연결)
  - 변화 없음 → VM 추가 (하드웨어 수준 분리) 필요

- **주의**: AdsPower 프로필 지문은 고정이어야 함 (`_abck`가 지문과 함께 누적되므로 매 세션 UA/WebGL 변경 시 AKAMAI_BLOCK 위험)

## 주요 설계 결정

- **Patchright 선택**: `channel: 'chrome'`과 조합으로 TLS 지문 + CDP 동시 해결. AKAMAI_CHALLENGE는 실제 발생하지 않음
- **레이어드 아키텍처**: `config` / `core` / `infra` / `automation` / `gateway` / `coupang` + `session.ts`
- **세션 실행 흐름**: `index.ts` → `session.ts` → `gateway/index.ts` → `coupang/flow.ts`
- **포털 선택**: `selectPortal()` 누적 확률 (NAVER + GOOGLE + DAUM ≤ 1.0, 나머지 = NATE 비율)
- **포털 폴백 맵**: `{ naver→google, google→naver, daum→naver, nate→google }` (NoLinkFoundError 시)
- **다음/네이트 새 탭**: `Promise.race(sameTabNav, newPageEvent)` — 어느 쪽이든 캐치. 검색 탭 `page.close()` 후 쿠팡 탭 반환
- **Nate 검색 결과 도메인**: nate.com 검색 시 `search.daum.net/nate?...`로 리다이렉트됨
- **AKAMAI_BLOCK 재진입**: 네이버 → goBack, 구글/다음/네이트 → safeGoto 재검색 (goBack 불가)
- **URL 체크**: `.coupang.com` 포함 여부 (`aboutcoupang.com` 오진 방지)
- **상품 페이지 행동**: `runProductPageInteraction` — 더보기 클릭 → `deepScrollToBottom`(양방향 15% 역방향) → 리뷰 탭 → 랜덤 장바구니
- **차단 복구**: `BLOCK_RECOVERY` 테이블 → `applyRecoveryPolicy`
- **`_abck` vs 프록시 IP**: Akamai 복합 추적. 프록시 교체 + 프로필 교체(`_abck` 리셋) 병행 필요
- **WebGL `getParameter` 스푸핑 기각**: `toString()` 탐지 위험 — vendor/renderer는 실제 GPU 값 유지
- **WebRTC 패치**: `iceServers: []`, `RTCPeerConnection` 자체는 유지해 API 완전성 체크 통과
- **세션 시차**: 슬롯 기반 결정론적 분산(1회차) + 랜덤 지터(2회차~) — 다중 인스턴스 HaiIP 병목 완화

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
  "--disk-cache-size=10485760",
]
```

addInitScript (context 레벨, 슬롯별 파라미터):
- **창 크기 정합성**: `outerWidth`/`outerHeight`, `screen.*` 슬롯 해상도 패치
- **WebRTC ICE 차단**: `iceServers: []`
- **Canvas 노이즈**: `toDataURL` / `getImageData` 오버라이드 — 슬롯 해시 기반 1픽셀 수정
- **WebGL readPixels 노이즈**: `readPixels` 오버라이드
- **AudioBuffer 노이즈**: `getChannelData` 오버라이드 — 첫 샘플 ±1e-7

## 환경변수 (.env)

```dotenv
MAX_RETRY=5
USER_DATA_ROOT=./user-data-2
PROFILE_LOCK_STALE_MS=600000
PROXY_FILE_PATH=./proxies.txt
HEADLESS=false

# 포털 비율 (합이 1.0 이하 — 나머지가 네이트 비율)
NAVER_RATIO=0.35
GOOGLE_RATIO=0.35
DAUM_RATIO=0.15
# 네이트 = 1 - 0.35 - 0.35 - 0.15 = 0.15

# 브라우저 다양화
INCOGNITO_RATIO=0.2
EDGE_RATIO=0.3
PROFILE_RESET_THRESHOLD=20

# 상품 페이지 행동
ADD_TO_CART_RATIO=0.2          # 장바구니 담기 확률

# 네트워크 캡처 (디버깅용, 기본 false)
LOG_BEACONS=false              # true 시 network-logs/에 coupang 요청 저장

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
PROXY_FAIL_THRESHOLD=3
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

- [ ] `query_stats` 키가 `query` 단독 → brand 단독 쿼리가 여러 product와 페어링 시 통계 섞임 — `(query, productId)` 복합키 전환 재검토
- [ ] `NoLinkFoundError` DB 미기록 — `block_log`/`session_log` 미수집. 로깅 추가 필요
- [ ] PCID 에이징 — 신규 슬롯 첫 방문 시 쿠팡 메인 워밍업 후 타겟 진입. 세션 시간 증가로 보류

## 다음 작업

### AdsPower UV 테스트 결과 대기 (2026-06-22 확인)

2026-06-21 수동 테스트 4회 완료. 판매자 대시보드에서 방문자 수 변화 확인 후:

- **증가** → AdsPower 연동 구현
  - `browser.ts`: AdsPower `/api/v1/browser/start` → CDP `connectOverCDP(wsEndpoint)`
  - `session.ts`: 세션 전 `/api/v1/user/update`로 HaiIP 프록시 교체
  - `addInitScript()` 제거 (AdsPower 자체 지문 관리와 충돌 방지)
  - 프로필 ID → 슬롯 매핑 테이블 추가
- **변화 없음** → VM 추가로 방향 전환 (하드웨어 수준 분리)

### 포털 타임아웃 분리 (미완료)

포털 접속 실패 빠른 감지:
- `env.ts`에 `PORTAL_TIMEOUT=15000` 추가
- 각 gateway의 포털 접속 `safeGoto`에만 적용 (쿠팡 내부 네비게이션은 기존 `NAV_TIMEOUT=30000` 유지)

### 향후

- **5단계 ④⑤**: API 서버(Express/Fastify) + React+Vite 대시보드
- **스케줄러**: HaiIP 갱신 시간(07:00~10:00) 회피 자동 실행
