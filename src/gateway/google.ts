import { assertPortalNotBlocked } from "../core/blockDetection"
import { safeGoto, withNavigationErrorHandling } from "../core/blockDetection";
import { Page } from "patchright";
import { ENV } from "../config/env";
import { typeLikeHuman } from "../automation/keyboard";
import { sleep } from "../utils";

export async function runGoogleGateway(page: Page): Promise<Page> {
  console.log("[Gateway] 구글을 통해 쿠팡 진입을 시도합니다.");

  await safeGoto(page, "https://www.google.com");
  await page.waitForTimeout(
    Math.floor(Math.random() * ENV.GOOGLE_ENTRY_DELAY_RANGE) + ENV.GOOGLE_ENTRY_DELAY_MIN
  );

  await typeLikeHuman(page, 'textarea[name="q"]', "쿠팡");
  await page.keyboard.press("Enter");

  await page.waitForLoadState("domcontentloaded");
  await sleep(ENV.GOOGLE_SEARCH_DELAY);
  await assertPortalNotBlocked(page, "google");

  console.log("[Gateway] 구글 검색 결과에서 실제 이동 가능한 쿠팡 링크 요소를 탐색합니다.");

  const googleResultLink = page
    .locator(
      [
        'a:has-text("쿠팡"):not([href*="link.coupang.com"])',
        'a:has-text("coupang.com"):not([href*="link.coupang.com"])',
        'a:has(h3:has-text("쿠팡")):not([href*="link.coupang.com"])',
      ].join(", "),
    )
    .first();

  const elementCount = await googleResultLink.count();
  console.log(`[Gateway] 구글 내 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("구글 검색 결과에서 쿠팡으로 이동할 수 있는 링크를 찾지 못했습니다.");
  }

  console.log("[Gateway] 링크 클릭 후 쿠팡 로딩을 대기합니다...");

  await withNavigationErrorHandling(() =>
    Promise.all([
      page.waitForURL((url) => !url.hostname.includes("google.com"), { timeout: ENV.NAV_TIMEOUT }),
      googleResultLink.click(),
    ])
  );

  await page.waitForLoadState("load");
  await sleep(ENV.COUPANG_ENTRY_DELAY);

  return page;
}
