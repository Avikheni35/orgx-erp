import { Schema, model, Document, Types } from 'mongoose';

export type AbsenceType   = 'vacation' | 'sick' | 'parental' | 'unpaid' | 'other';
export type AbsenceStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';

export interface IAbsence extends Document {
  tenantId:    Types.ObjectId;
  employeeId:  Types.ObjectId;
  employeeName: string;
  type:        AbsenceType;
  startDate:   Date;
  endDate:     Date;
  days:        number;
  reason:      string;
  status:      AbsenceStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  notes:       string;
  createdBy?:  Types.ObjectId;
  createdAt:   Date;
  updatedAt:   Date;
}

const AbsenceSchema = new Schema<IAbsence>({
  tenantId:     { type: Schema.Types.ObjectId, required: true },
  employeeId:   { type: Schema.Types.ObjectId, required: true, ref: 'M3Employee' },
  employeeName: { type: String, default: '' },
  type:         { type: String, enum: ['vacation', 'sick', 'parental', 'unpaid', 'other'], required: true },
  startDate:    { type: Date, required: true },
  endDate:      { type: Date, required: true },
  days:         { type: Number, required: true, min: 0.5 },
  reason:       { type: String, default: '' },
  status:       { type: String, enum: ['requested', 'approved', 'rejected', 'cancelled'], default: 'requested' },
  approvedBy:   { type: Schema.Types.ObjectId },
  approvedAt:   { type: Date },
  notes:        { type: String, default: '' },
  createdBy:    { type: Schema.Types.ObjectId },
}, { timestamps: true, collection: 'm3_absences' });

AbsenceSchema.index({ tenantId: 1, employeeId: 1, startDate: -1 });
AbsenceSchema.index({ tenantId: 1, status: 1 });
AbsenceSchema.index({ tenantId: 1, type: 1 });
AbsenceSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });

export const Absence = model<IAbsence>('M3Absence', AbsenceSchema);
