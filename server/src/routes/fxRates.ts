import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { FxRate } from '../models/FxRate';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  quoteCurrency: z.string().min(3).max(3).toUpperCase(),
  rate:          z.number().positive(),
  date:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source:        z.enum(['manual', 'ecb']).default('manual'),
});

// GET /fx-rates?currency=USD&limit=30
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'),
  asyncHandler(async (req, res) => {
    const { currency, limit = '50' } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = { tenantId: req.tenantId, baseCurrency: 'EUR' };
    if (currency) filter.quoteCurrency = currency.toUpperCase();
    const rates = await FxRate.find(filter)
      .sort({ quoteCurrency: 1, date: -1 })
      .limit(Math.min(200, parseInt(limit, 10)))
      .lean();
    res.json({ rates });
  })
);

// GET /fx-rates/latest/:currency — most recent rate for EUR/<currency>
router.get('/latest/:currency', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'),
  asyncHandler(async (req, res) => {
    const quoteCurrency = req.params.currency.toUpperCase();
    if (quoteCurrency === 'EUR') { res.json({ rate: 1, date: new Date(), quoteCurrency: 'EUR', baseCurrency: 'EUR' }); return; }
    const rate = await FxRate.findOne({ tenantId: req.tenantId, baseCurrency: 'EUR', quoteCurrency })
      .sort({ date: -1 })
      .lean();
    if (!rate) throw new AppError(`Kein Wechselkurs für ${quoteCurrency} gefunden.`, 404);
    res.json(rate);
  })
);

// POST /fx-rates — upsert: replace existing rate for same date+currency, or create
router.post('/', requireRole('erp_admin', 'erp_accountant'),
  validate(upsertSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof upsertSchema>;
    const date = new Date(body.date);
    const existing = await FxRate.findOneAndUpdate(
      { tenantId: req.tenantId, baseCurrency: 'EUR', quoteCurrency: body.quoteCurrency, date },
      { $set: { rate: body.rate, source: body.source, createdBy: req.user?.userId } },
      { upsert: true, new: true }
    );
    res.status(201).json(existing);
  })
);

// DELETE /fx-rates/:id
router.delete('/:id', requireRole('erp_admin', 'erp_accountant'),
  asyncHandler(async (req, res) => {
    const rate = await FxRate.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!rate) throw new AppError('Wechselkurs nicht gefunden.', 404);
    res.json({ message: 'Gelöscht.' });
  })
);

export default router;
