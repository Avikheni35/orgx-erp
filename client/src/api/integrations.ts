import apiClient from './client';

export interface ServiceConnectionView {
  url: string;
  token: string;
  enabled: boolean;
  lastPingAt?: string;
  lastPingOk?: boolean;
}

export interface IntegrationSettingsView {
  ownServiceToken: string;
  connectedServices: {
    m1?: ServiceConnectionView;
    m2?: ServiceConnectionView;
  };
}

export interface M2TimesheetRow {
  _id: string;
  staffProfileId: string;
  staffName: string;
  eventName: string;
  totalHours: number;
  payRatePerHour: number;
  grossPay: number;
  taxRate: number;
  deductionsCents: number;
  netPay: number;
  approvedAt?: string;
  syncStatus: string;
  syncId?: string;
  m3PayrollId?: string;
}

export interface M2StaffRow {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  taxRate: number;
  contractType: string;
  status: string;
}

export interface M2PaymentRow {
  _id: string;
  staffProfileId: string;
  staffName: string;
  year: number;
  month: number;
  totalAmount: number;
  paidAt: string;
  syncId?: string;
  m3JournalEntryId?: string;
  paidHours?: number;
  totalHours?: number;
  carryForwardHours?: number;
}

export interface EventStaffPayrollView {
  connected: boolean;
  staff: M2StaffRow[];
  timesheets: M2TimesheetRow[];
  payments: M2PaymentRow[];
  prevPayments: M2PaymentRow[];
}

export const integrationsApi = {
  get: async (): Promise<IntegrationSettingsView> => {
    const { data } = await apiClient.get<IntegrationSettingsView>('/integrations');
    return data;
  },

  saveConnection: async (module: 'm1' | 'm2', url: string, token: string, enabled: boolean): Promise<void> => {
    await apiClient.put('/integrations/connections', { module, url, token, enabled });
  },

  testConnection: async (module: 'm1' | 'm2'): Promise<{ ok: boolean; latencyMs?: number; error?: string }> => {
    const { data } = await apiClient.post<{ ok: boolean; latencyMs?: number; error?: string }>(
      `/integrations/test/${module}`
    );
    return data;
  },

  regenerateToken: async (): Promise<string> => {
    const { data } = await apiClient.post<{ ownServiceToken: string }>('/integrations/regenerate-token');
    return data.ownServiceToken;
  },

  getEventStaffPayroll: async (params?: { year?: number; month?: number; syncStatus?: string }): Promise<EventStaffPayrollView> => {
    const { data } = await apiClient.get<EventStaffPayrollView>('/integrations/event-staff', { params });
    return data;
  },

  getM2SyncStatus: async (): Promise<{ connected: boolean; timesheets?: { pending: number; failed: number }; invoices?: { pending: number; failed: number } }> => {
    const { data } = await apiClient.get('/integrations/m2-sync-status');
    return data;
  },

  m2SyncNow: async (): Promise<{ ok: boolean; timesheets?: { ok: number; failed: number }; invoices?: { ok: number; failed: number } }> => {
    const { data } = await apiClient.post('/integrations/m2-sync-now');
    return data;
  },

  payEventStaff: async (payload: {
    staffProfileId:        string;
    staffName:             string;
    year:                  number;
    month:                 number;
    netAmountCents:        number;
    m3PayrollId?:          string;
    paidHours?:            number;
    totalHours?:           number;
    paymentAccountNumber?: string;
    markAsPaid?:           boolean;
  }): Promise<{ ok: boolean; paymentId: string; duplicate?: boolean; syncId: string; paidAt: string }> => {
    const { data } = await apiClient.post<{ ok: boolean; paymentId: string; duplicate?: boolean; syncId: string; paidAt: string }>(
      '/integrations/event-staff/pay',
      payload
    );
    return data;
  },
};
