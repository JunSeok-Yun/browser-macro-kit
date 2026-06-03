// src/index.ts
import { chromium } from "playwright-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
// import { runPortalGateway } from "./behavior";
import { testPortalGateway } from "./test";
import { clickScanButton } from "./testChecker";

// 우회 플러그인 장착
chromium.use(stealthPlugin());

async function localTest() {
  console.log("[VS Code] Playwright 로컬 검증 가동 시작...");

  const browser = await chromium.launch({
    headless: false, // 로컬 화면에 크롬 창 직접 노출
    args: ["--disable-webrtc", "--start-maximized", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    viewport: null, // 창 최대화 레이아웃 동기화
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });

  const page = await context.newPage();

  try {
    // [페이즈 1]: 포털(네이버/구글)을 랜덤 경유하여 픽셀스캔 사이트 진입
    const targetPage = await testPortalGateway(page);

    if (targetPage) {
      console.log("[메인] 게이트웨이 통과 확인. 픽셀스캔 내부 스캔 버튼 클릭 작업을 시작합니다.");

      // [페이즈 2]: 분리된 모듈을 호출하여 픽셀스캔 검증 버튼 클릭
      await clickScanButton(targetPage, 10000); // 스캔 후 지문 화면 모니터링을 위해 10초 대기하도록 설정

      console.log("[메인] 모든 시퀀스가 성공적으로 수행되었습니다.");
    } else {
      console.log("[메인] 포털 경유 진입 실패 또는 타겟 도메인 이탈로 인해 다음 페이즈를 스킵합니다.");
    }
  } catch (error) {
    console.error("[메인] 가동 중 런타임 에러 발생:", error);
  } finally {
    // 에러 여부와 상관없이 무조건 안전하게 크롬 프로세스 해제 및 종료
    console.log("[VS Code] 자원을 반환하고 브라우저를 종료합니다.");
    await browser.close();
    console.log("[VS Code] 테스트 종료.");
  }
}

localTest();
