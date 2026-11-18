import apiClient from './client';

export type AssetStatus = 'active' | 'fully_depreciated' | 'disposed';
export type DepreciationMethod = 'linear' | 'none';

export interface FixedAsset {
  _id:                          string;
  assetNumber:                  string;
  name:                         string;
  category:                     string;
  description:                  string;
  acquisitionDate:              string;
  acquisitionCostCents:         number;
  residualValueCents:           number;
  usefulLifeMonths:             number;
  depreciationMethod:           DepreciationMethod;
  assetAccount:                 string;
  depreciationExpenseAccount:   string;
  accumulatedDepAccount:        string;
  monthlyDepreciationCents:     number;
  accumulatedDepreciationCents: number;
  lastDepreciationDate?:        string;
  status:                       AssetStatus;
  disposedAt?:                  string;
  disposalProceedsCents:        number;
  createdAt:                    string;
}

export interface FixedAssetCreate {
  name:                       string;
  category:                   string;
  description:                string;
  acquisitionDate:            string;
  acquisitionCostCents:       number;
  residualValueCents:         number;
  usefulLifeMonths:           number;
  depreciationMethod:         DepreciationMethod;
  assetAccount:               string;
  depreciationExpenseAccount: string;
  accumulatedDepAccount:      string;
}

export interface DepRunResult {
  posted:  number;
  results: { assetNumber: string; name: string; amountCents: number }[];
  period:  string;
  message?: string;
}

export const assetsApi = {
  list: (params?: { status?: string; category?: string }) =>
    apiClient.get<{ assets: FixedAsset[] }>('/assets', { params }),

  get: (id: string) =>
    apiClient.get<{ asset: FixedAsset; depEntries: unknown[] }>(`/assets/${id}`),

  create: (body: FixedAssetCreate) =>
    apiClient.post<FixedAsset>('/assets', body),

  update: (id: string, body: Partial<Pick<FixedAsset, 'name' | 'category' | 'description'>>) =>
    apiClient.patch<FixedAsset>(`/assets/${id}`, body),

  dispose: (id: string, body: { disposalDate?: string; proceedsCents?: number }) =>
    apiClient.post<FixedAsset>(`/assets/${id}/dispose`, body),

  depreciationRun: (year: number, month: number) =>
    apiClient.post<DepRunResult>('/assets/depreciation-run', { year, month }),

  downloadPdf: (params?: { status?: string; category?: string }) =>
    apiClient.get('/assets/pdf', { params, responseType: 'blob' }).then(r => r.data as Blob),
};
