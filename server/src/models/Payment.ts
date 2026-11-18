import { Schema, model, Document, Types } from 'mongoose';

export type PaymentDirection = 'incoming' | 'outgoing';

export interface IPaymentAllocation {
  invoiceType: 'SalesInvoice' | 'VendorInvoice';
  invoiceId:   Types.ObjectId;
  invoiceNumber: string;
  amountCents: number;
}

export interface IPayment extends Document {
  tenantId:      Types.ObjectId;
  paymentNumber: string;
  date:          Date;
  direction:     PaymentDirection;
  amountCents:   number;
  bankAccount:   string;
  bankAccountName: string;
  description:   string;
  allocations:   IPaymentAllocation[];
  journalEntryId?: Types.ObjectId;
  createdBy:     Types.ObjectId;
  createdAt:     Date;
  updatedAt:     Date;
}

const AllocationSchema = new Schema<IPaymentAllocation>({
  invoiceType:   { type: String, enum: ['SalesInvoice', 'VendorInvoice'], required: true },
  invoiceId:     { type: Schema.Types.ObjectId, required: true },
  invoiceNumber: { type: String, required: true },
  amountCents:   { type: Number, required: true, min: 1 },
}, { _id: false });

const PaymentSchema = new Schema<IPayment>(
  {
    tenantId:        { type: Schema.Types.ObjectId, required: true },
    paymentNumber:   { type: String, required: true },
    date:            { type: Date, required: true },
    direction:       { type: String, enum: ['incoming', 'outgoing'], required: true },
    amountCents:     { type: Number, required: true, min: 1 },
    bankAccount:     { type: String, required: true },
    bankAccountName: { type: String, default: '' },
    description:     { type: String, required: true, trim: true },
    allocations:     { type: [AllocationSchema], default: [] },
    journalEntryId:  { type: Schema.Types.ObjectId },
    createdBy:       { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: true, collection: 'm3_payments' }
);

PaymentSchema.index({ tenantId: 1, paymentNumber: 1 }, { unique: true });
PaymentSchema.index({ tenantId: 1, date: -1 });
PaymentSchema.index({ tenantId: 1, direction: 1 });
PaymentSchema.index({ tenantId: 1, 'allocations.invoiceId': 1 });

export const Payment = model<IPayment>('M3Payment', PaymentSchema);
