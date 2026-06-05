Playwright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 기술 스택

- **언어**: TypeScript (CommonJS, ES2022)
- **자동화**: Patchright (playwright-extra + stealth에서 전환, CDP 패치 내장)
- **런타임**: Node.js
- **프록시**: HaiIP 유동IP (HTTP 프록시, OpenVPN 클라이언트 인증 방식)

## 파일 구조

src/
index.ts - 진입점. 브라우저 실행, ProxyManager 연동, 재시도 루프 조율
behavior.ts - 쿠팡 진입용 게이트웨이 로직 (네이버/구글 경유)
test.ts - pixelscan 경유 봇 탐지 검증용 테스트 로직
testChecker.ts - pixelscan 스캔 버튼 클릭 모듈
proxyManager.ts - HaiIP 유동IP 연동 모듈 (구현 완료)

proxies.txt - HaiIP 클라이언트 "IP 저장" 버튼으로 생성되는 프록시 목록 (IP:PORT 형식, 약 2000개)

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
- [x] 네이버 경유 쿠팡 진입 성공 (히든 링크 `evaluate` 클릭으로 해결)
- [x] 구글 경유 쿠팡 진입 성공 (같은 탭 이동, `waitForLoadState` 패턴 적용)
- [x] 쿠팡 검색 엔드포인트 Access Denied → Patchright + Chrome 조합으로 해결
- [x] WebRTC 리크 패치 (`iceServers: []` JS 패치 + 플래그 적용)
- [x] VM 환경 구성 완료 (VS Code + 패키지 설치, 코드 정상 동작 확인)
- [ ] `launchPersistentContext` + `userDataDir` 영구 프로필 전환
- [ ] CreepJS로 지문/IP 신뢰 점수 검증

### 2단계 - 행동 모방 모듈 구현 (예정)

- 포털 검색 → 타겟 링크 클릭 (베지어 곡선 마우스 이동)
- 페이지 진입 후 랜덤 스크롤 체류 로직
- 쿠팡 검색창 입력 → 상품 진입까지 자연스러운 행동 시퀀스

### 3단계 - 메인 루프 및 예외 처리 (예정)

- 봇 탐지 / 403 / 502 감지 시 세션 종료 후 프록시 교체 리트라이 (현재 루프 구조는 구현됨)
- 실패 로그 DB 저장 (SQLite 예정)

## 테스트 결과 및 현황 (2026-06-04 기준)

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

## 주요 설계 결정

- **Patchright 선택 이유**: playwright-extra + stealth로는 CDP/IsDevtoolOpen 감지 해결 불가. Patchright는 브라우저 레벨에서 CDP 패치 적용. `channel: 'chrome'`과 조합으로 TLS 지문 + CDP 동시 해결
- **네이버 링크 클릭**: 검색결과의 쿠팡 링크가 히든 `<a class="direct_link" target="_blank">` 요소 → `element.evaluate(el => el.click())` + `Promise.all([waitForEvent("page"), evaluate])` 패턴
- **구글 링크 클릭**: 같은 탭에서 이동 → `waitForLoadState` 리스너를 클릭 전에 등록 후 `Promise.all` 패턴. `waitForURL`은 coupang.com 루트 URL 패턴 매칭 실패로 사용 불가
- **네이버 검색 후 대기**: `sleep(3000)` 필수. 1초로 줄이면 봇 감지 발생
- **WebRTC 패치**: `iceServers: []`로 STUN 요청 차단. `RTCPeerConnection` 자체는 유지해 Akamai 브라우저 API 완전성 체크 통과
- 구글 직접 접속 시 reCAPTCHA 발생 → `userDataDir` 영구 프로필로 해결 예정 (1단계 잔여)
- 프록시 인증: HaiIP OpenVPN 클라이언트 연결 후 사용 가능 (별도 username/password 불필요)
- ProxyManager 블랙리스트: 인메모리 관리 (15일 IP 교체 주기에 맞춰 재시작 시 초기화)
- 실패 로그 DB는 SQLite로 나중에 추가 예정 (현재는 인메모리만 운영)

## 현재 브라우저 실행 옵션

```typescript
// chromium.launch()
channel: "chrome"; // 실제 Chrome 사용 → TLS 지문 해결

args: [
  "--start-maximized",
  "--disable-blink-features=AutomationControlled",
  "--remote-debugging-port=0", // CDP 포트 외부 노출 차단
  "--webrtc-ip-handling-policy=disable_non_proxied_udp", // WebRTC 프록시 강제
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
# HaiIP 클라이언트 실행 → "접속하기" 클릭 (OpenVPN 연결)
# "IP 저장" 클릭 → proxies.txt 갱신
npx ts-node src/index.ts
```

## 다음 작업

1. **`launchPersistentContext` + `userDataDir` 전환** — 영구 쿠키/히스토리 프로필로 구글 reCAPTCHA 및 신뢰도 향상
2. **CreepJS 검증** — 현재 지문/IP 신뢰 점수 종합 확인
3. **쿠팡 검색 → 상품 진입 시퀀스 구현** — 검색창 입력 후 상품 클릭까지 행동 모방 (2단계 시작)
4. **베지어 곡선 마우스 이동** — 자연스러운 마우스 궤적 구현
5. **랜덤 스크롤 체류 로직** — 페이지 진입 후 인간형 스크롤 패턴
