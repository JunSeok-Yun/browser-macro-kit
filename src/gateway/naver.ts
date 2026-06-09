import { Page } from "patchright";
import { ENV } from "../config/env";
import { typeLikeHuman } from "../automation/keyboard";
import { sleep } from "../utils";

/**
 * 네이버를 경유하여 쿠팡으로 진입하는 로직
 */
export async function runNaverGateway(page: Page) {
  console.log("[Gateway] 네이버를 통해 쿠팡 진입을 시도합니다.");
  await page.goto("https://www.naver.com");
  await sleep(ENV.NAVER_ENTRY_DELAY);

  // 1. 네이버 메인 검색창 입력 및 엔터
  // 2026년 기준 네이버 메인 검색창 ID: #query
  await typeLikeHuman(page, "#query", "쿠팡");
  await page.keyboard.press("Enter");

  // DOM이 안정화될 때까지 대기
  await page.waitForLoadState("domcontentloaded");
  await sleep(ENV.NAVER_SEARCH_DELAY);

  console.log("[Gateway] 네이버 검색 결과에서 실제 이동 가능한 링크 요소를 탐색합니다.");

  // 2. 검색 결과 화면에서 쿠팡 공식 사이트 링크 클릭
  // 네이버 검색 결과 내 웹사이트 링크나 브랜드검색 영역 셀렉터 타겟팅
  // (안전하게 쿠팡 텍스트가 포함된 링크 요소를 찾아 곡선 효과 대용으로 자연스럽게 클릭)
  const coupangLink = page
    .locator(
      [
        'a.direct_link:not([href*="link.coupang.com"])',
        'a[href*="coupang.com"]:not([href*="ader.naver.com"]):not([href*="link.coupang.com"])',
      ].join(", "),
    )
    .first();

  const elementCount = await coupangLink.count();
  console.log(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("네이버 검색 결과에서 쿠팡으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  const href = await coupangLink.getAttribute("href");

  if (!href) throw new Error("링크 href를 찾을 수 없습니다.");

  console.log("[Gateway] 쿠팡으로 이동합니다...");
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT});
  await sleep(ENV.COUPANG_ENTRY_DELAY); // 쿠팡 메인화면 UI가 완전히 그려질 때까지 대기

  return page;
}