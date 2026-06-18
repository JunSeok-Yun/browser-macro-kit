Patchright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 코드 수정 요청 시 응답 방식

코드 변경이 필요한 작업을 요청받으면, **직접 파일을 수정하지 말고** 사용자가 스스로 적용할 수 있도록 아래 형식으로 상세히 설명한다:

- 파일 경로와 수정 위치(줄 번호 또는 함수명)를 명시
- 변경 전(Before) / 변경 후(After) 코드를 **각각 별도의 전체 코드 블록**으로 제시 (diff `+`/`-` 표기 대신, 변경 전 블록과 변경 후 블록을 통째로 따로 보여줄 것)
- 한 파일 안에 여러 위치를 수정한다면 위치별로 Before/After 쌍을 나눠 제시
- 각 변경마다 **왜** 이렇게 바꿔야 하는지 이유를 설명 (어떤 문제를 해결하는지, 어떤 부작용이 있는지/없는지)
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
  index.ts              - 메인 진입점. Job 기반 idle 루프(LISTEN/NOTIFY), 세션 재시도, 프로필 슬롯 관리
  runDiagnostics.ts     - 진단 전용 진입점 (creepjs | pixelscan | canvas [slot])
  utils.ts              - 공통 유틸리티 (sleep)

  config/
    env.ts              - 모든 환경변수 단일 관리 (ENV 객체, dotenv 로드)
    target.ts           - 비즈니스 타겟 설정 (DEFAULT_TARGET — 브랜드/키워드/상품)

  core/
    types.ts            - 공유 인터페이스 (ProductItem, ProductTarget)
    errors.ts           - 커스텀 에러 (ProductNotFoundError, BlockDetectedError, BlockType — 7종)
    blockDetection.ts   - 차단 감지/분류. assertNotBlocked(쿠팡: SELECTOR_BUG/AKAMAI_BLOCK/COUPANG_APP_BLOCK/AKAMAI_CHALLENGE), assertPortalNotBlocked(포털: PORTAL_CAPTCHA), classifyNavigationError·safeGoto·withNavigationErrorHandling(PROXY_ERROR/HTTP_ERROR)
    recovery.ts         - BlockType별 복구 정책 테이블 (BLOCK_RECOVERY)

  infra/
    browser.ts          - 영구 브라우저 컨텍스트 팩토리 (createPersistentContext(proxy, profileDir))
    proxyManager.ts     - HaiIP 유동IP 연동 모듈 (ProxyManager.create() 비동기 팩토리, 인메모리+DB 이중 블랙리스트)
    db.ts               - PostgreSQL 연동 (pg, Pool) — block_log/proxy_stats/query_stats/session_log/jobs/profile_pool
    debugCapture.ts     - 차단/진단 시점 페이지 HTML 저장 (saveDebugHtml(html, type) → debug-html/{type}_{timestamp}.html)

  automation/
    keyboard.ts         - 인간형 타이핑 (typeLikeHuman, clearSearchInput)
    mouse.ts            - 베지어 곡선 마우스 이동 (moveMouseAlongCurveAndClick)
    scroll.ts           - 랜덤 스크롤 체류 (randomScrollDwell, scrollToTop)

  gateway/
    index.ts            - 포털 게이트웨이 통합 (runPortalGateway)
    naver.ts            - 네이버 경유 쿠팡 진입 (runNaverGateway)
    google.ts           - 구글 경유 쿠팡 진입 (runGoogleGateway)

  coupang/
    search.ts           - 상품 탐색 로직 (buildSearchQuery, findTargetProduct)
    flow.ts             - 쿠팡 검색 → 상품 진입 시퀀스 (runCoupangSearchFlow)

  test/
    pixelscan.ts        - pixelscan 봇 탐지 검증 게이트웨이
    checker.ts          - pixelscan 스캔 버튼 클릭 모듈
    creepjs.ts          - CreepJS 지문 분석 결과 텍스트 캡처/저장
    canvas.ts           - Canvas 지문 측정 진단 (browserleaks.com 기반, selfTest + BL Signature)

