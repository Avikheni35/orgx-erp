import { Schema, model, Document, Types } from 'mongoose';

export type AccrualType   = 'arap' | 'prap';
export type AccrualStatus = 'draft' | 'posted' | 'reversed' | 'cancelled';

export interface IAccrual extends Document {
  tenantId:                 Types.ObjectId;
  accrualNumber:            string;
  type:                     AccrualType;
  description:              string;
  accrualAccount:           string;
  contraAccount:            string;
  amountCents:              number;
  postDate:                 Date;
  startDate:                Date;
  endDate:                  Date;
  referenceDocument?:       string;
  notes?:                   string;
  status:                   AccrualStatus;
  journalEntryId?:          Types.ObjectId;
  reversalJournalEntryId?:  Types.ObjectId;
  createdBy?:               Types.ObjectId;
  createdAt:                Date;
  updatedAt:                Date;
}

const AccrualSchema = new Schema<IAccrual>({
  tenantId:                { type: Schema.Types.ObjectId, required: true },
  accrualNumber:           { type: String, required: true, trim: true },
  type:                    { type: String, enum: ['arap', 'prap'], required: true },
  description:             { type: String, required: true },
  accrualAccount:          { type: String, required: true },
  contraAccount:           { type: String, required: true },
  amountCents:             { type: Number, required: true, min: 1 },
  postDate:                { type: Date, required: true },
  startDate:               { type: Date, required: true },
  endDate:                 { type: Date, required: true },
  referenceDocument:       { type: String, default: '' },
  notes:                   { type: String, default: '' },
  status:                  { type: String, enum: ['draft', 'posted', 'reversed', 'cancelled'], default: 'draft' },
  journalEntryId:          { type: Schema.Types.ObjectId },
  reversalJournalEntryId:  { type: Schema.Types.ObjectId },
  createdBy:               { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_accruals' });

AccrualSchema.index({ tenantId: 1, accrualNumber: 1 }, { unique: true });
AccrualSchema.index({ tenantId: 1, status: 1 });
AccrualSchema.index({ tenantId: 1, type: 1 });
AccrualSchema.index({ tenantId: 1, endDate: 1 });

export const Accrual = model<IAccrual>('M3Accrual', AccrualSchema);
