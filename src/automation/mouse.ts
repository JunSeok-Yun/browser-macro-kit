import { Page, Locator } from "patchright";
import { sleep, gaussianRandom } from "../utils";

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
    await sleep(gaussianRandom(11, 4, 3, 30));
  }

  // 오버슈트: 이동 방향 연장선으로 2~7px 지나쳤다가 복귀
  const dx = targetX - cp2x;
  const dy = targetY - cp2y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > 0) {
    const ovDist = Math.random() * 5 + 2;
    await page.mouse.move(
      targetX + (dx / len) * ovDist,
      targetY + (dy / len) * ovDist
    );
    await sleep(gaussianRandom(15, 5, 8, 35));
  }

  // 최종 클릭 위치: 중앙에서 ±3px 벗어남 (사람은 정중앙 클릭 안 함)
  const clickX = targetX + (Math.random() * 6 - 3);
  const clickY = targetY + (Math.random() * 6 - 3);
  await page.mouse.move(clickX, clickY);

  await sleep(gaussianRandom(200, 50, 100, 400));
  await page.mouse.down();
  await sleep(gaussianRandom(65, 20, 30, 130));
  await page.mouse.up();
}