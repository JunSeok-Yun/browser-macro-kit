import { Page } from "patchright";
import * as fs from "fs";
import * as path from "path";

const CREEPJS_URL = "https://abrahamjuliot.github.io/creepjs/";

/**
 * CreepJS 진입 후 지문 분석 완료를 대기하고 페이지 전체 텍스트를 파일로 저장한다.
 */
export async function checkCreepJSTrust(page: Page, waitTimeMs: number = 15000): Promise<string> {
  console.log("[CreepJS] CreepJS 사이트로 이동합니다.");
  await page.goto(CREEPJS_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

  console.log(`[CreepJS] 지문 분석 결과를 대기 중입니다... (${waitTimeMs / 1000}초)`);
  await page.waitForTimeout(waitTimeMs);

  const resultText = await page.locator("body").innerText();

  const outputPath = path.resolve(process.cwd(), "creepjs-result.txt");
  fs.writeFileSync(outputPath, resultText, "utf-8");
  console.log(`[CreepJS] 분석 결과를 텍스트로 저장했습니다: ${outputPath}`);

  return resultText;
}
