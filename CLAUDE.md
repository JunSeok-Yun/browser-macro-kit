Patchright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

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
    errors.ts           - 커스텀 에러 (ProductNotFoundError, BlockDetectedError, BlockType)
    blockDetection.ts   - 차단 감지 (assertNotBlocked) — SELECTOR_BUG/AKAMAI_BLOCK/COUPANG_APP_BLOCK/AKAMAI_CHALLENGE

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

### 3단계 - 메인 루프 및 예외 처리 (1차 구현 완료, 2026-06-10 — 일부 보완 필요)

#### 차단 유형 분류 및 복구 전략

| 유형 | 감지 방법 | 프록시 교체 | 프로필 교체 | 재시도 |
|---|---|---|---|---|
| `SELECTOR_BUG` | URL에 `link.coupang.com` 포함 | ❌ | ❌ | ❌ (코드 버그, `index.ts`에서 `return`으로 즉시 종료) |
| `AKAMAI_BLOCK` | `Reference #18.` 패턴 / "Access Denied" HTML | ✅ | ✅ | ✅ |
| `COUPANG_APP_BLOCK` | JSON `rCode: "RET9999"` | ✅ | ✅ | ✅ |
| `AKAMAI_CHALLENGE` | iframe/challenge 요소 존재 | ✅ | ✅ | ✅ + 대기 |
| `PROXY_ERROR` | timeout / ERR_TUNNEL 등 | ✅ | ❌ | ✅ |
| `HTTP_ERROR` | 5xx 상태코드 | ✅ (N회 후) | ❌ | ✅ |

#### 구현 완료

- [x] `BlockDetectedError` + `BlockType`(6종 union) — `core/errors.ts`
- [x] `assertNotBlocked(page)` — `core/blockDetection.ts`. `SELECTOR_BUG`/`AKAMAI_BLOCK`/`COUPANG_APP_BLOCK`/`AKAMAI_CHALLENGE` 4종 검사, `coupang/flow.ts`(검색 결과/상품 페이지 진입 직후) 호출
- [x] `index.ts` 복구 분기 — `BlockDetectedError.type`별 프록시/프로필 교체. `SELECTOR_BUG`는 `return`으로 안전 종료, `context.close()`는 `finally`에서 한 번만 수행
- [x] 프로필 로테이션 — `user-data/{timestamp}`. `AKAMAI_*` 차단 시 `fs.rmSync`로 폴더 삭제 후 재생성, `PROXY_ERROR`/`HTTP_ERROR`는 프로필 유지
- [x] `createPersistentContext(proxy, profileDir)` 시그니처 변경 — `infra/browser.ts`
- [x] SQLite 도입 (`better-sqlite3`, `infra/db.ts`) — `block_log` / `proxy_stats` / `query_stats`
- [x] `query_stats` 기반 가중 랜덤 — `buildSearchQuery`가 `fail_count` 낮은 쿼리를 우선 선택

#### 남은 작업

- [ ] **`PROXY_ERROR` / `HTTP_ERROR` 미구현** — `assertNotBlocked`은 두 타입을 던지지 않고, `gateway/naver.ts`·`google.ts`의 `page.goto()` 실패(`ERR_TUNNEL_CONNECTION_FAILED`, `Timeout exceeded`, 5xx 등)도 분류 없이 일반 에러로 처리됨 → `index.ts`의 해당 switch 분기는 현재 데드코드. `classifyNavigationError(error)` 같은 헬퍼로 분류해 `BlockDetectedError`를 던지도록 보완 필요
- [ ] `index.ts`의 `createPersistentContext` / `context.newPage()` 호출이 try 블록 밖에 있어 실패 시 미처리 — try로 감싸고 `main().catch(...)` 안전장치 추가 필요
- [ ] `AKAMAI_CHALLENGE` 셀렉터(`iframe[src*="challenge"]`, `#px-captcha`)는 추정값 — 실제 챌린지 화면 캡처 후 보정 필요
- [ ] (보류) `query_stats` 키가 `query` 단독이라 brand 단독 쿼리가 여러 `product`와 페어링될 때 통계가 섞임 — `(query, productId)` 복합키 전환은 운영 데이터 확인 후 재검토

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
- **Akamai 차단 메커니즘**: ① 프록시 IP 평판, ② `_abck` 쿠키(세션 쿠키 기반) 복합 추적. 프록시 교체만으로 부족하고 프로필도 교체해야 `_abck` 오염 상태 리셋
- **프로필 로테이션 전략 (3단계, 구현 완료)**: `user-data/{timestamp}` 방식. `createPersistentContext(proxy, profileDir)`로 매 시도마다 프로필 경로를 받아 사용. `AKAMAI_*` 차단 시 `fs.rmSync`로 즉시 삭제 후 새 타임스탬프 폴더 생성, 성공 시 그대로 보존
- **`context.close()` vs 프로필 교체**: `context.close()`는 브라우저 프로세스 자원 정리일 뿐 `userDataDir`에 남은 `_abck` 등 디스크 데이터는 그대로 유지됨. Akamai 세션 신뢰도 리셋은 프로필 폴더 자체를 삭제·재생성해야만 가능 — 그래서 `AKAMAI_*` 계열 차단에서만 프로필을 교체
- **이중 블랙리스트 구조 (3단계, 구현 완료)**: 인메모리 블랙리스트(이번 실행 한정, 1회 실패 시 즉시 제외)와 DB 블랙리스트(`proxy_stats.fail_count >= PROXY_FAIL_THRESHOLD`, 실행 간 누적)를 병행. `ProxyManager` 생성 시 `loadBlacklistFromDb()`로 DB 블랙리스트를 인메모리에 병합해 시작

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
HTTP_ERROR_THRESHOLD=3   # HTTP_ERROR 연속 N회 시 프록시 교체 (현재 미사용 — PROXY_ERROR/HTTP_ERROR 미구현)
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

> 3단계(메인 루프 및 예외 처리, SQLite 연동) 1차 구현 완료 (2026-06-10). 아래 보완 작업 후 4단계 진입.

### 3단계 보완 (우선순위 순)

1. **`PROXY_ERROR` / `HTTP_ERROR` 분류 구현** — `core/blockDetection.ts`에 `classifyNavigationError(error)` 등 헬퍼 추가, `gateway/naver.ts` / `gateway/google.ts`의 `page.goto()` 실패(타임아웃, `ERR_TUNNEL_*`, 5xx)를 감지해 `BlockDetectedError`로 던지도록 수정 — 현재 `index.ts`의 해당 switch 분기는 데드코드
2. **`index.ts` 안전장치 보강** — `createPersistentContext` / `context.newPage()`를 try 블록 안으로 이동, `main().catch((err) => { console.error(err); process.exit(1); })` 추가
3. **`AKAMAI_CHALLENGE` 셀렉터 보정** — 실제 챌린지 화면 캡처 후 `core/blockDetection.ts`의 추정 셀렉터 검증
4. (보류) `query_stats` 키를 `(query, productId)` 복합키로 분리 검토 — 운영 데이터 누적 후 재검토

### 이후

- **`runGoogleGateway` 재검증** — 현재 봇 탐지에 걸리는 상태
- **4단계**: VM 반복 실행 안정성 검증
