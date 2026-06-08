import { Page, Locator } from "patchright";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

/** 3차 베지어 곡선 위의 한 점 좌표 계산 (t: 0~1 진행률) */
function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** 현재 위치에서 대상 요소까지 베지어 곡선 궤적으로 이동 후 클릭 */
async function moveMouseAlongCurveAndClick(page: Page, locator: Locator) {
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

/** 페이지에서 랜덤한 횟수/방향/거리로 스크롤하며 자연스럽게 체류 */
async function randomScrollDwell(page: Page) {
  const scrollCount = Math.floor(Math.random() * 4) + 2; // 2~5회

  for (let i = 0; i < scrollCount; i++) {
    const distance = Math.floor(Math.random() * 400) + 200; // 200~600px
    const goingUp = i > 0 && Math.random() < 0.15;          // 가끔 위로 스크롤
    await page.mouse.wheel(0, goingUp ? -distance : distance);
    await sleep(Math.random() * 1500 + 1000); // 1 ~ 2.5초 체류
  }
}

/**
 * 네이버를 경유하여 쿠팡으로 진입하는 로직
 */
async function runNaverGateway(page: Page) {
  console.log("[Gateway] 네이버를 통해 쿠팡 진입을 시도합니다.");
  await page.goto("https://www.naver.com");
  await sleep(2000);

  // 1. 네이버 메인 검색창 입력 및 엔터
  // 2026년 기준 네이버 메인 검색창 ID: #query
  await typeLikeHuman(page, "#query", "쿠팡");
  await page.keyboard.press("Enter");

  // DOM이 안정화될 때까지 대기
  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  console.log("[Debug] 현재 URL:", page.url()); // 구현 완료시 삭제 예정
  console.log("[Debug] 페이지 타이틀:", await page.title()); // 구현 완료시 삭제 예정

  console.log("[Gateway] 네이버 검색 결과에서 실제 이동 가능한 링크 요소를 탐색합니다.");

  // 2. 검색 결과 화면에서 쿠팡 공식 사이트 링크 클릭
  // 네이버 검색 결과 내 웹사이트 링크나 브랜드검색 영역 셀렉터 타겟팅
  // (안전하게 쿠팡 텍스트가 포함된 링크 요소를 찾아 곡선 효과 대용으로 자연스럽게 클릭)
  const coupangLink = page
    .locator(
      [
        'a.direct_link',
        'a[href*="coupang.com"]:not([href*="ader.naver.com"]):not([href*="link.coupang.com"])',
      ].join(", "),
    )
    .first();

  const elementCount = await coupangLink.count();
  console.log(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("네이버 검색 결과에서 쿠팡으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  const href = await coupangLink.getAttribute("href");
  console.log("[Debug] 클릭할 링크 href:", href);

  if (!href) throw new Error("링크 href를 찾을 수 없습니다.");

  console.log("[Gateway] 쿠팡으로 이동합니다...");
  await page.goto(href, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(4000);

  return page;
}

/**
 * 구글을 경유하여 쿠팡으로 진입하는 로직
 */
async function runGoogleGateway(page: Page): Promise<Page> {
  console.log("[Gateway] 구글을 통해 쿠팡 진입을 시도합니다.");

  await page.goto("https://www.google.com");
  // 포털 진입 후 인간형 가상 인터벌 부여 (봇 감지 완화)
  await page.waitForTimeout(Math.floor(Math.random() * 2000) + 3000);

  // 1. 구글 메인 검색창 입력 및 엔터 (최신 구글 메인 검색창은 textarea[name="q"])
  await typeLikeHuman(page, 'textarea[name="q"]', "쿠팡");
  await page.keyboard.press("Enter");

  // DOM 레이아웃이 화면에 완전히 그려질 때까지 대기
  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  console.log("[Gateway] 구글 검색 결과에서 실제 이동 가능한 쿠팡 링크 요소를 탐색합니다.");

  // 2. [핵심 변경] 구글이 href를 리다이렉트 주소로 숨겨도 화면의 텍스트와 레이아웃 구조로 저격합니다.
  // 구글 검색 결과의 대제목, 주소 텍스트, 혹은 영문 표기까지 아우르는 복합 선택자 구성
  const googleResultLink = page
    .locator(
      [
        'a:has-text("쿠팡")',
        'a:has-text("coupang.com")',
        'a:has(h3:has-text("쿠팡"))', // 구글 표준 검색 결과 타이틀 태그(h3) 조준
      ].join(", "),
    )
    .first();

  // 디버깅용 개수 체크
  const elementCount = await googleResultLink.count();
  console.log(`[Gateway] 구글 내 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("구글 검색 결과에서 쿠팡으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  const href = await googleResultLink.getAttribute("href");
  console.log("[Debug] 클릭할 링크 href:", href);

  console.log("[Gateway] 링크 클릭 후 새 탭(쿠팡)이 열리는 것을 추적합니다...");

  // 3. 클릭 및 새 탭 인스턴스 가로채기
  // 구글은 계정 세션이나 설정에 따라 현재 탭에서 이동할 수도 있고, 새 탭(_blank)으로 열릴 수도 있으므로 안전하게 대기
  await Promise.all([
    page.waitForLoadState("domcontentloaded", { timeout: 15000 }),
    googleResultLink.evaluate((el) => (el as HTMLElement).click()),
  ]);
  const newTabPage = page;

  // 4. 새로 열린 쿠팡 탭 로딩 대기
  console.log("[Gateway] 기존 탭(쿠팡) 로딩을 대기합니다...");
  await newTabPage.waitForLoadState("load");
  await sleep(4000); // 쿠팡 메인화면 UI가 완전히 그려질 때까지 대기

  return newTabPage;
}

/** 찾아 들어갈 특정 상품 정보 (판매처/브랜드 + 상품 종류). 어떤 상품이든 이 형태로 지정 */
interface ProductTarget {
  brand: string;       // 판매처/브랜드명 (예: "LG전자")
  keyword: string;     // 상품 종류/특징 키워드 (예: "노트북")
  productId?: string;  // 장기 추적용 정밀 식별자 (/vp/products/{이 숫자})
}

/** 상품종류 / 브랜드 / 조합 중 하나를 무작위로 골라 검색어로 사용 (검색 패턴 다양화) */
function buildSearchQuery(target: ProductTarget): string {
  const candidates = [
    target.keyword,
    target.brand,
    `${target.brand} ${target.keyword}`,
  ];
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** 상품 링크 href에서 productId(/vp/products/ 뒤 숫자)를 추출 */
function extractProductId(href: string): string | null {
  const match = href.match(/\/vp\/products\/(\d+)/);
  return match ? match[1] : null;
}
/** productId 정밀 매칭을 1순위로, 실패 시 브랜드+키워드 fuzzy 매칭으로 폴백 */
async function findTargetProduct(page: Page, target: ProductTarget): Promise<Locator | null> {
const productLinks = page.locator('a[href*="/vp/products/"]').filter({ hasNotText: "광고" });

  // 1순위: productId로 정밀 매칭 — vendorItemId(=data-id)와 달리 장기적으로 안정적인 식별자
  if (target.productId) {
    const hrefs = await productLinks.evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? "")
    );
    const exactIndex = hrefs.findIndex((href) => extractProductId(href) === target.productId);
    if (exactIndex !== -1) return productLinks.nth(exactIndex);
  }

  // 2순위: 브랜드+키워드 fuzzy 매칭 (productId가 없거나, 결과 페이지에 없을 때 폴백)
  const texts = await productLinks.allInnerTexts();
  const fuzzyIndex = texts.findIndex((raw) => {
    const text = raw.replace(/\s+/g, " ");
    return text.includes(target.brand) && text.includes(target.keyword);
  });

  return fuzzyIndex === -1 ? null : productLinks.nth(fuzzyIndex);
}


/**
 * 쿠팡 메인 진입 후 검색 → 상품 클릭까지 이어지는 행동 시퀀스
 */
async function runCoupangSearchFlow(page: Page, target: ProductTarget) {
  const query = buildSearchQuery(target);
  console.log(`[Behavior] 쿠팡 검색을 시작합니다: "${query}" (타겟: ${target.brand} ${target.keyword})`);

  // 검색창: name="q"인 input이 데스크탑/태블릿 두 form에 중복 존재 → :visible로 보이는 것만 타겟팅
  await typeLikeHuman(page, 'input[name="q"]:visible', query);
  await page.keyboard.press("Enter");

  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  await randomScrollDwell(page);   // ← 검색 결과 페이지 둘러보기
  console.log(`[Behavior] 검색 결과에서 타겟 상품(${target.brand} / ${target.keyword})을 탐색합니다.`);

  const productLink = await findTargetProduct(page, target);
  if (!productLink) {
    throw new Error(`검색 결과에서 타겟 상품(${target.brand} ${target.keyword})을 찾지 못했습니다.`);
  }

  console.log("[Behavior] 상품 페이지로 이동합니다.");
// 상품 링크는 target="_blank" → 클릭 시 새 탭(Page)이 열림. 클릭과 동시에 새 탭 이벤트를 캡처해야 함
  const [productPage] = await Promise.all([
    page.context().waitForEvent("page"),
    moveMouseAlongCurveAndClick(page, productLink),
  ]);

  await productPage.waitForLoadState("domcontentloaded");
  await sleep(4000);
  await randomScrollDwell(productPage);   // ← 새로 열린 상품 탭에서 스크롤
}

/**
 * 외부(index.ts)에서 호출할 메인 게이트웨이 통합 함수
 */
export async function runPortalGateway(page: Page) {
  // 50%의 확률로 네이버 혹은 구글 선택 분기
  const isNaver = Math.random() < 0.5;

  try {
    const targetPage = isNaver ? await runNaverGateway(page) : await runGoogleGateway(page);
    await sleep(3000);

    // 최종 검증: 쿠팡에 잘 도달했는지 URL 검사
    const currentUrl = targetPage.url();
    if (currentUrl.includes("coupang.com")) {
      console.log(`[Success] 쿠팡 진입 성공! 현재 URL: ${currentUrl}`);
      await runCoupangSearchFlow(targetPage, { brand: "도드람", keyword: "한돈", productId: "188172341" });
      return true;
    } else {
      console.log(`[Fail] 다른 페이지로 이탈됨: ${currentUrl}`);
      return false;
    }
  } catch (error) {
    console.error("[Error] 게이트웨이 구동 중 에러 발생:", error);
    return false;
  }
}
