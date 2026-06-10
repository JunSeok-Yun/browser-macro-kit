import { Page } from "patchright";
import { BlockDetectedError } from "./errors";

export async function assertNotBlocked(page: Page): Promise<void> {
    const url = page.url();

    // SELECTOR_BUG: 잘못된 셀렉터로 link.coupang.com(애드 리다이렉트)을 클릭한 경우
    if (url.includes("link.coupang.com")) {
    throw new BlockDetectedError(`SELECTOR_BUG: ${url}`, "SELECTOR_BUG");
    }

    // AKAMAI_CHALLENGE: 챌린지 iframe 존재 여부 (실제 셀렉터는 한 번 차단 걸렸을 때 캡처해서 보정 필요)
    const challenge = await page
    .locator('iframe[src*="challenge"], #px-captcha')
    .count();
    if (challenge > 0) {
    throw new BlockDetectedError("AKAMAI_CHALLENGE 감지", "AKAMAI_CHALLENGE");
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");

    // AKAMAI_BLOCK: Access Denied 페이지
    if (/Access Denied/i.test(bodyText) || /Reference #18\./.test(bodyText)) {
    throw new BlockDetectedError("AKAMAI_BLOCK 감지", "AKAMAI_BLOCK");
    }

    // COUPANG_APP_BLOCK: RET9999
    if (/"rCode"\s*:\s*"RET9999"/.test(bodyText)) {
    throw new BlockDetectedError("COUPANG_APP_BLOCK(RET9999) 감지", "COUPANG_APP_BLOCK");
    }
}
