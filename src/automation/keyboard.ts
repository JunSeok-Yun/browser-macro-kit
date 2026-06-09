import { Page } from "patchright";
import { sleep } from "../utils";

export async function typeLikeHuman(page: Page, selector: string, text: string) {
  await page.waitForSelector(selector);
  const element = await page.$(selector);
  if (!element) throw new Error(`요소를 찾을 수 없음: ${selector}`);

  await element.click(); // 먼저 입력창 클릭
  await sleep(Math.random() * 500 + 300);

  // 한 글자씩 쪼개서 무작위 타이핑 지연 부여
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(Math.random() * 150 + 80); // 글자당 80ms~230ms 사이 딜레이
  }
  await sleep(500);
}

/** 검색창에 입력된 쿼리를 한 글자씩 Backspace로 지움 */
export async function clearSearchInput(page: Page, currentQuery: string) {
  await page.locator('input[name="q"]:visible').first().click();
  await sleep(Math.random() * 300 + 200);
  for (let i = 0; i < currentQuery.length; i++) {
    await page.keyboard.press("Backspace");
    await sleep(Math.random() * 80 + 40);
  }
  await sleep(Math.random() * 200 + 100);
}
