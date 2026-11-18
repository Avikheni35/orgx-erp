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
import { SalesInvoice } from '../models/SalesInvoice';
import { Payment } from '../models/Payment';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';

const router = Router();
router.use(requireAuth);

// ── Matching helpers ──────────────────────────────────────────────────────────

function normalizeRef(s: string): string {
  return s.toLowerCase().replace(/[\s\-\/\.]/g, '');
}

function scoreMatch(description: string, invoiceNumber: string, companyName: string, amountMatch: boolean): number {
  let score = 0;
  if (amountMatch) score += 60;
  const desc    = normalizeRef(description);
  const invNum  = normalizeRef(invoiceNumber);
  const company = normalizeRef(companyName);

  if (invNum && desc.includes(invNum)) score += 30;
  else {
    // Partial invoice number match (last 6 digits)
    const tail = invNum.slice(-6);
    if (tail.length >= 4 && desc.includes(tail)) score += 15;
  }

  // Company name: check if first meaningful word of company appears in description
  const firstWord = company.split(/\s/)[0];
  if (firstWord && firstWord.length >= 4 && desc.includes(firstWord)) score += 10;

  return score;
}

// ── POST /reconciliation/match ────────────────────────────────────────────────
const rowSchema = z.object({
  date:        z.string(),
  description: z.string(),
  amountCents: z.number().int().min(1),
  type:        z.enum(['receipt', 'payment']),
});

const matchSchema = z.object({
  rows: z.array(rowSchema).min(1).max(500),
});

router.post('/match',
  requireRole('erp_admin', 'erp_accountant'),
  validate(matchSchema),
  asyncHandler(async (req, res) => {
    const { rows } = req.body as z.infer<typeof matchSchema>;
    const tenantId = req.tenantId!;

    // Load all open sent invoices once
    const openInvoices = await SalesInvoice.find({
      tenantId,
      status: 'sent',
    }).lean();

    const results = rows.map((row, idx) => {
      const openAmounts = openInvoices.map(inv => ({
        inv,
        openCents: inv.totalGrossCents - inv.paidCents,
      })).filter(x => x.openCents > 0);

      let bestScore = 0;
      let bestMatch: typeof openAmounts[0] | null = null;

      for (const candidate of openAmounts) {
        const amountMatch = candidate.openCents === row.amountCents;
        const score = scoreMatch(
          row.description,
          candidate.inv.invoiceNumber,
          candidate.inv.customerSnapshot?.companyName ?? '',
          amountMatch,
        );
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }

      const confidence: 'high' | 'medium' | 'low' | 'none' =
        bestScore >= 85 ? 'high' :
        bestScore >= 60 ? 'medium' :
        bestScore >= 30 ? 'low' : 'none';

      return {
        idx,
        row,
        match: bestMatch ? {
          invoiceId:    String(bestMatch.inv._id),
          invoiceNumber: bestMatch.inv.invoiceNumber,
          companyName:  bestMatch.inv.customerSnapshot?.companyName ?? '',
          openCents:    bestMatch.openCents,
          totalCents:   bestMatch.inv.totalGrossCents,
          score:        bestScore,
          confidence,
        } : null,
      };
    });

    res.json({ results });
  })
);

// ── POST /reconciliation/apply ────────────────────────────────────────────────
const applyItemSchema = z.object({
  date:          z.string(),
  description:   z.string(),
  amountCents:   z.number().int().min(1),
  invoiceId:     z.string().min(1),
  invoiceNumber: z.string().min(1),
});

const applySchema = z.object({
  bankAccount:    z.string().min(1),
  counterAccount: z.string().default('1400'),
  items:          z.array(applyItemSchema).min(1).max(200),
});

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({ tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  const fy     = period ? await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId }) : null;
  return { periodId: period?._id, fiscalYearId: fy?._id };
}

router.post('/apply',
  requireRole('erp_admin', 'erp_accountant'),
  validate(applySchema),
  asyncHandler(async (req, res) => {
    const body     = req.body as z.infer<typeof applySchema>;
    const tenantId = req.tenantId!;
    const userId   = req.user!.userId;

    const bankAcct    = await Account.findOne({ tenantId, number: body.bankAccount,    isActive: true });
    const counterAcct = await Account.findOne({ tenantId, number: body.counterAccount, isActive: true });

    if (!bankAcct)    throw new AppError(`Bankkonto ${body.bankAccount} nicht gefunden.`, 404);
    if (!counterAcct) throw new AppError(`Debitorenkonto ${body.counterAccount} nicht gefunden.`, 404);

    const created: string[] = [];
    const failed:  string[] = [];

    for (const item of body.items) {
      const date      = new Date(item.date);
      const amountEur = item.amountCents / 100;
      const desc      = item.description;

      const invoice = await SalesInvoice.findOne({ _id: item.invoiceId, tenantId });
      if (!invoice) { failed.push(item.invoiceNumber); continue; }

      // Skip item if its accounting period is closed or locked
      const recPeriod = await Period.findOne({ tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
      if (recPeriod && recPeriod.status !== 'open') { failed.push(item.invoiceNumber); continue; }
      if (recPeriod?.fiscalYearId) {
        const fy = await FiscalYear.findById(recPeriod.fiscalYearId);
        if (fy && fy.status !== 'open') { failed.push(item.invoiceNumber); continue; }
      }
      const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);

      const seq        = await nextSeq(tenantId, 'journal');
      const entryNum   = `BU-${String(seq).padStart(6, '0')}`;
      const paySeq     = await nextSeq(tenantId, 'payment');
      const payNum     = `ZAH-${String(paySeq).padStart(6, '0')}`;

      const lines = [
        { accountNumber: body.bankAccount,    accountName: bankAcct.name,    debit: amountEur, credit: 0,          description: desc },
        { accountNumber: body.counterAccount, accountName: counterAcct.name, debit: 0,          credit: amountEur, description: desc },
      ];

      const hash = gobdHash({ tenantId, entryNumber: entryNum, date: date.toISOString(), description: desc, lines, totalDebit: amountEur, totalCredit: amountEur });

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const [entry] = await JournalEntry.create([{
            tenantId, entryNumber: entryNum, date, description: desc,
            reference: payNum, status: 'posted', lines, totalDebit: amountEur,
            totalCredit: amountEur, periodId, fiscalYearId, gobdHash: hash,
            sourceType: 'Payment', createdBy: userId, postedAt: new Date(), postedBy: userId,
          }], { session });

          await Payment.create([{
            tenantId, paymentNumber: payNum, date,
            direction: 'incoming', amountCents: item.amountCents,
            bankAccount: body.bankAccount, bankAccountName: bankAcct.name,
            description: desc,
            allocations: [{ invoiceType: 'SalesInvoice', invoiceId: invoice._id, invoiceNumber: item.invoiceNumber, amountCents: item.amountCents }],
            journalEntryId: entry._id, createdBy: userId,
          }], { session });

          invoice.paidCents += item.amountCents;
          if (invoice.paidCents >= invoice.totalGrossCents) {
            invoice.status = 'paid';
            invoice.paidAt = date;
          }
          await invoice.save({ session });
        });
        created.push(item.invoiceNumber);
      } catch (err) {
        console.error('[Reconciliation] Failed for', item.invoiceNumber, err);
        failed.push(item.invoiceNumber);
      } finally {
        await session.endSession();
      }
    }

    res.json({ created: created.length, failed: failed.length, failedNumbers: failed });
  })
);

export default router;
