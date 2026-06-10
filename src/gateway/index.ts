import { Page } from "patchright";
import { ENV } from "../config/env";
import { ProductTarget } from "../core/types";
import { BlockDetectedError, ProductNotFoundError } from "../core/errors";
import { sleep } from "../utils";
import { runNaverGateway } from "./naver";
import { runGoogleGateway } from "./google";
import { runCoupangSearchFlow } from "../coupang/flow";
import { assertNotBlocked } from "../core/blockDetection";

export async function runPortalGateway(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set()
): Promise<boolean> {
  const isNaver = Math.random() < ENV.NAVER_RATIO;

  try {
    const targetPage = isNaver
      ? await runNaverGateway(page)
      : await runGoogleGateway(page);

    await sleep(ENV.PORTAL_AFTER_ENTRY_DELAY);
    await assertNotBlocked(targetPage);

    const currentUrl = targetPage.url();
    if (currentUrl.includes("coupang.com")) {
      console.log(`[Success] 쿠팡 진입 성공! 현재 URL: ${currentUrl}`);
      await runCoupangSearchFlow(targetPage, target, excludeQueries);
      return true;
    } else {
      console.log(`[Fail] 다른 페이지로 이탈됨: ${currentUrl}`);
      return false;
    }
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof BlockDetectedError) throw error;
    console.error("[Error] 게이트웨이 구동 중 에러 발생:", error);
    return false;
  }
}
