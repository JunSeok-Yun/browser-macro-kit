import { sleep } from "../utils";
import { Page } from "patchright";
import { ProductTarget } from "../core/types";
import { ProductNotFoundError, BlockDetectedError } from "../core/errors";
import { ENV } from "../config/env";
import { typeLikeHuman, clearSearchInput } from "../automation/keyboard";
import { randomScrollDwell, scrollToTop, deepScrollToBottom } from "../automation/scroll";
import { moveMouseAlongCurveAndClick } from "../automation/mouse";
import { buildSearchQuery, findTargetProduct } from "./search";
import { assertNotBlocked } from "../core/blockDetection";
import { saveDebugHtml } from "../infra/debugCapture";
import { recordQueryResult, logSession } from "../infra/db";
import { ProxyEntry } from "../infra/proxyManager";
import * as logger from "../infra/logger";

async function runProductPageInteraction(
  page: Page,
  proxy: ProxyEntry | null,
  profileDir: string,
): Promise<void> {
  // 1. 상단 체류 (가격/옵션 확인)
  await sleep(Math.random() * 2000 + 2000);

  // 2. "상품정보 더보기" 버튼 클릭
  try {
    const moreBtn = page
      .locator('button:has-text("상품정보 더보기"), a:has-text("상품정보 더보기")')
      .first();
    if ((await moreBtn.count()) > 0) {
      await moreBtn.scrollIntoViewIfNeeded();
      await sleep(Math.random() * 500 + 300);
      await moreBtn.click();
      await sleep(Math.random() * 1000 + 1000);
      logger.info("[Behavior] '상품정보 더보기' 클릭", {
        event: "PRODUCT_DETAIL_EXPANDED",
        slot: logger.slotFrom(profileDir),
      });
    }
  } catch {
    // 버튼 없거나 클릭 실패 → 무시
  }

  // 3. 끝까지 스크롤
  await deepScrollToBottom(page);
  await sleep(Math.random() * 800 + 500);

  // 4. 리뷰 탭 클릭 (리뷰 영역 진입 신호 발생)
  try {
    const reviewTab = page
      .locator('a:has-text("리뷰"), li[data-tab="review"]')
      .first();
    if ((await reviewTab.count()) > 0) {
      await reviewTab.scrollIntoViewIfNeeded();
      await sleep(Math.random() * 400 + 300);
      await reviewTab.click();
      await sleep(Math.random() * 800 + 500);
      await page.mouse.wheel(0, Math.floor(Math.random() * 400) + 200);
      await sleep(Math.random() * 600 + 400);
      logger.info("[Behavior] 리뷰 탭 클릭", {
        event: "REVIEW_TAB_CLICKED",
        slot: logger.slotFrom(profileDir),
      });
    }
  } catch {
    // 탭 없거나 클릭 실패 → 무시
  }

  // 5. 랜덤 장바구니 담기
  if (Math.random() < ENV.ADD_TO_CART_RATIO) {
    try {
      await scrollToTop(page);
      await sleep(Math.random() * 800 + 500);

      // CSS 클래스 기반 우선 (text 매칭보다 빠름)
      const cartBtn = page
        .locator('button.prod-cart-btn, button:has-text("장바구니 담기")')
        .first();
      if ((await cartBtn.count()) > 0) {
        await cartBtn.click();
        // 토스트 성공 메시지 확인 후 닫기
        await page
          .locator('div.cart-success-message, .prod-cart-confirmation')
          .waitFor({ state: "visible", timeout: 3000 })
          .catch(() => {});
        await page.keyboard.press("Escape");
        await sleep(Math.random() * 400 + 200);
        logger.info("[Behavior] 장바구니 담기 완료", {
          event: "ADD_TO_CART",
          slot: logger.slotFrom(profileDir),
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        });
      }
    } catch {
      // 클릭 실패 → 무시
    }
  }
}


