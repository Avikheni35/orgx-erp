import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { Shift } from '../models/Shift';
import { SalesInvoice } from '../models/SalesInvoice';
import { Types } from 'mongoose';

const router = Router();
router.use(requireAuth);

const ALLOWED = ['erp_employee', 'erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'] as const;

// GET /api/shifts/current
router.get('/current', requireRole(...ALLOWED), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const shift = await Shift.findOne({ tenantId: req.tenantId, userId: req.user!.userId, status: 'open' }).sort({ openedAt: -1 }).lean();
  res.json(shift ?? null);
}));

// POST /api/shifts/open
router.post('/open',
  requireRole(...ALLOWED),
  validate(z.object({ openingFloatCents: z.number().int().min(0).default(0), userName: z.string().optional() })),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const existing = await Shift.findOne({ tenantId: req.tenantId, userId: req.user!.userId, status: 'open' });
    if (existing) return res.json(existing);
    const shift = await Shift.create({
      tenantId:          req.tenantId,
      userId:            new Types.ObjectId(req.user!.userId),
      userName:          req.body.userName ?? '',
      openedAt:          new Date(),
      openingFloatCents: req.body.openingFloatCents,
      status:            'open',
    });
    res.status(201).json(shift);
  })
);

// POST /api/shifts/close
router.post('/close',
  requireRole(...ALLOWED),
  validate(z.object({ closingFloatCents: z.number().int().min(0) })),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const shift = await Shift.findOne({ tenantId: req.tenantId, userId: req.user!.userId, status: 'open' });
    if (!shift) throw new AppError('No open shift found', 404);

    // Tally sales since shift opened
    const sales = await SalesInvoice.find({
      tenantId:    req.tenantId,
      status:      'paid',
      createdAt:   { $gte: shift.openedAt },
    }).lean();
    const salesCents = sales.reduce((s, inv) => s + Math.max(0, inv.totalGrossCents), 0);

    shift.closedAt          = new Date();
    shift.closingFloatCents = req.body.closingFloatCents;
    shift.salesCount        = sales.length;
    shift.salesCents        = salesCents;
    shift.status            = 'closed';
    await shift.save();
    res.json(shift);
  })
);

export default router;
