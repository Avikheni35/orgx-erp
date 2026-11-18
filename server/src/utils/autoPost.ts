import { Types } from 'mongoose';
import { gobdHash } from './crypto';
import { nextSeq } from '../models/Counter';
import { JournalEntry } from '../models/JournalEntry';
import { CashBookEntry } from '../models/CashBookEntry';
import { Accrual } from '../models/Accrual';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';
import { InventoryMovement } from '../models/InventoryMovement';
import { ServiceItem } from '../models/ServiceItem';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';
import type { IVendorInvoice } from '../models/VendorInvoice';
import type { ISalesInvoice } from '../models/SalesInvoice';
import type { IJournalEntry } from '../models/JournalEntry';

// SKR03 default accounts
const SKR03 = {
  AR:           '1400', // Forderungen aus LuL (SKR03: 1400)
  AP:           '1600', // Verbindlichkeiten aus LuL
  BANK:         '1200', // Bank (Guthaben bei Kreditinstituten)
  VORSTEUER_19: '1576', // Abziehbare Vorsteuer 19%
  VORSTEUER_7:  '1571', // Abziehbare Vorsteuer 7%
  USTEUER_19:   '1776', // Umsatzsteuer 19%
  USTEUER_7:    '1771', // Umsatzsteuer 7%
  REVENUE_19:   '8400', // Erlöse 19%
  REVENUE_7:    '8300', // Erlöse 7%
  EXPENSE:      '4200', // Wareneinkauf (default if no expenseAccount on line)
};

interface RawLine {
  accountNumber: string;
  debit:         number;
  credit:        number;
  description:   string;
}

async function lookupAccountName(tenantId: Types.ObjectId, number: string): Promise<string> {
  const acct = await Account.findOne({ tenantId, number }, { name: 1 }).lean();
  return acct?.name ?? number;
}

async function resolvePeriod(tenantId: Types.ObjectId, date: Date) {
  const period = await Period.findOne({
    tenantId,
    startDate: { $lte: date },
    endDate:   { $gte: date },
  });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId }).lean();
  return { periodId: period._id as Types.ObjectId, fiscalYearId: fy?._id as Types.ObjectId | undefined };
}

async function createPostedEntry(params: {
  tenantId:   Types.ObjectId;
  userId:     Types.ObjectId;
  date:       Date;
  description: string;
  reference:  string;
  sourceType: 'VendorInvoice' | 'SalesInvoice';
  sourceId:   Types.ObjectId;
  rawLines:   RawLine[];
}) {
  const { periodId, fiscalYearId } = await resolvePeriod(params.tenantId, params.date);

  const lines = await Promise.all(
    params.rawLines.map(async l => ({
      accountNumber: l.accountNumber,
      accountName:   await lookupAccountName(params.tenantId, l.accountNumber),
      debit:         l.debit,
      credit:        l.credit,
      description:   l.description,
    }))
  );

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Retry up to 5 times on duplicate entryNumber (E11000).
  // Happens when counter falls behind existing entries (e.g. after re-seeding).
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq         = await nextSeq(String(params.tenantId), 'journal');
    const entryNumber = `BU-${String(seq).padStart(6, '0')}`;

    const hash = gobdHash({
      tenantId:    String(params.tenantId),
      entryNumber,
      date:        params.date.toISOString(),
      description: params.description,
      lines,
      totalDebit,
      totalCredit,
    });

    try {
      return await JournalEntry.create({
        tenantId:    params.tenantId,
        entryNumber,
        date:        params.date,
        description: params.description,
        reference:   params.reference,
        status:      'posted',
        lines,
        totalDebit,
        totalCredit,
        periodId,
        fiscalYearId,
        gobdHash:    hash,
        sourceType:  params.sourceType,
        sourceId:    params.sourceId,
        createdBy:   params.userId,
        postedAt:    new Date(),
        postedBy:    params.userId,
      });
    } catch (err: any) {
      // E11000 duplicate key on entryNumber — counter was behind, loop will call nextSeq again
      if (err?.code === 11000 && err?.message?.includes('entryNumber')) {
        console.warn(`[autoPost] entryNumber ${entryNumber} collision, retrying (attempt ${attempt + 1})`);
        continue;
      }
      throw err;
    }
  }

  throw new Error('[autoPost] Failed to create journal entry after 5 attempts (persistent entryNumber collision)');
}

async function createSafeCashbookEntry(
  tenantId: Types.ObjectId,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fields: Record<string, any>,
  makeGobdHash?: (entryNumber: string) => string
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cbSeq       = await nextSeq(String(tenantId), 'cashbook');
    const entryNumber = `KB-${String(cbSeq).padStart(6, '0')}`;
    const hash        = makeGobdHash ? makeGobdHash(entryNumber) : undefined;
    try {
      return await CashBookEntry.create({
        ...fields,
        entryNumber,
        ...(hash !== undefined ? { gobdHash: hash } : {}),
      });
    } catch (err: any) {
      if (err?.code === 11000 && err?.message?.includes('entryNumber')) {
        console.warn(`[autoPost] cashbook entryNumber ${entryNumber} collision, retrying (attempt ${attempt + 1})`);
        continue;
      }
      throw err;
    }
  }
  throw new Error('[autoPost] Failed to create cashbook entry after 5 attempts (persistent entryNumber collision)');
}

