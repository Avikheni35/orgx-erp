import apiClient from './client';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface LineItem {
  _id?:            string;
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
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

export interface LineItemInput {
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
  itemName?:       string;
  description:     string;
  unit:            string;
  quantity:        number;
  unitPriceCents:  number;
  vatRate:         number;
}

export interface CustomerSnapshot {
  companyName:    string;
  legalForm?:     string;
  address:        { street: string; city: string; zip: string; country: string };
  vatId?:         string;
  debtorAccount?: string;
}

export interface SalesInvoice {
  _id:              string;
  invoiceNumber:    string;
  customerId:       string;
  customerSnapshot: CustomerSnapshot;
  status:           InvoiceStatus;
  invoiceDate:      string;
  dueDate:          string;
  lineItems:        LineItem[];
  totalNetCents:    number;
  totalVatCents:    number;
  totalGrossCents:  number;
  paidCents:        number;
  currency:         string;
  exchangeRate:     number;
  notes?:                  string;
  originalInvoiceId?:      string;
  originalInvoiceNumber?:  string;
  paidAt?:                 string;
  sentAt?:                 string;
  createdAt:               string;
  updatedAt:               string;
}

export interface CreateInvoicePayload {
  customerId:   string;
  invoiceDate:  string;
  dueDate?:     string;
  lineItems:    LineItemInput[];
  notes?:       string;
  currency?:    string;
  exchangeRate?: number;
}

export interface UpdateInvoicePayload {
  invoiceDate?: string;
  dueDate?:     string;
  lineItems?:   LineItemInput[];
  notes?:       string;
}

export interface InvoiceListParams {
  status?:        InvoiceStatus;
  customerId?:    string;
  from?:          string;
  to?:            string;
  page?:          number;
  limit?:         number;
  invoiceNumber?: string;
}

export const salesInvoicesApi = {
  list: (params?: InvoiceListParams) =>
    apiClient.get<{ invoices: SalesInvoice[]; total: number; page: number; totalPages: number }>('/sales-invoices', { params }),

  get: (id: string) =>
    apiClient.get<SalesInvoice>(`/sales-invoices/${id}`),

  create: (data: CreateInvoicePayload) =>
    apiClient.post<SalesInvoice>('/sales-invoices', data),

  update: (id: string, data: UpdateInvoicePayload) =>
    apiClient.patch<SalesInvoice>(`/sales-invoices/${id}`, data),

  send: (id: string) =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/send`),

  markPaid: (id: string, glAccount: string = '1200') =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/mark-paid`, { glAccount }),

  unmarkPaid: (id: string) =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/unmark-paid`),

  cancel: (id: string) =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/cancel`),

  pdf: (id: string) =>
    apiClient.get(`/sales-invoices/${id}/pdf`, { responseType: 'blob' }),

  xrechnung: (id: string) =>
    apiClient.get(`/sales-invoices/${id}/xrechnung`, { responseType: 'blob' }),

  sendEmail: (id: string, payload: { to: string; subject?: string; message?: string }) =>
    apiClient.post<{ message: string; status: InvoiceStatus }>(`/sales-invoices/${id}/email`, payload),

  posSale: (data: { lineItems: LineItemInput[]; glAccount: string; payLater: boolean; draft?: boolean; invoiceDate?: string; notes?: string; customerId?: string }) =>
    apiClient.post<SalesInvoice>('/sales-invoices/pos-sale', data),

  posReturn: (data: { originalInvoiceId: string; returnLineItems: LineItemInput[]; glAccount: string }) =>
    apiClient.post<SalesInvoice>('/sales-invoices/pos-return', data),

  posPay: (id: string, glAccount: string, lineItems?: LineItemInput[]) =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/pos-pay`, { glAccount, lineItems }),

  posUpdate: (id: string, lineItems: LineItemInput[]) =>
    apiClient.post<SalesInvoice>(`/sales-invoices/${id}/pos-update`, { lineItems }),

  sendLink: (id: string) =>
    apiClient.post<{ message: string; email: string }>(`/sales-invoices/${id}/send-link`),
};
