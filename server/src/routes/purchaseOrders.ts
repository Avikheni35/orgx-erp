import { Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { nextSeq } from '../models/Counter';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { VendorInvoice } from '../models/VendorInvoice';
import { Supplier } from '../models/Supplier';
import { postPurchaseOrderReceipt, reversePurchaseOrderInventory } from '../utils/autoPost';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────
const lineSchema = z.object({
  description:    z.string().default(''),
  unit:           z.string().default('Stück'),
  quantity:       z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate:        z.number().min(0).max(100).default(19),
  serviceItemId:  z.string().optional(),
  productId:      z.string().optional(),
  variantId:      z.string().optional(),
});

function calcTotals(lines: z.infer<typeof lineSchema>[]) {
  let subtotalCents = 0, vatTotalCents = 0;
  const items = lines.map(l => {
    const net = Math.round(l.quantity * l.unitPriceCents);
    const vat = Math.round(net * l.vatRate / 100);
    subtotalCents += net;
    vatTotalCents += vat;
    return { ...l, lineTotalCents: net, vatAmountCents: vat, receivedQuantity: 0 };
  });
  return { items, subtotalCents, vatTotalCents, totalCents: subtotalCents + vatTotalCents };
}

const createSchema = z.object({
  supplierId:           z.string().min(1),
  orderDate:            z.string().refine(d => !isNaN(Date.parse(d))),
  expectedDeliveryDate: z.string().optional(),
  lineItems:            z.array(lineSchema).min(1),
  deliveryAddress:      z.string().default(''),
  notes:                z.string().default(''),
  internalNotes:        z.string().default(''),
});

// ── GET /purchase-orders ──────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, supplierId } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     q.status     = status;
  if (supplierId) q.supplierId = supplierId;
  const orders = await PurchaseOrder.find(q).sort({ orderDate: -1 });
  res.json({ orders });
}));

// ── POST /purchase-orders ─────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant', 'erp_employee'), validate(createSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);

  const supplier = await Supplier.findOne({ _id: body.supplierId, tenantId: req.tenantId });
  if (!supplier) throw new AppError('Lieferant nicht gefunden.', 404);

  const { items, subtotalCents, vatTotalCents, totalCents } = calcTotals(body.lineItems);
  const seq    = await nextSeq(tenantId, 'purchaseOrder');
  const poNum  = `BEG-${String(seq).padStart(6, '0')}`;

  const addr = supplier.address
    ? `${supplier.address.street}, ${supplier.address.zip} ${supplier.address.city}`
    : '';

  const order = await PurchaseOrder.create({
    tenantId:             req.tenantId,
    poNumber:             poNum,
    supplierId:           supplier._id,
    supplierName:         supplier.companyName,
    supplierAddress:      addr,
    orderDate:            new Date(body.orderDate),
    expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
    status:               'draft',
    lineItems:            items,
    subtotalCents,
    vatTotalCents,
    totalCents,
    currency:             'EUR',
    deliveryAddress:      body.deliveryAddress,
    notes:                body.notes,
    internalNotes:        body.internalNotes,
    createdBy:            req.user?.userId,
  });

  res.status(201).json(order);
}));

// ── GET /purchase-orders/:id ──────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Bestellung nicht gefunden.', 404);
  res.json(order);
}));

// ── PATCH /purchase-orders/:id/status ────────────────────────────────────────
router.patch('/:id/status', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const { status } = req.body as { status: string };
  const order = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Bestellung nicht gefunden.', 404);

  const ALLOWED: Record<string, string[]> = {
    draft:              ['sent', 'cancelled'],
    sent:               ['partially_received', 'received', 'cancelled'],
    partially_received: ['received', 'cancelled'],
    received:           [],
    cancelled:          [],
  };

  if (!ALLOWED[order.status]?.includes(status)) {
    throw new AppError(`Statusübergang von '${order.status}' zu '${status}' nicht erlaubt.`, 400);
  }

  const wasReceived = ['partially_received', 'received'].includes(order.status);
  order.status = status as typeof order.status;
  await order.save();

  if (wasReceived && status === 'cancelled') {
    reversePurchaseOrderInventory(
      order._id as unknown as Types.ObjectId,
      order.tenantId as unknown as Types.ObjectId,
      order.poNumber
    ).catch(e => console.error('[autoPost] PO inventory reversal failed:', e));
  }

  res.json(order);
}));

