import { Router } from 'express';
import puppeteer from 'puppeteer';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { logAudit } from '../utils/audit';
import { DunningRecord } from '../models/DunningRecord';
import { SalesInvoice } from '../models/SalesInvoice';
import { Customer } from '../models/Customer';
import { CompanySettings } from '../models/CompanySettings';
import { BankAccount } from '../models/BankAccount';

const router = Router();
router.use(requireAuth);

const LEVEL_LABEL: Record<number, string> = { 1: '1. Mahnung', 2: '2. Mahnung', 3: 'Letzte Mahnung' };

// ── GET /api/dunning/candidates ── overdue invoices eligible for next dunning ──
router.get('/candidates', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const settings = await CompanySettings.findOne({ tenantId: req.tenantId });
  const levels = settings?.dunningLevels ?? [
    { level: 1, feeCents: 0, graceDays: 14 },
    { level: 2, feeCents: 1500, graceDays: 7 },
    { level: 3, feeCents: 4000, graceDays: 7 },
  ];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // All overdue sent invoices
  const invoices = await SalesInvoice.find({
    tenantId: req.tenantId,
    status: 'sent',
    dueDate: { $lt: today },
  }).sort({ dueDate: 1 });

  if (!invoices.length) return res.json({ candidates: [] });

  const invoiceIds = invoices.map(i => i._id);

  // Last dunning record per invoice
  const latestByInvoice = await DunningRecord.aggregate([
    { $match: { tenantId: req.tenantId, invoiceId: { $in: invoiceIds } } },
    { $sort: { invoiceId: 1, issuedAt: -1 } },
    { $group: { _id: '$invoiceId', level: { $first: '$level' }, issuedAt: { $first: '$issuedAt' } } },
  ]);
  const dunningMap = new Map(latestByInvoice.map(d => [d._id.toString(), d]));

  // Customer dunning blocks
  const customerIds = [...new Set(invoices.map(i => i.customerId.toString()))];
  const customers = await Customer.find({ _id: { $in: customerIds }, tenantId: req.tenantId }, { _id: 1, dunningBlock: 1 });
  const blockedSet = new Set(customers.filter(c => c.dunningBlock).map(c => c._id.toString()));

  const candidates = [];
  for (const inv of invoices) {
    if (blockedSet.has(inv.customerId.toString())) continue;

    const last = dunningMap.get((inv._id as { toString(): string }).toString());
    const currentLevel = last?.level ?? 0;
    if (currentLevel >= 3) continue; // max level reached

    const nextLevel = currentLevel + 1;
    const levelCfg = levels.find(l => l.level === nextLevel);
    if (!levelCfg) continue;

    // Enforce graceDays since last dunning (level 1: since invoice due date)
    const referenceDate = last ? new Date(last.issuedAt) : new Date(inv.dueDate);
    const daysSince = Math.floor((today.getTime() - referenceDate.getTime()) / 86_400_000);
    if (daysSince < levelCfg.graceDays) continue;

    const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
    candidates.push({
      invoiceId:     inv._id,
      invoiceNumber: inv.invoiceNumber,
      companyName:   inv.customerSnapshot.companyName,
      customerId:    inv.customerId,
      dueDate:       inv.dueDate,
      daysOverdue,
      openCents:     inv.totalGrossCents - inv.paidCents,
      currentLevel,
      nextLevel,
      feeCents:      levelCfg.feeCents,
      graceDays:     levelCfg.graceDays,
    });
  }

  res.json({ candidates });
}));

