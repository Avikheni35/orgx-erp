import apiClient from './client';

export interface FxRate {
  _id: string;
  tenantId: string;
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  date: string;
  source: 'manual' | 'ecb';
  createdAt: string;
  updatedAt: string;
}

export interface FxRatePayload {
  quoteCurrency: string;
  rate: number;
  date: string;
  source?: 'manual' | 'ecb';
}

const BASE = '/fx-rates';

export const fxRatesApi = {
  list: (params?: { currency?: string; limit?: number }) =>
    apiClient.get<{ rates: FxRate[] }>(BASE, { params }),
  latest: (currency: string) =>
    apiClient.get<FxRate>(`${BASE}/latest/${currency}`),
  create: (data: FxRatePayload) =>
    apiClient.post<FxRate>(BASE, data),
  delete: (id: string) =>
    apiClient.delete<{ message: string }>(`${BASE}/${id}`),
};

export const COMMON_CURRENCIES = [
  { code: 'USD', label: 'US-Dollar (USD)' },
  { code: 'GBP', label: 'Britisches Pfund (GBP)' },
  { code: 'CHF', label: 'Schweizer Franken (CHF)' },
  { code: 'JPY', label: 'Japanischer Yen (JPY)' },
  { code: 'CNY', label: 'Chinesischer Renminbi (CNY)' },
  { code: 'PLN', label: 'Polnischer Zloty (PLN)' },
  { code: 'CZK', label: 'Tschechische Krone (CZK)' },
  { code: 'SEK', label: 'Schwedische Krone (SEK)' },
  { code: 'NOK', label: 'Norwegische Krone (NOK)' },
  { code: 'DKK', label: 'Dänische Krone (DKK)' },
  { code: 'HUF', label: 'Ungarischer Forint (HUF)' },
  { code: 'RON', label: 'Rumänischer Leu (RON)' },
  { code: 'AUD', label: 'Australischer Dollar (AUD)' },
  { code: 'CAD', label: 'Kanadischer Dollar (CAD)' },
  { code: 'TRY', label: 'Türkische Lira (TRY)' },
];
