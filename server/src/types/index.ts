import { Types } from 'mongoose';

export type M3UserRole =
  | 'super_admin'
  | 'erp_admin'
  | 'erp_accountant'
  | 'erp_viewer'
  | 'erp_employee'
  | 'erp_tax_advisor'
  // M1 staff that get erp_admin access
  | 'agency_admin'
  | 'disponent';

export interface JwtAccessPayload {
  userId: string;
  tenantId: string | null;
  role: M3UserRole;
}

export interface JwtRefreshPayload {
  userId: string;
  tokenFamily: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtAccessPayload;
      tenantId?: string;
    }
  }
}
