import { Page } from "playwright";

export async function clickScanButton(page: Page, waitTimeMs: number = 8000): Promise<void> {
  console.log("[Checker] 픽셀스캔 페이지 내부 조작을 시작합니다.");

  try {
    // 버튼이 완전히 렌더링될 때까지 잠깐의 인간형 대기
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 'Scan My Browser Now' 버튼 타겟팅
    const scanButton = page.getByRole("button", { name: "Scan My Browser Now" });

    // 버튼이 화면에 보일 때까지 대기 후 클릭
    await scanButton.waitFor({ state: "visible", timeout: 5000 });
    console.log('[Checker] "Scan My Browser Now" 버튼을 발견하여 클릭합니다.');
    await scanButton.click();

    // 스캔 결과 애니메이션이 돌아가고 최종 지문 창이 뜰 때까지 대기
    console.log(`[Checker] 지문 분석 결과를 대기 중입니다... (${waitTimeMs / 1000}초)`);
    await page.waitForTimeout(waitTimeMs);
  } catch (error) {
    console.error("[Checker] 픽셀스캔 버튼 클릭 중 실패:", error);
    throw error;
  }
}
