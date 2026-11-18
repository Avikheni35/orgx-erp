import mongoose, { Document, Schema, Types } from 'mongoose';

export interface ICostCenter extends Document {
  tenantId:        Types.ObjectId;
  number:          string;
  name:            string;
  description:     string;
  annualBudgetCents: number;
  isActive:        boolean;
  createdBy?:      Types.ObjectId;
  createdAt:       Date;
  updatedAt:       Date;
}

const costCenterSchema = new Schema<ICostCenter>({
  tenantId:          { type: Schema.Types.ObjectId, required: true, index: true },
  number:            { type: String, required: true, trim: true },
  name:              { type: String, required: true, trim: true },
  description:       { type: String, default: '' },
  annualBudgetCents: { type: Number, default: 0, min: 0 },
  isActive:          { type: Boolean, default: true },
  createdBy:         { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_cost_centers' });

costCenterSchema.index({ tenantId: 1, number: 1 }, { unique: true });

export const CostCenter = mongoose.model<ICostCenter>('CostCenter', costCenterSchema);
