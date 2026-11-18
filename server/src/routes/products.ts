import { Router } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { ProductCategory } from '../models/ProductCategory';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';

const router = Router();
router.use(requireAuth);
router.use(requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'agency_admin', 'disponent'));

// ── Categories ──────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name:        z.string().min(1).max(100),
  parentId:    z.string().optional().nullable(),
  description: z.string().optional(),
  sortOrder:   z.number().optional(),
  isActive:    z.boolean().optional(),
});

router.get('/categories', asyncHandler(async (req, res) => {
  const cats = await ProductCategory.find({ tenantId: req.tenantId, isActive: true }).sort({ sortOrder: 1, name: 1 }).lean();
  res.json(cats);
}));

router.post('/categories', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), validate(categorySchema), asyncHandler(async (req, res) => {
  const cat = await ProductCategory.create({ tenantId: req.tenantId, ...req.body });
  res.status(201).json(cat);
}));

router.patch('/categories/:id', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const cat = await ProductCategory.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: req.body },
    { new: true }
  );
  if (!cat) throw new AppError('Category not found', 404);
  res.json(cat);
}));

router.delete('/categories/:id', requireRole('erp_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  const inUse = await Product.exists({ tenantId: req.tenantId, categoryId: req.params.id });
  if (inUse) throw new AppError('Category has products — deactivate instead', 409);
  await ProductCategory.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  res.json({ ok: true });
}));

// ── Products ─────────────────────────────────────────────────────────────────

const productSchema = z.object({
  name:                  z.string().min(1).max(200),
  sku:                   z.string().optional(),
  categoryId:            z.string().optional().nullable(),
  description:           z.string().optional(),
  unit:                  z.string().optional(),
  vatRate:               z.number().optional(),
  isService:             z.boolean().optional(),
  hasVariants:           z.boolean().optional(),
  variantAttributes:     z.array(z.string()).optional(),
  costPriceCents:        z.number().optional(),
  defaultUnitPriceCents: z.number().optional(),
  stockQuantity:         z.number().optional(),
  lowStockThreshold:     z.number().optional(),
  barcode:               z.string().optional(),
  isActive:              z.boolean().optional(),
  notes:                 z.string().optional(),
});

router.get('/', asyncHandler(async (req, res) => {
  const { category, search, active, type } = req.query;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (category) filter.categoryId = category;
  if (active !== undefined) filter.isActive = active === 'true';
  if (type === 'service') filter.isService = true;
  if (type === 'product') filter.isService = false;
  if (search) filter.$text = { $search: search as string };

  const products = await Product.find(filter).sort({ name: 1 }).lean();

  // attach category names
  const catIds = [...new Set(products.map(p => p.categoryId?.toString()).filter(Boolean))];
  const cats = catIds.length
    ? await ProductCategory.find({ _id: { $in: catIds } }).select('name').lean()
    : [];
  const catMap = Object.fromEntries(cats.map(c => [c._id.toString(), c.name]));

  // attach variant counts
  const productIds = products.map(p => p._id);
  const tenantOid = new Types.ObjectId(req.tenantId);
  const variantCounts = await ProductVariant.aggregate([
    { $match: { productId: { $in: productIds }, tenantId: tenantOid } },
    { $group: { _id: '$productId', count: { $sum: 1 }, totalStock: { $sum: '$stockQuantity' } } },
  ]);
  const variantMap = Object.fromEntries(variantCounts.map(v => [v._id.toString(), { count: v.count, totalStock: v.totalStock }]));

  const result = products.map(p => ({
    ...p,
    categoryName: p.categoryId ? (catMap[p.categoryId.toString()] ?? '') : '',
    variantCount: variantMap[p._id.toString()]?.count ?? 0,
    totalStock: p.hasVariants
      ? (variantMap[p._id.toString()]?.totalStock ?? 0)
      : p.stockQuantity,
  }));

  res.json(result);
}));

