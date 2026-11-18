import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { RecurringInvoice, RecurringFrequency } from '../models/RecurringInvoice';
import { Customer } from '../models/Customer';
import { SalesInvoice } from '../models/SalesInvoice';
import { nextSeq } from '../models/Counter';

const router = Router();
router.use(requireAuth);

const lineItemSchema = z.object({
  serviceItemId:  z.string().optional(),
  itemName:       z.string().optional(),
  description:    z.string().default(''),
  unit:           z.string().default('Stück'),
  quantity:       z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate:        z.number().min(0).max(100).default(19),
});

function calcTotals(items: z.infer<typeof lineItemSchema>[]) {
  const lineItems = items.map(item => {
    const totalNetCents   = Math.round(item.quantity * item.unitPriceCents);
    const totalVatCents   = Math.round(totalNetCents * item.vatRate / 100);
    const totalGrossCents = totalNetCents + totalVatCents;
    return { ...item, totalNetCents, totalVatCents, totalGrossCents };
  });
  return lineItems;
}

const createSchema = z.object({
  title:           z.string().min(1),
  customerId:      z.string().min(1),
  frequency:       z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),
  dayOfMonth:      z.number().int().min(1).max(28).default(1),
  paymentTermDays: z.number().int().min(0).default(14),
  startDate:       z.string().min(1),
  lineItems:       z.array(lineItemSchema).min(1),
  notes:           z.string().optional(),
});

const updateSchema = createSchema.partial();

// GET / — list all recurring invoices for tenant
router.get('/', asyncHandler(async (req, res) => {
  const { tenantId } = req;
  const page  = Math.max(1, parseInt(String(req.query.page  || '1')));
  const limit = Math.min(100, parseInt(String(req.query.limit || '50')));
  const status = req.query.status as string | undefined;

  const filter: Record<string, unknown> = { tenantId };
  if (status) filter.status = status;

  const [templates, total] = await Promise.all([
    RecurringInvoice.find(filter)
      .sort({ nextRunDate: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RecurringInvoice.countDocuments(filter),
  ]);

  res.json({ templates, total, page, totalPages: Math.ceil(total / limit) });
}));

// GET /:id
router.get('/:id', asyncHandler(async (req, res) => {
  const ri = await RecurringInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!ri) throw new AppError('Not found', 404);
  res.json(ri);
}));

// POST / — create
router.post('/', requireRole('erp_admin', 'erp_accountant', 'agency_admin', 'disponent'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { tenantId, user } = req;
    const body = req.body as z.infer<typeof createSchema>;

    const customer = await Customer.findOne({ _id: body.customerId, tenantId });
    if (!customer) throw new AppError('Customer not found', 404);

    const lineItems = calcTotals(body.lineItems);

    const ri = await RecurringInvoice.create({
      tenantId,
      title:        body.title,
      customerId:   customer._id,
      customerSnapshot: {
        companyName:   customer.companyName || '',
        legalForm:     customer.legalForm   || '',
        address:       customer.address,
        vatId:         customer.vatId        || '',
        debtorAccount: customer.debtorAccount || '',
      },
      status:          'active',
      frequency:       body.frequency,
      dayOfMonth:      body.dayOfMonth ?? 1,
      paymentTermDays: body.paymentTermDays ?? 14,
      nextRunDate:     new Date(body.startDate),
      lineItems,
      notes:           body.notes || '',
      createdBy:       user!.userId,
    });

    res.status(201).json(ri);
  })
);

// PUT /:id — update
router.put('/:id',
  requireRole('erp_admin', 'erp_accountant', 'agency_admin', 'disponent'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const ri = await RecurringInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!ri) throw new AppError('Not found', 404);

    const body = req.body as z.infer<typeof updateSchema>;
    if (body.title)           ri.title           = body.title;
    if (body.frequency)       ri.frequency       = body.frequency as RecurringFrequency;
    if (body.dayOfMonth)      ri.dayOfMonth      = body.dayOfMonth;
    if (body.paymentTermDays !== undefined) ri.paymentTermDays = body.paymentTermDays;
    if (body.startDate)       ri.nextRunDate     = new Date(body.startDate);
    if (body.notes !== undefined) ri.notes       = body.notes;
    if (body.lineItems)       ri.lineItems       = calcTotals(body.lineItems) as typeof ri.lineItems;

    if (body.customerId && body.customerId !== ri.customerId.toString()) {
      const customer = await Customer.findOne({ _id: body.customerId, tenantId: req.tenantId });
      if (!customer) throw new AppError('Customer not found', 404);
      ri.customerId = customer._id;
      ri.customerSnapshot = {
        companyName:   customer.companyName || '',
        legalForm:     customer.legalForm   || '',
        address:       customer.address,
        vatId:         customer.vatId        || '',
        debtorAccount: customer.debtorAccount || '',
      };
    }

    await ri.save();
    res.json(ri);
  })
);

// PATCH /:id/status — toggle active/paused
router.patch('/:id/status',
  requireRole('erp_admin', 'erp_accountant', 'agency_admin', 'disponent'),
  asyncHandler(async (req, res) => {
    const ri = await RecurringInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!ri) throw new AppError('Not found', 404);
    ri.status = ri.status === 'active' ? 'paused' : 'active';
    await ri.save();
    res.json(ri);
  })
);

// POST /:id/run — manual trigger: generate one invoice now
router.post('/:id/run',
  requireRole('erp_admin', 'erp_accountant', 'agency_admin', 'disponent'),
  asyncHandler(async (req, res) => {
    const ri = await RecurringInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!ri) throw new AppError('Not found', 404);

    const invoiceNumber = await nextSeq('RE', ri.tenantId.toString());
    const invoiceDate   = new Date();
    const dueDate       = new Date();
    dueDate.setDate(dueDate.getDate() + ri.paymentTermDays);

    const invoice = await SalesInvoice.create({
      tenantId:         ri.tenantId,
      invoiceNumber,
      customerId:       ri.customerId,
      customerSnapshot: ri.customerSnapshot,
      status:           'draft',
      invoiceDate,
      dueDate,
      lineItems:        ri.lineItems,
      totalNetCents:    ri.lineItems.reduce((s, l) => s + l.totalNetCents, 0),
      totalVatCents:    ri.lineItems.reduce((s, l) => s + l.totalVatCents, 0),
      totalGrossCents:  ri.lineItems.reduce((s, l) => s + l.totalGrossCents, 0),
      paidCents:        0,
      notes:            ri.notes || '',
    });

    ri.lastRunAt = new Date();
    await ri.save();

    res.json({ invoice, message: `Created draft ${invoiceNumber}` });
  })
);

// DELETE /:id
router.delete('/:id',
  requireRole('erp_admin', 'agency_admin'),
  asyncHandler(async (req, res) => {
    const ri = await RecurringInvoice.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!ri) throw new AppError('Not found', 404);
    res.json({ message: 'Deleted' });
  })
);

export default router;
