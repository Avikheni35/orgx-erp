import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { FixedAsset } from '../models/FixedAsset';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';
import { CompanySettings } from '../models/CompanySettings';
import { htmlToPdf, buildAssetRegisterHtml } from '../utils/pdf';

const router = Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resolveAccountName(tenantId: string, number: string): Promise<string> {
  const acct = await Account.findOne({ tenantId, number }, { name: 1 });
  return acct?.name ?? number;
}

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({ tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const createSchema = z.object({
  name:                       z.string().min(1).max(200),
  category:                   z.string().default(''),
  description:                z.string().default(''),
  acquisitionDate:            z.string().refine(d => !isNaN(Date.parse(d))),
  acquisitionCostCents:       z.number().int().min(1),
  residualValueCents:         z.number().int().min(0).default(0),
  usefulLifeMonths:           z.number().int().min(1),
  depreciationMethod:         z.enum(['linear', 'none']).default('linear'),
  assetAccount:               z.string().min(1),
  depreciationExpenseAccount: z.string().min(1),
  accumulatedDepAccount:      z.string().min(1),
});

const depRunSchema = z.object({
  year:  z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

// ── GET /assets ───────────────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, category } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)   q.status   = status;
  if (category) q.category = category;
  const assets = await FixedAsset.find(q).sort({ assetNumber: 1 });
  res.json({ assets });
}));

// ── POST /assets ──────────────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);

  // Validate accounts exist
  for (const num of [body.assetAccount, body.depreciationExpenseAccount, body.accumulatedDepAccount]) {
    const acct = await Account.findOne({ tenantId: req.tenantId, number: num, isActive: true });
    if (!acct) throw new AppError(`Konto ${num} nicht gefunden oder inaktiv.`, 400);
  }

  const depreciable = body.acquisitionCostCents - body.residualValueCents;
  const monthly     = body.depreciationMethod === 'linear'
    ? Math.round(depreciable / body.usefulLifeMonths)
    : 0;

  const seq = await nextSeq(tenantId, 'asset');
  const assetNumber = `AV-${String(seq).padStart(6, '0')}`;

  const asset = await FixedAsset.create({
    tenantId:                    req.tenantId,
    assetNumber,
    name:                        body.name,
    category:                    body.category,
    description:                 body.description,
    acquisitionDate:             new Date(body.acquisitionDate),
    acquisitionCostCents:        body.acquisitionCostCents,
    residualValueCents:          body.residualValueCents,
    usefulLifeMonths:            body.usefulLifeMonths,
    depreciationMethod:          body.depreciationMethod,
    assetAccount:                body.assetAccount,
    depreciationExpenseAccount:  body.depreciationExpenseAccount,
    accumulatedDepAccount:       body.accumulatedDepAccount,
    monthlyDepreciationCents:    monthly,
    accumulatedDepreciationCents:0,
    status:                      'active',
    createdBy:                   req.user?.userId,
  });

  res.status(201).json(asset);
}));

