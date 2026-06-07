Playwright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 기술 스택

- **언어**: TypeScript (CommonJS, ES2022)
- **자동화**: Patchright (playwright-extra + stealth에서 전환, CDP 패치 내장)
- **런타임**: Node.js
- **프록시**: HaiIP 유동IP (HTTP 프록시, OpenVPN 클라이언트 인증 방식)

## 파일 구조

src/
index.ts        - 진입점. 재시도 루프 조율 (실제 자동화 루프만 담당, 진단/테스트 코드 분리됨)
browser.ts      - 영구 브라우저 컨텍스트 팩토리
behavior.ts     - 쿠팡 진입용 게이트웨이 로직 (네이버/구글 경유)
proxyManager.ts - HaiIP 유동IP 연동 모듈
runDiagnostics.ts - 진단 전용 엔트리포인트. CLI 인자로 creepjs(기본) | pixelscan 선택 실행 (신규)
creepjs.ts      - CreepJS 지문 분석 결과를 텍스트로 캡처/저장하는 모듈 (신규)
test.ts         - pixelscan 경유 봇 탐지 검증용 테스트 로직
testChecker.ts  - pixelscan 스캔 버튼 클릭 모듈

.env           - 환경변수 설정 (MAX_RETRY, USER_DATA_DIR, PROXY_FILE_PATH, HEADLESS)
proxies.txt    - HaiIP 클라이언트 "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT 형식, 약 2000개)
creepjs-result.txt - runDiagnostics 실행 시 생성되는 CreepJS 분석 결과 텍스트 (gitignore 처리)

## 단계별 진행 현황

### 0단계 - 기본 모듈 구현 (완료)

- [x] Playwright + stealth 플러그인 연동
- [x] 인간형 타이핑 모방 (`typeLikeHuman`)
- [x] 네이버 → pixelscan 경유 진입 및 봇 탐지 통과 확인
- [x] pixelscan 스캔 버튼 자동 클릭

### 1단계 - 인프라 셋업 및 기본 우회 검증 (완료)

- [x] HaiIP 유동IP 프록시 구매 및 proxies.txt 연동
- [x] ProxyManager 구현 (인메모리 블랙리스트, fs.watch 자동 리로드, 재시도 루프)
- [x] `channel: 'chrome'` 적용 → 실제 Chrome TLS 지문으로 전환
- [x] playwright-extra → Patchright 전환 → CDP/IsDevtoolOpen 감지 해결
- [x] 네이버 경유 쿠팡 진입 성공
- [x] 구글 경유 쿠팡 진입 성공
- [x] 쿠팡 검색 엔드포인트 Access Denied → Patchright + Chrome 조합으로 해결
- [x] WebRTC 리크 패치 (`iceServers: []` JS 패치 + 플래그 적용)
- [x] VM 환경 구성 완료 (VS Code + 패키지 설치, 코드 정상 동작 확인)
- [x] `launchPersistentContext` + `userDataDir` 영구 프로필 전환
- [x] CreepJS로 지문 분석 검증 — `0% headless` / `0% stealth` 클린 확인, `25% like headless`는 패치와 무관한 베이스라인 노이즈로 결론 (자세한 내용은 아래 CreepJS 테스트 결과 참고)

### 2단계 - 행동 모방 모듈 구현 (예정)

- 포털 검색 → 타겟 링크 클릭 (베지어 곡선 마우스 이동)
- 페이지 진입 후 랜덤 스크롤 체류 로직
- 쿠팡 검색창 입력 → 상품 진입까지 자연스러운 행동 시퀀스

### 3단계 - 메인 루프 및 예외 처리 (예정)

- 봇 탐지 / 403 / 502 감지 시 세션 종료 후 프록시 교체 리트라이 (현재 루프 구조는 구현됨)
- 실패 로그 DB 저장 (SQLite 예정)

## 테스트 결과 및 현황 (2026-06-05 기준)

### Pixelscan / Bot Detection 테스트 결과 (Patchright + Chrome 적용 후)

| 항목               | 결과                         | 비고                       |
| ------------------ | ---------------------------- | -------------------------- |
| Navigator          | Clear ✅                     |                            |
| Webdriver          | Clear ✅                     |                            |
| CDP                | Clear ✅                     | Patchright가 CDP 감지 패치 |
| IsDevtoolOpen      | Clear ✅                     | Patchright 효과            |
| User Agent         | Clear ✅                     |                            |
| Bot Detection 종합 | You're Definitely a Human ✅ |                            |

### WebRTC / VPN 테스트 결과 (패치 적용 후)

