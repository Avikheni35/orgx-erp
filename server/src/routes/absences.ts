import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { Absence } from '../models/Absence';
import { Employee } from '../models/Employee';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  employeeId: z.string().min(1),
  type:       z.enum(['vacation', 'sick', 'parental', 'unpaid', 'other']),
  startDate:  z.string().min(1),
  endDate:    z.string().min(1),
  days:       z.number().min(0.5),
  reason:     z.string().default(''),
  notes:      z.string().default(''),
});

// GET /absences
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { employeeId, status, type, year } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (employeeId) filter.employeeId = employeeId;
  if (status)     filter.status     = status;
  if (type)       filter.type       = type;
  if (year) {
    const y = parseInt(year, 10);
    filter.startDate = { $lte: new Date(y, 11, 31) };
    filter.endDate   = { $gte: new Date(y, 0, 1) };
  }
  const absences = await Absence.find(filter).sort({ startDate: -1 }).lean();
  res.json({ absences });
}));

// POST /absences
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const emp  = await Employee.findOne({ _id: body.employeeId, tenantId: req.tenantId }).lean();
  if (!emp) throw new AppError('Mitarbeiter nicht gefunden.', 404);

  const start = new Date(body.startDate);
  const end   = new Date(body.endDate);
  if (end < start) throw new AppError('Enddatum muss nach Startdatum liegen.', 400);

  const absence = await Absence.create({
    tenantId:     req.tenantId,
    employeeId:   emp._id,
    employeeName: `${emp.firstName} ${emp.lastName}`,
    type:         body.type,
    startDate:    start,
    endDate:      end,
    days:         body.days,
    reason:       body.reason,
    notes:        body.notes,
    status:       'requested',
    createdBy:    req.user?.userId,
  });
  res.status(201).json(absence);
}));

// GET /absences/summary — vacation days used per employee per year
router.get('/summary', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { year } = req.query as Record<string, string>;
  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  const summary = await Absence.aggregate([
    { $match: {
      tenantId:  req.tenantId,
      status:    'approved',
      startDate: { $lte: new Date(y, 11, 31) },
      endDate:   { $gte: new Date(y, 0, 1) },
    }},
    { $group: {
      _id:          { employeeId: '$employeeId', type: '$type' },
      employeeName: { $first: '$employeeName' },
      totalDays:    { $sum: '$days' },
    }},
    { $group: {
      _id:          '$_id.employeeId',
      employeeName: { $first: '$employeeName' },
      breakdown:    { $push: { type: '$_id.type', days: '$totalDays' } },
      totalDays:    { $sum: '$totalDays' },
    }},
    { $sort: { employeeName: 1 } },
  ]);
  res.json({ year: y, summary });
}));

// GET /absences/:id
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const absence = await Absence.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!absence) throw new AppError('Abwesenheit nicht gefunden.', 404);
  res.json(absence);
}));

// PATCH /absences/:id/approve
router.patch('/:id/approve', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const absence = await Absence.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!absence) throw new AppError('Abwesenheit nicht gefunden.', 404);
  if (absence.status !== 'requested') throw new AppError('Nur ausstehende Anträge können genehmigt werden.', 400);
  absence.status     = 'approved';
  absence.approvedBy = req.user?.userId as unknown as typeof absence.approvedBy;
  absence.approvedAt = new Date();
  await absence.save();
  res.json(absence);
}));

// PATCH /absences/:id/reject
router.patch('/:id/reject', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const absence = await Absence.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!absence) throw new AppError('Abwesenheit nicht gefunden.', 404);
  if (absence.status !== 'requested') throw new AppError('Nur ausstehende Anträge können abgelehnt werden.', 400);
  absence.status = 'rejected';
  await absence.save();
  res.json(absence);
}));

// PATCH /absences/:id/cancel
router.patch('/:id/cancel', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const absence = await Absence.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!absence) throw new AppError('Abwesenheit nicht gefunden.', 404);
  if (['rejected', 'cancelled'].includes(absence.status)) throw new AppError('Bereits abgelehnt oder storniert.', 400);
  absence.status = 'cancelled';
  await absence.save();
  res.json(absence);
}));

export default router;
