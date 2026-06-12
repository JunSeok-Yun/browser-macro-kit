Patchright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 코드 수정 요청 시 응답 방식

코드 변경이 필요한 작업을 요청받으면, **직접 파일을 수정하지 말고** 사용자가 스스로 적용할 수 있도록 아래 형식으로 상세히 설명한다:

- 파일 경로와 수정 위치(줄 번호 또는 함수명)를 명시
- 변경 전(Before) / 변경 후(After) 코드를 diff처럼 비교 제시
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
  index.ts              - 메인 진입점. 세션 재시도 루프, usedQueries 누적 관리
  runDiagnostics.ts     - 진단 전용 진입점 (creepjs | pixelscan)
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
    proxyManager.ts     - HaiIP 유동IP 연동 모듈 (ProxyManager, 인메모리+DB 이중 블랙리스트)
    db.ts               - SQLite 연동 (better-sqlite3) — block_log/proxy_stats/query_stats

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

.env              - 환경변수 (하단 참조)
proxies.txt       - HaiIP "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT, 약 2000개)
creepjs-result.txt - runDiagnostics 실행 시 생성 (gitignore 처리)
data/macro.db     - SQLite DB (block_log/proxy_stats/query_stats, gitignore 처리)
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
- [x] `PROXY_ERROR` / `HTTP_ERROR` 분류 구현 — `core/blockDetection.ts`에 `classifyNavigationError`(에러 메시지 패턴 매칭) / `safeGoto`(goto 래퍼, 5xx는 `assertResponseOk`로 검사) / `withNavigationErrorHandling`(goto 외 탐색 동작용) 추가. `gateway/naver.ts`·`google.ts`의 모든 `page.goto()`를 `safeGoto`로, 클릭 후 대기는 `withNavigationErrorHandling`으로 교체
- [x] `assertPortalNotBlocked(page, portal)` — 네이버 캡차(`#captcha_img` 등) / 구글 `/sorry/`·reCAPTCHA 감지, `gateway/naver.ts`·`google.ts`의 검색 직후 호출
- [x] `main().catch((err) => { console.error(err); process.exit(1); })` 추가 — unhandled rejection 방지
- [x] `core/recovery.ts` `BLOCK_RECOVERY` 정책 테이블 신규 — `BlockType → { rotateProxy, rotateProfile, extraDelayMs?, terminal? }`. `index.ts`의 28줄 switch문을 정책 조회+실행으로 단순화. `HTTP_ERROR`는 연속 횟수(`httpErrorStreak`) 기반이라 정책 테이블 조회 전에 별도 분기 처리
- [x] `applyRecoveryPolicy` 헬퍼 함수 추출 (2026-06-11) — `index.ts`의 정책 실행부(`rotateProxy`/`rotateProfile`/`extraDelayMs` 3개 if문)를 `applyRecoveryPolicy(policy, proxy, profileDir, proxyManager): Promise<{ proxy, profileDir }>`로 분리. `terminal` 분기만 메인 루프에 남김
- [x] `runDiagnostics.ts` 컴파일 에러 수정 (2026-06-11) — 3단계 리팩토링(`USER_DATA_DIR`→`USER_DATA_ROOT` 이름 변경, `createPersistentContext(proxy, profileDir)` 시그니처 변경)이 반영되지 않아 발생한 누락분 수정. 진단용 1회성 스크립트라 프로필 로테이션 없이 `ENV.USER_DATA_ROOT`를 그대로 `profileDir`로 사용

#### 남은 작업

- [ ] `AKAMAI_CHALLENGE`(`iframe[src*="challenge"]`, `#px-captcha`) / `PORTAL_CAPTCHA`(`#captcha_img`, `.captcha_wrap`, `/sorry/` 등) 셀렉터는 모두 추정값 — 실제 차단/캡차 화면 캡처 후 보정 필요
- [ ] (보류) `query_stats` 키가 `query` 단독이라 brand 단독 쿼리가 여러 `product`와 페어링될 때 통계가 섞임 — `(query, productId)` 복합키 전환은 운영 데이터 확인 후 재검토

### 3.1단계 - 구글 게이트웨이 안정화 및 AKAMAI_BLOCK 감지 보정 (완료, 2026-06-11)

