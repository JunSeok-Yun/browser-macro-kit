// src/index.ts
import { chromium } from "patchright";
import { runPortalGateway } from "./behavior";
import { testPortalGateway } from "./test";
import { clickScanButton } from "./testChecker";
import { ProxyManager } from "./proxyManager";

// TODO: .env 파일에서 프록시 파일 경로와 최대 재시도 횟수 설정 가능하도록 개선
const MAX_RETRY = 5; // 최대 재시도 횟수

// TODO: test 모듈과 실제 로직 모듈 분리하여 유지보수성 향상
async function localTest() {
  console.log("[VS Code] Playwright 로컬 검증 가동 시작...");

  const proxyManager = new ProxyManager();
  console.log(`[메인] 사용 가능한 프록시: ${proxyManager.count}개`);

  const browser = await chromium.launch({
    headless: false,
    channel: "chrome",
    args: [
      "--start-maximized",
      "--disable-blink-features=AutomationControlled",
      "--remote-debugging-port=0",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
  });

  let success = false;
  let proxy = proxyManager.getRandom();

  try {
    for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
      if (!proxy) {
        console.error("[메인] 사용 가능한 프록시가 없습니다. 종료합니다.");
        break;
      }

      console.log(`[메인] 시도 ${attempt}/${MAX_RETRY} — 프록시: ${proxy.host}:${proxy.port}`);

      const context = await browser.newContext({
        proxy: proxyManager.toPlaywright(proxy),
        viewport: null,
        locale: "ko-KR",
        timezoneId: "Asia/Seoul",
      });
      await context.addInitScript(() => {
        Object.defineProperty(window, "outerWidth", { get: () => window.innerWidth });
        Object.defineProperty(window, "outerHeight", { get: () => window.innerHeight });
        const OrigRTC = window.RTCPeerConnection;
        if (OrigRTC) {
          (window as any).RTCPeerConnection = function (cfg: any) {
            return new OrigRTC(cfg ? { ...cfg, iceServers: [] } : undefined);
          };
          (window as any).RTCPeerConnection.prototype = OrigRTC.prototype;
          Object.assign((window as any).RTCPeerConnection, OrigRTC);
        }
      });
      const page = await context.newPage();

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
        // [페이즈 1]: 포털 경유 pixelscan 진입
        // const targetPage = await testPortalGateway(page);
        // if (targetPage) {
        //   console.log("[메인] 게이트웨이 통과 확인. 스캔 버튼 클릭 작업을 시작합니다.");

        //   // [페이즈 2]: pixelscan 검증 버튼 클릭
        //   await clickScanButton(targetPage, 100000);

        //   console.log("[메인] 모든 시퀀스가 성공적으로 수행되었습니다.");
        //   success = true;
        //   break; // 성공 시 루프 탈출
        // } else {
        //   console.warn(`[메인] 게이트웨이 진입 실패. 프록시 ${proxy.host}:${proxy.port} 교체합니다.`);
        //   proxy = proxyManager.markFailed(proxy);
        // }
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
    console.log("[VS Code] 자원을 반환하고 브라우저를 종료합니다.");
    await browser.close();
    proxyManager.destroy();
    console.log("[VS Code] 테스트 종료.");
  }
}

localTest();
