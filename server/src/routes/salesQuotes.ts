import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { SalesQuote } from '../models/SalesQuote';
import { SalesInvoice } from '../models/SalesInvoice';
import { SalesOrder } from '../models/SalesOrder';
import { Customer } from '../models/Customer';
import { CompanySettings } from '../models/CompanySettings';
import { nextSeq } from '../models/Counter';
import { calcTotals } from '../utils/calcTotals';

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
  customerId:    z.string().min(1),
  quoteDate:     z.string().min(1),
  validUntil:    z.string().min(1),
  lineItems:     z.array(lineItemSchema).min(1),
  notes:         z.string().default(''),
  internalNotes: z.string().default(''),
});

const statusSchema = z.object({
  status: z.enum(['sent', 'accepted', 'rejected', 'expired']),
});

// GET /sales-quotes
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, customerId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     filter.status     = status;
  if (customerId) filter.customerId = customerId;
  const quotes = await SalesQuote.find(filter).sort({ quoteDate: -1 }).lean();
  res.json({ quotes });
}));

// POST /sales-quotes
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;

  const customer = await Customer.findOne({ _id: body.customerId, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Kunde nicht gefunden.', 404);

  const tenantId = String(req.tenantId);
  const seq      = await nextSeq(tenantId, 'quote');
  const quoteNumber = `ANG-${String(seq).padStart(6, '0')}`;

  const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(body.lineItems);

  const addrParts = [
    customer.address?.street, customer.address?.zip, customer.address?.city, customer.address?.country,
  ].filter(Boolean);

  const quote = await SalesQuote.create({
    tenantId:        req.tenantId,
    quoteNumber,
    customerId:      customer._id,
    customerName:    customer.companyName,
    customerAddress: addrParts.join(', '),
    quoteDate:       new Date(body.quoteDate),
    validUntil:      new Date(body.validUntil),
    lineItems,
    totalNetCents,
    totalVatCents,
    totalGrossCents,
    currency:        'EUR',
    notes:           body.notes,
    internalNotes:   body.internalNotes,
    createdBy:       req.user?.userId,
  });

  res.status(201).json(quote);
}));

// GET /sales-quotes/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const quote = await SalesQuote.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!quote) throw new AppError('Angebot nicht gefunden.', 404);
  res.json(quote);
}));

// PATCH /sales-quotes/:id/status
router.patch('/:id/status', requireRole('erp_admin', 'erp_accountant'), validate(statusSchema), asyncHandler(async (req, res) => {
  const { status } = req.body as z.infer<typeof statusSchema>;
  const quote = await SalesQuote.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!quote) throw new AppError('Angebot nicht gefunden.', 404);
  if (!['draft', 'sent'].includes(quote.status)) {
    throw new AppError('Status kann nur für Entwürfe oder gesendete Angebote geändert werden.', 400);
  }
  quote.status = status;
  await quote.save();
  res.json(quote);
}));

// POST /sales-quotes/:id/convert
router.post('/:id/convert', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const quote = await SalesQuote.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!quote) throw new AppError('Angebot nicht gefunden.', 404);
  if (quote.status !== 'accepted') throw new AppError('Nur akzeptierte Angebote können in Rechnungen umgewandelt werden.', 400);
  if (quote.convertedToInvoiceId) throw new AppError('Angebot wurde bereits umgewandelt.', 400);

  const tenantId  = String(req.tenantId);
  const settings  = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
  const prefix    = settings?.invoicePrefix ?? 'RE-';
  const dueDays   = settings?.invoiceDueDays ?? 30;
  const year      = new Date().getFullYear();
  const seq       = await nextSeq(tenantId, `invoice_${year}`);
  const invoiceNumber = `${prefix}${year}-${String(seq).padStart(5, '0')}`;

  const invoiceDate = new Date();
  const dueDate     = new Date(invoiceDate.getTime() + dueDays * 86400000);

  const customer = await Customer.findOne({ _id: quote.customerId, tenantId: req.tenantId }).lean();

  const invoice = await SalesInvoice.create({
    tenantId:       req.tenantId,
    invoiceNumber,
    customerId:     quote.customerId,
    customerSnapshot: customer ? {
      companyName:   customer.companyName,
      legalForm:     customer.legalForm,
      address:       customer.address,
      vatId:         customer.vatId,
      debtorAccount: customer.debtorAccount,
    } : { companyName: quote.customerName },
    status:          'draft',
    invoiceDate,
    dueDate,
    lineItems:       quote.lineItems,
    totalNetCents:   quote.totalNetCents,
    totalVatCents:   quote.totalVatCents,
    totalGrossCents: quote.totalGrossCents,
    notes:           quote.notes,
  });

  quote.status               = 'converted';
  quote.convertedToInvoiceId = invoice._id as unknown as typeof quote.convertedToInvoiceId;
  await quote.save();

  res.json({ quote, invoice });
}));

// POST /sales-quotes/:id/convert-to-order
router.post('/:id/convert-to-order', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const quote = await SalesQuote.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!quote) throw new AppError('Angebot nicht gefunden.', 404);
  if (quote.status !== 'accepted') throw new AppError('Nur akzeptierte Angebote können in Aufträge umgewandelt werden.', 400);
  if (quote.convertedToInvoiceId) throw new AppError('Angebot wurde bereits umgewandelt.', 400);

  const tenantId = String(req.tenantId);
  const seq      = await nextSeq(tenantId, 'order');
  const orderNumber = `AU-${String(seq).padStart(6, '0')}`;

  const lineItems = quote.lineItems.map(l => ({
    serviceItemId:     l.serviceItemId ?? '',
    itemName:          l.itemName ?? '',
    description:       l.description,
    unit:              l.unit,
    quantity:          l.quantity,
    unitPriceCents:    l.unitPriceCents,
    vatRate:           l.vatRate,
    totalNetCents:     l.totalNetCents,
    totalVatCents:     l.totalVatCents,
    totalGrossCents:   l.totalGrossCents,
    deliveredQuantity: 0,
  }));

  const order = await SalesOrder.create({
    tenantId:        req.tenantId,
    orderNumber,
    customerId:      quote.customerId,
    customerName:    quote.customerName,
    customerAddress: quote.customerAddress,
    quoteId:         quote._id,
    quoteNumber:     quote.quoteNumber,
    orderDate:       new Date(),
    status:          'draft',
    lineItems,
    totalNetCents:   quote.totalNetCents,
    totalVatCents:   quote.totalVatCents,
    totalGrossCents: quote.totalGrossCents,
    currency:        'EUR',
    notes:           quote.notes,
    internalNotes:   quote.internalNotes,
    createdBy:       req.user?.userId,
  });

  quote.status               = 'converted';
  quote.convertedToInvoiceId = order._id as unknown as typeof quote.convertedToInvoiceId;
  await quote.save();

  res.status(201).json({ quote, order });
}));

export default router;
