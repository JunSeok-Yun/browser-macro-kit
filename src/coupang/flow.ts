import { sleep } from "../utils";
import { Page } from "patchright";
import { ProductTarget } from "../core/types";
import { ProductNotFoundError } from "../core/errors";
import { ENV } from "../config/env";
import { typeLikeHuman, clearSearchInput } from "../automation/keyboard";
import { randomScrollDwell, scrollToTop } from "../automation/scroll";
import { moveMouseAlongCurveAndClick } from "../automation/mouse";
import { buildSearchQuery, findTargetProduct, normalizeProductText, extractProductId } from "./search";


/**
 * 쿠팡 메인 진입 후 검색 → 상품 클릭까지 이어지는 행동 시퀀스
 */
export async function runCoupangSearchFlow(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set()
) {
  const triedQueries = new Set<string>(excludeQueries);
  let currentQuery: string | null = null;

  for (let i = 0; ; i++) {
    const query = buildSearchQuery(target, triedQueries);
    if (!query) {
      throw new ProductNotFoundError(
        `검색 후보 쿼리 모두 소진 (시도: ${[...triedQueries].join(", ")})`,
        triedQueries,
        true   // exhausted
      );
    }

    console.log(`[Behavior] 쿠팡 검색: "${query}" (${i + 1}번째 시도)`);

    if (i === 0) {
      await typeLikeHuman(page, 'input[name="q"]:visible', query);
    } else {
      // 재검색: 스크롤 상단 → 기존 쿼리 지우기 → 새 쿼리 입력
      await scrollToTop(page);
      await clearSearchInput(page, currentQuery!);
      await typeLikeHuman(page, 'input[name="q"]:visible', query);
    }

    currentQuery = query;
    triedQueries.add(query);

    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    await sleep(ENV.COUPANG_SEARCH_DELAY);
    await randomScrollDwell(page);

    console.log(`[Behavior] 타겟 상품 탐색 중: ${target.brand} / ${target.keywords.join(", ")}`);
    const productLink = await findTargetProduct(page, target);

    if (productLink) {
      const debugHref = await productLink.getAttribute("href");
      const debugName = normalizeProductText(await productLink.innerText());
      console.log(`[Debug] 선택된 상품 — productId: ${debugHref ? extractProductId(debugHref) : "알 수 없음"} / 상품명: "${debugName}"`);

      const [productPage] = await Promise.all([
        page.context().waitForEvent("page"),
        moveMouseAlongCurveAndClick(page, productLink),
      ]);
      await productPage.waitForLoadState("domcontentloaded");
      await sleep(ENV.COUPANG_ENTRY_DELAY);
      await randomScrollDwell(productPage);
      return;
    }

    console.warn(`[Behavior] "${query}" 결과에서 타겟 상품 없음.`);
  }
}