// ── GET /assets/pdf — Export asset register as PDF ────────────────────────────
router.get('/pdf', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { status, category } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)   q.status   = status;
  if (category) q.category = category;
  const [assets, settings] = await Promise.all([
    FixedAsset.find(q).sort({ assetNumber: 1 }),
    CompanySettings.findOne({ tenantId: req.tenantId }),
  ]);
  const companyName = settings?.companyName || 'Unternehmen';
  const fmt = (cents: number) => (cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: Date) => new Date(d).toLocaleDateString('de-DE');
  const statusLabel: Record<string, string> = { active: 'Aktiv', fully_depreciated: 'Abgeschrieben', disposed: 'Abgegangen' };
  const methodLabel: Record<string, string> = { linear: 'Linear', none: 'Keine' };
  const rows = assets.map(a => ({
    assetNumber: a.assetNumber,
    name: a.name,
    category: a.category,
    acquisitionDate: fmtDate(a.acquisitionDate),
    acquisitionCost: fmt(a.acquisitionCostCents),
    residualValue: fmt(a.residualValueCents),
    usefulLifeMonths: a.usefulLifeMonths,
    depreciationMethod: methodLabel[a.depreciationMethod] ?? a.depreciationMethod,
    accumulatedDepreciation: fmt(a.accumulatedDepreciationCents),
    bookValue: fmt(a.acquisitionCostCents - a.accumulatedDepreciationCents),
    status: statusLabel[a.status] ?? a.status,
  }));
  const generatedAt = new Date().toLocaleString('de-DE');
  const html = buildAssetRegisterHtml(companyName, rows, generatedAt);
  const pdf  = await htmlToPdf(html);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="Anlagenregister_${new Date().toISOString().slice(0,10)}.pdf"`,
  });
  res.send(pdf);
}));

// ── GET /assets/:id ───────────────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const asset = await FixedAsset.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!asset) throw new AppError('Anlage nicht gefunden.', 404);

  // Linked depreciation journal entries
  const depEntries = await JournalEntry.find({
    tenantId:   req.tenantId,
    sourceType: 'Payment',
    reference:  { $regex: `^AfA-${asset.assetNumber}` },
  }).sort({ date: 1 }).select('entryNumber date description totalDebit');

  res.json({ asset, depEntries });
}));

// ── PATCH /assets/:id ─────────────────────────────────────────────────────────
router.patch('/:id', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const asset = await FixedAsset.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!asset) throw new AppError('Anlage nicht gefunden.', 404);
  if (asset.status === 'disposed') throw new AppError('Abgegangene Anlage kann nicht geändert werden.', 400);

  if (req.body.name        !== undefined) asset.name        = req.body.name;
  if (req.body.category    !== undefined) asset.category    = req.body.category;
  if (req.body.description !== undefined) asset.description = req.body.description;
  await asset.save();
  res.json(asset);
}));

// ── POST /assets/:id/dispose ──────────────────────────────────────────────────
router.post('/:id/dispose', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const asset = await FixedAsset.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!asset) throw new AppError('Anlage nicht gefunden.', 404);
  if (asset.status === 'disposed') throw new AppError('Anlage bereits abgegangen.', 400);

  const { disposalDate, proceedsCents = 0 } = req.body as { disposalDate?: string; proceedsCents?: number };
  const tenantId  = String(req.tenantId);
  const date      = disposalDate ? new Date(disposalDate) : new Date();
  const bookValue = asset.acquisitionCostCents - asset.accumulatedDepreciationCents;

  // Journal entry for disposal
  const assetName  = asset.name;
  const acctName   = await resolveAccountName(tenantId, asset.assetAccount);
  const accDepName = await resolveAccountName(tenantId, asset.accumulatedDepAccount);

  const lines: { accountNumber: string; accountName: string; debit: number; credit: number; description: string }[] = [];

  // Remove asset at cost
  lines.push({ accountNumber: asset.assetAccount,       accountName: acctName,   debit: 0,                            credit: asset.acquisitionCostCents / 100, description: `Abgang ${assetName}` });
  // Remove accumulated depreciation
  lines.push({ accountNumber: asset.accumulatedDepAccount, accountName: accDepName, debit: asset.accumulatedDepreciationCents / 100, credit: 0,                                description: `Abgang kumulierte AfA ${assetName}` });

  // Proceeds (if any) — credit a revenue account or bank
  if (proceedsCents > 0) {
    const bankName = await resolveAccountName(tenantId, '1200');
    lines.push({ accountNumber: '1200', accountName: bankName, debit: proceedsCents / 100, credit: 0, description: `Verkaufserlös ${assetName}` });
  }

  // Gain/loss on disposal
  const gain = proceedsCents - bookValue;
  if (gain > 0) {
    const gainName = await resolveAccountName(tenantId, '2650');
    lines.push({ accountNumber: '2650', accountName: gainName, debit: 0, credit: gain / 100, description: `Buchgewinn Anlagenabgang ${assetName}` });
  } else if (gain < 0) {
    const lossName = await resolveAccountName(tenantId, '6855');
    lines.push({ accountNumber: '6855', accountName: lossName, debit: Math.abs(gain) / 100, credit: 0, description: `Buchverlust Anlagenabgang ${assetName}` });
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    // Add rounding correction
    lines.push({ accountNumber: '2399', accountName: 'Rundungsdifferenzen', debit: totalCredit - totalDebit > 0 ? totalCredit - totalDebit : 0, credit: totalDebit - totalCredit > 0 ? totalDebit - totalCredit : 0, description: 'Rundung' });
  }

  // Guard: reject if the accounting period is closed or locked
  const disposePeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: date }, endDate: { $gte: date } });
  if (disposePeriod && disposePeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${disposePeriod.name}" ist ${disposePeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Abgangsdatum anpassen.`, 422);
  }
  if (disposePeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(disposePeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);
  const seq    = await nextSeq(tenantId, 'journal');
  const buNum  = `BU-${String(seq).padStart(6, '0')}`;
  const hash   = gobdHash({ tenantId, entryNumber: buNum, date: date.toISOString(), description: `Anlagenabgang ${assetName}`, lines, totalDebit, totalCredit });

  await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: buNum,
    date,
    description: `Anlagenabgang ${assetName}`,
    reference:   asset.assetNumber,
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'Payment',
    createdBy:   req.user?.userId,
    postedAt:    new Date(),
    postedBy:    req.user?.userId,
  });

  asset.status              = 'disposed';
  asset.disposedAt          = date;
  asset.disposalProceedsCents = proceedsCents;
  await asset.save();

  res.json(asset);
}));

