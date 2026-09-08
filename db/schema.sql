-- macro_app DB 초기 스키마
--
-- 전제: pgAdmin으로 "macro_app" 데이터베이스는 이미 생성됨 (Login/Group Roles에는
-- macro_app이 아직 없는 상태 — 2026-09 확인).
--
-- 실행 순서 (pgAdmin Query Tool 기준):
--   1) 아무 DB에나 연결된 상태(Role은 클러스터 공용)에서 "1. 롤 생성" 블록만 먼저 실행
--      → MACRO_APP_PASSWORD를 실제 비밀번호로 바꿀 것
--   2) 왼쪽 트리에서 "macro_app" 데이터베이스를 선택 → 새 Query Tool 열기
--      (반드시 macro_app에 연결된 상태여야 아래 CREATE TABLE들이 그 DB 안에 생성됨)
--   3) 이 파일의 "1. 롤 생성" 아래 나머지 전체를 macro_app에 연결된 Query Tool에서 실행
--   4) .env에 PGDATABASE=macro_app, PGUSER=macro_app, PGPASSWORD=<1번 비밀번호> 설정

-- ── 1. 롤 생성 (재실행 안전 — 이미 있으면 건너뜀) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'macro_app') THEN
    CREATE ROLE macro_app WITH LOGIN PASSWORD 'MACRO_APP_PASSWORD';
  END IF;
END
$$;

-- 타임존 KST 고정 (macro_app DB가 이미 있으므로 ALTER DATABASE로 적용)
ALTER DATABASE macro_app SET timezone TO 'Asia/Seoul';

-- ─────────────────────────────────────────────────────────────────────────
-- 아래부터는 "macro_app" DB에 접속한 상태에서 실행 (pgAdmin: 트리에서 macro_app
-- 선택 후 Query Tool 새로 열기 — postgres/다른 DB에 연결된 채로 실행하면 안 됨)
-- ─────────────────────────────────────────────────────────────────────────

-- ── jobs: 작업 큐 (index.ts의 getRunningJob/incrementJobProgress 등) ────────
CREATE TABLE IF NOT EXISTS jobs (
  id                   SERIAL PRIMARY KEY,
  category             TEXT NOT NULL,
  target_count         INTEGER NOT NULL,
  completed_count      INTEGER NOT NULL DEFAULT 0,
  failed_session_count INTEGER NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT 'running',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ
);

-- 동시에 status='running'인 job이 2개 이상 존재하지 못하게 강제
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_running
  ON jobs ((status)) WHERE status = 'running';

-- job 생성 시 수동으로 다음처럼 알림 발행 (ARCHITECTURE.md 참고):
--   INSERT INTO jobs (category, target_count, status) VALUES ('보쌈', 100, 'running');
--   NOTIFY job_created;

-- ── profile_pool: 고정 프로필 슬롯 0~19 (infra/browser.ts profileDirForSlot) ─
CREATE TABLE IF NOT EXISTS profile_pool (
  slot          INTEGER PRIMARY KEY,
  in_use        BOOLEAN NOT NULL DEFAULT false,
  locked_at     TIMESTAMPTZ,
  last_used     TIMESTAMPTZ,
  session_count INTEGER NOT NULL DEFAULT 0
);

INSERT INTO profile_pool (slot, in_use, locked_at, last_used, session_count)
SELECT s, false, NULL, NULL, 0
FROM generate_series(0, 19) AS s
ON CONFLICT (slot) DO NOTHING;

-- ── proxy_pool: HaiIP proxies.txt 동기화 대상 (proxyManager.ts가 런타임에 채움) ─
CREATE TABLE IF NOT EXISTS proxy_pool (
  host      TEXT NOT NULL,
  port      INTEGER NOT NULL,
  in_use    BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  last_used TIMESTAMPTZ,
  PRIMARY KEY (host, port)
);

-- ── proxy_stats: 프록시별 성공/실패 누적 (실패 임계치 초과 시 blacklist 취급) ──
CREATE TABLE IF NOT EXISTS proxy_stats (
  host          TEXT NOT NULL,
  port          INTEGER NOT NULL,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_failed   TIMESTAMPTZ,
  last_success  TIMESTAMPTZ,
  PRIMARY KEY (host, port)
);

-- ── query_stats: 검색 쿼리별 성공/실패 누적 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS query_stats (
  query         TEXT PRIMARY KEY,
  success_count INTEGER NOT NULL DEFAULT 0,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  last_used     TIMESTAMPTZ
);

-- ── block_log: 차단 감지 이벤트 기록 ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS block_log (
  id          BIGSERIAL PRIMARY KEY,
  proxy_host  TEXT,
  proxy_port  INTEGER,
  block_type  TEXT NOT NULL,
  message     TEXT,
  html_path   TEXT,
  profile_dir TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_block_log_type_created ON block_log (block_type, created_at);

-- ── session_log: 세션(상품 검색) 성공/실패 결과 ─────────────────────────────
CREATE TABLE IF NOT EXISTS session_log (
  id          BIGSERIAL PRIMARY KEY,
  job_id      INTEGER REFERENCES jobs(id),
  product_id  TEXT NOT NULL,
  category    TEXT NOT NULL,
  exact_name  TEXT,
  success     BOOLEAN NOT NULL,
  block_type  TEXT,
  proxy_host  TEXT,
  proxy_port  INTEGER,
  profile_dir TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_log_job ON session_log (job_id);

-- ── step_timing: 구간별 소요시간 계측 (타임아웃 튜닝 검증용) ─────────────────
CREATE TABLE IF NOT EXISTS step_timing (
  id          BIGSERIAL PRIMARY KEY,
  job_id      INTEGER REFERENCES jobs(id),
  slot        INTEGER,
  attempt     INTEGER,
  step        TEXT NOT NULL,
  portal      TEXT,
  proxy_host  TEXT,
  proxy_port  INTEGER,
  duration_ms INTEGER NOT NULL,
  success     BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_step_timing_step_created ON step_timing (step, created_at);

-- ── 권한 부여 (postgres 등 superuser로 생성한 경우 macro_app에 위임) ─────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  jobs, profile_pool, proxy_pool, proxy_stats, query_stats,
  block_log, session_log, step_timing
TO macro_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO macro_app;