// resolve price for a product/variant + quantity — MUST be before /:id
router.get('/resolve-price', asyncHandler(async (req, res) => {
  const { productId, variantId, customerId, qty } = req.query;
  const quantity = Number(qty) || 1;

  const product = await Product.findOne({ _id: productId as string, tenantId: req.tenantId }).lean();
  if (!product) throw new AppError('Product not found', 404);

  let basePrice = product.defaultUnitPriceCents;
  if (variantId) {
    const variant = await ProductVariant.findById(variantId).lean();
    if (variant && variant.unitPriceCents > 0) basePrice = variant.unitPriceCents;
  }

  // check price list
  if (customerId) {
    const { Customer } = await import('../models/Customer');
    const { PriceList } = await import('../models/PriceList');
    const { PriceListEntry } = await import('../models/PriceListEntry');

    const customer = await Customer.findById(customerId).lean();
    const priceListId = customer?.priceListId
      || (await PriceList.findOne({ tenantId: req.tenantId, isDefault: true }).lean())?._id;

    if (priceListId) {
      const priceList = await PriceList.findById(priceListId).lean();

      const entries = await PriceListEntry.find({
        tenantId: req.tenantId,
        priceListId,
        productId: productId as string,
        minQty: { $lte: quantity },
      }).sort({ minQty: -1 }).lean();

      const variantEntry = entries.find(e => e.variantId?.toString() === variantId);
      const productEntry = entries.find(e => !e.variantId);
      const entry = variantEntry ?? productEntry;

      if (entry) {
        basePrice = entry.unitPriceCents;
      } else if (priceList && priceList.discountPercent > 0) {
        basePrice = Math.round(basePrice * (1 - priceList.discountPercent / 100));
      }
    }
  }

  res.json({ unitPriceCents: basePrice, vatRate: product.vatRate });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!product) throw new AppError('Product not found', 404);

  const [category, variants] = await Promise.all([
    product.categoryId
      ? ProductCategory.findById(product.categoryId).select('name').lean()
      : null,
    product.hasVariants
      ? ProductVariant.find({ productId: product._id, tenantId: req.tenantId }).sort({ sku: 1 }).lean()
      : [],
  ]);

  res.json({ ...product, categoryName: category?.name ?? '', variants });
}));

router.post('/', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), validate(productSchema), asyncHandler(async (req, res) => {
  const product = await Product.create({ tenantId: req.tenantId, ...req.body });
  res.status(201).json(product);
}));

router.patch('/:id', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const product = await Product.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: req.body },
    { new: true }
  );
  if (!product) throw new AppError('Product not found', 404);
  res.json(product);
}));

router.delete('/:id', requireRole('erp_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  await Product.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false }
  );
  res.json({ ok: true });
}));

// stock adjustment (simple product only)
router.post('/:id/stock-adjust', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { delta, reason } = req.body;
  if (typeof delta !== 'number') throw new AppError('delta required', 400);
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) throw new AppError('Product not found', 404);
  if (product.hasVariants) throw new AppError('Use variant stock adjustment for variant products', 400);
  product.stockQuantity = Math.max(0, product.stockQuantity + delta);
  await product.save();
  res.json({ stockQuantity: product.stockQuantity, reason });
}));

// ── Variants ─────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  attributes:        z.record(z.string()),
  sku:               z.string().optional(),
  barcode:           z.string().optional(),
  costPriceCents:    z.number().optional(),
  unitPriceCents:    z.number().optional(),
  stockQuantity:     z.number().optional(),
  lowStockThreshold: z.number().optional(),
  isActive:          z.boolean().optional(),
});

router.get('/:id/variants', asyncHandler(async (req, res) => {
  const variants = await ProductVariant.find({ productId: req.params.id, tenantId: req.tenantId }).lean();
  res.json(variants);
}));

router.post('/:id/variants', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), validate(variantSchema), asyncHandler(async (req, res) => {
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) throw new AppError('Product not found', 404);
  if (!product.hasVariants) throw new AppError('Product does not have variants enabled', 400);
  const variant = await ProductVariant.create({ tenantId: req.tenantId, productId: req.params.id, ...req.body });
  res.status(201).json(variant);
}));

// bulk create/replace variants (used by variant matrix generator)
router.put('/:id/variants', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { variants } = req.body as { variants: Array<Record<string, unknown>> };
  if (!Array.isArray(variants)) throw new AppError('variants array required', 400);
  const product = await Product.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!product) throw new AppError('Product not found', 404);

  const docs = variants.map(v => ({ tenantId: req.tenantId, productId: product._id, ...v }));
  await ProductVariant.deleteMany({ productId: product._id, tenantId: req.tenantId });
  const created = await ProductVariant.insertMany(docs);
  res.json(created);
}));

router.patch('/:id/variants/:variantId', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const variant = await ProductVariant.findOneAndUpdate(
    { _id: req.params.variantId, productId: req.params.id, tenantId: req.tenantId },
    { $set: req.body },
    { new: true }
  );
  if (!variant) throw new AppError('Variant not found', 404);
  res.json(variant);
}));

router.delete('/:id/variants/:variantId', requireRole('erp_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  await ProductVariant.findOneAndDelete({ _id: req.params.variantId, productId: req.params.id, tenantId: req.tenantId });
  res.json({ ok: true });
}));

// variant stock adjust
router.post('/:id/variants/:variantId/stock-adjust', requireRole('erp_admin', 'erp_accountant', 'agency_admin'), asyncHandler(async (req, res) => {
  const { delta } = req.body;
  if (typeof delta !== 'number') throw new AppError('delta required', 400);
  const variant = await ProductVariant.findOne({ _id: req.params.variantId, productId: req.params.id, tenantId: req.tenantId });
  if (!variant) throw new AppError('Variant not found', 404);
  variant.stockQuantity = Math.max(0, variant.stockQuantity + delta);
  await variant.save();
  res.json({ stockQuantity: variant.stockQuantity });
}));

export default router;
