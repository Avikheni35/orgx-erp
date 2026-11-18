import { Schema, model, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  tenantId:             Types.ObjectId;
  name:                 string;
  sku:                  string;
  categoryId?:          Types.ObjectId;
  description:          string;
  unit:                 string;
  vatRate:              number;
  isService:            boolean;   // true = no stock tracking (consulting, hours, etc.)
  hasVariants:          boolean;   // true = stock lives on ProductVariant documents
  variantAttributes:    string[];  // e.g. ['Size', 'Color'] or ['Design']
  // used when hasVariants = false
  costPriceCents:       number;
  defaultUnitPriceCents: number;
  stockQuantity:        number;
  lowStockThreshold:    number;
  barcode:              string;
  isActive:             boolean;
  notes:                string;
  createdAt:            Date;
  updatedAt:            Date;
}

const ProductSchema = new Schema<IProduct>(
  {
    tenantId:              { type: Schema.Types.ObjectId, required: true },
    name:                  { type: String, required: true, trim: true },
    sku:                   { type: String, default: '' },
    categoryId:            { type: Schema.Types.ObjectId, default: null },
    description:           { type: String, default: '' },
    unit:                  { type: String, default: 'Stück' },
    vatRate:               { type: Number, default: 19 },
    isService:             { type: Boolean, default: false },
    hasVariants:           { type: Boolean, default: false },
    variantAttributes:     [{ type: String }],
    costPriceCents:        { type: Number, default: 0 },
    defaultUnitPriceCents: { type: Number, default: 0 },
    stockQuantity:         { type: Number, default: 0 },
    lowStockThreshold:     { type: Number, default: 0 },
    barcode:               { type: String, default: '' },
    isActive:              { type: Boolean, default: true },
    notes:                 { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_products' }
);

ProductSchema.index({ tenantId: 1, sku: 1 }, { unique: true, sparse: true });
ProductSchema.index({ tenantId: 1, categoryId: 1 });
ProductSchema.index({ tenantId: 1, isActive: 1 });
ProductSchema.index({ tenantId: 1, name: 'text', sku: 'text' });

export const Product = model<IProduct>('M3Product', ProductSchema);
