import apiClient from './client';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  _id: string;
  number: string;
  name: string;
  type: AccountType;
  subtype: string;
  taxCode: string;
  parentNumber: string;
  isActive: boolean;
  isLocked: boolean;
  notes: string;
  createdAt: string;
}

export const accountsApi = {
  list: (params?: { type?: string; search?: string; active?: string }) =>
    apiClient.get<{ accounts: Account[]; total: number }>('/accounts', { params }),
  get: (id: string) => apiClient.get<Account>(`/accounts/${id}`),
  create: (data: Partial<Account>) => apiClient.post<Account>('/accounts', data),
  update: (id: string, data: Partial<Account>) => apiClient.patch<Account>(`/accounts/${id}`, data),
  deactivate: (id: string) => apiClient.post(`/accounts/${id}/deactivate`),
  reactivate: (id: string) => apiClient.post(`/accounts/${id}/reactivate`),
  importStandard: (chart: 'SKR03' | 'SKR04') =>
    apiClient.post<{ message: string; created: number; skipped: number }>('/accounts/import-standard', { chart }),
  exportCsv: () => apiClient.get('/accounts/export/csv', { responseType: 'blob' }),
  exportLedgers: (params?: { from?: string; to?: string; lang?: string }) =>
    apiClient.get('/journal/export/ledgers', { params, responseType: 'blob' }),
};
