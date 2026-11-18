import apiClient from './client';

export type PayrollStatus = 'draft' | 'finalized' | 'posted';

export interface PayrollEntry {
  employeeId:           string;
  employeeNumber:       string;
  employeeName:         string;
  personnelAccount:     string;
  costCenterNumber:     string;
  salaryType:           'monthly' | 'hourly';
  grossCents:           number;
  hoursWorked:          number;
  additionalCents:      number;
  deductionCents:       number;
  totalGrossCents:      number;
  taxCents:             number;
  socialSecurityCents:  number;
  netCents:             number;
  note:                 string;
}

export interface Payroll {
  _id:             string;
  payrollNumber:   string;
  period:          string;
  year:            number;
  month:           number;
  status:          PayrollStatus;
  entries:         PayrollEntry[];
  totalGrossCents: number;
  totalNetCents:   number;
  journalEntryId?: string;
  notes:           string;
  finalizedAt?:    string;
  postedAt?:       string;
  createdAt:       string;
}

export interface PayrollCreate {
  year:         number;
  month:        number;
  employeeIds?: string[];
  notes?:       string;
}

export interface UpdateEntryBody {
  hoursWorked?:         number;
  additionalCents?:     number;
  deductionCents?:      number;
  taxCents?:            number;
  socialSecurityCents?: number;
  note?:                string;
}

export const payrollApi = {
  list: () =>
    apiClient.get<{ payrolls: Payroll[] }>('/payroll'),

  get: (id: string) =>
    apiClient.get<Payroll>(`/payroll/${id}`),

  create: (body: PayrollCreate) =>
    apiClient.post<Payroll>('/payroll', body),

  updateEntry: (id: string, employeeId: string, body: UpdateEntryBody) =>
    apiClient.patch<Payroll>(`/payroll/${id}/entries/${employeeId}`, body),

  finalize: (id: string) =>
    apiClient.post<Payroll>(`/payroll/${id}/finalize`),

  post: (id: string) =>
    apiClient.post<Payroll>(`/payroll/${id}/post`),
};
