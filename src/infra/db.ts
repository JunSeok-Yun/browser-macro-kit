import { Pool, Client } from "pg";
import { ProxyEntry } from "./proxyManager";
import { BlockType } from "../core/errors";
import { Job } from "../core/types";

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
  exactName: string | null;
  success: boolean;
  blockType: BlockType | null;
  proxy: ProxyEntry | null;
  profileDir: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO session_log (job_id, product_id, category, exact_name, success, block_type, proxy_host, proxy_port, profile_dir)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.jobId,
      params.productId,
      params.category,
      params.exactName,
      params.success,
      params.blockType,
      params.proxy?.host ?? null,
      params.proxy?.port ?? null,
      params.profileDir,
    ]
  );
}

export async function getRunningJob(): Promise<Job | null> {
  const { rows } = await pool.query<{
    id: number;
    category: string;
    target_count: number;
    completed_count: number;
    status: string;
  }>(
    `SELECT id, category, target_count, completed_count, status FROM jobs WHERE status = 'running' ORDER BY id LIMIT 1`
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    category: r.category,
    targetCount: r.target_count,
    completedCount: r.completed_count,
    status: r.status as "running" | "done",
  };
}

export async function incrementJobProgress(jobId: number): Promise<{ completedCount: number; targetCount: number }> {
  const { rows } = await pool.query<{ completed_count: number; target_count: number }>(
    `UPDATE jobs SET completed_count = completed_count + 1 WHERE id = $1 RETURNING completed_count, target_count`,
    [jobId]
  );
  return { completedCount: rows[0].completed_count, targetCount: rows[0].target_count };
}

export async function incrementJobFailedCount(jobId: number): Promise<void> {
  await pool.query(
    `UPDATE jobs SET failed_session_count = failed_session_count + 1 WHERE id = $1`,
    [jobId]
  );
}

export async function completeJob(jobId: number): Promise<void> {
  await pool.query(`UPDATE jobs SET status = 'done', finished_at = now() WHERE id = $1 AND status = 'running'`, [jobId]);
}

/** job_created NOTIFY를 영구 수신하는 전용 커넥션. 풀 커넥션과 별개로 유지해야 함. */
export async function listenForJobCreated(onNotify: () => void): Promise<Client> {
  const client = new Client();
  await client.connect();
  await client.query("LISTEN job_created");
  client.on("notification", (msg) => {
    if (msg.channel === "job_created") onNotify();
  });
  return client;
}

/** 사용 가능한 슬롯을 원자적으로 점유. 없으면 null. */
export async function acquireProfileSlot(staleMs: number): Promise<number | null> {
  const { rows } = await pool.query<{ slot: number }>(
    `UPDATE profile_pool
        SET in_use = true, locked_at = now()
        WHERE slot = (
          SELECT slot FROM profile_pool
          WHERE in_use = false OR locked_at < now() - ($1::text || ' milliseconds')::interval
          ORDER BY last_used ASC NULLS FIRST
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING slot`,
    [staleMs]
  );
  return rows[0]?.slot ?? null;
}

/** 슬롯 반납. last_used를 갱신해 라운드로빈 순서를 유지. */
export async function releaseProfileSlot(slot: number): Promise<void> {
  await pool.query(
    `UPDATE profile_pool SET in_use = false, last_used = now() WHERE slot = $1`,
    [slot]
  );
}