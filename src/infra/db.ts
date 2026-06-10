import * as fs from "fs";
import * as path from "path";
import Database from "better-sqlite3";
import { ENV } from "../config/env";
import { ProxyEntry } from "./proxyManager";
import { BlockType } from "../core/errors";

fs.mkdirSync(path.dirname(ENV.DB_PATH), { recursive: true });

const db = new Database(ENV.DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`CREATE TABLE IF NOT EXISTS block_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  proxy_host  TEXT,
  proxy_port  INTEGER,
  block_type  TEXT,
  message     TEXT,
  occurred_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

db.exec(`CREATE TABLE IF NOT EXISTS proxy_stats (
  host          TEXT,
  port          INTEGER,
  success_count INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  last_success  DATETIME,
  last_failed   DATETIME,
  PRIMARY KEY (host, port)
);`);

db.exec(`CREATE TABLE IF NOT EXISTS query_stats (
  query         TEXT PRIMARY KEY,
  success_count INTEGER DEFAULT 0,
  fail_count    INTEGER DEFAULT 0,
  last_used     DATETIME
);`);

// --- export 함수들 (모두 동기 API) ---

export function logBlock(proxy: ProxyEntry | null, type: BlockType, message: string): void {
  db.prepare(
    `INSERT INTO block_log (proxy_host, proxy_port, block_type, message) VALUES (?, ?, ?, ?)`
  ).run(proxy?.host ?? null, proxy?.port ?? null, type, message);
}

export function recordProxyResult(proxy: ProxyEntry, failed: boolean): void {
  if (failed) {
    db.prepare(
      `INSERT INTO proxy_stats (host, port, fail_count, last_failed)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(host, port) DO UPDATE SET
         fail_count = fail_count + 1,
         last_failed = CURRENT_TIMESTAMP`
    ).run(proxy.host, proxy.port);
  } else {
    db.prepare(
      `INSERT INTO proxy_stats (host, port, success_count, last_success)
       VALUES (?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(host, port) DO UPDATE SET
         success_count = success_count + 1,
         last_success = CURRENT_TIMESTAMP`
    ).run(proxy.host, proxy.port);
  }
}

export function getBlacklistedProxies(failThreshold: number): Set<string> {
  const rows = db
    .prepare(`SELECT host, port FROM proxy_stats WHERE fail_count >= ?`)
    .all(failThreshold) as { host: string; port: number }[];
  return new Set(rows.map((r) => `${r.host}:${r.port}`));
}

export function recordQueryResult(query: string, success: boolean): void {
  const successInc = success ? 1 : 0;
  const failInc = success ? 0 : 1;
  db.prepare(
    `INSERT INTO query_stats (query, success_count, fail_count, last_used)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(query) DO UPDATE SET
       success_count = success_count + ?,
       fail_count = fail_count + ?,
       last_used = CURRENT_TIMESTAMP`
  ).run(query, successInc, failInc, successInc, failInc);
}

export function getQueryFailCount(query: string): number {
  const row = db
    .prepare(`SELECT fail_count FROM query_stats WHERE query = ?`)
    .get(query) as { fail_count: number } | undefined;
  return row?.fail_count ?? 0;
}

export function resetProxyStats(): void {
  db.exec(`DELETE FROM proxy_stats`);
}

