import mongoose, { Document, Schema, Types } from 'mongoose';

export type PayrollStatus = 'draft' | 'finalized' | 'posted';

export interface IEmployeeSnapshot {
  m2StaffId: string;
  firstName: string;
  lastName: string;
  email: string;
  source: 'm2';
}

export interface IPayrollEntry {
  employeeId:           Types.ObjectId;
  employeeNumber:       string;
  employeeName:         string;
  personnelAccount:     string;
  costCenterNumber:     string;
  salaryType:           'monthly' | 'hourly';
  grossCents:           number;
  hoursWorked:          number;
  additionalCents:      number;
  deductionCents:       number;
  totalGrossCents:      number;
  taxCents:             number;
  socialSecurityCents:  number;
  netCents:             number;
  note:                 string;
  syncId?:              string;
  employeeSnapshot?:    IEmployeeSnapshot;
}

export interface IPayroll extends Document {
  tenantId:        Types.ObjectId;
  payrollNumber:   string;
  period:          string;
  year:            number;
  month:           number;
  status:          PayrollStatus;
  entries:         IPayrollEntry[];
  totalGrossCents: number;
  totalNetCents:   number;
  journalEntryId?: Types.ObjectId;
  notes:           string;
  createdBy:       Types.ObjectId;
  finalizedAt?:    Date;
  postedAt?:       Date;
  source?:         'm2' | 'm3';
  createdAt:       Date;
  updatedAt:       Date;
}

const employeeSnapshotSchema = new Schema<IEmployeeSnapshot>({
  m2StaffId: { type: String, required: true },
  firstName:  { type: String, required: true },
  lastName:   { type: String, required: true },
  email:      { type: String, required: true },
  source:     { type: String, default: 'm2' },
}, { _id: false });

const entrySchema = new Schema<IPayrollEntry>({
  employeeId:          { type: Schema.Types.ObjectId, required: true },
  employeeNumber:      { type: String, required: true },
  employeeName:        { type: String, required: true },
  personnelAccount:    { type: String, default: '4120' },
  costCenterNumber:    { type: String, default: '' },
  salaryType:          { type: String, enum: ['monthly', 'hourly'], default: 'monthly' },
  grossCents:          { type: Number, default: 0 },
  hoursWorked:         { type: Number, default: 0 },
  additionalCents:     { type: Number, default: 0 },
  deductionCents:      { type: Number, default: 0 },
  totalGrossCents:     { type: Number, default: 0 },
  taxCents:            { type: Number, default: 0 },
  socialSecurityCents: { type: Number, default: 0 },
  netCents:            { type: Number, default: 0 },
  note:                { type: String, default: '' },
  syncId:              { type: String },
  employeeSnapshot:    { type: employeeSnapshotSchema },
}, { _id: false });

const payrollSchema = new Schema<IPayroll>({
  tenantId:        { type: Schema.Types.ObjectId, required: true, index: true },
  payrollNumber:   { type: String, required: true },
  period:          { type: String, required: true },
  year:            { type: Number, required: true },
  month:           { type: Number, required: true, min: 1, max: 12 },
  status:          { type: String, enum: ['draft', 'finalized', 'posted'], default: 'draft' },
  entries:         { type: [entrySchema], default: [] },
  totalGrossCents: { type: Number, default: 0 },
  totalNetCents:   { type: Number, default: 0 },
  journalEntryId:  { type: Schema.Types.ObjectId },
  notes:           { type: String, default: '' },
  createdBy:       { type: Schema.Types.ObjectId, required: true },
  finalizedAt:     { type: Date },
  postedAt:        { type: Date },
  source:          { type: String, enum: ['m2', 'm3'], default: 'm3' },
}, { timestamps: true, collection: 'm3_payrolls' });

payrollSchema.index({ tenantId: 1, payrollNumber: 1 }, { unique: true });
payrollSchema.index({ tenantId: 1, period: 1 }, { unique: true });
payrollSchema.index({ tenantId: 1, status: 1 });

export const Payroll = mongoose.model<IPayroll>('M3Payroll', payrollSchema);
