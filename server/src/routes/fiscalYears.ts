import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { FiscalYear } from '../models/FiscalYear';
import { Period } from '../models/Period';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';

const router = Router();
router.use(requireAuth);

// ── Schemas ─────────────────────────────────────────────────────────────────
const createFYSchema = z.object({
  name:      z.string().min(1).max(60),
  startDate: z.string().refine((d) => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  endDate:   z.string().refine((d) => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  generatePeriods: z.boolean().optional().default(true),
});

const periodStatusSchema = z.object({
  status: z.enum(['open', 'closed', 'locked']),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function generateMonthlyPeriods(fiscalYearId: string, tenantId: string, start: Date, end: Date) {
  const periods = [];
  let current = new Date(start);
  let num = 1;

  while (current <= end) {
    const periodStart = new Date(current);
    const periodEnd   = new Date(current.getFullYear(), current.getMonth() + 1, 0); // last day of month
    const capped      = periodEnd > end ? end : periodEnd;

    const monthName = periodStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    periods.push({
      tenantId,
      fiscalYearId,
      name:      monthName,
      number:    num++,
      startDate: periodStart,
      endDate:   capped,
      status:    'open',
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }
  return periods;
}

// ── GET /api/fiscal-years ────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const years = await FiscalYear.find({ tenantId: req.tenantId }).sort({ startDate: -1 });
  res.json({ fiscalYears: years });
}));

// ── POST /api/fiscal-years ───────────────────────────────────────────────────
router.post('/', requireRole('erp_admin'), validate(createFYSchema), asyncHandler(async (req, res) => {
  const { name, startDate, endDate, generatePeriods } = req.body as z.infer<typeof createFYSchema>;
  const start = new Date(startDate);
  const end   = new Date(endDate);

  if (end <= start) throw new AppError('Enddatum muss nach dem Startdatum liegen.', 400);

  // No overlap with existing fiscal years
  const overlap = await FiscalYear.findOne({
    tenantId:  req.tenantId,
    $or: [
      { startDate: { $lte: end }, endDate: { $gte: start } },
    ],
  });
  if (overlap) throw new AppError(`Überschneidung mit bestehendem Geschäftsjahr "${overlap.name}".`, 409);

  const fy = await FiscalYear.create({
    tenantId:  req.tenantId,
    name,
    startDate: start,
    endDate:   end,
    status:    'open',
  });

  if (generatePeriods) {
    const docs = generateMonthlyPeriods(String(fy._id), String(req.tenantId), start, end);
    await Period.insertMany(docs);
  }

  res.status(201).json(fy);
}));

// ── GET /api/fiscal-years/:id ────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const fy = await FiscalYear.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);

  const periods = await Period.find({ tenantId: req.tenantId, fiscalYearId: fy._id }).sort({ number: 1 });
  res.json({ fiscalYear: fy, periods });
}));

// ── PATCH /api/fiscal-years/:id/status ──────────────────────────────────────
router.patch('/:id/status', requireRole('erp_admin'), validate(periodStatusSchema), asyncHandler(async (req, res) => {
  const fy = await FiscalYear.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);

  const { status } = req.body as z.infer<typeof periodStatusSchema>;

  if (fy.status === 'locked') throw new AppError('Gesperrte Geschäftsjahre können nicht verändert werden.', 403);

  const update: Partial<typeof fy> = { status } as Partial<typeof fy>;
  if (status === 'closed') {
    (update as Record<string, unknown>).closedAt = new Date();
    (update as Record<string, unknown>).closedBy = req.user?.userId;
  }

  await FiscalYear.updateOne({ _id: fy._id }, { $set: update });
  res.json({ message: `Geschäftsjahr auf "${status}" gesetzt.` });
}));

