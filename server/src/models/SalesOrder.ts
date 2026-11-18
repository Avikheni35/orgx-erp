import { Schema, model, Document, Types } from 'mongoose';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'partially_delivered'
  | 'delivered'
  | 'invoiced'
  | 'cancelled';

export interface IOrderLineItem {
  serviceItemId?:       string;
  itemName?:            string;
  description:          string;
  unit:                 string;
  quantity:             number;
  unitPriceCents:       number;
  vatRate:              number;
  totalNetCents:        number;
  totalVatCents:        number;
  totalGrossCents:      number;
  deliveredQuantity:    number;
}

export interface ISalesOrder extends Document {
  tenantId:              Types.ObjectId;
  orderNumber:           string;
  customerId:            Types.ObjectId;
  customerName:          string;
  customerAddress:       string;
  quoteId?:              Types.ObjectId;
  quoteNumber?:          string;
  orderDate:             Date;
  deliveryDate?:         Date;
  status:                OrderStatus;
  lineItems:             IOrderLineItem[];
  totalNetCents:         number;
  totalVatCents:         number;
  totalGrossCents:       number;
  currency:              string;
  deliveryAddress:       string;
  notes:                 string;
  internalNotes:         string;
  convertedToInvoiceId?: Types.ObjectId;
  createdBy?:            Types.ObjectId;
  createdAt:             Date;
  updatedAt:             Date;
}

const LineItemSchema = new Schema<IOrderLineItem>({
  serviceItemId:     { type: String, default: '' },
  itemName:          { type: String, default: '' },
  description:       { type: String, default: '' },
  unit:              { type: String, default: 'Stück' },
  quantity:          { type: Number, required: true },
  unitPriceCents:    { type: Number, required: true },
  vatRate:           { type: Number, required: true, default: 19 },
  totalNetCents:     { type: Number, required: true },
  totalVatCents:     { type: Number, required: true },
  totalGrossCents:   { type: Number, required: true },
  deliveredQuantity: { type: Number, default: 0 },
}, { _id: true });

const SalesOrderSchema = new Schema<ISalesOrder>({
  tenantId:        { type: Schema.Types.ObjectId, required: true },
  orderNumber:     { type: String, required: true, trim: true },
  customerId:      { type: Schema.Types.ObjectId, required: true, ref: 'M3Customer' },
  customerName:    { type: String, default: '' },
  customerAddress: { type: String, default: '' },
  quoteId:         { type: Schema.Types.ObjectId, ref: 'M3SalesQuote' },
  quoteNumber:     { type: String, default: '' },
  orderDate:       { type: Date, required: true },
  deliveryDate:    { type: Date },
  status:          { type: String, enum: ['draft','confirmed','partially_delivered','delivered','invoiced','cancelled'], default: 'draft' },
  lineItems:       { type: [LineItemSchema], default: [] },
  totalNetCents:   { type: Number, default: 0 },
  totalVatCents:   { type: Number, default: 0 },
  totalGrossCents: { type: Number, default: 0 },
  currency:        { type: String, default: 'EUR' },
  deliveryAddress: { type: String, default: '' },
  notes:           { type: String, default: '' },
  internalNotes:   { type: String, default: '' },
  convertedToInvoiceId: { type: Schema.Types.ObjectId },
  createdBy:       { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_sales_orders' });

SalesOrderSchema.index({ tenantId: 1, orderNumber: 1 }, { unique: true });
SalesOrderSchema.index({ tenantId: 1, status: 1 });
SalesOrderSchema.index({ tenantId: 1, customerId: 1 });

export const SalesOrder = model<ISalesOrder>('M3SalesOrder', SalesOrderSchema);
