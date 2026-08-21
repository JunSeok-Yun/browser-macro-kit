import { Locator } from "patchright";

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

export interface Job {
  id: number;
  category: string;
  targetCount: number;
  completedCount: number;
  status: "running" | "done";
}

export interface FoundProduct {
  locator: Locator;
  matchedName: string;
}