// ─── M2 Event Staff Payment → Journal ────────────────────────────────────────
// SKR03: Dr 4120 Löhne / Cr 1200 Bank
export async function postM2EventPayment(params: {
  tenantId:              Types.ObjectId;
  userId:                Types.ObjectId;
  staffName:             string;
  netAmount:             number;   // euros — the amount being paid now
  paidHours?:            number;   // hours being paid now (for rate calculation)
  year:                  number;
  month:                 number;
  syncId:                string;
  paymentAccountNumber?: string;   // defaults to 1200 (Bank)
  carryForwardHours?:    number;   // remaining hours carried to next month
}) {
  const date = new Date(); // actual payment date (today)
  const { periodId, fiscalYearId } = await resolvePeriod(params.tenantId, date);

  const WAGES      = '4120'; // Löhne
  const BANK       = params.paymentAccountNumber ?? '1200';

  const [wagesName, bankName] = await Promise.all([
    lookupAccountName(params.tenantId, WAGES),
    lookupAccountName(params.tenantId, BANK),
  ]);

  const paymentLabel = BANK.startsWith('10') ? 'Barzahlung' : 'Banküberweisung';
  const lines = [
    { accountNumber: WAGES, accountName: wagesName, debit: params.netAmount, credit: 0, description: `Lohn ${params.staffName}` },
    { accountNumber: BANK,  accountName: bankName,  debit: 0, credit: params.netAmount, description: `${paymentLabel} ${params.staffName}` },
  ];

  const seq         = await nextSeq(String(params.tenantId), 'journal');
  const entryNumber = `BU-${String(seq).padStart(6, '0')}`;
  const description = `Event-Personal Auszahlung – ${params.staffName}`;
  const jeSyncId    = `je_${params.syncId}`;

  // Free the syncId on any reversed entry so the unique index allows re-posting
  await JournalEntry.updateOne(
    { tenantId: params.tenantId, syncId: jeSyncId, status: 'reversed' },
    { $unset: { syncId: '' } }
  );

  const hash = gobdHash({ tenantId: String(params.tenantId), entryNumber, date: date.toISOString(), description, lines, totalDebit: params.netAmount, totalCredit: params.netAmount });

  // Idempotent — if a posted entry exists with same syncId, reuse it unless the amount changed
  let je = await JournalEntry.findOne({ tenantId: params.tenantId, syncId: jeSyncId, status: 'posted' });

  const jeAmountChanged  = je && Math.round(je.totalDebit * 100) !== Math.round(params.netAmount * 100);
  const jeAccountChanged = je && !(je.lines as { accountNumber: string; credit: number }[]).some(l => l.accountNumber === BANK && l.credit > 0);

  if ((jeAmountChanged || jeAccountChanged) && je) {
    // Amount or account changed — reverse the old entry and clear its syncId so re-posting is allowed
    const reversalSeq = await nextSeq(String(params.tenantId), 'journal');
    const reversalNum = `BU-${String(reversalSeq).padStart(6, '0')}`;
    const reversalLines = je.lines.map((l: { accountNumber: string; accountName: string; debit: number; credit: number }) => ({
      accountNumber: l.accountNumber,
      accountName:   l.accountName,
      debit:         l.credit,
      credit:        l.debit,
      description:   `Storno: ${description}`,
    }));
    const reversalHash = gobdHash({ tenantId: String(params.tenantId), entryNumber: reversalNum, date: date.toISOString(), description: `Storno von ${je.entryNumber}: ${description}`, lines: reversalLines, totalDebit: je.totalCredit, totalCredit: je.totalDebit });
    const { periodId: rPeriodId, fiscalYearId: rFiscalYearId } = await resolvePeriod(params.tenantId, date);
    await JournalEntry.create({ tenantId: params.tenantId, entryNumber: reversalNum, date, description: `Storno von ${je.entryNumber}: ${description}`, reference: params.syncId, status: 'posted', lines: reversalLines, totalDebit: je.totalCredit, totalCredit: je.totalDebit, periodId: rPeriodId, fiscalYearId: rFiscalYearId, gobdHash: reversalHash, sourceType: 'M2Payment', createdBy: params.userId, postedAt: new Date(), postedBy: params.userId, reversalOf: je._id });
    await JournalEntry.updateOne({ _id: je._id }, { $set: { status: 'reversed' }, $unset: { syncId: '' } });
    // Remove stale cashbook entry linked to the old journal entry
    await CashBookEntry.deleteOne({ tenantId: params.tenantId, journalEntryId: je._id });
    je = null as unknown as typeof je;
  }

  if (!je) {
    je = await JournalEntry.create({
      tenantId:    params.tenantId,
      entryNumber,
      date,
      description,
      reference:   params.syncId,
      status:      'posted',
      lines,
      totalDebit:  params.netAmount,
      totalCredit: params.netAmount,
      periodId,
      fiscalYearId,
      gobdHash:    hash,
      sourceType:  'M2Payment',
      createdBy:   params.userId,
      postedAt:    new Date(),
      postedBy:    params.userId,
      syncId:      jeSyncId,
      source:      'm3',
    });
  }

  // Write CashBookEntry if one doesn't already exist for this journal entry
  const amountCents = Math.round(params.netAmount * 100);
  if (amountCents > 0) {
    const cbExists = await CashBookEntry.exists({ tenantId: params.tenantId, journalEntryId: je._id });
    if (!cbExists) {
      await createSafeCashbookEntry(params.tenantId, {
        tenantId:          params.tenantId,
        date,
        type:              'payment',
        description,
        cashAccount:       BANK,
        cashAccountName:   bankName,
        contraAccount:     WAGES,
        contraAccountName: wagesName,
        amountCents,
        vatRate:           0,
        vatCents:          0,
        netCents:          amountCents,
        journalEntryId:    je._id,
        createdBy:         params.userId,
      });
    }
  }

  // Create draft accrual liability for carry-forward hours
  if (params.carryForwardHours && params.carryForwardHours > 0) {
    const accrualRef = `cf_${params.syncId}`;
    const existingAccrual = await Accrual.exists({ tenantId: params.tenantId, referenceDocument: accrualRef });
    if (!existingAccrual) {
      // Derive hourly rate from amount paid ÷ hours paid; fall back to 0 if unknown
      const ratePerHour = (params.paidHours && params.paidHours > 0)
        ? params.netAmount / params.paidHours
        : 0;
      const carryAmountCents = ratePerHour > 0
        ? Math.round(params.carryForwardHours * ratePerHour * 100)
        : 1; // minimum 1 cent when rate unknown; coordinator sees hours in description
      const nextMonthYear  = params.month === 12 ? params.year + 1 : params.year;
      const nextMonthNum   = params.month === 12 ? 1 : params.month + 1;
      const nextMonthStart = new Date(nextMonthYear, nextMonthNum - 1, 1);
      const nextMonthEnd   = new Date(nextMonthYear, nextMonthNum, 0);
      const accrualSeq = await nextSeq(String(params.tenantId), 'accrual');
      const accrualNum = `AR-${String(accrualSeq).padStart(6, '0')}`;
      await Accrual.create({
        tenantId:          params.tenantId,
        accrualNumber:     accrualNum,
        type:              'arap',
        description:       `Lohnübertrag ${params.staffName} – ${params.carryForwardHours.toFixed(2)} h (${params.month}/${params.year} → ${nextMonthNum}/${nextMonthYear})`,
        accrualAccount:    '4120',  // Löhne
        contraAccount:     '1740',  // Sonstige Verbindlichkeiten
        amountCents:       carryAmountCents,
        postDate:          nextMonthStart,
        startDate:         nextMonthStart,
        endDate:           nextMonthEnd,
        referenceDocument: accrualRef,
        notes:             `${params.carryForwardHours.toFixed(2)} h Übertrag aus ${params.month}/${params.year}. Bitte bei nächster Abrechnung berücksichtigen.`,
        status:            'draft',
        createdBy:         params.userId,
      });
    }
  }

  return je;
}