// ── GET /api/dunning?invoiceId=:id ── dunning history for one invoice ──────────
router.get('/', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const { invoiceId, page = '1', limit = '50' } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { tenantId: req.tenantId };
  if (invoiceId) filter.invoiceId = invoiceId;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [records, total] = await Promise.all([
    DunningRecord.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(parseInt(limit)),
    DunningRecord.countDocuments(filter),
  ]);
  res.json({ records, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// ── POST /api/dunning/:invoiceId ── issue next dunning level ───────────────────
router.post('/:invoiceId', requireRole('erp_admin', 'erp_accountant', 'super_admin', 'agency_admin'), asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);

  const invoice = await SalesInvoice.findOne({ _id: req.params.invoiceId, tenantId: req.tenantId });
  if (!invoice) throw new AppError('Invoice not found', 404);
  if (invoice.status !== 'sent') throw new AppError('Only sent (unpaid) invoices can be dunned', 400);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (invoice.dueDate >= today) throw new AppError('Invoice is not yet overdue', 400);

  const customer = await Customer.findOne({ _id: invoice.customerId, tenantId: req.tenantId });
  if (customer?.dunningBlock) throw new AppError('Customer has dunning block (Mahnsperre)', 400);

  const settings = await CompanySettings.findOne({ tenantId: req.tenantId });
  const levels = settings?.dunningLevels ?? [
    { level: 1, feeCents: 0, graceDays: 14 },
    { level: 2, feeCents: 1500, graceDays: 7 },
    { level: 3, feeCents: 4000, graceDays: 7 },
  ];

  const lastRecord = await DunningRecord.findOne({ tenantId: req.tenantId, invoiceId: invoice._id }).sort({ issuedAt: -1 });
  const currentLevel = lastRecord?.level ?? 0;
  if (currentLevel >= 3) throw new AppError('Maximum dunning level (3) already reached', 400);

  const nextLevel = (currentLevel + 1) as 1 | 2 | 3;
  const levelCfg = levels.find(l => l.level === nextLevel);
  if (!levelCfg) throw new AppError('Dunning level config missing', 500);

  // Grace days check
  const referenceDate = lastRecord ? new Date(lastRecord.issuedAt) : new Date(invoice.dueDate);
  const daysSince = Math.floor((today.getTime() - referenceDate.getTime()) / 86_400_000);
  if (daysSince < levelCfg.graceDays) {
    throw new AppError(`Too soon — must wait ${levelCfg.graceDays} days after last dunning (${daysSince} elapsed)`, 400);
  }

  const dunningDueDate = new Date(today);
  dunningDueDate.setDate(dunningDueDate.getDate() + levelCfg.graceDays);

  const record = await DunningRecord.create({
    tenantId:       req.tenantId,
    invoiceId:      invoice._id,
    customerId:     invoice.customerId,
    invoiceNumber:  invoice.invoiceNumber,
    companyName:    invoice.customerSnapshot.companyName,
    level:          nextLevel,
    issuedAt:       new Date(),
    dunningDueDate,
    feeCents:       levelCfg.feeCents,
    notes:          req.body?.notes ?? '',
  });

  await logAudit({ req, action: 'dunning.issue', targetType: 'DunningRecord', targetId: record._id, targetName: `${LEVEL_LABEL[nextLevel]} – ${invoice.invoiceNumber}` });
  res.status(201).json(record);
}));

