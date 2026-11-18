import apiClient from './client';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_delivered'
  | 'delivered'
  | 'invoiced'
  | 'cancelled';

export interface OrderLineItem {
  _id?:              string;
  serviceItemId?:    string;
  itemName?:         string;
  description:       string;
  unit:              string;
  quantity:          number;
  unitPriceCents:    number;
  vatRate:           number;
  totalNetCents:     number;
  totalVatCents:     number;
  totalGrossCents:   number;
  deliveredQuantity: number;
}

export interface SalesOrder {
  _id:                     string;
  orderNumber:             string;
  customerId:              string;
  customerName:            string;
  customerAddress:         string;
  quoteId?:                string;
  quoteNumber?:            string;
  orderDate:               string;
  deliveryDate?:           string;
  status:                  OrderStatus;
  lineItems:               OrderLineItem[];
  totalNetCents:           number;
  totalVatCents:           number;
  totalGrossCents:         number;
  currency:                string;
  deliveryAddress:         string;
  notes:                   string;
  internalNotes:           string;
  convertedToInvoiceId?:   string;
  createdAt:               string;
}

export interface CreateOrderPayload {
  customerId:      string;
  orderDate:       string;
  deliveryDate?:   string;
  lineItems:       Omit<OrderLineItem, '_id' | 'totalNetCents' | 'totalVatCents' | 'totalGrossCents' | 'deliveredQuantity'>[];
  deliveryAddress: string;
  notes:           string;
  internalNotes:   string;
}

export const salesOrdersApi = {
  list: (params?: { status?: string; customerId?: string }) =>
    apiClient.get<{ orders: SalesOrder[] }>('/sales-orders', { params }),

  get: (id: string) =>
    apiClient.get<SalesOrder>(`/sales-orders/${id}`),

  create: (data: CreateOrderPayload) =>
    apiClient.post<SalesOrder>('/sales-orders', data),

  updateStatus: (id: string, status: OrderStatus) =>
    apiClient.patch<SalesOrder>(`/sales-orders/${id}/status`, { status }),

  convert: (id: string) =>
    apiClient.post<{ order: SalesOrder; invoice: { _id: string; invoiceNumber: string } }>(`/sales-orders/${id}/convert`),
};
