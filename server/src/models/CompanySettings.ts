import { Schema, model, Document, Types } from 'mongoose';

export interface IDunningLevel {
  level: 1 | 2 | 3;
  feeCents: number;
  graceDays: number;
}

export interface ICompanySettings extends Document {
  tenantId: Types.ObjectId;
  companyName: string;
  legalForm: string;
  address: { street: string; city: string; zip: string; country: string };
  vatId: string;
  steuernummer: string;
  hrNumber: string;
  fiscalYearStart: number;
  chartOfAccounts: 'SKR03' | 'SKR04';
  vatPeriod: 'monthly' | 'quarterly';
  currency: 'EUR';
  invoicePrefix: string;
  invoiceStartNumber: number;
  invoiceDueDays: number;
  invoiceTermsText: string;
  datevBeraternummer: string;
  datevMandantennummer: string;
  dunningLevels: IDunningLevel[];
  defaultBankAccountId?: Types.ObjectId;
  mileageRateCents: number;
  poApprovalThresholdCents: number;
  salesMode: 'invoice' | 'pos';
  featureFlags: {
    enableFixedAssets: boolean;
    enableAccruals: boolean;
    enableDirectDebit: boolean;
    enableElster: boolean;
    enableCostCenters: boolean;
    costCenterRequired: boolean;
    enableInventory: boolean;
    gobdAuditLog: boolean;
    dunningEnabled: boolean;
    bookingApprovalWorkflow: boolean;
    taxAdvisorAccess: boolean;
    periodLockPolicy: 'manual' | 'auto-monthly';
    multiCurrency: boolean;
    misIntentMode: 'regex' | 'ai';
  };
  createdAt: Date;
  updatedAt: Date;
}

const CompanySettingsSchema = new Schema<ICompanySettings>(
  {
    tenantId: { type: Schema.Types.ObjectId, required: true, unique: true },
    companyName: { type: String, default: '' },
    legalForm: { type: String, default: 'GmbH' },
    address: {
      street:  { type: String, default: '' },
      city:    { type: String, default: '' },
      zip:     { type: String, default: '' },
      country: { type: String, default: 'DE' },
    },
    vatId:         { type: String, default: '' },
    steuernummer:  { type: String, default: '' },
    hrNumber:      { type: String, default: '' },
    fiscalYearStart: { type: Number, default: 1 },
    chartOfAccounts: { type: String, enum: ['SKR03', 'SKR04'], default: 'SKR03' },
    vatPeriod:       { type: String, enum: ['monthly', 'quarterly'], default: 'monthly' },
    currency:        { type: String, default: 'EUR' },
    invoicePrefix:       { type: String, default: 'RE-' },
    invoiceStartNumber:  { type: Number, default: 1 },
    invoiceDueDays:      { type: Number, default: 30 },
    invoiceTermsText:    { type: String, default: 'Zahlbar innerhalb von 30 Tagen ohne Abzug.' },
    datevBeraternummer:  { type: String, default: '' },
    datevMandantennummer:{ type: String, default: '' },
    dunningLevels: {
      type: [
        {
          level:     { type: Number, enum: [1, 2, 3] },
          feeCents:  { type: Number, default: 0 },
          graceDays: { type: Number, default: 14 },
        },
      ],
      default: [
        { level: 1, feeCents: 0,    graceDays: 14 },
        { level: 2, feeCents: 1500, graceDays: 7  },
        { level: 3, feeCents: 4000, graceDays: 7  },
      ],
    },
    defaultBankAccountId: { type: Schema.Types.ObjectId, default: null },
    mileageRateCents:            { type: Number, default: 30 },
    poApprovalThresholdCents:    { type: Number, default: 100000 },
    salesMode:                   { type: String, enum: ['invoice', 'pos'], default: 'invoice' },
    featureFlags: {
      enableFixedAssets:       { type: Boolean, default: true  },
      enableAccruals:          { type: Boolean, default: true  },
      enableDirectDebit:       { type: Boolean, default: false },
      enableElster:            { type: Boolean, default: false },
      enableCostCenters:       { type: Boolean, default: false },
      costCenterRequired:      { type: Boolean, default: false },
      enableInventory:         { type: Boolean, default: false },
      gobdAuditLog:            { type: Boolean, default: true  },
      dunningEnabled:          { type: Boolean, default: true  },
      bookingApprovalWorkflow: { type: Boolean, default: false },
      taxAdvisorAccess:        { type: Boolean, default: false },
      periodLockPolicy:        { type: String, enum: ['manual','auto-monthly'], default: 'manual' },
      multiCurrency:           { type: Boolean, default: false },
      misIntentMode:           { type: String, enum: ['regex', 'ai'], default: 'regex' },
    },
  },
  { timestamps: true, collection: 'm3_companysettings' }
);

export const CompanySettings = model<ICompanySettings>('M3CompanySettings', CompanySettingsSchema);
