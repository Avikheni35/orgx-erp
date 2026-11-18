import apiClient from './client';
import type { JournalEntry } from './journal';

export interface OpeningBalanceLine {
  accountNumber: string;
  debit: number;
  credit: number;
}

export const openingBalancesApi = {
  get: () => apiClient.get<{ entry: JournalEntry | null }>('/journal/opening-balances'),

  save: (data: { date: string; balances: OpeningBalanceLine[] }) =>
    apiClient.post<{ entry: JournalEntry; message: string }>('/journal/opening-balances', data),
};
