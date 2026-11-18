import apiClient from './client';

export interface ProductCategory {
  _id: string;
  name: string;
  parentId?: string | null;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface ProductVariant {
  _id: string;
  productId: string;
  attributes: Record<string, string>;
  sku: string;
  barcode: string;
  costPriceCents: number;
  unitPriceCents: number;
  stockQuantity: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  categoryId?: string | null;
  categoryName?: string;
  description: string;
  unit: string;
  vatRate: number;
  isService: boolean;
  hasVariants: boolean;
  variantAttributes: string[];
  costPriceCents: number;
  defaultUnitPriceCents: number;
  stockQuantity: number;
  lowStockThreshold: number;
  barcode: string;
  isActive: boolean;
  notes: string;
  variantCount?: number;
  totalStock?: number;
  variants?: ProductVariant[];
}

export interface PriceList {
  _id: string;
  name: string;
  description: string;
  isDefault: boolean;
  discountPercent: number;
  currency: string;
  isActive: boolean;
  entryCount?: number;
  customerCount?: number;
}

export interface PriceListEntry {
  _id: string;
  priceListId: string;
  productId: string;
  productName?: string;
  productSku?: string;
  variantId?: string | null;
  variantSku?: string;
  variantAttribs?: Record<string, string>;
  unitPriceCents: number;
  minQty: number;
}

export interface PriceListDetail extends PriceList {
  entries: PriceListEntry[];
  customers: Array<{ _id: string; companyName: string; customerNumber: string }>;
}

export const productsApi = {
  // categories
  listCategories: () =>
    apiClient.get<ProductCategory[]>('/products/categories').then(r => r.data),
  createCategory: (data: Partial<ProductCategory>) =>
    apiClient.post<ProductCategory>('/products/categories', data).then(r => r.data),
  updateCategory: (id: string, data: Partial<ProductCategory>) =>
    apiClient.patch<ProductCategory>(`/products/categories/${id}`, data).then(r => r.data),
  deleteCategory: (id: string) =>
    apiClient.delete(`/products/categories/${id}`).then(r => r.data),

  // products
  list: (params?: Record<string, string>) =>
    apiClient.get<Product[]>('/products', { params }).then(r => r.data),
  get: (id: string) =>
    apiClient.get<Product>(`/products/${id}`).then(r => r.data),
  create: (data: Partial<Product>) =>
    apiClient.post<Product>('/products', data).then(r => r.data),
  update: (id: string, data: Partial<Product>) =>
    apiClient.patch<Product>(`/products/${id}`, data).then(r => r.data),
  deactivate: (id: string) =>
    apiClient.delete(`/products/${id}`).then(r => r.data),
  stockAdjust: (id: string, delta: number, reason?: string) =>
    apiClient.post(`/products/${id}/stock-adjust`, { delta, reason }).then(r => r.data),

  // variants
  listVariants: (productId: string) =>
    apiClient.get<ProductVariant[]>(`/products/${productId}/variants`).then(r => r.data),
  createVariant: (productId: string, data: Partial<ProductVariant>) =>
    apiClient.post<ProductVariant>(`/products/${productId}/variants`, data).then(r => r.data),
  bulkSetVariants: (productId: string, variants: Partial<ProductVariant>[]) =>
    apiClient.put<ProductVariant[]>(`/products/${productId}/variants`, { variants }).then(r => r.data),
  updateVariant: (productId: string, variantId: string, data: Partial<ProductVariant>) =>
    apiClient.patch<ProductVariant>(`/products/${productId}/variants/${variantId}`, data).then(r => r.data),
  deleteVariant: (productId: string, variantId: string) =>
    apiClient.delete(`/products/${productId}/variants/${variantId}`).then(r => r.data),
  variantStockAdjust: (productId: string, variantId: string, delta: number) =>
    apiClient.post(`/products/${productId}/variants/${variantId}/stock-adjust`, { delta }).then(r => r.data),

  resolvePrice: (params: { productId: string; variantId?: string; customerId?: string; qty?: number }) =>
    apiClient.get<{ unitPriceCents: number; vatRate: number }>('/products/resolve-price', { params }).then(r => r.data),
};

export const priceListsApi = {
  list: () =>
    apiClient.get<PriceList[]>('/price-lists').then(r => r.data),
  get: (id: string) =>
    apiClient.get<PriceListDetail>(`/price-lists/${id}`).then(r => r.data),
  create: (data: Partial<PriceList>) =>
    apiClient.post<PriceList>('/price-lists', data).then(r => r.data),
  update: (id: string, data: Partial<PriceList>) =>
    apiClient.patch<PriceList>(`/price-lists/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    apiClient.delete(`/price-lists/${id}`).then(r => r.data),
  bulkSetEntries: (id: string, entries: Partial<PriceListEntry>[]) =>
    apiClient.put(`/price-lists/${id}/entries`, { entries }).then(r => r.data),
  addEntry: (id: string, entry: Partial<PriceListEntry>) =>
    apiClient.post(`/price-lists/${id}/entries`, entry).then(r => r.data),
  deleteEntry: (id: string, entryId: string) =>
    apiClient.delete(`/price-lists/${id}/entries/${entryId}`).then(r => r.data),
  assignCustomers: (id: string, customerIds: string[]) =>
    apiClient.post(`/price-lists/${id}/assign-customers`, { customerIds }).then(r => r.data),
};
