import * as fs from "fs";
import * as path from "path";
import { ENV } from "./config/env";
import { DEFAULT_TARGET } from "./config/target";
import { createPersistentContext } from "./infra/browser";
import { runPortalGateway } from "./gateway";
import { ProductNotFoundError, BlockDetectedError } from "./core/errors";
import { ProxyManager } from "./infra/proxyManager";
import { logBlock } from "./infra/db";
import { sleep } from "./utils";

function newProfileDir(): string {
  return path.join(ENV.USER_DATA_ROOT, `${Date.now()}`);
}

async function main() {
  console.log("[메인] 가동 시작...");
  console.log(`[메인] 영구 프로필 경로: ${ENV.USER_DATA_ROOT}`);

  const proxyManager = new ProxyManager();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  const usedQueries = new Set<string>();
  let success = false;
  let proxy = proxyManager.getRandom();
  let profileDir = newProfileDir();
  let httpErrorStreak = 0; // HTTP_ERROR N회 후 프록시 교체용

  try {
    for (let i = 1; i <= ENV.MAX_RETRY; i++) {
      if (!proxy) {
        console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
        break;
      }

      console.log(`[메인] 시도 ${i}/${ENV.MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}`);

      const context = await createPersistentContext(proxy, profileDir);
      const page = context.pages()[0] ?? await context.newPage();

      try {
        const result = await runPortalGateway(page, DEFAULT_TARGET, usedQueries);
        if (result) {
          console.log("[메인] 쿠팡 진입 성공!");
          proxyManager.markSuccess(proxy!);
          success = true;
          break;
        } else {
          console.warn(`[메인] 쿠팡 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`);
          proxy = proxyManager.markFailed(proxy);
        }
      } catch (error) {
        if (error instanceof ProductNotFoundError) {
          error.usedQueries.forEach(q => usedQueries.add(q));
          console.error(`[메인] 모든 검색 쿼리 소진. 종료합니다.`);
          break; // 차단 아님 → 프로필/프록시 교체 불필요
        }

        if (error instanceof BlockDetectedError) {
          console.error(`[메인] 차단 감지 (${error.type}): ${error.message}`);
          logBlock(proxy, error.type, error.message);

          switch (error.type) {
            case "SELECTOR_BUG":
              // 코드 버그 → 즉시 중단
              console.error(`[메인] SELECTOR_BUG — 코드 수정이 필요합니다. 즉시 종료합니다.`);
              return;

            case "AKAMAI_BLOCK":
            case "COUPANG_APP_BLOCK":
            case "AKAMAI_CHALLENGE":
              proxy = proxyManager.markFailed(proxy!);
              fs.rmSync(profileDir, { recursive: true, force: true });
              profileDir = newProfileDir();
              if (error.type === "AKAMAI_CHALLENGE") {
                await sleep(ENV.CHALLENGE_RETRY_DELAY);
              }
              continue;

            case "PROXY_ERROR":
              proxy = proxyManager.markFailed(proxy!);
              continue; // 프로필 유지

            case "HTTP_ERROR":
              httpErrorStreak++;
              if (httpErrorStreak >= ENV.HTTP_ERROR_THRESHOLD) {
                proxy = proxyManager.markFailed(proxy!);
                httpErrorStreak = 0;
              }
              continue; // 프로필 유지
          }
        }

        console.error(`[메인] 시도 ${i} 중 에러 발생:`, error);
        proxy = proxyManager.markFailed(proxy!);
      } finally {
        await context.close();
      }
    }

    if (!success) {
      console.error(`[메인] ${ENV.MAX_RETRY}회 시도 모두 실패. 종료합니다.`);
    }
  } finally {
    proxyManager.destroy();
    console.log("[메인] 종료.");
  }
}

main();
