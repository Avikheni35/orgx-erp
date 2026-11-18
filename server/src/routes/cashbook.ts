import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { CashBookEntry } from '../models/CashBookEntry';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resolveAccountName(tenantId: string, number: string): Promise<string> {
  const acct = await Account.findOne({ tenantId, number }, { name: 1 });
  return acct?.name ?? number;
}

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({
    tenantId,
    startDate: { $lte: date },
    endDate:   { $gte: date },
  });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  date:          z.string().refine(d => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  type:          z.enum(['receipt', 'payment']),
  description:   z.string().min(1).max(300),
  cashAccount:   z.string().min(1),
  contraAccount: z.string().min(1),
  amountCents:   z.number().int().min(1),
  vatRate:       z.number().min(0).max(100).default(0),
});

// ── GET /cashbook ─────────────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { cashAccount, from, to, page = '1', limit = '100' } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };

  if (cashAccount) q.cashAccount = cashAccount;
  if (from || to) {
    q.date = {} as Record<string, Date>;
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }

  const pageNum  = parseInt(page);
  const limitNum = parseInt(limit);
  const skip     = (pageNum - 1) * limitNum;
  const total    = await CashBookEntry.countDocuments(q);

  // Fetch enough entries to compute running balance from start up to end of current page
  const allUpToPage = await CashBookEntry
    .find(q)
    .sort({ date: 1, entryNumber: 1 })
    .limit(skip + limitNum);

  let runningBalance = allUpToPage.slice(0, skip).reduce((s, e) =>
    e.type === 'receipt' ? s + e.amountCents : s - e.amountCents, 0);

  const enriched = allUpToPage.slice(skip).map(e => {
    runningBalance += e.type === 'receipt' ? e.amountCents : -e.amountCents;
    return { ...e.toObject(), runningBalance };
  });

  res.json({ entries: enriched, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
}));

// ── POST /cashbook ────────────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant', 'erp_employee'), validate(createSchema), asyncHandler(async (req, res) => {
  const body      = req.body as z.infer<typeof createSchema>;
  const tenantId  = String(req.tenantId);
  const date      = new Date(body.date);
  const grossEur  = body.amountCents / 100;
  const vatRate   = body.vatRate ?? 0;
  const vatCents  = vatRate > 0 ? Math.round(body.amountCents * vatRate / (100 + vatRate)) : 0;
  const netCents  = body.amountCents - vatCents;
  const netEur    = netCents / 100;
  const vatEur    = vatCents / 100;

  const cashAcct    = await Account.findOne({ tenantId: req.tenantId, number: body.cashAccount, isActive: true });
  if (!cashAcct)    throw new AppError(`Kassenkonto ${body.cashAccount} nicht gefunden.`, 400);
  const contraAcct  = await Account.findOne({ tenantId: req.tenantId, number: body.contraAccount, isActive: true });
  if (!contraAcct)  throw new AppError(`Gegenkonto ${body.contraAccount} nicht gefunden.`, 400);

  const cashName   = cashAcct.name;
  const contraName = contraAcct.name;

  // Journal lines — receipt: debit cash, credit revenue/contra
  //                 payment: debit expense/contra, credit cash
  let lines;
  if (body.type === 'receipt') {
    lines = vatRate > 0
      ? [
          { accountNumber: body.cashAccount,   accountName: cashName,   debit: grossEur, credit: 0,      description: body.description },
          { accountNumber: body.contraAccount,  accountName: contraName, debit: 0,        credit: netEur, description: body.description },
          { accountNumber: '1776',              accountName: await resolveAccountName(tenantId, '1776'),
            debit: 0, credit: vatEur, description: 'USt aus Bareinnahme' },
        ]
      : [
          { accountNumber: body.cashAccount,   accountName: cashName,   debit: grossEur, credit: 0,       description: body.description },
          { accountNumber: body.contraAccount,  accountName: contraName, debit: 0,        credit: grossEur, description: body.description },
        ];
  } else {
    lines = vatRate > 0
      ? [
          { accountNumber: body.contraAccount,  accountName: contraName, debit: netEur,   credit: 0,       description: body.description },
          { accountNumber: '1576',              accountName: await resolveAccountName(tenantId, '1576'),
            debit: vatEur, credit: 0, description: 'Vorsteuer aus Barausgabe' },
          { accountNumber: body.cashAccount,   accountName: cashName,   debit: 0,         credit: grossEur, description: body.description },
        ]
      : [
          { accountNumber: body.contraAccount,  accountName: contraName, debit: grossEur, credit: 0,       description: body.description },
          { accountNumber: body.cashAccount,   accountName: cashName,   debit: 0,         credit: grossEur, description: body.description },
        ];
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debit,  0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const cbPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (cbPeriod && cbPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${cbPeriod.name}" ist ${cbPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Datum anpassen.`, 422);
  }
  if (cbPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(cbPeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);

  const seq    = await nextSeq(tenantId, 'journal');
  const buNum  = `BU-${String(seq).padStart(6, '0')}`;
  const cbSeq  = await nextSeq(tenantId, 'cashbook');
  const cbNum  = `KB-${String(cbSeq).padStart(6, '0')}`;

  const hash = gobdHash({ tenantId, entryNumber: buNum, date: date.toISOString(), description: body.description, lines, totalDebit, totalCredit });

  const [entry] = await JournalEntry.create([{
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date,
    description: body.description,
    reference:   cbNum,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Payment',
    createdBy:   req.user?.userId,
    postedAt:    new Date(),
    postedBy:    req.user?.userId,
  }]);

  const cbEntry = await CashBookEntry.create({
    tenantId:          req.tenantId,
    entryNumber:       cbNum,
    date,
    type:              body.type,
    description:       body.description,
    cashAccount:       body.cashAccount,
    cashAccountName:   cashName,
    contraAccount:     body.contraAccount,
    contraAccountName: contraName,
    amountCents:       body.amountCents,
    vatRate,
    vatCents,
    netCents,
    journalEntryId:    entry._id,
    createdBy:         req.user?.userId,
  });

  res.status(201).json(cbEntry);
}));

