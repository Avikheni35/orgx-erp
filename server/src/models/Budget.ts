import { Schema, model, Document, Types } from 'mongoose';

export type BudgetPeriod = 'annual' | 'monthly';

export interface IBudget extends Document {
  tenantId:      Types.ObjectId;
  fiscalYearId:  Types.ObjectId;
  name:          string;
  accountNumber: string;
  costCenterId?: Types.ObjectId;
  budgetCents:   number;
  period:        BudgetPeriod;
  note:          string;
  createdBy?:    Types.ObjectId;
  createdAt:     Date;
  updatedAt:     Date;
}

const BudgetSchema = new Schema<IBudget>({
  tenantId:      { type: Schema.Types.ObjectId, required: true },
  fiscalYearId:  { type: Schema.Types.ObjectId, required: true },
  name:          { type: String, required: true, trim: true },
  accountNumber: { type: String, required: true, trim: true },
  costCenterId:  { type: Schema.Types.ObjectId },
  budgetCents:   { type: Number, required: true, default: 0 },
  period:        { type: String, enum: ['annual', 'monthly'], default: 'annual' },
  note:          { type: String, default: '' },
  createdBy:     { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_budgets' });

BudgetSchema.index({ tenantId: 1, fiscalYearId: 1 });
BudgetSchema.index({ tenantId: 1, accountNumber: 1, fiscalYearId: 1 });

export const Budget = model<IBudget>('M3Budget', BudgetSchema);
