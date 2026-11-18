/**
 * Tests for autoPost.ts — verifies correct SKR03 double-entry account mapping
 * when sales invoices, vendor invoices, payments, and returns are posted.
 *
 * All MongoDB models are mocked so no database connection is required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

// ── Module mocks ──────────────────────────────────────────────────────────────
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
vi.mock('../utils/crypto', () => ({ gobdHash: vi.fn().mockReturnValue('mock-hash') }));

import { JournalEntry }     from '../models/JournalEntry';
import { CashBookEntry }    from '../models/CashBookEntry';
import { Account }          from '../models/Account';
import { Period }           from '../models/Period';
import { FiscalYear }       from '../models/FiscalYear';
import { nextSeq }          from '../models/Counter';
import { ServiceItem }      from '../models/ServiceItem';
import { Product }          from '../models/Product';
import {
  postSalesInvoice,
  postVendorInvoice,
  postSalesInvoicePayment,
  postSalesReturn,
  reverseJournalEntry,
} from '../utils/autoPost';

const mockJE         = vi.mocked(JournalEntry);
const mockCB         = vi.mocked(CashBookEntry);
const mockAcct       = vi.mocked(Account);
const mockPeriod     = vi.mocked(Period);
const mockFY         = vi.mocked(FiscalYear);
const mockNextSeq    = vi.mocked(nextSeq);
const mockServiceItem = vi.mocked(ServiceItem);
const mockProduct    = vi.mocked(Product);

// ── SKR03 constants (must match autoPost.ts) ──────────────────────────────────
const SKR03 = {
  AR:           '1400',
  AP:           '1600',
  BANK:         '1200',
  VORSTEUER_19: '1576',
  USTEUER_19:   '1776',
  REVENUE_19:   '8400',
  REVENUE_7:    '8300',
  USTEUER_7:    '1771',
};

// ── Shared test fixtures ──────────────────────────────────────────────────────
const TENANT = new Types.ObjectId();
const USER   = new Types.ObjectId();

function setupCommonMocks(seqVal = 1) {
  mockNextSeq.mockResolvedValue(seqVal);
  mockAcct.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }); // returns number as name
  mockPeriod.findOne = vi.fn().mockResolvedValue(null);
  mockFY.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

  const fakeJE = {
    _id: new Types.ObjectId(),
    entryNumber: 'BU-000001',
    lines: [],
    totalDebit: 0,
    totalCredit: 0,
    status: 'posted',
    tenantId: TENANT,
    reference: '',
  };
  mockJE.create = vi.fn().mockResolvedValue(fakeJE);
  mockJE.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  mockJE.findOne = vi.fn().mockResolvedValue(null);
  mockCB.create = vi.fn().mockResolvedValue({});
  mockCB.exists = vi.fn().mockResolvedValue(false);

  return fakeJE;
}

function makeSalesInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id:         new Types.ObjectId(),
    tenantId:    TENANT,
    invoiceNumber: 'RE-2025-00001',
    invoiceDate: new Date('2025-06-15'),
    status:      'approved',
    totalGrossCents: 11900,  // €119 = €100 net + €19 VAT
    customerSnapshot: { companyName: 'Kunde GmbH' },
    lineItems: [
      {
        itemName:      'Service',
        quantity:      1,
        unitPriceCents: 10000,
        totalNetCents:  10000,
        totalVatCents:   1900,
        vatRate:         19,
      },
    ],
    ...overrides,
  };
}

function makeVendorInvoice(overrides: Record<string, unknown> = {}) {
  return {
    _id:         new Types.ObjectId(),
    tenantId:    TENANT,
    supplierInvoiceNumber: 'LI-2025-00001',
    invoiceDate: new Date('2025-06-15'),
    status:      'approved',
    totalGrossCents: 11900,
    supplierSnapshot: { companyName: 'Lieferant AG' },
    lineItems: [
      {
        itemName:       'Material',
        quantity:       10,
        unitPriceCents: 1000,
        totalNetCents:  10000,
        totalVatCents:   1900,
        vatRate:         19,
        expenseAccount: '',
      },
    ],
    ...overrides,
  };
}

// ── postSalesInvoice ──────────────────────────────────────────────────────────
describe('postSalesInvoice — SKR03 double-entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
    mockServiceItem.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockProduct.findOne    = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('debits AR (1400) for the gross amount', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoice(inv as never, USER);

    const [createCall] = mockJE.create.mock.calls;
    const lines = (createCall[0] as any).lines as { accountNumber: string; debit: number; credit: number }[];
    const arLine = lines.find(l => l.accountNumber === SKR03.AR);
    expect(arLine).toBeDefined();
    expect(arLine!.debit).toBeCloseTo(119, 1);   // €119 gross
    expect(arLine!.credit).toBe(0);
  });

  it('credits revenue account (8400) for the net amount at 19%', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; credit: number }[];
    const revLine = lines.find(l => l.accountNumber === SKR03.REVENUE_19);
    expect(revLine).toBeDefined();
    expect(revLine!.credit).toBeCloseTo(100, 1);  // €100 net
  });

  it('credits output VAT account (1776) for the VAT amount', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; credit: number }[];
    const vatLine = lines.find(l => l.accountNumber === SKR03.USTEUER_19);
    expect(vatLine).toBeDefined();
    expect(vatLine!.credit).toBeCloseTo(19, 1);   // €19 VAT
  });

  it('entry is balanced: totalDebit equals totalCredit', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { debit: number; credit: number }[];
    const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 5);
  });

  it('uses 8300 and 1771 for 7% VAT lines', async () => {
    const inv = makeSalesInvoice({
      totalGrossCents: 10700,
      lineItems: [{
        itemName: 'Buch',
        quantity: 1,
        unitPriceCents: 10000,
        totalNetCents: 10000,
        totalVatCents: 700,
        vatRate: 7,
      }],
    });
    await postSalesInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string }[];
    const accountNumbers = lines.map(l => l.accountNumber);
    expect(accountNumbers).toContain(SKR03.REVENUE_7);
    expect(accountNumbers).toContain(SKR03.USTEUER_7);
  });

  it('stamps a gobdHash on the entry', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoice(inv as never, USER);

    const entry = mockJE.create.mock.calls[0][0] as any;
    expect(entry.gobdHash).toBe('mock-hash');
  });
});

// ── postVendorInvoice ─────────────────────────────────────────────────────────
describe('postVendorInvoice — SKR03 double-entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
    mockServiceItem.findOne = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    mockProduct.findOne    = vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
  });

  it('credits AP (1600) for the gross amount', async () => {
    const inv = makeVendorInvoice();
    await postVendorInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; credit: number }[];
    const apLine = lines.find(l => l.accountNumber === SKR03.AP);
    expect(apLine).toBeDefined();
    expect(apLine!.credit).toBeCloseTo(119, 1);
  });

  it('debits input VAT account (1576) for the VAT amount', async () => {
    const inv = makeVendorInvoice();
    await postVendorInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; debit: number }[];
    const vstLine = lines.find(l => l.accountNumber === SKR03.VORSTEUER_19);
    expect(vstLine).toBeDefined();
    expect(vstLine!.debit).toBeCloseTo(19, 1);
  });

  it('debits the default expense account (4200) for net amount when no expenseAccount set', async () => {
    const inv = makeVendorInvoice();
    await postVendorInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; debit: number }[];
    const expLine = lines.find(l => l.accountNumber === '4200');
    expect(expLine).toBeDefined();
    expect(expLine!.debit).toBeCloseTo(100, 1);
  });

  it('uses the custom expenseAccount from the line item when provided', async () => {
    const inv = makeVendorInvoice({
      lineItems: [{
        itemName: 'Bürobedarf',
        quantity: 1,
        unitPriceCents: 10000,
        totalNetCents: 10000,
        totalVatCents: 1900,
        vatRate: 19,
        expenseAccount: '4980',
      }],
    });
    await postVendorInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string }[];
    expect(lines.map(l => l.accountNumber)).toContain('4980');
    expect(lines.map(l => l.accountNumber)).not.toContain('4200');
  });

  it('entry is balanced: totalDebit equals totalCredit', async () => {
    const inv = makeVendorInvoice();
    await postVendorInvoice(inv as never, USER);

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { debit: number; credit: number }[];
    const td = lines.reduce((s, l) => s + l.debit, 0);
    const tc = lines.reduce((s, l) => s + l.credit, 0);
    expect(td).toBeCloseTo(tc, 5);
  });
});

// ── postSalesInvoicePayment ───────────────────────────────────────────────────
describe('postSalesInvoicePayment — payment clears AR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it('debits Bank (1200) and credits AR (1400)', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoicePayment(inv as never, USER, '1200');

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; debit: number; credit: number }[];
    const bankLine = lines.find(l => l.accountNumber === '1200');
    const arLine   = lines.find(l => l.accountNumber === SKR03.AR);
    expect(bankLine?.debit).toBeCloseTo(119, 1);
    expect(arLine?.credit).toBeCloseTo(119, 1);
  });

  it('also writes a CashBookEntry when paid from Kasse (1000)', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoicePayment(inv as never, USER, '1000');

    expect(mockCB.create).toHaveBeenCalledOnce();
  });

  it('does NOT write a CashBookEntry for bank payment', async () => {
    const inv = makeSalesInvoice();
    await postSalesInvoicePayment(inv as never, USER, '1200');

    expect(mockCB.create).not.toHaveBeenCalled();
  });
});

// ── postSalesReturn ───────────────────────────────────────────────────────────
describe('postSalesReturn — reversal entry for POS returns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it('debits revenue (8400) and output VAT (1776), credits cash (1000)', async () => {
    const returnInv = makeSalesInvoice({
      invoiceNumber: 'RE-R-00001',
      totalGrossCents: -11900,
      lineItems: [{
        itemName: 'Return',
        quantity: 1,
        unitPriceCents: -10000,
        totalNetCents: -10000,
        totalVatCents: -1900,
        vatRate: 19,
      }],
    });
    await postSalesReturn(returnInv as never, USER, '1000');

    const lines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; debit: number; credit: number }[];
    const revLine  = lines.find(l => l.accountNumber === SKR03.REVENUE_19);
    const vatLine  = lines.find(l => l.accountNumber === SKR03.USTEUER_19);
    const cashLine = lines.find(l => l.accountNumber === '1000');
    expect(revLine?.debit).toBeCloseTo(100, 1);
    expect(vatLine?.debit).toBeCloseTo(19, 1);
    expect(cashLine?.credit).toBeCloseTo(119, 1);
  });

  it('writes a CashBookEntry for cash refunds', async () => {
    const returnInv = makeSalesInvoice({
      totalGrossCents: -11900,
      lineItems: [{ itemName: 'R', quantity: 1, unitPriceCents: -10000, totalNetCents: -10000, totalVatCents: -1900, vatRate: 19 }],
    });
    await postSalesReturn(returnInv as never, USER, '1000');

    expect(mockCB.create).toHaveBeenCalledOnce();
  });

  it('returns null when the gross amount is zero', async () => {
    const returnInv = makeSalesInvoice({ totalGrossCents: 0 });
    const result = await postSalesReturn(returnInv as never, USER);

    expect(result).toBeNull();
    expect(mockJE.create).not.toHaveBeenCalled();
  });
});

// ── reverseJournalEntry ───────────────────────────────────────────────────────
describe('reverseJournalEntry — debit/credit swap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupCommonMocks();
  });

  it('swaps debit and credit on each line', async () => {
    const originalEntry = {
      _id:    new Types.ObjectId(),
      tenantId: TENANT,
      entryNumber: 'BU-000001',
      description: 'Test entry',
      reference: 'REF',
      status: 'posted',
      sourceType: 'SalesInvoice',
      sourceId: new Types.ObjectId(),
      totalDebit: 119,
      totalCredit: 119,
      lines: [
        { accountNumber: '1400', accountName: 'Forderungen', debit: 119, credit: 0, description: 'AR' },
        { accountNumber: '8400', accountName: 'Erlöse', debit: 0, credit: 100, description: 'Rev' },
        { accountNumber: '1776', accountName: 'USt', debit: 0, credit: 19, description: 'VAT' },
      ],
    };
    await reverseJournalEntry(originalEntry as never, USER, 'Storno Test');

    const reversalLines = (mockJE.create.mock.calls[0][0] as any).lines as { accountNumber: string; debit: number; credit: number }[];
    const arReversal = reversalLines.find(l => l.accountNumber === '1400');
    expect(arReversal?.debit).toBe(0);      // was debit 119 → now credit
    expect(arReversal?.credit).toBe(119);
    const revReversal = reversalLines.find(l => l.accountNumber === '8400');
    expect(revReversal?.debit).toBe(100);   // was credit 100 → now debit
    expect(revReversal?.credit).toBe(0);
  });

  it('marks the original entry as reversed', async () => {
    const originalEntry = {
      _id:    new Types.ObjectId(),
      tenantId: TENANT,
      entryNumber: 'BU-000001',
      description: 'Original',
      reference: '',
      status: 'posted',
      sourceType: 'SalesInvoice',
      sourceId: new Types.ObjectId(),
      totalDebit: 100,
      totalCredit: 100,
      lines: [
        { accountNumber: '1200', accountName: 'Bank', debit: 100, credit: 0, description: '' },
        { accountNumber: '1400', accountName: 'AR',   debit: 0, credit: 100, description: '' },
      ],
    };
    await reverseJournalEntry(originalEntry as never, USER, 'Storno');

    expect(mockJE.updateOne).toHaveBeenCalledWith(
      { _id: originalEntry._id },
      expect.objectContaining({ $set: expect.objectContaining({ status: 'reversed' }) })
    );
  });
});
