import { Schema, model, Document, Types } from 'mongoose';

export type PeriodStatus = 'open' | 'closed' | 'locked';

export interface IPeriod extends Document {
  tenantId: Types.ObjectId;
  fiscalYearId: Types.ObjectId;
  name: string;
  number: number;
  startDate: Date;
  endDate: Date;
  status: PeriodStatus;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PeriodSchema = new Schema<IPeriod>(
  {
    tenantId:     { type: Schema.Types.ObjectId, required: true },
    fiscalYearId: { type: Schema.Types.ObjectId, required: true },
    name:         { type: String, required: true, trim: true },
    number:       { type: Number, required: true },
    startDate:    { type: Date, required: true },
    endDate:      { type: Date, required: true },
    status:       { type: String, enum: ['open', 'closed', 'locked'], default: 'open' },
    closedAt:     { type: Date },
    closedBy:     { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'm3_periods' }
);

PeriodSchema.index({ tenantId: 1, fiscalYearId: 1, number: 1 }, { unique: true });
PeriodSchema.index({ tenantId: 1, startDate: 1 });
PeriodSchema.index({ tenantId: 1, status: 1 });

export const Period = model<IPeriod>('M3Period', PeriodSchema);