// ── GET /api/dunning/:id/pdf ── dunning letter PDF ────────────────────────────
router.get('/:id/pdf', asyncHandler(async (req, res) => {
  if (!req.tenantId) throw new AppError('Tenant required', 400);
  const record = await DunningRecord.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!record) throw new AppError('Dunning record not found', 404);

  const invoice = await SalesInvoice.findById(record.invoiceId);
  if (!invoice) throw new AppError('Invoice not found', 404);

  const [settings, bank] = await Promise.all([
    CompanySettings.findOne({ tenantId: req.tenantId }),
    BankAccount.findOne({ tenantId: req.tenantId, isDefault: true, isActive: true }),
  ]);

  const locale = 'de-DE';
  const fmt = (d: Date | string) => new Date(d).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const money = (c: number) => (c / 100).toLocaleString(locale, { minimumFractionDigits: 2 }) + ' €';

  const coName = [settings?.companyName, settings?.legalForm].filter(Boolean).join(' ');
  const coAddr = settings?.address;
  const snap   = invoice.customerSnapshot;

  const isLast  = record.level === 3;
  const subject = LEVEL_LABEL[record.level];
  const openCents = invoice.totalGrossCents - invoice.paidCents;

  const ibanLine = bank ? `<br/>IBAN: <strong>${bank.iban}</strong>${bank.bic ? `&nbsp;&nbsp;BIC: ${bank.bic}` : ''}` : '';

  const html = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11pt; color: #111; margin: 0; padding: 40px; }
    .sender { font-size: 9pt; color: #555; border-bottom: 1px solid #999; padding-bottom: 4px; margin-bottom: 20px; }
    .recipient { margin-bottom: 28px; }
    .meta { display: flex; justify-content: flex-end; margin-bottom: 28px; }
    h2 { font-size: 14pt; margin: 0 0 16px; ${isLast ? 'color:#b91c1c;' : ''} }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
    th { background: #f0f0f0; padding: 6px 8px; text-align: left; border-bottom: 2px solid #ccc; }
    td { padding: 5px 8px; border-bottom: 1px solid #e0e0e0; }
    .total-row td { font-weight: bold; background: #f8f8f8; }
    .warning { background: #fef2f2; border-left: 4px solid #b91c1c; padding: 10px 14px; margin: 16px 0; font-size: 10pt; color: #7f1d1d; }
    .footer { margin-top: 40px; font-size: 9pt; color: #555; border-top: 1px solid #ccc; padding-top: 8px; }
  </style></head><body>

  <div class="sender">${coName} · ${coAddr?.street ?? ''} · ${coAddr?.zip ?? ''} ${coAddr?.city ?? ''} · ${settings?.vatId ? 'USt-IdNr.: ' + settings.vatId : ''}</div>

  <div class="recipient">
    <strong>${snap.companyName}${snap.legalForm ? ' ' + snap.legalForm : ''}</strong><br/>
    ${snap.address.street ? snap.address.street + '<br/>' : ''}
    ${snap.address.zip} ${snap.address.city}
  </div>

  <div class="meta">
    ${coAddr?.city ?? ''}, den ${fmt(record.issuedAt)}
  </div>

  <h2>${subject} – Rechnung ${invoice.invoiceNumber}</h2>

  <p>Sehr geehrte Damen und Herren,</p>
  <p>trotz unserer ${record.level > 1 ? 'wiederholten ' : ''}Zahlungserinnerung haben wir für die nachstehend aufgeführte Rechnung bislang keinen Zahlungseingang verbucht. Wir bitten Sie, den offenen Betrag umgehend zu begleichen.</p>

  <table>
    <thead><tr><th>Rechnungsnr.</th><th>Rechnungsdatum</th><th>Urspr. Fällig</th><th>Rechnungsbetrag</th><th>Offener Betrag</th></tr></thead>
    <tbody>
      <tr>
        <td>${invoice.invoiceNumber}</td>
        <td>${fmt(invoice.invoiceDate)}</td>
        <td style="color:#b91c1c;font-weight:600">${fmt(invoice.dueDate)}</td>
        <td>${money(invoice.totalGrossCents)}</td>
        <td>${money(openCents)}</td>
      </tr>
      ${record.feeCents > 0 ? `<tr><td colspan="4">Mahngebühr (${subject})</td><td>${money(record.feeCents)}</td></tr>` : ''}
      <tr class="total-row"><td colspan="4">Gesamtbetrag inkl. Mahngebühr:</td><td>${money(openCents + record.feeCents)}</td></tr>
    </tbody>
  </table>

  <p>Bitte überweisen Sie den Betrag von <strong>${money(openCents + record.feeCents)}</strong> bis spätestens <strong>${fmt(record.dunningDueDate)}</strong> auf folgendes Konto:</p>
  <p>Empfänger: <strong>${coName}</strong>${ibanLine}<br/>Verwendungszweck: <strong>${invoice.invoiceNumber}</strong></p>

  ${isLast ? `<div class="warning">⚠ Dies ist unsere letzte Mahnung. Bei Ausbleiben der Zahlung bis zum ${fmt(record.dunningDueDate)} behalten wir uns vor, den Betrag ohne weitere Ankündigung an ein Inkassobüro zu übergeben oder den Rechtsweg zu beschreiten.</div>` : ''}

  <p>Falls Sie die Zahlung bereits veranlasst haben, betrachten Sie dieses Schreiben als gegenstandslos. Für Rückfragen stehen wir Ihnen gerne zur Verfügung.</p>

  <p>Mit freundlichen Grüßen<br/><br/>${coName}</p>

  <div class="footer">${coName} · ${coAddr?.street ?? ''} · ${coAddr?.zip ?? ''} ${coAddr?.city ?? ''} · ${settings?.vatId ? 'USt-IdNr.: ' + settings.vatId : ''} · ${settings?.hrNumber ? 'HRB: ' + settings.hrNumber : ''}</div>
  </body></html>`;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '20mm', bottom: '20mm', left: '25mm', right: '25mm' } });
    const safeNum = record.invoiceNumber.replace(/[^a-zA-Z0-9\-_]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Mahnung_${record.level}_${safeNum}.pdf"`,
    });
    res.send(pdf);
  } finally {
    await browser.close();
  }
}));

export default router;
