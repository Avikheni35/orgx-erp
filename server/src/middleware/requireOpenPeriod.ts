import { Request, Response, NextFunction } from 'express';
import { Period } from '../models/Period';
import { AppError } from '../utils/AppError';

/**
 * Middleware factory — resolves the accounting period that contains `date`
 * and rejects the request if that period (or its fiscal year) is closed/locked.
 * Pass a function that extracts the posting date from the request.
 */
export function requireOpenPeriod(getDate: (req: Request) => Date | string | undefined) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const raw = getDate(req);
      if (!raw) return next();

      const date = new Date(raw);
      if (isNaN(date.getTime())) return next(new AppError('Ungültiges Buchungsdatum.', 400));

      const period = await Period.findOne({
        tenantId:  req.tenantId,
        startDate: { $lte: date },
        endDate:   { $gte: date },
      });

      if (!period) {
        return next(new AppError(`Für das Datum ${date.toISOString().slice(0, 10)} ist keine Buchungsperiode vorhanden.`, 422));
      }
      if (period.status !== 'open') {
        return next(new AppError(`Die Buchungsperiode "${period.name}" ist ${period.status === 'locked' ? 'gesperrt' : 'geschlossen'} und akzeptiert keine Buchungen.`, 422));
      }

      (req as Request & { period: typeof period }).period = period;
      next();
    } catch (err) {
      next(err);
    }
  };
}
