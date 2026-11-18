import apiClient from './client';

export interface Contact {
  _id?:      string;
  name:      string;
  email?:    string;
  phone?:    string;
  position?: string;
  isPrimary: boolean;
}

export interface Supplier {
  _id:                   string;
  supplierNumber:        string;
  companyName:           string;
  legalForm?:            string;
  address: {
    street:  string;
    city:    string;
    zip:     string;
    country: string;
  };
  vatId?:                string;
  contacts:              Contact[];
  paymentTermsDays:      number;
  iban?:                 string;
  bic?:                  string;
  creditorAccount?:      string;
  defaultExpenseAccount?: string;
  paymentBlock:          boolean;
  taxExempt:             boolean;
  isActive:              boolean;
  notes?:                string;
  createdAt:             string;
  updatedAt:             string;
}

export type SupplierCreate = Omit<Supplier, '_id' | 'supplierNumber' | 'createdAt' | 'updatedAt'>;
export type SupplierUpdate = Partial<SupplierCreate>;

export interface SupplierListParams {
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

export const suppliersApi = {
  list: (params?: SupplierListParams) =>
    apiClient.get<{ suppliers: Supplier[]; total: number; page: number; totalPages: number }>('/suppliers', { params }),

  get: (id: string) =>
    apiClient.get<Supplier>(`/suppliers/${id}`),

  create: (data: SupplierCreate) =>
    apiClient.post<Supplier>('/suppliers', data),

  update: (id: string, data: SupplierUpdate) =>
    apiClient.patch<Supplier>(`/suppliers/${id}`, data),

  deactivate: (id: string) =>
    apiClient.post<Supplier>(`/suppliers/${id}/deactivate`),

  reactivate: (id: string) =>
    apiClient.post<Supplier>(`/suppliers/${id}/reactivate`),

  openItems: (id: string) =>
    apiClient.get<{ openItems: OpenItem[]; total: number; totalOpenCents: number; totalOverdueCents: number }>(`/suppliers/${id}/open-items`),
};
