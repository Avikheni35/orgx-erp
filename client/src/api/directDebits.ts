import apiClient from './client';

export type MandateType     = 'CORE' | 'B2B';
export type MandateSequence = 'FRST' | 'RCUR' | 'OOFF' | 'FNAL';
export type MandateStatus   = 'active' | 'inactive' | 'cancelled';
export type RunStatus       = 'draft' | 'submitted' | 'settled' | 'returned';

export interface SepaMandate {
  _id:              string;
  mandateReference: string;
  type:             MandateType;
  sequence:         MandateSequence;
  customerId:       string;
  customerName:     string;
  iban:             string;
  bic:              string;
  signedAt:         string;
  creditorId:       string;
  status:           MandateStatus;
  notes:            string;
  createdAt:        string;
}

export interface RunEntry {
  mandateId:        string;
  mandateReference: string;
  customerId:       string;
  customerName:     string;
  iban:             string;
  amountCents:      number;
  description:      string;
  invoiceRef:       string;
}

export interface DirectDebitRun {
  _id:             string;
  runNumber:       string;
  collectionDate:  string;
  bankAccount:     string;
  status:          RunStatus;
  entries:         RunEntry[];
  totalAmountCents: number;
  notes:           string;
  journalEntryId?: string;
  createdAt:       string;
}

export const directDebitsApi = {
  listMandates: (params?: { status?: string; customerId?: string }) =>
    apiClient.get<{ mandates: SepaMandate[] }>('/direct-debits/mandates', { params }),

  createMandate: (data: {
    customerId: string; type: string; sequence: string;
    iban: string; bic: string; signedAt: string; creditorId: string; notes: string;
  }) => apiClient.post<SepaMandate>('/direct-debits/mandates', data),

  getMandate: (id: string) =>
    apiClient.get<SepaMandate>(`/direct-debits/mandates/${id}`),

  updateMandate: (id: string, data: { status?: string; sequence?: string; notes?: string }) =>
    apiClient.patch<SepaMandate>(`/direct-debits/mandates/${id}`, data),

  listRuns: (params?: { status?: string }) =>
    apiClient.get<{ runs: DirectDebitRun[] }>('/direct-debits/runs', { params }),

  createRun: (data: {
    collectionDate: string; bankAccount: string; notes: string;
    entries: { mandateId: string; amountCents: number; description: string; invoiceRef: string }[];
  }) => apiClient.post<DirectDebitRun>('/direct-debits/runs', data),

  getRun: (id: string) =>
    apiClient.get<DirectDebitRun>(`/direct-debits/runs/${id}`),

  submitRun: (id: string) =>
    apiClient.post<DirectDebitRun>(`/direct-debits/runs/${id}/submit`),

  settleRun: (id: string) =>
    apiClient.patch<DirectDebitRun>(`/direct-debits/runs/${id}/settle`),

  returnRun: (id: string) =>
    apiClient.post<DirectDebitRun>(`/direct-debits/runs/${id}/return`),
};
