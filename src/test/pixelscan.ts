import { Page } from "patchright";
import { typeLikeHuman } from "../automation/keyboard";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 네이버를 경유하여 pixelscan으로 진입하는 로직
 */
async function testNaverGateway(page: Page): Promise<Page> {
  console.log("[Gateway] 네이버를 통해 pixelscan 진입을 시도합니다.");
  await page.goto("https://www.naver.com");
  await sleep(2000);

  // 1. 네이버 메인 검색창 입력 및 엔터
  await typeLikeHuman(page, "#query", "pixelscan");
  await page.keyboard.press("Enter");

  // DOM이 안정화될 때까지 대기
  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  console.log("[Gateway] 네이버 검색 결과에서 실제 이동 가능한 링크 요소를 탐색합니다.");

  // 2. [핵심 변경] 네이버가 href를 암호화하더라도, 화면에 노출된 'pixelscan.net' 텍스트 링크를 정확히 지정합니다.
  // 실제 이동용 텍스트 링크나 타이틀 링크를 다각도로 잡을 수 있도록 우선순위 큐(OR 조건) 형태로 선택자를 구성합니다.
  const pixelscanLink = page
    .locator(
      [
        'a:has-text("pixelscan.net")', // 1순위: 주소창 형태의 텍스트를 가진 링크
        'a:has-text("Pixelscan")', // 2순위: 대문자가 포함된 타이틀 링크
        '.link_site:has-text("pixelscan")', // 3순위: 네이버 웹사이트 섹션 전용 클래스
      ].join(", "),
    )
    .first(); // 매칭되는 것 중 가장 첫 번째 요소 선택

  // 디버깅용 로그: 요소를 제대로 찾았는지 개수 체크
  const elementCount = await pixelscanLink.count();
  console.log(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("네이버 검색 결과에서 pixelscan으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  console.log("[Gateway] 링크 클릭 후 새 탭(픽셀스캔)이 열리는 것을 추적합니다...");

  // 3. 클릭 및 새 탭 인스턴스 낚아채기
  const [newTabPage] = await Promise.all([
    page.context().waitForEvent("page"), // 새 탭 오픈 이벤트 리스너 가동
    pixelscanLink.click(), // 찾은 링크 클릭
  ]);

  // 4. 새로 열린 픽셀스캔 탭 로딩 대기
  console.log("[Gateway] 새 탭 로딩을 대기합니다...");
  await newTabPage.waitForLoadState("load");
  await sleep(4000); // 픽셀스캔 메인화면 UI가 완전히 그려질 때까지 넉넉히 대기

  return newTabPage;
}

async function testNaverToGoogleGateway(page: Page) {
  console.log("[Gateway] 네이버 -> 구글을 통해 pixelscan 진입을 시도합니다.");
  await page.goto("https://www.naver.com");
  await sleep(2000);

  // 1. 구글 메인 검색창 입력 및 엔터 (구글 메인 검색창 name="q")
  await typeLikeHuman(page, "#query", "google");
  await page.keyboard.press("Enter");

  // DOM이 안정화될 때까지 대기
  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  console.log("[Gateway] 네이버 검색 결과에서 실제 이동 가능한 링크 요소를 탐색합니다.");

  // 2. [핵심 변경] 네이버가 href를 암호화하더라도, 화면에 노출된 'pixelscan.net' 텍스트 링크를 정확히 지정합니다.
  // 실제 이동용 텍스트 링크나 타이틀 링크를 다각도로 잡을 수 있도록 우선순위 큐(OR 조건) 형태로 선택자를 구성합니다.
  const googleLink = page
    .locator(
      [
        'a:has-text("google.com")', // 1순위: 주소창 형태의 텍스트를 가진 링크
        'a:has-text("Google")', // 2순위: 대문자가 포함된 타이틀 링크
        '.link_site:has-text("google.com")', // 3순위: 네이버 웹사이트 섹션 전용 클래스
      ].join(", "),
    )
    .first(); // 매칭되는 것 중 가장 첫 번째 요소 선택

  // 디버깅용 로그: 요소를 제대로 찾았는지 개수 체크
  const elementCount = await googleLink.count();
  console.log(`[Gateway] 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("네이버 검색 결과에서 google으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  console.log("[Gateway] 링크 클릭 후 새 탭(구글)이 열리는 것을 추적합니다...");

  // 3. 클릭 및 새 탭 인스턴스 낚아채기
  const newTabPromise = page.context().waitForEvent("page");
  await googleLink.click();
  const newTabPage = await Promise.race([newTabPromise, page.waitForURL("**/google.com/**").then(() => page)]);

  // 4. 새로 열린 구글 탭 로딩 대기
  console.log("[Gateway] 새 탭 로딩을 대기합니다...");
  await newTabPage.waitForLoadState("load");
  await sleep(4000); // 구글 메인화면 UI가 완전히 그려질 때까지 넉넉히 대기

  return await testGoogleGateway(newTabPage); // 구글에서 pixelscan으로 진입하는 로직 추가 호출
}

async function testGoogleGateway(page: Page) {
  console.log("[Gateway] 구글을 통해 pixelscan 진입을 시도합니다.");
  // 1. 구글 메인 검색창 입력 및 엔터 (구글 메인 검색창 name="q")
  await typeLikeHuman(page, 'textarea[name="q"]', "pixelscan");
  await page.keyboard.press("Enter");

  await page.waitForLoadState("domcontentloaded");
  await sleep(3000);

  console.log("[Gateway] 구글 검색 결과에서 실제 이동 가능한 쿠팡 링크 요소를 탐색합니다.");

  // 2. [핵심 변경] 구글이 href를 리다이렉트 주소로 숨겨도 화면의 텍스트와 레이아웃 구조로 저격합니다.
  // 구글 검색 결과의 대제목, 주소 텍스트, 혹은 영문 표기까지 아우르는 복합 선택자 구성
  const googleResultLink = page
    .locator(
      [
        'a:has-text("pixelscan.net")', // 1순위: 주소창 형태의 텍스트를 가진 링크
        'a:has-text("Pixelscan")', // 2순위: 대문자가 포함된 타이틀 링크
        '.link_site:has-text("pixelscan")', // 3순위: 네이버 웹사이트 섹션 전용 클래스
      ].join(", "),
    )
    .first();

  // 디버깅용 개수 체크
  const elementCount = await googleResultLink.count();
  console.log(`[Gateway] 구글 내 매칭된 링크 요소 개수: ${elementCount}개`);

  if (elementCount === 0) {
    throw new Error("구글 검색 결과에서 쿠팡으로 이동할 수 있는 링크를 찾지 못했습니다. 셀렉터 확인 필요.");
  }

  console.log("[Gateway] 링크 클릭 후 새 탭(pixelscan)이 열리는 것을 추적합니다...");

  // 3. 클릭 및 새 탭 인스턴스 가로채기
  // 구글은 계정 세션이나 설정에 따라 현재 탭에서 이동할 수도 있고, 새 탭(_blank)으로 열릴 수도 있으므로 안전하게 대기
  const newTabPromise = page.context().waitForEvent("page");
  await googleResultLink.click();

  const pixelscanPage = await Promise.race([
    newTabPromise,
    page.waitForURL("**/pixelscan.net/**").then(() => page), // behavior.ts
    // test.ts는 coupang.com 대신 pixelscan.net 으로 변경
  ]);

  // 4. 새로 열린 쿠팡 탭 로딩 대기
  console.log("[Gateway] 새 탭(pixelscan) 로딩을 대기합니다...");
  await pixelscanPage.waitForLoadState("load");
  await sleep(4000); // 쿠팡 메인화면 UI가 완전히 그려질 때까지 대기

  return pixelscanPage;
}

/**
 * 외부(index.ts)에서 호출할 메인 게이트웨이 통합 테스트 함수
 */

export async function testPortalGateway(page: Page) {
  //   const isNaver = Math.random() < 0.5;
  try {
    // if (isNaver) {
    //   await testNaverGateway(page);
    // } else {
    //   await testGoogleGateway(page);
    // }

    const targetPage = await testNaverGateway(page);

    // const targetPage = await testNaverToGoogleGateway(page);

    if (!targetPage) {
      console.log("[Fail] 최종 페이지가 확보되지 않았습니다.");
      return null;
    }

    // 최종 검증: pixelscan에 잘 도달했는지 URL 검사
    const currentUrl = targetPage.url();
    if (currentUrl.includes("pixelscan")) {
      console.log(`[Success] Pixelscan 진입 성공! 현재 URL: ${currentUrl}`);
      return targetPage;
    } else {
      console.log(`[Fail] 다른 페이지로 이탈됨: ${currentUrl}`);
      return null;
    }
  } catch (error) {
    console.error("[Error] 게이트웨이 구동 중 에러 발생:", error);
    return null;
  }
}
