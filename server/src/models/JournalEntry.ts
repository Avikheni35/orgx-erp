import { Schema, model, Document, Types } from 'mongoose';

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed';

export interface IJournalLine {
  accountNumber: string;
  accountName:   string;
  debit:         number;
  credit:        number;
  costCenter?:   string;
  description?:  string;
}

export interface IJournalEntry extends Document {
  tenantId:      Types.ObjectId;
  entryNumber:   string;
  date:          Date;
  description:   string;
  reference?:    string;
  status:        JournalEntryStatus;
  lines:         IJournalLine[];
  totalDebit:    number;
  totalCredit:   number;
  periodId?:     Types.ObjectId;
  fiscalYearId?: Types.ObjectId;
  reversalOf?:   Types.ObjectId;
  reversedBy?:   Types.ObjectId;
  gobdHash:      string;
  sourceType?:   'VendorInvoice' | 'SalesInvoice' | 'Payment' | 'OpeningBalance' | 'Closing' | 'M2Payment';
  sourceId?:     Types.ObjectId;
  createdBy:     Types.ObjectId;
  postedAt?:     Date;
  postedBy?:     Types.ObjectId;
  syncId?:       string;
  source?:       'm2' | 'm3';
  sourceSnapshot?: { m2RefId: string; description: string; source: 'm2' };
  createdAt:     Date;
  updatedAt:     Date;
}

const LineSchema = new Schema<IJournalLine>(
  {
    accountNumber: { type: String, required: true },
    accountName:   { type: String, required: true },
    debit:         { type: Number, default: 0, min: 0 },
    credit:        { type: Number, default: 0, min: 0 },
    costCenter:    { type: String, default: '' },
    description:   { type: String, default: '' },
  },
  { _id: false }
);

const JournalEntrySchema = new Schema<IJournalEntry>(
  {
    tenantId:      { type: Schema.Types.ObjectId, required: true },
    entryNumber:   { type: String, required: true },
    date:          { type: Date, required: true },
    description:   { type: String, required: true, trim: true },
    reference:     { type: String, default: '' },
    status:        { type: String, enum: ['draft', 'posted', 'reversed'], default: 'draft' },
    lines:         { type: [LineSchema], required: true },
    totalDebit:    { type: Number, required: true },
    totalCredit:   { type: Number, required: true },
    periodId:      { type: Schema.Types.ObjectId },
    fiscalYearId:  { type: Schema.Types.ObjectId },
    reversalOf:    { type: Schema.Types.ObjectId },
    reversedBy:    { type: Schema.Types.ObjectId },
    gobdHash:      { type: String, required: true },
    sourceType:    { type: String, enum: ['VendorInvoice', 'SalesInvoice', 'Payment', 'OpeningBalance', 'Closing', 'M2Payment'] },
    sourceId:      { type: Schema.Types.ObjectId },
    createdBy:     { type: Schema.Types.ObjectId, required: true },
    postedAt:      { type: Date },
    postedBy:      { type: Schema.Types.ObjectId },
    syncId:        { type: String },
    source:        { type: String, enum: ['m2', 'm3'], default: 'm3' },
    sourceSnapshot: {
      m2RefId:     String,
      description: String,
      source:      { type: String, default: 'm2' },
    },
  },
  { timestamps: true, collection: 'm3_journal_entries' }
);

JournalEntrySchema.index({ syncId: 1 }, { unique: true, sparse: true });
JournalEntrySchema.index({ tenantId: 1, entryNumber: 1 }, { unique: true });
JournalEntrySchema.index({ tenantId: 1, date: -1 });
JournalEntrySchema.index({ tenantId: 1, status: 1 });
JournalEntrySchema.index({ tenantId: 1, fiscalYearId: 1, date: -1 });
JournalEntrySchema.index({ tenantId: 1, 'lines.accountNumber': 1 });
JournalEntrySchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 });

export const JournalEntry = model<IJournalEntry>('M3JournalEntry', JournalEntrySchema);
