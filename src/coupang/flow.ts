import { sleep } from "../utils";
import { Page } from "patchright";
import { ProductTarget } from "../core/types";
import { ProductNotFoundError } from "../core/errors";
import { ENV } from "../config/env";
import { typeLikeHuman, clearSearchInput } from "../automation/keyboard";
import { randomScrollDwell, scrollToTop } from "../automation/scroll";
import { moveMouseAlongCurveAndClick } from "../automation/mouse";
import { buildSearchQuery, findTargetProduct, normalizeProductText, extractProductId } from "./search";
import { assertNotBlocked } from "../core/blockDetection";
import { recordQueryResult, logSession } from "../infra/db";
import { ProxyEntry } from "../infra/proxyManager";

export async function runCoupangSearchFlow(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set(),
  proxy: ProxyEntry | null,
  profileDir: string
) {
  const triedQueries = new Set<string>(excludeQueries);
  let currentQuery: string | null = null;

  for (let i = 0; ; i++) {
    const result = await buildSearchQuery(target, triedQueries);
    if (!result) {
      throw new ProductNotFoundError(
        `검색 후보 쿼리 모두 소진 (시도: ${[...triedQueries].join(", ")})`,
        triedQueries,
        true
      );
    }
    const { query, product } = result;

    console.log(`[Behavior] 쿠팡 검색: "${query}" (${i + 1}번째 시도)`);

    if (i === 0) {
      await typeLikeHuman(page, 'input[name="q"]:visible', query);
    } else {
      await scrollToTop(page);
      await clearSearchInput(page, currentQuery!);
      await typeLikeHuman(page, 'input[name="q"]:visible', query);
    }

    currentQuery = query;
    triedQueries.add(query);

    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    await assertNotBlocked(page);
    await sleep(ENV.COUPANG_SEARCH_DELAY);
    await randomScrollDwell(page);

    console.log(`[Behavior] 타겟 상품 탐색 중: ${product.productId}`);
    const productLink = await findTargetProduct(page, product);

    if (productLink) {
      await recordQueryResult(query, true);
      await logSession({
        jobId: null,
        productId: product.productId,
        category: product.category,
        success: true,
        blockType: null,
        proxy,
        profileDir,
      });
      const [productPage] = await Promise.all([
        page.context().waitForEvent("page"),
        moveMouseAlongCurveAndClick(page, productLink),
      ]);
      await productPage.waitForLoadState("domcontentloaded");
      await assertNotBlocked(productPage);
      await sleep(ENV.COUPANG_ENTRY_DELAY);
      await randomScrollDwell(productPage);
      return;
    }

    await recordQueryResult(query, false);
    await logSession({
      jobId: null,
      productId: product.productId,
      category: product.category,
      success: false,
      blockType: null,
      proxy,
      profileDir,
    });
    console.warn(`[Behavior] "${query}" 결과에서 타겟 상품 없음.`);
  }
}
