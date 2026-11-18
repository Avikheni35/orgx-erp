import { Router } from 'express';
import { randomBytes } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { IntegrationSettings } from '../models/IntegrationSettings';
import { peers } from '../utils/serviceClient';
import { postM2EventPayment } from '../utils/autoPost';
import mongoose from 'mongoose';

const router = Router();
router.use(requireAuth);
router.use(requireRole('erp_admin'));

function maskToken(token: string): string {
  if (token.length <= 8) return '****';
  return '••••••••' + token.slice(-8);
}

async function getOrCreate(tenantId: mongoose.Types.ObjectId | string) {
  let settings = await IntegrationSettings.findOne({ tenantId });
  if (!settings) {
    settings = await IntegrationSettings.create({ tenantId });
  }
  return settings;
}

// GET /api/integrations
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getOrCreate(req.tenantId!);
    const connected = settings.connectedServices as Record<string, { url: string; token: string; enabled: boolean; lastPingAt?: Date; lastPingOk?: boolean } | undefined>;
    const masked: Record<string, unknown> = {};
    for (const mod of ['m1', 'm2'] as const) {
      const c = connected[mod];
      if (c) {
        masked[mod] = { url: c.url, token: maskToken(c.token), enabled: c.enabled, lastPingAt: c.lastPingAt, lastPingOk: c.lastPingOk };
      }
    }
    res.json({ ownServiceToken: settings.ownServiceToken, connectedServices: masked });
  })
);

// PUT /api/integrations/connections
router.put(
  '/connections',
  asyncHandler(async (req, res) => {
    const { module: mod, url, token, enabled } = req.body as {
      module: 'm1' | 'm2';
      url: string;
      token: string;
      enabled: boolean;
    };
    if (!['m1', 'm2'].includes(mod)) {
      res.status(400).json({ message: 'Invalid module' });
      return;
    }
    const settings = await getOrCreate(req.tenantId!);
    if (!settings.connectedServices) settings.connectedServices = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (settings.connectedServices as any)[mod] = { url, token, enabled };
    settings.markModified('connectedServices');
    await settings.save();
    res.json({ ok: true });
  })
);

// POST /api/integrations/test/:module
router.post(
  '/test/:module',
  asyncHandler(async (req, res) => {
    const mod = req.params.module as 'm1' | 'm2';
    const settings = await getOrCreate(req.tenantId!);
    const peer = (settings.connectedServices as Record<string, { url: string; token: string; enabled: boolean } | undefined>)[mod];
    if (!peer?.url || !peer.token) {
      res.json({ ok: false, error: 'Not configured' });
      return;
    }
    const start = Date.now();
    try {
      const response = await fetch(`${peer.url}/api/internal/health`, {
        method:  'GET',
        headers: { 'x-service-token': peer.token, 'x-caller-module': 'm3' },
        signal:  AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      if (response.ok) {
        await IntegrationSettings.updateOne(
          { tenantId: req.tenantId },
          { $set: { [`connectedServices.${mod}.lastPingAt`]: new Date(), [`connectedServices.${mod}.lastPingOk`]: true } }
        );
      }
      res.json({ ok: response.ok, latencyMs });
    } catch {
      res.json({ ok: false, latencyMs: Date.now() - start });
    }
  })
);

// GET /api/integrations/event-staff — live M2 staff payroll view
router.get(
  '/event-staff',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!.toString();
    const { year, month, syncStatus } = req.query as Record<string, string | undefined>;
    const params: Record<string, string | number> = {};
    if (year)       params.year       = Number(year);
    if (month)      params.month      = Number(month);
    if (syncStatus) params.syncStatus = syncStatus;

    const curYear  = year  ? Number(year)  : new Date().getFullYear();
    const curMonth = month ? Number(month) : new Date().getMonth() + 1;
    const prevMonth = curMonth === 1 ? 12 : curMonth - 1;
    const prevYear  = curMonth === 1 ? curYear - 1 : curYear;

    const [staffResult, tsResult, payResult, prevPayResult] = await Promise.all([
      peers.m2.fetchStaff(tenantId),
      peers.m2.fetchTimesheets(tenantId, {
        year: curYear,
        month: curMonth,
        syncStatus: syncStatus || undefined,
      }),
      peers.m2.fetchPayments(tenantId, { year: curYear,  month: curMonth }),
      peers.m2.fetchPayments(tenantId, { year: prevYear, month: prevMonth }),
    ]);

    if (!tsResult) {
      res.json({ connected: false, staff: [], timesheets: [], payments: [], prevPayments: [] });
      return;
    }

    res.json({
      connected: true,
      staff: staffResult?.staff ?? [],
      timesheets: tsResult.timesheets,
      payments: payResult?.payments ?? [],
      prevPayments: (prevPayResult?.payments ?? []).filter((p) => (p.carryForwardHours ?? 0) > 0),
    });
  })
);

