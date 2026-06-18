export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Box-Muller 변환을 이용한 정규분포 난수 생성 */
export function gaussianRandom(mean: number, stdDev: number, min = 0, max = Infinity): number {
  const u1 = Math.random() || Number.EPSILON; // log(0) 방지
  const u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.min(max, Math.max(min, mean + stdDev * z));
}
