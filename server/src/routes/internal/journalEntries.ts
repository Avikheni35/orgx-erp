import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { gobdHash } from '../../utils/crypto';
import { nextSeq } from '../../models/Counter';
import { JournalEntry } from '../../models/JournalEntry';
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
  const period = await Period.findOne({
    tenantId,
    startDate: { $lte: date },
    endDate:   { $gte: date },
  });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.internalTenantId!;
    const {
      debitAccount,
      creditAccount,
      amountCents,
      description,
      postingDate,
      sourceRef,
      syncId,
      sourceSnapshot,
    } = req.body as {
      debitAccount:    number;
      creditAccount:   number;
      amountCents:     number;
      description:     string;
      postingDate:     string;
      sourceRef?:      { module: string; type: string; id: string };
      syncId?:         string;
      sourceSnapshot?: { m2RefId: string; description: string; source: 'm2' };
    };

    // Idempotency — if this syncId was already posted, return the existing entry
    if (syncId) {
      const existing = await JournalEntry.findOne({ syncId }).lean();
      if (existing) { res.json({ id: existing._id, duplicate: true }); return; }
    }

    const date = new Date(postingDate);
    const debitStr  = String(debitAccount);
    const creditStr = String(creditAccount);
    const amountEur = amountCents / 100;

    const [debitName, creditName] = await Promise.all([
      resolveAccountName(tenantId, debitStr),
      resolveAccountName(tenantId, creditStr),
    ]);
    const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);

    const seq = await nextSeq(tenantId, 'journal');
    const entryNumber = `INT-${String(seq).padStart(6, '0')}`;

    const lines = [
      { accountNumber: debitStr,  accountName: debitName,  debit: amountEur, credit: 0 },
      { accountNumber: creditStr, accountName: creditName, debit: 0, credit: amountEur },
    ];

    const hashData = { tenantId, entryNumber, date: postingDate, debitAccount, creditAccount, amountCents };
    const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

    const entry = await JournalEntry.create({
      tenantId:    new mongoose.Types.ObjectId(tenantId),
      entryNumber,
      date,
      description: description || `Auto-posting from ${req.callerModule ?? 'unknown'}`,
      reference:   sourceRef ? `${sourceRef.module}:${sourceRef.type}:${sourceRef.id}` : '',
      status:      'posted',
      lines,
      totalDebit:  amountEur,
      totalCredit: amountEur,
      periodId,
      fiscalYearId,
      gobdHash:    gobdHash(hashData),
      sourceType:  sourceRef?.type === 'M2Payment' ? 'M2Payment' : 'SalesInvoice',
      createdBy:   systemUserId,
      postedAt:    new Date(),
      postedBy:    systemUserId,
      ...(syncId && { syncId, source: 'm2' }),
      ...(sourceSnapshot && { sourceSnapshot }),
    });

    res.status(201).json({ id: entry._id });
  })
);

export default router;
