import { Request } from 'express';
import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';

interface LogAuditParams {
  req: Request;
  action: string;
  targetType: string;
  targetId?: Types.ObjectId | string;
  targetName?: string;
  details?: Record<string, unknown>;
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    const retainUntil = new Date();
    retainUntil.setFullYear(retainUntil.getFullYear() + 10);

    await AuditLog.create({
      tenantId: params.req.tenantId ?? null,
      userId: params.req.user?.userId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      targetName: params.targetName ?? '',
      details: params.details ?? {},
      ip: params.req.ip,
      userAgent: params.req.headers['user-agent'] ?? '',
      retainUntil,
    });
  } catch {
    // fire-and-forget — never throws
  }
}
