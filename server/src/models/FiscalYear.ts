import { Schema, model, Document, Types } from 'mongoose';

export type FiscalYearStatus = 'open' | 'closed' | 'locked';

export interface IFiscalYear extends Document {
  tenantId: Types.ObjectId;
  name: string;
  startDate: Date;
  endDate: Date;
  status: FiscalYearStatus;
  closedAt?: Date;
  closedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FiscalYearSchema = new Schema<IFiscalYear>(
  {
    tenantId:  { type: Schema.Types.ObjectId, required: true },
    name:      { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
    status:    { type: String, enum: ['open', 'closed', 'locked'], default: 'open' },
    closedAt:  { type: Date },
    closedBy:  { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'm3_fiscalyears' }
);

FiscalYearSchema.index({ tenantId: 1, startDate: 1 });
FiscalYearSchema.index({ tenantId: 1, status: 1 });

export const FiscalYear = model<IFiscalYear>('M3FiscalYear', FiscalYearSchema);
