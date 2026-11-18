import { Schema, model, Document, Types } from 'mongoose';

export type InventoryMovementType = 'purchase' | 'sale' | 'adjustment';

export interface IInventoryMovement extends Document {
  tenantId:        Types.ObjectId;
  serviceItemId?:  Types.ObjectId;  // legacy ServiceItem reference
  productId?:      Types.ObjectId;  // new Product catalog reference
  variantId?:      Types.ObjectId;  // new ProductVariant reference (when applicable)
  itemName:        string;
  itemCategory:    string;
  type:            InventoryMovementType;
  quantity:        number;        // positive = in (purchase), negative = out (sale)
  unitCostCents:   number;        // price per unit at time of movement
  totalCents:      number;        // abs(quantity) * unitCostCents
  stockAfter:      number;        // running stock level after this movement
  sourceType:      'VendorInvoice' | 'SalesInvoice' | 'PurchaseOrder' | 'manual';
  sourceId:        Types.ObjectId;
  sourceNumber:    string;        // e.g. EK-2026-001 or RE-2026-001
  lineDescription: string;        // e.g. "Vollmilch × 10 Stück"
  journalEntryId?: Types.ObjectId;
  createdAt:       Date;
  updatedAt:       Date;
}

const InventoryMovementSchema = new Schema<IInventoryMovement>(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true },
    serviceItemId:   { type: Schema.Types.ObjectId },
    productId:       { type: Schema.Types.ObjectId },
    variantId:       { type: Schema.Types.ObjectId },
    itemName:        { type: String, default: '' },
    itemCategory:    { type: String, default: '' },
    type:            { type: String, enum: ['purchase', 'sale', 'adjustment'], required: true },
    quantity:        { type: Number, required: true },
    unitCostCents:   { type: Number, default: 0 },
    totalCents:      { type: Number, default: 0 },
    stockAfter:      { type: Number, default: 0 },
    sourceType:      { type: String, enum: ['VendorInvoice', 'SalesInvoice', 'PurchaseOrder', 'manual'], required: true },
    sourceId:        { type: Schema.Types.ObjectId, required: true },
    sourceNumber:    { type: String, default: '' },
    lineDescription: { type: String, default: '' },
    journalEntryId:  { type: Schema.Types.ObjectId },
  },
  { timestamps: true, collection: 'm3_inventory_movements' }
);

InventoryMovementSchema.index({ tenantId: 1, serviceItemId: 1, createdAt: -1 }, { sparse: true });
InventoryMovementSchema.index({ tenantId: 1, productId: 1, variantId: 1, createdAt: -1 }, { sparse: true });
InventoryMovementSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 });
InventoryMovementSchema.index({ tenantId: 1, type: 1 });

export const InventoryMovement = model<IInventoryMovement>('M3InventoryMovement', InventoryMovementSchema);
