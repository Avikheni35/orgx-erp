import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { CreditNote } from '../models/CreditNote';
import { SalesInvoice } from '../models/SalesInvoice';
import { Customer } from '../models/Customer';
import { Account } from '../models/Account';
import { JournalEntry } from '../models/JournalEntry';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';
import { calcTotals } from '../utils/calcTotals';

const router = Router();
router.use(requireAuth);

async function resolveAccountName(tenantId: string, number: string): Promise<string> {
  const a = await Account.findOne({ tenantId, number }, { name: 1 });
  return a?.name ?? number;
}

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({ tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

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
  customerId:     z.string().min(1),
  invoiceId:      z.string().optional(),
  creditNoteDate: z.string().min(1),
  reason:         z.string().default(''),
  lineItems:      z.array(lineItemSchema).min(1),
  notes:          z.string().default(''),
});

// GET /credit-notes
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, customerId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     filter.status     = status;
  if (customerId) filter.customerId = customerId;
  const creditNotes = await CreditNote.find(filter).sort({ creditNoteDate: -1 }).lean();
  res.json({ creditNotes });
}));

// POST /credit-notes
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;

  const customer = await Customer.findOne({ _id: body.customerId, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Kunde nicht gefunden.', 404);

  let invoiceNumber = '';
  if (body.invoiceId) {
    const inv = await SalesInvoice.findOne({ _id: body.invoiceId, tenantId: req.tenantId }).lean();
    if (!inv) throw new AppError('Rechnung nicht gefunden.', 404);
    invoiceNumber = inv.invoiceNumber;
  }

  const tenantId = String(req.tenantId);
  const seq      = await nextSeq(tenantId, 'credit_note');
  const creditNoteNumber = `GS-${String(seq).padStart(6, '0')}`;

  const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(body.lineItems);

  const addrParts = [
    customer.address?.street, customer.address?.zip, customer.address?.city, customer.address?.country,
  ].filter(Boolean);

  const creditNote = await CreditNote.create({
    tenantId:        req.tenantId,
    creditNoteNumber,
    customerId:      customer._id,
    customerName:    customer.companyName,
    customerAddress: addrParts.join(', '),
    debtorAccount:   customer.debtorAccount || '1400',
    invoiceId:       body.invoiceId || undefined,
    invoiceNumber,
    creditNoteDate:  new Date(body.creditNoteDate),
    status:          'draft',
    reason:          body.reason,
    lineItems,
    totalNetCents,
    totalVatCents,
    totalGrossCents,
    currency:        'EUR',
    notes:           body.notes,
    createdBy:       req.user?.userId,
  });

  res.status(201).json(creditNote);
}));

// GET /credit-notes/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const cn = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!cn) throw new AppError('Gutschrift nicht gefunden.', 404);
  res.json(cn);
}));

// PATCH /credit-notes/:id/status  (draft → sent, draft/sent → cancelled)
router.patch('/:id/status', requireRole('erp_admin', 'erp_accountant'),
  validate(z.object({ status: z.enum(['sent', 'cancelled']) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'sent' | 'cancelled' };
    const cn = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!cn) throw new AppError('Gutschrift nicht gefunden.', 404);
    if (cn.status === 'posted') throw new AppError('Gebuchte Gutschriften können nicht geändert werden.', 400);
    cn.status = status;
    await cn.save();
    res.json(cn);
  })
);

// POST /credit-notes/:id/post  — books journal entry
router.post('/:id/post', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const cn = await CreditNote.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!cn) throw new AppError('Gutschrift nicht gefunden.', 404);
  if (cn.status === 'cancelled') throw new AppError('Stornierte Gutschriften können nicht gebucht werden.', 400);
  if (cn.status === 'posted') throw new AppError('Bereits gebucht.', 400);

  const tenantId  = String(req.tenantId);
  const postDate  = new Date();
  const debtorAcc = cn.debtorAccount || '1400';

  // Debit: Forderungen (AR / debtor) reduced → credit side for normal invoice reversal
  // Credit note accounting: reduces customer AR and reduces revenue
  // Debit debtor account (reduces AR), Credit revenue accounts per VAT group
  // But actually: credit note reversal means:
  //   Debit revenue (reduces revenue) + Debit VAT output (reversal)
  //   Credit debtor (reduces what customer owes)

  // Group lines by VAT rate to build journal lines
  const vatGroups = new Map<number, { netCents: number; vatCents: number }>();
  for (const l of cn.lineItems) {
    const g = vatGroups.get(l.vatRate) ?? { netCents: 0, vatCents: 0 };
    g.netCents += l.totalNetCents;
    g.vatCents += l.totalVatCents;
    vatGroups.set(l.vatRate, g);
  }

  const debtorName = await resolveAccountName(tenantId, debtorAcc);
  // Revenue account: 8400 (default 19% Erlöse) / 8300 (7%)  / 8000 (0%)
  const revenueAcc = (vat: number) => vat === 19 ? '8400' : vat === 7 ? '8300' : '8000';
  const vatAcc     = (vat: number) => vat === 19 ? '1776' : vat === 7 ? '1775' : null;

  const lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string }[] = [];
  const desc = `Gutschrift ${cn.creditNoteNumber}${cn.invoiceNumber ? ` zu ${cn.invoiceNumber}` : ''}`;

  for (const [rate, g] of vatGroups) {
    const revAcc  = revenueAcc(rate);
    const revName = await resolveAccountName(tenantId, revAcc);
    lines.push({ accountNumber: revAcc, accountName: revName, debit: g.netCents / 100, credit: 0, description: desc });
    const vAccNum = vatAcc(rate);
    if (vAccNum && g.vatCents > 0) {
      const vName = await resolveAccountName(tenantId, vAccNum);
      lines.push({ accountNumber: vAccNum, accountName: vName, debit: g.vatCents / 100, credit: 0, description: desc });
    }
  }
  lines.push({ accountNumber: debtorAcc, accountName: debtorName, debit: 0, credit: cn.totalGrossCents / 100, description: desc });

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const cnPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (cnPeriod && cnPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${cnPeriod.name}" ist ${cnPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (cnPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(cnPeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, postDate);
  const seq   = await nextSeq(tenantId, 'journal');
  const buNum = `BU-${String(seq).padStart(6, '0')}`;
  const hash  = gobdHash({ tenantId, entryNumber: buNum, date: postDate.toISOString(), description: desc, lines, totalDebit, totalCredit });

  const je = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date:        postDate,
    description: desc,
    reference:   cn.creditNoteNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'SalesInvoice',
    createdBy:   req.user?.userId,
    postedAt:    postDate,
    postedBy:    req.user?.userId,
  });

  cn.status         = 'posted';
  cn.journalEntryId = je._id as unknown as typeof cn.journalEntryId;
  await cn.save();

  res.json(cn);
}));

export default router;
