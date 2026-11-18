import { Schema, model, Document, Types } from 'mongoose';

export interface IContact {
  name:      string;
  email?:    string;
  phone?:    string;
  position?: string;
  isPrimary: boolean;
}

export interface ISupplier extends Document {
  tenantId:            Types.ObjectId;
  supplierNumber:      string;
  companyName:         string;
  legalForm?:          string;
  address: {
    street:  string;
    city:    string;
    zip:     string;
    country: string;
  };
  vatId?:              string;
  contacts:            IContact[];
  paymentTermsDays:    number;
  iban?:               string;
  bic?:                string;
  creditorAccount?:    string;
  defaultExpenseAccount?: string;
  paymentBlock:        boolean;
  taxExempt:           boolean;
  isActive:            boolean;
  notes?:              string;
  createdAt:           Date;
  updatedAt:           Date;
}

const ContactSchema = new Schema<IContact>({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, default: '', trim: true },
  phone:     { type: String, default: '' },
  position:  { type: String, default: '' },
  isPrimary: { type: Boolean, default: false },
}, { _id: true });

const SupplierSchema = new Schema<ISupplier>(
  {
    tenantId:               { type: Schema.Types.ObjectId, required: true },
    supplierNumber:         { type: String, required: true, trim: true },
    companyName:            { type: String, required: true, trim: true },
    legalForm:              { type: String, default: '' },
    address: {
      street:  { type: String, default: '' },
      city:    { type: String, default: '' },
      zip:     { type: String, default: '' },
      country: { type: String, default: 'DE' },
    },
    vatId:                  { type: String, default: '' },
    contacts:               { type: [ContactSchema], default: [] },
    paymentTermsDays:       { type: Number, default: 30 },
    iban:                   { type: String, default: '' },
    bic:                    { type: String, default: '' },
    creditorAccount:        { type: String, default: '' },
    defaultExpenseAccount:  { type: String, default: '' },
    paymentBlock:           { type: Boolean, default: false },
    taxExempt:              { type: Boolean, default: false },
    isActive:               { type: Boolean, default: true },
    notes:                  { type: String, default: '' },
  },
  { timestamps: true, collection: 'm3_suppliers' }
);

SupplierSchema.index({ tenantId: 1, supplierNumber: 1 }, { unique: true });
SupplierSchema.index({ tenantId: 1, companyName: 1 });
SupplierSchema.index({ tenantId: 1, isActive: 1 });

export const Supplier = model<ISupplier>('M3Supplier', SupplierSchema);
