import { ENV } from "./config/env";
import { DEFAULT_TARGET } from "./config/target";
import { createPersistentContext } from "./infra/browser";
import { runPortalGateway } from "./gateway";
import { ProductNotFoundError } from "./core/errors";
import { ProxyManager } from "./infra/proxyManager";

async function main() {
  console.log("[메인] 가동 시작...");
  console.log(`[메인] 영구 프로필 경로: ${ENV.USER_DATA_DIR}`);

  const proxyManager = new ProxyManager();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  const usedQueries = new Set<string>();
  let success = false;
  let proxy = proxyManager.getRandom();

  try {
    for (let i = 1; i <= ENV.MAX_RETRY; i++) {
      if (!proxy) {
        console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
        break;
      }

      console.log(`[메인] 시도 ${i}/${ENV.MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}`);

      const context = await createPersistentContext(proxy);
      const page = context.pages()[0] ?? await context.newPage();

      try {
        const result = await runPortalGateway(page, DEFAULT_TARGET, usedQueries);
        if (result) {
          console.log("[메인] 쿠팡 진입 성공!");
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
          break;
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
