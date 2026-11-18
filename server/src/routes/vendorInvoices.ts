import { Router } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { VendorInvoice } from '../models/VendorInvoice';
import { Supplier } from '../models/Supplier';
import { CompanySettings } from '../models/CompanySettings';
import { postVendorInvoice, reverseVendorInvoiceInventory } from '../utils/autoPost';
import { calcTotals } from '../utils/calcTotals';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';
import { notifyAdmins } from '../utils/notify';
import { uploadAttachment } from '../middleware/upload';
import { Types } from 'mongoose';
import { BankAccount } from '../models/BankAccount';

const router = Router();
router.use(requireAuth);

const lineItemSchema = z.object({
  serviceItemId:  z.string().optional(),
  productId:      z.string().optional(),
  variantId:      z.string().optional(),
  itemName:       z.string().optional(),
  description:    z.string().default(''),
  unit:           z.string().default('Stück'),
  expenseAccount: z.string().optional(),
  quantity:       z.number().positive(),
  unitPriceCents: z.number().int().min(0),
  vatRate:        z.number().min(0).max(100).default(19),
});

const createSchema = z.object({
  supplierId:            z.string().min(1),
  supplierInvoiceNumber: z.string().min(1),
  invoiceDate:           z.string().min(1),
  dueDate:               z.string().optional(),
  lineItems:             z.array(lineItemSchema).min(1),
  notes:                 z.string().optional(),
});

const updateSchema = z.object({
  supplierInvoiceNumber: z.string().min(1).optional(),
  invoiceDate:           z.string().optional(),
  dueDate:               z.string().optional(),
  lineItems:             z.array(lineItemSchema).min(1).optional(),
  notes:                 z.string().optional(),
});


// GET /api/vendor-invoices/pending-approvals — list invoices pending approval (admin only)
router.get('/pending-approvals', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const invoices = await VendorInvoice.find({ tenantId: req.tenantId, status: 'pending_approval' })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ invoices });
}));

