import { Schema, model, Document, Types } from 'mongoose';

export interface IPriceList extends Document {
  tenantId:        Types.ObjectId;
  name:            string;          // "Gold Wholesaler", "Retail", "Staff"
  description:     string;
  isDefault:       boolean;         // fallback when customer has no assigned list
  discountPercent: number;          // flat % off all products (0 = no blanket discount)
  currency:        string;
  isActive:        boolean;
  createdAt:       Date;
  updatedAt:       Date;
}

const PriceListSchema = new Schema<IPriceList>(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true },
    name:            { type: String, required: true, trim: true },
    description:     { type: String, default: '' },
    isDefault:       { type: Boolean, default: false },
    discountPercent: { type: Number, default: 0 },
    currency:        { type: String, default: 'EUR' },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'm3_price_lists' }
);

PriceListSchema.index({ tenantId: 1, isDefault: 1 });
PriceListSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const PriceList = model<IPriceList>('M3PriceList', PriceListSchema);
