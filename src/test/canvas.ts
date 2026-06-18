import { Page } from "patchright";
import * as fs from "fs";
import * as path from "path";

export async function checkCanvasFingerprint(page: Page, slot: number, waitTimeMs: number = 8000): Promise<void> {
    console.log(`[Canvas] slot-${slot} 지문 측정 시작...`);

    // ── 자체 캔버스 테스트 (addInitScript 가 prototype 을 정상 패치했는지 직접 검증) ──
    await page.goto("https://browserleaks.com/canvas", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(waitTimeMs);

    // ── 자체 캔버스 테스트 ──
    // addInitScript 가 실행된 main world 에서 직접 캔버스를 만들어 호출
    // (page as any).evaluate(fn, undefined, false) → undefined arg + false = main world
    const selfTestDataURL = await (page as any).evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 400; c.height = 100;
        const ctx = c.getContext('2d');
        if (!ctx) return 'no-ctx';
        ctx.fillStyle = '#ff0000';
        ctx.font = '18px Arial';
        ctx.fillText('CanvasNoise Test 2026', 10, 50);
        return c.toDataURL();
    }, undefined, false);
    const selfTestSig = selfTestDataURL.slice(-40);

        // 실제 페이지에서 패치 상태 확인
    const diag = await (page as any).evaluate(() => ({
        initStep:           (window as any).__initStep__          ?? "never_ran",
        patchMethod:        (window as any).__canvasPatchMethod__ ?? "not_set",
        isToDataURLPatched: HTMLCanvasElement.prototype.toDataURL.toString().includes("putImageData"),
        isGetImageDataPatched: CanvasRenderingContext2D.prototype.getImageData.toString().includes("applyNoise"),
    }), undefined, false);  // ← false = main world

    const resultText = await page.locator("body").innerText();
    const sig = resultText.match(/Signature\s+([A-F0-9]{32})/)?.[1] ?? "not_found";

    const timestamp = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
    const output = [
        `[${timestamp}] slot-${slot}`,
        `  initStep    : ${diag.initStep}`,
        `  patchMethod : ${diag.patchMethod}`,
        `  toDataURL   : ${diag.isToDataURLPatched ? "patched" : "NOT patched"}`,
        `  selfTest sig: ${selfTestSig}`,   // ← 추가
        `  BL Signature: ${sig}`,
        "─".repeat(50),
    ].join("\n");

    const outputPath = path.resolve(process.cwd(), "canvas-fingerprint.txt");
    fs.appendFileSync(outputPath, output + "\n", "utf-8");

    console.log(`[Canvas] initStep   : ${diag.initStep}`);
    console.log(`[Canvas] patchMethod: ${diag.patchMethod}`);
    console.log(`[Canvas] toDataURL  : ${diag.isToDataURLPatched ? "patched ✓" : "NOT patched ✗"}`);
    console.log(`[Canvas] selfTest   : ${selfTestSig}`);   // ← 추가
    console.log(`[Canvas] Signature  : ${sig}`);
    console.log(`[Canvas] 결과 저장: ${outputPath}`);
}
