import { Schema, model, Document, Types } from 'mongoose';

export interface IContact {
  name:      string;
  email?:    string;
  phone?:    string;
  position?: string;
  isPrimary: boolean;
}

export interface ICustomer extends Document {
  tenantId:          Types.ObjectId;
  customerNumber:    string;
  companyName:       string;
  legalForm?:        string;
  address: {
    street:  string;
    city:    string;
    zip:     string;
    country: string;
  };
  vatId?:            string;
  contacts:          IContact[];
  paymentTermsDays:  number;
  creditLimitCents:  number;
  iban?:             string;
  bic?:              string;
  debtorAccount?:    string;
  dunningBlock:      boolean;
  taxExempt:         boolean;
  priceListId?:      Types.ObjectId;
  isActive:          boolean;
  notes?:            string;
  createdAt:         Date;
  updatedAt:         Date;
}

const ContactSchema = new Schema<IContact>({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, default: '', trim: true },
  phone:     { type: String, default: '' },
  position:  { type: String, default: '' },
  isPrimary: { type: Boolean, default: false },
}, { _id: true });

const CustomerSchema = new Schema<ICustomer>(
  {
    tenantId:         { type: Schema.Types.ObjectId, required: true },
    customerNumber:   { type: String, required: true, trim: true },
    companyName:      { type: String, required: true, trim: true },
    legalForm:        { type: String, default: '' },
    address: {
      street:  { type: String, default: '' },
      city:    { type: String, default: '' },
      zip:     { type: String, default: '' },
      country: { type: String, default: 'DE' },
    },
    vatId:            { type: String, default: '' },
    contacts:         { type: [ContactSchema], default: [] },
    paymentTermsDays: { type: Number, default: 30 },
    creditLimitCents: { type: Number, default: 0 },
    iban:             { type: String, default: '' },
    bic:              { type: String, default: '' },
    debtorAccount:    { type: String, default: '' },
    dunningBlock:     { type: Boolean, default: false },
    taxExempt:        { type: Boolean, default: false },
    priceListId:      { type: Schema.Types.ObjectId, default: null },
    isActive:         { type: Boolean, default: true },
    notes:            { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_customers' }
);

CustomerSchema.index({ tenantId: 1, customerNumber: 1 }, { unique: true });
CustomerSchema.index({ tenantId: 1, companyName: 1 });
CustomerSchema.index({ tenantId: 1, isActive: 1 });

export const Customer = model<ICustomer>('M3Customer', CustomerSchema);
