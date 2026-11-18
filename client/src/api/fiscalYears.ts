import apiClient from './client';

export type FiscalYearStatus = 'open' | 'closed' | 'locked';
export type PeriodStatus     = 'open' | 'closed' | 'locked';

export interface FiscalYear {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  closedAt?: string;
  createdAt: string;
}

export interface Period {
  _id: string;
  fiscalYearId: string;
  name: string;
  number: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt?: string;
}

export const fiscalYearsApi = {
  list: () => apiClient.get<{ fiscalYears: FiscalYear[] }>('/fiscal-years'),

  get: (id: string) =>
    apiClient.get<{ fiscalYear: FiscalYear; periods: Period[] }>(`/fiscal-years/${id}`),

  create: (data: { name: string; startDate: string; endDate: string; generatePeriods: boolean }) =>
    apiClient.post<FiscalYear>('/fiscal-years', data),

  setStatus: (id: string, status: FiscalYearStatus) =>
    apiClient.patch(`/fiscal-years/${id}/status`, { status }),

  delete: (id: string) => apiClient.delete(`/fiscal-years/${id}`),

  getPeriods: (fyId: string) =>
    apiClient.get<{ periods: Period[] }>(`/fiscal-years/${fyId}/periods`),

  setPeriodStatus: (fyId: string, periodId: string, status: PeriodStatus) =>
    apiClient.patch(`/fiscal-years/${fyId}/periods/${periodId}/status`, { status }),

  close: (id: string) =>
    apiClient.post<{ message: string; closingEntryNumber: string | null; netResult: number }>(`/fiscal-years/${id}/close`),
};
