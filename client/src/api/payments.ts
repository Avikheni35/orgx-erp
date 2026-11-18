import apiClient from './client';

export type PaymentDirection = 'incoming' | 'outgoing';

export interface PaymentAllocation {
  invoiceType:   'SalesInvoice' | 'VendorInvoice';
  invoiceId:     string;
  invoiceNumber: string;
  amountCents:   number;
}

export interface Payment {
  _id:             string;
  paymentNumber:   string;
  date:            string;
  direction:       PaymentDirection;
  amountCents:     number;
  bankAccount:     string;
  bankAccountName: string;
  description:     string;
  allocations:     PaymentAllocation[];
  journalEntryId?: string;
  createdAt:       string;
}

export interface PaymentCreate {
  date:           string;
  direction:      PaymentDirection;
  amountCents:    number;
  bankAccount:    string;
  counterAccount: string;
  description:    string;
  allocations:    PaymentAllocation[];
}

export const paymentsApi = {
  list: (params?: { direction?: string; from?: string; to?: string; page?: number }) =>
    apiClient.get<{ payments: Payment[]; total: number; page: number; totalPages: number }>('/payments', { params }),

  get: (id: string) =>
    apiClient.get<{ payment: Payment; journalEntry: unknown }>(`/payments/${id}`),

  create: (body: PaymentCreate) =>
    apiClient.post<Payment>('/payments', body),

  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`/payments/${id}`),
};