| 항목                         | 결과                        | 비고                                                               |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------ |
| VPN Check                    | No VPN or Proxy Detected ✅ | Proxy 0%, VPN 0%                                                   |
| WebRTC IP Leak (VPN Check)   | OK ✅                       | HTTP IP = WebRTC IP, 불일치 없음                                   |
| WebRTC Leak Test (전용 도구) | Potential Leak ⚠️           | External IPv4 모두 `-`, STUN 차단됨. 도구가 보수적으로 경고만 표시 |

### 쿠팡 테스트 결과 (Patchright + Chrome 적용 후)

- 네이버 경유 쿠팡 메인 진입: **성공** ✅
- 구글 경유 쿠팡 메인 진입: **성공** ✅
- 쿠팡 검색 엔드포인트 (`/np/search`): **차단 해제** ✅ (이전 Access Denied → 해결)

### CreepJS 지문 분석 결과 (2026-06-07 기준, `runDiagnostics.ts creepjs`)

> CreepJS는 "신뢰 점수(trust score)"가 아니라 `% like headless` / `% headless` / `% stealth` 퍼센트 지표와 `FP ID` / `Fuzzy` 해시로 결과를 표시한다 (CLAUDE.md의 기존 "신뢰 점수" 표현은 실제 사이트 용어와 다름 — 실사이트 Ctrl+F로 "trust" 검색 시 매칭 없음을 확인).

| 항목              | 결과    | 비고                                                                 |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `0% headless`     | Clear ✅ | 정의적 헤드리스 시그널 없음                                          |
| `0% stealth`      | Clear ✅ | 스텔스 패치 흔적 없음                                                |
| `25% like headless` | 노이즈 수준 | 알려진 자동화 지문 클러스터와의 퍼지/집계 유사도로 추정. 단일 불리언 플래그가 아니라 고정하기 어려움 |
| WebRTC            | host candidate만 노출, STUN `blocked` | `iceServers: []` 패치로 실 IP 비노출 확인                            |

- **`outerWidth`/`outerHeight` 패치 가설 검증**: "패치가 `% like headless` 점수에 영향을 줄 수 있다"는 가설을 세우고 패치 적용/제거 두 차례 실행 후 해시값을 비교. `25% like headless: fafdf9d1`, `0% headless: 52defe05`, `0% stealth: 0c019315` — **세 해시 모두 동일** → 패치는 해당 점수에 전혀 영향을 주지 않음을 확인 (가설 기각, 현재 패치는 그대로 유지)
- 수동 비교 시 주의점: DevTools를 직접 열면 `webDriverIsOn: true`가, 브라우저 확장 프로그램이 설치되어 있으면 `hasToStringProxy: true`가 잡혀 "클린 베이스라인"이 오염됨 — 자동화 환경(헤드풀 + 확장 없음)이 오히려 더 깨끗한 결과를 보임
- **결론**: `0% headless` / `0% stealth`로 정의적 지표는 클린, `25%` 노이즈는 보정 불가능한 베이스라인으로 판단 → 1단계 CreepJS 검증 항목 완료 처리

## 주요 설계 결정

- **Patchright 선택 이유**: playwright-extra + stealth로는 CDP/IsDevtoolOpen 감지 해결 불가. Patchright는 브라우저 레벨에서 CDP 패치 적용. `channel: 'chrome'`과 조합으로 TLS 지문 + CDP 동시 해결
- **browser.ts 분리**: 브라우저 컨텍스트 생성 책임을 index.ts에서 분리. `createPersistentContext(proxy)` 팩토리 함수로 단일 책임 유지
- **진단 코드 분리 (runDiagnostics.ts)**: index.ts에 섞여 있던 pixelscan 테스트 코드를 제거하고 `runDiagnostics.ts`로 일원화. CLI 인자(`creepjs` | `pixelscan`)로 대상 선택 → `npx ts-node src/runDiagnostics.ts [creepjs|pixelscan]`. 실제 자동화 루프(index.ts)와 진단/검증 로직의 책임을 명확히 분리
- **CreepJS 결과 저장 방식**: 스크린샷 대신 `page.locator("body").innerText()`로 텍스트 전체를 캡처해 `creepjs-result.txt`로 저장 (`creepjs.ts`). 텍스트 기반이라 diff 비교·분석이 용이
- **launchPersistentContext 전환 이유**: `newContext()`는 매 실행마다 쿠키/히스토리 초기화 → 봇 신뢰도 낮음. `launchPersistentContext + userDataDir`로 세션 간 데이터 축적, 구글 reCAPTCHA 회피 및 Akamai 신뢰도 향상
- **환경변수 관리**: `dotenv`로 MAX_RETRY, USER_DATA_DIR, PROXY_FILE_PATH, HEADLESS를 `.env`에서 관리. 각 모듈 상단에 `import "dotenv/config"` 적용
- **네이버 링크 클릭**: `a.direct_link` 또는 `a[href*="coupang.com"]:not([href*="ader.naver.com"])` 셀렉터로 타겟팅 → href 추출 후 `page.goto(href, { waitUntil: "domcontentloaded" })`로 직접 이동. `ader.naver.com` 리다이렉트 체인을 그대로 따라가므로 Referer 체인 유지됨
- **구글 링크 클릭**: 같은 탭에서 이동 → `waitForLoadState` 리스너를 클릭 전에 등록 후 `Promise.all` 패턴
- **네이버 검색 후 대기**: `sleep(3000)` 필수. 1초로 줄이면 봇 감지 발생
- **WebRTC 패치**: `iceServers: []`로 STUN 요청 차단. `RTCPeerConnection` 자체는 유지해 Akamai 브라우저 API 완전성 체크 통과
- 프록시 인증: HaiIP OpenVPN 클라이언트 연결 후 사용 가능 (별도 username/password 불필요)
- ProxyManager 블랙리스트: 인메모리 관리 (15일 IP 교체 주기에 맞춰 재시작 시 초기화)
- 실패 로그 DB는 SQLite로 나중에 추가 예정 (현재는 인메모리만 운영)

