import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { Account } from '../models/Account';
import { CompanySettings } from '../models/CompanySettings';
import { SKR03, SKR04 } from '../data/skr03';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  number:       z.string().min(1).max(10),
  name:         z.string().min(1).max(200),
  type:         z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  subtype:      z.string().optional(),
  taxCode:      z.string().optional(),
  parentNumber: z.string().optional(),
  notes:        z.string().optional(),
});

// GET /api/accounts
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { type, search, active } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (type)   filter.type = type;
  if (active !== undefined) filter.isActive = active !== 'false';
  if (search) filter.$or = [
    { number: { $regex: search, $options: 'i' } },
    { name:   { $regex: search, $options: 'i' } },
  ];

  const accounts = await Account.find(filter).sort({ number: 1 }).lean();
  res.json({ accounts, total: accounts.length });
}));

// GET /api/accounts/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const account = await Account.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!account) throw new AppError('Account not found', 404);
  res.json(account);
}));

// POST /api/accounts
router.post(
  '/',
  requireRole('erp_admin', 'erp_accountant', 'super_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const exists = await Account.findOne({ tenantId: req.tenantId, number: req.body.number });
    if (exists) throw new AppError(`Konto ${req.body.number} existiert bereits`, 409);

    const account = await Account.create({ tenantId: req.tenantId, ...req.body });
    await logAudit({ req, action: 'account.create', targetType: 'Account', targetId: account._id, targetName: `${account.number} ${account.name}` });
    res.status(201).json(account);
  })
);

// PATCH /api/accounts/:id
router.patch(
  '/:id',
  requireRole('erp_admin', 'erp_accountant', 'super_admin'),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const account = await Account.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!account) throw new AppError('Account not found', 404);
    if (account.isLocked) throw new AppError('Konto ist gesperrt und kann nicht bearbeitet werden', 400);

    // Block number change if any journal entries exist (Phase 4 will enforce this)
    const allowed = ['name', 'subtype', 'taxCode', 'parentNumber', 'notes'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) (account as unknown as Record<string, unknown>)[key] = req.body[key];
    }
    await account.save();
    await logAudit({ req, action: 'account.update', targetType: 'Account', targetId: account._id, targetName: `${account.number} ${account.name}` });
    res.json(account);
  })
);

// POST /api/accounts/:id/deactivate
router.post('/:id/deactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const account = await Account.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: false },
    { new: true }
  );
  if (!account) throw new AppError('Account not found', 404);
  res.json(account);
}));

// POST /api/accounts/:id/reactivate
router.post('/:id/reactivate', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const account = await Account.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId },
    { isActive: true },
    { new: true }
  );
  if (!account) throw new AppError('Account not found', 404);
  res.json(account);
}));

// POST /api/accounts/import-standard
router.post('/import-standard', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);

  // Determine which chart from company settings
  const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
  const chart = (req.body.chart as string) || settings?.chartOfAccounts || 'SKR03';
  const accounts = chart === 'SKR04' ? SKR04 : SKR03;

  let created = 0;
  let skipped = 0;
  for (const a of accounts) {
    const exists = await Account.findOne({ tenantId: req.tenantId, number: a.number }).lean();
    if (exists) { skipped++; continue; }
    await Account.create({ tenantId: req.tenantId, ...a, isActive: true, isLocked: false });
    created++;
  }

  await logAudit({ req, action: 'account.import_standard', targetType: 'Account', targetName: chart, details: { created, skipped, chart } });
  res.json({ message: `${chart} importiert: ${created} erstellt, ${skipped} übersprungen.`, created, skipped });
}));

// GET /api/accounts/export/csv
router.get('/export/csv', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const accounts = await Account.find({ tenantId: req.tenantId }).sort({ number: 1 }).lean();

  const header = 'Kontonummer;Kontoname;Typ;Untertyp;Steuercode;Aktiv\n';
  const rows = accounts.map((a) =>
    `${a.number};${a.name};${a.type};${a.subtype ?? ''};${a.taxCode ?? ''};${a.isActive ? 'Ja' : 'Nein'}`
  ).join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="kontenplan.csv"');
  res.send('﻿' + header + rows); // BOM for Excel
}));

export default router;
