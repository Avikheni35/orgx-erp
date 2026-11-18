import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { SalesInvoice } from '../models/SalesInvoice';
import { CompanySettings } from '../models/CompanySettings';
import { env } from '../config/env';

const router = Router();

// GET /public/invoice/:token — public self-service invoice view (no auth)
router.get('/invoice/:token', asyncHandler(async (req, res) => {
  let payload: { invoiceId: string; tenantId: string; purpose: string };
  try {
    payload = jwt.verify(req.params.token, env.JWT_ACCESS_SECRET) as typeof payload;
  } catch {
    throw new AppError('Link ungültig oder abgelaufen.', 401);
  }

  if (payload.purpose !== 'invoice_view') throw new AppError('Ungültiger Token-Typ.', 401);

  const invoice = await SalesInvoice.findById(payload.invoiceId).lean();
  if (!invoice || invoice.tenantId.toString() !== payload.tenantId) {
    throw new AppError('Rechnung nicht gefunden.', 404);
  }

  const settings = await CompanySettings.findOne({ tenantId: invoice.tenantId }, {
    companyName: 1, address: 1, vatId: 1,
  }).lean();

  res.json({
    invoice: {
      _id:             invoice._id,
      invoiceNumber:   invoice.invoiceNumber,
      invoiceDate:     invoice.invoiceDate,
      dueDate:         invoice.dueDate,
      status:          invoice.status,
      customerSnapshot: invoice.customerSnapshot,
      lineItems:       invoice.lineItems,
      totalNetCents:   invoice.totalNetCents,
      totalVatCents:   invoice.totalVatCents,
      totalGrossCents: invoice.totalGrossCents,
      paidCents:       invoice.paidCents,
      notes:           invoice.notes,
    },
    company: {
      name:    settings?.companyName ?? '',
      address: settings?.address ?? {},
      vatId:   settings?.vatId ?? '',
    },
  });
}));

export default router;
