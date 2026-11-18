import { Schema, model, Document, Types } from 'mongoose';

export interface IBankAccount extends Document {
  tenantId:       Types.ObjectId;
  accountName:    string;
  bankName:       string;
  iban:           string;
  bic:            string;
  accountHolder:  string;
  currency:       string;
  isDefault:      boolean;
  glAccount:      string;
  notes:          string;
  isActive:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const BankAccountSchema = new Schema<IBankAccount>({
  tenantId:      { type: Schema.Types.ObjectId, required: true },
  accountName:   { type: String, required: true, trim: true },
  bankName:      { type: String, default: '' },
  iban:          { type: String, required: true, trim: true },
  bic:           { type: String, default: '' },
  accountHolder: { type: String, default: '' },
  currency:      { type: String, default: 'EUR' },
  isDefault:     { type: Boolean, default: false },
  glAccount:     { type: String, default: '1200' },
  notes:         { type: String, default: '' },
  isActive:      { type: Boolean, default: true },
}, { timestamps: true, collection: 'm3_bank_accounts' });

BankAccountSchema.index({ tenantId: 1, iban: 1 }, { unique: true });
BankAccountSchema.index({ tenantId: 1, isDefault: 1 });
BankAccountSchema.index({ tenantId: 1, isActive: 1 });

export const BankAccount = model<IBankAccount>('M3BankAccount', BankAccountSchema);
