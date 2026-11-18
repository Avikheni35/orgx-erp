import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { CostCenter } from '../models/CostCenter';
import { JournalEntry } from '../models/JournalEntry';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  number:            z.string().min(1).max(20),
  name:              z.string().min(1).max(200),
  description:       z.string().default(''),
  annualBudgetCents: z.number().int().min(0).default(0),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// GET /costcenters
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { active } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };
  if (active !== undefined) q.isActive = active !== 'false';
  const centers = await CostCenter.find(q).sort({ number: 1 });
  res.json({ costCenters: centers });
}));

// POST /costcenters
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;

  const existing = await CostCenter.findOne({ tenantId: req.tenantId, number: body.number });
  if (existing) throw new AppError(`Kostenstelle ${body.number} existiert bereits.`, 409);

  const cc = await CostCenter.create({
    tenantId:          req.tenantId,
    number:            body.number,
    name:              body.name,
    description:       body.description,
    annualBudgetCents: body.annualBudgetCents,
    isActive:          true,
    createdBy:         req.user?.userId,
  });
  res.status(201).json(cc);
}));

// GET /costcenters/variance?from=&to=
router.get('/variance', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { from, to } = req.query as Record<string, string>;

  const dateFilter: Record<string, Date> = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to)   dateFilter.$lte = new Date(to + 'T23:59:59.999Z');

  const centers = await CostCenter.find({ tenantId: req.tenantId }).sort({ number: 1 }).lean();

  const matchStage: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  if (from || to) matchStage.date = dateFilter;

  const agg = await JournalEntry.aggregate([
    { $match: matchStage },
    { $unwind: '$lines' },
    { $match: { 'lines.costCenter': { $exists: true, $ne: '' } } },
    { $group: {
      _id:         '$lines.costCenter',
      actualDebit:  { $sum: '$lines.debit' },
      actualCredit: { $sum: '$lines.credit' },
    }},
  ]);

  const actualMap = new Map(agg.map((r: { _id: string; actualDebit: number; actualCredit: number }) => [r._id, r]));

  const lines = centers.map(cc => {
    const actual = actualMap.get(cc.number);
    const actualDebitCents  = Math.round((actual?.actualDebit  ?? 0) * 100);
    const actualCreditCents = Math.round((actual?.actualCredit ?? 0) * 100);
    const actualSpendCents  = actualDebitCents - actualCreditCents;
    const budgetCents       = cc.annualBudgetCents;
    const varianceCents     = budgetCents - actualSpendCents;
    const usedPct           = budgetCents > 0 ? Math.round((actualSpendCents / budgetCents) * 100) : null;
    return { costCenter: cc, actualDebitCents, actualCreditCents, actualSpendCents, budgetCents, varianceCents, usedPct };
  });

  res.json({ lines, from: from ?? null, to: to ?? null });
}));

// GET /costcenters/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const cc = await CostCenter.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!cc) throw new AppError('Kostenstelle nicht gefunden.', 404);

  // Aggregate actual costs: journal lines tagged with this cost center number
  const agg = await JournalEntry.aggregate([
    { $match: { tenantId: req.tenantId, status: 'posted', 'lines.costCenter': cc.number } },
    { $unwind: '$lines' },
    { $match: { 'lines.costCenter': cc.number } },
    { $group: {
      _id: null,
      totalDebitEur:  { $sum: '$lines.debit' },
      totalCreditEur: { $sum: '$lines.credit' },
    }},
  ]);

  const actualDebitCents  = Math.round((agg[0]?.totalDebitEur  ?? 0) * 100);
  const actualCreditCents = Math.round((agg[0]?.totalCreditEur ?? 0) * 100);

  // Recent journal lines for this cost center (last 50)
  const recentEntries = await JournalEntry.aggregate([
    { $match: { tenantId: req.tenantId, status: 'posted', 'lines.costCenter': cc.number } },
    { $sort: { date: -1 } },
    { $limit: 50 },
    { $project: { entryNumber: 1, date: 1, description: 1, lines: 1 } },
  ]);

  res.json({ costCenter: cc, actualDebitCents, actualCreditCents, recentEntries });
}));

// PATCH /costcenters/:id
router.patch('/:id', requireRole('erp_admin', 'erp_accountant'), validate(updateSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof updateSchema>;
  const cc = await CostCenter.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!cc) throw new AppError('Kostenstelle nicht gefunden.', 404);

  if (body.name              !== undefined) cc.name              = body.name;
  if (body.description       !== undefined) cc.description       = body.description;
  if (body.annualBudgetCents !== undefined) cc.annualBudgetCents = body.annualBudgetCents;
  if (body.isActive          !== undefined) cc.isActive          = body.isActive;

  // number change: check uniqueness
  if (body.number && body.number !== cc.number) {
    const dup = await CostCenter.findOne({ tenantId: req.tenantId, number: body.number, _id: { $ne: cc._id } });
    if (dup) throw new AppError(`Kostenstelle ${body.number} existiert bereits.`, 409);
    cc.number = body.number;
  }

  await cc.save();
  res.json(cc);
}));

export default router;
