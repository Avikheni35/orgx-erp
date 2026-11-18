import { Router } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { Payment } from '../models/Payment';
import { JournalEntry } from '../models/JournalEntry';
import { SalesInvoice } from '../models/SalesInvoice';
import { VendorInvoice } from '../models/VendorInvoice';
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
const allocationSchema = z.object({
  invoiceType:   z.enum(['SalesInvoice', 'VendorInvoice']),
  invoiceId:     z.string().min(1),
  invoiceNumber: z.string().min(1),
  amountCents:   z.number().int().min(1),
});

const createSchema = z.object({
  date:          z.string().refine(d => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  direction:     z.enum(['incoming', 'outgoing']),
  amountCents:   z.number().int().min(1),
  bankAccount:   z.string().min(1),
  description:   z.string().min(1).max(300),
  allocations:   z.array(allocationSchema).default([]),
  counterAccount: z.string().min(1),
});

// ── GET /payments ─────────────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { direction, from, to, page = '1', limit = '50' } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };

  if (direction) q.direction = direction;
  if (from || to) {
    q.date = {} as Record<string, Date>;
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Payment.countDocuments(q);
  const payments = await Payment.find(q).sort({ date: -1 }).skip(skip).limit(parseInt(limit));

  res.json({ payments, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// ── POST /payments ────────────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body       = req.body as z.infer<typeof createSchema>;
  const tenantId   = String(req.tenantId);
  const date       = new Date(body.date);
  const amountEur  = body.amountCents / 100;

  // Validate allocation totals don't exceed payment amount
  const allocTotal = body.allocations.reduce((s, a) => s + a.amountCents, 0);
  if (allocTotal > body.amountCents) {
    throw new AppError('Zugeordnete Beträge übersteigen den Zahlungsbetrag.', 400);
  }

  // Validate bank account exists
  const bankAcct = await Account.findOne({ tenantId: req.tenantId, number: body.bankAccount, isActive: true });
  if (!bankAcct) throw new AppError(`Bankkonto ${body.bankAccount} nicht gefunden oder inaktiv.`, 400);

  // Validate counter account exists
  const counterAcct = await Account.findOne({ tenantId: req.tenantId, number: body.counterAccount, isActive: true });
  if (!counterAcct) throw new AppError(`Gegenkonto ${body.counterAccount} nicht gefunden oder inaktiv.`, 400);

  // Build journal lines
  // incoming (AR payment received): Debit bank, Credit AR/debtor account
  // outgoing (AP payment made):     Debit AP/creditor account, Credit bank
  const bankName    = bankAcct.name;
  const counterName = counterAcct.name;

  const lines = body.direction === 'incoming'
    ? [
        { accountNumber: body.bankAccount,    accountName: bankName,    debit: amountEur, credit: 0,          description: body.description },
        { accountNumber: body.counterAccount, accountName: counterName, debit: 0,          credit: amountEur, description: body.description },
      ]
    : [
        { accountNumber: body.counterAccount, accountName: counterName, debit: amountEur, credit: 0,          description: body.description },
        { accountNumber: body.bankAccount,    accountName: bankName,    debit: 0,          credit: amountEur, description: body.description },
      ];

  // Period / fiscal year — reject if closed or locked
  const period = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (period && period.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${period.name}" ist ${period.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Zahlungsdatum anpassen.`, 422);
  }
  if (period?.fiscalYearId) {
    const fy = await FiscalYear.findById(period.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);

  // Entry number
  const seq        = await nextSeq(tenantId, 'journal');
  const entryNumStr = `BU-${String(seq).padStart(6, '0')}`;

  const hash = gobdHash({
    tenantId,
    entryNumber: entryNumStr,
    date:        date.toISOString(),
    description: body.description,
    lines,
    totalDebit:  amountEur,
    totalCredit: amountEur,
  });

  // Payment number
  const paySeq = await nextSeq(tenantId, 'payment');
  const payNum  = `ZAH-${String(paySeq).padStart(6, '0')}`;

  // Use a session for atomic invoice updates
  const session = await mongoose.startSession();
  let payment;
  try {
    await session.withTransaction(async () => {
      // Create journal entry (posted immediately)
      const entry = await JournalEntry.create([{
        tenantId:    req.tenantId,
        entryNumber: entryNumStr,
        date,
        description: body.description,
        reference:   payNum,
        status:      'posted',
        lines,
        totalDebit:  amountEur,
        totalCredit: amountEur,
        periodId,
        fiscalYearId,
        gobdHash:    hash,
        sourceType:  'Payment',
        createdBy:   req.user?.userId,
        postedAt:    new Date(),
        postedBy:    req.user?.userId,
      }], { session });

      // Create payment record
      [payment] = await Payment.create([{
        tenantId:        req.tenantId,
        paymentNumber:   payNum,
        date,
        direction:       body.direction,
        amountCents:     body.amountCents,
        bankAccount:     body.bankAccount,
        bankAccountName: bankAcct.name,
        description:     body.description,
        allocations:     body.allocations,
        journalEntryId:  entry[0]._id,
        createdBy:       req.user?.userId,
      }], { session });

      // Update invoices
      for (const alloc of body.allocations) {
        if (alloc.invoiceType === 'SalesInvoice') {
          const inv = await SalesInvoice.findOne({ _id: alloc.invoiceId, tenantId: req.tenantId }).session(session);
          if (!inv) continue;
          inv.paidCents += alloc.amountCents;
          if (inv.paidCents >= inv.totalGrossCents) {
            inv.status = 'paid';
            inv.paidAt = date;
          }
          await inv.save({ session });
        } else {
          const inv = await VendorInvoice.findOne({ _id: alloc.invoiceId, tenantId: req.tenantId }).session(session);
          if (!inv) continue;
          inv.paidCents += alloc.amountCents;
          if (inv.paidCents >= inv.totalGrossCents) {
            inv.status = 'paid';
            inv.paidAt = date;
          }
          await inv.save({ session });
        }
      }
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json(payment);
}));

// ── GET /payments/:id ──────────────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payment) throw new AppError('Zahlung nicht gefunden.', 404);

  const entry = payment.journalEntryId
    ? await JournalEntry.findById(payment.journalEntryId)
    : null;

  res.json({ payment, journalEntry: entry });
}));

// ── DELETE /payments/:id  (reverse / void) ─────────────────────────────────────
router.delete('/:id', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!payment) throw new AppError('Zahlung nicht gefunden.', 404);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Reverse journal entry: swap debit/credit
      if (payment.journalEntryId) {
        const original = await JournalEntry.findById(payment.journalEntryId).session(session);
        if (original && original.status === 'posted') {
          const reversedLines = original.lines.map(l => ({
            accountNumber: l.accountNumber,
            accountName:   l.accountName,
            debit:         l.credit,
            credit:        l.debit,
            description:   `Storno: ${l.description ?? ''}`,
          }));

          const revSeq = await nextSeq(String(req.tenantId), 'journal');
          const revNum = `BU-${String(revSeq).padStart(6, '0')}`;
          const revHash = gobdHash({
            tenantId:    String(req.tenantId),
            entryNumber: revNum,
            date:        new Date().toISOString(),
            description: `Storno ${original.entryNumber}`,
            lines:       reversedLines,
            totalDebit:  original.totalCredit,
            totalCredit: original.totalDebit,
          });

          const revEntry = await JournalEntry.create([{
            tenantId:    req.tenantId,
            entryNumber: revNum,
            date:        new Date(),
            description: `Storno ${original.entryNumber}: ${original.description}`,
            reference:   payment.paymentNumber,
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
          }], { session });

          original.status    = 'reversed';
          original.reversedBy = (revEntry[0] as { _id: mongoose.Types.ObjectId })._id;
          await original.save({ session });
        }
      }

      // Subtract paidCents from allocated invoices
      for (const alloc of payment.allocations) {
        if (alloc.invoiceType === 'SalesInvoice') {
          const inv = await SalesInvoice.findOne({ _id: alloc.invoiceId, tenantId: req.tenantId }).session(session);
          if (!inv) continue;
          inv.paidCents = Math.max(0, inv.paidCents - alloc.amountCents);
          if (inv.status === 'paid') inv.status = 'sent';
          await inv.save({ session });
        } else {
          const inv = await VendorInvoice.findOne({ _id: alloc.invoiceId, tenantId: req.tenantId }).session(session);
          if (!inv) continue;
          inv.paidCents = Math.max(0, inv.paidCents - alloc.amountCents);
          if (inv.status === 'paid') inv.status = 'approved';
          await inv.save({ session });
        }
      }

      await Payment.deleteOne({ _id: payment._id }).session(session);
    });
  } finally {
    await session.endSession();
  }

  res.json({ message: 'Zahlung storniert.' });
}));

export default router;
