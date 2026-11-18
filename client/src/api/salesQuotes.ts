import apiClient from './client';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface QuoteLineItem {
  _id?:            string;
  serviceItemId?:  string;
  itemName?:       string;
  description:     string;
  unit:            string;
  quantity:        number;
  unitPriceCents:  number;
  vatRate:         number;
  totalNetCents:   number;
  totalVatCents:   number;
  totalGrossCents: number;
}

export interface QuoteLineItemInput {
  description:    string;
  unit:           string;
  quantity:       number;
  unitPriceCents: number;
  vatRate:        number;
}

export interface SalesQuote {
  _id:                   string;
  quoteNumber:           string;
  customerId:            string;
  customerName:          string;
  customerAddress:       string;
  quoteDate:             string;
  validUntil:            string;
  status:                QuoteStatus;
  lineItems:             QuoteLineItem[];
  totalNetCents:         number;
  totalVatCents:         number;
  totalGrossCents:       number;
  currency:              string;
  notes:                 string;
  internalNotes:         string;
  convertedToInvoiceId?: string;
  createdAt:             string;
}

export interface CreateQuotePayload {
  customerId:    string;
  quoteDate:     string;
  validUntil:    string;
  lineItems:     QuoteLineItemInput[];
  notes:         string;
  internalNotes: string;
}

export const salesQuotesApi = {
  list: (params?: { status?: string; customerId?: string }) =>
    apiClient.get<{ quotes: SalesQuote[] }>('/sales-quotes', { params }),

  get: (id: string) =>
    apiClient.get<SalesQuote>(`/sales-quotes/${id}`),

  create: (data: CreateQuotePayload) =>
    apiClient.post<SalesQuote>('/sales-quotes', data),

  updateStatus: (id: string, status: QuoteStatus) =>
    apiClient.patch<SalesQuote>(`/sales-quotes/${id}/status`, { status }),

  convert: (id: string) =>
    apiClient.post<{ quote: SalesQuote; invoice: { _id: string; invoiceNumber: string } }>(`/sales-quotes/${id}/convert`),

  convertToOrder: (id: string) =>
    apiClient.post<{ quote: SalesQuote; order: { _id: string; orderNumber: string } }>(`/sales-quotes/${id}/convert-to-order`),
};
