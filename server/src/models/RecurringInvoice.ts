import { Schema, model, Document, Types } from 'mongoose';
import type { ILineItem, ICustomerSnapshot } from './SalesInvoice';

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringStatus    = 'active' | 'paused';

export interface IRecurringInvoice extends Document {
  tenantId:         Types.ObjectId;
  title:            string;
  customerId:       Types.ObjectId;
  customerSnapshot: ICustomerSnapshot;
  status:           RecurringStatus;
  frequency:        RecurringFrequency;
  dayOfMonth:       number;
  paymentTermDays:  number;
  nextRunDate:      Date;
  lastRunAt?:       Date;
  lineItems:        ILineItem[];
  notes?:           string;
  createdBy:        Types.ObjectId;
  createdAt:        Date;
  updatedAt:        Date;
}

const LineItemSchema = new Schema({
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

const RecurringInvoiceSchema = new Schema<IRecurringInvoice>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    title:       { type: String, required: true, trim: true },
    customerId:  { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
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
    status:          { type: String, enum: ['active', 'paused'], default: 'active' },
    frequency:       { type: String, enum: ['weekly', 'monthly', 'quarterly', 'yearly'], required: true },
    dayOfMonth:      { type: Number, default: 1, min: 1, max: 28 },
    paymentTermDays: { type: Number, default: 14 },
    nextRunDate:     { type: Date, required: true },
    lastRunAt:       { type: Date },
    lineItems:       { type: [LineItemSchema], default: [] },
    notes:           { type: String, default: '' },
    createdBy:       { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'm3_recurring_invoices' }
);

RecurringInvoiceSchema.index({ tenantId: 1, status: 1, nextRunDate: 1 });

export const RecurringInvoice = model<IRecurringInvoice>('M3RecurringInvoice', RecurringInvoiceSchema);
