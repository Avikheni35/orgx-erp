import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { CompanySettings } from '../models/CompanySettings';
import { User } from '../models/User';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(requireAuth);

const settingsSchema = z.object({
  companyName:          z.string().optional(),
  legalForm:            z.string().optional(),
  address:              z.object({ street: z.string(), city: z.string(), zip: z.string(), country: z.string() }).optional(),
  vatId:                z.string().optional(),
  steuernummer:         z.string().optional(),
  hrNumber:             z.string().optional(),
  fiscalYearStart:      z.number().int().min(1).max(12).optional(),
  chartOfAccounts:      z.enum(['SKR03', 'SKR04']).optional(),
  vatPeriod:            z.enum(['monthly', 'quarterly']).optional(),
  invoicePrefix:        z.string().optional(),
  invoiceStartNumber:   z.number().int().min(1).optional(),
  invoiceDueDays:       z.number().int().min(0).optional(),
  invoiceTermsText:     z.string().optional(),
  datevBeraternummer:   z.string().optional(),
  datevMandantennummer: z.string().optional(),
  mileageRateCents:           z.number().int().optional(),
  poApprovalThresholdCents:   z.number().int().optional(),
  salesMode:                  z.enum(['invoice', 'pos']).optional(),
  featureFlags: z.object({
    enableFixedAssets:       z.boolean().optional(),
    enableAccruals:          z.boolean().optional(),
    enableDirectDebit:       z.boolean().optional(),
    enableElster:            z.boolean().optional(),
    enableCostCenters:       z.boolean().optional(),
    costCenterRequired:      z.boolean().optional(),
    enableInventory:         z.boolean().optional(),
    gobdAuditLog:            z.boolean().optional(),
    dunningEnabled:          z.boolean().optional(),
    bookingApprovalWorkflow: z.boolean().optional(),
    taxAdvisorAccess:        z.boolean().optional(),
    periodLockPolicy:        z.enum(['manual','auto-monthly']).optional(),
    multiCurrency:           z.boolean().optional(),
  }).optional(),
});

// GET /api/settings/company
router.get('/company', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant context required', 400);
  const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
  if (!settings) {
    return res.json({ configured: false, settings: null });
  }
  res.json({ configured: true, settings });
}));

// PATCH /api/settings/company
router.patch(
  '/company',
  requireRole('erp_admin', 'super_admin'),
  validate(settingsSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant context required', 400);

    const { featureFlags, ...rest } = req.body as Record<string, unknown> & { featureFlags?: Record<string, unknown> };
    const setPayload: Record<string, unknown> = { ...rest };
    if (featureFlags) {
      for (const [k, v] of Object.entries(featureFlags)) {
        setPayload[`featureFlags.${k}`] = v;
      }
    }
    const settings = await CompanySettings.findOneAndUpdate(
      { tenantId: req.tenantId },
      { $set: setPayload },
      { new: true, upsert: true }
    );

    await logAudit({ req, action: 'company_settings.update', targetType: 'CompanySettings', targetId: settings._id, targetName: settings.companyName });

    res.json(settings);
  })
);

// ─── User Management (erp_admin only) ────────────────────────────────────────

const ERP_ROLES = ['erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee', 'erp_tax_advisor'] as const;

const createUserSchema = z.object({
  email:     z.string().email(),
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
  role:      z.enum(ERP_ROLES),
  password:  z.string().min(8),
});

// GET /api/settings/users
router.get('/users',
  requireRole('erp_admin', 'agency_admin'),
  asyncHandler(async (req, res) => {
    const users = await User.find({ tenantId: req.tenantId, role: { $in: ERP_ROLES } })
      .select('-passwordHash -refreshTokenHashes -passwordResetTokenHash -inviteTokenHash -emailOtpHash')
      .sort({ lastName: 1, firstName: 1 })
      .lean();
    res.json({ users });
  })
);

// POST /api/settings/users — create ERP user (no email invite, direct password)
router.post('/users',
  requireRole('erp_admin', 'agency_admin'),
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const { email, firstName, lastName, role, password } = req.body as z.infer<typeof createUserSchema>;
    const existing = await User.findOne({ email: email.toLowerCase(), tenantId: req.tenantId });
    if (existing) throw new AppError('E-Mail bereits vergeben', 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      tenantId:      req.tenantId,
      email:         email.toLowerCase(),
      firstName,
      lastName,
      role,
      passwordHash,
      status:        'active',
      emailVerified: true,
    });

    await logAudit({ req, action: 'user.create', targetType: 'User', targetId: user._id, targetName: `${firstName} ${lastName}` });

    const { passwordHash: _ph, refreshTokenHashes: _rt, ...safeUser } = user.toObject();
    res.status(201).json(safeUser);
  })
);

// PATCH /api/settings/users/:id/status — activate / deactivate
router.patch('/users/:id/status',
  requireRole('erp_admin', 'agency_admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!user) throw new AppError('User not found', 404);
    if (user._id.toString() === req.user!.userId) throw new AppError('Cannot deactivate yourself', 400);
    user.status = user.status === 'active' ? 'inactive' : 'active';
    await user.save();
    await logAudit({ req, action: 'user.status_toggle', targetType: 'User', targetId: user._id, targetName: `${user.firstName} ${user.lastName}` });
    res.json({ status: user.status });
  })
);

// DELETE /api/settings/users/:id
router.delete('/users/:id',
  requireRole('erp_admin', 'agency_admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!user) throw new AppError('User not found', 404);
    if (user._id.toString() === req.user!.userId) throw new AppError('Cannot delete yourself', 400);
    await user.deleteOne();
    await logAudit({ req, action: 'user.delete', targetType: 'User', targetId: user._id, targetName: `${user.firstName} ${user.lastName}` });
    res.json({ message: 'Deleted' });
  })
);

export default router;
