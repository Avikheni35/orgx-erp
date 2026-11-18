import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { Payroll } from '../../models/Payroll';
import { nextSeq } from '../../models/Counter';
import mongoose from 'mongoose';

const router = Router();

// POST /api/internal/payroll-lines
// Accepts M1 worker data (legacy) OR M2 staff data (new, with syncId idempotency)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const tenantId = req.internalTenantId!;
    const {
      // M2 fields
      syncId,
      m2StaffId,
      staffName,
      firstName,
      lastName,
      email,
      grossCents,
      taxCents,
      deductionCents,
      netCents,
      hoursWorked,
      periodYear,
      periodMonth,
      timesheetId,
      // M1 legacy fields (kept for backward compat)
      workerName,
      m1WorkerId,
      periodStart,
      grossAmountCents,
      payRateCents,
    } = req.body as {
      syncId?:        string;
      m2StaffId?:     string;
      staffName?:     string;
      firstName?:     string;
      lastName?:      string;
      email?:         string;
      grossCents?:    number;
      taxCents?:      number;
      deductionCents?: number;
      netCents?:      number;
      hoursWorked?:   number;
      periodYear?:    number;
      periodMonth?:   number;
      timesheetId?:   string;
      // M1 legacy
      workerName?:    string;
      m1WorkerId?:    string;
      periodStart?:   string;
      grossAmountCents?: number;
      payRateCents?:  number;
    };

    const tenantOid = new mongoose.Types.ObjectId(tenantId);
    const systemUserId = new mongoose.Types.ObjectId('000000000000000000000000');

    // Idempotency check for M2 entries
    if (syncId) {
      const existing = await Payroll.findOne({ tenantId: tenantOid, 'entries.syncId': syncId });
      if (existing) {
        return res.json({ payrollId: existing._id, created: false, duplicate: true });
      }
    }

    // Resolve period
    let year: number, month: number;
    if (periodYear && periodMonth) {
      year = periodYear;
      month = periodMonth;
    } else if (periodStart) {
      const d = new Date(periodStart);
      year  = d.getFullYear();
      month = d.getMonth() + 1;
    } else {
      const now = new Date();
      year  = now.getFullYear();
      month = now.getMonth() + 1;
    }
    const period = `${year}-${String(month).padStart(2, '0')}`;

    // Build entry
    const isM2 = !!m2StaffId;
    const resolvedGross  = isM2 ? (grossCents ?? 0) : (grossAmountCents ?? 0);
    const resolvedNet    = isM2 ? (netCents ?? 0)   : Math.max(0, resolvedGross - Math.round(resolvedGross * 0.50));
    const resolvedTax    = isM2 ? (taxCents ?? 0)   : Math.round(resolvedGross * 0.30);
    const resolvedSS     = isM2 ? (deductionCents ?? 0) : Math.round(resolvedGross * 0.20);
    const resolvedName   = isM2 ? (staffName ?? `${firstName} ${lastName}`) : (workerName ?? '');
    const resolvedEmpNum = isM2 ? `M2-${(m2StaffId ?? '').slice(-6)}` : `M1-${(m1WorkerId ?? '').slice(-6)}`;
    const resolvedEmpId  = new mongoose.Types.ObjectId();

    const entryData = {
      employeeId:          resolvedEmpId,
      employeeNumber:      resolvedEmpNum,
      employeeName:        resolvedName,
      personnelAccount:    '4120',
      costCenterNumber:    '',
      salaryType:          'hourly' as const,
      grossCents:          isM2 ? (payRateCents ?? 0) : (payRateCents ?? 0),
      hoursWorked:         hoursWorked ?? 0,
      additionalCents:     0,
      deductionCents:      resolvedSS,
      totalGrossCents:     resolvedGross,
      taxCents:            resolvedTax,
      socialSecurityCents: resolvedSS,
      netCents:            resolvedNet,
      note:                timesheetId ? `Timesheet:${timesheetId} Period:${period}` : `Period:${period}`,
      ...(syncId && { syncId }),
      ...(isM2 && { employeeSnapshot: { m2StaffId: m2StaffId!, firstName: firstName ?? '', lastName: lastName ?? '', email: email ?? '', source: 'm2' as const } }),
    };

    let payroll = await Payroll.findOne({ tenantId: tenantOid, year, month });

    if (payroll) {
      payroll.entries.push(entryData);
      payroll.totalGrossCents += resolvedGross;
      payroll.totalNetCents   += resolvedNet;
      await payroll.save();
      return res.json({ payrollId: payroll._id, created: false });
    }

    const seq = await nextSeq(tenantId, 'payroll');
    payroll = await Payroll.create({
      tenantId:        tenantOid,
      payrollNumber:   `LNA-${String(seq).padStart(6, '0')}`,
      period,
      year,
      month,
      status:          'draft',
      entries:         [entryData],
      totalGrossCents: resolvedGross,
      totalNetCents:   resolvedNet,
      notes:           isM2 ? 'Auto-created from M2 event timesheet' : 'Auto-created from M1 timesheet data',
      createdBy:       systemUserId,
      source:          isM2 ? 'm2' : 'm3',
    });

    res.status(201).json({ payrollId: payroll._id, created: true });
  })
);

export default router;
