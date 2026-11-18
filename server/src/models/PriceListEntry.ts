import { Schema, model, Document, Types } from 'mongoose';

export interface IPriceListEntry extends Document {
  tenantId:      Types.ObjectId;
  priceListId:   Types.ObjectId;
  productId:     Types.ObjectId;
  variantId?:    Types.ObjectId;  // null = applies to all variants of the product
  unitPriceCents: number;
  minQty:        number;          // minimum quantity for this price to apply (volume tiers)
  createdAt:     Date;
  updatedAt:     Date;
}

const PriceListEntrySchema = new Schema<IPriceListEntry>(
  {
    tenantId:       { type: Schema.Types.ObjectId, required: true },
    priceListId:    { type: Schema.Types.ObjectId, required: true },
    productId:      { type: Schema.Types.ObjectId, required: true },
    variantId:      { type: Schema.Types.ObjectId, default: null },
    unitPriceCents: { type: Number, required: true },
    minQty:         { type: Number, default: 1 },
  },
  { timestamps: true, collection: 'm3_price_list_entries' }
);

PriceListEntrySchema.index({ tenantId: 1, priceListId: 1, productId: 1, variantId: 1, minQty: 1 });
PriceListEntrySchema.index({ tenantId: 1, productId: 1 });

export const PriceListEntry = model<IPriceListEntry>('M3PriceListEntry', PriceListEntrySchema);
