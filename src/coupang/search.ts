import { Page, Locator } from "patchright";
import { ProductTarget } from "../core/types";

/** 상품종류 / 브랜드 / 조합 중 하나를 무작위로 골라 검색어로 사용 (검색 패턴 다양화) */
export function buildSearchQuery(target: ProductTarget, exclude: Set<string> = new Set()): string | null {
  const candidates = [
    target.brand,
    ...target.keywords,
    ...target.keywords.map(k => `${target.brand} ${k}`),
  ]
    .filter((q, i, arr) => arr.indexOf(q) === i)  // 중복 제거
    .filter(q => !exclude.has(q));

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** 상품 링크 href에서 productId(/vp/products/ 뒤 숫자)를 추출 */
export function extractProductId(href: string): string | null {
  const match = href.match(/\/vp\/products\/(\d+)/);
  return match ? match[1] : null;
}

/** 상품명 텍스트의 줄바꿈/연속 공백을 정리해 비교를 안정화 */
export function normalizeProductText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * 상품 식별 우선순위: ① productId(+exactName)로 후보군을 좁혀 정밀 매칭
 * → ② exactName 단독 매칭(productId가 없거나 바뀌었을 때의 복구 경로)
 * → ③ 정밀 식별자를 하나도 안 줬을 때만 — 브랜드+키워드 fuzzy 매칭
 *
 * productId/exactName처럼 정밀 식별자를 지정했는데도 매칭에 실패했다면,
 * fuzzy로 넘어가 엉뚱한 상품을 잘못 고르느니 "이번 결과엔 없음(null)"으로 판단해
 * 호출 측(runCoupangSearchFlow)이 다른 검색어로 재시도하도록 한다.
 */
export async function findTargetProduct(page: Page, target: ProductTarget): Promise<Locator | null> {
  const productLinks = page.locator('a[href*="/vp/products/"]').filter({ hasNotText: "광고" });
  const hrefs = await productLinks.evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  const texts = await productLinks.allInnerTexts();
  const normalizedTexts = texts.map(normalizeProductText);

  // products 배열을 섞어서 랜덤 순서로 탐색 — 특정 상품에 패턴이 고정되지 않도록
  const shuffled = [...target.products].sort(() => Math.random() - 0.5);

  for (const product of shuffled) {
    // 1순위: productId 후보군 → exactName 정밀 매칭
    const candidateIndexes = hrefs
      .map((href, i) => (extractProductId(href) === product.productId ? i : -1))
      .filter(i => i !== -1);

    if (candidateIndexes.length > 0) {
      const matched = candidateIndexes.find(i => normalizedTexts[i].includes(product.exactName));
      if (matched !== undefined) return productLinks.nth(matched);
    }

    // 2순위: productId 변경됐을 때 복구 — exactName 단독 매칭
    const exactIndex = normalizedTexts.findIndex(text => text.includes(product.exactName));
    if (exactIndex !== -1) return productLinks.nth(exactIndex);
  }

  return null;
}