// ── POST /cashbook/import ─────────────────────────────────────────────────────
const importSchema = z.object({
  cashAccount: z.string().min(1),
  entries: z.array(z.object({
    date:        z.string().refine(d => !isNaN(Date.parse(d))),
    type:        z.enum(['receipt', 'payment']),
    description: z.string().min(1).max(300),
    reference:   z.string().default(''),
    amountCents: z.number().int().min(1),
  })).min(1).max(500),
});

router.post('/import', requireRole('erp_admin', 'erp_accountant'), validate(importSchema), asyncHandler(async (req, res) => {
  const body      = req.body as z.infer<typeof importSchema>;
  const tenantId  = String(req.tenantId);
  const contraAcc = '1590'; // Durchlaufkonto (suspense)

  const cashAcct = await Account.findOne({ tenantId: req.tenantId, number: body.cashAccount });
  const cashName = cashAcct?.name ?? body.cashAccount;
  const contraName = await resolveAccountName(tenantId, contraAcc);

  const created: { entryNumber: string; description: string; amountCents: number; type: string }[] = [];
  let skipped = 0;

  for (const e of body.entries) {
    const date = new Date(e.date);
    if (isNaN(date.getTime())) { skipped++; continue; }

    const cbSeq = await nextSeq(tenantId, 'cashbook');
    const cbNum = `KB-${String(cbSeq).padStart(6, '0')}`;

    const cbEntry = await CashBookEntry.create({
      tenantId:          req.tenantId,
      entryNumber:       cbNum,
      date,
      type:              e.type,
      description:       e.reference ? `${e.description} (${e.reference})` : e.description,
      cashAccount:       body.cashAccount,
      cashAccountName:   cashName,
      contraAccount:     contraAcc,
      contraAccountName: contraName,
      amountCents:       e.amountCents,
      vatRate:           0,
      vatCents:          0,
      netCents:          e.amountCents,
      createdBy:         req.user?.userId,
    });

    created.push({ entryNumber: cbEntry.entryNumber, description: cbEntry.description, amountCents: cbEntry.amountCents, type: cbEntry.type });
  }

  res.status(201).json({ imported: created.length, skipped, entries: created });
}));

// ── DELETE /cashbook/:id ──────────────────────────────────────────────────────
router.delete('/:id', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const entry = await CashBookEntry.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!entry) throw new AppError('Kassenbucheintrag nicht gefunden.', 404);

  if (entry.journalEntryId) {
    const original = await JournalEntry.findById(entry.journalEntryId);
    if (original && original.status === 'posted') {
      const reversedLines = original.lines.map(l => ({
        accountNumber: l.accountNumber,
        accountName:   l.accountName,
        debit:         l.credit,
        credit:        l.debit,
        description:   `Storno: ${l.description ?? ''}`,
      }));
      const revSeq  = await nextSeq(String(req.tenantId), 'journal');
      const revNum  = `BU-${String(revSeq).padStart(6, '0')}`;
      const revHash = gobdHash({
        tenantId:    String(req.tenantId),
        entryNumber: revNum,
        date:        new Date().toISOString(),
        description: `Storno ${original.entryNumber}`,
        lines:       reversedLines,
        totalDebit:  original.totalCredit,
        totalCredit: original.totalDebit,
      });
      const [rev] = await JournalEntry.create([{
        tenantId:    req.tenantId,
        entryNumber: revNum,
        date:        new Date(),
        description: `Storno ${original.entryNumber}: ${original.description}`,
        reference:   entry.entryNumber,
        status:      'posted',
        lines:       reversedLines,
        totalDebit:  original.totalCredit,
        totalCredit: original.totalDebit,
        periodId:    original.periodId,
        fiscalYearId: original.fiscalYearId,
        gobdHash:    revHash,
        sourceType:  'Payment',
        reversalOf:  original._id,
        createdBy:   req.user?.userId,
        postedAt:    new Date(),
        postedBy:    req.user?.userId,
      }]);
      original.status    = 'reversed';
      original.reversedBy = rev._id;
      await original.save();
    }
  }

  await CashBookEntry.deleteOne({ _id: entry._id });
  res.json({ message: 'Kassenbucheintrag storniert.' });
}));

export default router;
