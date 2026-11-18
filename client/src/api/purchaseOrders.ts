import apiClient from './client';

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface POLineItem {
  description:      string;
  unit:             string;
  quantity:         number;
  unitPriceCents:   number;
  vatRate:          number;
  lineTotalCents:   number;
  vatAmountCents:   number;
  receivedQuantity: number;
  serviceItemId?:   string;
  productId?:       string;
  variantId?:       string;
}

export interface POLineItemInput {
  description:    string;
  unit:           string;
  quantity:       number;
  unitPriceCents: number;
  vatRate:        number;
  serviceItemId?: string;
  productId?:     string;
  variantId?:     string;
}

export interface PurchaseOrder {
  _id:                       string;
  poNumber:                  string;
  supplierId:                string;
  supplierName:              string;
  supplierAddress:           string;
  orderDate:                 string;
  expectedDeliveryDate?:     string;
  status:                    PurchaseOrderStatus;
  lineItems:                 POLineItem[];
  subtotalCents:             number;
  vatTotalCents:             number;
  totalCents:                number;
  currency:                  string;
  deliveryAddress:           string;
  notes:                     string;
  internalNotes:             string;
  convertedToVendorInvoiceId?: string;
  createdAt:                 string;
}

export interface CreatePOPayload {
  supplierId:           string;
  orderDate:            string;
  expectedDeliveryDate?: string;
  lineItems:            POLineItemInput[];
  deliveryAddress:      string;
  notes:                string;
  internalNotes:        string;
}

export const purchaseOrdersApi = {
  list: (params?: { status?: string; supplierId?: string }) =>
    apiClient.get<{ orders: PurchaseOrder[] }>('/purchase-orders', { params }),

  get: (id: string) =>
    apiClient.get<PurchaseOrder>(`/purchase-orders/${id}`),

  create: (data: CreatePOPayload) =>
    apiClient.post<PurchaseOrder>('/purchase-orders', data),

  updateStatus: (id: string, status: PurchaseOrderStatus) =>
    apiClient.patch<PurchaseOrder>(`/purchase-orders/${id}/status`, { status }),

  receive: (id: string, lines: { lineIndex: number; receivedQty: number }[]) =>
    apiClient.post<PurchaseOrder>(`/purchase-orders/${id}/receive`, { lines }),

  convert: (id: string) =>
    apiClient.post<{ order: PurchaseOrder; invoiceId: string }>(`/purchase-orders/${id}/convert`),
};
