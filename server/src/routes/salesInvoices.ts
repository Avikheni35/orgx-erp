import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { notifyAdmins } from '../utils/notify';
import { SalesInvoice } from '../models/SalesInvoice';
import { Customer, ICustomer } from '../models/Customer';
import { CompanySettings } from '../models/CompanySettings';
import { nextSeq } from '../models/Counter';
import { postSalesInvoice, postSalesInvoicePayment, reverseJournalEntry, reverseSalesInvoiceInventory, postSalesReturn } from '../utils/autoPost';
import { JournalEntry } from '../models/JournalEntry';
import { CashBookEntry } from '../models/CashBookEntry';
import { Types } from 'mongoose';
import puppeteer from 'puppeteer';
import { BankAccount } from '../models/BankAccount';
import { buildXRechnungXml } from '../utils/xrechnung';
import { sendEmail } from '../utils/email';
import jwt from 'jsonwebtoken';
import { calcTotals } from '../utils/calcTotals';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';

const router = Router();
router.use(requireAuth);

const lineItemSchema = z.object({
  serviceItemId:  z.string().optional(),
  productId:      z.string().optional(),
  variantId:      z.string().optional(),
  itemName:       z.string().optional(),
  description:    z.string().default(''),
  unit:           z.string().default('Stück'),
  quantity:       z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate:        z.number().min(0).max(100).default(19),
});

const createSchema = z.object({
  customerId:  z.string().min(1),
  invoiceDate: z.string().min(1),
  dueDate:     z.string().optional(),
  lineItems:   z.array(lineItemSchema).min(1),
  notes:       z.string().optional(),
});

const updateSchema = z.object({
  invoiceDate: z.string().optional(),
  dueDate:     z.string().optional(),
  lineItems:   z.array(lineItemSchema).min(1).optional(),
  notes:       z.string().optional(),
});

// GET /api/sales-invoices
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { status, customerId, from, to, page = '1', limit = '50', invoiceNumber } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)        filter.status        = status;
  if (customerId)    filter.customerId    = customerId;
  if (invoiceNumber) filter.invoiceNumber = { $regex: invoiceNumber, $options: 'i' };
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to)   dateFilter.$lte = new Date(to);
    filter.invoiceDate = dateFilter;
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await SalesInvoice.countDocuments(filter);
  const invoices = await SalesInvoice.find(filter)
    .sort({ invoiceDate: -1, invoiceNumber: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({ invoices, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/sales-invoices/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!invoice) throw new AppError('Invoice not found', 404);
  res.json(invoice);
}));

// POST /api/sales-invoices
router.post(
  '/',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    const customer = await Customer.findOne({ _id: req.body.customerId, tenantId: req.tenantId }).lean();
    if (!customer) throw new AppError('Customer not found', 404);

    const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
    const prefix   = settings?.invoicePrefix ?? 'RE-';
    const dueDays  = settings?.invoiceDueDays ?? 30;

    const year = new Date(req.body.invoiceDate).getFullYear();
    const seq  = await nextSeq(req.tenantId.toString(), `invoice_${year}`);
    const invoiceNumber = `${prefix}${year}-${String(seq).padStart(5, '0')}`;

    const invoiceDate = new Date(req.body.invoiceDate);
    const dueDate     = req.body.dueDate
      ? new Date(req.body.dueDate)
      : new Date(invoiceDate.getTime() + dueDays * 86400000);

    const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(req.body.lineItems);

    const invoice = await SalesInvoice.create({
      tenantId: req.tenantId,
      invoiceNumber,
      customerId: customer._id,
      customerSnapshot: {
        companyName:   customer.companyName,
        legalForm:     customer.legalForm,
        address:       customer.address,
        vatId:         customer.vatId,
        debtorAccount: customer.debtorAccount,
      },
      status: 'draft',
      invoiceDate,
      dueDate,
      lineItems,
      totalNetCents,
      totalVatCents,
      totalGrossCents,
      notes: req.body.notes,
    });

    await logAudit({ req, action: 'sales_invoice.create', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
    res.status(201).json(invoice);
  })
);

