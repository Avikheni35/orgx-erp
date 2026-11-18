import apiClient from './client';

export type AbsenceType   = 'vacation' | 'sick' | 'parental' | 'unpaid' | 'other';
export type AbsenceStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';

export interface Absence {
  _id:          string;
  employeeId:   string;
  employeeName: string;
  type:         AbsenceType;
  startDate:    string;
  endDate:      string;
  days:         number;
  reason:       string;
  status:       AbsenceStatus;
  approvedAt?:  string;
  notes:        string;
  createdAt:    string;
}

export interface AbsenceSummaryEntry {
  _id:          string;
  employeeName: string;
  totalDays:    number;
  breakdown:    { type: AbsenceType; days: number }[];
}

export const absencesApi = {
  list: (params?: { employeeId?: string; status?: string; type?: string; year?: number }) =>
    apiClient.get<{ absences: Absence[] }>('/absences', { params }),

  summary: (year?: number) =>
    apiClient.get<{ year: number; summary: AbsenceSummaryEntry[] }>('/absences/summary', { params: { year } }),

  get: (id: string) =>
    apiClient.get<Absence>(`/absences/${id}`),

  create: (data: {
    employeeId: string; type: string; startDate: string; endDate: string;
    days: number; reason: string; notes: string;
  }) => apiClient.post<Absence>('/absences', data),

  approve: (id: string) => apiClient.patch<Absence>(`/absences/${id}/approve`),
  reject:  (id: string) => apiClient.patch<Absence>(`/absences/${id}/reject`),
  cancel:  (id: string) => apiClient.patch<Absence>(`/absences/${id}/cancel`),
};
