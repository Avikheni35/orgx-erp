import apiClient from './client';

export interface SusaRow {
  number:        string;
  name:          string;
  type:          string;
  debit:         number;
  credit:        number;
  debitBalance:  number;
  creditBalance: number;
}

export interface SusaTotals {
  debit:         number;
  credit:        number;
  debitBalance:  number;
  creditBalance: number;
}

export interface BwaGroup {
  key:   string;
  label: string;
  value: number;
}

export interface BwaSummary {
  revenue:     number;
  cogs:        number;
  grossProfit: number;
  opExp:       number;
  ebit:        number;
  interestInc: number;
  interestExp: number;
  finResult:   number;
  ebt:         number;
}

export interface GuvLine {
  number: string;
  name:   string;
  amount: number;
}

export interface UstUmsatz {
  rate: number;
  base: number;
  ust:  number;
  kz:   number;
}

export interface UstEinkauf {
  rate: number;
  base: number;
  vst:  number;
  kz:   number;
}

export interface UstResult {
  umsaetze:    UstUmsatz[];
  einkauf:     UstEinkauf[];
  totalOutput: number;
  totalInput:  number;
  zahllast:    number;
}

export interface BsLine {
  number: string;
  name:   string;
  amount: number;
}

export interface BsGroup {
  key:   string;
  label: string;
  lines: BsLine[];
  total: number;
}

export interface BilanzResult {
  aktivaGroups:  BsGroup[];
  passivaGroups: BsGroup[];
  guv:           number;
  totalAktiva:   number;
  totalPassiva:  number;
}

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface OpenItem {
  _id:           string;
  invoiceNumber: string;
  companyName:   string;
  invoiceDate:   string;
  dueDate:       string;
  daysOverdue:   number;
  openCents:     number;
  bucket:        AgingBucket;
  // AR-specific
  customerId?:   string;
  // AP-specific
  supplierId?:   string;
}

export interface OpenItemsResult {
  items:     OpenItem[];
  totalOpen: number;
  buckets:   Record<AgingBucket, number>;
}

export type ReportFilter = { fyId?: string; from?: string; to?: string };

export const reportsApi = {
  susa: (params?: ReportFilter) =>
    apiClient.get<{ rows: SusaRow[]; totals: SusaTotals }>('/reports/susa', { params }),

  bwa: (params?: ReportFilter) =>
    apiClient.get<{ groups: BwaGroup[]; summary: BwaSummary }>('/reports/bwa', { params }),

  guv: (params?: ReportFilter) =>
    apiClient.get<{ revenueLines: GuvLine[]; expenseLines: GuvLine[]; totalRevenue: number; totalExpenses: number; netResult: number }>(
      '/reports/guv', { params }
    ),

  ar: () => apiClient.get<OpenItemsResult>('/reports/ar'),
  ap: () => apiClient.get<OpenItemsResult>('/reports/ap'),

  bilanz: (params?: ReportFilter) =>
    apiClient.get<BilanzResult>('/reports/bilanz', { params }),

  ust: (params?: ReportFilter) =>
    apiClient.get<UstResult>('/reports/ust', { params }),
};
