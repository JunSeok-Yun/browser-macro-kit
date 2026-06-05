import { Page } from "patchright";

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
        'a[href*="coupang.com"]:not([href*="ader.naver.com"])',
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
 * TODO: 가정용 프록시 연동하고 난 다음 다시 해당 로직 검증 필요 => 현재는 봇 탐지에 걸림
 * Playwright의 browser.newContext()를 실행하면, 쿠키와 캐시가 단 1바이트도 존재하지 않는 "태초의 순수한 브라우저" 상태로 열리기 때문
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
