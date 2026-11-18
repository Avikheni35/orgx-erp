import { Request, Response, NextFunction } from 'express';
import { Tenant } from '../models/Tenant';

export function requireModule(module: 'm1' | 'm2' | 'm3' | 'm4') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.tenantId) { next(); return; }

    try {
      const tenant = await Tenant.findById(req.tenantId).select('enabledModules').lean();
      if (!tenant) { res.status(403).json({ message: 'Tenant not found' }); return; }

      const enabled: string[] = (tenant as { enabledModules?: string[] }).enabledModules ?? [];
      if (enabled.length > 0 && !enabled.includes(module)) {
        res.status(403).json({
          message: `Dieses Modul (${module}) ist für Ihren Tenant nicht freigeschaltet.`,
          code: 'MODULE_NOT_ENABLED',
        });
        return;
      }
      next();
    } catch {
      next();
    }
  };
}
