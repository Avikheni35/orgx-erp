import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { InventoryMovement } from '../models/InventoryMovement';
import { ServiceItem } from '../models/ServiceItem';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';

const router = Router();
router.use(requireAuth);

// GET /api/inventory — unified stock overview (products + variants + service items)
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);

  const [serviceItems, products, variants] = await Promise.all([
    ServiceItem.find({ tenantId: req.tenantId, isActive: true }).sort({ category: 1, name: 1 }).lean(),
    Product.find({ tenantId: req.tenantId, isActive: true, isService: false }).sort({ categoryName: 1, name: 1 }).lean(),
    ProductVariant.find({ tenantId: req.tenantId, isActive: true }).sort({ sku: 1 }).lean(),
  ]);

  res.json({
    serviceItems,
    products,
    variants,
    total: serviceItems.length + products.length + variants.length,
  });
}));

// GET /api/inventory/low-stock — products and variants below their lowStockThreshold
router.get('/low-stock', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);

  const [lowProducts, lowVariants] = await Promise.all([
    Product.find({
      tenantId: req.tenantId,
      isActive: true,
      isService: false,
      hasVariants: false,
      $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
    }).select('_id name sku stockQuantity lowStockThreshold categoryName unit costPriceCents').lean(),

    ProductVariant.find({
      tenantId: req.tenantId,
      isActive: true,
      $expr: { $lte: ['$stockQuantity', '$lowStockThreshold'] },
    }).select('_id productId sku stockQuantity lowStockThreshold attributes costPriceCents').lean(),
  ]);

  res.json({
    count:    lowProducts.length + lowVariants.length,
    products: lowProducts,
    variants: lowVariants,
  });
}));

// GET /api/inventory/movements — paginated movement history
router.get('/movements', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { serviceItemId, productId, variantId, sourceType, sourceId, type, page = '1', limit = '100' } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (serviceItemId) filter.serviceItemId = serviceItemId;
  if (productId)     filter.productId     = productId;
  if (variantId)     filter.variantId     = variantId;
  if (sourceType)    filter.sourceType    = sourceType;
  if (sourceId)      filter.sourceId      = sourceId;
  if (type)          filter.type          = type;

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await InventoryMovement.countDocuments(filter);
  const movements = await InventoryMovement.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({ movements, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/inventory/movements/by-source/:sourceType/:sourceId
router.get('/movements/by-source/:sourceType/:sourceId', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const movements = await InventoryMovement.find({
    tenantId:   req.tenantId,
    sourceType: req.params.sourceType,
    sourceId:   req.params.sourceId,
  }).sort({ createdAt: 1 }).lean();
  res.json({ movements });
}));

export default router;
