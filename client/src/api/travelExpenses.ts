import apiClient from './client';

export type TravelExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
export type ExpenseCategory     = 'mileage' | 'hotel' | 'meal' | 'transport' | 'parking' | 'other';

export interface ExpenseLine {
  category:      ExpenseCategory;
  description:   string;
  amountCents:   number;
  vatRate:       number;
  receiptNumber: string;
  km?:           number;
  kmRate?:       number;
}

export interface TravelExpense {
  _id:              string;
  expenseNumber:    string;
  employeeId:       string;
  employeeName:     string;
  purpose:          string;
  destination:      string;
  startDate:        string;
  endDate:          string;
  lines:            ExpenseLine[];
  totalAmountCents: number;
  costCenterNumber: string;
  personnelAccount: string;
  expenseAccount:   string;
  status:           TravelExpenseStatus;
  submittedAt?:     string;
  approvedAt?:      string;
  rejectedAt?:      string;
  rejectionReason:  string;
  journalEntryId?:  string;
  notes:            string;
  createdAt:        string;
}

export interface TravelExpenseCreate {
  employeeId:       string;
  purpose:          string;
  destination:      string;
  startDate:        string;
  endDate:          string;
  lines:            ExpenseLine[];
  costCenterNumber: string;
  personnelAccount: string;
  expenseAccount:   string;
  notes:            string;
}

export const travelExpensesApi = {
  list:     (params?: { status?: string; employeeId?: string }) =>
    apiClient.get<{ expenses: TravelExpense[] }>('/travel-expenses', { params }),

  get:      (id: string) =>
    apiClient.get<TravelExpense>(`/travel-expenses/${id}`),

  create:   (body: TravelExpenseCreate) =>
    apiClient.post<TravelExpense>('/travel-expenses', body),

  submit:   (id: string) => apiClient.post(`/travel-expenses/${id}/submit`),
  approve:  (id: string) => apiClient.post(`/travel-expenses/${id}/approve`),
  reject:   (id: string, reason: string) => apiClient.post(`/travel-expenses/${id}/reject`, { reason }),
  markPaid: (id: string) => apiClient.post(`/travel-expenses/${id}/mark-paid`),
};