.env              - 환경변수 (하단 참조)
proxies.txt       - HaiIP "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT, 약 2000개)
creepjs-result.txt - runDiagnostics 실행 시 생성 (gitignore 처리)
canvas-fingerprint.txt - runDiagnostics canvas 실행 시 생성 (gitignore 처리)
```

## 단계별 진행 현황

### 0단계 - 기본 모듈 구현 (완료)

- [x] Playwright + stealth 플러그인 연동
- [x] 인간형 타이핑 모방 (`typeLikeHuman`)
- [x] 네이버 → pixelscan 경유 진입 및 봇 탐지 통과 확인
- [x] pixelscan 스캔 버튼 자동 클릭

### 1단계 - 인프라 셋업 및 기본 우회 검증 (완료)

- [x] HaiIP 유동IP 프록시 구매 및 proxies.txt 연동
- [x] ProxyManager 구현 (인메모리 블랙리스트, fs.watch 자동 리로드)
- [x] `channel: 'chrome'` 적용 → 실제 Chrome TLS 지문으로 전환
- [x] playwright-extra → Patchright 전환 → CDP/IsDevtoolOpen 감지 해결
- [x] 네이버/구글 경유 쿠팡 메인 진입 성공
- [x] 쿠팡 검색 엔드포인트 Access Denied → Patchright + Chrome 조합으로 해결
- [x] WebRTC 리크 패치 (`iceServers: []` JS 패치 + 플래그 적용)
- [x] `launchPersistentContext` + `userDataDir` 영구 프로필 전환
- [x] CreepJS 지문 분석 — `0% headless` / `0% stealth` 클린 확인, `25% like headless`는 보정 불가 베이스라인으로 결론

### 2단계 - 행동 모방 모듈 구현 (완료)

- [x] 베지어 곡선 마우스 이동 — `moveMouseAlongCurveAndClick`
- [x] 랜덤 스크롤 체류 — `randomScrollDwell` (2~5회, 200~600px, 가끔 역방향)
- [x] 쿠팡 검색 → 상품 진입 시퀀스 — `runCoupangSearchFlow`
- [x] 광고(스폰서) 상품 링크 회피 — `filter({ hasNotText: "광고" })`
- [x] 새 탭(`target="_blank"`) 캡처 — `context.waitForEvent("page")` + `Promise.all`
- [x] 네이버 셀렉터 버그 수정 — `a.direct_link:not([href*="link.coupang.com"])`
- [x] `ProductTarget` 재설계 — `keywords: string[]` + `products: ProductItem[]`
- [x] `findTargetProduct` 개편 — products 배열을 셔플 후 순회, 항목별 2단계 매칭
- [x] 세션 내 재검색 로직 — 상품 없을 시 스크롤 상단 복귀 → Backspace → 새 쿼리. 후보 소진까지 자동 루프
- [x] `buildSearchQuery` exclude 인자 — 실패 쿼리 제외, 소진 시 `null` 반환
- [x] `ProductNotFoundError` — `usedQueries` / `exhausted` 필드로 index.ts에 상태 전달
- [x] `index.ts` `usedQueries` 세션 간 누적 — 차단 실패 시에는 추가하지 않음
- [x] `[Debug]` 로그 정리 — `runNaverGateway`, `runCoupangSearchFlow` 모두 제거 완료

### 2.5단계 - 코드 구조 리팩토링 (완료, 2026-06-09)

- [x] `behavior.ts` 단일 파일 → 레이어드 아키텍처로 분리 (6개 레이어)
- [x] 하드코딩된 타이밍 값 → `.env` 추출 (NAVER_ENTRY_DELAY 등 9개 변수)
- [x] 하드코딩된 `ProductTarget` → `config/target.ts`로 분리 (DEFAULT_TARGET)
- [x] `browser.ts` / `proxyManager.ts` → `infra/` 레이어로 이동
- [x] `types.ts` / `errors.ts` → `core/` 레이어로 이동
- [x] 진단 파일 → `test/` 레이어로 이동 및 이름 정리 (`test.ts` → `pixelscan.ts`)
- [x] `runPortalGateway` 시그니처 변경 — `ProductTarget` 파라미터 추가
- [x] `utils.ts` 추가 — `sleep` 공통 유틸리티

### 2.6단계 - 다중 상품 / 키워드-상품 바인딩 구조 개편 (완료, 2026-06-10)

- [x] `ProductItem.exactName: string` → `exactNames: string[]` — 옵션 변형(1개/2개/3개 등) 전체 등록
- [x] `keywords` 위치 이동 — `ProductTarget.keywords`(공유) → `ProductItem.keywords`(상품별 전용)
- [x] `DEFAULT_TARGET`에 다중 상품 등록 — 보쌈(9288498572) + 등갈비(9052369498), 상품별 전용 키워드셋
- [x] `buildSearchQuery` 개편 — `{ query, product }` 반환. 키워드를 상품과 1:1 페어링해 "어떤 키워드로 검색했는가"가 곧 "어떤 상품을 찾아야 하는가"를 결정
- [x] 검색어 후보를 `브랜드 + 키워드` 형태로 통일 — 브랜드 없는 키워드 단독 후보 제거 (brand 단독 후보는 예외적으로 모든 상품에 연결)
- [x] `findTargetProduct` 개편 — 단일 `ProductItem` 인자로 변경. `exactNames`를 랜덤 셔플 후 하나씩 ① productId+name 매칭 → ② name 단독 매칭 시도, 첫 매칭에서 즉시 반환
- [x] `[Debug]` 로그 완전 제거 (`flow.ts`)

```typescript
// core/types.ts
interface ProductItem {
  productId: string;
  exactNames: string[];   // 옵션 변형 전체 (1개/2개/3개...)
  keywords: string[];     // 이 상품 전용 검색어
}
interface ProductTarget {
  brand: string;
  products: ProductItem[];
}
```

### 3단계 - 메인 루프 및 예외 처리 (구현 완료, 2026-06-11)

#### 차단 유형 분류 및 복구 전략 (`core/recovery.ts`의 `BLOCK_RECOVERY` 테이블)

| 유형 | 감지 방법 | 프록시 교체 | 프로필 교체 | 재시도 |
|---|---|---|---|---|
| `SELECTOR_BUG` | URL에 `link.coupang.com` 포함 (구글 광고 리다이렉트 등 일시적 케이스 포함) | ❌ | ✅ | ✅ |
| `AKAMAI_BLOCK` | `Reference\s*[:#]\s*18\.` 패턴 / "Access Denied" / "don't have permission to access this page" HTML | ✅ | ✅ | ✅ |
| `COUPANG_APP_BLOCK` | JSON `rCode: "RET9999"` | ✅ | ✅ | ✅ |
| `PORTAL_CAPTCHA` | 네이버 캡차 셀렉터 / 구글 `/sorry/` 리다이렉트·reCAPTCHA | ✅ | ✅ | ✅ |
| `AKAMAI_CHALLENGE` | iframe/challenge 요소 존재 | ✅ | ✅ | ✅ + 대기(`CHALLENGE_RETRY_DELAY`) |
| `PROXY_ERROR` | `page.goto()` 실패 메시지 패턴 매칭 (timeout/ERR_TUNNEL 등) | ✅ | ❌ | ✅ |
| `HTTP_ERROR` | 응답 상태코드 5xx | ✅ (연속 `HTTP_ERROR_THRESHOLD`회 후) | ❌ | ✅ |

#### 구현 완료

- [x] `assertNotBlocked(page)` — `core/blockDetection.ts`. `SELECTOR_BUG`/`AKAMAI_BLOCK`/`COUPANG_APP_BLOCK`/`AKAMAI_CHALLENGE` 4종 검사, `coupang/flow.ts`(검색 결과/상품 페이지 진입 직후) 호출
- [x] 프로필 로테이션 — `user-data/{timestamp}`. `AKAMAI_*` 차단 시 `fs.rmSync`로 폴더 삭제 후 재생성, `PROXY_ERROR`/`HTTP_ERROR`는 프로필 유지
- [x] `createPersistentContext(proxy, profileDir)` 시그니처 변경 — `infra/browser.ts`
- [x] SQLite 도입 (`better-sqlite3`, `infra/db.ts`) — `block_log` / `proxy_stats` / `query_stats`
- [x] `query_stats` 기반 가중 랜덤 — `buildSearchQuery`가 `fail_count` 낮은 쿼리를 우선 선택
- [x] `BlockType`에 `PORTAL_CAPTCHA` 추가 (7종) — 네이버/구글 자체의 봇 차단(캡차, 비정상 트래픽)을 Akamai 차단과 별도로 분류
- [x] `PROXY_ERROR` / `HTTP_ERROR` 분류 구현 — `classifyNavigationError`/`safeGoto`/`withNavigationErrorHandling` 추가 (상세: 아래 "주요 설계 결정" 참고). `gateway/naver.ts`·`google.ts`의 모든 `page.goto()`를 `safeGoto`로, 클릭 후 대기는 `withNavigationErrorHandling`으로 교체
- [x] `assertPortalNotBlocked(page, portal)` — 네이버 캡차(`#captcha_img` 등) / 구글 `/sorry/`·reCAPTCHA 감지, `gateway/naver.ts`·`google.ts`의 검색 직후 호출
- [x] `main().catch((err) => { console.error(err); process.exit(1); })` 추가 — unhandled rejection 방지
- [x] `core/recovery.ts` `BLOCK_RECOVERY` 정책 테이블 신규 — `BlockType → { rotateProxy, rotateProfile, extraDelayMs?, terminal? }`. `index.ts`의 28줄 switch문을 정책 조회+실행으로 단순화. `HTTP_ERROR`는 연속 횟수(`httpErrorStreak`) 기반이라 정책 테이블 조회 전에 별도 분기 처리
- [x] `applyRecoveryPolicy` 헬퍼 함수 추출 (2026-06-11) — `index.ts`의 정책 실행부(`rotateProxy`/`rotateProfile`/`extraDelayMs` 3개 if문)를 `applyRecoveryPolicy(policy, proxy, profileDir, proxyManager): Promise<{ proxy, profileDir }>`로 분리. `terminal` 분기만 메인 루프에 남김
- [x] `runDiagnostics.ts` 컴파일 에러 수정 (2026-06-11) — 3단계 리팩토링(`USER_DATA_DIR`→`USER_DATA_ROOT` 이름 변경, `createPersistentContext(proxy, profileDir)` 시그니처 변경)이 반영되지 않아 발생한 누락분 수정. 진단용 1회성 스크립트라 프로필 로테이션 없이 `ENV.USER_DATA_ROOT`를 그대로 `profileDir`로 사용

### 3.1단계 - 구글 게이트웨이 안정화 및 AKAMAI_BLOCK 감지 보정 (완료, 2026-06-11)

- [x] `assertNotBlocked`의 AKAMAI_BLOCK 정규식 버그 수정 — 실제 Akamai 페이지는 `Reference : 18.6a3c117....`(콜론) 형식인데 `/Reference #18\./`(해시)로 매칭해 한 번도 감지되지 않던 문제 발견. `/Reference\s*[:#]\s*18\./` + `/don't have permission to access this page/i` 패턴 추가
- [x] `gateway/google.ts` "다른 페이지로 이탈됨" 무음 실패 수정 — `googleResultLink.evaluate(el => el.click())`(untrusted click, 광고 클릭 추적 핸들러가 무시 가능) + `page.waitForLoadState("domcontentloaded")`(이미 도달한 상태면 즉시 resolve)의 조합이 원인. `.click()`(trusted) + `page.waitForURL((url) => !url.hostname.includes("google.com"), {timeout: ENV.NAV_TIMEOUT})`로 교체
- [x] `core/recovery.ts` `SELECTOR_BUG` 정책 변경 — `terminal: true` → `{ rotateProxy: false, rotateProfile: true }`. trusted click 적용 후 구글 유료광고(`SAGOOGLEPCHOME` 캠페인, `data-rw`에 `adurl=link.coupang.com/re/...`) 클릭이 정상적으로 `link.coupang.com` 리다이렉트를 트리거하면서 `SELECTOR_BUG`가 발생, `terminal: true`로 인해 `main()` 전체가 종료되던 문제 해결. 광고 노출은 IP/세션마다 달라지는 일시적 현상으로 재해석 — 프록시 자체의 잘못은 아니므로 프로필만 교체
- [x] `gateway/google.ts` 디버그 로그(`debugHref`/`debugTarget`/`debugAncestorHtml`) 제거 — 광고 링크 클릭→`link.coupang.com`→`coupang.com` 리다이렉트 정상 동작을 12세션에 걸쳐 4회 검증 완료
- [x] **검증**: `USER_DATA_ROOT`를 `./user-data-test`, `./user` 두 값으로 각 6세션(총 12세션) 실행 — **AKAMAI_BLOCK 0건**, 전부 성공(1건 PORTAL_CAPTCHA는 정책대로 프록시 교체 후 재시도 성공). 두 프로필 루트 모두 결과 동일 → 프로필 경로 자체는 차단과 무관함을 확인 (아래 "주요 설계 결정" 참고)

### 3.2단계 - 디버그 캡처 및 네트워크 에러 처리 보강 (완료, 2026-06-15)

- [x] **`NAVER_NO_LINK`/`GOOGLE_NO_LINK` HTML 캡처 추가** — `gateway/naver.ts`/`google.ts`의 "매칭된 링크 요소 개수: 0개" 분기에서 `saveDebugHtml(html, "NAVER_NO_LINK" | "GOOGLE_NO_LINK")` 호출 후 에러 메시지에 HTML 경로 포함. `infra/debugCapture.ts`의 `saveDebugHtml` 시그니처를 `type: BlockType` → `type: string`으로 확장(차단 외 진단용 타입도 저장 가능). 정상적으로 상품을 찾는 경우엔 호출되지 않음 — 검증: `debug-html/NAVER_NO_LINK_*.html` 캡처 정상 동작 확인
- [x] **`PROXY_ERROR_PATTERNS`에 `"ERR_TIMED_OUT"` 추가** — `core/blockDetection.ts`. 기존 패턴(`ERR_CONNECTION_TIMED_OUT`, `Timeout`)이 실제 Chrome 에러 문자열 `net::ERR_TIMED_OUT`과 매칭되지 않아 `classifyNavigationError`가 분류 실패 → 원인 불명 `Error`로 떨어져 `block_log`에 기록되지 않던 문제 수정. 이제 `[메인] 차단 감지 (PROXY_ERROR): ...`로 정상 분류·기록됨
- [x] **`gateway/naver.ts`/`google.ts` 포털 첫 진입 `waitUntil: "load"` → `"domcontentloaded"`** — 멀티 인스턴스 동시 실행 시 naver.com/google.com `page.goto()`가 `load` 이벤트까지 대기하다 타임아웃되는 빈도를 줄이기 위한 조치. 적용 후에도 `ERR_TIMED_OUT` 발생 빈도 자체는 유의미하게 줄지 않음 — 원인이 page-load 단계가 아닌 더 앞단(프록시/VPN 연결 수립)일 가능성이 높아 "다음 작업"으로 이전
- [x] **`assertNotBlocked`의 "Execution context was destroyed" 레이스 컨디션 처리** — `core/blockDetection.ts`. `domcontentloaded` 직후 Akamai 스크립트가 추가 navigation을 일으키면 `locator.count()` 중 페이지 컨텍스트가 파괴되어 `Error: locator.count: Execution context was destroyed` 발생 → `BlockDetectedError`가 아닌 일반 에러로 빠져 `block_log` 미기록 + 원인 불명 프록시 교체로 처리되던 문제. 검사 로직을 `assertNotBlockedOnce`로 분리하고, 해당 에러 캐치 시 `waitForLoadState("domcontentloaded")` 후 1회 재검사 → `AKAMAI_CHALLENGE`/`AKAMAI_BLOCK`으로 정상 분류되거나 통과
- [x] **검증 (단일 인스턴스)**: Job 11(보쌈, target 5) 5/5 성공, `AKAMAI_BLOCK` 1회는 정책대로 프록시+프로필 교체 후 재시도 성공. `Execution context was destroyed`는 재발하지 않음 — 단, 발생 자체가 확률적(레이스 컨디션)이라 1회 정상 실행만으로 수정 효과를 확정할 수는 없음, 재발 시 재확인 필요

### 3.3단계 - 프로필 캐시 정리 / 광고 미노출 분리 / Job 종료시각 (완료, 2026-06-15)

- [x] **`clearProfileCache` 추가** — `infra/browser.ts`. 세션 종료마다(`finally`) `Default/Cache`, `Code Cache`, `GPUCache` 등 9개 캐시 폴더만 삭제하고 `Cookies`/`Local Storage`(`_abck` 등 추적 쿠키)는 보존. 캐시가 프로필 용량의 대부분을 차지하므로 매번 정리해도 Akamai 신뢰도에 영향 없음 — 용량 임계값 기반 조건부 정리 불필요
- [x] **`NoLinkFoundError` 신설** — `core/errors.ts`. `NAVER_NO_LINK`/`GOOGLE_NO_LINK`(검색 결과에 쿠팡 링크 없음)를 캡처 HTML 분석 결과 "셀렉터 버그"가 아닌 "광고 미노출"로 재해석(정상 페이지인데 `coupang` 문자열 자체가 없음). `index.ts`에서 프록시/프로필을 그대로 두고 재시도만 수행 — 정상 프록시가 차단으로 오인되어 블랙리스트되던 문제 해결
- [x] **`completeJob`의 `finished_at` 미기록 수정** — `infra/db.ts`. `status='done'`만 갱신하고 `finished_at`(기존 컬럼)을 빼먹어 항상 `NULL`이던 버그. `finished_at = now()` 추가
- [x] **멀티 인스턴스(3개) 재검증** — 프로필 슬롯 충돌 없음, `completed_count`가 `target_count`를 소폭 초과(10/8, 14/12)하는 기존 문서화 트레이드오프 재확인
- [x] **단일 vs 멀티 인스턴스 지연 비교** — 단일 인스턴스 세션당 ~45~52초(기존 56~57초 기준과 동등 이상, 이번 세션의 신규 코드로 인한 지연 없음 확인) vs 3개 동시 실행 시 ~69~74초. **지연 증가 원인은 멀티 인스턴스 리소스 경쟁**(기존부터 존재하던 현상)으로 확인 — 코드 회귀 아님

### 4단계 - 운영 환경 검증 (진행 중)

#### Canvas 지문 다양화 (완료, 2026-06-18)

- [x] **`SLOT_RESOLUTIONS`** — 20종 해상도(1920×1080 ~ 3840×2160)를 슬롯 인덱스로 순환 할당. `infra/browser.ts`에서 슬롯별 `--window-size` 및 `screen.*` 패치에 사용
- [x] **슬롯별 결정적 해시** — `(slot+1) * 0x9E3779B9 >>> 0`로 `noiseDelta`(±1) / `noiseChannel`(R/G/B) / `noisePixelFrac`(0.00~0.99) / `audioNoise`(±1e-7) 결정 — 같은 슬롯은 재실행해도 동일 지문, 슬롯 간에는 서로 다른 지문
- [x] **Canvas 노이즈** — `noisedToDataURL`(height/2 픽셀 수정) + `noisedGetImageData`를 `addInitScript`로 main world에 주입. **premultiplied alpha 문제 해결**: y=0(투명 픽셀) 수정 시 alpha=0 → RGB 소실 → alpha=0이면 alpha=1 fallback으로 처리
- [x] **WebGL readPixels 노이즈** / **AudioBuffer getChannelData 노이즈** 추가
- [x] **`src/test/canvas.ts` 진단 도구 신규** — `npx ts-node src/runDiagnostics.ts canvas [slot]`으로 selfTest sig + BL Signature 측정. `(page as any).evaluate(fn, undefined, false)` = main world 실행
- [x] **검증**: slot-0/1/2 selfTest sig 모두 상이 ✓, 같은 슬롯 재실행 시 동일(결정적) ✓
- [x] **WebGL `getParameter` 스푸핑 기각** — JS prototype 패치 시 `gl.getParameter.toString()`이 `[native code]`가 아닌 커스텀 함수 코드를 반환 → Akamai가 즉시 감지. engine-level 패치(C++)가 아닌 이상 안전하지 않음 → vendor/renderer는 실제 GPU 값 그대로 유지
- [ ] **미검증**: 실제 쿠팡 세션에서 방문자수 개선 여부 — canvas 노이즈 패치 적용 후 세션 실행 및 쿠팡 판매자 대시보드 확인 필요

#### 안정성 / 인프라

- [ ] VM(운영 환경)에서 반복 실행 안정성 검증
- [x] **프로필 폴더 EPERM 재시도 (완료, 2026-06-12)** — `AKAMAI_*` 차단 시 `fs.rmSync(profileDir, {recursive:true, force:true})`로 프로필 폴더를 삭제하는데, Windows에서 방금 닫은 Chrome 프로세스가 파일을 점유 중이면 `EPERM`이 발생하고 `force:true` 때문에 조용히 무시되어 폴더가 삭제되지 않고 남던 문제. `applyRecoveryPolicy`의 `fs.rmSync`에 `maxRetries: 3, retryDelay: 300`(Node 내장 EBUSY/EPERM 재시도) 적용 완료 — leftover 재발 빈도는 운영 중 재확인
- [x] **`user-data-test/` 디스크 누적 (완료, 2026-06-14)** — 52개 폴더 × 평균 ~70MB ≈ 3.6GB까지 쌓였던 문제. `newProfileDir()`(세션마다 새 `{timestamp}` 폴더) 방식을 폐기하고 "프로필 풀"(고정 슬롯 6개 재사용)로 전환해 디스크 사용량을 `6 × ~70MB`로 고정. 기존 leftover 폴더는 수동 정리 필요
- [ ] **좀비 프로세스 정리** — headed 모드로 장시간 반복 실행 시 Chrome 프로세스가 메모리에 잔류하는지 우선 확인. 잔류가 확인되면 `taskkill /f /im chrome.exe` 주기 실행은 멀티 인스턴스 환경에서 다른 인스턴스의 브라우저까지 종료시키므로, `launchPersistentContext`가 반환하는 프로세스 PID 기반 종료로 대체 검토
- [x] **타임스탬프 KST 통일 (완료, 2026-06-14)** — PostgreSQL 전환과 함께 `ALTER DATABASE macro_kit SET timezone TO 'Asia/Seoul';`로 해결. `TIMESTAMPTZ` + `now()`는 절대 시각을 저장하고, DB 세션 타임존 설정에 따라 pgAdmin/psql에서 KST로 표시됨
- [x] **`TEST_PROFILE_DIR` 버그 수정 (2026-06-18)** — `.env`에 canvas 진단용 `TEST_PROFILE_DIR=./user-data-test/tset-canvas`가 잔존 → `isTestMode=true` → `slot=null` + Chrome이 이미 점유 중인 폴더를 열려고 시도 → EPERM + 실행 실패. `TEST_PROFILE_DIR`을 `.env`/`config/env.ts`에서 완전 제거하고 `index.ts`의 `isTestMode` 분기도 제거 — 항상 프로필 풀만 사용

#### 처리량 / 스케줄링

- [ ] **시간당 처리량 측정** — 최근 로그 기준 1회 시도 성공 세션은 평균 약 56~57초(`itime` 타임스탬프 기준 61/56/57/57/52초). 목표 일 2,500 ~ 3,000회 대비, HaiIP 갱신 시간(07:00~10:00) 제외 21시간 가동 시 단일 인스턴스 최대 약 1,326회 → **멀티 인스턴스(약 2~3개) 필요 여부 판단**
- [ ] **스케줄러 도입** — HaiIP 갱신 시간(07:00~10:00) 회피하여 자동 실행. Windows 작업 스케줄러(`schtasks`) 또는 Node 상시 프로세스 내부 시간 체크 방식 검토

#### 모니터링

- [ ] **실시간 모니터링 대시보드** — SQLite 기반(단일 인스턴스, `better-sqlite3` WAL 모드로 읽기 동시성 확보) / PostgreSQL 기반(멀티 인스턴스) 두 경로 검토
- [ ] **(보류) 타겟 플랫폼(쿠팡 파트너센터) 수치 대조** — 매크로 실행 전후로 판매자 계정 로그인/스크래핑은 2FA 등으로 자동화 난이도가 높고, 판매자 계정 자체가 이상 행동으로 탐지될 리스크가 있어 권장 안 함. 대안: 하루 1회 수동 확인 후 대시보드에 수동 입력

#### 멀티 인스턴스 확장 (검토 중)

- [x] **DB: SQLite → PostgreSQL 전환 (완료, 2026-06-14)** — 아래 "5단계" 섹션 참고
- [ ] **프록시 풀 동시 사용 조율** — 현재 DB 블랙리스트는 "실패한 IP"만 인스턴스 간 공유. 여러 인스턴스가 동시에 같은 IP를 선택하는 것을 막는 "사용 중" 상태 공유 메커니즘 없음
- [ ] **인스턴스 간 행동 패턴 다양화** — 동일 VM/시간대에 여러 인스턴스가 비슷한 키워드·타이밍으로 동시 진입 시 패턴 탐지 위험 → 인스턴스별 타이밍 jitter, 키워드 분배 검토
- [x] **디스크 용량 누적 가속 (완료, 2026-06-14)** — 프로필 풀 적용으로 인스턴스 수와 무관하게 디스크 사용량이 고정 슬롯 수만큼으로 제한됨

## 프로필 풀 (완료, 2026-06-14)

`user-data-test/` 디스크 누적과 멀티 인스턴스 프로필 동시성 문제를 해결하기 위해 `newProfileDir()`(`{timestamp}` 1회용 폴더) 방식을 폐기하고 고정 슬롯 재사용 방식으로 전환.

- **고정 슬롯**: `{USER_DATA_ROOT}/profile-0` ~ `profile-19` (20개, 2026-06-15 6개→20개 확장 — 8~12 인스턴스 동시 실행 대비) — 폴더 개수가 고정되어 디스크 사용량이 `슬롯 수 × ~70MB`(관찰된 평균치) 수준으로 수렴. 70MB는 강제 상한이 아닌 추정치이며, 용량 기준 자동 정리 로직은 없음(아래 보류 이슈 참고). 확장 시 `INSERT INTO profile_pool (slot, in_use, locked_at, last_used) SELECT s, false, NULL, NULL FROM generate_series(6, 19) AS s;`로 pgAdmin에서 수동 추가
- **`profile_pool` 테이블** (`slot, in_use, locked_at, last_used`, pgAdmin에서 수동 생성+시드): `acquireProfileSlot(staleMs)`이 `in_use=false` 또는 `locked_at`이 `PROFILE_LOCK_STALE_MS`(기본 10분)보다 오래된 슬롯 중 `last_used`가 가장 오래된(NULL 우선) 슬롯을 `FOR UPDATE SKIP LOCKED`로 원자적 점유, `releaseProfileSlot(slot)`이 반납 + `last_used` 갱신 — 라운드로빈으로 슬롯이 균등 재사용되어 "세션 간 `_abck` 누적" 설계 의도가 실제로 작동
- **차단 시 로테이션**: `rotateProfile: true`여도 슬롯 번호는 유지, 폴더 내용만 `fs.rmSync` 후 재생성
- **모든 슬롯 사용 중**: `acquireProfileSlotWithRetry`가 5초 대기 후 재시도
- `runSession()`이 시작 시 슬롯을 점유하고 `finally`에서 항상 반납 (슬롯 누수 방지)
- **검증 (단일 인스턴스)**: Job 1건 실행 → `profile-0` 점유(`locked_at` 기록) → 성공 후 반납(`in_use=false`, `last_used` 갱신), 다음 Job은 `last_used=NULL`인 `profile-1`을 우선 선택(라운드로빈 정상)
- **DB 권한 주의**: pgAdmin(superuser)에서 새 테이블 생성 시 `macro_app` 롤에 `GRANT`가 자동으로 부여되지 않음 — `profile_pool` 첫 사용 시 `permission denied` 발생, `GRANT SELECT, INSERT, UPDATE, DELETE ON profile_pool TO macro_app;`로 해결. 향후 신규 테이블에도 동일하게 적용 필요
- **남은 검증**: 멀티 인스턴스 동시 실행 시 슬롯 충돌 없이 분배되는지 (4단계 멀티 인스턴스 검증에서 진행)
- **보류 이슈**: 슬롯 재사용 시 `_abck`가 매번 다른 프록시 IP와 조합될 수 있음(기존에도 있던 패턴, 새 리스크 아님)
- **캐시 폴더 누적 (완료, 2026-06-15)** — `clearProfileCache`(`infra/browser.ts`)가 세션 종료마다 `Default/Cache` 등 캐시 폴더를 정리, `_abck` 등 추적 쿠키는 보존 (3.3단계 참고)
- 적용 파일: `.env`/`config/env.ts`(`PROFILE_LOCK_STALE_MS`), `infra/db.ts`(`acquireProfileSlot`/`releaseProfileSlot`), `index.ts`(`profileDirForSlot`, `acquireProfileSlotWithRetry`, `applyRecoveryPolicy` 반환 타입 단순화)

## 5단계 - PostgreSQL 전환 및 운영 자동화 (①②③ 완료 2026-06-14, ④⑤ 계획)

목표 처리량을 일 최대 1만회까지 염두에 두면서, 단독 실행 프로그램을 "웹 대시보드 + API 서버로 원격 제어/모니터링 가능한 시스템"으로 전환하는 단계. 진행 순서: ①PostgreSQL 전환 → ②스키마 확장(`category`/`session_log`/`jobs`) → ③Job 기반 실행 흐름(`index.ts` 리팩토링) → ④API 서버 → ⑤웹 대시보드.

### ① DB: SQLite → PostgreSQL (완료, 2026-06-14)
- 운영 VM에 PostgreSQL 설치 완료 (Windows 설치 시 한글 사용자명으로 인한 PowerShell TEMP 경로 인코딩 오류는 `TEMP`/`TMP`를 `C:\temp`로 재설정해 해결)
- **옵션 B**로 구성 — 멀티 인스턴스/외부 접속을 고려해 기본 `postgres` 슈퍼유저 대신 전용 `macro_app` 롤 + `macro_kit` 데이터베이스를 생성 (pgAdmin에서 GUI로 생성)
- **KST 타임존**: `ALTER DATABASE macro_kit SET timezone TO 'Asia/Seoul';` 적용 — `TIMESTAMPTZ` 컬럼은 절대 시각을 저장하고, 이 설정으로 pgAdmin/psql 조회 시 한국 시간으로 표시됨
- `infra/db.ts` 전면 재작성 — `better-sqlite3` → `pg`(`Pool`) 비동기 API. `CREATE TABLE IF NOT EXISTS` 등 스키마 관리 코드 제거(테이블은 pgAdmin에서 수동 관리), `?` 플레이스홀더 → `$1,$2...`, `CURRENT_TIMESTAMP` → `now()`, `ON CONFLICT ... DO UPDATE SET fail_count = proxy_stats.fail_count + 1`(테이블 한정으로 컬럼 모호성 해결)
- `infra/proxyManager.ts` — `private constructor` + `static async create()` 팩토리 패턴으로 전환(생성자에서 `await loadBlacklistFromDb()` 필요). `markFailed`/`markSuccess`/`watchFile` 리셋 콜백 모두 `async`. 미사용 `toPlaywright()`(playwright-extra 시절 잔재) 제거
- `index.ts`/`coupang/search.ts`/`coupang/flow.ts`/`gateway/index.ts` 전체에 `await` 전파 — `ProxyManager.create()`, `buildSearchQuery`(가중치 계산에 `Promise.all`), `markFailed`/`markSuccess`/`logBlock`/`logSession` 등
- `data/macro.db`의 기존 `block_log` 45건을 1회성 마이그레이션 스크립트로 PostgreSQL `block_log`로 이관 완료 (UTC 타임스탬프는 `new Date(value + "Z")`로 해석해 정확한 시각 보존). 마이그레이션 스크립트와 `data/` 폴더는 작업 완료 후 삭제
- `better-sqlite3`/`@types/better-sqlite3` 의존성 제거, `DB_PATH` 환경변수(`config/env.ts`, `.env`) 제거 — `pg`는 `PG*` 환경변수를 자동으로 읽음

### ② 스키마 확장 (완료, 2026-06-14)
- **`category` 필드**: `core/types.ts`의 `ProductItem`에 `category: string` 추가 — `productId: "9288498572"`(보쌈)에 `category: "보쌈"` 적용, `config/target.ts`의 `DEFAULT_TARGET`에도 반영 (등갈비 상품은 주석 처리된 상태로 `category: "등갈비"` 추가)
- **`반반팩` 상품 추가 (2026-06-15)** — `config/target.ts`의 `DEFAULT_TARGET.products`에 `productId: "9483036408"`, `category: "반반팩"` 등록 (exactNames 1종 + keywords 12종)
- **`session_log` 테이블**: `block_log`는 실패만 기록하므로, 성공도 포함한 "상품별 성공/실패 횟수" 조회를 위해 신설. 컬럼: `id, job_id, product_id, category, exact_name(nullable), success, block_type(nullable), proxy_host, proxy_port, profile_dir, occurred_at`. `coupang/flow.ts`의 `runCoupangSearchFlow`에서 상품 발견/미발견 시점마다 `infra/db.ts`의 `logSession()` 호출 — `GROUP BY product_id, category` + `COUNT(*) FILTER (WHERE success)`로 항목별 성공/실패 집계 가능
- **`exact_name` 컬럼 추가 (완료, 2026-06-14)** — `findTargetProduct`가 매칭에 성공한 `exactNames` 옵션 문자열(예: "국내산 한돈 통 오겹살 저당 저칼로리 한방 보쌈 수육, 1개, 300g")을 `{ locator, matchedName }` 형태로 반환하고, `runCoupangSearchFlow`가 이를 `logSession`에 전달. 실패 시(`exactIndex` 미발견)는 `null`. `GROUP BY product_id, exact_name` + `COUNT(*) FILTER (WHERE success)`로 옵션별 성공 횟수 집계 가능
- **`jobs` 테이블**: 웹에서 "카테고리 + 횟수"(예: 보쌈, 3000) 요청 시 생성될 예정. 컬럼: `id, category, target_count, completed_count, status(running/done), created_at`. `idx_jobs_one_running` 유니크 인덱스(`CREATE UNIQUE INDEX ... ON jobs (status) WHERE status = 'running'`)로 동시 실행 Job을 DB 레벨에서 1개로 제한 (③ 구현 시 활용)
- **`jobs.failed_session_count` 컬럼 추가 (완료, 2026-06-16)** — `runSession()`이 `false`(5회 재시도 모두 실패/exhausted/프록시 없음 등 `!success`)를 반환한 횟수를 누적. `infra/db.ts`에 `incrementJobFailedCount(jobId)` 추가, `index.ts` 메인 루프의 `if (success) {...} else { await incrementJobFailedCount(job.id); }`에서 호출. **주의**: 최초 적용 시 `else`가 `if (success)`가 아닌 내부 `if (completedCount >= targetCount)`에 잘못 붙어 "목표 도달 전 성공 횟수"를 카운트하는 버그가 있었음(2026-06-16 발견 즉시 수정) — 수정 이전(Job 24 등)에 쌓인 `failed_session_count` 값은 실패율 지표로 사용 불가

### ③ 실행 흐름 — Job 기반 + LISTEN/NOTIFY (완료, 2026-06-14)
- `index.ts`의 `main()`을 `SESSION_COUNT` 고정 반복 → `while(true)` + `getRunningJob()` 기반 idle 대기 구조로 전환. `SESSION_COUNT` 환경변수 제거
- `infra/db.ts`에 `getRunningJob`/`incrementJobProgress`(`UPDATE ... RETURNING`으로 원자적 증가)/`completeJob`/`listenForJobCreated`(전용 `pg.Client`로 `LISTEN job_created` 유지, `pool`은 LISTEN에 부적합) 추가
- idle 대기는 `NOTIFY` 즉시 + `IDLE_POLL_MS`(30초) 폴링 안전망을 병행. 루프 첫 바퀴에서 `getRunningJob()`을 먼저 호출하므로, 프로세스가 막 시작돼 NOTIFY를 못 받았어도 기존 `running` Job을 즉시 발견
- `runSession(proxyManager, target, jobId)`: `DEFAULT_TARGET` 하드코딩 제거, `category`로 필터링한 `ProductTarget`(`buildTargetForCategory`)과 `jobId`를 인자로 받고 성공 여부(`boolean`)를 반환
- `completed_count`는 **성공한 세션만** 증가, `target_count` 도달 시 `status='done'`
- `session_log.job_id`에 실제 Job ID 기록 (`coupang/flow.ts`/`gateway/index.ts`에 `jobId` 파라미터 전달)
- **검증 (단일 인스턴스)**: pgAdmin에서 `INSERT INTO jobs (...) VALUES (...); NOTIFY job_created;` → idle 중이던 인스턴스가 즉시 깨어나 세션 실행 → `completed_count`/`status` 정상 갱신 확인
- **알려진 트레이드오프**: 여러 인스턴스가 동시에 마지막 세션을 처리하면 `completed_count`가 `target_count`를 소폭 초과할 수 있음 — 정밀한 동시 정지보다 단순성 우선

### ④ API 서버
- API 서버와 매크로 인스턴스는 **직접 통신하지 않고 PostgreSQL을 매개로만 연결** — API 서버는 인스턴스 수/위치를 몰라도 됨, 인스턴스 증감 시 API 서버 코드 변경 불필요
- 엔드포인트(안): `POST /jobs {category, count}`, `GET /jobs`, `GET /stats`(전체/항목별 성공·실패), `GET /logs`(`session_log`/`block_log` 기반)
- `POST /jobs`: `idx_jobs_one_running` 유니크 인덱스로 동시 실행 Job 1개 제한 — 이미 `running` Job이 있으면 INSERT 없이 409 반환. 등록 성공 시 `estimatedFinishAt = now + (target_count / 활성 인스턴스 수) × 평균 세션 소요시간`(최근 `session_log` 기준)을 응답에 포함
- 프레임워크: Express/Fastify

### ⑤ 웹 대시보드
- **옵션 C 확정**: 분리형 SPA(React + Vite) + 독립 API 서버 — 역할 분리 명확. CORS 설정 필요
- 화면: 전체/항목별 성공·실패 횟수, 실패 로그, Job 등록 폼(카테고리+횟수), 진행률/예상 종료시간

### 외부 접속
- API 서버 + 프론트엔드 빌드 결과물 모두 운영 VM에서 호스팅 (Nginx 리버스 프록시로 `/api/*`는 API 서버, 나머지는 정적 파일)
- 운영 VM은 HaiIP 제공 원격 데스크톱(`49.254.214.117:10389` → 내부 RDP, NAT/포트포워딩 구조) — 웹 서비스용 포트도 동일하게 HaiIP에 포워딩 요청 필요
  - 80번 포워딩 가능 시: `http://도메인` 그대로 사용 가능
  - 임의 포트만 가능 시: `http://도메인:포트`처럼 URL에 포트 명시 필요 (RDP의 `:10389`와 동일 패턴)
  - **포트포워딩 자체가 불가능하면 Cloudflare Tunnel**(무료, `cloudflared`로 VM이 아웃바운드 연결만 사용 — HaiIP 설정 변경 불필요, HTTPS 자동 적용) 사용
- 도메인: 가비아 구매 또는 무료 DNS — Cloudflare Tunnel 사용 시 네임서버를 Cloudflare로 이전
- Postgres(5432)는 외부 포트포워딩/터널 대상에서 제외, 내부 전용으로 유지

## 테스트 결과 및 현황 (2026-06-09 기준)

### Pixelscan / Bot Detection 테스트 결과

| 항목               | 결과                         | 비고                  |
| ------------------ | ---------------------------- | --------------------- |
| Navigator          | Clear ✅                     |                       |
| Webdriver          | Clear ✅                     |                       |
| CDP                | Clear ✅                     | Patchright CDP 패치   |
| IsDevtoolOpen      | Clear ✅                     | Patchright 효과       |
| User Agent         | Clear ✅                     |                       |
| Bot Detection 종합 | You're Definitely a Human ✅ |                       |

### WebRTC / VPN 테스트 결과

| 항목                         | 결과                        | 비고                                                               |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------ |
| VPN Check                    | No VPN or Proxy Detected ✅ | Proxy 0%, VPN 0%                                                   |
| WebRTC IP Leak               | OK ✅                       | HTTP IP = WebRTC IP, 불일치 없음                                   |
| WebRTC Leak Test (전용 도구) | Potential Leak ⚠️           | External IPv4 모두 `-`, STUN 차단됨. 도구가 보수적으로 경고만 표시 |

### 쿠팡 진입 테스트

- 네이버 경유 쿠팡 메인 진입: **성공** ✅
- 구글 경유 쿠팡 메인 진입: **성공** ✅
- 쿠팡 검색 엔드포인트 (`/np/search`): **차단 해제** ✅

### 행동 모방 모듈 검증 결과

- **검증된 쿠팡 셀렉터**:
  - 검색창: `input[name="q"]:visible` — 데스크탑/태블릿용 form 두 개에 중복 존재 → `:visible`로 타겟팅. 재검색 시 `scrollToTop` 후 진행하면 sticky 바가 사라지므로 문제없음
  - 상품 링크: `a[href*="/vp/products/"]` — 메인/검색결과 공통 패턴
- **`data-id` ≠ `productId`**: `<li data-id>`는 `vendorItemId`와 일치. 판매자 교체 시 변동 → `productId`(`/vp/products/{ID}`)를 1순위 식별자로 채택
- **광고 링크 필터**: `<a>` 내 "광고" 텍스트 / `sourceType=srp_product_ads` / `class="view-logged"` 세 신호가 1:1 동반 → `filter({ hasNotText: "광고" })`로 필터링
- **새 탭 처리**: 쿠팡 상품 링크는 `target="_blank"`. `context.waitForEvent("page")`를 클릭과 `Promise.all`로 동시 실행해 새 탭 캡처
- **`link.coupang.com` 오매칭 버그**: `a.direct_link`가 네이버 브랜드검색 광고 버튼을 매칭해 Akamai 차단 유발 → `a.direct_link:not([href*="link.coupang.com"])`으로 수정
- **RET9999 메커니즘**: IP 기반이 아니라 세션 쿠키 기반. 프록시 교체만으로는 해결 안 되고 프로필(userDataDir) 교체 필요
- **재검색 로직 안전성**: 재검색 사이 경과 시간 최소 5~20초 — RET9999 트리거(0.5초 간격)와 10~40배 차이. keywords N개 기준 최대 2N+1회 검색도 안전
- **영구 프로필 burn**: 오염된 `_abck` 쿠키가 userDataDir에 누적되면 새 세션에서도 차단 지속 → 3단계 프로필 로테이션으로 해결 예정

### CreepJS 지문 분석 결과 (2026-06-07 기준)

| 항목                | 결과          | 비고                                            |
| ------------------- | ------------- | ----------------------------------------------- |
| `0% headless`       | Clear ✅      | 정의적 헤드리스 시그널 없음                     |
| `0% stealth`        | Clear ✅      | 스텔스 패치 흔적 없음                           |
| `25% like headless` | 노이즈 수준   | 자동화 지문 클러스터와의 퍼지 유사도. 보정 불가 |
| WebRTC              | host candidate만 노출 | `iceServers: []` 패치로 실 IP 비노출 확인 |

`outerWidth`/`outerHeight` 패치는 해당 점수에 영향 없음(가설 기각). `25%` 노이즈는 베이스라인으로 결론.

## 주요 설계 결정

- **Patchright 선택**: playwright-extra + stealth로는 CDP/IsDevtoolOpen 감지 해결 불가. Patchright는 브라우저 레벨 CDP 패치. `channel: 'chrome'`과 조합으로 TLS 지문 + CDP 동시 해결
- **레이어드 아키텍처**: `behavior.ts` 단일 파일의 8가지 책임을 `config` / `core` / `infra` / `automation` / `gateway` / `coupang` 레이어로 분리. `index.ts` 패턴으로 폴더 내부 구현 은닉
- **config 레이어**: `ENV` 객체로 모든 환경변수를 단일 진입점에서 관리. 타이밍 매직넘버를 `.env`로 추출해 운영 환경 조정 가능
- **launchPersistentContext**: 매 실행 쿠키 초기화 방지. 세션 간 데이터 축적으로 Akamai 신뢰도 향상. 단, 봇으로 찍히면 오염 마커도 영구 저장 → 3단계에서 차단 감지 시 프로필 삭제 + 로테이션으로 대응
- **네이버 링크 클릭**: `a.direct_link:not([href*="link.coupang.com"]), a[href*="coupang.com"]:not([href*="ader.naver.com"]):not([href*="link.coupang.com"])` → href 추출 후 `page.goto()`로 이동. Referer 체인 유지
- **구글 링크 클릭**: 같은 탭에서 이동 → `waitForLoadState` + `Promise.all` 패턴
- **네이버 검색 후 대기**: `sleep(NAVER_SEARCH_DELAY=3000)` 필수. 1초로 줄이면 봇 감지 발생
- **WebRTC 패치**: `iceServers: []`로 STUN 차단. `RTCPeerConnection` 자체는 유지해 Akamai API 완전성 체크 통과
- **`ProductTarget` 구조 (2026-06-10 개편)**: `brand: string` + `products: ProductItem[]`. 각 `ProductItem`은 `productId` + `exactNames: string[]`(옵션 변형 전체) + `keywords: string[]`(상품 전용 검색어)를 가짐. `buildSearchQuery`는 상품별 `브랜드+키워드` 후보를 만들어 `{ query, product }` 쌍으로 풀에 모은 뒤 랜덤 선택 — 키워드와 상품이 항상 1:1로 묶여 있어 "한돈"(등갈비 키워드)으로 보쌈 상품을 찾는 식의 교차 매칭이 발생하지 않음. brand 단독 검색만 예외적으로 모든 상품에 연결됨. 실패한 쿼리는 `exclude` Set으로 제외하고 모두 소진 시 `null` 반환
- **`findTargetProduct` 매칭 전략 (2026-06-10 개편)**: `buildSearchQuery`가 결정한 단일 `ProductItem`만 탐색. `exactNames`(옵션 변형 목록)를 랜덤 셔플 후 하나씩 ① productId 후보군 → exactName 매칭 → ② exactName 단독 매칭(productId 변경 복구) 시도, 첫 매칭에서 즉시 반환 — 매 실행마다 다른 옵션으로 진입. fuzzy 폴백 없음
- **`ProductNotFoundError`**: `usedQueries: Set<string>` + `exhausted: boolean` 필드. index.ts가 쿼리 누적 및 종료 여부 판단. 차단 오류와 명확히 구분
- **프록시 블랙리스트 조건**: 타겟 상품 미발견은 프록시 잘못 아님 → 블랙리스트 추가 안 함. 추가 조건: `AKAMAI_BLOCK` / `COUPANG_APP_BLOCK` / `AKAMAI_CHALLENGE` (markFailed). RET9999는 프록시 교체와 별개로 프로필 교체가 핵심 대응
- **Akamai 차단 메커니즘**: ① 프록시 IP 평판, ② `_abck` 쿠키(세션 쿠키 기반) 복합 추적. 프록시 교체만으로 부족하고 프로필도 교체해야 `_abck` 오염 상태 리셋. (2026-06-11 검증) `USER_DATA_ROOT` 루트 경로 자체는 차단과 무관 — 과거의 연속 AKAMAI_BLOCK은 그 시점에 뽑힌 프록시 IP 풀의 평판 문제일 가능성이 높음
- **프로필 로테이션 전략**: 3단계에서는 `user-data/{timestamp}` 1회용 폴더 방식으로 도입했으나, 디스크 누적 문제로 5단계에서 고정 슬롯(`profile-0~5`) 재사용 방식("프로필 풀")으로 전환. `createPersistentContext(proxy, profileDir)`는 동일하게 사용하고, `AKAMAI_*` 차단 시 슬롯 번호는 유지한 채 폴더 내용만 `fs.rmSync` 후 재생성, 성공 시 그대로 보존
- **`context.close()` vs 프로필 교체**: `context.close()`는 브라우저 프로세스 자원 정리일 뿐 `userDataDir`에 남은 `_abck` 등 디스크 데이터는 그대로 유지됨. Akamai 세션 신뢰도 리셋은 프로필 폴더 자체를 삭제·재생성해야만 가능 — 그래서 `AKAMAI_*` 계열 차단에서만 프로필을 교체
- **이중 블랙리스트 구조 (3단계, 구현 완료)**: 인메모리 블랙리스트(이번 실행 한정, 1회 실패 시 즉시 제외)와 DB 블랙리스트(`proxy_stats.fail_count >= PROXY_FAIL_THRESHOLD`, 실행 간 누적)를 병행. `ProxyManager` 생성 시 `loadBlacklistFromDb()`로 DB 블랙리스트를 인메모리에 병합해 시작
- **차단 복구 정책 테이블 (`core/recovery.ts`, 3단계 보완 완료)**: `BlockType → RecoveryPolicy(rotateProxy, rotateProfile, extraDelayMs?, terminal?)` 형태의 데이터 테이블로 복구 전략을 분리. `index.ts`는 정책을 조회해 실행만 담당 — 새 BlockType 추가 시 `index.ts` 수정 없이 테이블에 항목만 추가하면 됨. `HTTP_ERROR`는 연속 횟수(`httpErrorStreak`) 상태에 의존해 정책 테이블로 표현 불가 → `index.ts`에서 테이블 조회 전에 별도 처리, 테이블엔 타입 완전성용 더미 항목만 존재
- **`PROXY_ERROR`/`HTTP_ERROR` 분류 (`core/blockDetection.ts`)**: `classifyNavigationError`가 `page.goto()` 등에서 던져진 에러의 `.message`를 `ERR_TUNNEL_CONNECTION_FAILED`/`Timeout` 등 패턴과 매칭해 `PROXY_ERROR`로 분류. `safeGoto`는 `page.goto()`를 감싸 예외는 `classifyNavigationError`로, 정상 응답은 `assertResponseOk`로 5xx 여부를 검사해 `HTTP_ERROR`로 변환. `withNavigationErrorHandling`은 `page.goto()`가 아닌 탐색 동작(클릭 후 `waitForLoadState` 등)에 동일 분류 로직을 재사용하기 위한 범용 래퍼. 모두 Node 쪽 에러 메시지/응답 메타데이터만 다루므로 Akamai 등 차단 시스템에 노출되는 브라우저 동작에는 영향 없음
- **`PORTAL_CAPTCHA` (`assertPortalNotBlocked`)**: 네이버/구글 자체의 봇 차단(캡차, 비정상 트래픽 경고)을 쿠팡(Akamai) 차단과 별도로 감지. 네이버는 `#captcha_img` 등 캡차 셀렉터 + "비정상적인 접근" 본문 텍스트, 구글은 URL의 `/sorry/` 리다이렉트 + reCAPTCHA iframe으로 판별. 검색 결과 로드 직후(`gateway/naver.ts`/`google.ts`)에 호출. 복구 정책은 `AKAMAI_BLOCK`과 동일(프록시+프로필 교체) — 포털의 IP 평판/쿠키 추적 메커니즘이 Akamai와 유사하다고 판단
- **Canvas 노이즈 방식 (2026-06-18)**: `toDataURL`/`getImageData`를 `addInitScript`로 main world에 패치 — JS prototype 패치이므로 `HTMLCanvasElement.prototype.toDataURL.toString()`이 `[native code]`를 반환하지 않음. Akamai가 이를 검사하면 탐지 가능하나, `getParameter.toString()`(WebGL)만큼 명시적으로 타깃팅한다는 증거는 없음 — 실 세션 검증으로 확인 필요. WebGL `getParameter` 스푸핑은 `toString()` 탐지 위험이 문서화되어 있어 기각
- **`addInitScript` main world 주입 확인법**: `(page as any).evaluate(fn, undefined, false)` — 세 번째 인자 `false` + 두 번째 인자 `undefined` 조합이 main world 실행을 보장. `undefined` 외 인자를 전달하면 Patchright API 동작이 달라져 main world 보장 안 됨(quirk)

## 현재 브라우저 실행 옵션

```typescript
// infra/browser.ts — chromium.launchPersistentContext(profileDir, options)
channel: "chrome"       // 실제 Chrome 사용 → TLS 지문 해결
headless: ENV.HEADLESS  // .env HEADLESS 값으로 제어

args: [
  "--start-maximized",
  "--disable-blink-features=AutomationControlled",
  "--remote-debugging-port=0",
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  "--disable-popup-blocking",
  "--disable-dev-shm-usage",  // 리눅스 VM/컨테이너 공유메모리 고갈 방지. fingerprint에 영향 없음
]
```

addInitScript (context 레벨, 슬롯별 파라미터 주입):

- **창 크기 정합성**: `outerWidth`/`outerHeight` → `innerWidth`/`innerHeight` 위임. `screen.*`를 슬롯 해상도로 패치
- **WebRTC ICE 차단**: `iceServers: []`로 STUN 서버 제거 — `RTCPeerConnection` 자체는 유지
- **Canvas 노이즈**: `toDataURL` / `getImageData` 오버라이드 — 슬롯 해시 기반 1픽셀 미세 수정 (premultiplied alpha 대응 포함)
- **WebGL readPixels 노이즈**: `WebGLRenderingContext` / `WebGL2RenderingContext` `readPixels` 오버라이드
- **AudioBuffer 노이즈**: `getChannelData` 오버라이드 — 첫 샘플에 ±1e-7 가산

## 환경변수 (.env)

```dotenv
# 기본 설정
MAX_RETRY=5
USER_DATA_ROOT=./user-data-2      # 프로필 풀 루트 — {root}/profile-0 ~ profile-19 고정 슬롯 (20개)
PROFILE_LOCK_STALE_MS=600000      # 비정상 종료로 in_use=true가 남은 슬롯을 재사용 허용하는 기준 시간(ms)
PROXY_FILE_PATH=./proxies.txt
HEADLESS=false

# 포털 선택 비율 (0~1, 1이면 항상 네이버)
NAVER_RATIO=0.5

# PostgreSQL (pg가 자동으로 읽는 표준 환경변수)
PGHOST=localhost
PGPORT=5432
PGDATABASE=macro_kit
PGUSER=macro_app
PGPASSWORD=...   # 실제 값은 .env에만 존재, 문서에 기록하지 않음

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
CHALLENGE_RETRY_DELAY=10000   # AKAMAI_CHALLENGE 재시도 전 대기

# 차단/프록시 임계값
HTTP_ERROR_THRESHOLD=3   # HTTP_ERROR 연속 N회 시 프록시 교체
PROXY_FAIL_THRESHOLD=2   # proxy_stats.fail_count 누적 시 DB 블랙리스트 등재
```

## 실행 환경

- **로컬 개발**: Windows 11 + VS Code
- **운영 환경**: VM (VS Code + 패키지 설치 완료)
- VM에서 HaiIP OpenVPN 클라이언트 실행 후 proxies.txt 갱신 필요

## 실행 방법

```bash
npm install
npx patchright install chromium
cp .env.example .env   # 값 수정 후 사용
# HaiIP 클라이언트 → "접속하기" → "IP 저장" → proxies.txt 갱신
npx ts-node src/index.ts                          # 실제 자동화 루프 (pgAdmin에서 Job INSERT + NOTIFY 필요)
npx ts-node src/runDiagnostics.ts                 # CreepJS 지문 분석
npx ts-node src/runDiagnostics.ts pixelscan       # pixelscan 봇 탐지 테스트
npx ts-node src/runDiagnostics.ts canvas [slot]   # Canvas 지문 슬롯별 측정
```

## 보류 작업

- [ ] (보류) `query_stats` 키가 `query` 단독이라 brand 단독 쿼리가 여러 `product`와 페어링될 때 통계가 섞임 — `(query, productId)` 복합키 전환은 운영 데이터 확인 후 재검토

## 다음 작업

> Canvas 지문 다양화 + `TEST_PROFILE_DIR` 버그 수정 완료 (2026-06-18). 이전: 5단계 ①②③(PostgreSQL, 스키마, Job LISTEN/NOTIFY) + 프로필 풀 완료 (2026-06-14), 3.2/3.3단계 완료 (2026-06-15), `failed_session_count` 완료 (2026-06-16).

### 지속 모니터링

- **인스턴스 수 증가 시 `NAVER_NO_LINK` 비율 급증** — N=8 시 네이버 NO_LINK ~60%, 성공률 ~3%로 붕괴. 가설: HaiIP IP 대역이 좁아 동시 다발 쿠팡 검색이 네이버 광고서버에서 비정상 트래픽으로 차단 — 미검증
- **`NoLinkFoundError` DB 미기록** — `block_log`/`session_log` 어디에도 안 남아 SQL 집계 불가. 로깅 추가 필요 (미구현)
- **`Execution context was destroyed` 재발** — 3.2단계에서 재시도 로직 적용. 재발 시 `AKAMAI_CHALLENGE`/`AKAMAI_BLOCK`으로 분류되는지 확인

### 향후 작업

- **4단계**: VM 반복 실행 안정성 검증, 좀비 프로세스 정리, 처리량 측정/스케줄러
- **5단계 ④⑤**: API 서버(Express/Fastify) + React+Vite 대시보드 (옵션 C, 분리형 SPA)
- **Docker 전환 (Xvfb headed)** — `HEADLESS=false` + `channel:"chrome"` 유지하면서 Xvfb로 컨테이너 내 실행. 단, NO_LINK 원인이 네트워크/포털 트래픽 패턴이라면 Docker 전환만으로는 미해결 — 원인 조사 먼저
- **프록시 동시 사용 조율** — `proxy_locks` 테이블(`FOR UPDATE SKIP LOCKED`) 설계됨, 구현 여부 미결정
- `AKAMAI_CHALLENGE` / `PORTAL_CAPTCHA` 셀렉터 보정 — `debug-html/` 실제 캡처로 검증 (운영 데이터 누적 필요)
