import { Page } from "patchright";
import { ENV } from "../config/env";
import { ProductTarget } from "../core/types";
import { BlockDetectedError, ProductNotFoundError, NoLinkFoundError } from "../core/errors";
import { sleep } from "../utils";
import { runNaverGateway, enterCoupangFromNaverResults } from "./naver";
import { runGoogleGateway, enterCoupangFromGoogleResults } from "./google";
import { runCoupangSearchFlow } from "../coupang/flow";
import { assertNotBlocked } from "../core/blockDetection";
import { ProxyEntry } from "../infra/proxyManager";

export async function runPortalGateway(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set(),
  proxy: ProxyEntry | null,
  profileDir: string,
  jobId: number
): Promise<boolean> {
  const isNaver = Math.random() < ENV.NAVER_RATIO;

  try {
    let targetPage: Page;
    try {
      targetPage = isNaver
        ? await runNaverGateway(page)
        : await runGoogleGateway(page);
    } catch (portalError) {
      if (portalError instanceof NoLinkFoundError) {
        console.warn(`[Gateway] ${isNaver ? "네이버" : "구글"} 링크 없음 → ${isNaver ? "구글" : "네이버"} 폴백`);
        targetPage = isNaver
          ? await runGoogleGateway(page)
          : await runNaverGateway(page);
      } else {
        throw portalError;
      }
    }

    await sleep(ENV.PORTAL_AFTER_ENTRY_DELAY);

    try {
      await assertNotBlocked(targetPage);
    } catch (blockErr) {
      if (blockErr instanceof BlockDetectedError && blockErr.type === "AKAMAI_BLOCK") {
        // Akamai JS 챌린지: 차단 페이지 JS가 _abck를 갱신할 때까지 5초 대기 후
        // 검색 결과로 복귀해 동일 링크를 재클릭하면 통과하는 구조
        console.log("[Gateway] Akamai JS 챌린지 → 5초 대기 후 뒤로가기 재진입...");
        await sleep(5000);
        await targetPage.goBack({ waitUntil: "domcontentloaded" });
        await sleep(2000);
        if (isNaver) {
          await enterCoupangFromNaverResults(targetPage);
        } else {
          await enterCoupangFromGoogleResults(targetPage);
        }
        await sleep(ENV.PORTAL_AFTER_ENTRY_DELAY);
        await assertNotBlocked(targetPage); // 재진입 후에도 차단이면 그대로 throw
      } else {
        throw blockErr;
      }
    }

    const currentUrl = targetPage.url();
    if (currentUrl.includes("coupang.com")) {
      console.log(`[Success] 쿠팡 진입 성공! 현재 URL: ${currentUrl}`);
      await runCoupangSearchFlow(targetPage, target, excludeQueries, proxy, profileDir, jobId);
      return true;
    } else {
      console.log(`[Fail] 다른 페이지로 이탈됨: ${currentUrl}`);
      return false;
    }
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof BlockDetectedError || error instanceof NoLinkFoundError) throw error;
    console.error("[Error] 게이트웨이 구동 중 에러 발생:", error);
    return false;
  }
}
