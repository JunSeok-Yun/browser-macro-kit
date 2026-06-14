import { Pool } from "pg";
import { ProxyEntry } from "./proxyManager";
import { BlockType } from "../core/errors";

// PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD 환경변수를 자동으로 읽음
const pool = new Pool();

// --- export 함수들 (모두 비동기 API로 전환) ---

export async function logBlock(proxy: ProxyEntry | null, type: BlockType, message: string, htmlPath: string | null = null, profileDir: string | null = null): Promise<void> {
  await pool.query(
    `INSERT INTO block_log (proxy_host, proxy_port, block_type, message, html_path, profile_dir) VALUES ($1, $2, $3, $4, $5, $6)`,
    [proxy?.host ?? null, proxy?.port ?? null, type, message, htmlPath, profileDir]
  );
}

export async function recordProxyResult(proxy: ProxyEntry, failed: boolean): Promise<void> {
  if (failed) {
    await pool.query(
      `INSERT INTO proxy_stats (host, port, fail_count, last_failed)
        VALUES ($1, $2, 1, now())
        ON CONFLICT (host, port) DO UPDATE SET
          fail_count = proxy_stats.fail_count + 1,
          last_failed = now()`,
      [proxy.host, proxy.port]
    );
  } else {
    await pool.query(
      `INSERT INTO proxy_stats (host, port, success_count, last_success)
        VALUES ($1, $2, 1, now())
        ON CONFLICT (host, port) DO UPDATE SET
          success_count = proxy_stats.success_count + 1,
          last_success = now()`,
      [proxy.host, proxy.port]
    );
  }
}

export async function getBlacklistedProxies(failThreshold: number): Promise<Set<string>> {
  const { rows } = await pool.query<{ host: string; port: number }>(
    `SELECT host, port FROM proxy_stats WHERE fail_count >= $1`,
    [failThreshold]
  );
  return new Set(rows.map((r) => `${r.host}:${r.port}`));
}

export async function recordQueryResult(query: string, success: boolean): Promise<void> {
  const successInc = success ? 1 : 0;
  const failInc = success ? 0 : 1;
  await pool.query(
    `INSERT INTO query_stats (query, success_count, fail_count, last_used)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (query) DO UPDATE SET
        success_count = query_stats.success_count + $2,
        fail_count = query_stats.fail_count + $3,
        last_used = now()`,
    [query, successInc, failInc]
  );
}

export async function getQueryFailCount(query: string): Promise<number> {
  const { rows } = await pool.query<{ fail_count: number }>(
    `SELECT fail_count FROM query_stats WHERE query = $1`,
    [query]
  );
  return rows[0]?.fail_count ?? 0;
}

export async function resetProxyStats(): Promise<void> {
  await pool.query(`DELETE FROM proxy_stats`);
}

// --- 신규: session_log (성공/실패 모두 기록, 상품별 통계용) ---

export async function logSession(params: {
  jobId: number | null;
  productId: string;
  category: string;
  success: boolean;
  blockType: BlockType | null;
  proxy: ProxyEntry | null;
  profileDir: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO session_log (job_id, product_id, category, success, block_type, proxy_host, proxy_port, profile_dir)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.jobId,
      params.productId,
      params.category,
      params.success,
      params.blockType,
      params.proxy?.host ?? null,
      params.proxy?.port ?? null,
      params.profileDir,
    ]
  );
}