// PATCH /api/sales-invoices/:id  (draft only)
router.patch(
  '/:id',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be edited', 400);

    if (req.body.invoiceDate) invoice.invoiceDate = new Date(req.body.invoiceDate);
    if (req.body.dueDate)     invoice.dueDate     = new Date(req.body.dueDate);
    if (req.body.notes !== undefined) invoice.notes = req.body.notes;
    if (req.body.lineItems) {
      const totals = calcTotals(req.body.lineItems);
      invoice.lineItems       = totals.lineItems as unknown as typeof invoice.lineItems;
      invoice.totalNetCents   = totals.totalNetCents;
      invoice.totalVatCents   = totals.totalVatCents;
      invoice.totalGrossCents = totals.totalGrossCents;
    }
    await invoice.save();
    await logAudit({ req, action: 'sales_invoice.update', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
    res.json(invoice);
  })
);

// POST /api/sales-invoices/pos-sale  — create + send + optionally mark paid in one shot
const posSaleSchema = z.object({
  lineItems:   z.array(lineItemSchema).min(1),
  glAccount:   z.string().default('1200'),   // '1000' cash, '1200' bank
  payLater:    z.boolean().default(false),
  draft:       z.boolean().default(false),   // save as draft, skip journal + payment
  invoiceDate: z.string().optional(),
  notes:       z.string().optional(),
  customerId:  z.string().optional(),        // if provided, bill to this customer instead of walk-in
});