// GET /api/vendor-invoices
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { status, supplierId, from, to, page = '1', limit = '50' } = req.query as Record<string, string>;

  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (status)     filter.status     = status;
  if (supplierId) filter.supplierId = supplierId;
  if (from || to) {
    const df: Record<string, Date> = {};
    if (from) df.$gte = new Date(from);
    if (to)   df.$lte = new Date(to);
    filter.invoiceDate = df;
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await VendorInvoice.countDocuments(filter);
  const invoices = await VendorInvoice.find(filter)
    .sort({ invoiceDate: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  res.json({ invoices, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// GET /api/vendor-invoices/:id
router.get('/:id', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  res.json(inv);
}));

// POST /api/vendor-invoices
router.post(
  '/',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);

    const supplier = await Supplier.findOne({ _id: req.body.supplierId, tenantId: req.tenantId }).lean();
    if (!supplier) throw new AppError('Supplier not found', 404);

    const invoiceDate = new Date(req.body.invoiceDate);
    const dueDate     = req.body.dueDate
      ? new Date(req.body.dueDate)
      : new Date(invoiceDate.getTime() + 30 * 86400000);

    const { lineItems, totalNetCents, totalVatCents, totalGrossCents } = calcTotals(req.body.lineItems);

    const inv = await VendorInvoice.create({
      tenantId: req.tenantId,
      supplierInvoiceNumber: req.body.supplierInvoiceNumber,
      supplierId: supplier._id,
      supplierSnapshot: {
        companyName:     supplier.companyName,
        legalForm:       supplier.legalForm,
        address:         supplier.address,
        vatId:           supplier.vatId,
        creditorAccount: supplier.creditorAccount,
      },
      status: 'draft',
      invoiceDate,
      dueDate,
      lineItems,
      totalNetCents,
      totalVatCents,
      totalGrossCents,
      notes: req.body.notes,
    });

    await logAudit({ req, action: 'vendor_invoice.create', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
    res.status(201).json(inv);
  })
);

// PATCH /api/vendor-invoices/:id  (draft only)
router.patch(
  '/:id',
  requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (!req.tenantId) throw new AppError('Tenant required', 400);
    const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!inv) throw new AppError('Vendor invoice not found', 404);
    if (inv.status !== 'draft') throw new AppError('Only draft invoices can be edited', 400);

    if (req.body.supplierInvoiceNumber) inv.supplierInvoiceNumber = req.body.supplierInvoiceNumber;
    if (req.body.invoiceDate) inv.invoiceDate = new Date(req.body.invoiceDate);
    if (req.body.dueDate)     inv.dueDate     = new Date(req.body.dueDate);
    if (req.body.notes !== undefined) inv.notes = req.body.notes;
    if (req.body.lineItems) {
      const t = calcTotals(req.body.lineItems);
      inv.lineItems       = t.lineItems as typeof inv.lineItems;
      inv.totalNetCents   = t.totalNetCents;
      inv.totalVatCents   = t.totalVatCents;
      inv.totalGrossCents = t.totalGrossCents;
    }
    await inv.save();
    await logAudit({ req, action: 'vendor_invoice.update', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
    res.json(inv);
  })
);

// POST /api/vendor-invoices/:id/submit-approval
router.post('/:id/submit-approval', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  if (inv.status !== 'draft') throw new AppError('Only draft invoices can be submitted', 400);

  const settings = await CompanySettings.findOne({ tenantId: req.tenantId }).lean();
  const threshold = settings?.poApprovalThresholdCents ?? 0;

  if (threshold > 0 && inv.totalGrossCents >= threshold) {
    inv.status = 'pending_approval';
    await inv.save();
    notifyAdmins({
      tenantId: req.tenantId,
      type:     'vendor_invoice_approval',
      title:    'Eingangsrechnung zur Genehmigung',
      body:     `${inv.supplierSnapshot.companyName} — ${inv.supplierInvoiceNumber}`,
      link:     `/erp/einkauf/eingangsrechnungen/${inv._id}`,
    }).catch(() => {});
    await logAudit({ req, action: 'vendor_invoice.submit_approval', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
    return res.json(inv);
  }
  // Below threshold: auto-approve
  inv.status     = 'approved';
  inv.approvedAt = new Date();
  inv.approvalNote = 'Auto-approved (below threshold)';
  await inv.save();
  const userId = new Types.ObjectId(req.user!.userId);
  postVendorInvoice(inv as typeof inv & { _id: Types.ObjectId }, userId).catch(e =>
    console.error('[autoPost] vendor invoice posting failed:', e)
  );
  await logAudit({ req, action: 'vendor_invoice.approve', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
  res.json(inv);
}));

// POST /api/vendor-invoices/:id/approve
router.post('/:id/approve', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  if (!['draft', 'pending_approval'].includes(inv.status)) throw new AppError('Invoice cannot be approved in current status', 400);

  // Guard: reject posting into a closed or locked accounting period
  const invDate = inv.invoiceDate ?? new Date();
  const period = await Period.findOne({ tenantId: req.tenantId, startDate: { $lte: invDate }, endDate: { $gte: invDate } });
  if (period && period.status !== 'open') {
    throw new AppError(`Die Buchungsperiode "${period.name}" ist ${period.status === 'locked' ? 'gesperrt' : 'geschlossen'}. Bitte Rechnungsdatum anpassen.`, 422);
  }
  if (period?.fiscalYearId) {
    const fy = await FiscalYear.findById(period.fiscalYearId);
    if (fy && fy.status !== 'open') throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen.`, 422);
  }

  inv.status       = 'approved';
  inv.approvedAt   = new Date();
  inv.approvalNote = (req.body as { note?: string }).note ?? '';
  await inv.save();
  // Auto-post: journal entry + inventory movements
  const userId = new Types.ObjectId(req.user!.userId);
  postVendorInvoice(inv as typeof inv & { _id: Types.ObjectId }, userId).catch(e =>
    console.error('[autoPost] vendor invoice posting failed:', e)
  );
  await logAudit({ req, action: 'vendor_invoice.approve', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
  res.json(inv);
}));

// POST /api/vendor-invoices/:id/reject
router.post('/:id/reject', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  if (inv.status !== 'pending_approval') throw new AppError('Only invoices pending approval can be rejected', 400);
  inv.status        = 'rejected';
  inv.rejectedAt    = new Date();
  inv.rejectionNote = (req.body as { note?: string }).note ?? '';
  await inv.save();
  await logAudit({ req, action: 'vendor_invoice.reject', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
  res.json(inv);
}));

// POST /api/vendor-invoices/:id/attachments
router.post('/:id/attachments', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res, next) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);

  uploadAttachment(req, res, async (err) => {
    if (err) return next(new AppError(err.message, 400));
    if (!req.file) return next(new AppError('No file uploaded', 400));

    inv.attachments.push({
      _id:          new Types.ObjectId(),
      filename:     req.file.filename,
      originalName: req.file.originalname,
      mimeType:     req.file.mimetype,
      sizeBytes:    req.file.size,
      uploadedAt:   new Date(),
      uploadedBy:   req.user ? new Types.ObjectId(req.user.userId) : undefined,
    });
    await inv.save();
    await logAudit({ req, action: 'vendor_invoice.attachment_upload', targetType: 'VendorInvoice', targetId: inv._id, targetName: req.file.originalname });
    res.status(201).json(inv.attachments[inv.attachments.length - 1]);
  });
}));

// GET /api/vendor-invoices/:id/attachments/:attId
router.get('/:id/attachments/:attId', requireAuth, asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId }).lean();
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  const att = inv.attachments.find(a => a._id.toString() === req.params.attId);
  if (!att) throw new AppError('Attachment not found', 404);

  const filePath = path.join(__dirname, '../../uploads/attachments', att.filename);
  if (!fs.existsSync(filePath)) throw new AppError('File not found on disk', 404);

  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.originalName)}"`);
  res.setHeader('Content-Type', att.mimeType);
  fs.createReadStream(filePath).pipe(res);
}));

// DELETE /api/vendor-invoices/:id/attachments/:attId
router.delete('/:id/attachments/:attId', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  const idx = inv.attachments.findIndex(a => a._id.toString() === req.params.attId);
  if (idx === -1) throw new AppError('Attachment not found', 404);
  const att = inv.attachments[idx];
  const filePath = path.join(__dirname, '../../uploads/attachments', att.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  inv.attachments.splice(idx, 1);
  await inv.save();
  await logAudit({ req, action: 'vendor_invoice.attachment_delete', targetType: 'VendorInvoice', targetId: inv._id, targetName: att.originalName });
  res.json({ message: 'Deleted' });
}));

