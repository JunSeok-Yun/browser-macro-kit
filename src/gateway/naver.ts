import { assertPortalNotBlocked, safeGoto, withNavigationErrorHandling } from "../core/blockDetection";
import { Page } from "patchright";
import { ENV } from "../config/env";
import { typeLikeHuman } from "../automation/keyboard";
import { sleep } from "../utils";
import { saveDebugHtml } from "../infra/debugCapture";
import { NoLinkFoundError } from "../core/errors";
import * as logger from "../infra/logger";

const NAVER_COUPANG_SELECTOR = [
  'a.direct_link:not([href*="link.coupang.com"])',
  'a[href*="coupang.com"]:not([href*="ader.naver.com"]):not([href*="link.coupang.com"])',
].join(", ");

/** 네이버 검색 결과 페이지에서 쿠팡 링크를 찾아 클릭. 최초 진입·재시도 모두 공용 */
export async function enterCoupangFromNaverResults(page: Page): Promise<void> {
  const coupangLink = page.locator(NAVER_COUPANG_SELECTOR).first();

  await coupangLink.waitFor({ state: "attached", timeout: 4000 }).catch(() => {});

  const elementCount = await coupangLink.count();
  logger.info(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    const html = await page.content();
    const htmlPath = saveDebugHtml(html, "NAVER_NO_LINK");
    throw new NoLinkFoundError(
      `네이버 검색 결과에서 쿠팡 브랜드검색 링크를 찾지 못했습니다 (광고 미노출 추정). (HTML: ${htmlPath})`,
      htmlPath,
    );
  }

  logger.info("[Gateway] 쿠팡으로 이동합니다...");
// 네이버 브랜드검색 링크는 target="_blank" 가 붙어 있을 수 있음
// → 클릭 전에 _self로 강제 변경해 새 탭 대신 현재 탭에서 이동하게 함
await coupangLink.evaluate((el) => { (el as HTMLAnchorElement).target = "_self"; });
await withNavigationErrorHandling(() =>
  Promise.all([
    page.waitForURL((url) => url.hostname.includes("coupang.com"), { timeout: ENV.NAV_TIMEOUT, waitUntil: "domcontentloaded" }),
    coupangLink.click(),
  ])
);

  await sleep(ENV.COUPANG_ENTRY_DELAY);
}

export async function runNaverGateway(page: Page): Promise<Page> {
  logger.info("[Gateway] 네이버를 통해 쿠팡 진입을 시도합니다.");
  await safeGoto(page, "https://www.naver.com", { waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT });
  await sleep(ENV.NAVER_ENTRY_DELAY);

  await typeLikeHuman(page, "#query", "쿠팡");
  await page.keyboard.press("Enter");

  await page.waitForLoadState("domcontentloaded");
  await sleep(ENV.NAVER_SEARCH_DELAY);
  await assertPortalNotBlocked(page, "naver");

  logger.info("[Gateway] 네이버 검색 결과에서 실제 이동 가능한 링크 요소를 탐색합니다.");
  await enterCoupangFromNaverResults(page);

  return page;
}
