import apiClient from './client';

export interface BankRow {
  date:        string;
  description: string;
  amountCents: number;
  type:        'receipt' | 'payment';
}

export interface MatchSuggestion {
  invoiceId:     string;
  invoiceNumber: string;
  companyName:   string;
  openCents:     number;
  totalCents:    number;
  score:         number;
  confidence:    'high' | 'medium' | 'low' | 'none';
}

export interface MatchResult {
  idx:   number;
  row:   BankRow;
  match: MatchSuggestion | null;
}

export interface ApplyItem {
  date:          string;
  description:   string;
  amountCents:   number;
  invoiceId:     string;
  invoiceNumber: string;
}

export const reconciliationApi = {
  match: (rows: BankRow[]) =>
    apiClient.post<{ results: MatchResult[] }>('/reconciliation/match', { rows }),

  apply: (bankAccount: string, counterAccount: string, items: ApplyItem[]) =>
    apiClient.post<{ created: number; failed: number; failedNumbers: string[] }>(
      '/reconciliation/apply', { bankAccount, counterAccount, items }
    ),
};
