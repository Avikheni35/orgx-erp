import { Schema, model, Document, Types } from 'mongoose';

export type MandateType     = 'CORE' | 'B2B';
export type MandateSequence = 'FRST' | 'RCUR' | 'OOFF' | 'FNAL';
export type MandateStatus   = 'active' | 'inactive' | 'cancelled';

export interface ISepaMandate extends Document {
  tenantId:          Types.ObjectId;
  mandateReference:  string;
  type:              MandateType;
  sequence:          MandateSequence;
  customerId:        Types.ObjectId;
  customerName:      string;
  iban:              string;
  bic:               string;
  signedAt:          Date;
  creditorId:        string;
  status:            MandateStatus;
  notes:             string;
  createdAt:         Date;
  updatedAt:         Date;
}

const SepaMandateSchema = new Schema<ISepaMandate>({
  tenantId:         { type: Schema.Types.ObjectId, required: true },
  mandateReference: { type: String, required: true, trim: true },
  type:             { type: String, enum: ['CORE', 'B2B'], default: 'CORE' },
  sequence:         { type: String, enum: ['FRST', 'RCUR', 'OOFF', 'FNAL'], default: 'FRST' },
  customerId:       { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
  customerName:     { type: String, default: '' },
  iban:             { type: String, required: true },
  bic:              { type: String, default: '' },
  signedAt:         { type: Date, required: true },
  creditorId:       { type: String, default: '' },
  status:           { type: String, enum: ['active', 'inactive', 'cancelled'], default: 'active' },
  notes:            { type: String, default: '' },
}, { timestamps: true, collection: 'm3_sepa_mandates' });

SepaMandateSchema.index({ tenantId: 1, mandateReference: 1 }, { unique: true });
SepaMandateSchema.index({ tenantId: 1, customerId: 1 });
SepaMandateSchema.index({ tenantId: 1, status: 1 });

export const SepaMandate = model<ISepaMandate>('M3SepaMandate', SepaMandateSchema);
