import { Schema, model, Document, Types } from 'mongoose';

export interface IFxRate extends Document {
  tenantId:       Types.ObjectId;
  baseCurrency:   string;
  quoteCurrency:  string;
  rate:           number;
  date:           Date;
  source:         'manual' | 'ecb';
  createdBy?:     Types.ObjectId;
  createdAt:      Date;
  updatedAt:      Date;
}

const FxRateSchema = new Schema<IFxRate>({
  tenantId:      { type: Schema.Types.ObjectId, required: true },
  baseCurrency:  { type: String, default: 'EUR', uppercase: true, trim: true },
  quoteCurrency: { type: String, required: true, uppercase: true, trim: true },
  rate:          { type: Number, required: true, min: 0.000001 },
  date:          { type: Date, required: true },
  source:        { type: String, enum: ['manual', 'ecb'], default: 'manual' },
  createdBy:     { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_fx_rates' });

FxRateSchema.index({ tenantId: 1, quoteCurrency: 1, date: -1 });
FxRateSchema.index({ tenantId: 1, baseCurrency: 1, quoteCurrency: 1, date: 1 }, { unique: true });

export const FxRate = model<IFxRate>('M3FxRate', FxRateSchema);