router.post(
  '/pos-sale',
  requireRole('erp_admin', 'erp_accountant', 'erp_employee', 'super_admin', 'agency_admin'),
  validate(posSaleSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    // Resolve customer: use provided customerId or fall back to walk-in
    let billingCustomer: (ICustomer & { _id: Types.ObjectId }) | null = null;
    if (req.body.customerId) {
      billingCustomer = await Customer.findOne({ _id: req.body.customerId, tenantId: req.tenantId });
      if (!billingCustomer) throw new AppError('Customer not found', 404);
    } else {
      billingCustomer = await Customer.findOneAndUpdate(
        { tenantId: req.tenantId, customerNumber: 'WALK-IN' },
        {
          $setOnInsert: {
            tenantId:        req.tenantId,
            customerNumber:  'WALK-IN',
            companyName:     'Laufkundschaft',
            address:         { street: '', city: '', zip: '', country: 'DE' },
            paymentTermsDays: 0,
            creditLimitCents: 0,
            isActive:         true,
          },
        },
        { upsert: true, new: true }
      );
    }
    const walkIn = billingCustomer!;

    const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
    const prefix   = settings?.invoicePrefix ?? 'RE-';

    const today        = req.body.invoiceDate ?? new Date().toISOString().slice(0, 10);
    const year         = new Date(today).getFullYear();
    const seq          = await nextSeq(req.tenantId.toString(), `invoice_${year}`);
    const invoiceNumber = `${prefix}${year}-${String(seq).padStart(5, '0')}`;

    const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(req.body.lineItems, true);

    const isDraft = req.body.draft === true;

    // Guard: reject posting into a closed/locked period (draft saves are always allowed)
    if (!isDraft) {
      const posDate   = new Date(today);
      const posPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: posDate }, endDate: { $gte: posDate } });
      if (posPeriod && posPeriod.status !== 'open') {
        throw new AppError(`Die Buchungsperiode "${posPeriod.name}" ist ${posPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
      }
      if (posPeriod?.fiscalYearId) {
        const fy = await FiscalYear.findById(posPeriod.fiscalYearId);
        if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
      }
    }

    const invoice = await SalesInvoice.create({
      tenantId: req.tenantId,
      invoiceNumber,
      customerId: walkIn._id,
      customerSnapshot: {
        companyName:   walkIn.companyName,
        legalForm:     walkIn.legalForm ?? '',
        address:       walkIn.address,
        vatId:         walkIn.vatId ?? '',
        debtorAccount: walkIn.debtorAccount ?? '',
      },
      status:          isDraft ? 'draft' : 'sent',
      invoiceDate:     new Date(today),
      dueDate:         new Date(today),
      sentAt:          isDraft ? undefined : new Date(),
      lineItems,
      totalNetCents,
      totalVatCents,
      totalGrossCents,
      notes: req.body.notes,
    });

    if (isDraft) {
      await logAudit({ req, action: 'sales_invoice.pos_sale', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
      return res.status(201).json(invoice);
    }

    const userId = new Types.ObjectId(req.user!.userId);

    // Post journal entry + move inventory
    await postSalesInvoice(invoice as typeof invoice & { _id: Types.ObjectId }, userId);

    if (!req.body.payLater) {
      invoice.status    = 'paid';
      invoice.paidAt    = new Date();
      invoice.paidCents = invoice.totalGrossCents;
      await invoice.save();
      await postSalesInvoicePayment(invoice as typeof invoice & { _id: Types.ObjectId }, userId, req.body.glAccount);
    }

    await logAudit({ req, action: 'sales_invoice.pos_sale', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
    res.status(201).json(invoice);
  })
);

// POST /api/sales-invoices/:id/pos-pay  — optionally update line items, then finalize + pay (ops employees)
const posPaySchema = z.object({
  glAccount: z.string().default('1200'),
  lineItems: z.array(lineItemSchema).optional(),  // if provided, replace draft's line items first
});

router.post(
  '/:id/pos-pay',
  requireRole('erp_admin', 'erp_accountant', 'erp_employee', 'super_admin', 'agency_admin'),
  validate(posPaySchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (!['draft', 'sent'].includes(invoice.status)) throw new AppError('Invoice cannot be paid', 400);

    const userId    = new Types.ObjectId(req.user!.userId);
    const glAccount = req.body.glAccount ?? '1200';

    // If caller sent updated line items, recalculate totals (gross-inclusive pricing) and persist
    if (req.body.lineItems && req.body.lineItems.length > 0) {
      const totals = calcTotals(req.body.lineItems, true);
      invoice.lineItems        = totals.lineItems as unknown as typeof invoice.lineItems;
      invoice.totalNetCents    = totals.totalNetCents;
      invoice.totalVatCents    = totals.totalVatCents;
      invoice.totalGrossCents  = totals.totalGrossCents;
    }

    if (invoice.status === 'draft') {
      invoice.status = 'sent';
      invoice.sentAt = new Date();
      await invoice.save();
      await postSalesInvoice(invoice as typeof invoice & { _id: Types.ObjectId }, userId);
    } else {
      await invoice.save();
    }

    invoice.status    = 'paid';
    invoice.paidAt    = new Date();
    invoice.paidCents = invoice.totalGrossCents;
    await invoice.save();
    await postSalesInvoicePayment(invoice as typeof invoice & { _id: Types.ObjectId }, userId, glAccount);
    await logAudit({ req, action: 'sales_invoice.paid', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
    res.json(invoice);
  })
);

// POST /api/sales-invoices/:id/pos-update  — update line items on a draft (gross-inclusive pricing)
router.post(
  '/:id/pos-update',
  requireRole('erp_admin', 'erp_accountant', 'erp_employee', 'super_admin', 'agency_admin'),
  validate(z.object({ lineItems: z.array(lineItemSchema).min(1) })),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be updated', 400);

    const totals = calcTotals(req.body.lineItems, true);
    invoice.lineItems       = totals.lineItems as unknown as typeof invoice.lineItems;
    invoice.totalNetCents   = totals.totalNetCents;
    invoice.totalVatCents   = totals.totalVatCents;
    invoice.totalGrossCents = totals.totalGrossCents;
    await invoice.save();
    await logAudit({ req, action: 'sales_invoice.update', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
    res.json(invoice);
  })
);

// POST /api/sales-invoices/pos-return  — issue a POS return/refund for a paid invoice
const posReturnSchema = z.object({
  originalInvoiceId: z.string().min(1),
  returnLineItems:   z.array(z.object({
    productId:      z.string().optional(),
    variantId:      z.string().optional(),
    description:    z.string(),
    unit:           z.string().default('Stk'),
    quantity:       z.number().positive(),
    unitPriceCents: z.number().int().min(0),
    vatRate:        z.number().min(0).max(100).default(19),
  })).min(1),
  glAccount: z.string().default('1000'),
});

router.post(
  '/pos-return',
  requireRole('erp_employee', 'erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(posReturnSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    const original = await SalesInvoice.findOne({ _id: req.body.originalInvoiceId, tenantId: req.tenantId });
    if (!original) throw new AppError('Original invoice not found', 404);
    if (original.status !== 'paid') throw new AppError('Can only return paid invoices', 400);

    const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
    const prefix   = (settings?.invoicePrefix ?? 'RE-').replace(/[-_]$/, '') + '-R';
    const year     = new Date().getFullYear();
    const seq      = await nextSeq(req.tenantId.toString(), `invoice_${year}`);
    const returnNumber = `${prefix}${year}-${String(seq).padStart(5, '0')}`;

    // Build return line items with negative totals
    const returnItems = req.body.returnLineItems.map((item: {
      productId?: string; variantId?: string; description: string; unit: string;
      quantity: number; unitPriceCents: number; vatRate: number;
    }) => {
      const totalGross  = Math.round(item.quantity * item.unitPriceCents);
      const totalNet    = Math.round(totalGross / (1 + item.vatRate / 100));
      const totalVat    = totalGross - totalNet;
      return {
        ...item,
        totalNetCents:   -totalNet,
        totalVatCents:   -totalVat,
        totalGrossCents: -totalGross,
      };
    });

    const totalGrossCents = returnItems.reduce((s: number, l: { totalGrossCents: number }) => s + l.totalGrossCents, 0);
    const totalNetCents   = returnItems.reduce((s: number, l: { totalNetCents: number }) => s + l.totalNetCents, 0);
    const totalVatCents   = returnItems.reduce((s: number, l: { totalVatCents: number }) => s + l.totalVatCents, 0);

    const returnInvoice = await SalesInvoice.create({
      tenantId:         req.tenantId,
      invoiceNumber:    returnNumber,
      customerId:       original.customerId,
      customerSnapshot: original.customerSnapshot,
      status:           'paid',
      invoiceDate:      new Date(),
      dueDate:          new Date(),
      sentAt:           new Date(),
      paidAt:           new Date(),
      lineItems:        returnItems,
      totalNetCents,
      totalVatCents,
      totalGrossCents,
      paidCents:              totalGrossCents,
      notes:                  `Rückgabe zu ${original.invoiceNumber}`,
      originalInvoiceId:      original._id.toString(),
      originalInvoiceNumber:  original.invoiceNumber,
    });

    // Restore inventory and create InventoryMovement records
    const { Product }        = await import('../models/Product');
    const { ProductVariant } = await import('../models/ProductVariant');
    const { InventoryMovement } = await import('../models/InventoryMovement');
    const userId = new Types.ObjectId(req.user!.userId);

    for (const item of req.body.returnLineItems as Array<{
      productId?: string; variantId?: string; description: string;
      unit: string; quantity: number; unitPriceCents: number; vatRate: number;
    }>) {
      if (item.variantId) {
        const updated = await ProductVariant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stockQuantity: item.quantity } },
          { new: true }
        ).lean();
        if (item.productId) {
          await InventoryMovement.create({
            tenantId:        req.tenantId,
            productId:       new Types.ObjectId(item.productId),
            variantId:       new Types.ObjectId(item.variantId),
            type:            'adjustment',
            quantity:        item.quantity,
            unitCostCents:   item.unitPriceCents,
            totalCents:      item.quantity * item.unitPriceCents,
            stockAfter:      updated?.stockQuantity ?? 0,
            sourceType:      'SalesInvoice',
            sourceId:        returnInvoice._id,
            sourceNumber:    returnNumber,
            lineDescription: `Rückgabe: ${item.description} × ${item.quantity}`,
          });
        }
      } else if (item.productId) {
        const updated = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stockQuantity: item.quantity } },
          { new: true }
        ).lean();
        await InventoryMovement.create({
          tenantId:        req.tenantId,
          productId:       new Types.ObjectId(item.productId),
          type:            'adjustment',
          quantity:        item.quantity,
          unitCostCents:   item.unitPriceCents,
          totalCents:      item.quantity * item.unitPriceCents,
          stockAfter:      updated?.stockQuantity ?? 0,
          sourceType:      'SalesInvoice',
          sourceId:        returnInvoice._id,
          sourceNumber:    returnNumber,
          lineDescription: `Rückgabe: ${item.description} × ${item.quantity}`,
        });
      }
    }

    // Post journal entry (revenue reversal + cash out) + cashbook entry
    postSalesReturn(
      returnInvoice as typeof returnInvoice & { _id: Types.ObjectId },
      userId,
      req.body.glAccount
    ).catch(e => console.error('[autoPost] return posting failed:', e));

    await logAudit({ req, action: 'sales_invoice.pos_return', targetType: 'SalesInvoice', targetId: returnInvoice._id, targetName: returnNumber });
    res.status(201).json(returnInvoice);
  })
);

// POST /api/sales-invoices/:id/send
router.post('/:id/send', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.status !== 'draft') throw new AppError('Only draft invoices can be sent', 400);

  // Guard: reject posting into a closed or locked accounting period
  const invDate = invoice.invoiceDate ?? new Date();
  const period = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: invDate }, endDate: { $gte: invDate } });
  if (period && period.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${period.name}" ist ${period.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Rechnungsdatum anpassen.`, 422);
  }
  if (period?.fiscalYearId) {
    const fy = await FiscalYear.findById(period.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }

  invoice.status = 'sent';
  invoice.sentAt = new Date();
  await invoice.save();
  // Auto-post: journal entry + inventory movements
  const userId = new Types.ObjectId(req.user!.userId);
  postSalesInvoice(invoice as typeof invoice & { _id: Types.ObjectId }, userId).catch(e =>
    console.error('[autoPost] sales invoice posting failed:', e)
  );
  await logAudit({ req, action: 'sales_invoice.sent', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
  res.json(invoice);
}));

