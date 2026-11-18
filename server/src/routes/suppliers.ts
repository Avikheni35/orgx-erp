import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { Supplier } from '../models/Supplier';
import { nextSeq } from '../models/Counter';

const router = Router();
router.use(requireAuth);

const contactSchema = z.object({
  name:      z.string().min(1),
  email:     z.string().email().optional().or(z.literal('')),
  phone:     z.string().optional(),
  position:  z.string().optional(),
  isPrimary: z.boolean().default(false),
});

const createSchema = z.object({
  companyName:          z.string().min(1).max(200),
  legalForm:            z.string().optional(),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    zip:     z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  vatId:                z.string().optional(),
  contacts:             z.array(contactSchema).optional(),
  paymentTermsDays:     z.number().int().min(0).optional(),
  iban:                 z.string().optional(),
  bic:                  z.string().optional(),
  creditorAccount:      z.string().optional(),
  defaultExpenseAccount: z.string().optional(),
  paymentBlock:         z.boolean().optional(),
  taxExempt:            z.boolean().optional(),
  notes:                z.string().optional(),
});

const updateSchema = createSchema.partial();

// GET /api/suppliers
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { search, active, page = '1', limit = '50' } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (active !== undefined) filter.isActive = active !== 'false';
  if (search) filter.$or = [
    { supplierNumber:   { $regex: search, $options: 'i' } },
    { companyName:      { $regex: search, $options: 'i' } },
    { 'contacts.email': { $regex: search, $options: 'i' } },
  ];

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Supplier.countDocuments(filter);
  const suppliers = await Supplier.find(filter)
    .sort({ companyName: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({ suppliers, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/suppliers/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const supplier = await Supplier.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!supplier) throw new AppError('Supplier not found', 404);
  res.json(supplier);
}));

// POST /api/suppliers
router.post(
  '/',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    const seq = await nextSeq(req.tenantId.toString(), 'supplier_number');
    const supplierNumber   = `LI-${String(seq).padStart(5, '0')}`;
    const creditorAccount  = req.body.creditorAccount?.trim() || String(70000 + seq);

    const supplier = await Supplier.create({
      tenantId: req.tenantId,
      supplierNumber,
      ...req.body,
      creditorAccount,
      address: { street: '', city: '', zip: '', country: 'DE', ...(req.body.address || {}) },
    });

    await logAudit({ req, action: 'supplier.create', targetType: 'Supplier', targetId: supplier._id, targetName: supplier.companyName });
    res.status(201).json(supplier);
  })
);

// PATCH /api/suppliers/:id
router.patch(
  '/:id',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const supplier = await Supplier.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!supplier) throw new AppError('Supplier not found', 404);
    await logAudit({ req, action: 'supplier.update', targetType: 'Supplier', targetId: supplier._id, targetName: supplier.companyName });
    res.json(supplier);
  })
);

// POST /api/suppliers/:id/deactivate
router.post('/:id/deactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!supplier) throw new AppError('Supplier not found', 404);
  res.json(supplier);
}));

// POST /api/suppliers/:id/reactivate
router.post('/:id/reactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const supplier = await Supplier.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: true },
    { new: true }
  );
  if (!supplier) throw new AppError('Supplier not found', 404);
  res.json(supplier);
}));

// GET /api/suppliers/:id/open-items  (Phase 8 — Vendor Invoices)
router.get('/:id/open-items', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const supplier = await Supplier.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!supplier) throw new AppError('Supplier not found', 404);
  res.json({ openItems: [], total: 0, totalOpenCents: 0, totalOverdueCents: 0 });
}));

export default router;
