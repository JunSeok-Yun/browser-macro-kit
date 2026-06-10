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

export type BlockType =
  | "SELECTOR_BUG"
  | "AKAMAI_BLOCK"
  | "COUPANG_APP_BLOCK"
  | "AKAMAI_CHALLENGE"
  | "PROXY_ERROR"
  | "HTTP_ERROR";

  export class BlockDetectedError extends Error {
  constructor(message: string, public readonly type: BlockType) {
    super(message);
    this.name = "BlockDetectedError";
  }
}
