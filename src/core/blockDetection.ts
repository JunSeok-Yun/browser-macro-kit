import { Page, Response } from "patchright";
import { BlockDetectedError, BlockType } from "./errors";
import { saveDebugHtml } from "../infra/debugCapture";

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

/** 현재 페이지 HTML을 캡처해 저장한 뒤 BlockDetectedError를 던짐 */
async function captureAndThrow(page: Page, message: string, type: BlockType): Promise<never> {
    const html = await page.content().catch(() => "");
    const htmlPath = saveDebugHtml(html, type);
    throw new BlockDetectedError(message, type, htmlPath);
}

export async function assertPortalNotBlocked(page: Page, portal: PortalType): Promise<void> {
    if (portal === "google") {
        const url = page.url();
        if (url.includes("/sorry/")) {
        await captureAndThrow(page, `PORTAL_CAPTCHA: 구글 비정상 트래픽 감지 (${url})`, "PORTAL_CAPTCHA");
        }
        const recaptcha = await page.locator('iframe[src*="recaptcha"], #captcha-form').count();
        if (recaptcha > 0) {
        await captureAndThrow(page, "PORTAL_CAPTCHA: 구글 reCAPTCHA 감지", "PORTAL_CAPTCHA");
        }
    }

    if (portal === "naver") {
        const captcha = await page
        .locator('#captcha_img, .captcha_wrap, img[alt*="자동입력"]')
        .count();
        if (captcha > 0) {
        await captureAndThrow(page, "PORTAL_CAPTCHA: 네이버 캡차 감지", "PORTAL_CAPTCHA");
        }

        const bodyText = await page.locator("body").innerText().catch(() => "");
        if (/비정상적인.*(접근|검색|트래픽)/.test(bodyText)) {
        await captureAndThrow(page, "PORTAL_CAPTCHA: 네이버 비정상 접근 감지", "PORTAL_CAPTCHA");
        }
    }
}

export async function assertNotBlocked(page: Page): Promise<void> {
    const url = page.url();

    // AKAMAI_CHALLENGE: 챌린지 iframe 존재 여부 (...)
    const challenge = await page
    .locator('iframe[src*="challenge"], #px-captcha')
    .count();
    if (challenge > 0) {
    await captureAndThrow(page, "AKAMAI_CHALLENGE 감지", "AKAMAI_CHALLENGE");
    }

    const bodyText = await page.locator("body").innerText().catch(() => "");

    // AKAMAI_BLOCK: Access Denied 페이지 (Akamai) / Sorry, you have been blocked (Cloudflare)
    // link.coupang.com에 머물러 있어도 이 페이지 자체가 차단 응답일 수 있으므로 SELECTOR_BUG보다 먼저 검사
    if (
        /Access Denied/i.test(bodyText) ||
        /Reference\s*[:#]\s*18\./.test(bodyText) ||
        /Sorry, you have been blocked/i.test(bodyText) ||
        /don't have permission to access this page/i.test(bodyText)
    ) {
    await captureAndThrow(page, "AKAMAI_BLOCK 감지", "AKAMAI_BLOCK");
    }

    // COUPANG_APP_BLOCK: RET9999
    if (/"rCode"\s*:\s*"RET9999"/.test(bodyText)) {
    await captureAndThrow(page, "COUPANG_APP_BLOCK(RET9999) 감지", "COUPANG_APP_BLOCK");
    }

    // SELECTOR_BUG: 위의 차단 신호 없이 link.coupang.com(애드 리다이렉트)에 머물러 있는 경우
    // → 리다이렉트가 아직 coupang.com까지 완료되지 않은 일시적 상태로 판단
    if (url.includes("link.coupang.com")) {
    await captureAndThrow(page, `SELECTOR_BUG: ${url}`, "SELECTOR_BUG");
    }
}