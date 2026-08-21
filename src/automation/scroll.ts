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

/**
 * 상품 페이지를 끝까지 스크롤 (20~30초 소요).
 * "상품정보 더보기" 클릭 후 늘어나는 페이지 높이에 대응하여
 * 매 스텝마다 pageHeight를 재측정.
 */
export async function deepScrollToBottom(page: Page): Promise<void> {
  for (let i = 0; i < 150; i++) { // 역방향 스텝 보정으로 120 → 150
    const { scrollY, pageHeight, viewportHeight } = await page.evaluate(() => ({
      scrollY: window.scrollY,
      pageHeight: document.body.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

    if (scrollY + viewportHeight >= pageHeight - 300) break;

    // 15% 확률로 위로 스크롤 (최상단 근처는 제외)
    const goingUp = scrollY > 500 && Math.random() < 0.15;

    // 위로 갈 땐 더 짧게 (100~250px) → 전체 방향은 아래로 수렴
    const step = goingUp
      ? Math.floor(Math.random() * 150) + 100
      : Math.floor(Math.random() * 200) + 150;

    await page.mouse.wheel(0, goingUp ? -step : step);

    const r = Math.random();
    if (r < 0.15) {
      await sleep(Math.random() * 800 + 700);
    } else if (r < 0.50) {
      await sleep(Math.random() * 400 + 300);
    } else {
      await sleep(Math.random() * 150 + 100);
    }
  }
}

