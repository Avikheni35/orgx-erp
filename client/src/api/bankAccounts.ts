import apiClient from './client';

export interface BankAccount {
  _id:           string;
  accountName:   string;
  bankName:      string;
  iban:          string;
  bic:           string;
  accountHolder: string;
  currency:      string;
  isDefault:     boolean;
  glAccount:     string;
  notes:         string;
  isActive:      boolean;
  createdAt:     string;
}

export interface BankAccountPayload {
  accountName:   string;
  bankName:      string;
  iban:          string;
  bic:           string;
  accountHolder: string;
  currency:      string;
  isDefault:     boolean;
  glAccount:     string;
  notes:         string;
}

export const bankAccountsApi = {
  list: (params?: { isActive?: boolean }) =>
    apiClient.get<{ accounts: BankAccount[] }>('/bank-accounts', { params }),

  get: (id: string) =>
    apiClient.get<BankAccount>(`/bank-accounts/${id}`),

  create: (data: BankAccountPayload) =>
    apiClient.post<BankAccount>('/bank-accounts', data),

  update: (id: string, data: Partial<BankAccountPayload>) =>
    apiClient.patch<BankAccount>(`/bank-accounts/${id}`, data),

  deactivate: (id: string) =>
    apiClient.delete<{ ok: boolean }>(`/bank-accounts/${id}`),
};
