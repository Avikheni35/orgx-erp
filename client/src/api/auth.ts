import apiClient from './client';
import type { AuthUser } from '../types';

interface LoginResponse { accessToken: string; user: AuthUser; }
interface OtpRequired { requiresOtp: true; }

export const authApi = {
  login: (email: string, password: string, tenantCode?: string) =>
    apiClient.post<LoginResponse | OtpRequired>('/auth/login', { email, password, tenantCode }),

  verifyOtp: (email: string, otp: string, tenantCode?: string) =>
    apiClient.post<LoginResponse>('/auth/verify-otp', { email, otp, tenantCode }),

  refresh: () => apiClient.post<{ accessToken: string }>('/auth/refresh'),

  me: async (): Promise<AuthUser> => {
    const res = await apiClient.get<AuthUser>('/auth/me');
    return res.data;
  },

  logout: () => apiClient.post('/auth/logout'),

  updateProfile: (data: { firstName?: string; lastName?: string; language?: 'de' | 'en' }) =>
    apiClient.patch<{ message: string }>('/auth/me', data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ message: string }>('/auth/me/change-password', { currentPassword, newPassword }),

  forgotPassword: (email: string, tenantCode?: string) =>
    apiClient.post('/auth/forgot-password', { email, tenantCode }),

  resetPassword: (token: string, password: string) =>
    apiClient.post(`/auth/reset-password/${token}`, { password }),
};
