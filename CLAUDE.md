Playwright 기반 브라우저 자동화 프로젝트. 포털 사이트(네이버/구글)를 경유하여 타겟 사이트에 자연스럽게 진입하는 것을 목표로 하며, Akamai 봇 탐지 우회를 검증 중이다.

## 기술 스택

- **언어**: TypeScript (CommonJS, ES2022)
- **자동화**: playwright-extra + puppeteer-extra-plugin-stealth
- **런타임**: Node.js

## 파일 구조

src/
index.ts - 진입점. 브라우저 실행 및 전체 시퀀스 조율
behavior.ts - 실제 쿠팡 진입용 게이트웨이 로직 (네이버/구글 경유)
test.ts - pixelscan 경유 봇 탐지 검증용 테스트 로직
testChecker.ts - pixelscan 스캔 버튼 클릭 모듈
proxyManager.ts - 주거용 프록시 연동 모듈 (미구현, 결제 후 작업 예정)

## 단계별 진행 현황

### 0단계 - 기본 모듈 구현 (완료)

- [x] Playwright + stealth 플러그인 연동
- [x] 인간형 타이핑 모방 (`typeLikeHuman`)
- [x] 네이버 → pixelscan 경유 진입 및 봇 탐지 통과 확인
- [x] pixelscan 스캔 버튼 자동 클릭
- [ ] 주거용 프록시 연동 (`proxyManager.ts`) — 결제 후 1단계와 함께 진행

### 1단계 - 인프라 셋업 및 기본 우회 검증 (예정)

- Windows VM에 Node.js 환경 구성
- 주거용 프록시 연동
- `launchPersistentContext` + `userDataDir`로 영구 프로필 적용
- CreepJS로 지문/IP 신뢰 점수 검증

### 2단계 - 행동 모방 모듈 구현 (예정)

- 포털 검색 → 타겟 링크 클릭 (베지어 곡선 마우스 이동)
- 페이지 진입 후 랜덤 스크롤 체류 로직

### 3단계 - 메인 루프 및 예외 처리 (예정)

- try-catch-finally 기반 순차 실행 루프
- 봇 탐지 / 403 / 502 감지 시 세션 종료 후 프록시 교체 리트라이

## 주요 설계 결정

- 구글 직접 접속 시 reCAPTCHA 발생 → `userDataDir` 영구 프로필로 해결 예정 (1단계)
- 네이버 검색 결과는 새 탭으로 열리므로 `Promise.all` 패턴 사용
- 구글 검색 결과는 탭 이동 방식이 불확실하므로 `Promise.race` 패턴 사용
- 프록시 인증 정보는 `.env`에 저장 (git 제외)

## 브라우저 실행 옵션

```typescript
args: ["--disable-webrtc", "--start-maximized", "--disable-blink-features=AutomationControlled"];
```

## 실행 방법

```bash
npm install
npx ts-node src/index.ts
```
