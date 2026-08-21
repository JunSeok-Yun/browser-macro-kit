import * as fs from "fs";
import * as path from "path";
import { BrowserContext, Page } from "patchright";
import { ENV } from "../config/env";
import * as logger from "./logger";

/**
 * 컨텍스트의 모든 탭(기존 + 새 탭)에 coupang 요청 캡처 리스너 연결.
 * LOG_BEACONS=false면 즉시 no-op 반환.
 * @returns flush 함수 — 세션 종료 시 호출하면 network-logs/ 에 저장
 */
export function attachNetworkCapture(
    context: BrowserContext,
    slot: number
): () => void {
    if (!ENV.LOG_BEACONS) return () => {};

    const networkLog: object[] = [];

    const listen = (page: Page) => {
        page.on("request", request => {
            const url = request.url();
            if (!url.includes("coupang")) return;
            const entry: any = {
                time: new Date().toISOString(),
                method: request.method(),
                url,
            };
            if (request.method() === "POST") {
                try { entry.body = JSON.parse(request.postData() ?? "{}"); }
                catch { entry.rawBody = request.postData()?.substring(0, 300); }
            }
            networkLog.push(entry);
        });
    };

    // 이미 열린 탭 + 이후 열리는 새 탭 모두 캡처
    context.pages().forEach(listen);
    context.on("page", listen);

    return () => {
        if (networkLog.length === 0) return;
        const dir = path.join(process.cwd(), "network-logs");
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const logPath = path.join(dir, `session_slot${slot}_${Date.now()}.json`);
        fs.writeFileSync(logPath, JSON.stringify(networkLog, null, 2));
        logger.info(`[Network] 캡처 저장: ${logPath} (${networkLog.length}건)`, {
            event: "NETWORK_CAPTURE_SAVED",
            slot,
            count: networkLog.length,
            path: logPath,
        });
    };
}
