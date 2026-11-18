import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { nextSeq } from '../models/Counter';
import { Employee } from '../models/Employee';

const router = Router();
router.use(requireAuth);

const TAX_CLASSES = ['1', '2', '3', '4', '5', '6'] as const;

const createSchema = z.object({
  firstName:         z.string().min(1).max(100),
  lastName:          z.string().min(1).max(100),
  dateOfBirth:       z.string().optional(),
  email:             z.string().email().or(z.literal('')).default(''),
  phone:             z.string().default(''),
  address:           z.string().default(''),
  department:        z.string().default(''),
  position:          z.string().default(''),
  startDate:         z.string().refine(d => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  endDate:           z.string().optional(),
  salaryType:        z.enum(['monthly', 'hourly']).default('monthly'),
  salaryCents:       z.number().int().min(0).default(0),
  taxClass:          z.enum(TAX_CLASSES).default('1'),
  healthInsurance:   z.string().default(''),
  steuerIdEncrypted: z.string().default(''),
  svNummerEncrypted: z.string().default(''),
  ibanEncrypted:     z.string().default(''),
  personnelAccount:  z.string().default('4120'),
  costCenterNumber:  z.string().default(''),
  notes:             z.string().default(''),
});

const updateSchema = createSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'terminated']).optional(),
});

// GET /employees
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, department, q: search } = req.query as Record<string, string>;
  const query: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     query.status     = status;
  if (department) query.department = department;
  if (search) {
    const re = new RegExp(search, 'i');
    query.$or = [{ firstName: re }, { lastName: re }, { email: re }, { employeeNumber: re }, { department: re }];
  }

  const employees = await Employee.find(query)
    .sort({ lastName: 1, firstName: 1 })
    .select('-steuerIdEncrypted -svNummerEncrypted -ibanEncrypted');

  // Unique departments for filter
  const departments = await Employee.distinct('department', { tenantId: req.tenantId, department: { $ne: '' } });

  res.json({ employees, departments });
}));

// POST /employees
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof createSchema>;
  const tenantId = String(req.tenantId);

  const seq    = await nextSeq(tenantId, 'employee');
  const empNum = `MA-${String(seq).padStart(4, '0')}`;

  const emp = await Employee.create({
    tenantId:          req.tenantId,
    employeeNumber:    empNum,
    firstName:         body.firstName,
    lastName:          body.lastName,
    dateOfBirth:       body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
    email:             body.email,
    phone:             body.phone,
    address:           body.address,
    department:        body.department,
    position:          body.position,
    startDate:         new Date(body.startDate),
    endDate:           body.endDate ? new Date(body.endDate) : undefined,
    status:            'active',
    salaryType:        body.salaryType,
    salaryCents:       body.salaryCents,
    taxClass:          body.taxClass,
    healthInsurance:   body.healthInsurance,
    steuerIdEncrypted: body.steuerIdEncrypted,
    svNummerEncrypted: body.svNummerEncrypted,
    ibanEncrypted:     body.ibanEncrypted,
    personnelAccount:  body.personnelAccount,
    costCenterNumber:  body.costCenterNumber,
    notes:             body.notes,
    createdBy:         req.user?.userId,
  });

  res.status(201).json(emp);
}));

// GET /employees/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const emp = await Employee.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!emp) throw new AppError('Mitarbeiter nicht gefunden.', 404);
  res.json(emp);
}));

// PATCH /employees/:id
router.patch('/:id', requireRole('erp_admin', 'erp_accountant'), validate(updateSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof updateSchema>;
  const emp  = await Employee.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!emp) throw new AppError('Mitarbeiter nicht gefunden.', 404);

  const strFields = ['firstName','lastName','email','phone','address','department','position',
    'salaryType','taxClass','healthInsurance','steuerIdEncrypted','svNummerEncrypted',
    'ibanEncrypted','personnelAccount','costCenterNumber','notes','status'] as const;
  for (const k of strFields) {
    if (body[k] !== undefined) (emp as unknown as Record<string, unknown>)[k] = body[k];
  }
  if (body.salaryCents !== undefined) emp.salaryCents = body.salaryCents;
  if (body.startDate   !== undefined) emp.startDate   = new Date(body.startDate);
  if (body.endDate     !== undefined) emp.endDate     = new Date(body.endDate);
  if (body.dateOfBirth !== undefined) emp.dateOfBirth = new Date(body.dateOfBirth);

  await emp.save();
  res.json(emp);
}));

export default router;
