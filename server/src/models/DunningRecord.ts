import { Schema, model, Document, Types } from 'mongoose';

export interface IDunningRecord extends Document {
  tenantId:       Types.ObjectId;
  invoiceId:      Types.ObjectId;
  customerId:     Types.ObjectId;
  invoiceNumber:  string;
  companyName:    string;
  level:          1 | 2 | 3;
  issuedAt:       Date;
  dunningDueDate: Date;
  feeCents:       number;
  notes?:         string;
  createdAt:      Date;
  updatedAt:      Date;
}

const DunningRecordSchema = new Schema<IDunningRecord>(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true },
    invoiceId:      { type: Schema.Types.ObjectId, required: true },
    customerId:     { type: Schema.Types.ObjectId, required: true },
    invoiceNumber:  { type: String, required: true },
    companyName:    { type: String, required: true },
    level:          { type: Number, enum: [1, 2, 3], required: true },
    issuedAt:       { type: Date, required: true },
    dunningDueDate: { type: Date, required: true },
    feeCents:       { type: Number, default: 0 },
    notes:          { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_dunning_records' }
);

DunningRecordSchema.index({ tenantId: 1, invoiceId: 1 });
DunningRecordSchema.index({ tenantId: 1, issuedAt: -1 });
DunningRecordSchema.index({ tenantId: 1, customerId: 1 });

export const DunningRecord = model<IDunningRecord>('M3DunningRecord', DunningRecordSchema);
