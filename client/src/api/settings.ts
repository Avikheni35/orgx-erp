import apiClient from './client';

export interface CompanySettings {
  _id: string;
  tenantId: string;
  companyName: string;
  legalForm: string;
  address: { street: string; city: string; zip: string; country: string };
  vatId: string;
  steuernummer: string;
  hrNumber: string;
  fiscalYearStart: number;
  chartOfAccounts: 'SKR03' | 'SKR04';
  vatPeriod: 'monthly' | 'quarterly';
  currency: 'EUR';
  invoicePrefix: string;
  invoiceStartNumber: number;
  invoiceDueDays: number;
  invoiceTermsText: string;
  datevBeraternummer: string;
  datevMandantennummer: string;
  dunningLevels: Array<{ level: number; feeCents: number; graceDays: number }>;
  mileageRateCents: number;
  poApprovalThresholdCents: number;
  salesMode: 'invoice' | 'pos';
  featureFlags?: {
    enableFixedAssets: boolean;
    enableAccruals: boolean;
    enableDirectDebit: boolean;
    enableElster: boolean;
    enableCostCenters: boolean;
    costCenterRequired: boolean;
    enableInventory: boolean;
    gobdAuditLog: boolean;
    dunningEnabled: boolean;
    bookingApprovalWorkflow: boolean;
    taxAdvisorAccess: boolean;
    periodLockPolicy: 'manual' | 'auto-monthly';
    multiCurrency: boolean;
    misIntentMode?: 'regex' | 'ai';
  };
}

export interface M3FeatureFlags {
  enableFixedAssets: boolean;
  enableAccruals: boolean;
  enableDirectDebit: boolean;
  enableElster: boolean;
  enableCostCenters: boolean;
  costCenterRequired: boolean;
  enableInventory: boolean;
  gobdAuditLog: boolean;
  dunningEnabled: boolean;
  bookingApprovalWorkflow: boolean;
  taxAdvisorAccess: boolean;
  periodLockPolicy: 'manual' | 'auto-monthly';
  multiCurrency: boolean;
  misIntentMode: 'regex' | 'ai';
}

export const DEFAULT_M3_FLAGS: M3FeatureFlags = {
  enableFixedAssets: true,
  enableAccruals: true,
  enableDirectDebit: false,
  enableElster: false,
  enableCostCenters: false,
  costCenterRequired: false,
  enableInventory: false,
  gobdAuditLog: true,
  dunningEnabled: true,
  bookingApprovalWorkflow: false,
  taxAdvisorAccess: false,
  periodLockPolicy: 'manual',
  multiCurrency: false,
  misIntentMode: 'regex',
};

export const settingsApi = {
  getCompany: () => apiClient.get<{ configured: boolean; settings: CompanySettings | null }>('/settings/company'),
  updateCompany: (data: Partial<CompanySettings>) => apiClient.patch<CompanySettings>('/settings/company', data),
  getFeatures: async (): Promise<M3FeatureFlags> => {
    const res = await apiClient.get<{ configured: boolean; settings: CompanySettings | null }>('/settings/company');
    return { ...DEFAULT_M3_FLAGS, ...(res.data.settings?.featureFlags ?? {}) };
  },
  updateFeatures: (flags: Partial<M3FeatureFlags>) =>
    apiClient.patch<CompanySettings>('/settings/company', { featureFlags: flags }),
};
