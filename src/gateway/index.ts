import { Page } from "patchright";
import { ENV } from "../config/env";
import { ProductTarget } from "../core/types";
import { BlockDetectedError, ProductNotFoundError, NoLinkFoundError } from "../core/errors";
import { sleep } from "../utils";
import { runNaverGateway, enterCoupangFromNaverResults } from "./naver";
import { runGoogleGateway, enterCoupangFromGoogleResults } from "./google";
import { runCoupangSearchFlow } from "../coupang/flow";
import { assertNotBlocked, assertPortalNotBlocked, safeGoto } from "../core/blockDetection";
import { ProxyEntry } from "../infra/proxyManager";
import * as logger from "../infra/logger";


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
        logger.warn(`[Gateway] ${isNaver ? "네이버" : "구글"} 링크 없음 → ${isNaver ? "구글" : "네이버"} 폴백`, {
          event: "PORTAL_FALLBACK",
          from: isNaver ? "naver" : "google",
          to: isNaver ? "google" : "naver",
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
          slot: logger.slotFrom(profileDir),
        });
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
        logger.warn("[Gateway] Akamai Access Denied (진입 시) → 5초 대기 후 재진입...", {
          event: "BLOCK_PORTAL_ENTRY",
          location: "PORTAL_ENTRY",
          portal: isNaver ? "naver" : "google",
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
          slot: logger.slotFrom(profileDir),
        });
        await sleep(5000);
        if (isNaver) {
          try {
            await targetPage.goBack({ waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT });
          } catch {
            logger.error("[Gateway] goBack 실패 → 재진입 포기", {
              event: "GOBACK_FAIL",
              portal: "naver",
              proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
              slot: logger.slotFrom(profileDir),
            });
            throw blockErr;
          }
          await sleep(2000);
          await enterCoupangFromNaverResults(targetPage);
        } else {
          // Google: Akamai defer 스크립트가 추가 navigation을 유발해 goBack 실패
          // 구글 검색 페이지로 직접 재이동 후 재진입
          logger.info("[Gateway] 구글 직접 재검색 후 재진입 시도...", {
            event: "GOOGLE_DIRECT_RETRY",
            portal: "google",
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
          });
          await safeGoto(targetPage, "https://www.google.com/search?q=쿠팡", { waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT });
          await sleep(ENV.GOOGLE_SEARCH_DELAY);
          await assertPortalNotBlocked(targetPage, "google");
          await enterCoupangFromGoogleResults(targetPage);
        }
        await sleep(ENV.PORTAL_AFTER_ENTRY_DELAY);
        await assertNotBlocked(targetPage);
      } else {
        // 포털 진입 시 비AKAMAI_BLOCK 차단 — location 태깅
        if (blockErr instanceof BlockDetectedError) {
          logger.error(`[Gateway] 포털 진입 차단 (${blockErr.type})`, {
            event: "BLOCK_AT_PORTAL_ENTRY",
            location: "PORTAL_ENTRY",
            blockType: blockErr.type,
            portal: isNaver ? "naver" : "google",
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
            htmlPath: (blockErr as any).htmlPath ?? null,
          });
        }
        throw blockErr;
      }
    }

    const currentUrl = targetPage.url();
    if (currentUrl.includes("coupang.com")) {
      logger.info(`[Success] 쿠팡 진입 성공! 현재 URL: ${currentUrl}`, {
        event: "COUPANG_ENTRY_SUCCESS",
        portal: isNaver ? "naver" : "google",
        url: currentUrl,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        slot: logger.slotFrom(profileDir),
      });
      await runCoupangSearchFlow(targetPage, target, excludeQueries, proxy, profileDir, jobId);
      return true;
    } else {
      logger.warn(`[Fail] 다른 페이지로 이탈됨: ${currentUrl}`, {
        event: "PORTAL_DRIFT",
        url: currentUrl,
        portal: isNaver ? "naver" : "google",
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        slot: logger.slotFrom(profileDir),
      });
      return false;
    }
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof BlockDetectedError || error instanceof NoLinkFoundError) throw error;
    logger.error(`[Error] 게이트웨이 구동 중 에러 발생: ${String(error)}`, {
      event: "GATEWAY_ERROR",
      proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      slot: logger.slotFrom(profileDir),
      errorMessage: String(error),
    });
    return false;
  }
}