// ─── Vendor Invoice → Journal + Inventory In ─────────────────────────────────
export async function postVendorInvoice(
  inv: IVendorInvoice & { _id: Types.ObjectId },
  userId: Types.ObjectId
) {
  const tenantId  = inv.tenantId as Types.ObjectId;
  const fxRate    = (inv as any).exchangeRate ?? 1;
  const isForeign = ((inv as any).currency ?? 'EUR') !== 'EUR';
  // fxRate = "1 EUR = X foreign" → EUR = foreignCents / 100 / fxRate
  const toEur     = (cents: number) => isForeign ? (cents / 100) / fxRate : cents / 100;
  const currLabel = isForeign ? ` (${(inv as any).currency} → EUR @ ${fxRate})` : '';
  // When a VI was converted from a received PO, stock already moved at goods receipt.
  // Skip the inventory loops to avoid double-counting; only the journal entry is posted.
  const fromPO = !!inv.sourcePurchaseOrderId;

  // Aggregate expense and VAT by account/rate
  const expenseMap = new Map<string, { cents: number; desc: string }>();
  const vatMap     = new Map<number, number>(); // rate → vatCents

  for (const line of inv.lineItems) {
    const acct = line.expenseAccount?.trim() || SKR03.EXPENSE;
    const prev = expenseMap.get(acct);
    expenseMap.set(acct, {
      cents: (prev?.cents ?? 0) + line.totalNetCents,
      desc:  `Wareneinkauf – ${inv.supplierSnapshot.companyName}`,
    });
    if (line.vatRate > 0) {
      vatMap.set(line.vatRate, (vatMap.get(line.vatRate) ?? 0) + line.totalVatCents);
    }
  }

  const rawLines: RawLine[] = [];

  // Dr. expense accounts (net EUR equivalent)
  for (const [acct, { cents, desc }] of expenseMap) {
    rawLines.push({ accountNumber: acct, debit: toEur(cents), credit: 0, description: `${desc}${currLabel}` });
  }
  // Dr. input VAT
  for (const [rate, cents] of vatMap) {
    const vatAcct = rate >= 19 ? SKR03.VORSTEUER_19 : SKR03.VORSTEUER_7;
    rawLines.push({ accountNumber: vatAcct, debit: toEur(cents), credit: 0, description: `Vorsteuer ${rate}% – ${inv.supplierInvoiceNumber}${currLabel}` });
  }
  // Cr. AP payable (gross EUR equivalent)
  rawLines.push({
    accountNumber: SKR03.AP,
    debit:  0,
    credit: toEur(inv.totalGrossCents),
    description: `${inv.supplierSnapshot.companyName} – ${inv.supplierInvoiceNumber}${currLabel}`,
  });

  const entry = await createPostedEntry({
    tenantId,
    userId,
    date:        inv.invoiceDate,
    description: `EK ${inv.supplierInvoiceNumber} – ${inv.supplierSnapshot.companyName}`,
    reference:   inv.supplierInvoiceNumber,
    sourceType:  'VendorInvoice',
    sourceId:    inv._id,
    rawLines,
  });

  // Inventory movements — skipped when VI was converted from a received PO (stock already moved)
  // ServiceItem-linked lines (legacy catalog)
  if (!fromPO) for (const line of inv.lineItems) {
    if (!line.serviceItemId) continue;
    const item = await ServiceItem.findOne({ _id: line.serviceItemId, tenantId }).lean();
    if (!item) continue;

    const updated = await ServiceItem.findByIdAndUpdate(
      line.serviceItemId,
      { $inc: { stockQuantity: line.quantity } },
      { new: true }
    ).lean();

    await InventoryMovement.create({
      tenantId,
      serviceItemId:   new Types.ObjectId(line.serviceItemId),
      itemName:        line.itemName || item.name,
      itemCategory:    item.category,
      type:            'purchase',
      quantity:        line.quantity,
      unitCostCents:   line.unitPriceCents,
      totalCents:      line.totalNetCents,
      stockAfter:      updated?.stockQuantity ?? 0,
      sourceType:      'VendorInvoice',
      sourceId:        inv._id,
      sourceNumber:    inv.supplierInvoiceNumber,
      lineDescription: `${line.itemName || item.name} × ${line.quantity} ${line.unit}`,
      journalEntryId:  entry._id,
    });
  }

  // Product catalog lines (new system)
  if (!fromPO) for (const line of inv.lineItems) {
    if (!line.productId) continue;
    const product = await Product.findOne({ _id: line.productId, tenantId }).lean();
    if (!product || product.isService) continue;

    if (line.variantId) {
      const updatedVariant = await ProductVariant.findOneAndUpdate(
        { _id: line.variantId, productId: line.productId, tenantId },
        { $inc: { stockQuantity: line.quantity } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       new Types.ObjectId(line.productId),
        variantId:       new Types.ObjectId(line.variantId),
        itemName:        line.itemName || product.name,
        itemCategory:    (product as any).categoryName || '',
        type:            'purchase',
        quantity:        line.quantity,
        unitCostCents:   line.unitPriceCents,
        totalCents:      line.totalNetCents,
        stockAfter:      updatedVariant?.stockQuantity ?? 0,
        sourceType:      'VendorInvoice',
        sourceId:        inv._id,
        sourceNumber:    inv.supplierInvoiceNumber,
        lineDescription: `${line.itemName || product.name} × ${line.quantity} ${line.unit}`,
        journalEntryId:  entry._id,
      });
    } else {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: line.productId, tenantId },
        { $inc: { stockQuantity: line.quantity } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       new Types.ObjectId(line.productId),
        itemName:        line.itemName || product.name,
        itemCategory:    (product as any).categoryName || '',
        type:            'purchase',
        quantity:        line.quantity,
        unitCostCents:   line.unitPriceCents,
        totalCents:      line.totalNetCents,
        stockAfter:      updatedProduct?.stockQuantity ?? 0,
        sourceType:      'VendorInvoice',
        sourceId:        inv._id,
        sourceNumber:    inv.supplierInvoiceNumber,
        lineDescription: `${line.itemName || product.name} × ${line.quantity} ${line.unit}`,
        journalEntryId:  entry._id,
      });
    }
  }

  return entry;
}