## 현재 브라우저 실행 옵션

```typescript
// chromium.launchPersistentContext(USER_DATA_DIR, options)
channel: "chrome";   // 실제 Chrome 사용 → TLS 지문 해결
headless: false;     // .env HEADLESS 값으로 제어

args: [
  "--start-maximized",
  "--disable-blink-features=AutomationControlled",
  "--remote-debugging-port=0",  // CDP 포트 외부 노출 차단
  "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",  // WebRTC 프록시 강제
];
```

addInitScript (context 레벨):

```typescript
Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight });

// WebRTC STUN 요청 차단 (iceServers 제거로 실IP 노출 방지, RTCPeerConnection은 유지)
const OrigRTC = window.RTCPeerConnection;
if (OrigRTC) {
  (window as any).RTCPeerConnection = function (cfg: any) {
    return new OrigRTC(cfg ? { ...cfg, iceServers: [] } : undefined);
  };
  (window as any).RTCPeerConnection.prototype = OrigRTC.prototype;
  Object.assign((window as any).RTCPeerConnection, OrigRTC);
}
```

## ProxyManager 구조

```
proxies.txt (HaiIP "IP 저장" 버튼으로 갱신)
    ↓
ProxyManager
  - getRandom()       랜덤 프록시 반환 (블랙리스트 제외)
  - markFailed()      실패 IP 블랙리스트 등록 + 다음 IP 반환
  - toPlaywright()    { server: "http://IP:PORT" } 변환
  - fs.watch()        파일 변경 감지 → 자동 리로드 + 블랙리스트 초기화
```

## 실행 환경

- **로컬 개발**: Windows 11 + VS Code
- **운영 환경**: VM (VS Code + 필요 패키지 설치 완료, 코드 정상 동작 확인)
- VM에서 HaiIP OpenVPN 클라이언트 실행 후 proxies.txt 갱신 필요

## 실행 방법

```bash
npm install
npx patchright install chromium
# .env 파일 생성 (MAX_RETRY, USER_DATA_DIR, PROXY_FILE_PATH, HEADLESS 설정)
# HaiIP 클라이언트 실행 → "접속하기" 클릭 (OpenVPN 연결)
# "IP 저장" 클릭 → proxies.txt 갱신
npx ts-node src/index.ts        # 실제 자동화 루프 실행

# 진단/검증용 (별도 엔트리포인트)
npx ts-node src/runDiagnostics.ts            # CreepJS 지문 분석 (기본값)
npx ts-node src/runDiagnostics.ts pixelscan  # pixelscan 봇 탐지 테스트
```

## 다음 작업

> 1단계(인프라 셋업 및 기본 우회 검증) 전 항목 완료. 이제부터 2단계(행동 모방 모듈 구현) 착수.

1. **쿠팡 검색 → 상품 진입 시퀀스 구현** — 검색창 입력 후 상품 클릭까지 행동 모방 (2단계 시작)
2. **베지어 곡선 마우스 이동** — 자연스러운 마우스 궤적 구현
3. **랜덤 스크롤 체류 로직** — 페이지 진입 후 인간형 스크롤 패턴
