import apiClient from './client';

export interface Shift {
  _id:               string;
  tenantId:          string;
  userId:            string;
  userName:          string;
  openedAt:          string;
  closedAt?:         string;
  openingFloatCents: number;
  closingFloatCents?: number;
  salesCount:        number;
  salesCents:        number;
  status:            'open' | 'closed';
  createdAt:         string;
}

export const shiftsApi = {
  current: () =>
    apiClient.get<Shift | null>('/shifts/current'),

  open: (data: { openingFloatCents: number; userName?: string }) =>
    apiClient.post<Shift>('/shifts/open', data),

  close: (data: { closingFloatCents: number }) =>
    apiClient.post<Shift>('/shifts/close', data),
};
