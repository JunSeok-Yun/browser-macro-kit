import { ENV } from "./config/env";
import { createPersistentContext} from "./infra/browser";
import { checkCreepJSTrust } from "./test/creepjs";
import { testPortalGateway } from "./test/pixelscan";
import { clickScanButton } from "./test/checker";
import { ProxyManager } from "./infra/proxyManager";

// 실행 시 인자로 테스트 대상 선택: creepjs(기본값) | pixelscan
const TARGET = process.argv[2] ?? "creepjs";

async function main() {
  console.log(`[진단] ${TARGET} 검증 시작...`);
  console.log(`[진단] 영구 프로필 경로: ${ENV.USER_DATA_ROOT}`);

  const proxyManager = new ProxyManager();
  const proxy = proxyManager.getRandom();

  if (!proxy) {
    console.error("[진단] 사용 가능한 프록시가 없습니다.");
    proxyManager.destroy();
    return;
  }

  console.log(`[진단] 프록시: ${proxy.host}:${proxy.port}`);

  const context = await createPersistentContext(proxy, ENV.USER_DATA_ROOT);
  const page = context.pages()[0] ?? (await context.newPage());

  try {
    if (TARGET === "pixelscan") {
      const targetPage = await testPortalGateway(page);
      if (targetPage) {
        console.log("[진단] pixelscan 진입 성공. 스캔 버튼을 클릭합니다.");
        await clickScanButton(targetPage, 100000);
      } else {
        console.error("[진단] pixelscan 진입 실패.");
      }
    } else {
      await checkCreepJSTrust(page);
    }
  } catch (error) {
    console.error("[진단] 검증 중 에러 발생:", error);
  } finally {
    await context.close();
    proxyManager.destroy();
    console.log("[진단] 종료.");
  }
}

main();
