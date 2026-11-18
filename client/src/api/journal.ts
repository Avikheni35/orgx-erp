import apiClient from './client';

export type JournalStatus = 'draft' | 'posted' | 'reversed';

export interface JournalLine {
  accountNumber: string;
  accountName:   string;
  debit:         number;
  credit:        number;
  costCenter?:   string;
  description?:  string;
}

export interface JournalEntry {
  _id:         string;
  entryNumber: string;
  date:        string;
  description: string;
  reference?:  string;
  status:      JournalStatus;
  lines:       JournalLine[];
  totalDebit:  number;
  totalCredit: number;
  periodId?:   string;
  fiscalYearId?: string;
  reversalOf?: string;
  reversedBy?: string;
  gobdHash:    string;
  sourceType?: 'VendorInvoice' | 'SalesInvoice';
  sourceId?:   string;
  createdBy:   string;
  postedAt?:   string;
  createdAt:   string;
}

export interface LedgerRow {
  entryId:     string;
  date:        string;
  entryNumber: string;
  description: string;
  reference?:  string;
  debit:       number;
  credit:      number;
  balance:     number;
}

export const journalApi = {
  list: (params?: { status?: string; account?: string; from?: string; to?: string; page?: number; limit?: number }) =>
    apiClient.get<{ entries: JournalEntry[]; total: number; page: number; totalPages: number }>('/journal', { params }),

  get: (id: string) => apiClient.get<JournalEntry>(`/journal/${id}`),

  create: (data: { date: string; description: string; reference?: string; lines: Partial<JournalLine>[] }) =>
    apiClient.post<JournalEntry>('/journal', data),

  post: (id: string) => apiClient.post(`/journal/${id}/post`),

  reverse: (id: string, date?: string) => apiClient.post(`/journal/${id}/reverse`, date ? { date } : {}),

  ledger: (accountNumber: string, params?: { from?: string; to?: string }) =>
    apiClient.get<{ account: string; ledger: LedgerRow[]; openingBalance: number; finalBalance: number }>(
      `/journal/account/${accountNumber}/ledger`, { params }
    ),

  exportDatev: (params?: { from?: string; to?: string; fyId?: string }) =>
    apiClient.get('/journal/export/datev', { params, responseType: 'blob' }),

  bySource: (sourceType: string, sourceId: string) =>
    apiClient.get<{ entries: JournalEntry[] }>('/journal', {
      params: { sourceType, sourceId, limit: 20 },
    }),
};
