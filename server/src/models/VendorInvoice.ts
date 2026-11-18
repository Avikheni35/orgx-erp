import { Schema, model, Document, Types } from 'mongoose';

export type VendorInvoiceStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'cancelled';

export interface IAttachment {
  _id:          Types.ObjectId;
  filename:     string;
  originalName: string;
  mimeType:     string;
  sizeBytes:    number;
  uploadedAt:   Date;
  uploadedBy?:  Types.ObjectId;
}

export interface IVendorLineItem {
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

export interface ISupplierSnapshot {
  companyName:      string;
  legalForm?:       string;
  address:          { street: string; city: string; zip: string; country: string };
  vatId?:           string;
  creditorAccount?: string;
}

export interface IVendorInvoice extends Document {
  tenantId:          Types.ObjectId;
  supplierInvoiceNumber: string;
  supplierId:        Types.ObjectId;
  supplierSnapshot:  ISupplierSnapshot;
  status:            VendorInvoiceStatus;
  invoiceDate:       Date;
  dueDate:           Date;
  lineItems:         IVendorLineItem[];
  totalNetCents:     number;
  totalVatCents:     number;
  totalGrossCents:   number;
  paidCents:         number;
  currency:          string;
  exchangeRate:      number;
  notes?:            string;
  approvedAt?:       Date;
  approvalNote?:     string;
  rejectedAt?:       Date;
  rejectionNote?:    string;
  paidAt?:           Date;
  attachments:             IAttachment[];
  sourcePurchaseOrderId?:  Types.ObjectId;
  createdAt:               Date;
  updatedAt:               Date;
}

const VendorLineItemSchema = new Schema<IVendorLineItem>({
  serviceItemId:  { type: String, default: '' },
  productId:      { type: String, default: '' },
  variantId:      { type: String, default: '' },
  itemName:       { type: String, default: '' },
  description:    { type: String, default: '' },
  unit:           { type: String, default: 'Stück' },
  expenseAccount: { type: String, default: '' },
  quantity:       { type: Number, required: true },
  unitPriceCents: { type: Number, required: true },
  vatRate:        { type: Number, required: true, default: 19 },
  totalNetCents:  { type: Number, required: true },
  totalVatCents:  { type: Number, required: true },
  totalGrossCents:{ type: Number, required: true },
}, { _id: true });

const VendorInvoiceSchema = new Schema<IVendorInvoice>(
  {
    tenantId:              { type: Schema.Types.ObjectId, required: true },
    supplierInvoiceNumber: { type: String, required: true, trim: true },
    supplierId:            { type: Schema.Types.ObjectId, required: true, ref: 'M3Supplier' },
    supplierSnapshot: {
      companyName:     { type: String, default: '' },
      legalForm:       { type: String, default: '' },
      address: {
        street:  { type: String, default: '' },
        city:    { type: String, default: '' },
        zip:     { type: String, default: '' },
        country: { type: String, default: 'DE' },
      },
      vatId:           { type: String, default: '' },
      creditorAccount: { type: String, default: '' },
    },
    status:          { type: String, enum: ['draft','pending_approval','approved','rejected','paid','cancelled'], default: 'draft' },
    invoiceDate:     { type: Date, required: true },
    dueDate:         { type: Date, required: true },
    lineItems:       { type: [VendorLineItemSchema], default: [] },
    totalNetCents:   { type: Number, default: 0 },
    totalVatCents:   { type: Number, default: 0 },
    totalGrossCents: { type: Number, default: 0 },
    paidCents:       { type: Number, default: 0 },
    currency:        { type: String, default: 'EUR', uppercase: true, trim: true },
    exchangeRate:    { type: Number, default: 1.0 },
    notes:           { type: String, default: '' },
    approvedAt:      { type: Date },
    approvalNote:    { type: String, default: '' },
    rejectedAt:      { type: Date },
    rejectionNote:   { type: String, default: '' },
    paidAt:                 { type: Date },
    sourcePurchaseOrderId:  { type: Schema.Types.ObjectId },
    attachments: [{
      filename:     { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType:     { type: String, required: true },
      sizeBytes:    { type: Number, required: true },
      uploadedAt:   { type: Date, default: Date.now },
      uploadedBy:   { type: Schema.Types.ObjectId },
    }],
  },
  { timestamps: true, collection: 'm3_vendor_invoices' }
);

VendorInvoiceSchema.index({ tenantId: 1, supplierId: 1 });
VendorInvoiceSchema.index({ tenantId: 1, status: 1 });
VendorInvoiceSchema.index({ tenantId: 1, invoiceDate: -1 });

export const VendorInvoice = model<IVendorInvoice>('M3VendorInvoice', VendorInvoiceSchema);
