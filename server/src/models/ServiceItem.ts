import { Schema, model, Document, Types } from 'mongoose';

export interface IServiceItem extends Document {
  tenantId:              Types.ObjectId;
  name:                  string;
  description:           string;
  unit:                  string;
  category:              string;
  costPriceCents:        number;
  defaultUnitPriceCents: number;
  vatRate:               number;
  stockQuantity:         number;
  isActive:              boolean;
  notes?:                string;
  createdAt:             Date;
  updatedAt:             Date;
}

const ServiceItemSchema = new Schema<IServiceItem>(
  {
    tenantId:              { type: Schema.Types.ObjectId, required: true },
    name:                  { type: String, required: true, trim: true },
    description:           { type: String, default: '' },
    unit:                  { type: String, default: 'Stunde' },
    category:              { type: String, default: '' },
    costPriceCents:        { type: Number, default: 0 },
    defaultUnitPriceCents: { type: Number, default: 0 },
    vatRate:               { type: Number, default: 19 },
    stockQuantity:         { type: Number, default: 0 },
    isActive:              { type: Boolean, default: true },
    notes:                 { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_service_items' }
);

ServiceItemSchema.index({ tenantId: 1, name: 1 }, { unique: true });
ServiceItemSchema.index({ tenantId: 1, isActive: 1 });

export const ServiceItem = model<IServiceItem>('M3ServiceItem', ServiceItemSchema);
