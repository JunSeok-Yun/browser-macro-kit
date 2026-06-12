import { Page, Response } from "patchright";
import { BlockDetectedError, BlockType } from "./errors";

const PROXY_ERROR_PATTERNS = [
    "ERR_TUNNEL_CONNECTION_FAILED",
    "ERR_PROXY_CONNECTION_FAILED",
    "ERR_CONNECTION_REFUSED",
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_CLOSED",
    "ERR_CONNECTION_TIMED_OUT",
    "ERR_SOCKS_CONNECTION_FAILED",
    "ERR_EMPTY_RESPONSE",
    "ERR_NAME_NOT_RESOLVED",
    "ERR_INTERNET_DISCONNECTED",
    "ERR_NETWORK_CHANGED",
    "ERR_ADDRESS_UNREACHABLE",
    "ERR_SSL_PROTOCOL_ERROR",
    "ERR_HTTP2_PROTOCOL_ERROR",
    "Timeout",
];


export function classifyNavigationError(error: unknown): BlockType | null {
    const message = error instanceof Error ? error.message : String(error);
    if (PROXY_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) {
        return "PROXY_ERROR";
    }
    return null;
}

function assertResponseOk(response: Response | null): void {
    const status = response?.status();
    if (status !== undefined && status >= 500) {
        throw new BlockDetectedError(`HTTP_ERROR: 응답 코드 ${status}`, "HTTP_ERROR");
    }
}

export async function safeGoto(
    page: Page,
    url: string,
    options?: Parameters<Page["goto"]>[1]
    ): Promise<Response | null> {

    let response: Response | null;
    try {
        response = await page.goto(url, options);
    } catch (error) {
        const type = classifyNavigationError(error);
        if (type) throw new BlockDetectedError(`${type}: ${(error as Error).message}`, type);
        throw error;
    }
    assertResponseOk(response);
    return response;
}

export async function withNavigationErrorHandling<T>(action: () => Promise<T>): Promise<T> {
    try {
    return await action();
    } catch (error) {
    const type = classifyNavigationError(error);
    if (type) throw new BlockDetectedError(`${type}: ${(error as Error).message}`, type);
    throw error;
    }
}

export type PortalType = "naver" | "google";

export async function assertPortalNotBlocked(page: Page, portal: PortalType): Promise<void> {
    if (portal === "google") {
        const url = page.url();
        if (url.includes("/sorry/")) {
        throw new BlockDetectedError(`PORTAL_CAPTCHA: 구글 비정상 트래픽 감지 (${url})`, "PORTAL_CAPTCHA");
        }
        const recaptcha = await page.locator('iframe[src*="recaptcha"], #captcha-form').count();
        if (recaptcha > 0) {
        throw new BlockDetectedError("PORTAL_CAPTCHA: 구글 reCAPTCHA 감지", "PORTAL_CAPTCHA");
        }
    }

    if (portal === "naver") {
        const captcha = await page
        .locator('#captcha_img, .captcha_wrap, img[alt*="자동입력"]')
        .count();
        if (captcha > 0) {
        throw new BlockDetectedError("PORTAL_CAPTCHA: 네이버 캡차 감지", "PORTAL_CAPTCHA");
        }

        const bodyText = await page.locator("body").innerText().catch(() => "");
        if (/비정상적인.*(접근|검색|트래픽)/.test(bodyText)) {
        throw new BlockDetectedError("PORTAL_CAPTCHA: 네이버 비정상 접근 감지", "PORTAL_CAPTCHA");
        }
    }
}

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

        // AKAMAI_BLOCK: Access Denied 페이지 (Akamai) / Sorry, you have been blocked (Cloudflare)
    // 두 WAF 모두 coupang.com 앞단에 있을 수 있으며, 복구 정책(프록시+프로필 교체)이 동일해 같은 타입으로 처리
    if (
        /Access Denied/i.test(bodyText) ||
        /Reference\s*[:#]\s*18\./.test(bodyText) ||
        /Sorry, you have been blocked/i.test(bodyText) ||
        /don't have permission to access this page/i.test(bodyText)
    ) {
    throw new BlockDetectedError("AKAMAI_BLOCK 감지", "AKAMAI_BLOCK");
    }

    // COUPANG_APP_BLOCK: RET9999
    if (/"rCode"\s*:\s*"RET9999"/.test(bodyText)) {
    throw new BlockDetectedError("COUPANG_APP_BLOCK(RET9999) 감지", "COUPANG_APP_BLOCK");
    }
}