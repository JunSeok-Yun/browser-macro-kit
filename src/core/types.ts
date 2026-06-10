export interface ProductItem {
  productId: string;
  exactNames: string[];
  keywords: string[];
}

export interface ProductTarget {
  brand: string;
  products: ProductItem[];
}
