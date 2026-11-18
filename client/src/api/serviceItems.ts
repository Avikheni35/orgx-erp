import apiClient from './client';

export interface ServiceItem {
  _id:                   string;
  name:                  string;
  description:           string;
  unit:                  string;
  category:              string;
  costPriceCents:        number;
  defaultUnitPriceCents: number;
  vatRate:               number;
  stockQuantity:         number;
  isActive:              boolean;
  notes?:                string;
  createdAt:             string;
  updatedAt:             string;
}

export type ServiceItemCreate = Omit<ServiceItem, '_id' | 'createdAt' | 'updatedAt'>;
export type ServiceItemUpdate = Partial<ServiceItemCreate>;

export const serviceItemsApi = {
  list: (active?: boolean) =>
    apiClient.get<{ items: ServiceItem[]; total: number }>('/service-items', {
      params: active !== undefined ? { active } : {},
    }),

  get: (id: string) =>
    apiClient.get<ServiceItem>(`/service-items/${id}`),

  create: (data: ServiceItemCreate) =>
    apiClient.post<ServiceItem>('/service-items', data),

  update: (id: string, data: ServiceItemUpdate) =>
    apiClient.patch<ServiceItem>(`/service-items/${id}`, data),

  deactivate: (id: string) =>
    apiClient.post<ServiceItem>(`/service-items/${id}/deactivate`),

  reactivate: (id: string) =>
    apiClient.post<ServiceItem>(`/service-items/${id}/reactivate`),

  delete: (id: string) =>
    apiClient.delete(`/service-items/${id}`),

  listCategories: () =>
    apiClient.get<{ categories: string[] }>('/service-items/categories'),
};
