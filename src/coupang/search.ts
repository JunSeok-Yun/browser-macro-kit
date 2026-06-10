import { Page, Locator } from "patchright";
import { ProductTarget, ProductItem } from "../core/types";
import { getQueryFailCount } from "../infra/db";

export function buildSearchQuery(
  target: ProductTarget,
  exclude: Set<string> = new Set()
): { query: string; product: ProductItem } | null {
  const pairs: { query: string; product: ProductItem }[] = [];

  for (const product of target.products) {
    const candidates = [
      target.brand,
      ...product.keywords.map(k => `${target.brand} ${k}`),
    ]
      .filter((q, i, arr) => arr.indexOf(q) === i)
      .filter(q => !exclude.has(q));

    for (const query of candidates) {
      pairs.push({ query, product });
    }
  }

  if (pairs.length === 0) return null;
  // fail_count가 낮을수록 선택 확률이 높아지는 가중 랜덤
  const weights = pairs.map(p => 1 / (1 + getQueryFailCount(p.query)));
  const total = weights.reduce((sum, w) => sum + w, 0);

  let r = Math.random() * total;
  for (let i = 0; i < pairs.length; i++) {
    r -= weights[i];
    if (r <= 0) return pairs[i];
  }
  return pairs[pairs.length - 1];
}

export function extractProductId(href: string): string | null {
  const match = href.match(/\/vp\/products\/(\d+)/);
  return match ? match[1] : null;
}

export function normalizeProductText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

export async function findTargetProduct(page: Page, product: ProductItem): Promise<Locator | null> {
  const productLinks = page.locator('a[href*="/vp/products/"]').filter({ hasNotText: "광고" });
  const hrefs = await productLinks.evaluateAll((els) =>
    els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
  );
  const texts = await productLinks.allInnerTexts();
  const normalizedTexts = texts.map(normalizeProductText);

  // exactNames를 랜덤 순서로 하나씩 시도 — 매 실행마다 다른 옵션으로 진입
  const shuffledNames = [...product.exactNames].sort(() => Math.random() - 0.5);

  for (const name of shuffledNames) {
    // 1순위: productId 후보군 → exactName 정밀 매칭
    const candidateIndexes = hrefs
      .map((href, i) => (extractProductId(href) === product.productId ? i : -1))
      .filter(i => i !== -1);

    if (candidateIndexes.length > 0) {
      const matched = candidateIndexes.find(i => normalizedTexts[i].includes(name));
      if (matched !== undefined) return productLinks.nth(matched);
    }

    // 2순위: productId 변경됐을 때 복구 — exactName 단독 매칭
    const exactIndex = normalizedTexts.findIndex(text => text.includes(name));
    if (exactIndex !== -1) return productLinks.nth(exactIndex);
  }

  return null;
}
