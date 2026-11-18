import { Schema, model, Document, Types } from 'mongoose';

export type PurchaseOrderStatus =
  | 'draft'
  | 'sent'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface IPOLineItem {
  description:      string;
  unit:             string;
  quantity:         number;
  unitPriceCents:   number;
  vatRate:          number;
  lineTotalCents:   number;
  vatAmountCents:   number;
  receivedQuantity: number;
  serviceItemId?:   string;
  productId?:       string;
  variantId?:       string;
}

export interface IPurchaseOrder extends Document {
  tenantId:                  Types.ObjectId;
  poNumber:                  string;
  supplierId:                Types.ObjectId;
  supplierName:              string;
  supplierAddress:           string;
  orderDate:                 Date;
  expectedDeliveryDate?:     Date;
  status:                    PurchaseOrderStatus;
  lineItems:                 IPOLineItem[];
  subtotalCents:             number;
  vatTotalCents:             number;
  totalCents:                number;
  currency:                  string;
  deliveryAddress:           string;
  notes:                     string;
  internalNotes:             string;
  convertedToVendorInvoiceId?: Types.ObjectId;
  createdBy:                 Types.ObjectId;
  createdAt:                 Date;
  updatedAt:                 Date;
}

const lineItemSchema = new Schema<IPOLineItem>({
  description:      { type: String, default: '' },
  unit:             { type: String, default: 'Stück' },
  quantity:         { type: Number, required: true, min: 0 },
  unitPriceCents:   { type: Number, required: true, min: 0 },
  vatRate:          { type: Number, default: 19 },
  lineTotalCents:   { type: Number, default: 0 },
  vatAmountCents:   { type: Number, default: 0 },
  receivedQuantity: { type: Number, default: 0 },
  serviceItemId:    { type: String, default: '' },
  productId:        { type: String, default: '' },
  variantId:        { type: String, default: '' },
}, { _id: false });

const purchaseOrderSchema = new Schema<IPurchaseOrder>({
  tenantId:                  { type: Schema.Types.ObjectId, required: true },
  poNumber:                  { type: String, required: true },
  supplierId:                { type: Schema.Types.ObjectId, required: true, ref: 'M3Supplier' },
  supplierName:              { type: String, required: true },
  supplierAddress:           { type: String, default: '' },
  orderDate:                 { type: Date, required: true },
  expectedDeliveryDate:      { type: Date },
  status:                    { type: String, enum: ['draft','sent','partially_received','received','cancelled'], default: 'draft' },
  lineItems:                 { type: [lineItemSchema], default: [] },
  subtotalCents:             { type: Number, default: 0 },
  vatTotalCents:             { type: Number, default: 0 },
  totalCents:                { type: Number, default: 0 },
  currency:                  { type: String, default: 'EUR' },
  deliveryAddress:           { type: String, default: '' },
  notes:                     { type: String, default: '' },
  internalNotes:             { type: String, default: '' },
  convertedToVendorInvoiceId:{ type: Schema.Types.ObjectId },
  createdBy:                 { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true, collection: 'm3_purchase_orders' });

purchaseOrderSchema.index({ tenantId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ tenantId: 1, status: 1 });
purchaseOrderSchema.index({ tenantId: 1, supplierId: 1 });

export const PurchaseOrder = model<IPurchaseOrder>('M3PurchaseOrder', purchaseOrderSchema);
