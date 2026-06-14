export interface ProductItem {
  productId: string;
  category: string;
  exactNames: string[];
  keywords: string[];
}

export interface ProductTarget {
  brand: string;
  products: ProductItem[];
}