// ─── Restore inventory when a vendor invoice is cancelled after approval ──────
export async function reverseVendorInvoiceInventory(
  sourceId:     Types.ObjectId,
  tenantId:     Types.ObjectId,
  sourceNumber: string
) {
  const movements = await InventoryMovement.find({
    tenantId,
    sourceId,
    type: 'purchase',
  }).lean();

  for (const mov of movements) {
    const deductQty = Math.abs(mov.quantity);

    if (mov.serviceItemId) {
      const updated = await ServiceItem.findByIdAndUpdate(
        mov.serviceItemId,
        { $inc: { stockQuantity: -deductQty } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        serviceItemId:   mov.serviceItemId,
        itemName:        mov.itemName,
        itemCategory:    mov.itemCategory,
        type:            'adjustment',
        quantity:        -deductQty,
        unitCostCents:   mov.unitCostCents,
        totalCents:      mov.totalCents,
        stockAfter:      updated?.stockQuantity ?? 0,
        sourceType:      'VendorInvoice',
        sourceId,
        sourceNumber,
        lineDescription: `Storno: ${mov.lineDescription}`,
      });
    } else if (mov.productId) {
      let stockAfter = 0;

      if (mov.variantId) {
        const updated = await ProductVariant.findByIdAndUpdate(
          mov.variantId,
          { $inc: { stockQuantity: -deductQty } },
          { new: true }
        ).lean();
        stockAfter = updated?.stockQuantity ?? 0;
      } else {
        const updated = await Product.findByIdAndUpdate(
          mov.productId,
          { $inc: { stockQuantity: -deductQty } },
          { new: true }
        ).lean();
        stockAfter = updated?.stockQuantity ?? 0;
      }

      await InventoryMovement.create({
        tenantId,
        productId:       mov.productId,
        variantId:       mov.variantId,
        itemName:        mov.itemName,
        itemCategory:    mov.itemCategory,
        type:            'adjustment',
        quantity:        -deductQty,
        unitCostCents:   mov.unitCostCents,
        totalCents:      mov.totalCents,
        stockAfter,
        sourceType:      'VendorInvoice',
        sourceId,
        sourceNumber,
        lineDescription: `Storno: ${mov.lineDescription}`,
      });
    }
  }
}

