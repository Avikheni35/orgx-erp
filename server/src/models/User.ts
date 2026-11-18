import { Schema, model, Document, Types } from 'mongoose';
import type { M3UserRole } from '../types';

// Shared 'users' collection — same as M1/M2. M3 roles: erp_admin, erp_accountant, erp_viewer, erp_employee.

export interface IUser extends Document {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId | null;
  role: M3UserRole;
  email: string;
  passwordHash?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: 'active' | 'inactive' | 'suspended';
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  emailOtpHash?: string;
  emailOtpExpires?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  magicLinkTokenHash?: string;
  magicLinkExpires?: Date;
  inviteTokenHash?: string;
  inviteExpires?: Date;
  refreshTokenHashes: string[];
  lastLoginAt?: Date;
  language: 'de' | 'en';
  notificationPreferences: { email: boolean; sms: boolean; push: boolean };
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null },
    role: {
      type: String,
      enum: [
        'super_admin', 'agency_admin', 'disponent', 'worker', 'business_contact',
        'coordinator', 'event_staff', 'event_client',
        'erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor',
      ],
      required: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: String,
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    phone: String,
    status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active' },
    emailVerified: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    emailOtpHash: String,
    emailOtpExpires: Date,
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    passwordResetTokenHash: String,
    passwordResetExpires: Date,
    magicLinkTokenHash: String,
    magicLinkExpires: Date,
    inviteTokenHash: String,
    inviteExpires: Date,
    refreshTokenHashes: [{ type: String }],
    lastLoginAt: Date,
    language: { type: String, enum: ['de', 'en'], default: 'de' },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      sms:   { type: Boolean, default: true },
      push:  { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: 'users', strict: false }
);

UserSchema.index({ tenantId: 1, email: 1 }, { unique: true });

export const User = model<IUser>('User', UserSchema);
