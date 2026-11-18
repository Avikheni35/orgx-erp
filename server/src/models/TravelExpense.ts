import mongoose, { Document, Schema, Types } from 'mongoose';

export type TravelExpenseStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
export type ExpenseCategory     = 'mileage' | 'hotel' | 'meal' | 'transport' | 'parking' | 'other';

export interface IExpenseLine {
  category:      ExpenseCategory;
  description:   string;
  amountCents:   number;
  vatRate:       number;
  receiptNumber: string;
  // mileage-specific
  km?:           number;
  kmRate?:       number;
}

export interface ITravelExpense extends Document {
  tenantId:        Types.ObjectId;
  expenseNumber:   string;
  employeeId:      Types.ObjectId;
  employeeName:    string;
  purpose:         string;
  destination:     string;
  startDate:       Date;
  endDate:         Date;
  lines:           IExpenseLine[];
  totalAmountCents:number;
  costCenterNumber:string;
  personnelAccount:string;
  expenseAccount:  string;
  status:          TravelExpenseStatus;
  submittedAt?:    Date;
  approvedBy?:     Types.ObjectId;
  approvedAt?:     Date;
  rejectedBy?:     Types.ObjectId;
  rejectedAt?:     Date;
  rejectionReason: string;
  journalEntryId?: Types.ObjectId;
  notes:           string;
  createdBy:       Types.ObjectId;
  createdAt:       Date;
  updatedAt:       Date;
}

const lineSchema = new Schema<IExpenseLine>({
  category:      { type: String, required: true },
  description:   { type: String, default: '' },
  amountCents:   { type: Number, required: true, min: 0 },
  vatRate:       { type: Number, default: 0 },
  receiptNumber: { type: String, default: '' },
  km:            { type: Number },
  kmRate:        { type: Number },
}, { _id: false });

const travelExpenseSchema = new Schema<ITravelExpense>({
  tenantId:         { type: Schema.Types.ObjectId, required: true, index: true },
  expenseNumber:    { type: String, required: true },
  employeeId:       { type: Schema.Types.ObjectId, required: true },
  employeeName:     { type: String, required: true },
  purpose:          { type: String, required: true },
  destination:      { type: String, default: '' },
  startDate:        { type: Date, required: true },
  endDate:          { type: Date, required: true },
  lines:            { type: [lineSchema], default: [] },
  totalAmountCents: { type: Number, default: 0 },
  costCenterNumber: { type: String, default: '' },
  personnelAccount: { type: String, default: '4120' },
  expenseAccount:   { type: String, default: '6650' },
  status:           { type: String, enum: ['draft','submitted','approved','rejected','paid'], default: 'draft' },
  submittedAt:      { type: Date },
  approvedBy:       { type: Schema.Types.ObjectId },
  approvedAt:       { type: Date },
  rejectedBy:       { type: Schema.Types.ObjectId },
  rejectedAt:       { type: Date },
  rejectionReason:  { type: String, default: '' },
  journalEntryId:   { type: Schema.Types.ObjectId },
  notes:            { type: String, default: '' },
  createdBy:        { type: Schema.Types.ObjectId, required: true },
}, { timestamps: true, collection: 'm3_travel_expenses' });

travelExpenseSchema.index({ tenantId: 1, expenseNumber: 1 }, { unique: true });
travelExpenseSchema.index({ tenantId: 1, employeeId: 1 });
travelExpenseSchema.index({ tenantId: 1, status: 1 });

export const TravelExpense = mongoose.model<ITravelExpense>('M3TravelExpense', travelExpenseSchema);
