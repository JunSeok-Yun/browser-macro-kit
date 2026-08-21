import { Page } from "patchright";
import { sleep, gaussianRandom } from "../utils";

export async function typeLikeHuman(page: Page, selector: string, text: string) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  if (!element) throw new Error(`요소를 찾을 수 없음: ${selector}`);

  await element.click();
  await sleep(gaussianRandom(400, 80, 200, 750)); // 클릭 후 입력 전 인지 지연

  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(gaussianRandom(120, 35, 40, 420)); // 120ms 중심 정규분포
  }
  await sleep(gaussianRandom(450, 80, 280, 700));
}

/** 검색창 내용을 전체 선택 후 삭제 */
export async function clearSearchInput(page: Page) {
  const input = await page.$('input[name="q"]:visible');
  if (!input) return;
  await input.click();
  await sleep(gaussianRandom(250, 50, 120, 450));
  await page.keyboard.press("Control+A");
  await sleep(gaussianRandom(75, 20, 30, 150));
  await page.keyboard.press("Delete");
  await sleep(gaussianRandom(150, 40, 60, 300));
}