// ─── Sales Invoice → Journal + Inventory Out ─────────────────────────────────
export async function postSalesInvoice(
  inv: ISalesInvoice & { _id: Types.ObjectId },
  userId: Types.ObjectId
) {
  const tenantId   = inv.tenantId as Types.ObjectId;
  const fxRate     = (inv as any).exchangeRate ?? 1;
  const isForeign  = ((inv as any).currency ?? 'EUR') !== 'EUR';

  const revenueMap = new Map<number, number>(); // rate → netCents
  const vatMap     = new Map<number, number>(); // rate → vatCents

  for (const line of inv.lineItems) {
    revenueMap.set(line.vatRate, (revenueMap.get(line.vatRate) ?? 0) + line.totalNetCents);
    if (line.vatRate > 0) {
      vatMap.set(line.vatRate, (vatMap.get(line.vatRate) ?? 0) + line.totalVatCents);
    }
  }

  // fxRate = "1 EUR = X foreign" (e.g. 1.08 for USD) → EUR = foreignCents / 100 / fxRate
  const toEur = (cents: number) => isForeign ? (cents / 100) / fxRate : cents / 100;
  const currLabel = isForeign ? ` (${(inv as any).currency} → EUR @ ${fxRate})` : '';

  const rawLines: RawLine[] = [];

  // Dr. AR receivable (gross EUR equivalent)
  rawLines.push({
    accountNumber: SKR03.AR,
    debit:         toEur(inv.totalGrossCents),
    credit:        0,
    description:   `${inv.customerSnapshot.companyName} – ${inv.invoiceNumber}${currLabel}`,
  });
  // Cr. revenue by rate
  for (const [rate, cents] of revenueMap) {
    const revAcct = rate >= 19 ? SKR03.REVENUE_19 : SKR03.REVENUE_7;
    rawLines.push({ accountNumber: revAcct, debit: 0, credit: toEur(cents), description: `Erlöse ${rate}% – ${inv.invoiceNumber}${currLabel}` });
  }
  // Cr. output VAT
  for (const [rate, cents] of vatMap) {
    const vatAcct = rate >= 19 ? SKR03.USTEUER_19 : SKR03.USTEUER_7;
    rawLines.push({ accountNumber: vatAcct, debit: 0, credit: toEur(cents), description: `Umsatzsteuer ${rate}% – ${inv.invoiceNumber}${currLabel}` });
  }

  const entry = await createPostedEntry({
    tenantId,
    userId,
    date:        inv.invoiceDate,
    description: `AR ${inv.invoiceNumber} – ${inv.customerSnapshot.companyName}`,
    reference:   inv.invoiceNumber,
    sourceType:  'SalesInvoice',
    sourceId:    inv._id,
    rawLines,
  });

  // Inventory movements — ServiceItem-linked lines (legacy catalog)
  for (const line of inv.lineItems) {
    if (!line.serviceItemId) continue;
    const item = await ServiceItem.findOne({ _id: line.serviceItemId, tenantId }).lean();
    if (!item) continue;

    const updated = await ServiceItem.findByIdAndUpdate(
      line.serviceItemId,
      { $inc: { stockQuantity: -line.quantity } },
      { new: true }
    ).lean();

    await InventoryMovement.create({
      tenantId,
      serviceItemId:   new Types.ObjectId(line.serviceItemId),
      itemName:        line.itemName || item.name,
      itemCategory:    item.category,
      type:            'sale',
      quantity:        -line.quantity,
      unitCostCents:   line.unitPriceCents,
      totalCents:      line.totalNetCents,
      stockAfter:      updated?.stockQuantity ?? 0,
      sourceType:      'SalesInvoice',
      sourceId:        inv._id,
      sourceNumber:    inv.invoiceNumber,
      lineDescription: `${line.itemName || item.name} × ${line.quantity} ${line.unit}`,
      journalEntryId:  entry._id,
    });
  }

  // Inventory movements — Product catalog lines (new system)
  for (const line of inv.lineItems) {
    if (!line.productId) continue;
    const product = await Product.findOne({ _id: line.productId, tenantId }).lean();
    if (!product || product.isService) continue;

    if (line.variantId) {
      // Variant product: decrement variant stock
      const updatedVariant = await ProductVariant.findOneAndUpdate(
        { _id: line.variantId, productId: line.productId, tenantId },
        { $inc: { stockQuantity: -line.quantity } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       new Types.ObjectId(line.productId),
        variantId:       new Types.ObjectId(line.variantId),
        itemName:        line.itemName || product.name,
        itemCategory:    (product as any).categoryName || '',
        type:            'sale',
        quantity:        -line.quantity,
        unitCostCents:   line.unitPriceCents,
        totalCents:      line.totalNetCents,
        stockAfter:      updatedVariant?.stockQuantity ?? 0,
        sourceType:      'SalesInvoice',
        sourceId:        inv._id,
        sourceNumber:    inv.invoiceNumber,
        lineDescription: `${line.itemName || product.name} × ${line.quantity} ${line.unit}`,
        journalEntryId:  entry._id,
      });
    } else {
      // Simple (non-variant) product: decrement product stock
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: line.productId, tenantId },
        { $inc: { stockQuantity: -line.quantity } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       new Types.ObjectId(line.productId),
        itemName:        line.itemName || product.name,
        itemCategory:    (product as any).categoryName || '',
        type:            'sale',
        quantity:        -line.quantity,
        unitCostCents:   line.unitPriceCents,
        totalCents:      line.totalNetCents,
        stockAfter:      updatedProduct?.stockQuantity ?? 0,
        sourceType:      'SalesInvoice',
        sourceId:        inv._id,
        sourceNumber:    inv.invoiceNumber,
        lineDescription: `${line.itemName || product.name} × ${line.quantity} ${line.unit}`,
        journalEntryId:  entry._id,
      });
    }
  }

  return entry;
}

