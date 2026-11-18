import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { ServiceItem } from '../models/ServiceItem';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name:                  z.string().min(1).max(200),
  description:           z.string().optional(),
  unit:                  z.string().optional(),
  category:              z.string().max(100).optional(),
  costPriceCents:        z.number().int().min(0).default(0),
  defaultUnitPriceCents: z.number().int().min(0),
  vatRate:               z.number().min(0).max(100).default(19),
  notes:                 z.string().optional(),
});

const updateSchema = createSchema.partial();

// GET /api/service-items/categories — distinct non-empty categories for this tenant
router.get('/categories', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const cats = await ServiceItem.distinct('category', { tenantId: req.tenantId, category: { $ne: '' } });
  res.json({ categories: (cats as string[]).sort() });
}));

// GET /api/service-items
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { active } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (active !== undefined) filter.isActive = active !== 'false';

  const items = await ServiceItem.find(filter).sort({ name: 1 }).lean();
  res.json({ items, total: items.length });
}));

// GET /api/service-items/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const item = await ServiceItem.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!item) throw new AppError('Service item not found', 404);
  res.json(item);
}));

// POST /api/service-items
router.post(
  '/',
  requireRole('erp_admin', 'super_admin', 'agency_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const item = await ServiceItem.create({ tenantId: req.tenantId, ...req.body });
    await logAudit({ req, action: 'service_item.create', targetType: 'ServiceItem', targetId: item._id, targetName: item.name });
    res.status(201).json(item);
  })
);

// PATCH /api/service-items/:id
router.patch(
  '/:id',
  requireRole('erp_admin', 'super_admin', 'agency_admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const item = await ServiceItem.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!item) throw new AppError('Service item not found', 404);
    await logAudit({ req, action: 'service_item.update', targetType: 'ServiceItem', targetId: item._id, targetName: item.name });
    res.json(item);
  })
);

// POST /api/service-items/:id/deactivate
router.post('/:id/deactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const item = await ServiceItem.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!item) throw new AppError('Service item not found', 404);
  res.json(item);
}));

// POST /api/service-items/:id/reactivate
router.post('/:id/reactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const item = await ServiceItem.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: true },
    { new: true }
  );
  if (!item) throw new AppError('Service item not found', 404);
  res.json(item);
}));

// DELETE /api/service-items/:id
router.delete('/:id', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const item = await ServiceItem.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!item) throw new AppError('Service item not found', 404);
  res.json({ ok: true });
}));

export default router;
