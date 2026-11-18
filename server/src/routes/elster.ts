import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { nextSeq } from '../models/Counter';
import { ElsterFiling } from '../models/ElsterFiling';
import { JournalEntry } from '../models/JournalEntry';

const router = Router();
router.use(requireAuth);

// Aggregate VAT data from journal for a given year/period
async function computeUvaData(tenantId: string, year: number, period: number, periodType: 'monthly' | 'quarterly') {
  let startMonth: number, endMonth: number;
  if (periodType === 'quarterly') {
    startMonth = (period - 1) * 3 + 1;
    endMonth   = startMonth + 2;
  } else {
    startMonth = period;
    endMonth   = period;
  }

  const startDate = new Date(year, startMonth - 1, 1);
  const endDate   = new Date(year, endMonth, 0, 23, 59, 59);

  const entries = await JournalEntry.find({
    tenantId,
    date:   { $gte: startDate, $lte: endDate },
    status: 'posted',
  }).lean();

  // Revenue accounts (SKR03): 8000 (0%), 8300 (7%), 8400 (19%)
  // VAT output (SKR03): 1775 (7%), 1776 (19%)
  // VAT input (SKR03): 1575 (7%), 1576 (19%)

  let taxableRevenue19 = 0, taxableRevenue7 = 0, taxableRevenue0 = 0;
  let outputTax19 = 0, outputTax7 = 0, inputTax = 0;

  for (const entry of entries) {
    for (const line of entry.lines) {
      const acc = line.accountNumber;
      const net = (line.credit - line.debit); // revenue = credit side
      switch (acc) {
        case '8400': taxableRevenue19 += Math.max(0, net); break;
        case '8300': taxableRevenue7  += Math.max(0, net); break;
        case '8000': taxableRevenue0  += Math.max(0, net); break;
        case '1776': outputTax19 += Math.max(0, line.credit - line.debit); break;
        case '1775': outputTax7  += Math.max(0, line.credit - line.debit); break;
        case '1576': inputTax    += Math.max(0, line.debit - line.credit); break;
        case '1575': inputTax    += Math.max(0, line.debit - line.credit); break;
      }
    }
  }

  const netTaxPayable = (outputTax19 + outputTax7) - inputTax;

  return {
    taxableRevenue19: Math.round(taxableRevenue19 * 100) / 100,
    taxableRevenue7:  Math.round(taxableRevenue7  * 100) / 100,
    taxableRevenue0:  Math.round(taxableRevenue0  * 100) / 100,
    outputTax19:      Math.round(outputTax19 * 100) / 100,
    outputTax7:       Math.round(outputTax7  * 100) / 100,
    inputTax:         Math.round(inputTax    * 100) / 100,
    netTaxPayable:    Math.round(netTaxPayable * 100) / 100,
  };
}

const createSchema = z.object({
  type:       z.enum(['uva', 'zm', 'lsz']).default('uva'),
  year:       z.number().int().min(2000).max(2100),
  period:     z.number().int().min(1).max(12),
  periodType: z.enum(['monthly', 'quarterly']).default('monthly'),
  notes:      z.string().default(''),
  // Allow manual override of computed values
  taxableRevenue19: z.number().optional(),
  taxableRevenue7:  z.number().optional(),
  taxableRevenue0:  z.number().optional(),
  outputTax19:      z.number().optional(),
  outputTax7:       z.number().optional(),
  inputTax:         z.number().optional(),
});

// GET /elster
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, year } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status) filter.status = status;
  if (year)   filter.year   = parseInt(year, 10);
  const filings = await ElsterFiling.find(filter).sort({ year: -1, period: -1 }).lean();
  res.json({ filings });
}));

