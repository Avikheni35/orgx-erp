import { Schema, model, Document, Types } from 'mongoose';

export type FilingType   = 'uva' | 'zm' | 'lsz';
export type FilingStatus = 'draft' | 'ready' | 'submitted' | 'confirmed' | 'rejected';
export type PeriodType   = 'monthly' | 'quarterly';

export interface IElsterFiling extends Document {
  tenantId:             Types.ObjectId;
  filingNumber:         string;
  type:                 FilingType;
  year:                 number;
  period:               number;
  periodType:           PeriodType;

  // UVA data (Umsatzsteuervoranmeldung)
  taxableRevenue19:     number;
  taxableRevenue7:      number;
  taxableRevenue0:      number;
  outputTax19:          number;
  outputTax7:           number;
  inputTax:             number;
  netTaxPayable:        number;

  status:               FilingStatus;
  submittedAt?:         Date;
  confirmationNumber?:  string;
  notes:                string;
  createdBy?:           Types.ObjectId;
  createdAt:            Date;
  updatedAt:            Date;
}

const ElsterFilingSchema = new Schema<IElsterFiling>({
  tenantId:            { type: Schema.Types.ObjectId, required: true },
  filingNumber:        { type: String, required: true, trim: true },
  type:                { type: String, enum: ['uva', 'zm', 'lsz'], default: 'uva' },
  year:                { type: Number, required: true },
  period:              { type: Number, required: true },
  periodType:          { type: String, enum: ['monthly', 'quarterly'], default: 'monthly' },

  taxableRevenue19:    { type: Number, default: 0 },
  taxableRevenue7:     { type: Number, default: 0 },
  taxableRevenue0:     { type: Number, default: 0 },
  outputTax19:         { type: Number, default: 0 },
  outputTax7:          { type: Number, default: 0 },
  inputTax:            { type: Number, default: 0 },
  netTaxPayable:       { type: Number, default: 0 },

  status:              { type: String, enum: ['draft', 'ready', 'submitted', 'confirmed', 'rejected'], default: 'draft' },
  submittedAt:         { type: Date },
  confirmationNumber:  { type: String, default: '' },
  notes:               { type: String, default: '' },
  createdBy:           { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_elster_filings' });

ElsterFilingSchema.index({ tenantId: 1, filingNumber: 1 }, { unique: true });
ElsterFilingSchema.index({ tenantId: 1, year: 1, period: 1, type: 1 });
ElsterFilingSchema.index({ tenantId: 1, status: 1 });

export const ElsterFiling = model<IElsterFiling>('M3ElsterFiling', ElsterFilingSchema);
