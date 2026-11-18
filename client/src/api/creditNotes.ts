import apiClient from './client';

export type CreditNoteStatus = 'draft' | 'sent' | 'posted' | 'cancelled';

export interface CreditNoteLineItem {
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

export interface CreditNote {
  _id:              string;
  creditNoteNumber: string;
  customerId:       string;
  customerName:     string;
  customerAddress:  string;
  debtorAccount:    string;
  invoiceId?:       string;
  invoiceNumber?:   string;
  creditNoteDate:   string;
  status:           CreditNoteStatus;
  reason:           string;
  lineItems:        CreditNoteLineItem[];
  totalNetCents:    number;
  totalVatCents:    number;
  totalGrossCents:  number;
  currency:         string;
  notes:            string;
  journalEntryId?:  string;
  createdAt:        string;
}

export interface CreateCreditNotePayload {
  customerId:     string;
  invoiceId?:     string;
  creditNoteDate: string;
  reason:         string;
  lineItems:      Omit<CreditNoteLineItem, '_id' | 'totalNetCents' | 'totalVatCents' | 'totalGrossCents'>[];
  notes:          string;
}

export const creditNotesApi = {
  list: (params?: { status?: string; customerId?: string }) =>
    apiClient.get<{ creditNotes: CreditNote[] }>('/credit-notes', { params }),

  get: (id: string) =>
    apiClient.get<CreditNote>(`/credit-notes/${id}`),

  create: (data: CreateCreditNotePayload) =>
    apiClient.post<CreditNote>('/credit-notes', data),

  updateStatus: (id: string, status: 'sent' | 'cancelled') =>
    apiClient.patch<CreditNote>(`/credit-notes/${id}/status`, { status }),

  post: (id: string) =>
    apiClient.post<CreditNote>(`/credit-notes/${id}/post`),
};