// POST /api/sales-invoices/:id/mark-paid
router.post('/:id/mark-paid', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (!['sent','draft'].includes(invoice.status)) throw new AppError('Invoice cannot be marked as paid', 400);
  invoice.status    = 'paid';
  invoice.paidAt    = new Date();
  invoice.paidCents = invoice.totalGrossCents;
  await invoice.save();
  // Post payment receipt: Dr. bank/cash account / Cr. 1400 AR
  const userId = new Types.ObjectId(req.user!.userId);
  const glAccount = (req.body as { glAccount?: string }).glAccount ?? '1200';
  await postSalesInvoicePayment(invoice as typeof invoice & { _id: Types.ObjectId }, userId, glAccount);
  await logAudit({ req, action: 'sales_invoice.paid', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
  void notifyAdmins({
    tenantId: req.tenantId!,
    type: 'invoice_paid',
    title: `Rechnung bezahlt`,
    body: `${invoice.invoiceNumber} (${invoice.customerSnapshot?.companyName ?? ''}) — ${(invoice.totalGrossCents / 100).toFixed(2)} €`,
    link: `/erp/verkauf/rechnungen/${invoice._id}`,
  });
  res.json(invoice);
}));

// POST /api/sales-invoices/:id/unmark-paid
router.post('/:id/unmark-paid', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.status !== 'paid') throw new AppError('Only paid invoices can be revoked', 400);

  // Find the most recent posted payment receipt entry for this invoice.
  // Payment entries have a debit on a non-AR (non-1400) account.
  const entries = await JournalEntry.find({
    tenantId: req.tenantId,
    sourceType: 'SalesInvoice',
    sourceId: invoice._id,
    status: 'posted',
  }).sort({ createdAt: -1 });

  const paymentEntry = entries.find((e) =>
    e.lines.some((l) => l.debit > 0 && l.accountNumber !== '1400')
  );

  const userId = new Types.ObjectId(req.user!.userId);
  if (paymentEntry) {
    await reverseJournalEntry(
      paymentEntry as typeof paymentEntry & { _id: Types.ObjectId },
      userId,
      `Storno Zahlungseingang ${invoice.invoiceNumber} – ${invoice.customerSnapshot.companyName}`
    );

    // Remove linked CashBookEntry if one exists (cash payment)
    await CashBookEntry.deleteOne({ journalEntryId: paymentEntry._id, tenantId: req.tenantId });
  }

  invoice.status    = 'sent';
  invoice.paidAt    = undefined;
  invoice.paidCents = 0;
  await invoice.save();

  await logAudit({ req, action: 'sales_invoice.unmark_paid', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
  res.json(invoice);
}));