// ── POST /purchase-orders/:id/receive ────────────────────────────────────────
router.post('/:id/receive', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Bestellung nicht gefunden.', 404);
  if (!['sent', 'partially_received'].includes(order.status)) {
    throw new AppError('Wareneingang nur bei gesendeten oder teilweise eingegangenen Bestellungen möglich.', 400);
  }

  const lines = req.body.lines as { lineIndex: number; receivedQty: number }[];
  if (!Array.isArray(lines)) throw new AppError('lines[] erwartet.', 400);

  const deltas: { lineIndex: number; delta: number }[] = [];
  for (const { lineIndex, receivedQty } of lines) {
    if (lineIndex < 0 || lineIndex >= order.lineItems.length) continue;
    const line    = order.lineItems[lineIndex];
    const maxMore = line.quantity - line.receivedQuantity;
    const delta   = Math.min(Math.max(0, receivedQty), maxMore);
    line.receivedQuantity += delta;
    if (delta > 0) deltas.push({ lineIndex, delta });
  }

  const allReceived = order.lineItems.every(l => l.receivedQuantity >= l.quantity);
  order.status      = allReceived ? 'received' : 'partially_received';

  await order.save();

  if (deltas.length > 0) {
    const receiptLines = deltas.map(({ lineIndex, delta }) => {
      const line = order.lineItems[lineIndex];
      return {
        productId:      line.productId || undefined,
        variantId:      line.variantId || undefined,
        description:    line.description,
        unit:           line.unit,
        unitPriceCents: line.unitPriceCents,
        delta,
      };
    });
    postPurchaseOrderReceipt(
      order._id as unknown as Types.ObjectId,
      order.tenantId as unknown as Types.ObjectId,
      order.poNumber,
      receiptLines
    ).catch(e => console.error('[autoPost] PO receipt stock-in failed:', e));
  }

  res.json(order);
}));

// ── POST /purchase-orders/:id/convert ────────────────────────────────────────
router.post('/:id/convert', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const order = await PurchaseOrder.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!order) throw new AppError('Bestellung nicht gefunden.', 404);
  if (!['received', 'partially_received'].includes(order.status)) {
    throw new AppError('Nur eingegangene Bestellungen können in Eingangsrechnungen umgewandelt werden.', 400);
  }
  if (order.convertedToVendorInvoiceId) {
    throw new AppError('Bestellung wurde bereits umgewandelt.', 400);
  }

  const tenantId = String(req.tenantId);

  // Build vendor invoice line items — carry product references so VI approval skips double stock-in
  const viLineItems = order.lineItems.map(l => ({
    description:     l.description,
    unit:            l.unit,
    quantity:        l.quantity,
    unitPriceCents:  l.unitPriceCents,
    vatRate:         l.vatRate,
    totalNetCents:   l.lineTotalCents,
    totalVatCents:   l.vatAmountCents,
    totalGrossCents: l.lineTotalCents + l.vatAmountCents,
    serviceItemId:   l.serviceItemId || undefined,
    productId:       l.productId || undefined,
    variantId:       l.variantId || undefined,
  }));

  const supplier = await Supplier.findById(order.supplierId);

  const invoice = await VendorInvoice.create({
    tenantId:              req.tenantId,
    supplierInvoiceNumber: `aus ${order.poNumber}`,
    supplierId:            order.supplierId,
    supplierSnapshot: {
      companyName:     order.supplierName,
      address:         { street: '', city: '', zip: '', country: 'DE' },
      vatId:           supplier?.vatId ?? '',
      creditorAccount: supplier?.creditorAccount ?? '',
    },
    status:                'draft',
    invoiceDate:           new Date(),
    dueDate:               new Date(Date.now() + 30 * 86400_000),
    lineItems:             viLineItems,
    totalNetCents:         order.subtotalCents,
    totalVatCents:         order.vatTotalCents,
    totalGrossCents:       order.totalCents,
    paidCents:             0,
    notes:                 `Erstellt aus Bestellung ${order.poNumber}`,
    sourcePurchaseOrderId: order._id,
  });

  order.convertedToVendorInvoiceId = invoice._id as unknown as typeof order.convertedToVendorInvoiceId;
  await order.save();

  res.json({ order, invoiceId: invoice._id });
}));

export default router;
