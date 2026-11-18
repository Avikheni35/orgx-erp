import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { SalesOrder } from '../models/SalesOrder';
import { SalesInvoice } from '../models/SalesInvoice';
import { Customer } from '../models/Customer';
import { CompanySettings } from '../models/CompanySettings';
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

const createSchema = z.object({
  customerId:      z.string().min(1),
  orderDate:       z.string().min(1),
  deliveryDate:    z.string().optional(),
  lineItems:       z.array(lineItemSchema).min(1),
  deliveryAddress: z.string().default(''),
  notes:           z.string().default(''),
  internalNotes:   z.string().default(''),
});

const statusSchema = z.object({
  status: z.enum(['confirmed', 'partially_delivered', 'delivered', 'cancelled']),
});

function calcTotals(items: z.infer<typeof lineItemSchema>[]) {
  const lineItems = items.map(item => {
    const totalNetCents   = Math.round(item.quantity * item.unitPriceCents);
    const totalVatCents   = Math.round(totalNetCents * item.vatRate / 100);
    const totalGrossCents = totalNetCents + totalVatCents;
    return { ...item, totalNetCents, totalVatCents, totalGrossCents, deliveredQuantity: 0 };
  });
  const totalNetCents   = lineItems.reduce((s, l) => s + l.totalNetCents, 0);
  const totalVatCents   = lineItems.reduce((s, l) => s + l.totalVatCents, 0);
  return { lineItems, totalNetCents, totalVatCents, totalGrossCents: totalNetCents + totalVatCents };
}

// GET /sales-orders
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, customerId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     filter.status     = status;
  if (customerId) filter.customerId = customerId;
  const orders = await SalesOrder.find(filter).sort({ orderDate: -1 }).lean();
  res.json({ orders });
}));

// POST /sales-orders
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;

  const customer = await Customer.findOne({ _id: body.customerId, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Kunde nicht gefunden.', 404);

  const tenantId    = String(req.tenantId);
  const seq         = await nextSeq(tenantId, 'order');
  const orderNumber = `AU-${String(seq).padStart(6, '0')}`;

  const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(body.lineItems);

  const addrParts = [
    customer.address?.street, customer.address?.zip, customer.address?.city, customer.address?.country,
  ].filter(Boolean);

  const order = await SalesOrder.create({
    tenantId:        req.tenantId,
    orderNumber,
    customerId:      customer._id,
    customerName:    customer.companyName,
    customerAddress: addrParts.join(', '),
    orderDate:       new Date(body.orderDate),
    deliveryDate:    body.deliveryDate ? new Date(body.deliveryDate) : undefined,
    status:          'draft',
    lineItems,
    totalNetCents,
    totalVatCents,
    totalGrossCents,
    currency:        'EUR',
    deliveryAddress: body.deliveryAddress,
    notes:           body.notes,
    internalNotes:   body.internalNotes,
    createdBy:       req.user?.userId,
  });

  res.status(201).json(order);
}));

// GET /sales-orders/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!order) throw new AppError('Auftrag nicht gefunden.', 404);
  res.json(order);
}));

// PATCH /sales-orders/:id/status
router.patch('/:id/status', requireRole('erp_admin', 'erp_accountant'), validate(statusSchema), asyncHandler(async (req, res) => {
  const { status } = req.body as z.infer<typeof statusSchema>;
  const order = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Auftrag nicht gefunden.', 404);
  if (['invoiced', 'cancelled'].includes(order.status)) {
    throw new AppError('Status abgeschlossener oder stornierter Aufträge kann nicht geändert werden.', 400);
  }
  order.status = status;
  await order.save();
  res.json(order);
}));

// POST /sales-orders/:id/convert
router.post('/:id/convert', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const order = await SalesOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Auftrag nicht gefunden.', 404);
  if (!['confirmed', 'partially_delivered', 'delivered'].includes(order.status)) {
    throw new AppError('Nur bestätigte oder gelieferte Aufträge können in Rechnungen umgewandelt werden.', 400);
  }
  if (order.convertedToInvoiceId) throw new AppError('Auftrag wurde bereits in Rechnung umgewandelt.', 400);

  const tenantId = String(req.tenantId);
  const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
  const prefix   = settings?.invoicePrefix ?? 'RE-';
  const dueDays  = settings?.invoiceDueDays ?? 30;
  const year     = new Date().getFullYear();
  const seq      = await nextSeq(tenantId, `invoice_${year}`);
  const invoiceNumber = `${prefix}${year}-${String(seq).padStart(5, '0')}`;

  const invoiceDate = new Date();
  const dueDate     = new Date(invoiceDate.getTime() + dueDays * 86400000);

  const customer = await Customer.findOne({ _id: order.customerId, tenantId: req.tenantId }).lean();

  const invoice = await SalesInvoice.create({
    tenantId:       req.tenantId,
    invoiceNumber,
    customerId:     order.customerId,
    customerSnapshot: customer ? {
      companyName:   customer.companyName,
      legalForm:     customer.legalForm,
      address:       customer.address,
      vatId:         customer.vatId,
      debtorAccount: customer.debtorAccount,
    } : { companyName: order.customerName },
    status:          'draft',
    invoiceDate,
    dueDate,
    lineItems:       order.lineItems,
    totalNetCents:   order.totalNetCents,
    totalVatCents:   order.totalVatCents,
    totalGrossCents: order.totalGrossCents,
    notes:           order.notes,
  });

  order.status               = 'invoiced';
  order.convertedToInvoiceId = invoice._id as unknown as typeof order.convertedToInvoiceId;
  await order.save();

  res.json({ order, invoice });
}));

export default router;
