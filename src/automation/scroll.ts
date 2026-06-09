import { sleep } from "../utils";
import { Page } from "patchright";

/** 페이지에서 랜덤한 횟수/방향/거리로 스크롤하며 자연스럽게 체류 */
export async function randomScrollDwell(page: Page) {
  const scrollCount = Math.floor(Math.random() * 4) + 2; // 2~5회

  for (let i = 0; i < scrollCount; i++) {
    const distance = Math.floor(Math.random() * 400) + 200; // 200~600px
    const goingUp = i > 0 && Math.random() < 0.15;          // 가끔 위로 스크롤
    await page.mouse.wheel(0, goingUp ? -distance : distance);
    await sleep(Math.random() * 1500 + 1000); // 1 ~ 2.5초 체류
  }
}

/** 검색 결과 페이지에서 자연스럽게 최상단으로 스크롤 */
export async function scrollToTop(page: Page) {
  const scrollY = await page.evaluate(() => window.scrollY);
  if (scrollY === 0) return;

  const steps = Math.ceil(scrollY / 350);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, -350);
    await sleep(Math.random() * 200 + 100);
  }
  await sleep(Math.random() * 400 + 200);
}