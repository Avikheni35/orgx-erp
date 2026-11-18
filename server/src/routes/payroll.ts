import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { notifyAdmins } from '../utils/notify';
import { peers } from '../utils/serviceClient';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { Payroll } from '../models/Payroll';
import { Employee } from '../models/Employee';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
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

function recalcEntry(e: {
  grossCents: number; hoursWorked: number; additionalCents: number;
  deductionCents: number; taxCents: number; socialSecurityCents: number;
  salaryType: string;
}) {
  const base         = e.salaryType === 'hourly' ? 0 : e.grossCents; // hourly gross set separately
  const totalGross   = base + e.additionalCents - e.deductionCents;
  const net          = Math.max(0, totalGross - e.taxCents - e.socialSecurityCents);
  return { totalGrossCents: totalGross, netCents: net };
}

const createSchema = z.object({
  year:        z.number().int().min(2000).max(2100),
  month:       z.number().int().min(1).max(12),
  employeeIds: z.array(z.string()).optional(),
  notes:       z.string().default(''),
});

const updateEntrySchema = z.object({
  hoursWorked:         z.number().min(0).optional(),
  additionalCents:     z.number().int().min(0).optional(),
  deductionCents:      z.number().int().min(0).optional(),
  taxCents:            z.number().int().min(0).optional(),
  socialSecurityCents: z.number().int().min(0).optional(),
  note:                z.string().optional(),
});

// GET /payroll
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const payrolls = await Payroll.find({ tenantId: req.tenantId }).sort({ year: -1, month: -1 });
  res.json({ payrolls });
}));

// GET /payroll/employee/:employeeId — payroll history for a single employee
router.get('/employee/:employeeId', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { Types } = await import('mongoose');
  const empId = new Types.ObjectId(req.params.employeeId);
  const payrolls = await Payroll.find(
    { tenantId: req.tenantId, 'entries.employeeId': empId },
    { payrollNumber: 1, period: 1, year: 1, month: 1, status: 1, postedAt: 1, entries: { $elemMatch: { employeeId: empId } } }
  ).sort({ year: -1, month: -1 });
  const rows = payrolls.map(p => ({ ...p.toObject(), entry: p.entries[0] }));
  res.json({ rows });
}));

// POST /payroll
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);
  const period   = `${body.year}-${String(body.month).padStart(2, '0')}`;

  const existing = await Payroll.findOne({ tenantId: req.tenantId, year: body.year, month: body.month });
  if (existing) throw new AppError(`Lohnabrechnung für ${period} existiert bereits.`, 409);

  const empQuery: Record<string, unknown> = { tenantId: req.tenantId, status: 'active' };
  if (body.employeeIds?.length) empQuery._id = { $in: body.employeeIds };
  const employees = await Employee.find(empQuery).sort({ lastName: 1, firstName: 1 });
  if (employees.length === 0) throw new AppError('Keine aktiven Mitarbeiter gefunden.', 400);

  const entries = employees.map(emp => {
    const gross = emp.salaryType === 'monthly' ? emp.salaryCents : 0;
    const tax   = Math.round(gross * 0.30);
    const ss    = Math.round(gross * 0.20);
    const net   = Math.max(0, gross - tax - ss);
    return {
      employeeId:          emp._id,
      employeeNumber:      emp.employeeNumber,
      employeeName:        `${emp.firstName} ${emp.lastName}`,
      personnelAccount:    emp.personnelAccount || '4120',
      costCenterNumber:    emp.costCenterNumber || '',
      salaryType:          emp.salaryType,
      grossCents:          gross,
      hoursWorked:         0,
      additionalCents:     0,
      deductionCents:      0,
      totalGrossCents:     gross,
      taxCents:            tax,
      socialSecurityCents: ss,
      netCents:            net,
      note:                '',
    };
  });

  const totalGrossCents = entries.reduce((s, e) => s + e.totalGrossCents, 0);
  const totalNetCents   = entries.reduce((s, e) => s + e.netCents, 0);

  const seq    = await nextSeq(tenantId, 'payroll');
  const payNum = `LNA-${String(seq).padStart(6, '0')}`;

  const payroll = await Payroll.create({
    tenantId:        req.tenantId,
    payrollNumber:   payNum,
    period,
    year:            body.year,
    month:           body.month,
    status:          'draft',
    entries,
    totalGrossCents,
    totalNetCents,
    notes:           body.notes,
    createdBy:       req.user?.userId,
  });

  res.status(201).json(payroll);
}));

// GET /payroll/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payroll) throw new AppError('Lohnabrechnung nicht gefunden.', 404);
  res.json(payroll);
}));

