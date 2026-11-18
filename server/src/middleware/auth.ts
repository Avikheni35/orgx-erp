import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/token';
import { AppError } from '../utils/AppError';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('Authentication required', 401);
  const token = header.slice(7);
  try {
    req.user = verifyAccessToken(token);
    // Fill req.tenantId from JWT when resolveTenant couldn't resolve it (e.g. localhost in dev)
    if (!req.tenantId && req.user.tenantId) {
      req.tenantId = req.user.tenantId;
    }
    next();
  } catch {
    throw new AppError('Invalid or expired token', 401);
  }
}