// POST /api/sales-invoices/:id/cancel
router.post('/:id/cancel', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.status === 'cancelled') throw new AppError('Already cancelled', 400);
  if (invoice.status === 'paid') throw new AppError('Paid invoices cannot be cancelled — issue a credit note', 400);

  invoice.status = 'cancelled';
  await invoice.save();

  const userId = new Types.ObjectId(req.user!.userId);

  // Find and reverse the original revenue journal entry for this invoice
  const revenueEntry = await JournalEntry.findOne({
    tenantId:   req.tenantId,
    sourceType: 'SalesInvoice',
    sourceId:   invoice._id,
    status:     'posted',
  }).sort({ _id: 1 }); // oldest = the revenue entry (payment entry is newer)

  if (revenueEntry && revenueEntry.lines.some(l => l.credit > 0 && l.accountNumber.startsWith('8'))) {
    const reversal = await reverseJournalEntry(
      revenueEntry as typeof revenueEntry & { _id: Types.ObjectId },
      userId,
      `Storno ${invoice.invoiceNumber} – ${invoice.customerSnapshot.companyName}`
    );
    // Restore inventory stock for all line items
    await reverseSalesInvoiceInventory(
      invoice._id as Types.ObjectId,
      req.tenantId as unknown as Types.ObjectId,
      reversal._id as Types.ObjectId,
      invoice.invoiceNumber
    );
  }

  await logAudit({ req, action: 'sales_invoice.cancel', targetType: 'SalesInvoice', targetId: invoice._id, targetName: invoice.invoiceNumber });
  res.json(invoice);
}));

