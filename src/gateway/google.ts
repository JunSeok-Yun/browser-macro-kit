import { assertPortalNotBlocked, safeGoto, withNavigationErrorHandling } from "../core/blockDetection";
import { Page } from "patchright";
import { ENV } from "../config/env";
import { typeLikeHuman } from "../automation/keyboard";
import { sleep } from "../utils";
import { saveDebugHtml } from "../infra/debugCapture";
import { NoLinkFoundError } from "../core/errors";
import * as logger from "../infra/logger";

const GOOGLE_COUPANG_SELECTOR = [
  'a:has-text("쿠팡"):not([href*="link.coupang.com"])',
  'a:has-text("coupang.com"):not([href*="link.coupang.com"])',
  'a:has(h3:has-text("쿠팡")):not([href*="link.coupang.com"])',
].join(", ");

/** 구글 검색 결과 페이지에서 쿠팡 링크를 찾아 클릭. 최초 진입·재시도 모두 공용 */
export async function enterCoupangFromGoogleResults(page: Page): Promise<void> {
  const googleResultLink = page.locator(GOOGLE_COUPANG_SELECTOR).first();

  const elementCount = await googleResultLink.count();
  logger.info(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    const html = await page.content();
    const htmlPath = saveDebugHtml(html, "GOOGLE_NO_LINK");
    throw new NoLinkFoundError(
      `구글 검색 결과에서 쿠팡 광고 링크를 찾지 못했습니다 (광고 미노출 추정). (HTML: ${htmlPath})`,
      htmlPath,
    );
  }

  logger.info("[Gateway] 링크 클릭 후 쿠팡 로딩을 대기합니다...");

  await withNavigationErrorHandling(() =>
    Promise.all([
      page.waitForURL((url) => !url.hostname.includes("google.com"), { timeout: ENV.NAV_TIMEOUT , waitUntil: "domcontentloaded"}),
      googleResultLink.click(),
    ])
  );

  await sleep(ENV.COUPANG_ENTRY_DELAY);
}

export async function runGoogleGateway(page: Page): Promise<Page> {
  logger.info("[Gateway] 구글을 통해 쿠팡 진입을 시도합니다.");

  await safeGoto(page, "https://www.google.com", { waitUntil: "domcontentloaded", timeout: ENV.PORTAL_TIMEOUT });
  await page.waitForTimeout(
    Math.floor(Math.random() * ENV.GOOGLE_ENTRY_DELAY_RANGE) + ENV.GOOGLE_ENTRY_DELAY_MIN
  );

  await typeLikeHuman(page, 'textarea[name="q"]', "쿠팡");
  await page.keyboard.press("Enter");

  await page.waitForLoadState("domcontentloaded");
  await sleep(ENV.GOOGLE_SEARCH_DELAY);
  await assertPortalNotBlocked(page, "google");

  logger.info("[Gateway] 구글 검색 결과에서 실제 이동 가능한 쿠팡 링크 요소를 탐색합니다.");
  await enterCoupangFromGoogleResults(page);

  return page;
}