- [x] `assertNotBlocked`의 AKAMAI_BLOCK 정규식 버그 수정 — 실제 Akamai 페이지는 `Reference : 18.6a3c117....`(콜론) 형식인데 `/Reference #18\./`(해시)로 매칭해 한 번도 감지되지 않던 문제 발견. `/Reference\s*[:#]\s*18\./` + `/don't have permission to access this page/i` 패턴 추가
- [x] `gateway/google.ts` "다른 페이지로 이탈됨" 무음 실패 수정 — `googleResultLink.evaluate(el => el.click())`(untrusted click, 광고 클릭 추적 핸들러가 무시 가능) + `page.waitForLoadState("domcontentloaded")`(이미 도달한 상태면 즉시 resolve)의 조합이 원인. `.click()`(trusted) + `page.waitForURL((url) => !url.hostname.includes("google.com"), {timeout: ENV.NAV_TIMEOUT})`로 교체
- [x] `core/recovery.ts` `SELECTOR_BUG` 정책 변경 — `terminal: true` → `{ rotateProxy: false, rotateProfile: true }`. trusted click 적용 후 구글 유료광고(`SAGOOGLEPCHOME` 캠페인, `data-rw`에 `adurl=link.coupang.com/re/...`) 클릭이 정상적으로 `link.coupang.com` 리다이렉트를 트리거하면서 `SELECTOR_BUG`가 발생, `terminal: true`로 인해 `main()` 전체가 종료되던 문제 해결. 광고 노출은 IP/세션마다 달라지는 일시적 현상으로 재해석 — 프록시 자체의 잘못은 아니므로 프로필만 교체
- [x] `gateway/google.ts` 디버그 로그(`debugHref`/`debugTarget`/`debugAncestorHtml`) 제거 — 광고 링크 클릭→`link.coupang.com`→`coupang.com` 리다이렉트 정상 동작을 12세션에 걸쳐 4회 검증 완료
- [x] **검증**: `USER_DATA_ROOT`를 `./user-data-test`, `./user` 두 값으로 각 6세션(총 12세션) 실행 — **AKAMAI_BLOCK 0건**, 전부 성공(1건 PORTAL_CAPTCHA는 정책대로 프록시 교체 후 재시도 성공). 두 프로필 루트 모두 결과 동일 → 프로필 경로 자체는 차단과 무관함을 확인 (아래 "주요 설계 결정" 참고)

#### SQLite 스키마 (구현 완료, `infra/db.ts`)

```sql
CREATE TABLE IF NOT EXISTS block_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy_host  TEXT,
  proxy_port  INTEGER,
  block_type  TEXT,
  message     TEXT,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proxy_stats (
  host          TEXT,
  port          INTEGER,
  success_count INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  last_success  DATETIME,
  last_failed   DATETIME,
  PRIMARY KEY (host, port)
);

CREATE TABLE IF NOT EXISTS query_stats (
  query         TEXT PRIMARY KEY,
  success_count INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  last_used     DATETIME
);
```

- `proxies.txt`가 변경되면(`fs.watch`) 인메모리 블랙리스트 초기화 + `resetProxyStats()`로 `proxy_stats` 전체 삭제 — IP 풀 자체가 바뀌므로 과거 평가는 무효화. `block_log` / `query_stats`는 영구 누적(날짜별 이력 확인용)
- DB GUI 확인: VS Code `SQLite Viewer` 확장 또는 `DB Browser for SQLite`로 `data/macro.db` 열람 가능

### 4단계 - 운영 환경 검증 (예정)

