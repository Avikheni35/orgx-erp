import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  tenantId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  action: string;
  targetType: string;
  targetId: Types.ObjectId | null;
  targetName: string;
  details: Record<string, unknown>;
  ip: string;
  userAgent: string;
  retainUntil: Date;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    tenantId:   { type: Schema.Types.ObjectId, default: null },
    userId:     { type: Schema.Types.ObjectId, default: null },
    action:     { type: String, required: true },
    targetType: { type: String, required: true },
    targetId:   { type: Schema.Types.ObjectId, default: null },
    targetName: { type: String, default: '' },
    details:    { type: Schema.Types.Mixed, default: {} },
    ip:         { type: String, default: '' },
    userAgent:  { type: String, default: '' },
    retainUntil: { type: Date, required: true },
  },
  { timestamps: true, collection: 'm3_auditlog', versionKey: false }
);

// 10-year retention per HGB §257 / GoBD
AuditLogSchema.index({ retainUntil: 1 }, { expireAfterSeconds: 0 });
AuditLogSchema.index({ tenantId: 1, createdAt: -1 });

export const AuditLog = model<IAuditLog>('M3AuditLog', AuditLogSchema);
