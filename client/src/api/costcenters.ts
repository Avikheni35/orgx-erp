import apiClient from './client';

export interface CostCenter {
  _id:               string;
  number:            string;
  name:              string;
  description:       string;
  annualBudgetCents: number;
  isActive:          boolean;
  createdAt:         string;
}

export interface CostCenterCreate {
  number:            string;
  name:              string;
  description:       string;
  annualBudgetCents: number;
}

export interface CostCenterDetail {
  costCenter:        CostCenter;
  actualDebitCents:  number;
  actualCreditCents: number;
  recentEntries:     {
    _id: string; entryNumber: string; date: string; description: string;
    lines: { accountNumber: string; accountName: string; debit: number; credit: number; costCenter: string; description: string }[];
  }[];
}

export const costCentersApi = {
  list:   (params?: { active?: boolean }) =>
    apiClient.get<{ costCenters: CostCenter[] }>('/costcenters', { params }),

  get:    (id: string) =>
    apiClient.get<CostCenterDetail>(`/costcenters/${id}`),

  create: (body: CostCenterCreate) =>
    apiClient.post<CostCenter>('/costcenters', body),

  update: (id: string, body: Partial<CostCenterCreate & { isActive: boolean }>) =>
    apiClient.patch<CostCenter>(`/costcenters/${id}`, body),
};
