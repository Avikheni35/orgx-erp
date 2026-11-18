import { Schema, model, Document, Types } from 'mongoose';

export interface IProductVariant extends Document {
  tenantId:          Types.ObjectId;
  productId:         Types.ObjectId;
  attributes:        Record<string, string>; // { Size: 'M', Color: 'Blue' }
  sku:               string;
  barcode:           string;
  costPriceCents:    number;
  unitPriceCents:    number;   // 0 = inherit from product default
  stockQuantity:     number;
  lowStockThreshold: number;
  isActive:          boolean;
  createdAt:         Date;
  updatedAt:         Date;
}

const ProductVariantSchema = new Schema<IProductVariant>(
  {
    tenantId:          { type: Schema.Types.ObjectId, required: true },
    productId:         { type: Schema.Types.ObjectId, required: true },
    attributes:        { type: Map, of: String, default: {} },
    sku:               { type: String, default: '' },
    barcode:           { type: String, default: '' },
    costPriceCents:    { type: Number, default: 0 },
    unitPriceCents:    { type: Number, default: 0 },
    stockQuantity:     { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 0 },
    isActive:          { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'm3_product_variants' }
);

ProductVariantSchema.index({ tenantId: 1, productId: 1 });
ProductVariantSchema.index({ tenantId: 1, sku: 1 }, { sparse: true });
ProductVariantSchema.index({ tenantId: 1, barcode: 1 }, { sparse: true });

export const ProductVariant = model<IProductVariant>('M3ProductVariant', ProductVariantSchema);