// ── POST /api/fiscal-years/:id/close ─────────────────────────────────────────
router.post('/:id/close', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const tenantId = String(req.tenantId);
  const fy = await FiscalYear.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);
  if (fy.status === 'closed' || fy.status === 'locked') {
    throw new AppError('Geschäftsjahr ist bereits abgeschlossen.', 400);
  }

  // Aggregate P&L from all journal entries in this fiscal year
  const entries = await JournalEntry.find({ tenantId: req.tenantId, fiscalYearId: fy._id, status: 'posted' });

  // Collect all unique account numbers referenced
  const accountNumbers = [...new Set(entries.flatMap(e => e.lines.map(l => l.accountNumber)))];
  const accountDocs = await Account.find({ tenantId: req.tenantId, number: { $in: accountNumbers } });
  const accountTypeMap = new Map(accountDocs.map(a => [a.number, a.type]));

  let totalRevenue = 0;
  let totalExpenses = 0;

  for (const entry of entries) {
    for (const line of entry.lines) {
      const type = accountTypeMap.get(line.accountNumber);
      if (type === 'revenue')  totalRevenue  += (line.credit - line.debit);
      if (type === 'expense')  totalExpenses += (line.debit  - line.credit);
    }
  }
  const netResult = totalRevenue - totalExpenses;

  let closingEntryNumber: string | null = null;

  if (Math.abs(netResult) > 0.001) {
    // Find an equity account; fall back to hardcoded '0900'
    const equityAcct = await Account.findOne({ tenantId: req.tenantId, type: 'equity', isActive: true });
    const equityNumber = equityAcct?.number ?? '0900';
    const equityName   = equityAcct?.name   ?? 'Eigenkapital';

    const absNet = Math.abs(netResult);
    const isProfit = netResult > 0;

    // 2-line closing entry: GuV clearing ↔ Equity (retained earnings)
    const closingLines = isProfit
      ? [
          { accountNumber: '9999', accountName: 'GuV-Verrechnungskonto', debit: absNet, credit: 0,      description: `Jahresergebnis ${fy.name}` },
          { accountNumber: equityNumber, accountName: equityName,         debit: 0,      credit: absNet, description: `Gewinnvortrag ${fy.name}` },
        ]
      : [
          { accountNumber: equityNumber, accountName: equityName,         debit: absNet, credit: 0,      description: `Verlustvortrag ${fy.name}` },
          { accountNumber: '9999', accountName: 'GuV-Verrechnungskonto', debit: 0,      credit: absNet, description: `Jahresergebnis ${fy.name}` },
        ];

    const seq    = await nextSeq(tenantId, 'journal');
    const entNum = `BU-${String(seq).padStart(6, '0')}`;
    const hash   = gobdHash({
      tenantId, entryNumber: entNum,
      date: fy.endDate.toISOString(),
      description: `Jahresabschluss ${fy.name}`,
      lines: closingLines,
      totalDebit: absNet,
      totalCredit: absNet,
    });

    await JournalEntry.create({
      tenantId:    req.tenantId,
      entryNumber: entNum,
      date:        fy.endDate,
      description: `Jahresabschluss ${fy.name}`,
      reference:   '',
      status:      'posted',
      lines:       closingLines,
      totalDebit:  absNet,
      totalCredit: absNet,
      fiscalYearId: fy._id,
      gobdHash:    hash,
      sourceType:  'Closing',
      createdBy:   req.user?.userId,
      postedAt:    new Date(),
      postedBy:    req.user?.userId,
    });
    closingEntryNumber = entNum;
  }

  // Close all periods
  await Period.updateMany(
    { tenantId: req.tenantId, fiscalYearId: fy._id, status: { $ne: 'locked' } },
    { $set: { status: 'closed', closedAt: new Date(), closedBy: req.user?.userId } }
  );

  // Close the fiscal year
  await FiscalYear.updateOne(
    { _id: fy._id },
    { $set: { status: 'closed', closedAt: new Date(), closedBy: req.user?.userId } }
  );

  res.json({
    message: `Geschäftsjahr "${fy.name}" erfolgreich abgeschlossen.`,
    closingEntryNumber,
    netResult: Math.round(netResult * 100) / 100,
  });
}));

// ── DELETE /api/fiscal-years/:id ─────────────────────────────────────────────
router.delete('/:id', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const fy = await FiscalYear.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);
  if (fy.status !== 'open') throw new AppError('Nur offene Geschäftsjahre können gelöscht werden.', 400);

  await Period.deleteMany({ tenantId: req.tenantId, fiscalYearId: fy._id });
  await FiscalYear.deleteOne({ _id: fy._id });
  res.json({ message: 'Geschäftsjahr gelöscht.' });
}));

// ── GET /api/fiscal-years/:id/periods ───────────────────────────────────────
router.get('/:id/periods', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const fy = await FiscalYear.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);

  const periods = await Period.find({ tenantId: req.tenantId, fiscalYearId: fy._id }).sort({ number: 1 });
  res.json({ periods });
}));

// ── PATCH /api/fiscal-years/:fyId/periods/:periodId/status ──────────────────
router.patch('/:fyId/periods/:periodId/status', requireRole('erp_admin'), validate(periodStatusSchema), asyncHandler(async (req, res) => {
  const period = await Period.findOne({ _id: req.params.periodId, tenantId: req.tenantId, fiscalYearId: req.params.fyId });
  if (!period) throw new AppError('Buchungsperiode nicht gefunden.', 404);
  if (period.status === 'locked') throw new AppError('Gesperrte Perioden können nicht verändert werden.', 403);

  const { status } = req.body as z.infer<typeof periodStatusSchema>;
  const update: Record<string, unknown> = { status };
  if (status === 'closed') {
    update.closedAt = new Date();
    update.closedBy = req.user?.userId;
  }

  await Period.updateOne({ _id: period._id }, { $set: update });
  res.json({ message: `Periode "${period.name}" auf "${status}" gesetzt.` });
}));

export default router;