export async function runCoupangSearchFlow(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set(),
  proxy: ProxyEntry | null,
  profileDir: string,
  jobId: number
) {
  const triedQueries = new Set<string>(excludeQueries);

  let hadSearchBlock = false;

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

    logger.info(`[Behavior] 쿠팡 검색: "${query}" (${i + 1}번째 시도)`, {
      event: "SEARCH_ATTEMPT",
      query,
      attemptIndex: i + 1,
      productId: product.productId,
      proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      slot: logger.slotFrom(profileDir),
    });

    try{
      if (i === 0) {
        await page.waitForSelector('.loader-wrapper', { state: 'detached', timeout: 10000 }).catch(() => {});
        await typeLikeHuman(page, 'input[name="q"]:visible', query);
      } else {
        await scrollToTop(page);
        await clearSearchInput(page);
        await typeLikeHuman(page, 'input[name="q"]:visible', query);
      }
      triedQueries.add(query);

      await page.keyboard.press("Enter");
      await page.waitForLoadState("domcontentloaded");
          try {
        await assertNotBlocked(page);
      } catch (blockErr) {
        if (
          blockErr instanceof BlockDetectedError && blockErr.type === "AKAMAI_BLOCK" && !hadSearchBlock
        ) {
          hadSearchBlock = true;
          logger.warn("[Behavior] 검색 결과 AKAMAI_BLOCK → goBack 후 재검색 시도...", {
            event: "BLOCK_SEARCH_RETRY",
            location: "SEARCH",
            query,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
            htmlPath: (blockErr as any).htmlPath ?? null,
          });
          try {
            await page.goBack({ waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT });
          } catch {
            logger.error("[Behavior] 검색 goBack 실패 → 차단 복구 경로로", {
              event: "BLOCK_SEARCH_GOBACK_FAIL",
              location: "SEARCH",
              query,
              proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
              slot: logger.slotFrom(profileDir),
            });
            throw blockErr;
          }
          await sleep(3000);
          triedQueries.delete(query);
          continue;
        }
        // AKAMAI_BLOCK 외 차단 유형 — HTML은 이미 캡처됨, location만 태깅
        if (blockErr instanceof BlockDetectedError) {
          logger.error(`[Behavior] 검색 페이지 차단 (${blockErr.type})`, {
            event: "BLOCK_AT_SEARCH",
            location: "SEARCH",
            blockType: blockErr.type,
            query,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
            htmlPath: (blockErr as any).htmlPath ?? null,
          });
        }
        throw blockErr;
      }
      await sleep(ENV.COUPANG_SEARCH_DELAY);
      await randomScrollDwell(page);

      logger.info(`[Behavior] 타겟 상품 탐색 중: ${product.productId}`, {
        event: "PRODUCT_SEARCH",
        query,
        productId: product.productId,
        slot: logger.slotFrom(profileDir),
      });

      const found = await findTargetProduct(page, product);

      if (found) {
        await recordQueryResult(query, true);
        await logSession({
          jobId,
          productId: product.productId,
          category: product.category,
          exactName: found.matchedName,
          success: true,
          blockType: null,
          proxy,
          profileDir,
        });
        // 새 탭 리스너를 먼저 등록한 뒤 클릭 (순서 중요)
        const newPagePromise = page.context().waitForEvent("page", { timeout: 5000 }).catch(() => null);
        await moveMouseAlongCurveAndClick(page, found.locator);
        const newPage = await newPagePromise;

        // 새 탭이 열렸으면 그 탭, 아니면 같은 탭에서 이동한 것으로 처리
        const productPage = newPage ?? page;
        await productPage.waitForLoadState("domcontentloaded");
        try {
          await assertNotBlocked(productPage);
        } catch (blockErr) {
          logger.error("[Behavior] 상품 페이지 차단", {
            event: "BLOCK_PRODUCT_PAGE",
            location: "PRODUCT",
            productId: product.productId,
            query,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
            htmlPath: (blockErr as any).htmlPath ?? null,
          });
          throw blockErr;
        }
        await sleep(ENV.COUPANG_ENTRY_DELAY);
        await runProductPageInteraction(productPage, proxy, profileDir);
        return;
      }

      await recordQueryResult(query, false);
      await logSession({
        jobId,
        productId: product.productId,
        category: product.category,
        exactName: null,
        success: false,
        blockType: null,
        proxy,
        profileDir,
      });
      logger.warn(`[Behavior] "${query}" 결과에서 타겟 상품 없음.`, {
        event: "PRODUCT_NOT_FOUND",
        query,
        productId: product.productId,
        slot: logger.slotFrom(profileDir),
      });
    }catch (unexpectedErr) {
      // BlockDetectedError / ProductNotFoundError는 위로 전파 (정상 흐름)
      if (unexpectedErr instanceof BlockDetectedError || unexpectedErr instanceof ProductNotFoundError) {
        throw unexpectedErr;
      }
      // 분류되지 않은 오류 — 현재 페이지 HTML 캡처
      const html = await page.content().catch(() => "");
      const htmlPath = saveDebugHtml(html, "FLOW_UNKNOWN_ERROR");
      logger.error(`[Behavior] 플로우 중 예기치 않은 오류: ${String(unexpectedErr)}`, {
        event: "FLOW_UNKNOWN_ERROR",
        query,
        attemptIndex: i,
        errorMessage: String(unexpectedErr),
        htmlPath,
        slot: logger.slotFrom(profileDir),
      });
      throw unexpectedErr;
    }
  }
}