// ── POST /assets/depreciation-run ────────────────────────────────────────────
router.post('/depreciation-run', requireRole('erp_admin', 'erp_accountant'), validate(depRunSchema), asyncHandler(async (req, res) => {
  const { year, month } = req.body as z.infer<typeof depRunSchema>;
  const tenantId = String(req.tenantId);

  // Target: last day of the selected month
  const targetDate = new Date(year, month - 1, 1); // first of month for comparison
  const postDate   = new Date(year, month, 0);      // last day of month for journal date

  // Active assets that have not yet been depreciated for this month
  const assets = await FixedAsset.find({
    tenantId:    req.tenantId,
    status:      'active',
    depreciationMethod: 'linear',
  });

  const eligible = assets.filter(a => {
    if (a.monthlyDepreciationCents === 0) return false;
    // Only depreciate if acquisition date is before or within this month
    if (a.acquisitionDate > postDate) return false;
    // Already depreciated this month?
    if (a.lastDepreciationDate) {
      const ld = a.lastDepreciationDate;
      if (ld.getFullYear() === year && ld.getMonth() + 1 === month) return false;
    }
    return true;
  });

  if (eligible.length === 0) {
    res.json({ posted: 0, message: 'Keine abschreibungspflichtigen Anlagen für diesen Monat.' });
    return;
  }

  // Guard: reject if the accounting period is closed or locked
  const depRunPeriod = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: postDate }, endDate: { $gte: postDate } });
  if (depRunPeriod && depRunPeriod.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${depRunPeriod.name}" ist ${depRunPeriod.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (depRunPeriod?.fiscalYearId) {
    const fy = await FiscalYear.findById(depRunPeriod.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, postDate);

  let posted = 0;
  const results: { assetNumber: string; name: string; amountCents: number }[] = [];

  for (const asset of eligible) {
    const remaining  = asset.acquisitionCostCents - asset.residualValueCents - asset.accumulatedDepreciationCents;
    if (remaining <= 0) {
      asset.status = 'fully_depreciated';
      await asset.save();
      continue;
    }

    const depCents  = Math.min(asset.monthlyDepreciationCents, remaining);
    const depEur    = depCents / 100;

    const expAcctName = await resolveAccountName(tenantId, asset.depreciationExpenseAccount);
    const accDepName  = await resolveAccountName(tenantId, asset.accumulatedDepAccount);

    const lines = [
      { accountNumber: asset.depreciationExpenseAccount, accountName: expAcctName, debit: depEur, credit: 0,       description: `AfA ${asset.name} ${month}/${year}` },
      { accountNumber: asset.accumulatedDepAccount,       accountName: accDepName,  debit: 0,       credit: depEur, description: `AfA ${asset.name} ${month}/${year}` },
    ];

    const seq   = await nextSeq(tenantId, 'journal');
    const buNum = `BU-${String(seq).padStart(6, '0')}`;
    const hash  = gobdHash({ tenantId, entryNumber: buNum, date: postDate.toISOString(), description: `AfA ${asset.name}`, lines, totalDebit: depEur, totalCredit: depEur });

    await JournalEntry.create({
      tenantId:    req.tenantId,
      entryNumber: buNum,
      date:        postDate,
      description: `Abschreibung ${asset.name} ${month}/${year}`,
      reference:   `AfA-${asset.assetNumber}-${year}-${String(month).padStart(2,'0')}`,
      status:      'posted',
      lines,
      totalDebit:  depEur,
      totalCredit: depEur,
      periodId,
      fiscalYearId,
      gobdHash:    hash,
      sourceType:  'Payment',
      createdBy:   req.user?.userId,
      postedAt:    new Date(),
      postedBy:    req.user?.userId,
    });

    asset.accumulatedDepreciationCents += depCents;
    asset.lastDepreciationDate          = postDate;
    if (asset.accumulatedDepreciationCents >= asset.acquisitionCostCents - asset.residualValueCents) {
      asset.status = 'fully_depreciated';
    }
    await asset.save();

    results.push({ assetNumber: asset.assetNumber, name: asset.name, amountCents: depCents });
    posted++;
  }

  res.json({ posted, results, period: `${String(month).padStart(2,'0')}/${year}` });
}));

export default router;