// Called when a sales invoice is marked as paid directly (no separate payment record).
// paymentAccount: '1200' = Bank, '1000' = Kasse (cash)
// Posts: Dr. <paymentAccount> / Cr. 1400 AR  — clears the open receivable.
export async function postSalesInvoicePayment(
  inv: ISalesInvoice & { _id: Types.ObjectId },
  userId: Types.ObjectId,
  paymentAccount: string = SKR03.BANK
) {
  const tenantId = inv.tenantId as Types.ObjectId;
  const amount   = inv.totalGrossCents / 100;
  const method   = paymentAccount === '1000' ? 'Barzahlung' : 'Überweisung/Bank';

  const rawLines: RawLine[] = [
    {
      accountNumber: paymentAccount,
      debit:         amount,
      credit:        0,
      description:   `Zahlungseingang (${method}) ${inv.invoiceNumber} – ${inv.customerSnapshot.companyName}`,
    },
    {
      accountNumber: SKR03.AR,
      debit:         0,
      credit:        amount,
      description:   `Ausgleich (${method}) ${inv.invoiceNumber} – ${inv.customerSnapshot.companyName}`,
    },
  ];

  const description = `Zahlungseingang (${method}) ${inv.invoiceNumber} – ${inv.customerSnapshot.companyName}`;

  const entry = await createPostedEntry({
    tenantId,
    userId,
    date:        new Date(),
    description,
    reference:   inv.invoiceNumber,
    sourceType:  'SalesInvoice',
    sourceId:    inv._id,
    rawLines,
  });

  // Cash payment (Kasse) → also write a CashBookEntry so it appears in the cash book
  const isCashAccount = paymentAccount.startsWith('100');
  if (isCashAccount && inv.totalGrossCents > 0) {
    const cashAccountName = await lookupAccountName(tenantId, paymentAccount);
    const arAccountName   = await lookupAccountName(tenantId, SKR03.AR);
    await createSafeCashbookEntry(tenantId, {
      tenantId,
      date:              new Date(),
      type:              'receipt',
      description,
      cashAccount:       paymentAccount,
      cashAccountName,
      contraAccount:     SKR03.AR,
      contraAccountName: arAccountName,
      amountCents:       inv.totalGrossCents,
      vatRate:           0,
      vatCents:          0,
      netCents:          inv.totalGrossCents,
      journalEntryId:    entry._id,
      createdBy:         userId,
    });
  }

  return entry;
}

// ─── Restore inventory when a sales invoice is voided/cancelled ──────────────
// Finds all 'sale' movements for the given invoice and creates counter-movements
// that add the quantities back. Called from cancel and journal reversal paths.
export async function reverseSalesInvoiceInventory(
  sourceId:        Types.ObjectId,
  tenantId:        Types.ObjectId,
  reversalEntryId: Types.ObjectId,
  sourceNumber:    string
) {
  const movements = await InventoryMovement.find({
    tenantId,
    sourceId,
    type: 'sale',
  }).lean();

  for (const mov of movements) {
    const restoreQty = Math.abs(mov.quantity);

    if (mov.serviceItemId) {
      // Legacy ServiceItem-based movement
      const updated = await ServiceItem.findByIdAndUpdate(
        mov.serviceItemId,
        { $inc: { stockQuantity: restoreQty } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        serviceItemId:   mov.serviceItemId,
        itemName:        mov.itemName,
        itemCategory:    mov.itemCategory,
        type:            'adjustment',
        quantity:        restoreQty,
        unitCostCents:   mov.unitCostCents,
        totalCents:      mov.totalCents,
        stockAfter:      updated?.stockQuantity ?? 0,
        sourceType:      'SalesInvoice',
        sourceId,
        sourceNumber,
        lineDescription: `Storno: ${mov.lineDescription}`,
        journalEntryId:  reversalEntryId,
      });
    } else if (mov.productId) {
      // New Product catalog movement
      let stockAfter = 0;

      if (mov.variantId) {
        const updated = await ProductVariant.findByIdAndUpdate(
          mov.variantId,
          { $inc: { stockQuantity: restoreQty } },
          { new: true }
        ).lean();
        stockAfter = updated?.stockQuantity ?? 0;
      } else {
        const updated = await Product.findByIdAndUpdate(
          mov.productId,
          { $inc: { stockQuantity: restoreQty } },
          { new: true }
        ).lean();
        stockAfter = updated?.stockQuantity ?? 0;
      }

      await InventoryMovement.create({
        tenantId,
        productId:       mov.productId,
        variantId:       mov.variantId,
        itemName:        mov.itemName,
        itemCategory:    mov.itemCategory,
        type:            'adjustment',
        quantity:        restoreQty,
        unitCostCents:   mov.unitCostCents,
        totalCents:      mov.totalCents,
        stockAfter,
        sourceType:      'SalesInvoice',
        sourceId,
        sourceNumber,
        lineDescription: `Storno: ${mov.lineDescription}`,
        journalEntryId:  reversalEntryId,
      });
    }
  }
}

