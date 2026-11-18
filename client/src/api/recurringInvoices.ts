import apiClient from './client';

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringStatus    = 'active' | 'paused';

export interface RecurringLineItem {
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

export interface RecurringInvoice {
  _id:             string;
  title:           string;
  customerId:      string;
  customerSnapshot: { companyName: string; legalForm?: string };
  status:          RecurringStatus;
  frequency:       RecurringFrequency;
  dayOfMonth:      number;
  paymentTermDays: number;
  nextRunDate:     string;
  lastRunAt?:      string;
  lineItems:       RecurringLineItem[];
  notes?:          string;
  createdAt:       string;
}

export interface RecurringInvoiceFormData {
  title:           string;
  customerId:      string;
  frequency:       RecurringFrequency;
  dayOfMonth:      number;
  paymentTermDays: number;
  startDate:       string;
  lineItems:       Omit<RecurringLineItem, 'totalNetCents' | 'totalVatCents' | 'totalGrossCents'>[];
  notes?:          string;
}

export const recurringInvoicesApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    apiClient.get<{ templates: RecurringInvoice[]; total: number; page: number; totalPages: number }>(
      '/recurring-invoices', { params }
    ),

  get: (id: string) =>
    apiClient.get<RecurringInvoice>(`/recurring-invoices/${id}`),

  create: (data: RecurringInvoiceFormData) =>
    apiClient.post<RecurringInvoice>('/recurring-invoices', data),

  update: (id: string, data: Partial<RecurringInvoiceFormData>) =>
    apiClient.put<RecurringInvoice>(`/recurring-invoices/${id}`, data),

  toggleStatus: (id: string) =>
    apiClient.patch<RecurringInvoice>(`/recurring-invoices/${id}/status`),

  runNow: (id: string) =>
    apiClient.post<{ invoice: { invoiceNumber: string }; message: string }>(`/recurring-invoices/${id}/run`),

  delete: (id: string) =>
    apiClient.delete(`/recurring-invoices/${id}`),
};
