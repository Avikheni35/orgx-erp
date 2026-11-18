import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { BankAccount } from '../models/BankAccount';

const router = Router();
router.use(requireAuth);

const bodySchema = z.object({
  accountName:   z.string().min(1).max(100),
  bankName:      z.string().default(''),
  iban:          z.string().min(15).max(34),
  bic:           z.string().default(''),
  accountHolder: z.string().default(''),
  currency:      z.string().default('EUR'),
  isDefault:     z.boolean().default(false),
  glAccount:     z.string().default('1200'),
  notes:         z.string().default(''),
});

// GET /bank-accounts
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { isActive } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (isActive !== undefined) filter.isActive = isActive !== 'false';
  else filter.isActive = true;
  const accounts = await BankAccount.find(filter).sort({ isDefault: -1, accountName: 1 }).lean();
  res.json({ accounts });
}));

// POST /bank-accounts
router.post('/', requireRole('erp_admin'), validate(bodySchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof bodySchema>;

  if (body.isDefault) {
    await BankAccount.updateMany({ tenantId: req.tenantId }, { $set: { isDefault: false } });
  }

  const account = await BankAccount.create({
    tenantId:      req.tenantId,
    accountName:   body.accountName,
    bankName:      body.bankName,
    iban:          body.iban.replace(/\s/g, '').toUpperCase(),
    bic:           body.bic.toUpperCase(),
    accountHolder: body.accountHolder,
    currency:      body.currency,
    isDefault:     body.isDefault,
    glAccount:     body.glAccount,
    notes:         body.notes,
    isActive:      true,
  });
  res.status(201).json(account);
}));

// GET /bank-accounts/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const account = await BankAccount.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!account) throw new AppError('Bankkonto nicht gefunden.', 404);
  res.json(account);
}));

// PATCH /bank-accounts/:id
router.patch('/:id', requireRole('erp_admin'), validate(bodySchema.partial()), asyncHandler(async (req, res) => {
  const body = req.body as Partial<z.infer<typeof bodySchema>>;
  const account = await BankAccount.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!account) throw new AppError('Bankkonto nicht gefunden.', 404);

  if (body.isDefault) {
    await BankAccount.updateMany(
      { tenantId: req.tenantId, _id: { $ne: account._id } },
      { $set: { isDefault: false } }
    );
  }

  if (body.iban)          account.iban          = body.iban.replace(/\s/g, '').toUpperCase();
  if (body.bic)           account.bic           = body.bic.toUpperCase();
  if (body.accountName)   account.accountName   = body.accountName;
  if (body.bankName      !== undefined) account.bankName      = body.bankName;
  if (body.accountHolder !== undefined) account.accountHolder = body.accountHolder;
  if (body.currency      !== undefined) account.currency      = body.currency;
  if (body.isDefault     !== undefined) account.isDefault     = body.isDefault;
  if (body.glAccount     !== undefined) account.glAccount     = body.glAccount;
  if (body.notes         !== undefined) account.notes         = body.notes;

  await account.save();
  res.json(account);
}));

// DELETE /bank-accounts/:id — soft delete
router.delete('/:id', requireRole('erp_admin'), asyncHandler(async (req, res) => {
  const account = await BankAccount.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!account) throw new AppError('Bankkonto nicht gefunden.', 404);
  if (account.isDefault) throw new AppError('Das Standardkonto kann nicht deaktiviert werden. Bitte zuerst ein anderes Konto als Standard festlegen.', 400);
  account.isActive = false;
  await account.save();
  res.json({ ok: true });
}));

export default router;