// ─── Purchase Order Goods Receipt → Inventory In ─────────────────────────────
// Called fire-and-forget from POST /purchase-orders/:id/receive.
// Increments stock for each line where productId is set and delta > 0.
export async function postPurchaseOrderReceipt(
  poId:         Types.ObjectId,
  tenantId:     Types.ObjectId,
  poNumber:     string,
  receivedLines: Array<{
    productId?:     string;
    variantId?:     string;
    description:    string;
    unit:           string;
    unitPriceCents: number;
    delta:          number;
  }>
) {
  for (const rl of receivedLines) {
    if (!rl.productId || rl.delta <= 0) continue;

    const productObjId = new Types.ObjectId(rl.productId);
    const product = await Product.findOne({ _id: productObjId, tenantId }).lean();
    if (!product || product.isService) continue;

    if (rl.variantId) {
      const variantObjId = new Types.ObjectId(rl.variantId);

      // Read current stock + cost before update for WAC calculation
      const beforeVariant = await ProductVariant.findOne({ _id: variantObjId, productId: productObjId, tenantId }).lean();
      const prevStock = beforeVariant?.stockQuantity ?? 0;
      const prevCost  = beforeVariant?.costPriceCents ?? 0;
      const newAvgCost = prevStock <= 0
        ? rl.unitPriceCents
        : Math.round((prevStock * prevCost + rl.delta * rl.unitPriceCents) / (prevStock + rl.delta));

      const updatedVariant = await ProductVariant.findOneAndUpdate(
        { _id: variantObjId, productId: productObjId, tenantId },
        { $inc: { stockQuantity: rl.delta }, $set: { costPriceCents: newAvgCost } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       productObjId,
        variantId:       variantObjId,
        itemName:        rl.description,
        itemCategory:    (product as any).categoryName || '',
        type:            'purchase',
        quantity:        rl.delta,
        unitCostCents:   rl.unitPriceCents,
        totalCents:      Math.round(rl.delta * rl.unitPriceCents),
        stockAfter:      updatedVariant?.stockQuantity ?? 0,
        sourceType:      'PurchaseOrder',
        sourceId:        poId,
        sourceNumber:    poNumber,
        lineDescription: `${rl.description} × ${rl.delta} ${rl.unit}`,
      });
    } else {
      // Read current stock + cost before update for WAC calculation
      const prevStock = product.stockQuantity ?? 0;
      const prevCost  = product.costPriceCents ?? 0;
      const newAvgCost = prevStock <= 0
        ? rl.unitPriceCents
        : Math.round((prevStock * prevCost + rl.delta * rl.unitPriceCents) / (prevStock + rl.delta));

      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productObjId, tenantId },
        { $inc: { stockQuantity: rl.delta }, $set: { costPriceCents: newAvgCost } },
        { new: true }
      ).lean();

      await InventoryMovement.create({
        tenantId,
        productId:       productObjId,
        itemName:        rl.description,
        itemCategory:    (product as any).categoryName || '',
        type:            'purchase',
        quantity:        rl.delta,
        unitCostCents:   rl.unitPriceCents,
        totalCents:      Math.round(rl.delta * rl.unitPriceCents),
        stockAfter:      updatedProduct?.stockQuantity ?? 0,
        sourceType:      'PurchaseOrder',
        sourceId:        poId,
        sourceNumber:    poNumber,
        lineDescription: `${rl.description} × ${rl.delta} ${rl.unit}`,
      });
    }
  }
}

// ─── Reverse inventory when a received PO is cancelled ───────────────────────
export async function reversePurchaseOrderInventory(
  sourceId:     Types.ObjectId,
  tenantId:     Types.ObjectId,
  sourceNumber: string
) {
  const movements = await InventoryMovement.find({
    tenantId,
    sourceId,
    sourceType: 'PurchaseOrder',
    type: 'purchase',
  }).lean();

  for (const mov of movements) {
    const deductQty = Math.abs(mov.quantity);
    if (!mov.productId) continue;

    let stockAfter = 0;

    if (mov.variantId) {
      const updated = await ProductVariant.findByIdAndUpdate(
        mov.variantId,
        { $inc: { stockQuantity: -deductQty } },
        { new: true }
      ).lean();
      stockAfter = updated?.stockQuantity ?? 0;
    } else {
      const updated = await Product.findByIdAndUpdate(
        mov.productId,
        { $inc: { stockQuantity: -deductQty } },
        { new: true }
      ).lean();
      stockAfter = updated?.stockQuantity ?? 0;
    }

    await InventoryMovement.create({
      tenantId,
      productId:       mov.productId,
      variantId:       mov.variantId,
      itemName:        mov.itemName,
      itemCategory:    mov.itemCategory,
      type:            'adjustment',
      quantity:        -deductQty,
      unitCostCents:   mov.unitCostCents,
      totalCents:      mov.totalCents,
      stockAfter,
      sourceType:      'PurchaseOrder',
      sourceId,
      sourceNumber,
      lineDescription: `Storno: ${mov.lineDescription}`,
    });
  }
}

