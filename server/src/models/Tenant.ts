import { Schema, model, Document, Types } from 'mongoose';

// Shared 'tenants' collection — same as M1/M2.
export interface ITenant extends Document {
  _id: Types.ObjectId;
  name: string;
  loginCode: string;
  status: 'active' | 'inactive' | 'trial' | 'suspended';
  enabledModules?: ('m1' | 'm2' | 'm3' | 'm4')[];
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    loginCode: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'trial', 'suspended'], default: 'trial' },
    enabledModules: [{ type: String, enum: ['m1', 'm2', 'm3', 'm4'] }],
  },
  { timestamps: true, collection: 'tenants', strict: false }
);

export const Tenant = model<ITenant>('Tenant', TenantSchema);
