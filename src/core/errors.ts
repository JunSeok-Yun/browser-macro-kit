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
