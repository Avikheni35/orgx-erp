import apiClient from './client';

export interface Contact {
  _id?:      string;
  name:      string;
  email?:    string;
  phone?:    string;
  position?: string;
  isPrimary: boolean;
}

export interface Customer {
  _id:              string;
  customerNumber:   string;
  companyName:      string;
  legalForm?:       string;
  address: {
    street:  string;
    city:    string;
    zip:     string;
    country: string;
  };
  vatId?:           string;
  contacts:         Contact[];
  paymentTermsDays: number;
  creditLimitCents: number;
  iban?:            string;
  bic?:             string;
  debtorAccount?:   string;
  dunningBlock:     boolean;
  taxExempt:        boolean;
  isActive:         boolean;
  notes?:           string;
  createdAt:        string;
  updatedAt:        string;
}

export type CustomerCreate = Omit<Customer, '_id' | 'customerNumber' | 'createdAt' | 'updatedAt'>;
export type CustomerUpdate = Partial<CustomerCreate>;

export interface CustomerListParams {
  search?: string;
  active?: boolean;
  page?:   number;
  limit?:  number;
}

export interface OpenItem {
  invoiceNumber: string;
  date:          string;
  dueDate:       string;
  totalCents:    number;
  openCents:     number;
  overdue:       boolean;
}

export const customersApi = {
  list: (params?: CustomerListParams) =>
    apiClient.get<{ customers: Customer[]; total: number; page: number; totalPages: number }>('/customers', { params }),

  get: (id: string) =>
    apiClient.get<Customer>(`/customers/${id}`),

  create: (data: CustomerCreate) =>
    apiClient.post<Customer>('/customers', data),

  update: (id: string, data: CustomerUpdate) =>
    apiClient.patch<Customer>(`/customers/${id}`, data),

  deactivate: (id: string) =>
    apiClient.post<Customer>(`/customers/${id}/deactivate`),

  reactivate: (id: string) =>
    apiClient.post<Customer>(`/customers/${id}/reactivate`),

  openItems: (id: string) =>
    apiClient.get<{ openItems: OpenItem[]; total: number; totalOpenCents: number; totalOverdueCents: number }>(`/customers/${id}/open-items`),
};
