import apiClient from './client';

export interface Budget {
  _id: string;
  fiscalYearId: string;
  name: string;
  accountNumber: string;
  costCenterId?: string;
  budgetCents: number;
  period: 'annual' | 'monthly';
  note: string;
}

export interface VarianceLine {
  _id: string;
  name: string;
  accountNumber: string;
  costCenterName: string;
  budgetCents: number;
  actualCents: number;
  varianceCents: number;
  usedPct: number;
  note: string;
}

export interface FiscalYearInfo {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
}

export type BudgetPayload = Omit<Budget, '_id'>;

export const budgetsApi = {
  list: (fiscalYearId?: string) =>
    apiClient.get<{ budgets: Budget[] }>('/budgets', { params: fiscalYearId ? { fiscalYearId } : {} }),
  create: (data: BudgetPayload) =>
    apiClient.post<Budget>('/budgets', data),
  update: (id: string, data: BudgetPayload) =>
    apiClient.put<Budget>(`/budgets/${id}`, data),
  delete: (id: string) =>
    apiClient.delete(`/budgets/${id}`),
  variance: (fiscalYearId: string) =>
    apiClient.get<{ fiscalYear: FiscalYearInfo; lines: VarianceLine[] }>('/budgets/variance', { params: { fiscalYearId } }),
};
