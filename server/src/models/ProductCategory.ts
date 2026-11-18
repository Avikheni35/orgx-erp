import { Schema, model, Document, Types } from 'mongoose';

export interface IProductCategory extends Document {
  tenantId:    Types.ObjectId;
  name:        string;
  parentId?:   Types.ObjectId;
  description?: string;
  sortOrder:   number;
  isActive:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

const ProductCategorySchema = new Schema<IProductCategory>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    name:        { type: String, required: true, trim: true },
    parentId:    { type: Schema.Types.ObjectId, default: null },
    description: { type: String, default: '' },
    sortOrder:   { type: Number, default: 0 },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'm3_product_categories' }
);

ProductCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
ProductCategorySchema.index({ tenantId: 1, parentId: 1 });

export const ProductCategory = model<IProductCategory>('M3ProductCategory', ProductCategorySchema);
