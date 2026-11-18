import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { PriceList } from '../models/PriceList';
import { PriceListEntry } from '../models/PriceListEntry';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';
import { Customer } from '../models/Customer';

const router = Router();
router.use(requireAuth);
router.use(requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'agency_admin', 'disponent'));

const priceListSchema = z.object({
  name:            z.string().min(1).max(100),
  description:     z.string().optional(),
  isDefault:       z.boolean().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  currency:        z.string().optional(),
  isActive:        z.boolean().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const lists = await PriceList.find({ tenantId: req.tenantId }).sort({ isDefault: -1, name: 1 }).lean();

  const ids = lists.map(l => l._id);
  const [entryCounts, customerCounts] = await Promise.all([
    PriceListEntry.aggregate([
      { $match: { priceListId: { $in: ids } } },
      { $group: { _id: '$priceListId', count: { $sum: 1 } } },
    ]),
    Customer.aggregate([
      { $match: { priceListId: { $in: ids }, tenantId: req.tenantId } },
      { $group: { _id: '$priceListId', count: { $sum: 1 } } },
    ]),
  ]);

  const entryMap = Object.fromEntries(entryCounts.map(e => [e._id.toString(), e.count]));
  const custMap  = Object.fromEntries(customerCounts.map(c => [c._id.toString(), c.count]));

  res.json(lists.map(l => ({
    ...l,
    entryCount:    entryMap[l._id.toString()] ?? 0,
    customerCount: custMap[l._id.toString()] ?? 0,
  })));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const list = await PriceList.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!list) throw new AppError('Price list not found', 404);

  const [entries, customers] = await Promise.all([
    PriceListEntry.find({ priceListId: list._id, tenantId: req.tenantId }).sort({ minQty: 1 }).lean(),
    Customer.find({ priceListId: list._id, tenantId: req.tenantId }).select('companyName customerNumber').lean(),
  ]);

  // attach product/variant names to entries
  const productIds = [...new Set(entries.map(e => e.productId.toString()))];
  const variantIds = entries.map(e => e.variantId?.toString()).filter(Boolean) as string[];

  const [products, variants] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).select('name sku').lean(),
    ProductVariant.find({ _id: { $in: variantIds } }).select('sku attributes').lean(),
  ]);

  const prodMap    = Object.fromEntries(products.map(p => [p._id.toString(), p]));
  const variantMap = Object.fromEntries(variants.map(v => [v._id.toString(), v]));

  const enrichedEntries = entries.map(e => ({
    ...e,
    productName:    prodMap[e.productId.toString()]?.name ?? '',
    productSku:     prodMap[e.productId.toString()]?.sku ?? '',
    variantSku:     e.variantId ? (variantMap[e.variantId.toString()]?.sku ?? '') : '',
    variantAttribs: e.variantId ? (variantMap[e.variantId.toString()]?.attributes ?? {}) : {},
  }));

  res.json({ ...list, entries: enrichedEntries, customers });
}));

router.post('/', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), validate(priceListSchema), asyncHandler(async (req, res) => {
  if (req.body.isDefault) {
    await PriceList.updateMany({ tenantId: req.tenantId }, { isDefault: false });
  }
  const list = await PriceList.create({ tenantId: req.tenantId, ...req.body });
  res.status(201).json(list);
}));

router.patch('/:id', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  if (req.body.isDefault) {
    await PriceList.updateMany({ tenantId: req.tenantId }, { isDefault: false });
  }
  const list = await PriceList.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: req.body },
    { new: true }
  );
  if (!list) throw new AppError('Price list not found', 404);
  res.json(list);
}));

router.delete('/:id', requireRole('erp_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const inUse = await Customer.exists({ priceListId: req.params.id, tenantId: req.tenantId });
  if (inUse) throw new AppError('Price list assigned to customers — unassign first', 409);
  await Promise.all([
    PriceList.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId }),
    PriceListEntry.deleteMany({ priceListId: req.params.id, tenantId: req.tenantId }),
  ]);
  res.json({ ok: true });
}));

// bulk set entries for a price list (replaces all existing)
router.put('/:id/entries', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { entries } = req.body as {
    entries: Array<{ productId: string; variantId?: string; unitPriceCents: number; minQty?: number }>;
  };
  if (!Array.isArray(entries)) throw new AppError('entries array required', 400);

  await PriceListEntry.deleteMany({ priceListId: req.params.id, tenantId: req.tenantId });

  const docs = entries.map(e => ({
    tenantId:       req.tenantId,
    priceListId:    req.params.id,
    productId:      e.productId,
    variantId:      e.variantId ?? null,
    unitPriceCents: e.unitPriceCents,
    minQty:         e.minQty ?? 1,
  }));

  const created = docs.length ? await PriceListEntry.insertMany(docs) : [];
  res.json(created);
}));

// add / update single entry
router.post('/:id/entries', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { productId, variantId, unitPriceCents, minQty } = req.body;
  const entry = await PriceListEntry.findOneAndUpdate(
    { tenantId: req.tenantId, priceListId: req.params.id, productId, variantId: variantId ?? null, minQty: minQty ?? 1 },
    { $set: { unitPriceCents } },
    { upsert: true, new: true }
  );
  res.status(201).json(entry);
}));

router.delete('/:id/entries/:entryId', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  await PriceListEntry.findOneAndDelete({ _id: req.params.entryId, priceListId: req.params.id, tenantId: req.tenantId });
  res.json({ ok: true });
}));

// assign price list to customers (bulk)
router.post('/:id/assign-customers', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { customerIds } = req.body as { customerIds: string[] };
  if (!Array.isArray(customerIds)) throw new AppError('customerIds array required', 400);
  await Customer.updateMany(
    { _id: { $in: customerIds }, tenantId: req.tenantId },
    { priceListId: req.params.id }
  );
  res.json({ assigned: customerIds.length });
}));

export default router;
