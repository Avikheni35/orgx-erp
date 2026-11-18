import apiClient from './client';
import type { ServiceItem } from './serviceItems';

export interface InventoryMovement {
  _id:             string;
  tenantId:        string;
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
  itemName:        string;
  itemCategory:    string;
  type:            'purchase' | 'sale' | 'adjustment';
  quantity:        number;
  unitCostCents:   number;
  totalCents:      number;
  stockAfter:      number;
  sourceType:      'VendorInvoice' | 'SalesInvoice' | 'PurchaseOrder' | 'manual';
  sourceId:        string;
  sourceNumber:    string;
  lineDescription: string;
  journalEntryId?: string;
  createdAt:       string;
}

export interface StockProduct {
  _id:               string;
  name:              string;
  sku:               string;
  categoryName?:     string;
  unit:              string;
  stockQuantity:     number;
  lowStockThreshold: number;
  costPriceCents:    number;
  hasVariants:       boolean;
  variantAttributes?: string[];
}

export interface StockVariant {
  _id:               string;
  productId:         string;
  sku:               string;
  attributes:        Record<string, string>;
  stockQuantity:     number;
  lowStockThreshold: number;
  costPriceCents:    number;
}

export interface LowStockResult {
  count:    number;
  products: StockProduct[];
  variants: StockVariant[];
}

export const inventoryApi = {
  listItems: () =>
    apiClient.get<{
      products:     StockProduct[];
      variants:     StockVariant[];
      serviceItems: ServiceItem[];
      total:        number;
    }>('/inventory'),

  lowStock: () =>
    apiClient.get<LowStockResult>('/inventory/low-stock'),

  listMovements: (params?: {
    serviceItemId?: string;
    productId?:     string;
    variantId?:     string;
    sourceType?:    string;
    sourceId?:      string;
    type?:          string;
    page?:          number;
    limit?:         number;
  }) => apiClient.get<{
    movements:  InventoryMovement[];
    total:      number;
    page:       number;
    totalPages: number;
  }>('/inventory/movements', { params }),

  movementsBySource: (sourceType: string, sourceId: string) =>
    apiClient.get<{ movements: InventoryMovement[] }>(
      `/inventory/movements/by-source/${sourceType}/${sourceId}`
    ),
};