// PATCH /payroll/:id/entries/:employeeId
router.patch('/:id/entries/:employeeId', requireRole('erp_admin', 'erp_accountant'), validate(updateEntrySchema), asyncHandler(async (req, res) => {
  const body    = req.body as z.infer<typeof updateEntrySchema>;
  const payroll = await Payroll.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payroll) throw new AppError('Nicht gefunden.', 404);
  if (payroll.status !== 'draft') throw new AppError('Nur Entwürfe können bearbeitet werden.', 400);

  const entry = payroll.entries.find(e => String(e.employeeId) === req.params.employeeId);
  if (!entry) throw new AppError('Mitarbeiter nicht in dieser Abrechnung.', 404);

  if (body.hoursWorked         !== undefined) {
    entry.hoursWorked     = body.hoursWorked;
    if (entry.salaryType === 'hourly') {
      // gross = hours * rate stored in employee — approximate: no rate stored in entry, just store hours
      // We don't auto-compute here; admin must also update taxCents/ssC manually or we estimate
    }
  }
  if (body.additionalCents     !== undefined) entry.additionalCents     = body.additionalCents;
  if (body.deductionCents      !== undefined) entry.deductionCents      = body.deductionCents;
  if (body.taxCents            !== undefined) entry.taxCents            = body.taxCents;
  if (body.socialSecurityCents !== undefined) entry.socialSecurityCents = body.socialSecurityCents;
  if (body.note                !== undefined) entry.note                = body.note;

  const { totalGrossCents, netCents } = recalcEntry(entry);
  entry.totalGrossCents = totalGrossCents;
  entry.netCents        = netCents;

  payroll.totalGrossCents = payroll.entries.reduce((s, e) => s + e.totalGrossCents, 0);
  payroll.totalNetCents   = payroll.entries.reduce((s, e) => s + e.netCents, 0);
  payroll.markModified('entries');
  await payroll.save();
  res.json(payroll);
}));

// POST /payroll/:id/finalize
router.post('/:id/finalize', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const payroll = await Payroll.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payroll) throw new AppError('Nicht gefunden.', 404);
  if (payroll.status !== 'draft') throw new AppError('Nur Entwürfe können finalisiert werden.', 400);
  payroll.status      = 'finalized';
  payroll.finalizedAt = new Date();
  await payroll.save();
  void notifyAdmins({
    tenantId: req.tenantId!,
    type: 'payroll_finalized',
    title: `Lohnabrechnung finalisiert`,
    body: `${payroll.payrollNumber} (${payroll.entries.length} Mitarbeiter) wurde finalisiert und ist bereit zum Buchen.`,
    link: `/erp/lohn/${payroll._id}`,
  });
  void peers.m1.sendNotification(String(req.tenantId), {
    type:  'info',
    title: 'Payroll finalized',
    body:  `${payroll.payrollNumber} (${payroll.entries.length} employees) has been finalized in ERP.`,
  });
  res.json(payroll);
}));

// POST /payroll/:id/post
router.post('/:id/post', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const payroll  = await Payroll.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payroll) throw new AppError('Nicht gefunden.', 404);
  if (payroll.status !== 'finalized') throw new AppError('Nur finalisierte Abrechnungen können gebucht werden.', 400);

  const tenantId = String(req.tenantId);
  const postDate = new Date();

  // Build combined journal lines for all employees
  const lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string; costCenter: string }[] = [];

  const [lohnsteuerName, svName, verbindlichkeitenName] = await Promise.all([
    resolveAccountName(tenantId, '1742'),
    resolveAccountName(tenantId, '1743'),
    resolveAccountName(tenantId, '1740'),
  ]);

  for (const entry of payroll.entries) {
    if (entry.totalGrossCents <= 0) continue;

    const totalGrossEur = entry.totalGrossCents / 100;
    const taxEur        = entry.taxCents / 100;
    const ssEur         = entry.socialSecurityCents / 100;
    const netEur        = entry.netCents / 100;
    const acctName      = await resolveAccountName(tenantId, entry.personnelAccount);
    const desc          = `Lohn ${entry.employeeName} ${payroll.period}`;
    const cc            = entry.costCenterNumber;

    lines.push({ accountNumber: entry.personnelAccount, accountName: acctName,          debit: totalGrossEur, credit: 0,      description: desc, costCenter: cc });
    lines.push({ accountNumber: '1742',                 accountName: lohnsteuerName,    debit: 0, credit: taxEur,              description: desc, costCenter: cc });
    lines.push({ accountNumber: '1743',                 accountName: svName,            debit: 0, credit: ssEur,               description: desc, costCenter: cc });
    lines.push({ accountNumber: '1740',                 accountName: verbindlichkeitenName, debit: 0, credit: netEur,          description: desc, costCenter: cc });
  }

  if (lines.length === 0) throw new AppError('Keine Einträge zum Buchen.', 400);

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const payrollPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (payrollPeriod && payrollPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${payrollPeriod.name}" ist ${payrollPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (payrollPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(payrollPeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, postDate);
  const seq   = await nextSeq(tenantId, 'journal');
  const buNum = `BU-${String(seq).padStart(6, '0')}`;
  const hash  = gobdHash({ tenantId, entryNumber: buNum, date: postDate.toISOString(), description: `Lohnabrechnung ${payroll.payrollNumber}`, lines, totalDebit, totalCredit });

  const je = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date:        postDate,
    description: `Lohnabrechnung ${payroll.payrollNumber} (${payroll.period})`,
    reference:   payroll.payrollNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Payment',
    createdBy:   req.user?.userId,
    postedAt:    postDate,
    postedBy:    req.user?.userId,
  });

  payroll.status         = 'posted';
  payroll.postedAt       = postDate;
  payroll.journalEntryId = je._id as unknown as typeof payroll.journalEntryId;
  await payroll.save();
  void notifyAdmins({
    tenantId: req.tenantId!,
    type: 'payroll_posted',
    title: `Lohnabrechnung gebucht`,
    body: `${payroll.payrollNumber} wurde gebucht. Buchungssatz ${buNum} erstellt.`,
    link: `/erp/lohn/${payroll._id}`,
  });
  res.json(payroll);
}));

export default router;
