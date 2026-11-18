import mongoose, { Document, Schema, Types } from 'mongoose';

export type EmployeeStatus  = 'active' | 'inactive' | 'terminated';
export type SalaryType      = 'monthly' | 'hourly';
export type TaxClass        = '1' | '2' | '3' | '4' | '5' | '6';

export interface IEmployee extends Document {
  tenantId:           Types.ObjectId;
  employeeNumber:     string;
  // Personal
  firstName:          string;
  lastName:           string;
  dateOfBirth?:       Date;
  email:              string;
  phone:              string;
  address:            string;
  // Employment
  department:         string;
  position:           string;
  startDate:          Date;
  endDate?:           Date;
  status:             EmployeeStatus;
  // Payroll
  salaryType:         SalaryType;
  salaryCents:        number;
  taxClass:           TaxClass;
  healthInsurance:    string;
  steuerIdEncrypted:  string;
  svNummerEncrypted:  string;
  ibanEncrypted:      string;
  // Accounting
  personnelAccount:   string;
  costCenterNumber:   string;
  // Meta
  notes:              string;
  createdBy?:         Types.ObjectId;
  createdAt:          Date;
  updatedAt:          Date;
}

const employeeSchema = new Schema<IEmployee>({
  tenantId:          { type: Schema.Types.ObjectId, required: true, index: true },
  employeeNumber:    { type: String, required: true },
  firstName:         { type: String, required: true, trim: true },
  lastName:          { type: String, required: true, trim: true },
  dateOfBirth:       { type: Date },
  email:             { type: String, default: '', lowercase: true, trim: true },
  phone:             { type: String, default: '' },
  address:           { type: String, default: '' },
  department:        { type: String, default: '' },
  position:          { type: String, default: '' },
  startDate:         { type: Date, required: true },
  endDate:           { type: Date },
  status:            { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active' },
  salaryType:        { type: String, enum: ['monthly', 'hourly'], default: 'monthly' },
  salaryCents:       { type: Number, default: 0, min: 0 },
  taxClass:          { type: String, enum: ['1','2','3','4','5','6'], default: '1' },
  healthInsurance:   { type: String, default: '' },
  steuerIdEncrypted: { type: String, default: '' },
  svNummerEncrypted: { type: String, default: '' },
  ibanEncrypted:     { type: String, default: '' },
  personnelAccount:  { type: String, default: '4120' },
  costCenterNumber:  { type: String, default: '' },
  notes:             { type: String, default: '' },
  createdBy:         { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_employees' });

employeeSchema.index({ tenantId: 1, employeeNumber: 1 }, { unique: true });
employeeSchema.index({ tenantId: 1, lastName: 1, firstName: 1 });

export const Employee = mongoose.model<IEmployee>('M3Employee', employeeSchema);