- [ ] VM(운영 환경)에서 반복 실행 안정성 검증

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
- **Akamai 차단 메커니즘**: ① 프록시 IP 평판, ② `_abck` 쿠키(세션 쿠키 기반) 복합 추적. 프록시 교체만으로 부족하고 프로필도 교체해야 `_abck` 오염 상태 리셋. (2026-06-11 추가 검증) `USER_DATA_ROOT`를 `./user-data-test` / `./user` 두 값으로 각 6세션씩(총 12세션) 실행해도 둘 다 AKAMAI_BLOCK 0건 — `profileDir`은 항상 `{root}/{Date.now()}`(매번 새 빈 폴더)이라 루트 경로 자체는 구조적으로 무관함을 재확인. 과거의 연속 AKAMAI_BLOCK은 그 시점에 뽑힌 프록시 IP 풀의 평판 문제일 가능성이 높음
- **프로필 로테이션 전략 (3단계, 구현 완료)**: `user-data/{timestamp}` 방식. `createPersistentContext(proxy, profileDir)`로 매 시도마다 프로필 경로를 받아 사용. `AKAMAI_*` 차단 시 `fs.rmSync`로 즉시 삭제 후 새 타임스탬프 폴더 생성, 성공 시 그대로 보존
- **`context.close()` vs 프로필 교체**: `context.close()`는 브라우저 프로세스 자원 정리일 뿐 `userDataDir`에 남은 `_abck` 등 디스크 데이터는 그대로 유지됨. Akamai 세션 신뢰도 리셋은 프로필 폴더 자체를 삭제·재생성해야만 가능 — 그래서 `AKAMAI_*` 계열 차단에서만 프로필을 교체
- **이중 블랙리스트 구조 (3단계, 구현 완료)**: 인메모리 블랙리스트(이번 실행 한정, 1회 실패 시 즉시 제외)와 DB 블랙리스트(`proxy_stats.fail_count >= PROXY_FAIL_THRESHOLD`, 실행 간 누적)를 병행. `ProxyManager` 생성 시 `loadBlacklistFromDb()`로 DB 블랙리스트를 인메모리에 병합해 시작
- **차단 복구 정책 테이블 (`core/recovery.ts`, 3단계 보완 완료)**: `BlockType → RecoveryPolicy(rotateProxy, rotateProfile, extraDelayMs?, terminal?)` 형태의 데이터 테이블로 복구 전략을 분리. `index.ts`는 정책을 조회해 실행만 담당 — 새 BlockType 추가 시 `index.ts` 수정 없이 테이블에 항목만 추가하면 됨. `HTTP_ERROR`는 연속 횟수(`httpErrorStreak`) 상태에 의존해 정책 테이블로 표현 불가 → `index.ts`에서 테이블 조회 전에 별도 처리, 테이블엔 타입 완전성용 더미 항목만 존재
- **`PROXY_ERROR`/`HTTP_ERROR` 분류 (`core/blockDetection.ts`)**: `classifyNavigationError`가 `page.goto()` 등에서 던져진 에러의 `.message`를 `ERR_TUNNEL_CONNECTION_FAILED`/`Timeout` 등 패턴과 매칭해 `PROXY_ERROR`로 분류. `safeGoto`는 `page.goto()`를 감싸 예외는 `classifyNavigationError`로, 정상 응답은 `assertResponseOk`로 5xx 여부를 검사해 `HTTP_ERROR`로 변환. `withNavigationErrorHandling`은 `page.goto()`가 아닌 탐색 동작(클릭 후 `waitForLoadState` 등)에 동일 분류 로직을 재사용하기 위한 범용 래퍼. 모두 Node 쪽 에러 메시지/응답 메타데이터만 다루므로 Akamai 등 차단 시스템에 노출되는 브라우저 동작에는 영향 없음
- **`PORTAL_CAPTCHA` (`assertPortalNotBlocked`)**: 네이버/구글 자체의 봇 차단(캡차, 비정상 트래픽 경고)을 쿠팡(Akamai) 차단과 별도로 감지. 네이버는 `#captcha_img` 등 캡차 셀렉터 + "비정상적인 접근" 본문 텍스트, 구글은 URL의 `/sorry/` 리다이렉트 + reCAPTCHA iframe으로 판별. 검색 결과 로드 직후(`gateway/naver.ts`/`google.ts`)에 호출. 복구 정책은 `AKAMAI_BLOCK`과 동일(프록시+프로필 교체) — 포털의 IP 평판/쿠키 추적 메커니즘이 Akamai와 유사하다고 판단

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
]
```

addInitScript (context 레벨):

```typescript
Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight });

const OrigRTC = window.RTCPeerConnection;
if (OrigRTC) {
  (window as any).RTCPeerConnection = function (cfg: any) {
    return new OrigRTC(cfg ? { ...cfg, iceServers: [] } : undefined);
  };
  (window as any).RTCPeerConnection.prototype = OrigRTC.prototype;
  Object.assign((window as any).RTCPeerConnection, OrigRTC);
}
```

## 환경변수 (.env)

```dotenv
# 기본 설정
MAX_RETRY=5
USER_DATA_ROOT=./user-data-test   # 프로필 로테이션 루트 — 실행마다 {timestamp} 하위 폴더 생성
PROXY_FILE_PATH=./proxies.txt
DB_PATH=./data/macro.db
HEADLESS=false

# 포털 선택 비율 (0~1, 1이면 항상 네이버)
NAVER_RATIO=0.5

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
npx ts-node src/index.ts                     # 실제 자동화 루프
npx ts-node src/runDiagnostics.ts            # CreepJS 지문 분석
npx ts-node src/runDiagnostics.ts pixelscan  # pixelscan 봇 탐지 테스트
```

## 다음 작업

> 3단계(메인 루프 및 예외 처리, SQLite 연동, `applyRecoveryPolicy` 분리) + 3.1단계(구글 게이트웨이 안정화, AKAMAI_BLOCK 감지 보정, 12세션 무사고 검증) 구현 완료 (2026-06-11). 아래 작업 후 4단계 진입.

- `AKAMAI_CHALLENGE` / `PORTAL_CAPTCHA` 셀렉터 보정 — 실제 차단/캡차 화면 캡처 후 `core/blockDetection.ts`의 추정 셀렉터 검증
- (보류) `query_stats` 키를 `(query, productId)` 복합키로 분리 검토 — 운영 데이터 누적 후 재검토
- **4단계**: VM 반복 실행 안정성 검증
