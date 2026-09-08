import { logStepTimings, StepTimingRow } from "./db";
import * as logger from "./logger";

let buffer: StepTimingRow[] = [];
let ctx: { jobId: number | null; slot: number | null; attempt: number | null } = {
  jobId: null,
  slot: null,
  attempt: null,
};

/** 세션의 매 시도(attempt) 시작 시 호출 — 이후 time() 호출들이 이 컨텍스트로 기록됨 */
export function setContext(jobId: number, slot: number, attempt: number): void {
  ctx = { jobId, slot, attempt };
}

interface TimeMeta {
  portal?: string | null;
  proxy?: { host: string; port: number } | null;
}

/** fn 실행 시간을 측정해 버퍼에 쌓고, 성공/실패와 무관하게 fn의 결과/예외를 그대로 전달 */
export async function time<T>(step: string, fn: () => Promise<T>, meta?: TimeMeta): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    buffer.push(makeRow(step, Date.now() - start, true, meta));
    return result;
  } catch (err) {
    buffer.push(makeRow(step, Date.now() - start, false, meta));
    throw err;
  }
}

function makeRow(step: string, durationMs: number, success: boolean, meta?: TimeMeta): StepTimingRow {
  return {
    jobId: ctx.jobId,
    slot: ctx.slot,
    attempt: ctx.attempt,
    step,
    portal: meta?.portal ?? null,
    proxyHost: meta?.proxy?.host ?? null,
    proxyPort: meta?.proxy?.port ?? null,
    durationMs,
    success,
  };
}

/** 버퍼를 DB에 bulk insert. 실패해도 세션 흐름에 영향 주지 않음 */
export async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const rows = buffer;
  buffer = [];
  try {
    await logStepTimings(rows);
  } catch (err) {
    logger.warn(`[StepTimer] DB 기록 실패: ${String(err)}`, { event: "STEP_TIMING_FLUSH_FAIL" });
  }
}
