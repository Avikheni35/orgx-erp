import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { TravelExpense } from '../models/TravelExpense';
import { Employee } from '../models/Employee';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';

const router = Router();
router.use(requireAuth);

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Schemas ───────────────────────────────────────────────────────────────────
const CATEGORIES = ['mileage', 'hotel', 'meal', 'transport', 'parking', 'other'] as const;

const lineSchema = z.object({
  category:      z.enum(CATEGORIES),
  description:   z.string().default(''),
  amountCents:   z.number().int().min(0),
  vatRate:       z.number().min(0).max(100).default(0),
  receiptNumber: z.string().default(''),
  km:            z.number().min(0).optional(),
  kmRate:        z.number().min(0).optional(),
});

const createSchema = z.object({
  employeeId:       z.string().min(1),
  purpose:          z.string().min(1).max(300),
  destination:      z.string().default(''),
  startDate:        z.string().refine(d => !isNaN(Date.parse(d))),
  endDate:          z.string().refine(d => !isNaN(Date.parse(d))),
  lines:            z.array(lineSchema).min(1),
  costCenterNumber: z.string().default(''),
  personnelAccount: z.string().default('4120'),
  expenseAccount:   z.string().default('6650'),
  notes:            z.string().default(''),
});

// ── GET /travel-expenses ──────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, employeeId } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     q.status     = status;
  if (employeeId) q.employeeId = employeeId;
  const expenses = await TravelExpense.find(q).sort({ createdAt: -1 });
  res.json({ expenses });
}));

// ── POST /travel-expenses ─────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);

  const emp = await Employee.findOne({ _id: body.employeeId, tenantId: req.tenantId });
  if (!emp) throw new AppError('Mitarbeiter nicht gefunden.', 404);

  const totalAmountCents = body.lines.reduce((s, l) => s + l.amountCents, 0);

  const seq = await nextSeq(tenantId, 'travelExpense');
  const expNum = `RE-${String(seq).padStart(6, '0')}`;

  const expense = await TravelExpense.create({
    tenantId:         req.tenantId,
    expenseNumber:    expNum,
    employeeId:       emp._id,
    employeeName:     `${emp.firstName} ${emp.lastName}`,
    purpose:          body.purpose,
    destination:      body.destination,
    startDate:        new Date(body.startDate),
    endDate:          new Date(body.endDate),
    lines:            body.lines,
    totalAmountCents,
    costCenterNumber: body.costCenterNumber || emp.costCenterNumber,
    personnelAccount: body.personnelAccount || emp.personnelAccount || '4120',
    expenseAccount:   body.expenseAccount,
    notes:            body.notes,
    status:           'draft',
    createdBy:        req.user?.userId,
  });

  res.status(201).json(expense);
}));

// ── GET /travel-expenses/:id ──────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const expense = await TravelExpense.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!expense) throw new AppError('Reisekostenabrechnung nicht gefunden.', 404);
  res.json(expense);
}));

// ── POST /travel-expenses/:id/submit ─────────────────────────────────────────
router.post('/:id/submit', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const expense = await TravelExpense.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!expense) throw new AppError('Nicht gefunden.', 404);
  if (expense.status !== 'draft') throw new AppError('Nur Entwürfe können eingereicht werden.', 400);
  expense.status      = 'submitted';
  expense.submittedAt = new Date();
  await expense.save();
  res.json(expense);
}));

// ── POST /travel-expenses/:id/approve ────────────────────────────────────────
router.post('/:id/approve', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const expense  = await TravelExpense.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!expense) throw new AppError('Nicht gefunden.', 404);
  if (expense.status !== 'submitted') throw new AppError('Nur eingereichte Abrechnungen können genehmigt werden.', 400);

  const tenantId  = String(req.tenantId);
  const postDate  = new Date();

  // Post journal entry: Debit expense account, Credit personnel account
  const expAcctName  = await resolveAccountName(tenantId, expense.expenseAccount);
  const persAcctName = await resolveAccountName(tenantId, expense.personnelAccount);
  const amtEur       = expense.totalAmountCents / 100;

  const lines = [
    { accountNumber: expense.expenseAccount,   accountName: expAcctName,  debit: amtEur, credit: 0,       description: `Reisekosten ${expense.employeeName}: ${expense.purpose}`, costCenter: expense.costCenterNumber },
    { accountNumber: expense.personnelAccount, accountName: persAcctName, debit: 0,       credit: amtEur, description: `Reisekosten ${expense.employeeName}: ${expense.purpose}`, costCenter: expense.costCenterNumber },
  ];

  // Guard: reject if the accounting period is closed or locked
  const tePeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (tePeriod && tePeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${tePeriod.name}" ist ${tePeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (tePeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(tePeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, postDate);
  const seq   = await nextSeq(tenantId, 'journal');
  const buNum = `BU-${String(seq).padStart(6, '0')}`;
  const hash  = gobdHash({ tenantId, entryNumber: buNum, date: postDate.toISOString(), description: `Reisekosten ${expense.expenseNumber}`, lines, totalDebit: amtEur, totalCredit: amtEur });

  const je = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date:        postDate,
    description: `Reisekosten ${expense.expenseNumber} ${expense.employeeName}`,
    reference:   expense.expenseNumber,
    status:      'posted',
    lines,
    totalDebit:  amtEur,
    totalCredit: amtEur,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Payment',
    createdBy:   req.user?.userId,
    postedAt:    postDate,
    postedBy:    req.user?.userId,
  });

  expense.status         = 'approved';
  expense.approvedBy     = req.user?.userId as unknown as typeof expense.approvedBy;
  expense.approvedAt     = postDate;
  expense.journalEntryId = je._id as unknown as typeof expense.journalEntryId;
  await expense.save();
  res.json(expense);
}));

// ── POST /travel-expenses/:id/reject ─────────────────────────────────────────
router.post('/:id/reject', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const { reason = '' } = req.body as { reason?: string };
  const expense = await TravelExpense.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!expense) throw new AppError('Nicht gefunden.', 404);
  if (!['submitted', 'approved'].includes(expense.status)) throw new AppError('Kann nicht abgelehnt werden.', 400);
  expense.status          = 'rejected';
  expense.rejectedBy      = req.user?.userId as unknown as typeof expense.rejectedBy;
  expense.rejectedAt      = new Date();
  expense.rejectionReason = reason;
  await expense.save();
  res.json(expense);
}));

// ── POST /travel-expenses/:id/mark-paid ──────────────────────────────────────
router.post('/:id/mark-paid', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const expense = await TravelExpense.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!expense) throw new AppError('Nicht gefunden.', 404);
  if (expense.status !== 'approved') throw new AppError('Nur genehmigte Abrechnungen können als bezahlt markiert werden.', 400);
  expense.status = 'paid';
  await expense.save();
  res.json(expense);
}));

export default router;