// POST /api/vendor-invoices/:id/mark-paid
router.post('/:id/mark-paid', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  if (!['draft','pending_approval','approved'].includes(inv.status)) throw new AppError('Invoice cannot be marked as paid', 400);
  inv.status    = 'paid';
  inv.paidAt    = new Date();
  inv.paidCents = inv.totalGrossCents;
  await inv.save();
  await logAudit({ req, action: 'vendor_invoice.paid', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
  res.json(inv);
}));

// POST /api/vendor-invoices/:id/cancel
router.post('/:id/cancel', requireRole('erp_admin', 'super_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const inv = await VendorInvoice.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!inv) throw new AppError('Vendor invoice not found', 404);
  if (inv.status === 'cancelled') throw new AppError('Already cancelled', 400);
  if (inv.status === 'paid') throw new AppError('Paid invoices cannot be cancelled', 400);
  const wasApproved = inv.status === 'approved';
  inv.status = 'cancelled';
  await inv.save();
  // Reverse stock-in movements only if the invoice had already been approved (and thus posted)
  if (wasApproved) {
    reverseVendorInvoiceInventory(
      inv._id as unknown as Types.ObjectId,
      req.tenantId as unknown as Types.ObjectId,
      inv.supplierInvoiceNumber
    ).catch(e => console.error('[autoPost] vendor invoice reversal failed:', e));
  }
  await logAudit({ req, action: 'vendor_invoice.cancel', targetType: 'VendorInvoice', targetId: inv._id, targetName: inv.supplierInvoiceNumber });
  res.json(inv);
}));

