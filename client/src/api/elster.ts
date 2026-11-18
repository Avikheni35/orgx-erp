import apiClient from './client';

export type FilingType   = 'uva' | 'zm' | 'lsz';
export type FilingStatus = 'draft' | 'ready' | 'submitted' | 'confirmed' | 'rejected';
export type PeriodType   = 'monthly' | 'quarterly';

export interface ElsterFiling {
  _id:                 string;
  filingNumber:        string;
  type:                FilingType;
  year:                number;
  period:              number;
  periodType:          PeriodType;
  taxableRevenue19:    number;
  taxableRevenue7:     number;
  taxableRevenue0:     number;
  outputTax19:         number;
  outputTax7:          number;
  inputTax:            number;
  netTaxPayable:       number;
  status:              FilingStatus;
  submittedAt?:        string;
  confirmationNumber:  string;
  notes:               string;
  createdAt:           string;
}

export interface UvaComputed {
  taxableRevenue19: number;
  taxableRevenue7:  number;
  taxableRevenue0:  number;
  outputTax19:      number;
  outputTax7:       number;
  inputTax:         number;
  netTaxPayable:    number;
}

export const elsterApi = {
  list: (params?: { status?: string; year?: number }) =>
    apiClient.get<{ filings: ElsterFiling[] }>('/elster', { params }),

  compute: (year: number, period: number, periodType: string) =>
    apiClient.get<UvaComputed>('/elster/compute', { params: { year, period, periodType } }),

  create: (data: {
    type: string; year: number; period: number; periodType: string; notes: string;
    taxableRevenue19?: number; taxableRevenue7?: number; taxableRevenue0?: number;
    outputTax19?: number; outputTax7?: number; inputTax?: number;
  }) => apiClient.post<ElsterFiling>('/elster', data),

  get: (id: string) =>
    apiClient.get<ElsterFiling>(`/elster/${id}`),

  markReady: (id: string) =>
    apiClient.post<ElsterFiling>(`/elster/${id}/ready`),

  submit: (id: string) =>
    apiClient.post<ElsterFiling>(`/elster/${id}/submit`),

  confirm: (id: string, confirmationNumber: string) =>
    apiClient.patch<ElsterFiling>(`/elster/${id}/confirm`, { confirmationNumber }),

  reject: (id: string) =>
    apiClient.patch<ElsterFiling>(`/elster/${id}/reject`),
};
