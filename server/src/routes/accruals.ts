import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { Accrual } from '../models/Accrual';
import { Account } from '../models/Account';
import { JournalEntry } from '../models/JournalEntry';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';

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

const createSchema = z.object({
  type:              z.enum(['arap', 'prap']),
  description:       z.string().min(1).max(300),
  accrualAccount:    z.string().min(1),
  contraAccount:     z.string().min(1),
  amountCents:       z.number().int().min(1),
  postDate:          z.string().min(1),
  startDate:         z.string().min(1),
  endDate:           z.string().min(1),
  referenceDocument: z.string().default(''),
  notes:             z.string().default(''),
});

// GET /accruals
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { type, status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (type)   filter.type   = type;
  if (status) filter.status = status;
  const accruals = await Accrual.find(filter).sort({ postDate: -1 }).lean();
  res.json({ accruals });
}));

// POST /accruals
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);
  const seq = await nextSeq(tenantId, 'accrual');
  const accrualNumber = `RAP-${String(seq).padStart(6, '0')}`;

  const accrual = await Accrual.create({
    tenantId:         req.tenantId,
    accrualNumber,
    type:             body.type,
    description:      body.description,
    accrualAccount:   body.accrualAccount,
    contraAccount:    body.contraAccount,
    amountCents:      body.amountCents,
    postDate:         new Date(body.postDate),
    startDate:        new Date(body.startDate),
    endDate:          new Date(body.endDate),
    referenceDocument: body.referenceDocument,
    notes:            body.notes,
    status:           'draft',
    createdBy:        req.user?.userId,
  });

  res.status(201).json(accrual);
}));

// GET /accruals/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const accrual = await Accrual.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!accrual) throw new AppError('Abgrenzung nicht gefunden.', 404);
  res.json(accrual);
}));

// POST /accruals/:id/post
router.post('/:id/post', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const accrual = await Accrual.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!accrual) throw new AppError('Abgrenzung nicht gefunden.', 404);
  if (accrual.status !== 'draft') throw new AppError('Nur Entwürfe können gebucht werden.', 400);

  const tenantId  = String(req.tenantId);
  const postDate  = accrual.postDate;
  const amt       = accrual.amountCents / 100;
  const desc      = `${accrual.accrualNumber} ${accrual.description}`;

  const accrualAccName  = await resolveAccountName(tenantId, accrual.accrualAccount);
  const contraAccName   = await resolveAccountName(tenantId, accrual.contraAccount);

  // ARAP (aktiv): Debit accrualAccount (0980), Credit contraAccount (expense 4xxx)
  // PRAP (passiv): Debit contraAccount (revenue 8xxx), Credit accrualAccount (0990)
  let lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string }[];
  if (accrual.type === 'arap') {
    lines = [
      { accountNumber: accrual.accrualAccount, accountName: accrualAccName, debit: amt, credit: 0, description: desc },
      { accountNumber: accrual.contraAccount,  accountName: contraAccName,  debit: 0, credit: amt, description: desc },
    ];
  } else {
    lines = [
      { accountNumber: accrual.contraAccount,  accountName: contraAccName,  debit: amt, credit: 0, description: desc },
      { accountNumber: accrual.accrualAccount, accountName: accrualAccName, debit: 0, credit: amt, description: desc },
    ];
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const postPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (postPeriod && postPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${postPeriod.name}" ist ${postPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Buchungsdatum anpassen.`, 422);
  }
  if (postPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(postPeriod.fiscalYearId);
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
    reference:   accrual.accrualNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Accrual',
    createdBy:   req.user?.userId,
    postedAt:    new Date(),
    postedBy:    req.user?.userId,
  });

  accrual.status         = 'posted';
  accrual.journalEntryId = je._id as unknown as typeof accrual.journalEntryId;
  await accrual.save();
  res.json(accrual);
}));

// POST /accruals/:id/reverse
router.post('/:id/reverse', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const accrual = await Accrual.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!accrual) throw new AppError('Abgrenzung nicht gefunden.', 404);
  if (accrual.status !== 'posted') throw new AppError('Nur gebuchte Abgrenzungen können storniert werden.', 400);

  const tenantId  = String(req.tenantId);
  const revDate   = new Date();
  const amt       = accrual.amountCents / 100;
  const desc      = `Storno ${accrual.accrualNumber} ${accrual.description}`;

  const accrualAccName  = await resolveAccountName(tenantId, accrual.accrualAccount);
  const contraAccName   = await resolveAccountName(tenantId, accrual.contraAccount);

  // Reversal: swap debit/credit
  let lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string }[];
  if (accrual.type === 'arap') {
    lines = [
      { accountNumber: accrual.contraAccount,  accountName: contraAccName,  debit: amt, credit: 0, description: desc },
      { accountNumber: accrual.accrualAccount, accountName: accrualAccName, debit: 0, credit: amt, description: desc },
    ];
  } else {
    lines = [
      { accountNumber: accrual.accrualAccount, accountName: accrualAccName, debit: amt, credit: 0, description: desc },
      { accountNumber: accrual.contraAccount,  accountName: contraAccName,  debit: 0, credit: amt, description: desc },
    ];
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const revPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: revDate }, endDate: { $gte: revDate } });
  if (revPeriod && revPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${revPeriod.name}" ist ${revPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (revPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(revPeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, revDate);
  const seq   = await nextSeq(tenantId, 'journal');
  const buNum = `BU-${String(seq).padStart(6, '0')}`;
  const hash  = gobdHash({ tenantId, entryNumber: buNum, date: revDate.toISOString(), description: desc, lines, totalDebit, totalCredit });

  const je = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date:        revDate,
    description: desc,
    reference:   accrual.accrualNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Accrual',
    createdBy:   req.user?.userId,
    postedAt:    revDate,
    postedBy:    req.user?.userId,
  });

  accrual.status                = 'reversed';
  accrual.reversalJournalEntryId = je._id as unknown as typeof accrual.reversalJournalEntryId;
  await accrual.save();
  res.json(accrual);
}));

// PATCH /accruals/:id/cancel
router.patch('/:id/cancel', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const accrual = await Accrual.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!accrual) throw new AppError('Abgrenzung nicht gefunden.', 404);
  if (accrual.status !== 'draft') throw new AppError('Nur Entwürfe können abgebrochen werden.', 400);
  accrual.status = 'cancelled';
  await accrual.save();
  res.json(accrual);
}));

export default router;
