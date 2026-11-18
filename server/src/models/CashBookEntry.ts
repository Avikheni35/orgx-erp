import { Schema, model, Document, Types } from 'mongoose';

export type CashEntryType = 'receipt' | 'payment';

export interface ICashBookEntry extends Document {
  tenantId:       Types.ObjectId;
  entryNumber:    string;
  date:           Date;
  type:           CashEntryType;
  description:    string;
  cashAccount:    string;
  cashAccountName: string;
  contraAccount:  string;
  contraAccountName: string;
  amountCents:    number;
  vatRate:        number;
  vatCents:       number;
  netCents:       number;
  journalEntryId?: Types.ObjectId;
  createdBy:      Types.ObjectId;
  createdAt:      Date;
  updatedAt:      Date;
}

const CashBookEntrySchema = new Schema<ICashBookEntry>(
  {
    tenantId:          { type: Schema.Types.ObjectId, required: true },
    entryNumber:       { type: String, required: true },
    date:              { type: Date, required: true },
    type:              { type: String, enum: ['receipt', 'payment'], required: true },
    description:       { type: String, required: true, trim: true },
    cashAccount:       { type: String, required: true },
    cashAccountName:   { type: String, default: '' },
    contraAccount:     { type: String, required: true },
    contraAccountName: { type: String, default: '' },
    amountCents:       { type: Number, required: true, min: 1 },
    vatRate:           { type: Number, default: 0 },
    vatCents:          { type: Number, default: 0 },
    netCents:          { type: Number, default: 0 },
    journalEntryId:    { type: Schema.Types.ObjectId },
    createdBy:         { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'm3_cashbook_entries' }
);

CashBookEntrySchema.index({ tenantId: 1, entryNumber: 1 }, { unique: true });
CashBookEntrySchema.index({ tenantId: 1, date: 1 });
CashBookEntrySchema.index({ tenantId: 1, cashAccount: 1, date: 1 });

export const CashBookEntry = model<ICashBookEntry>('M3CashBookEntry', CashBookEntrySchema);
