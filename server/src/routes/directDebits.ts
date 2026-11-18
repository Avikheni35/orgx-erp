import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { notifyAdmins } from '../utils/notify';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { SepaMandate } from '../models/SepaMandate';
import { DirectDebitRun } from '../models/DirectDebitRun';
import { Customer } from '../models/Customer';
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

// ─── Mandates ────────────────────────────────────────────────────────────────

const mandateSchema = z.object({
  customerId: z.string().min(1),
  type:       z.enum(['CORE', 'B2B']).default('CORE'),
  sequence:   z.enum(['FRST', 'RCUR', 'OOFF', 'FNAL']).default('FRST'),
  iban:       z.string().min(15).max(34),
  bic:        z.string().default(''),
  signedAt:   z.string().min(1),
  creditorId: z.string().default(''),
  notes:      z.string().default(''),
});

router.get('/mandates', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, customerId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     filter.status     = status;
  if (customerId) filter.customerId = customerId;
  const mandates = await SepaMandate.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ mandates });
}));

router.post('/mandates', requireRole('erp_admin', 'erp_accountant'), validate(mandateSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof mandateSchema>;
  const customer = await Customer.findOne({ _id: body.customerId, tenantId: req.tenantId }).lean();
  if (!customer) throw new AppError('Kunde nicht gefunden.', 404);

  const tenantId = String(req.tenantId);
  const seq = await nextSeq(tenantId, 'sepa_mandate');
  const mandateReference = `MREF-${String(seq).padStart(6, '0')}`;

  const mandate = await SepaMandate.create({
    tenantId:        req.tenantId,
    mandateReference,
    type:            body.type,
    sequence:        body.sequence,
    customerId:      customer._id,
    customerName:    customer.companyName,
    iban:            body.iban.replace(/\s/g, '').toUpperCase(),
    bic:             body.bic,
    signedAt:        new Date(body.signedAt),
    creditorId:      body.creditorId,
    notes:           body.notes,
    status:          'active',
  });
  res.status(201).json(mandate);
}));

router.get('/mandates/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const m = await SepaMandate.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!m) throw new AppError('Mandat nicht gefunden.', 404);
  res.json(m);
}));

router.patch('/mandates/:id', requireRole('erp_admin', 'erp_accountant'),
  validate(z.object({
    status:   z.enum(['active', 'inactive', 'cancelled']).optional(),
    sequence: z.enum(['FRST', 'RCUR', 'OOFF', 'FNAL']).optional(),
    notes:    z.string().optional(),
  })),
  asyncHandler(async (req, res) => {
    const m = await SepaMandate.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!m) throw new AppError('Mandat nicht gefunden.', 404);
    if (m.status === 'cancelled') throw new AppError('Gekündigte Mandate können nicht geändert werden.', 400);
    if (req.body.status)   m.status   = req.body.status;
    if (req.body.sequence) m.sequence = req.body.sequence;
    if (req.body.notes !== undefined) m.notes = req.body.notes;
    await m.save();
    res.json(m);
  })
);

// ─── Runs ─────────────────────────────────────────────────────────────────────

const entrySchema = z.object({
  mandateId:   z.string().min(1),
  amountCents: z.number().int().min(1),
  description: z.string().min(1).max(140),
  invoiceRef:  z.string().default(''),
});

const runSchema = z.object({
  collectionDate: z.string().min(1),
  bankAccount:    z.string().default('1200'),
  entries:        z.array(entrySchema).min(1),
  notes:          z.string().default(''),
});

router.get('/runs', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status) filter.status = status;
  const runs = await DirectDebitRun.find(filter).sort({ collectionDate: -1 }).lean();
  res.json({ runs });
}));

