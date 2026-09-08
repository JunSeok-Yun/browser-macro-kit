# MEMORY.md

프로젝트 진행상황 스냅샷. 전체 이력이 아닌 "현재 상태 + 다음 작업" 위주로 유지한다.
아키텍처/기술 레퍼런스는 [ARCHITECTURE.md](ARCHITECTURE.md), 코딩 규칙은 [CLAUDE.md](CLAUDE.md) 참고.

## 현재 상태 (2026-09-08 기준)

- 0~5.3단계 완료: 자동화 코어, 포털 4종(네이버/구글/다음/네이트) 연동, 차단 감지/복구, PostgreSQL 전환, 타임아웃/네트워크 캡처 개선, Job 51 로그 기반 버그 수정
- 5단계 ④(API 서버) ⑤(웹 대시보드)는 계획 단계, 미착수
- 최근 커밋: 프록시 관리를 인메모리 → DB(`proxy_pool`) 기반으로 전환 (56128de) — ARCHITECTURE.md의 `proxyManager.ts` 설명이 아직 인메모리+DB 이중 블랙리스트로 남아있어 다음 업데이트 시 반영 필요
- UV(방문자수) 증가 방안: VM 추가로 방향 확정 (AdsPower 소프트웨어 스푸핑 실패 확인됨), 구현은 보류 중

## 보류 작업

- [ ] `query_stats` 키가 `query` 단독 → brand 단독 쿼리가 여러 product와 페어링 시 통계 섞임. `(query, productId)` 복합키 전환 재검토
- [ ] `NoLinkFoundError` DB 미기록 — `block_log`/`session_log` 미수집. 로깅 추가 필요
- [ ] PCID 에이징 — 신규 슬롯 첫 방문 시 쿠팡 메인 워밍업 후 타겟 진입. 세션 시간 증가로 보류

## 다음 작업

- VM 추가: 하드웨어 수준 UV 분리
- 5단계 ④⑤: API 서버(Express/Fastify) + React+Vite 대시보드
- 스케줄러: HaiIP 갱신 시간(07:00~10:00) 회피 자동 실행
