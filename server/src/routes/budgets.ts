import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { Budget } from '../models/Budget';
import { FiscalYear } from '../models/FiscalYear';
import { JournalEntry } from '../models/JournalEntry';
import { CostCenter } from '../models/CostCenter';

const router = Router();
router.use(requireAuth);

const upsertSchema = z.object({
  fiscalYearId:  z.string().min(1),
  name:          z.string().min(1).max(200),
  accountNumber: z.string().min(1).max(20),
  costCenterId:  z.string().optional(),
  budgetCents:   z.number().int().min(0),
  period:        z.enum(['annual', 'monthly']).default('annual'),
  note:          z.string().default(''),
});

// GET /budgets?fiscalYearId=...
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { fiscalYearId } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (fiscalYearId) filter.fiscalYearId = fiscalYearId;
  const budgets = await Budget.find(filter).sort({ accountNumber: 1, name: 1 }).lean();
  res.json({ budgets });
}));

// POST /budgets
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(upsertSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof upsertSchema>;
  const fy = await FiscalYear.findOne({ _id: body.fiscalYearId, tenantId: req.tenantId }).lean();
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);
  const budget = await Budget.create({ ...body, tenantId: req.tenantId, createdBy: req.user?.userId });
  res.status(201).json(budget);
}));

// PUT /budgets/:id
router.put('/:id', requireRole('erp_admin', 'erp_accountant'), validate(upsertSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof upsertSchema>;
  const budget = await Budget.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { $set: body },
    { new: true }
  );
  if (!budget) throw new AppError('Budget nicht gefunden.', 404);
  res.json(budget);
}));

// DELETE /budgets/:id
router.delete('/:id', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const budget = await Budget.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
  if (!budget) throw new AppError('Budget nicht gefunden.', 404);
  res.json({ message: 'Gelöscht.' });
}));

// GET /budgets/variance?fiscalYearId=...
// Returns each budget line enriched with actual spending from JournalEntry
router.get('/variance', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { fiscalYearId } = req.query as Record<string, string>;
  if (!fiscalYearId) throw new AppError('fiscalYearId ist erforderlich.', 400);

  const fy = await FiscalYear.findOne({ _id: fiscalYearId, tenantId: req.tenantId }).lean();
  if (!fy) throw new AppError('Geschäftsjahr nicht gefunden.', 404);

  const budgets = await Budget.find({ tenantId: req.tenantId, fiscalYearId }).lean();
  if (budgets.length === 0) { res.json({ fiscalYear: fy, lines: [] }); return; }

  // Aggregate actuals from posted journal entries within the fiscal year date range
  const entries = await JournalEntry.find({
    tenantId: req.tenantId,
    date:     { $gte: fy.startDate, $lte: fy.endDate },
    status:   'posted',
  }).lean();

  // Sum debits per account (expenses increase on debit side)
  const actualByAccount: Record<string, number> = {};
  for (const entry of entries) {
    for (const line of entry.lines) {
      const acc = line.accountNumber;
      actualByAccount[acc] = (actualByAccount[acc] ?? 0) + (line.debit - line.credit);
    }
  }

  // Load cost centers for display
  const ccIds = budgets.filter(b => b.costCenterId).map(b => String(b.costCenterId));
  const costCenters = ccIds.length
    ? await CostCenter.find({ _id: { $in: ccIds }, tenantId: req.tenantId }).lean()
    : [];
  const ccMap: Record<string, string> = {};
  for (const cc of costCenters) ccMap[String(cc._id)] = cc.name;

  const lines = budgets.map(b => {
    const actualCents = Math.round((actualByAccount[b.accountNumber] ?? 0) * 100);
    const varianceCents = b.budgetCents - actualCents;
    return {
      _id:           String(b._id),
      name:          b.name,
      accountNumber: b.accountNumber,
      costCenterName: b.costCenterId ? (ccMap[String(b.costCenterId)] ?? '') : '',
      budgetCents:   b.budgetCents,
      actualCents,
      varianceCents,
      usedPct:       b.budgetCents > 0 ? Math.round((actualCents / b.budgetCents) * 100) : 0,
      note:          b.note,
    };
  });

  res.json({ fiscalYear: fy, lines });
}));

export default router;
