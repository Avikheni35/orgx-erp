import { Schema, model, Document, Types } from 'mongoose';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'cancelled';

export interface ILineItem {
  serviceItemId?:  string;
  productId?:      string;
  variantId?:      string;
  itemName?:       string;
  description:     string;
  unit:            string;
  quantity:        number;
  unitPriceCents:  number;
  vatRate:         number;
  totalNetCents:   number;
  totalVatCents:   number;
  totalGrossCents: number;
}

export interface ICustomerSnapshot {
  companyName:    string;
  legalForm?:     string;
  address:        { street: string; city: string; zip: string; country: string };
  vatId?:         string;
  debtorAccount?: string;
}

export interface ISalesInvoice extends Document {
  tenantId:          Types.ObjectId;
  invoiceNumber:     string;
  customerId:        Types.ObjectId;
  customerSnapshot:  ICustomerSnapshot;
  status:            InvoiceStatus;
  invoiceDate:       Date;
  dueDate:           Date;
  lineItems:         ILineItem[];
  totalNetCents:     number;
  totalVatCents:     number;
  totalGrossCents:   number;
  paidCents:         number;
  notes?:            string;
  originalInvoiceId?:     string;
  originalInvoiceNumber?: string;
  paidAt?:           Date;
  sentAt?:           Date;
  currency:          string;
  exchangeRate:      number;
  // M2 sync
  syncId?:           string;
  source?:           'm2' | 'm3';
  m2InvoiceId?:      string;
  clientSnapshot?:   { m2ClientId: string; name: string; email?: string; source: 'm2' };
  createdAt:         Date;
  updatedAt:         Date;
}

const LineItemSchema = new Schema<ILineItem>({
  serviceItemId:   { type: String, default: '' },
  productId:       { type: String, default: '' },
  variantId:       { type: String, default: '' },
  itemName:        { type: String, default: '' },
  description:     { type: String, default: '' },
  unit:            { type: String, default: 'Stück' },
  quantity:        { type: Number, required: true },
  unitPriceCents:  { type: Number, required: true },
  vatRate:         { type: Number, required: true, default: 19 },
  totalNetCents:   { type: Number, required: true },
  totalVatCents:   { type: Number, required: true },
  totalGrossCents: { type: Number, required: true },
}, { _id: true });

const SalesInvoiceSchema = new Schema<ISalesInvoice>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true },
    invoiceNumber: { type: String, required: true, trim: true },
    customerId:    { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
    customerSnapshot: {
      companyName:   { type: String, default: '' },
      legalForm:     { type: String, default: '' },
      address: {
        street:  { type: String, default: '' },
        city:    { type: String, default: '' },
        zip:     { type: String, default: '' },
        country: { type: String, default: 'DE' },
      },
      vatId:         { type: String, default: '' },
      debtorAccount: { type: String, default: '' },
    },
    status:          { type: String, enum: ['draft','sent','paid','cancelled'], default: 'draft' },
    invoiceDate:     { type: Date, required: true },
    dueDate:         { type: Date, required: true },
    lineItems:       { type: [LineItemSchema], default: [] },
    totalNetCents:   { type: Number, default: 0 },
    totalVatCents:   { type: Number, default: 0 },
    totalGrossCents: { type: Number, default: 0 },
    paidCents:       { type: Number, default: 0 },
    notes:                  { type: String, default: '' },
    originalInvoiceId:      { type: String },
    originalInvoiceNumber:  { type: String },
    paidAt:          { type: Date },
    sentAt:          { type: Date },
    currency:        { type: String, default: 'EUR', uppercase: true, trim: true },
    exchangeRate:    { type: Number, default: 1.0 },
    syncId:          { type: String },
    source:          { type: String, enum: ['m2', 'm3'], default: 'm3' },
    m2InvoiceId:     { type: String },
    clientSnapshot:  {
      m2ClientId: String,
      name:       String,
      email:      String,
      source:     { type: String, default: 'm2' },
    },
  },
  { timestamps: true, collection: 'm3_sales_invoices' }
);

SalesInvoiceSchema.index({ syncId: 1 }, { unique: true, sparse: true });
SalesInvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
SalesInvoiceSchema.index({ tenantId: 1, customerId: 1 });
SalesInvoiceSchema.index({ tenantId: 1, status: 1 });
SalesInvoiceSchema.index({ tenantId: 1, dueDate: 1 });

export const SalesInvoice = model<ISalesInvoice>('M3SalesInvoice', SalesInvoiceSchema);
