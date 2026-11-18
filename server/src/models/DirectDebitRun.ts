import { Schema, model, Document, Types } from 'mongoose';

export type RunStatus = 'draft' | 'submitted' | 'settled' | 'returned';

export interface IRunEntry {
  mandateId:        Types.ObjectId;
  mandateReference: string;
  customerId:       Types.ObjectId;
  customerName:     string;
  iban:             string;
  amountCents:      number;
  description:      string;
  invoiceRef:       string;
}

export interface IDirectDebitRun extends Document {
  tenantId:          Types.ObjectId;
  runNumber:         string;
  collectionDate:    Date;
  bankAccount:       string;
  status:            RunStatus;
  entries:           IRunEntry[];
  totalAmountCents:  number;
  notes:             string;
  journalEntryId?:   Types.ObjectId;
  createdBy?:        Types.ObjectId;
  createdAt:         Date;
  updatedAt:         Date;
}

const RunEntrySchema = new Schema<IRunEntry>({
  mandateId:        { type: Schema.Types.ObjectId, required: true },
  mandateReference: { type: String, default: '' },
  customerId:       { type: Schema.Types.ObjectId, required: true },
  customerName:     { type: String, default: '' },
  iban:             { type: String, default: '' },
  amountCents:      { type: Number, required: true, min: 1 },
  description:      { type: String, default: '' },
  invoiceRef:       { type: String, default: '' },
}, { _id: false });

const DirectDebitRunSchema = new Schema<IDirectDebitRun>({
  tenantId:         { type: Schema.Types.ObjectId, required: true },
  runNumber:        { type: String, required: true, trim: true },
  collectionDate:   { type: Date, required: true },
  bankAccount:      { type: String, default: '1200' },
  status:           { type: String, enum: ['draft', 'submitted', 'settled', 'returned'], default: 'draft' },
  entries:          { type: [RunEntrySchema], default: [] },
  totalAmountCents: { type: Number, default: 0 },
  notes:            { type: String, default: '' },
  journalEntryId:   { type: Schema.Types.ObjectId },
  createdBy:        { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_direct_debit_runs' });

DirectDebitRunSchema.index({ tenantId: 1, runNumber: 1 }, { unique: true });
DirectDebitRunSchema.index({ tenantId: 1, status: 1 });
DirectDebitRunSchema.index({ tenantId: 1, collectionDate: -1 });

export const DirectDebitRun = model<IDirectDebitRun>('M3DirectDebitRun', DirectDebitRunSchema);