// Reverses a previously posted journal entry (e.g. to undo a payment receipt).
// Creates a mirror entry with debit/credit swapped and marks the original as reversed.
export async function reverseJournalEntry(
  entry: IJournalEntry & { _id: Types.ObjectId },
  userId: Types.ObjectId,
  description: string
) {
  const tenantId = entry.tenantId;
  const date = new Date();
  const { periodId, fiscalYearId } = await resolvePeriod(tenantId, date);

  const lines = entry.lines.map((l) => ({
    accountNumber: l.accountNumber,
    accountName:   l.accountName,
    debit:         l.credit,
    credit:        l.debit,
    description:   `Storno: ${l.description || entry.description}`,
  }));

  const seq = await nextSeq(String(tenantId), 'journal');
  const entryNumber = `BU-${String(seq).padStart(6, '0')}`;

  const hash = gobdHash({
    tenantId:    String(tenantId),
    entryNumber,
    date:        date.toISOString(),
    description,
    reversalOf:  String(entry._id),
    lines,
    totalDebit:  entry.totalCredit,
    totalCredit: entry.totalDebit,
  });

  const reversal = await JournalEntry.create({
    tenantId,
    entryNumber,
    date,
    description,
    reference:   entry.reference ?? '',
    status:      'posted',
    lines,
    totalDebit:  entry.totalCredit,
    totalCredit: entry.totalDebit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    reversalOf:  entry._id,
    sourceType:  entry.sourceType,
    sourceId:    entry.sourceId,
    createdBy:   userId,
    postedAt:    date,
    postedBy:    userId,
  });

  await JournalEntry.updateOne({ _id: entry._id }, { $set: { status: 'reversed', reversedBy: reversal._id } });

  return reversal;
}

// ─── POS Return: post revenue reversal + cash refund + cashbook entry ──────────
// Called after a return invoice (negative totals) is created.
// Entries:  Dr. Revenue × |net|  +  Dr. VAT × |vat|  =  Cr. Cash × |gross|
export async function postSalesReturn(
  returnInv: ISalesInvoice & { _id: Types.ObjectId },
  userId:    Types.ObjectId,
  paymentAccount: string = '1000'
) {
  const tenantId = returnInv.tenantId as Types.ObjectId;
  const grossAmt = Math.abs(returnInv.totalGrossCents) / 100;
  if (grossAmt === 0) return null;

  // Aggregate net/vat by rate (all stored negative on the invoice)
  const revenueMap = new Map<number, number>(); // rate → |net cents|
  const vatMap     = new Map<number, number>(); // rate → |vat cents|
  for (const line of returnInv.lineItems) {
    revenueMap.set(line.vatRate, (revenueMap.get(line.vatRate) ?? 0) + Math.abs(line.totalNetCents));
    if (line.vatRate > 0) {
      vatMap.set(line.vatRate, (vatMap.get(line.vatRate) ?? 0) + Math.abs(line.totalVatCents));
    }
  }

  const rawLines: RawLine[] = [];
  for (const [rate, cents] of revenueMap) {
    const acct = rate >= 19 ? SKR03.REVENUE_19 : SKR03.REVENUE_7;
    rawLines.push({ accountNumber: acct, debit: cents / 100, credit: 0, description: `Erlösminderung ${rate}% – ${returnInv.invoiceNumber}` });
  }
  for (const [rate, cents] of vatMap) {
    const acct = rate >= 19 ? SKR03.USTEUER_19 : SKR03.USTEUER_7;
    rawLines.push({ accountNumber: acct, debit: cents / 100, credit: 0, description: `USt-Korrektur ${rate}% – ${returnInv.invoiceNumber}` });
  }
  rawLines.push({
    accountNumber: paymentAccount,
    debit:  0,
    credit: grossAmt,
    description: `Rückerstattung ${returnInv.invoiceNumber} – ${returnInv.customerSnapshot.companyName}`,
  });

  const description = `Rückgabe ${returnInv.invoiceNumber} – ${returnInv.customerSnapshot.companyName}`;

  const entry = await createPostedEntry({
    tenantId,
    userId,
    date:        new Date(),
    description,
    reference:   returnInv.invoiceNumber,
    sourceType:  'SalesInvoice',
    sourceId:    returnInv._id,
    rawLines,
  });

  // CashBookEntry only for cash account (1000-range)
  if (paymentAccount.startsWith('100')) {
    const cashAcctName  = await lookupAccountName(tenantId, paymentAccount);
    const contraAcct    = revenueMap.has(19) ? SKR03.REVENUE_19 : SKR03.REVENUE_7;
    const contraName    = await lookupAccountName(tenantId, contraAcct);
    const cbAmt = Math.abs(returnInv.totalGrossCents);
    await createSafeCashbookEntry(tenantId, {
      tenantId,
      date:              new Date(),
      type:              'payment',
      description,
      cashAccount:       paymentAccount,
      cashAccountName:   cashAcctName,
      contraAccount:     contraAcct,
      contraAccountName: contraName,
      amountCents:       cbAmt,
      vatRate:           0,
      vatCents:          0,
      netCents:          cbAmt,
      journalEntryId:    entry._id,
      createdBy:         userId,
    }, (en) => gobdHash({ tenantId: String(tenantId), entryNumber: en, date: new Date().toISOString(), description, amountCents: cbAmt }));
  }

  return entry;
}
