import apiClient from './client';

export type EmployeeStatus = 'active' | 'inactive' | 'terminated';
export type SalaryType     = 'monthly' | 'hourly';
export type TaxClass       = '1' | '2' | '3' | '4' | '5' | '6';

export interface Employee {
  _id:              string;
  employeeNumber:   string;
  firstName:        string;
  lastName:         string;
  dateOfBirth?:     string;
  email:            string;
  phone:            string;
  address:          string;
  department:       string;
  position:         string;
  startDate:        string;
  endDate?:         string;
  status:           EmployeeStatus;
  salaryType:       SalaryType;
  salaryCents:      number;
  taxClass:         TaxClass;
  healthInsurance:  string;
  // sensitive fields omitted from list (present on detail)
  steuerIdEncrypted?: string;
  svNummerEncrypted?: string;
  ibanEncrypted?:     string;
  personnelAccount: string;
  costCenterNumber: string;
  notes:            string;
  createdAt:        string;
}

export interface EmployeeCreate {
  firstName:         string;
  lastName:          string;
  dateOfBirth?:      string;
  email:             string;
  phone:             string;
  address:           string;
  department:        string;
  position:          string;
  startDate:         string;
  endDate?:          string;
  salaryType:        SalaryType;
  salaryCents:       number;
  taxClass:          TaxClass;
  healthInsurance:   string;
  steuerIdEncrypted: string;
  svNummerEncrypted: string;
  ibanEncrypted:     string;
  personnelAccount:  string;
  costCenterNumber:  string;
  notes:             string;
}

export const employeesApi = {
  list: (params?: { status?: string; department?: string; q?: string }) =>
    apiClient.get<{ employees: Employee[]; departments: string[] }>('/employees', { params }),

  get: (id: string) =>
    apiClient.get<Employee>(`/employees/${id}`),

  create: (body: EmployeeCreate) =>
    apiClient.post<Employee>('/employees', body),

  update: (id: string, body: Partial<EmployeeCreate & { status: EmployeeStatus }>) =>
    apiClient.patch<Employee>(`/employees/${id}`, body),
};
