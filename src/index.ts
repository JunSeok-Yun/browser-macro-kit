// src/index.ts
import "dotenv/config";
import {createPersistentContext, USER_DATA_DIR} from "./browser";
import { runPortalGateway } from "./behavior";
import { ProxyManager } from "./proxyManager";


const MAX_RETRY = parseInt(process.env.MAX_RETRY ?? "5", 10);

async function main() {
  console.log("[메인] 가동 시작...");
  console.log(`[메인] 영구 프로필 경로: ${USER_DATA_DIR}`);

  const proxyManager = new ProxyManager();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  let success = false;
  let proxy = proxyManager.getRandom();

  try {
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      if (!proxy) {
        console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
        break;
      }

      console.log(`[메인] 시도 ${attempt}/${MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}`);

      const context = await createPersistentContext(proxy);
      const page = context.pages()[0] ?? await context.newPage();

      try {
        const result = await runPortalGateway(page);
        if (result) {
          console.log("[메인] 쿠팡 진입 성공!");
          success = true;
          break;
        } else {
          console.warn(`[메인] 쿠팡 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`);
          proxy = proxyManager.markFailed(proxy);
        }
      } catch (error) {
        console.error(`[메인] 시도 ${attempt} 중 에러 발생:`, error);
        proxy = proxyManager.markFailed(proxy!);
      } finally {
        await context.close(); // 재시도 시 컨텍스트 반드시 해제
      }
    }

    if (!success) {
      console.error(`[메인] ${MAX_RETRY}회 시도 모두 실패. 종료합니다.`);
    }
  } finally {
    proxyManager.destroy();
    console.log("[메인] 종료.");
  }
}

main();
