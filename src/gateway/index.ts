import { Page } from "patchright";
import { ENV } from "../config/env";
import { ProductTarget } from "../core/types";
import { BlockDetectedError, ProductNotFoundError, NoLinkFoundError } from "../core/errors";
import { sleep } from "../utils";
import { runNaverGateway, enterCoupangFromNaverResults } from "./naver";
import { runGoogleGateway, enterCoupangFromGoogleResults } from "./google";
import { runDaumGateway, enterCoupangFromDaumResults } from "./daum";
import { runNateGateway, enterCoupangFromNateResults } from "./nate";
import { runCoupangSearchFlow } from "../coupang/flow";
import { assertNotBlocked, assertPortalNotBlocked, safeGoto, PortalType } from "../core/blockDetection";
import { ProxyEntry } from "../infra/proxyManager";
import * as logger from "../infra/logger";

const FALLBACK: Record<PortalType, PortalType> = {
  naver: "google",
  google: "naver",
  daum: "naver",
  nate: "google",
};

// NAVER_RATIO + GOOGLE_RATIO + DAUM_RATIO 합이 1.0 이하여야 nate가 선택됨
function selectPortal(): PortalType {
  const r = Math.random();
  if (r < ENV.NAVER_RATIO) return "naver";
  if (r < ENV.NAVER_RATIO + ENV.GOOGLE_RATIO) return "google";
  if (r < ENV.NAVER_RATIO + ENV.GOOGLE_RATIO + ENV.DAUM_RATIO) return "daum";
  return "nate";
}

async function launchPortal(page: Page, portal: PortalType): Promise<Page> {
  if (portal === "naver") return runNaverGateway(page);
  if (portal === "google") return runGoogleGateway(page);
  if (portal === "daum") return runDaumGateway(page);
  return runNateGateway(page);
}

export async function runPortalGateway(
  page: Page,
  target: ProductTarget,
  excludeQueries: Set<string> = new Set(),
  proxy: ProxyEntry | null,
  profileDir: string,
  jobId: number
): Promise<boolean> {
  const portal = selectPortal();
  let activePortal = portal; // 폴백 후 실제 사용된 포털 추적

  try {
    let targetPage: Page;
    try {
      targetPage = await launchPortal(page, portal);
    } catch (portalError) {
      if (portalError instanceof NoLinkFoundError) {
        const fallback = FALLBACK[portal];
        logger.warn(`[Gateway] ${portal} 링크 없음 → ${fallback} 폴백`, {
          event: "PORTAL_FALLBACK",
          from: portal,
          to: fallback,
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
          slot: logger.slotFrom(profileDir),
        });
        activePortal = fallback;
        targetPage = await launchPortal(page, fallback);
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
          portal: activePortal,
          proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
          slot: logger.slotFrom(profileDir),
        });
        await sleep(5000);

        if (activePortal === "naver") {
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
          // 구글/다음/네이트: Akamai defer script 간섭 가능성 → safeGoto 재검색
          const searchUrl =
            activePortal === "google" ? "https://www.google.com/search?q=쿠팡" :
            activePortal === "daum"   ? "https://search.daum.net/search?q=쿠팡" :
                                        "https://search.daum.net/nate?thr=sbma&w=tot&q=쿠팡";
          logger.info(`[Gateway] ${activePortal} 직접 재검색 후 재진입 시도...`, {
            event: `${activePortal.toUpperCase()}_DIRECT_RETRY`,
            portal: activePortal,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
          });
          await safeGoto(targetPage, searchUrl, { waitUntil: "domcontentloaded", timeout: ENV.PORTAL_TIMEOUT });
          await sleep(ENV.GOOGLE_SEARCH_DELAY);
          await assertPortalNotBlocked(targetPage, activePortal);
          if (activePortal === "google") await enterCoupangFromGoogleResults(targetPage);
          else if (activePortal === "daum") targetPage = await enterCoupangFromDaumResults(targetPage);
          else targetPage = await enterCoupangFromNateResults(targetPage);
        }

        await sleep(ENV.PORTAL_AFTER_ENTRY_DELAY);
        await assertNotBlocked(targetPage);
      } else {
        if (blockErr instanceof BlockDetectedError) {
          logger.error(`[Gateway] 포털 진입 차단 (${blockErr.type})`, {
            event: "BLOCK_AT_PORTAL_ENTRY",
            location: "PORTAL_ENTRY",
            blockType: blockErr.type,
            portal: activePortal,
            proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
            slot: logger.slotFrom(profileDir),
            htmlPath: (blockErr as any).htmlPath ?? null,
          });
        }
        throw blockErr;
      }
    }

    const currentUrl = targetPage.url();
    if (currentUrl.includes(".coupang.com")) {
      logger.info(`[Success] 쿠팡 진입 성공! 현재 URL: ${currentUrl}`, {
        event: "COUPANG_ENTRY_SUCCESS",
        portal: activePortal,
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
        portal: activePortal,
        proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
        slot: logger.slotFrom(profileDir),
      });
      return false;
    }
  } catch (error) {
    if (error instanceof ProductNotFoundError || error instanceof BlockDetectedError || error instanceof NoLinkFoundError) throw error;
    logger.error(`[Error] 게이트웨이 구동 중 에러 발생: ${String(error)}`, {
      event: "GATEWAY_ERROR",
      portal: activePortal,
      proxy: proxy ? `${proxy.host}:${proxy.port}` : null,
      slot: logger.slotFrom(profileDir),
      errorMessage: String(error),
    });
    return false;
  }
}
