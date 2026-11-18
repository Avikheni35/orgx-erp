import { Request, Response, NextFunction } from 'express';
import type { M3UserRole } from '../types';
import { AppError } from '../utils/AppError';

// M1 agency roles that get erp_admin access in M3
const ADMIN_EQUIV = new Set<string>(['agency_admin', 'disponent']);

export function requireRole(...roles: M3UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw new AppError('Authentication required', 401);
    const userRole = req.user.role as M3UserRole;
    const effectiveRole: M3UserRole = ADMIN_EQUIV.has(userRole) ? 'erp_admin' : userRole;
    if (!roles.includes(effectiveRole)) {
      throw new AppError('Insufficient permissions', 403);
    }
    next();
  };
}

export function requireSameTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) throw new AppError('Authentication required', 401);
  if (req.user.role === 'super_admin' || ADMIN_EQUIV.has(req.user.role)) { next(); return; }
  if (!req.tenantId) throw new AppError('Tenant context missing', 400);
  if (req.user.tenantId !== req.tenantId) throw new AppError('Tenant mismatch', 403);
  next();
}
