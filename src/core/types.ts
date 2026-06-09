export interface ProductItem {
  productId: string;
  exactName: string;
}

export interface ProductTarget {
  brand: string;
  keywords: string[];
  products: ProductItem[];
}
