# MEMORY.md

프로젝트 진행상황 스냅샷. 전체 이력이 아닌 "현재 상태 + 다음 작업" 위주로 유지한다.
아키텍처/기술 레퍼런스는 [ARCHITECTURE.md](ARCHITECTURE.md), 코딩 규칙은 [CLAUDE.md](CLAUDE.md) 참고.

## 현재 상태 (2026-09-08 기준)

- 0~5.3단계 완료: 자동화 코어, 포털 4종(네이버/구글/다음/네이트) 연동, 차단 감지/복구, PostgreSQL 전환, 타임아웃/네트워크 캡처 개선, Job 51 로그 기반 버그 수정
- 5단계 ④(API 서버) ⑤(웹 대시보드)는 계획 단계, 미착수
- 최근 커밋: 프록시 관리를 인메모리 → DB(`proxy_pool`) 기반으로 전환 (56128de) — ARCHITECTURE.md의 `proxyManager.ts` 설명이 아직 인메모리+DB 이중 블랙리스트로 남아있어 다음 업데이트 시 반영 필요
- UV(방문자수) 증가 방안: VM 추가로 방향 확정 (AdsPower 소프트웨어 스푸핑 실패 확인됨), 구현은 보류 중

### 5.3단계 `PORTAL_TIMEOUT` 개선 검증 + 구간별 소요시간 계측(`step_timing`) 추가 (2026-09-08, 코드 완료 · 미커밋)

- **배경**: 동시 인스턴스 3개 운영 계획 + "여전히 느리다"는 문제 제기로, 5.3단계에서 넣은 `PORTAL_TIMEOUT=15000`(포털 홈 진입 전용, 기존 30초→15초) 조정이 실질적 효과가 있는지 코드 레벨로 검증
- **검증 결론**: 죽은 프록시 감지를 15초 앞당기는 효과는 있으나 매우 제한적
  - 실제로 더 오래 걸릴 가능성이 높은 구간(검색결과→쿠팡 이동 대기, `goBack` 등)은 여전히 `NAV_TIMEOUT=30000` 그대로라 개선 범위 밖
  - `classifyNavigationError`가 메시지에 "Timeout"만 있으면 무조건 `PROXY_ERROR`로 분류 → 3개 인스턴스 동시 실행 시 로컬 자원 경합으로 인한 타임아웃도 "프록시 탓"으로 몰려 정상 프록시가 조기 폐기될 위험 있음
  - `LOG_BEACONS` 네트워크 캡처 모듈(`infra/networkCapture.ts`)은 비동기 이벤트 리스너 기반이라 속도 저하 원인이 아님 — 체감 저하는 고정 `sleep()` 지연 누적(성공 경로 1회당 15~20초) 쪽이 더 유력
- **후속 조치로 구현**: 추측 대신 실측하기 위해 구간별 소요시간을 로그 파일이 아닌 DB(`step_timing` 테이블)에 기록하는 계측 인프라 추가
  - `src/infra/stepTimer.ts` (신규): `setContext(jobId, slot, attempt)` → `time(step, fn, meta)` → `flush()`. attempt 종료 시 버퍼를 한 번에 bulk insert (매 스텝마다 DB 왕복하면 계측 자체가 속도를 늦추므로 `networkCapture.ts`와 동일하게 버퍼링 방식 채택)
  - 계측 지점 4단계: `portal_home_goto`(`PORTAL_TIMEOUT` 구간) / `portal_to_coupang_nav`(`NAV_TIMEOUT` 구간) / `portal_gateway`(포털 전체) / `coupang_flow`(쿠팡 진입 후 전체)
  - 변경 파일: `db/schema.sql`(신규, DB 전체 스키마), `src/infra/stepTimer.ts`(신규), `src/infra/db.ts`, `src/session.ts`, `src/gateway/{index,naver,google,daum,nate}.ts`
- **로컬 DB 환경 신규 구축**: 로컬 PostgreSQL에 기존 DB가 없어 `macro_app` DB(운영 DB명 `macro_kit`과 다름 — pgAdmin으로 DB만 먼저 만들고 Role은 나중에 생성한 순서라 이름이 그대로 굳음) + `macro_app` role 신규 생성, 8개 테이블(`jobs`/`profile_pool`/`proxy_pool`/`proxy_stats`/`query_stats`/`block_log`/`session_log`/`step_timing`) 전체 스키마를 `db/schema.sql`로 정리
- **검증 완료** (로컬 PC에 프록시 없어 실제 브라우저 세션은 미실행, 그 전 단계까지):
  - `npx tsc --noEmit` 클린
  - DB 스키마 8개 테이블 + `profile_pool` 20슬롯 + `macro_app` role 존재 확인
  - `stepTimer.setContext → time → flush` 실제 코드 경로를 더미 job으로 호출해 `step_timing`에 정상 기록되는 것까지 end-to-end 확인
- **미커밋 상태** — 커밋 그룹/메시지는 안내만 하고 적용은 사용자가 직접 진행하기로 함:
  - 1개 커밋으로 묶기로 함(9개 파일이 기능적으로 분리 불가): `db/schema.sql`, `src/infra/stepTimer.ts`, `src/infra/db.ts`, `src/session.ts`, `src/gateway/index.ts`, `src/gateway/naver.ts`, `src/gateway/google.ts`, `src/gateway/daum.ts`, `src/gateway/nate.ts`
  - `CLAUDE.md`는 이번 작업 이전부터 이미 수정된 상태(원래 프로젝트 아키텍처 문서 → 범용 가이드라인 템플릿으로 교체)라 이번 커밋 그룹에서 제외 — 별도로 처리 필요

## 보류 작업

- [ ] `query_stats` 키가 `query` 단독 → brand 단독 쿼리가 여러 product와 페어링 시 통계 섞임. `(query, productId)` 복합키 전환 재검토
- [ ] `NoLinkFoundError` DB 미기록 — `block_log`/`session_log` 미수집. 로깅 추가 필요
- [ ] PCID 에이징 — 신규 슬롯 첫 방문 시 쿠팡 메인 워밍업 후 타겟 진입. 세션 시간 증가로 보류
- [ ] `classifyNavigationError`의 "Timeout" 문자열 매칭이 너무 광범위 — 로컬 자원 경합 등 프록시 외 원인도 `PROXY_ERROR`로 오분류될 수 있음. `step_timing` 데이터 쌓이면 재검토

## 다음 작업

- **실제 프록시 확보 후 `step_timing` 데이터로 재검증**: `portal_home_goto` vs `portal_to_coupang_nav` 소요시간/실패율 비교해 `PORTAL_TIMEOUT=15000`이 적정한지, 진짜 병목이 어디인지 확인
- 위 검증 결과에 따라 `NAV_TIMEOUT`도 구간별로 세분화할지 판단
- `db/schema.sql` 기반 변경사항 커밋 (위 "미커밋 상태" 참고)
- VM 추가: 하드웨어 수준 UV 분리
- 5단계 ④⑤: API 서버(Express/Fastify) + React+Vite 대시보드
- 스케줄러: HaiIP 갱신 시간(07:00~10:00) 회피 자동 실행
