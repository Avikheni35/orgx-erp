import { IntegrationSettings } from '../models/IntegrationSettings';

async function callM1(tenantId: string, path: string, body: object): Promise<boolean> {
  const settings = await IntegrationSettings
    .findOne({ tenantId })
    .select('connectedServices.m1')
    .lean();
  const peer = settings?.connectedServices?.m1;
  if (!peer?.enabled || !peer.url || !peer.token) return false;
  try {
    const res = await fetch(`${peer.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-service-token': peer.token,
        'x-caller-module': 'm3',
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getFromM2<T>(tenantId: string, path: string): Promise<T | null> {
  const settings = await IntegrationSettings
    .findOne({ tenantId })
    .select('connectedServices.m2')
    .lean();
  const peer = settings?.connectedServices?.m2;
  if (!peer?.enabled || !peer.url || !peer.token) return null;
  try {
    const res = await fetch(`${peer.url}${path}`, {
      method: 'GET',
      headers: { 'x-service-token': peer.token, 'x-caller-module': 'm3' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

async function postToM2<T>(tenantId: string, path: string, body: object): Promise<T | null> {
  const settings = await IntegrationSettings
    .findOne({ tenantId })
    .select('connectedServices.m2')
    .lean();
  const peer = settings?.connectedServices?.m2;
  if (!peer?.enabled || !peer.url || !peer.token) return null;
  try {
    const res = await fetch(`${peer.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-service-token': peer.token,
        'x-caller-module': 'm3',
      },
      body:   JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

export interface M2StaffMember {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skills: string[];
  taxRate: number;
  contractType: 'monthly' | 'per-event';
  deductions: { name: string; amountCents: number }[];
  status: string;
  ibanEncrypted?: string;
}

export interface M2Timesheet {
  _id: string;
  staffProfileId: string;
  staffName: string;
  totalHours: number;
  payRatePerHour: number;
  grossPay: number;
  taxRate: number;
  deductionsCents: number;
  netPay: number;
  approvedAt: string;
  syncStatus: string;
  syncId?: string;
  m3PayrollId?: string;
  eventName: string;
}

export interface M2Invoice {
  _id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  total: number;
  subtotal: number;
  vatAmount: number;
  dueDate: string;
  status: string;
  syncStatus: string;
  syncId?: string;
  m3InvoiceId?: string;
  eventName?: string;
  invoiceDate: string;
}

export interface M2Payment {
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

export const peers = {
  m1: {
    sendNotification: (
      tenantId: string,
      data: { type: string; title: string; body: string }
    ) => callM1(tenantId, '/api/internal/notifications', data),
  },
  m2: {
    fetchStaff: (tenantId: string) =>
      getFromM2<{ staff: M2StaffMember[] }>(tenantId, '/api/internal/staff'),

    fetchStaffMember: (tenantId: string, staffId: string) =>
      getFromM2<{ staff: M2StaffMember }>(tenantId, `/api/internal/staff/${staffId}`),

    fetchTimesheets: (tenantId: string, params?: { year?: number; month?: number; staffProfileId?: string; syncStatus?: string }) => {
      const qs = new URLSearchParams();
      if (params?.year)           qs.set('year', String(params.year));
      if (params?.month)          qs.set('month', String(params.month));
      if (params?.staffProfileId) qs.set('staffProfileId', params.staffProfileId);
      if (params?.syncStatus)     qs.set('syncStatus', params.syncStatus);
      const query = qs.toString() ? `?${qs}` : '';
      return getFromM2<{ timesheets: M2Timesheet[] }>(tenantId, `/api/internal/timesheets${query}`);
    },

    fetchInvoices: (tenantId: string, params?: { syncStatus?: string; status?: string }) => {
      const qs = new URLSearchParams();
      if (params?.syncStatus) qs.set('syncStatus', params.syncStatus);
      if (params?.status)     qs.set('status', params.status);
      const query = qs.toString() ? `?${qs}` : '';
      return getFromM2<{ invoices: M2Invoice[] }>(tenantId, `/api/internal/invoices${query}`);
    },

    fetchPayments: (tenantId: string, params?: { year?: number; month?: number }) => {
      const qs = new URLSearchParams();
      if (params?.year)  qs.set('year',  String(params.year));
      if (params?.month) qs.set('month', String(params.month));
      const query = qs.toString() ? `?${qs}` : '';
      return getFromM2<{ payments: M2Payment[] }>(tenantId, `/api/internal/payments${query}`);
    },

    ackPayment: (tenantId: string, data: {
      staffProfileId:    string;
      staffName:         string;
      year:              number;
      month:             number;
      netAmountCents:    number;
      paidAt:            string;
      m3PayrollId:       string;
      syncId:            string;
      paidHours?:        number;
      totalHours?:       number;
      carryForwardHours?: number;
    }) => postToM2<{ ok: boolean; paymentId: string; duplicate?: boolean }>(tenantId, '/api/internal/payment-ack', data),

    getSyncSummary: (tenantId: string) =>
      getFromM2<{ timesheets: { pending: number; failed: number }; invoices: { pending: number; failed: number } }>(tenantId, '/api/internal/sync-summary'),

    triggerSync: (tenantId: string) =>
      postToM2<{ timesheets: { ok: number; failed: number }; invoices: { ok: number; failed: number } }>(tenantId, '/api/internal/trigger-sync', {}),

    ping: (tenantId: string) => getFromM2<{ ok: boolean }>(tenantId, '/api/internal/health').then(r => !!r?.ok),
  },
};
