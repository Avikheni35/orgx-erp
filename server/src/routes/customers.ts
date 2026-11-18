import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { Customer } from '../models/Customer';
import { SalesInvoice } from '../models/SalesInvoice';
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
  companyName:      z.string().min(1).max(200),
  legalForm:        z.string().optional(),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    zip:     z.string().optional(),
    country: z.string().optional(),
  }).optional(),
  vatId:            z.string().optional(),
  contacts:         z.array(contactSchema).optional(),
  paymentTermsDays: z.number().int().min(0).optional(),
  creditLimitCents: z.number().int().min(0).optional(),
  iban:             z.string().optional(),
  bic:              z.string().optional(),
  debtorAccount:    z.string().optional(),
  dunningBlock:     z.boolean().optional(),
  taxExempt:        z.boolean().optional(),
  notes:            z.string().optional(),
});

const updateSchema = createSchema.partial();

// GET /api/customers
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { search, active, page = '1', limit = '50' } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (active !== undefined) filter.isActive = active !== 'false';
  if (search) filter.$or = [
    { customerNumber: { $regex: search, $options: 'i' } },
    { companyName:    { $regex: search, $options: 'i' } },
    { 'contacts.email': { $regex: search, $options: 'i' } },
  ];

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Customer.countDocuments(filter);
  const customers = await Customer.find(filter)
    .sort({ companyName: 1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({ customers, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/customers/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Customer not found', 404);
  res.json(customer);
}));

// POST /api/customers
router.post(
  '/',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    const seq = await nextSeq(req.tenantId.toString(), 'customer_number');
    const customerNumber = `KD-${String(seq).padStart(5, '0')}`;
    const debtorAccount  = req.body.debtorAccount?.trim() || String(10000 + seq);

    const customer = await Customer.create({
      tenantId: req.tenantId,
      customerNumber,
      ...req.body,
      debtorAccount,
      address: { street: '', city: '', zip: '', country: 'DE', ...(req.body.address || {}) },
    });

    await logAudit({ req, action: 'customer.create', targetType: 'Customer', targetId: customer._id, targetName: customer.companyName });
    res.status(201).json(customer);
  })
);

// PATCH /api/customers/:id
router.patch(
  '/:id',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!customer) throw new AppError('Customer not found', 404);
    await logAudit({ req, action: 'customer.update', targetType: 'Customer', targetId: customer._id, targetName: customer.companyName });
    res.json(customer);
  })
);

// POST /api/customers/:id/deactivate
router.post('/:id/deactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!customer) throw new AppError('Customer not found', 404);
  res.json(customer);
}));

// POST /api/customers/:id/reactivate
router.post('/:id/reactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const customer = await Customer.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: true },
    { new: true }
  );
  if (!customer) throw new AppError('Customer not found', 404);
  res.json(customer);
}));

// GET /api/customers/:id/open-items
router.get('/:id/open-items', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const customer = await Customer.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Customer not found', 404);

  const now = new Date();
  const invoices = await SalesInvoice.find({
    tenantId: req.tenantId,
    customerId: customer._id,
    status: { $in: ['sent', 'draft'] },
  }).lean();

  const openItems = invoices.map(inv => ({
    invoiceId:     inv._id,
    invoiceNumber: inv.invoiceNumber,
    date:          inv.invoiceDate,
    dueDate:       inv.dueDate,
    totalCents:    inv.totalGrossCents,
    openCents:     inv.totalGrossCents - inv.paidCents,
    overdue:       inv.dueDate < now,
  }));

  const totalOpenCents   = openItems.reduce((s, i) => s + i.openCents, 0);
  const totalOverdueCents = openItems.filter(i => i.overdue).reduce((s, i) => s + i.openCents, 0);

  res.json({ openItems, total: openItems.length, totalOpenCents, totalOverdueCents });
}));

export default router;