router.post('/runs', requireRole('erp_admin', 'erp_accountant'), validate(runSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof runSchema>;
  const tenantId = String(req.tenantId);

  // Resolve mandate details for each entry
  const entries = await Promise.all(body.entries.map(async e => {
    const mandate = await SepaMandate.findOne({ _id: e.mandateId, tenantId: req.tenantId }).lean();
    if (!mandate) throw new AppError(`Mandat ${e.mandateId} nicht gefunden.`, 404);
    if (mandate.status !== 'active') throw new AppError(`Mandat ${mandate.mandateReference} ist nicht aktiv.`, 400);
    return {
      mandateId:        mandate._id,
      mandateReference: mandate.mandateReference,
      customerId:       mandate.customerId,
      customerName:     mandate.customerName,
      iban:             mandate.iban,
      amountCents:      e.amountCents,
      description:      e.description,
      invoiceRef:       e.invoiceRef,
    };
  }));

  const totalAmountCents = entries.reduce((s, e) => s + e.amountCents, 0);
  const seq = await nextSeq(tenantId, 'direct_debit_run');
  const runNumber = `SDD-${String(seq).padStart(6, '0')}`;

  const run = await DirectDebitRun.create({
    tenantId:        req.tenantId,
    runNumber,
    collectionDate:  new Date(body.collectionDate),
    bankAccount:     body.bankAccount,
    status:          'draft',
    entries,
    totalAmountCents,
    notes:           body.notes,
    createdBy:       req.user?.userId,
  });
  res.status(201).json(run);
}));

router.get('/runs/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const run = await DirectDebitRun.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!run) throw new AppError('Lastschriftlauf nicht gefunden.', 404);
  res.json(run);
}));

// POST /direct-debits/runs/:id/submit — submit and post journal
router.post('/runs/:id/submit', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const run = await DirectDebitRun.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!run) throw new AppError('Lastschriftlauf nicht gefunden.', 404);
  if (run.status !== 'draft') throw new AppError('Nur Entwürfe können eingereicht werden.', 400);

  const tenantId   = String(req.tenantId);
  const postDate   = new Date();
  const bankAccNum = run.bankAccount;
  const bankAccName = await resolveAccountName(tenantId, bankAccNum);

  const desc = `Lastschriftlauf ${run.runNumber}`;

  // Debit bank, credit each debtor account
  const lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string }[] = [];

  for (const entry of run.entries) {
    const debtorAcc  = '1400';
    const debtorName = await resolveAccountName(tenantId, debtorAcc);
    const entryDesc  = `${desc} · ${entry.mandateReference} · ${entry.description}`;
    lines.push({ accountNumber: debtorAcc, accountName: debtorName, debit: 0, credit: entry.amountCents / 100, description: entryDesc });
  }
  lines.push({ accountNumber: bankAccNum, accountName: bankAccName, debit: run.totalAmountCents / 100, credit: 0, description: desc });

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  // Guard: reject if the accounting period is closed or locked
  const ddPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (ddPeriod && ddPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${ddPeriod.name}" ist ${ddPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (ddPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(ddPeriod.fiscalYearId);
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
    reference:   run.runNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'DirectDebitRun',
    createdBy:   req.user?.userId,
    postedAt:    postDate,
    postedBy:    req.user?.userId,
  });

  // After FRST, advance mandate sequence to RCUR
  for (const entry of run.entries) {
    await SepaMandate.updateOne(
      { _id: entry.mandateId, tenantId: req.tenantId, sequence: 'FRST' },
      { $set: { sequence: 'RCUR' } }
    );
  }

  run.status         = 'submitted';
  run.journalEntryId = je._id as unknown as typeof run.journalEntryId;
  await run.save();
  void notifyAdmins({
    tenantId: req.tenantId!,
    type: 'direct_debit_submitted',
    title: `Lastschriftlauf eingereicht`,
    body: `${run.runNumber}: ${run.entries.length} Lastschriften über ${(run.totalAmountCents / 100).toFixed(2)} € eingereicht und gebucht.`,
    link: `/erp/zahlungen/lastschrift/runs/${run._id}`,
  });
  res.json(run);
}));

// POST /direct-debits/runs/:id/return — mark as returned (reversal)
router.post('/runs/:id/return', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const run = await DirectDebitRun.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!run) throw new AppError('Lastschriftlauf nicht gefunden.', 404);
  if (run.status !== 'submitted') throw new AppError('Nur eingereichte Läufe können zurückgebucht werden.', 400);

  run.status = 'returned';
  await run.save();
  res.json(run);
}));

// PATCH /direct-debits/runs/:id/settle
router.patch('/runs/:id/settle', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const run = await DirectDebitRun.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!run) throw new AppError('Lastschriftlauf nicht gefunden.', 404);
  if (run.status !== 'submitted') throw new AppError('Nur eingereichte Läufe können abgerechnet werden.', 400);
  run.status = 'settled';
  await run.save();
  res.json(run);
}));

export default router;
