import apiClient from './client';

export interface ErpUser {
  _id:       string;
  email:     string;
  firstName: string;
  lastName:  string;
  role:      string;
  status:    'active' | 'inactive' | 'suspended';
  lastLoginAt?: string;
  createdAt: string;
}

export interface CreateErpUserData {
  email:     string;
  firstName: string;
  lastName:  string;
  role:      'erp_admin' | 'erp_accountant' | 'erp_viewer' | 'erp_employee' | 'erp_tax_advisor';
  password:  string;
}

export const userManagementApi = {
  list: () =>
    apiClient.get<{ users: ErpUser[] }>('/settings/users'),

  create: (data: CreateErpUserData) =>
    apiClient.post<ErpUser>('/settings/users', data),

  toggleStatus: (id: string) =>
    apiClient.patch<{ status: string }>(`/settings/users/${id}/status`),

  delete: (id: string) =>
    apiClient.delete(`/settings/users/${id}`),
};