// ── GET /:id/xrechnung — Download XRechnung / ZUGFeRD XML (EN 16931 / CII) ───
router.get('/:id/xrechnung', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);

  const [settings, bank] = await Promise.all([
    CompanySettings.findOne({ tenantId: req.tenantId }),
    BankAccount.findOne({ tenantId: req.tenantId, isDefault: true, isActive: true }),
  ]);

  const xml = buildXRechnungXml(invoice, settings, bank);
  const safeName = invoice.invoiceNumber.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const filename = `XRechnung_${safeName}.xml`;

  res.set({
    'Content-Type': 'application/xml; charset=UTF-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  res.send(xml);
}));

// ── GET /:id/pdf — Download invoice as PDF ────────────────────────────────────
router.get('/:id/pdf', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);

  const settings = await CompanySettings.findOne({ tenantId: req.tenantId });
  const company = settings?.companyName ?? 'Unternehmen';
  const vatId   = settings?.vatId ?? '';
  const addr    = [settings?.address?.street, `${settings?.address?.zip ?? ''} ${settings?.address?.city ?? ''}`.trim()].filter(Boolean).join(', ');

  const snap = invoice.customerSnapshot;
  const locale = 'de-DE';
  const fmt = (d: string | Date) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const money = (cents: number) => (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';

  const lineRows = invoice.lineItems.map(l => `
    <tr>
      <td>${l.itemName || l.description}</td>
      <td class="r">${l.quantity.toLocaleString(locale)}</td>
      <td class="r">${money(l.unitPriceCents)}</td>
      <td class="r">${l.vatRate} %</td>
      <td class="r">${money(l.totalNetCents)}</td>
      <td class="r">${money(l.totalGrossCents)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 40px; }
    h1 { font-size: 20pt; margin-bottom: 4px; }
    .meta { color: #555; font-size: 9pt; }
    .addr-block { margin: 24px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10pt; }
    th { background: #f0f0f0; padding: 6px 8px; text-align: left; border-bottom: 2px solid #ccc; }
    td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
    .r { text-align: right; }
    .totals { margin-top: 12px; text-align: right; }
    .totals td { border: none; padding: 3px 8px; }
    .grand { font-weight: bold; font-size: 12pt; }
    .footer { margin-top: 40px; font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 8px; }
    .overdue { color: #c00; font-weight: bold; }
  </style></head><body>
  <h1>Rechnung ${invoice.invoiceNumber}</h1>
  <div class="meta">${company}${vatId ? ` · USt-IdNr.: ${vatId}` : ''}${addr ? ` · ${addr}` : ''}</div>
  <div class="addr-block">
    <strong>${snap.companyName}${snap.legalForm ? ' ' + snap.legalForm : ''}</strong><br/>
    ${snap.address.street ? snap.address.street + '<br/>' : ''}
    ${snap.address.zip} ${snap.address.city}
    ${snap.vatId ? '<br/>USt-IdNr.: ' + snap.vatId : ''}
  </div>
  <table style="width:auto;border:none;margin:0">
    <tr><td class="meta" style="padding:2px 12px 2px 0">Rechnungsdatum:</td><td><strong>${fmt(invoice.invoiceDate)}</strong></td></tr>
    <tr><td class="meta" style="padding:2px 12px 2px 0">Fällig am:</td><td ${new Date(invoice.dueDate) < new Date() && invoice.status === 'sent' ? 'class="overdue"' : ''}>${fmt(invoice.dueDate)}</td></tr>
  </table>
  <table>
    <thead><tr><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">MwSt.</th><th class="r">Netto</th><th class="r">Brutto</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <table class="totals" style="width:auto;margin-left:auto">
    <tr><td>Netto gesamt:</td><td class="r">${money(invoice.totalNetCents)}</td></tr>
    <tr><td>MwSt. gesamt:</td><td class="r">${money(invoice.totalVatCents)}</td></tr>
    <tr class="grand"><td>Brutto gesamt:</td><td class="r">${money(invoice.totalGrossCents)}</td></tr>
  </table>
  ${invoice.notes ? `<p style="margin-top:20px;font-size:10pt">${invoice.notes}</p>` : ''}
  <div class="footer">Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer ${invoice.invoiceNumber}.</div>
  </body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Rechnung_${invoice.invoiceNumber}.pdf"`,
    });
    res.send(pdf);
  } finally {
    await browser.close();
  }
}));

