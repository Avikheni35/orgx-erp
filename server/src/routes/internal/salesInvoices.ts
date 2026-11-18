import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { SalesInvoice } from '../../models/SalesInvoice';
import { Customer } from '../../models/Customer';
import { JournalEntry } from '../../models/JournalEntry';
import { nextSeq } from '../../models/Counter';
import { gobdHash } from '../../utils/crypto';
import { Account } from '../../models/Account';
import { Period } from '../../models/Period';
import { FiscalYear } from '../../models/FiscalYear';
import mongoose from 'mongoose';

const router = Router();

async function resolveAccountName(tenantId: string, number: string): Promise<string> {
  const acct = await Account.findOne({ tenantId, number }, { name: 1 });
  return acct?.name ?? `Account ${number}`;
}

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({ tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

// POST /api/internal/sales-invoices
// M2 pushes an approved EventInvoice into M3 as a SalesInvoice with autopost
router.post('/', asyncHandler(async (req, res) => {
  const tenantId = req.internalTenantId!;
  const {
    syncId,
    m2InvoiceId,
    m2ClientId,
    clientName,
    clientEmail,
    clientAddress,
    clientVatId,
    invoiceNumber,
    invoiceDate,
    dueDate,
    lineItems,
    subtotalCents,
    vatRate,
    vatCents,
    totalCents,
    notes,
  } = req.body as {
    syncId:        string;
    m2InvoiceId:   string;
    m2ClientId:    string;
    clientName:    string;
    clientEmail?:  string;
    clientAddress?: { street?: string; city?: string; zip?: string };
    clientVatId?:  string;
    invoiceNumber: string;
    invoiceDate:   string;
    dueDate:       string;
    lineItems:     { description: string; quantity: number; unitPriceCents: number; vatRate: number }[];
    subtotalCents: number;
    vatRate:       number;
    vatCents:      number;
    totalCents:    number;
    notes?:        string;
  };

  if (!syncId) { res.status(400).json({ message: 'syncId is required' }); return; }

  // Idempotency — return existing if already posted
  const existing = await SalesInvoice.findOne({ syncId }).lean();
  if (existing) { res.json({ id: existing._id, duplicate: true }); return; }

  const tenantOid = new mongoose.Types.ObjectId(tenantId);
  const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

  // Find or create M3 Customer for this M2 client (look up by m2 marker in notes)
  let customer = await Customer.findOne({ tenantId: tenantOid, notes: `m2:${m2ClientId}` });
  if (!customer) {
    const seq = await nextSeq(tenantId, 'customer');
    customer = await Customer.create({
      tenantId: tenantOid,
      customerNumber: `KD-${String(seq).padStart(5, '0')}`,
      companyName: clientName,
      vatId: clientVatId ?? '',
      address: { street: clientAddress?.street ?? '', city: clientAddress?.city ?? '', zip: clientAddress?.zip ?? '', country: 'DE' },
      contacts: clientEmail ? [{ name: clientName, email: clientEmail, isPrimary: true }] : [],
      notes: `m2:${m2ClientId}`,
    });
  }

  // Build line items in M3 format
  const m3LineItems = lineItems.map((li) => {
    const netCents  = Math.round(li.quantity * li.unitPriceCents);
    const vatCentsLi = Math.round(netCents * (li.vatRate / 100));
    return {
      description:     li.description,
      unit:            'Stk.',
      quantity:        li.quantity,
      unitPriceCents:  li.unitPriceCents,
      vatRate:         li.vatRate,
      totalNetCents:   netCents,
      totalVatCents:   vatCentsLi,
      totalGrossCents: netCents + vatCentsLi,
    };
  });

  const invDate = new Date(invoiceDate);
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, invDate);

  // Use M2 invoice number directly (already unique within tenant)
  const salesInvoice = await SalesInvoice.create({
    tenantId:      tenantOid,
    invoiceNumber: `M2-${invoiceNumber}`,
    customerId:    customer._id,
    customerSnapshot: {
      companyName:   clientName,
      address:       { street: clientAddress?.street ?? '', city: clientAddress?.city ?? '', zip: clientAddress?.zip ?? '', country: 'DE' },
      vatId:         clientVatId ?? '',
      debtorAccount: '1400',
    },
    status:          'sent',
    invoiceDate:     invDate,
    dueDate:         new Date(dueDate),
    lineItems:       m3LineItems,
    totalNetCents:   subtotalCents,
    totalVatCents:   vatCents,
    totalGrossCents: totalCents,
    paidCents:       0,
    notes:           notes ?? '',
    sentAt:          new Date(),
    syncId,
    source:          'm2',
    m2InvoiceId,
    clientSnapshot:  { m2ClientId, name: clientName, email: clientEmail, source: 'm2' },
  });

  // SKR03 autopost: debit AR (1400), credit Revenue (8400)
  const [arName, revName] = await Promise.all([
    resolveAccountName(tenantId, '1400'),
    resolveAccountName(tenantId, '8400'),
  ]);
  const amountEur = totalCents / 100;
  const seq = await nextSeq(tenantId, 'journal');
  const entryNumber = `INT-${String(seq).padStart(6, '0')}`;
  const hashData = { tenantId, entryNumber, date: invoiceDate, syncId, amountCents: totalCents };

  await JournalEntry.create({
    tenantId:    tenantOid,
    entryNumber,
    date:        invDate,
    description: `M2 Invoice ${invoiceNumber} — ${clientName}`,
    reference:   `m2:invoice:${m2InvoiceId}`,
    status:      'posted',
    lines: [
      { accountNumber: '1400', accountName: arName,  debit: amountEur, credit: 0 },
      { accountNumber: '8400', accountName: revName, debit: 0, credit: amountEur },
    ],
    totalDebit:   amountEur,
    totalCredit:  amountEur,
    periodId,
    fiscalYearId,
    gobdHash:     gobdHash(hashData),
    sourceType:   'SalesInvoice',
    sourceId:     salesInvoice._id,
    createdBy:    systemUserId,
    postedAt:     new Date(),
    postedBy:     systemUserId,
    syncId:       `je_${syncId}`,
    source:       'm2',
    sourceSnapshot: { m2RefId: m2InvoiceId, description: `Invoice ${invoiceNumber}`, source: 'm2' },
  });

  res.status(201).json({ id: salesInvoice._id, created: true });
}));

export default router;
