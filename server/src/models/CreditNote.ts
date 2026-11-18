import { Schema, model, Document, Types } from 'mongoose';

export type CreditNoteStatus = 'draft' | 'sent' | 'posted' | 'cancelled';

export interface ICreditNoteLineItem {
  serviceItemId?:  string;
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

export interface ICreditNote extends Document {
  tenantId:           Types.ObjectId;
  creditNoteNumber:   string;
  customerId:         Types.ObjectId;
  customerName:       string;
  customerAddress:    string;
  debtorAccount:      string;
  invoiceId?:         Types.ObjectId;
  invoiceNumber?:     string;
  creditNoteDate:     Date;
  status:             CreditNoteStatus;
  reason:             string;
  lineItems:          ICreditNoteLineItem[];
  totalNetCents:      number;
  totalVatCents:      number;
  totalGrossCents:    number;
  currency:           string;
  notes:              string;
  journalEntryId?:    Types.ObjectId;
  createdBy?:         Types.ObjectId;
  createdAt:          Date;
  updatedAt:          Date;
}

const LineItemSchema = new Schema<ICreditNoteLineItem>({
  serviceItemId:   { type: String, default: '' },
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

const CreditNoteSchema = new Schema<ICreditNote>({
  tenantId:         { type: Schema.Types.ObjectId, required: true },
  creditNoteNumber: { type: String, required: true, trim: true },
  customerId:       { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
  customerName:     { type: String, default: '' },
  customerAddress:  { type: String, default: '' },
  debtorAccount:    { type: String, default: '1400' },
  invoiceId:        { type: Schema.Types.ObjectId, ref: 'M3SalesInvoice' },
  invoiceNumber:    { type: String, default: '' },
  creditNoteDate:   { type: Date, required: true },
  status:           { type: String, enum: ['draft','sent','posted','cancelled'], default: 'draft' },
  reason:           { type: String, default: '' },
  lineItems:        { type: [LineItemSchema], default: [] },
  totalNetCents:    { type: Number, default: 0 },
  totalVatCents:    { type: Number, default: 0 },
  totalGrossCents:  { type: Number, default: 0 },
  currency:         { type: String, default: 'EUR' },
  notes:            { type: String, default: '' },
  journalEntryId:   { type: Schema.Types.ObjectId },
  createdBy:        { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_credit_notes' });

CreditNoteSchema.index({ tenantId: 1, creditNoteNumber: 1 }, { unique: true });
CreditNoteSchema.index({ tenantId: 1, status: 1 });
CreditNoteSchema.index({ tenantId: 1, customerId: 1 });

export const CreditNote = model<ICreditNote>('M3CreditNote', CreditNoteSchema);
