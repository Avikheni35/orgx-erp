import { Schema, model, Document, Types } from 'mongoose';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface IAccount extends Document {
  tenantId: Types.ObjectId;
  number: string;
  name: string;
  type: AccountType;
  subtype?: string;
  taxCode?: string;
  parentNumber?: string;
  isActive: boolean;
  isLocked: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    tenantId:     { type: Schema.Types.ObjectId, required: true },
    number:       { type: String, required: true, trim: true },
    name:         { type: String, required: true, trim: true },
    type:         { type: String, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'], required: true },
    subtype:      { type: String, default: '' },
    taxCode:      { type: String, default: '' },
    parentNumber: { type: String, default: '' },
    isActive:     { type: Boolean, default: true },
    isLocked:     { type: Boolean, default: false },
    notes:        { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_accounts' }
);

AccountSchema.index({ tenantId: 1, number: 1 }, { unique: true });
AccountSchema.index({ tenantId: 1, type: 1, number: 1 });

export const Account = model<IAccount>('M3Account', AccountSchema);
