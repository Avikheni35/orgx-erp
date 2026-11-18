import apiClient from './client';

export type VendorInvoiceStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface Attachment {
  _id:          string;
  filename:     string;
  originalName: string;
  mimeType:     string;
  sizeBytes:    number;
  uploadedAt:   string;
  uploadedBy?:  string;
}

export interface VendorLineItem {
  _id?:            string;
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
  itemName?:       string;
  description:     string;
  unit:            string;
  expenseAccount?: string;
  quantity:        number;
  unitPriceCents:  number;
  vatRate:         number;
  totalNetCents:   number;
  totalVatCents:   number;
  totalGrossCents: number;
}

export interface VendorLineItemInput {
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
  itemName?:       string;
  description:     string;
  unit:            string;
  expenseAccount?: string;
  quantity:        number;
  unitPriceCents:  number;
  vatRate:         number;
}

export interface SupplierSnapshot {
  companyName:      string;
  legalForm?:       string;
  address:          { street: string; city: string; zip: string; country: string };
  vatId?:           string;
  creditorAccount?: string;
}

export interface VendorInvoice {
  _id:                   string;
  supplierInvoiceNumber: string;
  supplierId:            string;
  supplierSnapshot:      SupplierSnapshot;
  status:                VendorInvoiceStatus;
  invoiceDate:           string;
  dueDate:               string;
  lineItems:             VendorLineItem[];
  totalNetCents:         number;
  totalVatCents:         number;
  totalGrossCents:       number;
  paidCents:             number;
  currency:              string;
  exchangeRate:          number;
  notes?:                string;
  approvedAt?:           string;
  approvalNote?:         string;
  rejectedAt?:           string;
  rejectionNote?:        string;
  paidAt?:               string;
  attachments:             Attachment[];
  sourcePurchaseOrderId?:  string;
  createdAt:               string;
  updatedAt:               string;
}

export interface CreateVendorInvoicePayload {
  supplierId:            string;
  supplierInvoiceNumber: string;
  invoiceDate:           string;
  dueDate?:              string;
  lineItems:             VendorLineItemInput[];
  notes?:                string;
  currency?:             string;
  exchangeRate?:         number;
}

export interface UpdateVendorInvoicePayload {
  supplierInvoiceNumber?: string;
  invoiceDate?:           string;
  dueDate?:               string;
  lineItems?:             VendorLineItemInput[];
  notes?:                 string;
}

export interface VendorInvoiceListParams {
  status?:     VendorInvoiceStatus;
  supplierId?: string;
  from?:       string;
  to?:         string;
  page?:       number;
  limit?:      number;
}

export interface CostCenterVarianceLine {
  costCenter: { _id: string; number: string; name: string; annualBudgetCents: number; description: string };
  actualDebitCents:  number;
  actualCreditCents: number;
  actualSpendCents:  number;
  budgetCents:       number;
  varianceCents:     number;
  usedPct:           number | null;
}

export const vendorInvoicesApi = {
  list: (params?: VendorInvoiceListParams) =>
    apiClient.get<{ invoices: VendorInvoice[]; total: number; page: number; totalPages: number }>('/vendor-invoices', { params }),

  get: (id: string) =>
    apiClient.get<VendorInvoice>(`/vendor-invoices/${id}`),

  create: (data: CreateVendorInvoicePayload) =>
    apiClient.post<VendorInvoice>('/vendor-invoices', data),

  update: (id: string, data: UpdateVendorInvoicePayload) =>
    apiClient.patch<VendorInvoice>(`/vendor-invoices/${id}`, data),

  submitForApproval: (id: string) =>
    apiClient.post<VendorInvoice>(`/vendor-invoices/${id}/submit-approval`),

  approve: (id: string, note?: string) =>
    apiClient.post<VendorInvoice>(`/vendor-invoices/${id}/approve`, { note }),

  reject: (id: string, note: string) =>
    apiClient.post<VendorInvoice>(`/vendor-invoices/${id}/reject`, { note }),

  markPaid: (id: string) =>
    apiClient.post<VendorInvoice>(`/vendor-invoices/${id}/mark-paid`),

  cancel: (id: string) =>
    apiClient.post<VendorInvoice>(`/vendor-invoices/${id}/cancel`),

  pendingApprovals: () =>
    apiClient.get<{ invoices: VendorInvoice[] }>('/vendor-invoices/pending-approvals'),

  uploadAttachment: (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return apiClient.post<Attachment>(`/vendor-invoices/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  downloadAttachment: (id: string, attId: string) =>
    apiClient.get(`/vendor-invoices/${id}/attachments/${attId}`, { responseType: 'blob' }),

  deleteAttachment: (id: string, attId: string) =>
    apiClient.delete(`/vendor-invoices/${id}/attachments/${attId}`),

  costCenterVariance: (params?: { from?: string; to?: string }) =>
    apiClient.get<{ lines: CostCenterVarianceLine[]; from: string | null; to: string | null }>('/costcenters/variance', { params }),

  sepaExport: (invoiceIds: string[]) =>
    apiClient.post('/vendor-invoices/sepa-export', { invoiceIds }, { responseType: 'blob' }),
};
