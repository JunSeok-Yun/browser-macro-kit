import { Page, Locator } from "patchright";
import { sleep } from "../utils";

/** 3차 베지어 곡선 위의 한 점 좌표 계산 (t: 0~1 진행률) */
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** 현재 위치에서 대상 요소까지 베지어 곡선 궤적으로 이동 후 클릭 */
export async function moveMouseAlongCurveAndClick(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("요소의 위치 정보를 가져올 수 없음 (보이지 않는 요소일 가능성)");

  const targetX = box.x + box.width / 2;
  const targetY = box.y + box.height / 2;

  // Patchright는 현재 커서 좌표를 노출하지 않으므로 임의의 시작점에서 출발
  const startX = Math.random() * 300 + 50;
  const startY = Math.random() * 300 + 50;

  // 제어점 2개를 매번 무작위로 흔들어 곡선 모양을 다르게 생성
  const cp1x = startX + (targetX - startX) * (0.3 + Math.random() * 0.2);
  const cp1y = startY + (targetY - startY) * (Math.random() * 0.4);
  const cp2x = startX + (targetX - startX) * (0.6 + Math.random() * 0.2);
  const cp2y = targetY - (targetY - startY) * (Math.random() * 0.4);

  const steps = 30;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = bezierPoint(t, startX, cp1x, cp2x, targetX);
    const y = bezierPoint(t, startY, cp1y, cp2y, targetY);
    await page.mouse.move(x, y);
    await sleep(Math.random() * 15 + 8);
  }

  await sleep(Math.random() * 200 + 150);
  await page.mouse.down();
  await sleep(Math.random() * 80 + 40);
  await page.mouse.up();
}