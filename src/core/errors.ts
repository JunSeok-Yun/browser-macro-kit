export class ProductNotFoundError extends Error {
  constructor(
    message: string,
    public readonly usedQueries: Set<string>,
    public readonly exhausted: boolean = false
  ) {
    super(message);
    this.name = "ProductNotFoundError";
  }
}

/** 포털 검색 결과에서 타겟 링크를 찾지 못한 경우 — 광고 노출 변동성 등으로 프록시/프로필과는 무관 */
export class NoLinkFoundError extends Error {
  constructor(message: string, public readonly htmlPath: string | null = null) {
    super(message);
    this.name = "NoLinkFoundError";
  }
}

export type BlockType =
  | "SELECTOR_BUG"
  | "AKAMAI_BLOCK"      // Akamai JS 챌린지 — 5초 대기 후 재진입으로 해결 가능
  | "AKAMAI_IP_BLOCK"   // Cloudflare/Akamai IP 블랙리스트 — 프록시 교체 필요
  | "COUPANG_APP_BLOCK"
  | "AKAMAI_CHALLENGE"
  | "PORTAL_CAPTCHA"
  | "PROXY_ERROR"
  | "HTTP_ERROR";

  export class BlockDetectedError extends Error {
  constructor(message: string, public readonly type: BlockType, public readonly htmlPath: string | null = null) {
    super(message);
    this.name = "BlockDetectedError";
  }
}
