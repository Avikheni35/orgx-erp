import apiClient from './client';

export interface DunningCandidate {
  invoiceId:     string;
  invoiceNumber: string;
  companyName:   string;
  customerId:    string;
  dueDate:       string;
  daysOverdue:   number;
  openCents:     number;
  currentLevel:  0 | 1 | 2;
  nextLevel:     1 | 2 | 3;
  feeCents:      number;
  graceDays:     number;
}

export interface DunningRecord {
  _id:            string;
  invoiceId:      string;
  invoiceNumber:  string;
  companyName:    string;
  customerId:     string;
  level:          1 | 2 | 3;
  issuedAt:       string;
  dunningDueDate: string;
  feeCents:       number;
  notes?:         string;
  createdAt:      string;
}

export const dunningApi = {
  candidates: () =>
    apiClient.get<{ candidates: DunningCandidate[] }>('/dunning/candidates'),

  list: (params?: { invoiceId?: string; page?: number; limit?: number }) =>
    apiClient.get<{ records: DunningRecord[]; total: number; page: number; totalPages: number }>('/dunning', { params }),

  issue: (invoiceId: string, notes?: string) =>
    apiClient.post<DunningRecord>(`/dunning/${invoiceId}`, { notes }),

  pdf: (recordId: string) =>
    apiClient.get(`/dunning/${recordId}/pdf`, { responseType: 'blob' }),
};