// POST /elster — create with auto-computed UVA data
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body      = req.body as z.infer<typeof createSchema>;
  const tenantId  = String(req.tenantId);

  let uvaData = {
    taxableRevenue19: 0, taxableRevenue7: 0, taxableRevenue0: 0,
    outputTax19: 0, outputTax7: 0, inputTax: 0, netTaxPayable: 0,
  };

  if (body.type === 'uva') {
    uvaData = await computeUvaData(tenantId, body.year, body.period, body.periodType);
    // Manual overrides if provided
    if (body.taxableRevenue19 !== undefined) uvaData.taxableRevenue19 = body.taxableRevenue19;
    if (body.taxableRevenue7  !== undefined) uvaData.taxableRevenue7  = body.taxableRevenue7;
    if (body.taxableRevenue0  !== undefined) uvaData.taxableRevenue0  = body.taxableRevenue0;
    if (body.outputTax19      !== undefined) uvaData.outputTax19      = body.outputTax19;
    if (body.outputTax7       !== undefined) uvaData.outputTax7       = body.outputTax7;
    if (body.inputTax         !== undefined) uvaData.inputTax         = body.inputTax;
    uvaData.netTaxPayable = (uvaData.outputTax19 + uvaData.outputTax7) - uvaData.inputTax;
  }

  const seq   = await nextSeq(tenantId, 'elster_filing');
  const filingNumber = `ELT-${String(seq).padStart(6, '0')}`;

  const filing = await ElsterFiling.create({
    tenantId:    req.tenantId,
    filingNumber,
    type:        body.type,
    year:        body.year,
    period:      body.period,
    periodType:  body.periodType,
    ...uvaData,
    status:      'draft',
    notes:       body.notes,
    createdBy:   req.user?.userId,
  });
  res.status(201).json(filing);
}));

// GET /elster/compute — preview UVA data without creating
router.get('/compute', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const { year, period, periodType } = req.query as Record<string, string>;
  if (!year || !period) throw new AppError('year und period sind erforderlich.', 400);
  const data = await computeUvaData(String(req.tenantId), parseInt(year, 10), parseInt(period, 10), (periodType as 'monthly' | 'quarterly') || 'monthly');
  res.json(data);
}));

// GET /elster/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const filing = await ElsterFiling.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!filing) throw new AppError('Meldung nicht gefunden.', 404);
  res.json(filing);
}));

// POST /elster/:id/ready — mark as ready to submit
router.post('/:id/ready', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const filing = await ElsterFiling.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!filing) throw new AppError('Meldung nicht gefunden.', 404);
  if (filing.status !== 'draft') throw new AppError('Nur Entwürfe können freigegeben werden.', 400);
  filing.status = 'ready';
  await filing.save();
  res.json(filing);
}));

// POST /elster/:id/submit
router.post('/:id/submit', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const filing = await ElsterFiling.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!filing) throw new AppError('Meldung nicht gefunden.', 404);
  if (!['draft', 'ready'].includes(filing.status)) throw new AppError('Bereits eingereicht oder storniert.', 400);
  filing.status      = 'submitted';
  filing.submittedAt = new Date();
  await filing.save();
  res.json(filing);
}));

// PATCH /elster/:id/confirm
router.patch('/:id/confirm', requireRole('erp_admin', 'erp_accountant'),
  validate(z.object({ confirmationNumber: z.string().min(1) })),
  asyncHandler(async (req, res) => {
    const filing = await ElsterFiling.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!filing) throw new AppError('Meldung nicht gefunden.', 404);
    if (filing.status !== 'submitted') throw new AppError('Nur eingereichte Meldungen können bestätigt werden.', 400);
    filing.status             = 'confirmed';
    filing.confirmationNumber = req.body.confirmationNumber;
    await filing.save();
    res.json(filing);
  })
);

// PATCH /elster/:id/reject
router.patch('/:id/reject', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const filing = await ElsterFiling.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!filing) throw new AppError('Meldung nicht gefunden.', 404);
  if (filing.status !== 'submitted') throw new AppError('Nur eingereichte Meldungen können abgelehnt werden.', 400);
  filing.status = 'rejected';
  await filing.save();
  res.json(filing);
}));

export default router;