// POST /api/integrations/event-staff/pay — M3 marks a staff member as paid, writes back to M2
router.post(
  '/event-staff/pay',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!.toString();
    const { staffProfileId, staffName, year, month, netAmountCents, m3PayrollId, paidHours, totalHours, paymentAccountNumber, markAsPaid } = req.body as {
      staffProfileId:        string;
      staffName:             string;
      year:                  number;
      month:                 number;
      netAmountCents:        number;
      m3PayrollId?:          string;
      paidHours?:            number;
      totalHours?:           number;
      paymentAccountNumber?: string;
      markAsPaid?:           boolean;
    };
    // Carry-forward hours: remaining hours when coordinator marks partial as fully paid
    const carryForwardHours = (markAsPaid && paidHours != null && totalHours != null && paidHours < totalHours)
      ? totalHours - paidHours
      : 0;

    if (!staffProfileId || !year || !month || netAmountCents == null) {
      res.status(400).json({ ok: false, error: 'staffProfileId, year, month and netAmountCents are required' });
      return;
    }

    const syncId = `m3_pay_${staffProfileId}_${year}_${month}`;
    const paidAt = new Date().toISOString();

    const result = await peers.m2.ackPayment(tenantId, {
      staffProfileId,
      staffName,
      year,
      month,
      netAmountCents,
      paidAt,
      m3PayrollId: m3PayrollId ?? `m3-event-${year}-${month}`,
      syncId,
      paidHours,
      totalHours,
      ...(carryForwardHours > 0 && { carryForwardHours }),
    });

    if (!result) {
      res.status(502).json({ ok: false, error: 'M2 unreachable or integration disabled' });
      return;
    }

    // Post journal entry: Dr 4120 Löhne / Cr 1200 Bank (or 1000 Cash)
    postM2EventPayment({
      tenantId:             new mongoose.Types.ObjectId(tenantId),
      userId:               new mongoose.Types.ObjectId(req.user!.userId),
      staffName,
      netAmount:            netAmountCents / 100,
      paidHours,
      year,
      month,
      syncId,
      paymentAccountNumber,
      carryForwardHours:    carryForwardHours > 0 ? carryForwardHours : undefined,
    }).catch((err) => console.error('[M3] Failed to post M2 payment journal entry:', err));

    res.json({ ok: result.ok, paymentId: result.paymentId, duplicate: result.duplicate, syncId, paidAt });
  })
);

// GET /api/integrations/m2-sync-status — fetch M2 pending/failed counts
router.get(
  '/m2-sync-status',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!.toString();
    const summary = await peers.m2.getSyncSummary(tenantId);
    if (!summary) {
      res.json({ connected: false });
      return;
    }
    res.json({ connected: true, ...summary });
  })
);

// POST /api/integrations/m2-sync-now — ask M2 to retry its pending/failed records
router.post(
  '/m2-sync-now',
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId!.toString();
    const result = await peers.m2.triggerSync(tenantId);
    if (!result) {
      res.status(502).json({ ok: false, error: 'M2 unreachable or integration disabled' });
      return;
    }
    res.json({ ok: true, ...result });
  })
);

// POST /api/integrations/regenerate-token
router.post(
  '/regenerate-token',
  asyncHandler(async (req, res) => {
    const newToken = 'sk_m3_' + randomBytes(24).toString('hex');
    await IntegrationSettings.updateOne(
      { tenantId: req.tenantId },
      { $set: { ownServiceToken: newToken } },
      { upsert: true }
    );
    res.json({ ownServiceToken: newToken });
  })
);

export default router;
