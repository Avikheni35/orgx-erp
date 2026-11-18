import { Schema, model, Document, Types } from 'mongoose';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface IQuoteLineItem {
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

export interface ISalesQuote extends Document {
  tenantId:              Types.ObjectId;
  quoteNumber:           string;
  customerId:            Types.ObjectId;
  customerName:          string;
  customerAddress:       string;
  quoteDate:             Date;
  validUntil:            Date;
  status:                QuoteStatus;
  lineItems:             IQuoteLineItem[];
  totalNetCents:         number;
  totalVatCents:         number;
  totalGrossCents:       number;
  currency:              string;
  notes:                 string;
  internalNotes:         string;
  convertedToInvoiceId?: Types.ObjectId;
  createdBy?:            Types.ObjectId;
  createdAt:             Date;
  updatedAt:             Date;
}

const LineItemSchema = new Schema<IQuoteLineItem>({
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

const SalesQuoteSchema = new Schema<ISalesQuote>({
  tenantId:        { type: Schema.Types.ObjectId, required: true },
  quoteNumber:     { type: String, required: true, trim: true },
  customerId:      { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
  customerName:    { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  quoteDate:       { type: Date, required: true },
  validUntil:      { type: Date, required: true },
  status:          { type: String, enum: ['draft','sent','accepted','rejected','expired','converted'], default: 'draft' },
  lineItems:       { type: [LineItemSchema], default: [] },
  totalNetCents:   { type: Number, default: 0 },
  totalVatCents:   { type: Number, default: 0 },
  totalGrossCents: { type: Number, default: 0 },
  currency:        { type: String, default: 'EUR' },
  notes:           { type: String, default: '' },
  internalNotes:   { type: String, default: '' },
  convertedToInvoiceId: { type: Schema.Types.ObjectId },
  createdBy:       { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_sales_quotes' });

SalesQuoteSchema.index({ tenantId: 1, quoteNumber: 1 }, { unique: true });
SalesQuoteSchema.index({ tenantId: 1, status: 1 });
SalesQuoteSchema.index({ tenantId: 1, customerId: 1 });

export const SalesQuote = model<ISalesQuote>('M3SalesQuote', SalesQuoteSchema);
