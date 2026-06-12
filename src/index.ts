import * as fs from "fs";
import * as path from "path";
import { ENV } from "./config/env";
import { DEFAULT_TARGET } from "./config/target";
import { createPersistentContext } from "./infra/browser";
import { runPortalGateway } from "./gateway";
import { ProductNotFoundError, BlockDetectedError } from "./core/errors";
import { BLOCK_RECOVERY, RecoveryPolicy } from "./core/recovery";
import { ProxyManager, ProxyEntry } from "./infra/proxyManager";
import { logBlock } from "./infra/db";
import { sleep } from "./utils";

function newProfileDir(): string {
  return path.join(ENV.USER_DATA_ROOT, `${Date.now()}`);
}

async function applyRecoveryPolicy(
  policy: RecoveryPolicy,
  proxy: ProxyEntry,
  profileDir: string,
  proxyManager: ProxyManager
): Promise<{ proxy: ProxyEntry | null; profileDir: string }> {
  if (policy.rotateProxy) {
    proxy = proxyManager.markFailed(proxy)!;
  }
    if (policy.rotateProfile) {
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 });
    } catch (err) {
      console.warn(`[메인] 프로필 폴더 삭제 실패 (${profileDir}):`, err);
    }
    profileDir = newProfileDir();
  }
  if (policy.extraDelayMs) {
    await sleep(policy.extraDelayMs);
  }
  return { proxy, profileDir };
}


async function main() {
  console.log("[메인] 가동 시작...");
  console.log(`[메인] 영구 프로필 경로: ${ENV.USER_DATA_ROOT}`);

  const proxyManager = new ProxyManager();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  try {
    for (let session = 1; session <= ENV.SESSION_COUNT; session++) {
      console.log(`[메인] ===== 세션 ${session}/${ENV.SESSION_COUNT} 시작 =====`);

      await runSession(proxyManager);
    }
  } finally {
    proxyManager.destroy();
    console.log("[메인] 종료.");
  }
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});


/** 세션 1회 = 상품 탐색 1번. MAX_RETRY번까지 프록시/프로필을 바꿔가며 재시도. */
async function runSession(proxyManager: ProxyManager): Promise<void> {
  const usedQueries = new Set<string>();
  let success = false;
  let proxy = proxyManager.getRandom();
  let profileDir = newProfileDir();
  let httpErrorStreak = 0; // HTTP_ERROR N회 후 프록시 교체용

  for (let i = 1; i <= ENV.MAX_RETRY; i++) {
    if (!proxy) {
      console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
      break;
    }

    console.log(`[메인] 시도 ${i}/${ENV.MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}`);

    const context = await createPersistentContext(proxy, profileDir);
    const page = context.pages()[0] ?? await context.newPage();

    let pendingPolicy: RecoveryPolicy | null = null;
    let exhausted = false;

    try {
      const result = await runPortalGateway(page, DEFAULT_TARGET, usedQueries);
      if (result) {
        console.log("[메인] 쿠팡 진입 성공!");
        proxyManager.markSuccess(proxy!);
        success = true;
      } else {
        console.warn(`[메인] 쿠팡 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`);
        proxy = proxyManager.markFailed(proxy);
      }
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        error.usedQueries.forEach(q => usedQueries.add(q));
        console.error(`[메인] 모든 검색 쿼리 소진. 종료합니다.`);
        exhausted = true; // 차단 아님 → 프로필/프록시 교체 불필요
      } else if (error instanceof BlockDetectedError) {
        console.error(`[메인] 차단 감지 (${error.type}): ${error.message}`);
        logBlock(proxy, error.type, error.message, error.htmlPath, profileDir);

        // HTTP_ERROR는 연속 횟수 기반 정책이라 정책 테이블보다 먼저 처리
        if (error.type === "HTTP_ERROR") {
          httpErrorStreak++;
          if (httpErrorStreak >= ENV.HTTP_ERROR_THRESHOLD) {
            proxy = proxyManager.markFailed(proxy!);
            httpErrorStreak = 0;
          }
          // 프로필 유지, 정책 적용 없음
        } else {
          pendingPolicy = BLOCK_RECOVERY[error.type];
        }
      } else {
        console.error(`[메인] 시도 ${i} 중 에러 발생:`, error);
        proxy = proxyManager.markFailed(proxy!);
      }
    } finally {
      await context.close();
    }
    if (success || exhausted) {
      break;
    }
    if (pendingPolicy) {
      ({ proxy, profileDir } = await applyRecoveryPolicy(pendingPolicy, proxy!, profileDir, proxyManager));
    }
  }

  if (!success) {
    console.error(`[메인] ${ENV.MAX_RETRY}회 시도 모두 실패. 세션을 종료합니다.`);
  }
}
