import { assertPortalNotBlocked, safeGoto, classifyNavigationError } from "../core/blockDetection";
import { Page } from "patchright";
import { ENV } from "../config/env";
import { typeLikeHuman } from "../automation/keyboard";
import { sleep } from "../utils";
import { saveDebugHtml } from "../infra/debugCapture";
import * as logger from "../infra/logger";
import { BlockDetectedError, NoLinkFoundError } from "../core/errors";

const DAUM_COUPANG_SELECTOR = 'a[href*=".coupang.com"]:not([href*="link.coupang.com"])';

export async function enterCoupangFromDaumResults(page: Page): Promise<Page> {
    const coupangLink = page.locator(DAUM_COUPANG_SELECTOR).first();

    await coupangLink.waitFor({ state: "attached", timeout: 4000 }).catch(() => {});

    const elementCount = await coupangLink.count();
    logger.info(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

    if (elementCount === 0) {
        const html = await page.content();
        const htmlPath = saveDebugHtml(html, "DAUM_NO_LINK");
        throw new NoLinkFoundError(
            `다음 검색 결과에서 쿠팡 링크를 찾지 못했습니다. (HTML: ${htmlPath})`,
            htmlPath,
        );
    }

    logger.info("[Gateway] 다음에서 쿠팡으로 이동합니다...");
    await coupangLink.evaluate((el) => { (el as HTMLAnchorElement).target = "_self"; });

    const context = page.context();
    // 같은 탭 이동 vs 새 탭 오픈 동시 감지
    const sameTabNavPromise = page.waitForURL(
        (url) => !url.hostname.includes("daum.net"),
        { timeout: ENV.NAV_TIMEOUT, waitUntil: "domcontentloaded" }
    );
    const newPageEventPromise = context.waitForEvent("page", { timeout: ENV.NAV_TIMEOUT });
    // 지는 쪽 Promise의 미처리 rejection 방지
    sameTabNavPromise.catch(() => {});
    newPageEventPromise.catch(() => {});

    await coupangLink.click();

    let coupangPage: Page;
    try {
        const raceResult = await Promise.race([
            sameTabNavPromise.then(() => null as Page | null),
            newPageEventPromise.then(p => p as Page | null),
        ]);
        if (raceResult === null) {
            coupangPage = page; // 같은 탭에서 이동
        } else {
            coupangPage = raceResult; // 새 탭에서 열림
            await coupangPage.waitForLoadState("domcontentloaded");
            await page.close().catch(() => {}); // 검색 결과 탭 닫기
        }
    } catch (error) {
        const type = classifyNavigationError(error);
        if (type) throw new BlockDetectedError(`${type}: ${(error as Error).message}`, type);
        throw error;
    }

    await sleep(ENV.COUPANG_ENTRY_DELAY);
    return coupangPage;
}

export async function runDaumGateway(page: Page): Promise<Page> {
    logger.info("[Gateway] 다음을 통해 쿠팡 진입을 시도합니다.");
    await safeGoto(page, "https://www.daum.net", { waitUntil: "domcontentloaded", timeout: ENV.NAV_TIMEOUT });
    await sleep(ENV.GOOGLE_ENTRY_DELAY_MIN + Math.floor(Math.random() * ENV.GOOGLE_ENTRY_DELAY_RANGE));
    await typeLikeHuman(page, 'input[name="q"]', "쿠팡");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("domcontentloaded");
    await sleep(ENV.GOOGLE_SEARCH_DELAY);
    await assertPortalNotBlocked(page, "daum");
    logger.info("[Gateway] 다음 검색 결과에서 쿠팡 링크를 탐색합니다.");
    return enterCoupangFromDaumResults(page); // ← Page 반환으로 변경
}