// ── POST /:id/email — Send invoice as PDF attachment ─────────────────────────
router.post('/:id/email',
  requireRole('erp_admin', 'erp_accountant'),
  validate(z.object({
    to:      z.string().email(),
    subject: z.string().optional(),
    message: z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Stornierte Rechnungen können nicht versendet werden.', 400);

    const settings = await CompanySettings.findOne({ tenantId: req.tenantId });
    const company  = settings?.companyName ?? 'Unternehmen';
    const vatId    = settings?.vatId ?? '';
    const addr     = [settings?.address?.street, `${settings?.address?.zip ?? ''} ${settings?.address?.city ?? ''}`.trim()].filter(Boolean).join(', ');

    const snap   = invoice.customerSnapshot;
    const locale = 'de-DE';
    const fmt    = (d: string | Date) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const money  = (cents: number) => (cents / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';

    const lineRows = invoice.lineItems.map(l => `
      <tr>
        <td>${l.itemName || l.description}</td>
        <td class="r">${l.quantity.toLocaleString(locale)}</td>
        <td class="r">${money(l.unitPriceCents)}</td>
        <td class="r">${l.vatRate} %</td>
        <td class="r">${money(l.totalNetCents)}</td>
        <td class="r">${money(l.totalGrossCents)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 40px; }
      h1 { font-size: 20pt; margin-bottom: 4px; }
      .meta { color: #555; font-size: 9pt; }
      .addr-block { margin: 24px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 10pt; }
      th { background: #f0f0f0; padding: 6px 8px; text-align: left; border-bottom: 2px solid #ccc; }
      td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
      .r { text-align: right; }
      .totals { margin-top: 12px; text-align: right; }
      .totals td { border: none; padding: 3px 8px; }
      .grand { font-weight: bold; font-size: 12pt; }
      .footer { margin-top: 40px; font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 8px; }
    </style></head><body>
    <h1>Rechnung ${invoice.invoiceNumber}</h1>
    <div class="meta">${company}${vatId ? ` · USt-IdNr.: ${vatId}` : ''}${addr ? ` · ${addr}` : ''}</div>
    <div class="addr-block">
      <strong>${snap.companyName}${snap.legalForm ? ' ' + snap.legalForm : ''}</strong><br/>
      ${snap.address.street ? snap.address.street + '<br/>' : ''}
      ${snap.address.zip} ${snap.address.city}
      ${snap.vatId ? '<br/>USt-IdNr.: ' + snap.vatId : ''}
    </div>
    <table style="width:auto;border:none;margin:0">
      <tr><td class="meta" style="padding:2px 12px 2px 0">Rechnungsdatum:</td><td><strong>${fmt(invoice.invoiceDate)}</strong></td></tr>
      <tr><td class="meta" style="padding:2px 12px 2px 0">Fällig am:</td><td>${fmt(invoice.dueDate)}</td></tr>
    </table>
    <table>
      <thead><tr><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis</th><th class="r">MwSt.</th><th class="r">Netto</th><th class="r">Brutto</th></tr></thead>
      <tbody>${lineRows}</tbody>
    </table>
    <table class="totals" style="width:auto;margin-left:auto">
      <tr><td>Netto gesamt:</td><td class="r">${money(invoice.totalNetCents)}</td></tr>
      <tr><td>MwSt. gesamt:</td><td class="r">${money(invoice.totalVatCents)}</td></tr>
      <tr class="grand"><td>Brutto gesamt:</td><td class="r">${money(invoice.totalGrossCents)}</td></tr>
    </table>
    ${invoice.notes ? `<p style="margin-top:20px;font-size:10pt">${invoice.notes}</p>` : ''}
    <div class="footer">Bitte überweisen Sie den Betrag unter Angabe der Rechnungsnummer ${invoice.invoiceNumber}.</div>
    </body></html>`;

    // Generate PDF
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    let pdfBuffer: Buffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      pdfBuffer = Buffer.from(await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' } }));
    } finally {
      await browser.close();
    }

    const subject = req.body.subject || `Rechnung ${invoice.invoiceNumber} von ${company}`;
    const bodyText = req.body.message
      ? `<p>${req.body.message.replace(/\n/g, '<br/>')}</p><p>Bitte finden Sie die Rechnung im Anhang.</p>`
      : `<p>Sehr geehrte Damen und Herren,</p>
         <p>anbei erhalten Sie unsere Rechnung ${invoice.invoiceNumber} über ${money(invoice.totalGrossCents)} fällig am ${fmt(invoice.dueDate)}.</p>
         <p>Mit freundlichen Grüßen,<br/>${company}</p>`;

    await sendEmail({
      to: req.body.to,
      subject,
      html: bodyText,
      attachments: [{ filename: `Rechnung_${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    } as Parameters<typeof sendEmail>[0]);

    // Mark as sent if still draft
    if (invoice.status === 'draft') {
      invoice.status = 'sent';
      await invoice.save();
    }

    logAudit({ req, action: 'invoice_emailed', targetType: 'SalesInvoice', targetId: invoice._id, details: { to: req.body.to } });
    res.json({ message: 'Rechnung wurde per E-Mail versandt.', status: invoice.status });
  })
);

// ── POST /:id/send-link — Send self-service link to customer ──────────────────
router.post('/:id/send-link',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const invoice = await SalesInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
    if (!invoice) throw new AppError('Invoice not found', 404);
    if (invoice.status === 'cancelled') throw new AppError('Stornierte Rechnungen können nicht versendet werden.', 400);

    const customer = await Customer.findOne({ _id: invoice.customerId, tenantId: req.tenantId }, { contacts: 1 }).lean();
    const email = customer?.contacts?.find((c: { email?: string }) => c.email)?.email;
    if (!email) throw new AppError('Kunde hat keine E-Mail-Adresse hinterlegt.', 400);

    const token = jwt.sign(
      { invoiceId: invoice._id.toString(), tenantId: req.tenantId.toString(), purpose: 'invoice_view' },
      (req as unknown as { app: { get: (key: string) => string } }).app.get('jwtAccessSecret') || process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
      { expiresIn: '30d' },
    );

    const settings = await CompanySettings.findOne({ tenantId: req.tenantId }, { companyName: 1 }).lean();
    const company = settings?.companyName ?? 'Unternehmen';
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3002';
    const link = `${clientUrl}/erp/public/invoice/${token}`;

    await sendEmail({
      to: email,
      subject: `Ihre Rechnung ${invoice.invoiceNumber} – ${company}`,
      html: `
        <p>Sehr geehrte Damen und Herren,</p>
        <p>anbei erhalten Sie den Link zu Ihrer Rechnung <strong>${invoice.invoiceNumber}</strong>:</p>
        <p><a href="${link}">${link}</a></p>
        <p>Der Link ist 30 Tage gültig.</p>
        <p>Mit freundlichen Grüßen,<br>${company}</p>
      `,
    });

    logAudit({ req, action: 'invoice_link_sent', targetType: 'SalesInvoice', targetId: invoice._id, details: { to: email } });
    res.json({ message: 'Link wurde per E-Mail versandt.', email });
  })
);

export default router;
