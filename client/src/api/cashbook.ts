import apiClient from './client';

export type CashEntryType = 'receipt' | 'payment';

export interface CashBookEntry {
  _id:               string;
  entryNumber:       string;
  date:              string;
  type:              CashEntryType;
  description:       string;
  cashAccount:       string;
  cashAccountName:   string;
  contraAccount:     string;
  contraAccountName: string;
  amountCents:       number;
  vatRate:           number;
  vatCents:          number;
  netCents:          number;
  journalEntryId?:   string;
  runningBalance?:   number;
  createdAt:         string;
}

export interface CashBookEntryCreate {
  date:          string;
  type:          CashEntryType;
  description:   string;
  cashAccount:   string;
  contraAccount: string;
  amountCents:   number;
  vatRate:       number;
}

export const cashbookApi = {
  list: (params?: { cashAccount?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    apiClient.get<{ entries: CashBookEntry[]; total: number; page: number; totalPages: number }>(
      '/cashbook', { params }
    ),

  create: (body: CashBookEntryCreate) =>
    apiClient.post<CashBookEntry>('/cashbook', body),

  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`/cashbook/${id}`),
};
