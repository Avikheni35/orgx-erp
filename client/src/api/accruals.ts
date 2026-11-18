import apiClient from './client';

export type AccrualType   = 'arap' | 'prap';
export type AccrualStatus = 'draft' | 'posted' | 'reversed' | 'cancelled';

export interface Accrual {
  _id:                      string;
  accrualNumber:            string;
  type:                     AccrualType;
  description:              string;
  accrualAccount:           string;
  contraAccount:            string;
  amountCents:              number;
  postDate:                 string;
  startDate:                string;
  endDate:                  string;
  referenceDocument:        string;
  notes:                    string;
  status:                   AccrualStatus;
  journalEntryId?:          string;
  reversalJournalEntryId?:  string;
  createdAt:                string;
}

export interface CreateAccrualPayload {
  type:              AccrualType;
  description:       string;
  accrualAccount:    string;
  contraAccount:     string;
  amountCents:       number;
  postDate:          string;
  startDate:         string;
  endDate:           string;
  referenceDocument: string;
  notes:             string;
}

export const accrualsApi = {
  list: (params?: { type?: string; status?: string }) =>
    apiClient.get<{ accruals: Accrual[] }>('/accruals', { params }),

  get: (id: string) =>
    apiClient.get<Accrual>(`/accruals/${id}`),

  create: (data: CreateAccrualPayload) =>
    apiClient.post<Accrual>('/accruals', data),

  post: (id: string) =>
    apiClient.post<Accrual>(`/accruals/${id}/post`),

  reverse: (id: string) =>
    apiClient.post<Accrual>(`/accruals/${id}/reverse`),

  cancel: (id: string) =>
    apiClient.patch<Accrual>(`/accruals/${id}/cancel`),
};
