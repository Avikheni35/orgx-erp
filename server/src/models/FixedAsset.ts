import { Schema, model, Document, Types } from 'mongoose';

export type AssetStatus = 'active' | 'fully_depreciated' | 'disposed';
export type DepreciationMethod = 'linear' | 'none';

export interface IFixedAsset extends Document {
  tenantId:                    Types.ObjectId;
  assetNumber:                 string;
  name:                        string;
  category:                    string;
  description:                 string;
  acquisitionDate:             Date;
  acquisitionCostCents:        number;
  residualValueCents:          number;
  usefulLifeMonths:            number;
  depreciationMethod:          DepreciationMethod;
  assetAccount:                string;
  depreciationExpenseAccount:  string;
  accumulatedDepAccount:       string;
  monthlyDepreciationCents:    number;
  accumulatedDepreciationCents: number;
  lastDepreciationDate?:       Date;
  status:                      AssetStatus;
  disposedAt?:                 Date;
  disposalProceedsCents:       number;
  createdBy:                   Types.ObjectId;
  createdAt:                   Date;
  updatedAt:                   Date;
}

const FixedAssetSchema = new Schema<IFixedAsset>(
  {
    tenantId:                    { type: Schema.Types.ObjectId, required: true },
    assetNumber:                 { type: String, required: true },
    name:                        { type: String, required: true, trim: true },
    category:                    { type: String, default: '' },
    description:                 { type: String, default: '' },
    acquisitionDate:             { type: Date, required: true },
    acquisitionCostCents:        { type: Number, required: true, min: 1 },
    residualValueCents:          { type: Number, default: 0 },
    usefulLifeMonths:            { type: Number, required: true, min: 1 },
    depreciationMethod:          { type: String, enum: ['linear', 'none'], default: 'linear' },
    assetAccount:                { type: String, required: true },
    depreciationExpenseAccount:  { type: String, required: true },
    accumulatedDepAccount:       { type: String, required: true },
    monthlyDepreciationCents:    { type: Number, default: 0 },
    accumulatedDepreciationCents:{ type: Number, default: 0 },
    lastDepreciationDate:        { type: Date },
    status:                      { type: String, enum: ['active', 'fully_depreciated', 'disposed'], default: 'active' },
    disposedAt:                  { type: Date },
    disposalProceedsCents:       { type: Number, default: 0 },
    createdBy:                   { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'm3_fixed_assets' }
);

FixedAssetSchema.index({ tenantId: 1, assetNumber: 1 }, { unique: true });
FixedAssetSchema.index({ tenantId: 1, status: 1 });
FixedAssetSchema.index({ tenantId: 1, category: 1 });

export const FixedAsset = model<IFixedAsset>('M3FixedAsset', FixedAssetSchema);