// SEPA Credit Transfer (pain.001.003.03) batch export
router.post('/sepa-export', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'),
  validate(z.object({ invoiceIds: z.array(z.string()).min(1).max(200) })),
  asyncHandler(async (req, res) => {
    const tenantId = req.tenantId as unknown as Types.ObjectId;
    const ids = (req.body.invoiceIds as string[]).map(id => new Types.ObjectId(id));

    const invoices = await VendorInvoice.find({
      _id: { $in: ids },
      tenantId,
      status: 'approved',
    }).lean();

    if (!invoices.length) throw new AppError('No approved invoices found for the given IDs', 400);

    // Load supplier IBANs
    const supplierIds = [...new Set(invoices.map(i => i.supplierId.toString()))];
    const suppliers = await Supplier.find({ _id: { $in: supplierIds } }, { iban: 1, bic: 1, name: 1 }).lean();
    const supplierMap = new Map(suppliers.map(s => [(s._id as Types.ObjectId).toString(), s]));

    // Determine debtor (company) bank account
    const settings = await CompanySettings.findOne({ tenantId }, { companyName: 1, defaultBankAccountId: 1 }).lean();
    const bankAccount = settings?.defaultBankAccountId
      ? await BankAccount.findOne({ _id: settings.defaultBankAccountId, tenantId }, { iban: 1, bic: 1, accountName: 1 }).lean()
      : null;

    const debtorName = settings?.companyName || 'Unbekannt';
    const debtorIban = bankAccount?.iban || '';
    const debtorBic = bankAccount?.bic || '';

    const msgId = `ORGX-${Date.now()}`;
    const now = new Date().toISOString();
    const executionDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10); // next business day

    const totalCents = invoices.reduce((sum, i) => sum + i.totalGrossCents, 0);
    const totalEur = (totalCents / 100).toFixed(2);

    const txBlocks = invoices.map((inv, idx) => {
      const supplier = supplierMap.get(inv.supplierId.toString());
      const creditorIban = (supplier?.iban || '').replace(/\s/g, '');
      const creditorBic = supplier?.bic || '';
      const creditorName = inv.supplierSnapshot.companyName;
      const amountEur = (inv.totalGrossCents / 100).toFixed(2);
      const endToEndId = `${inv.supplierInvoiceNumber}-${idx}`.slice(0, 35);
      return `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${endToEndId}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amountEur}</InstdAmt></Amt>
        ${creditorBic ? `<CdtrAgt><FinInstnId><BIC>${creditorBic}</BIC></FinInstnId></CdtrAgt>` : ''}
        <Cdtr><Nm>${creditorName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${creditorIban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${inv.supplierInvoiceNumber}</Ustrd></RmtInf>
      </CdtTrfTxInf>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.003.03"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${now}</CreDtTm>
      <NbOfTxs>${invoices.length}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <InitgPty><Nm>${debtorName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${invoices.length}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${executionDate}</ReqdExctnDt>
      <Dbtr><Nm>${debtorName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>
      ${debtorBic ? `<DbtrAgt><FinInstnId><BIC>${debtorBic}</BIC></FinInstnId></DbtrAgt>` : ''}
      ${txBlocks}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;

    await logAudit({ req, action: 'vendor_invoice.sepa_export', targetType: 'VendorInvoice', targetId: ids[0], targetName: `${invoices.length} invoices` });

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="sepa-${msgId}.xml"`);
    res.send(xml);
  })
);

export default router;
