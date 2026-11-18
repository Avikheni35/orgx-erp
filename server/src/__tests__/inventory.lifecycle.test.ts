/**
 * Tests for POS sale → stock decrement and return → stock restore.
 * Covers the inventory side of postSalesInvoice and reverseSalesInvoiceInventory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

vi.mock('../models/JournalEntry');
vi.mock('../models/CashBookEntry');
vi.mock('../models/Account');
vi.mock('../models/Period');
vi.mock('../models/FiscalYear');
vi.mock('../models/Counter');
vi.mock('../models/Accrual');
vi.mock('../models/ServiceItem');
vi.mock('../models/Product');
vi.mock('../models/ProductVariant');
vi.mock('../models/InventoryMovement');
vi.mock('../utils/crypto', () => ({ gobdHash: vi.fn().mockReturnValue('hash') }));

import { JournalEntry }      from '../models/JournalEntry';
import { CashBookEntry }     from '../models/CashBookEntry';
import { Account }           from '../models/Account';
import { Period }            from '../models/Period';
import { FiscalYear }        from '../models/FiscalYear';
import { nextSeq }           from '../models/Counter';
import { ServiceItem }       from '../models/ServiceItem';
import { Product }           from '../models/Product';
import { ProductVariant }    from '../models/ProductVariant';
import { InventoryMovement } from '../models/InventoryMovement';
import {
  postSalesInvoice,
  reverseSalesInvoiceInventory,
} from '../utils/autoPost';

const TENANT = new Types.ObjectId();
const USER   = new Types.ObjectId();
const INV_ID = new Types.ObjectId();
const ITEM_ID = new Types.ObjectId();
const PROD_ID = new Types.ObjectId();
const VAR_ID  = new Types.ObjectId();

function setupCoreMocks() {
  vi.mocked(nextSeq).mockResolvedValue(1);
  vi.mocked(Account).findOne  = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  vi.mocked(Period).findOne   = vi.fn().mockResolvedValue(null);
  vi.mocked(FiscalYear).findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  vi.mocked(JournalEntry).create = vi.fn().mockResolvedValue({ _id: new Types.ObjectId() });
  vi.mocked(JournalEntry).updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  vi.mocked(CashBookEntry).create = vi.fn().mockResolvedValue({});
  vi.mocked(CashBookEntry).exists = vi.fn().mockResolvedValue(false);
  vi.mocked(Product).findOne  = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
}

// ── postSalesInvoice — ServiceItem inventory out ──────────────────────────────
describe('postSalesInvoice → ServiceItem stock decrement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCoreMocks();
  });

  it('decrements ServiceItem.stockQuantity by the sold quantity', async () => {
    const mockItem = { name: 'Widget', category: 'Goods', stockQuantity: 10 };
    vi.mocked(ServiceItem).findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockItem) });
    vi.mocked(ServiceItem).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...mockItem, stockQuantity: 7 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    const inv = {
      _id: INV_ID, tenantId: TENANT, invoiceNumber: 'RE-001',
      invoiceDate: new Date(), totalGrossCents: 11900,
      customerSnapshot: { companyName: 'Kunde GmbH' },
      lineItems: [{
        serviceItemId: ITEM_ID.toString(),
        itemName: 'Widget', quantity: 3,
        unitPriceCents: 3967, totalNetCents: 11900, totalVatCents: 0, vatRate: 0,
      }],
    };
    await postSalesInvoice(inv as never, USER);

    expect(vi.mocked(ServiceItem).findByIdAndUpdate).toHaveBeenCalledWith(
      ITEM_ID.toString(),
      { $inc: { stockQuantity: -3 } },
      { new: true }
    );
  });

  it('creates an InventoryMovement with type "sale" and negative quantity', async () => {
    const mockItem = { name: 'Widget', category: 'Goods', stockQuantity: 10 };
    vi.mocked(ServiceItem).findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockItem) });
    vi.mocked(ServiceItem).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ stockQuantity: 7 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    const inv = {
      _id: INV_ID, tenantId: TENANT, invoiceNumber: 'RE-001',
      invoiceDate: new Date(), totalGrossCents: 11900,
      customerSnapshot: { companyName: 'Kunde GmbH' },
      lineItems: [{
        serviceItemId: ITEM_ID.toString(),
        itemName: 'Widget', quantity: 3,
        unitPriceCents: 3967, totalNetCents: 11900, totalVatCents: 0, vatRate: 0,
      }],
    };
    await postSalesInvoice(inv as never, USER);

    const movCall = vi.mocked(InventoryMovement).create.mock.calls[0][0] as { type: string; quantity: number };
    expect(movCall.type).toBe('sale');
    expect(movCall.quantity).toBe(-3);
  });

  it('skips inventory when line has no serviceItemId and no productId', async () => {
    vi.mocked(ServiceItem).findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    const inv = {
      _id: INV_ID, tenantId: TENANT, invoiceNumber: 'RE-001',
      invoiceDate: new Date(), totalGrossCents: 11900,
      customerSnapshot: { companyName: 'Kunde GmbH' },
      lineItems: [{
        itemName: 'Service (no item)', quantity: 1,
        unitPriceCents: 11900, totalNetCents: 10000, totalVatCents: 1900, vatRate: 19,
      }],
    };
    await postSalesInvoice(inv as never, USER);

    expect(vi.mocked(InventoryMovement).create).not.toHaveBeenCalled();
  });
});

// ── reverseSalesInvoiceInventory — ServiceItem stock restore ──────────────────
describe('reverseSalesInvoiceInventory → ServiceItem stock restore', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('restores ServiceItem stock by the sold quantity', async () => {
    const existingMovement = {
      serviceItemId: ITEM_ID,
      itemName: 'Widget',
      itemCategory: 'Goods',
      quantity: -3,
      unitCostCents: 1000,
      totalCents: 3000,
    };
    vi.mocked(InventoryMovement).find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([existingMovement]) });
    vi.mocked(ServiceItem).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ stockQuantity: 10 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    await reverseSalesInvoiceInventory(INV_ID, TENANT, new Types.ObjectId(), 'RE-001');

    // Must restore +3 units (opposite of -3)
    expect(vi.mocked(ServiceItem).findByIdAndUpdate).toHaveBeenCalledWith(
      ITEM_ID,
      { $inc: { stockQuantity: 3 } },
      { new: true }
    );
  });

  it('creates an adjustment InventoryMovement with positive quantity', async () => {
    const existingMovement = {
      serviceItemId: ITEM_ID,
      itemName: 'Widget',
      itemCategory: 'Goods',
      quantity: -2,
      unitCostCents: 500,
      totalCents: 1000,
    };
    vi.mocked(InventoryMovement).find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([existingMovement]) });
    vi.mocked(ServiceItem).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ stockQuantity: 5 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    await reverseSalesInvoiceInventory(INV_ID, TENANT, new Types.ObjectId(), 'RE-001');

    const movCall = vi.mocked(InventoryMovement).create.mock.calls[0][0] as { type: string; quantity: number; lineDescription: string };
    expect(movCall.type).toBe('adjustment');
    expect(movCall.quantity).toBe(2);   // absolute value restored
    expect(movCall.lineDescription).toContain('Storno');
  });

  it('does nothing when there are no prior sale movements', async () => {
    vi.mocked(InventoryMovement).find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    await reverseSalesInvoiceInventory(INV_ID, TENANT, new Types.ObjectId(), 'RE-001');

    expect(vi.mocked(InventoryMovement).create).not.toHaveBeenCalled();
  });
});

// ── reverseSalesInvoiceInventory — Product stock restore ──────────────────────
describe('reverseSalesInvoiceInventory → Product stock restore', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('restores Product stock when movement has no variant', async () => {
    const existingMovement = {
      productId: PROD_ID,
      itemName: 'T-Shirt',
      itemCategory: 'Apparel',
      quantity: -5,
      unitCostCents: 2000,
      totalCents: 10000,
    };
    vi.mocked(InventoryMovement).find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([existingMovement]) });
    vi.mocked(Product).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ stockQuantity: 20 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    await reverseSalesInvoiceInventory(INV_ID, TENANT, new Types.ObjectId(), 'RE-001');

    expect(vi.mocked(Product).findByIdAndUpdate).toHaveBeenCalledWith(
      PROD_ID,
      { $inc: { stockQuantity: 5 } },
      { new: true }
    );
  });

  it('restores ProductVariant stock when movement has a variantId', async () => {
    const existingMovement = {
      productId: PROD_ID,
      variantId: VAR_ID,
      itemName: 'T-Shirt Blue/M',
      itemCategory: 'Apparel',
      quantity: -2,
      unitCostCents: 2000,
      totalCents: 4000,
    };
    vi.mocked(InventoryMovement).find = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([existingMovement]) });
    vi.mocked(ProductVariant).findByIdAndUpdate = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue({ stockQuantity: 8 }) });
    vi.mocked(InventoryMovement).create = vi.fn().mockResolvedValue({});

    await reverseSalesInvoiceInventory(INV_ID, TENANT, new Types.ObjectId(), 'RE-001');

    expect(vi.mocked(ProductVariant).findByIdAndUpdate).toHaveBeenCalledWith(
      VAR_ID,
      { $inc: { stockQuantity: 2 } },
      { new: true }
    );
  });
});
