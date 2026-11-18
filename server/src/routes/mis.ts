import { Router } from 'express';
import { Types } from 'mongoose';
import OpenAI from 'openai';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { SalesInvoice } from '../models/SalesInvoice';
import { VendorInvoice } from '../models/VendorInvoice';
import { CashBookEntry } from '../models/CashBookEntry';
import { Payroll } from '../models/Payroll';
import { JournalEntry } from '../models/JournalEntry';
import { ServiceItem } from '../models/ServiceItem';
import { Product } from '../models/Product';
import { ProductVariant } from '../models/ProductVariant';
import { CreditNote } from '../models/CreditNote';
import { BankAccount } from '../models/BankAccount';
import { Budget } from '../models/Budget';
import { CostCenter } from '../models/CostCenter';
import { CompanySettings } from '../models/CompanySettings';
import { env } from '../config/env';

// .aggregate() bypasses Mongoose auto-casting — always use ObjectId in $match
const oid = (id: unknown) => new Types.ObjectId(String(id));

const router = Router();
router.use(requireAuth);
router.use(requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'));

const MONTH_LABELS = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];

function yearRange(year: number) {
  return { $gte: new Date(year, 0, 1), $lt: new Date(year + 1, 0, 1) };
}

function fill12<T extends { month: number }>(rows: T[], zero: Omit<T, 'month' | 'label'>): (T & { label: string })[] {
  const map = new Map(rows.map(r => [r.month, r]));
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const found = map.get(m);
    return { ...zero, ...found, month: m, label: MONTH_LABELS[i] } as T & { label: string };
  });
}

// ── GET /mis/summary ──────────────────────────────────────────────────────────
router.get('/summary', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const tid = oid(req.tenantId);
  const yearFilter = yearRange(year);

  const [
    revAgg,
    expAgg,
    cashAgg,
    openARagg,
    openAPagg,
    overdueAgg,
    payrollAgg,
    statusAgg,
  ] = await Promise.all([
    // 1. Revenue YTD
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: yearFilter } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]),
    // 2. Expenses YTD
    VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['approved', 'paid'] }, invoiceDate: yearFilter } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]),
    // 3. Cash balance (all time)
    CashBookEntry.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$type', total: { $sum: '$amountCents' } } },
    ]),
    // 4. Open AR
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: 'sent' } },
      { $project: { outstanding: { $subtract: ['$totalGrossCents', '$paidCents'] } } },
      { $group: { _id: null, total: { $sum: '$outstanding' } } },
    ]),
    // 5. Open AP
    VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: 'approved' } },
      { $project: { outstanding: { $subtract: ['$totalGrossCents', '$paidCents'] } } },
      { $group: { _id: null, total: { $sum: '$outstanding' } } },
    ]),
    // 6. Overdue AR
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: 'sent', dueDate: { $lt: new Date() } } },
      { $project: { outstanding: { $subtract: ['$totalGrossCents', '$paidCents'] } } },
      { $group: { _id: null, total: { $sum: '$outstanding' }, count: { $sum: 1 } } },
    ]),
    // 7. Payroll YTD
    Payroll.aggregate([
      { $match: { tenantId: tid, status: 'posted', year } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]),
    // 8. Invoice status counts
    SalesInvoice.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const revenueYTD   = (revAgg[0]?.total ?? 0) / 100;
  const expensesYTD  = (expAgg[0]?.total ?? 0) / 100;
  const netResultYTD = revenueYTD - expensesYTD;

  const cashByType: Record<string, number> = {};
  for (const c of cashAgg) cashByType[c._id as string] = (c.total as number) ?? 0;
  const cashBalance = ((cashByType['receipt'] ?? 0) - (cashByType['payment'] ?? 0)) / 100;

  const openAR          = (openARagg[0]?.total ?? 0) / 100;
  const openAP          = (openAPagg[0]?.total ?? 0) / 100;
  const overdueARCount  = overdueAgg[0]?.count ?? 0;
  const overdueARAmount = (overdueAgg[0]?.total ?? 0) / 100;
  const payrollYTD      = (payrollAgg[0]?.total ?? 0) / 100;
  const payrollRatio    = revenueYTD > 0 ? Math.round((payrollYTD / revenueYTD) * 1000) / 10 : 0;

  const invoiceStatusCounts: Record<string, number> = { draft: 0, sent: 0, paid: 0, cancelled: 0 };
  for (const s of statusAgg) invoiceStatusCounts[s._id as string] = s.count as number;

  res.json({
    year, revenueYTD, expensesYTD, netResultYTD,
    cashBalance, openAR, openAP,
    overdueARCount, overdueARAmount,
    payrollYTD, payrollRatio,
    invoiceStatusCounts,
  });
}));

// ── GET /mis/revenue/monthly ──────────────────────────────────────────────────
router.get('/revenue/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const rows = await SalesInvoice.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: { $in: ['sent', 'paid'] }, invoiceDate: yearRange(year) } },
    { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
    { $project: { _id: 0, month: '$_id', total: 1, count: 1 } },
  ]);
  const months = fill12(rows.map(r => ({ month: r.month as number, amount: (r.total as number) / 100, count: r.count as number })),
    { amount: 0, count: 0 });
  res.json({ year, months });
}));

// ── GET /mis/expenses/monthly ─────────────────────────────────────────────────
router.get('/expenses/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const rows = await VendorInvoice.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: { $in: ['approved', 'paid'] }, invoiceDate: yearRange(year) } },
    { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
    { $project: { _id: 0, month: '$_id', total: 1, count: 1 } },
  ]);
  const months = fill12(rows.map(r => ({ month: r.month as number, amount: (r.total as number) / 100, count: r.count as number })),
    { amount: 0, count: 0 });
  res.json({ year, months });
}));

// ── GET /mis/profit/monthly ───────────────────────────────────────────────────
router.get('/profit/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const tid = oid(req.tenantId);
  const [revRows, expRows] = await Promise.all([
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$totalGrossCents' } } },
    ]),
    VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['approved', 'paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: { $month: '$invoiceDate' }, total: { $sum: '$totalGrossCents' } } },
    ]),
  ]);

  const revMap = new Map(revRows.map(r => [r._id as number, (r.total as number) / 100]));
  const expMap = new Map(expRows.map(r => [r._id as number, (r.total as number) / 100]));

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const revenue  = revMap.get(m) ?? 0;
    const expenses = expMap.get(m) ?? 0;
    return { month: m, label: MONTH_LABELS[i], revenue, expenses, net: revenue - expenses };
  });
  res.json({ year, months });
}));

// ── GET /mis/cashflow/monthly ─────────────────────────────────────────────────
router.get('/cashflow/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const rows = await CashBookEntry.aggregate([
    { $match: { tenantId: oid(req.tenantId), date: yearRange(year) } },
    { $group: { _id: { month: { $month: '$date' }, type: '$type' }, total: { $sum: '$amountCents' } } },
  ]);

  const map = new Map<number, { receipts: number; payments: number }>();
  for (const r of rows) {
    const m = (r._id as { month: number; type: string }).month;
    const type = (r._id as { month: number; type: string }).type;
    if (!map.has(m)) map.set(m, { receipts: 0, payments: 0 });
    const entry = map.get(m)!;
    if (type === 'receipt') entry.receipts += (r.total as number) / 100;
    else entry.payments += (r.total as number) / 100;
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const d = map.get(m) ?? { receipts: 0, payments: 0 };
    return { month: m, label: MONTH_LABELS[i], receipts: d.receipts, payments: d.payments, net: d.receipts - d.payments };
  });
  res.json({ year, months });
}));

// ── GET /mis/payroll/monthly ──────────────────────────────────────────────────
router.get('/payroll/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const rows = await Payroll.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: 'posted', year } },
    { $group: {
      _id: '$month',
      gross: { $sum: '$totalGrossCents' },
      net:   { $sum: '$totalNetCents' },
      count: { $sum: 1 },
    }},
  ]);

  const map = new Map(rows.map(r => [r._id as number, r]));
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const d = map.get(m);
    return {
      month: m,
      label: MONTH_LABELS[i],
      gross: d ? (d.gross as number) / 100 : 0,
      net:   d ? (d.net   as number) / 100 : 0,
      employeeCount: d ? (d.count as number) : 0,
    };
  });
  res.json({ year, months });
}));

// ── GET /mis/customers/top ────────────────────────────────────────────────────
router.get('/customers/top', asyncHandler(async (req, res) => {
  const year  = parseInt((req.query.year  as string) ?? String(new Date().getFullYear()));
  const limit = parseInt((req.query.limit as string) ?? '10');
  const rows = await SalesInvoice.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: { $in: ['sent', 'paid'] }, invoiceDate: yearRange(year) } },
    { $group: {
      _id:          '$customerId',
      companyName:  { $first: '$customerSnapshot.companyName' },
      total:        { $sum: '$totalGrossCents' },
      invoiceCount: { $sum: 1 },
    }},
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  const customers = rows.map(r => ({
    customerId:   String(r._id),
    companyName:  r.companyName as string,
    total:        (r.total as number) / 100,
    invoiceCount: r.invoiceCount as number,
  }));
  res.json({ year, customers });
}));

// ── GET /mis/suppliers/top ────────────────────────────────────────────────────
router.get('/suppliers/top', asyncHandler(async (req, res) => {
  const year  = parseInt((req.query.year  as string) ?? String(new Date().getFullYear()));
  const limit = parseInt((req.query.limit as string) ?? '10');
  const rows = await VendorInvoice.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: { $in: ['approved', 'paid'] }, invoiceDate: yearRange(year) } },
    { $group: {
      _id:          '$supplierId',
      companyName:  { $first: '$supplierSnapshot.companyName' },
      total:        { $sum: '$totalGrossCents' },
      invoiceCount: { $sum: 1 },
    }},
    { $sort: { total: -1 } },
    { $limit: limit },
  ]);
  const suppliers = rows.map(r => ({
    supplierId:   String(r._id),
    companyName:  r.companyName as string,
    total:        (r.total as number) / 100,
    invoiceCount: r.invoiceCount as number,
  }));
  res.json({ year, suppliers });
}));

// ── GET /mis/vat/monthly ──────────────────────────────────────────────────────
router.get('/vat/monthly', asyncHandler(async (req, res) => {
  const year = parseInt((req.query.year as string) ?? String(new Date().getFullYear()));
  const rows = await JournalEntry.aggregate([
    { $match: { tenantId: oid(req.tenantId), status: 'posted', date: yearRange(year) } },
    { $unwind: '$lines' },
    { $match: { 'lines.accountNumber': { $in: ['1776', '1576'] } } },
    { $group: {
      _id: { month: { $month: '$date' }, accountNumber: '$lines.accountNumber' },
      debit:  { $sum: '$lines.debit'  },
      credit: { $sum: '$lines.credit' },
    }},
  ]);

  const map = new Map<number, { ust: number; vst: number }>();
  for (const r of rows) {
    const { month, accountNumber } = r._id as { month: number; accountNumber: string };
    if (!map.has(month)) map.set(month, { ust: 0, vst: 0 });
    const entry = map.get(month)!;
    const debit  = r.debit  as number;
    const credit = r.credit as number;
    if (accountNumber === '1776') entry.ust += (credit - debit) / 100; // USt collected = credit side
    if (accountNumber === '1576') entry.vst += (debit - credit) / 100; // VSt paid = debit side
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const d = map.get(m) ?? { ust: 0, vst: 0 };
    return { month: m, label: MONTH_LABELS[i], ust: d.ust, vst: d.vst, net: d.ust - d.vst };
  });
  res.json({ year, months });
}));

// ── GET /mis/ai-advisor ───────────────────────────────────────────────────────
router.get('/ai-advisor', asyncHandler(async (req, res) => {
  const tid = oid(req.tenantId);
  const now = new Date();
  const year = now.getFullYear();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [productSales, recentSales, serviceItems, revMonthly, expMonthly, topCustomers] = await Promise.all([
    // Product sales: group by itemName across all paid/sent invoices this year
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: yearRange(year) } },
      { $unwind: '$lineItems' },
      { $group: {
        _id: { name: '$lineItems.itemName', serviceItemId: '$lineItems.serviceItemId' },
        totalRevenueCents: { $sum: '$lineItems.totalGrossCents' },
        totalQty: { $sum: '$lineItems.quantity' },
        invoiceCount: { $sum: 1 },
        avgUnitPriceCents: { $avg: '$lineItems.unitPriceCents' },
      }},
      { $sort: { totalRevenueCents: -1 } },
      { $limit: 20 },
    ]),
    // Recent 30-day sales velocity per product
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: { $gte: thirtyDaysAgo } } },
      { $unwind: '$lineItems' },
      { $group: {
        _id: '$lineItems.itemName',
        qtyLast30Days: { $sum: '$lineItems.quantity' },
      }},
    ]),
    // All active service items with stock + cost price
    ServiceItem.find({ tenantId: tid, isActive: true }).lean(),
    // Monthly revenue last 6 months
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $month: '$invoiceDate' }, revenue: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    // Monthly expenses last 6 months
    VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['approved', 'paid'] }, invoiceDate: { $gte: sixMonthsAgo } } },
      { $group: { _id: { $month: '$invoiceDate' }, expenses: { $sum: '$totalGrossCents' } } },
      { $sort: { _id: 1 } },
    ]),
    // Top 5 customers this year
    SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent', 'paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: '$customerSnapshot.companyName', total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 },
    ]),
  ]);

  // Build velocity map
  const velocityMap = new Map<string, number>();
  for (const r of recentSales) velocityMap.set(r._id as string, r.qtyLast30Days as number);

  // Build service item map
  const itemMap = new Map<string, { costPriceCents: number; stockQuantity: number }>();
  for (const si of serviceItems) {
    itemMap.set(si.name, { costPriceCents: si.costPriceCents, stockQuantity: si.stockQuantity });
  }

  // Enrich product sales with margin + stock info
  const enrichedProducts = productSales.map((p) => {
    const name = (p._id as { name: string }).name || 'Unbekannt';
    const avgPrice = (p.avgUnitPriceCents as number) ?? 0;
    const si = itemMap.get(name);
    const costPrice = si?.costPriceCents ?? 0;
    const marginPct = avgPrice > 0 && costPrice > 0
      ? Math.round(((avgPrice - costPrice) / avgPrice) * 100)
      : null;
    const stock = si?.stockQuantity ?? null;
    const velocity30d = velocityMap.get(name) ?? 0;
    const daysUntilStockout = stock !== null && velocity30d > 0
      ? Math.round(stock / (velocity30d / 30))
      : null;
    return {
      name,
      totalRevenue: Math.round((p.totalRevenueCents as number) / 100),
      totalQty: p.totalQty,
      invoiceCount: p.invoiceCount,
      avgUnitPrice: Math.round(avgPrice / 100),
      marginPct,
      stockQuantity: stock,
      velocity30d,
      daysUntilStockout,
    };
  });

  const revenueMonths = revMonthly.map(r => ({ month: r._id, revenue: Math.round((r.revenue as number) / 100) }));
  const expenseMonths = expMonthly.map(r => ({ month: r._id, expenses: Math.round((r.expenses as number) / 100) }));
  const customers = topCustomers.map(c => ({ name: c._id, total: Math.round((c.total as number) / 100), invoices: c.count }));

  const payload = {
    year,
    products: enrichedProducts,
    revenueLastSixMonths: revenueMonths,
    expensesLastSixMonths: expenseMonths,
    topCustomers: customers,
  };

  if (!env.OPENAI_API_KEY) {
    return res.json({ suggestions: getMockSuggestions(enrichedProducts) });
  }

  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const systemPrompt = `You are a business intelligence advisor for a German SME using an ERP system.
Analyze the provided business data and return actionable suggestions as JSON.
Always respond with a JSON object: { "suggestions": [...] }
Each suggestion has: { "type": "opportunity"|"warning"|"reorder"|"growth"|"promotion", "priority": "high"|"medium"|"low", "title": string, "body": string, "metric"?: string }
Be specific with numbers. Write in German. Maximum 7 suggestions. Focus on the most impactful insights.

PROMOTION logic: Identify 1-2 products worth promoting to increase sales. Look for:
- High margin (>40%) but below-average revenue — hidden gems not getting enough attention
- High velocity (selling fast) AND high margin — doubling down here grows profit fastest
- Services or products with zero/low sales but strong margin potential
Use type "promotion" for these. Title should be "Jetzt bewerben: <ProductName>". Body should explain WHY (margin %, revenue gap, growth potential).`;

  const userPrompt = `Business data for ${year}:\n${JSON.stringify(payload, null, 2)}\n\nProvide 5-7 actionable business suggestions including 1-2 promotion recommendations.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 0.4,
  });

  const raw = completion.choices[0]?.message?.content ?? '{"suggestions":[]}';
  const parsed = JSON.parse(raw);
  res.json(parsed);
}));

function getMockSuggestions(products: ReturnType<typeof Array.prototype.map>) {
  const suggestions = [];
  const sorted = [...products].sort((a, b) => (b as { totalRevenue: number }).totalRevenue - (a as { totalRevenue: number }).totalRevenue);
  const top = sorted[0] as { name: string; totalRevenue: number; marginPct: number | null; daysUntilStockout: number | null } | undefined;
  if (top) {
    suggestions.push({ type: 'opportunity', priority: 'high', title: `Top-Produkt: ${top.name}`, body: `Ihr umsatzstärkstes Produkt. Erwägen Sie Mengenrabatte oder ein Premium-Angebot.`, metric: `${top.totalRevenue} € Umsatz` });
  }
  const reorderNeeded = (products as { name: string; daysUntilStockout: number | null }[]).filter(p => p.daysUntilStockout !== null && p.daysUntilStockout < 14);
  for (const p of reorderNeeded.slice(0, 2)) {
    suggestions.push({ type: 'reorder', priority: 'high', title: `Nachbestellung: ${p.name}`, body: `Voraussichtlich in ${p.daysUntilStockout} Tagen ausverkauft. Bitte rechtzeitig nachbestellen.`, metric: `${p.daysUntilStockout} Tage` });
  }
  suggestions.push({ type: 'growth', priority: 'medium', title: 'Kein OpenAI API-Key konfiguriert', body: 'Setzen Sie OPENAI_API_KEY in der .env-Datei, um KI-gestützte Geschäftsempfehlungen zu erhalten.', metric: undefined });
  return suggestions;
}

// ── Intent classifier ─────────────────────────────────────────────────────────
import { classifyIntent, VALID_INTENT_TAGS, type ChatIntent } from '../utils/misIntent';

// ── POST /mis/chat ────────────────────────────────────────────────────────────
router.post('/chat', asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history: { role: 'user' | 'assistant'; content: string }[];
  };

  if (!message?.trim()) return res.status(400).json({ error: 'message required' });
  if (!env.OPENAI_API_KEY) return res.json({ reply: 'OpenAI API-Key nicht konfiguriert. Bitte OPENAI_API_KEY in der .env-Datei setzen.' });

  const tid  = oid(req.tenantId);
  const now  = new Date();
  const year = now.getFullYear();

  // ── 1. Read intent mode from company settings ──────────────────────────────
  const settings    = await CompanySettings.findOne({ tenantId: tid }).lean();
  const intentMode  = (settings?.featureFlags as { misIntentMode?: string })?.misIntentMode ?? 'regex';
  const openai      = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  // ── 2. Classify intent ─────────────────────────────────────────────────────
  let intents: Set<ChatIntent>;

  if (intentMode === 'ai') {
    // AI mode: pre-call to gpt-4o-mini for intent classification
    try {
      const classifyRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an intent classifier for an ERP chatbot. Reply ONLY with a valid JSON object: {"intents": ["tag1","tag2",...]}. No other text.',
          },
          {
            role: 'user',
            content: `Classify what data is needed to answer this question. Pick all that apply from this list:\n["sales","today","weekly","inventory","financial","returns","customers","ar_aging","ap_aging","payroll_cost","cash_position","budget_actual"]\n\nPrevious context: ${history.slice(-2).map(h => h.content).join(' | ')}\nQuestion: "${message}"`,
          },
        ],
        max_tokens: 80,
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(classifyRes.choices[0]?.message?.content ?? '{}') as { intents?: string[] };
      const tags   = (parsed.intents ?? []).filter((t): t is ChatIntent => VALID_INTENT_TAGS.has(t as ChatIntent));
      intents = new Set(tags.length > 0 ? tags : (['general'] as ChatIntent[]));
      // Cascade rules
      if (intents.has('promotion'))    { intents.add('sales'); intents.add('inventory'); }
      if (intents.has('weekly'))       { intents.add('sales'); }
      if (intents.has('ar_aging'))     { intents.add('financial'); }
      if (intents.has('ap_aging'))     { intents.add('financial'); }
      if (intents.has('payroll_cost')) { intents.add('financial'); }
    } catch {
      // Fallback to regex on any AI classification failure
      intents = classifyIntent(message, history);
    }
  } else {
    // Regex mode (Option 1): regex + always load core sales/returns data
    intents = classifyIntent(message, history);
    // Always load core data so any phrasing of sales/returns questions works
    intents.add('sales');
    intents.add('returns');
  }

  // ── 3. Derive which query groups are needed ────────────────────────────────
  const todayKeyword    = /\btoday\b|heute|\bheute\b|today's|heutigen|tagesumsatz|tagesverkauf/i.test(message);
  const needsSales      = intents.has('sales') || intents.has('general');
  const needsToday      = (needsSales || intents.has('today') || intents.has('returns')) && (todayKeyword || intents.has('today'));
  const needsWeekly     = intents.has('weekly') || intents.has('sales');
  const needsInventory  = intents.has('inventory') || intents.has('promotion') || intents.has('general');
  const needsReturns    = intents.has('returns') || todayKeyword;
  const needsCustomers  = intents.has('customers');
  const needsFinancial  = intents.has('financial');
  const needsArAging    = intents.has('ar_aging');
  const needsApAging    = intents.has('ap_aging');
  const needsPayrollCost = intents.has('payroll_cost');
  const needsCashPos    = intents.has('cash_position');
  const needsBudget     = intents.has('budget_actual');

  const thirtyDaysAgo   = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStart      = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd        = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const sevenDaysAgo    = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thisMonthStart  = new Date(year, now.getMonth(), 1);
  const lastMonthStart  = new Date(year, now.getMonth() - 1, 1);
  const lastMonthEnd    = new Date(year, now.getMonth(), 0, 23, 59, 59);
  const MONTH_NAMES     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const none            = Promise.resolve([] as { _id: unknown; [k: string]: unknown }[]);

  // ── 3. Run only the required queries in parallel ───────────────────────────
  const [
    productSalesRaw, salesLast7dRaw, salesPrev7dRaw, salesLast30dRaw,
    salesThisMonthRaw, salesLastMonthRaw, monthlyRevenueRaw,
    serviceItemsRaw, productCatalogRaw, variantCatalogRaw,
    topCustomersRaw, creditNotesRaw, cancelledRaw, posReturnsRaw,
    revenueYTDRaw, expensesYTDRaw, expensesThisMonthRaw, cashBalanceRaw,
    arAgingRaw, apAgingRaw, payrollCostRaw, bankAccountsRaw, bankGLRaw, budgetPlannedRaw, budgetActualRaw,
    todaySalesRaw, todayReturnDetailsRaw,
  ] = await Promise.all([
    // -- sales --
    needsSales ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: yearRange(year) } },
      { $unwind: '$lineItems' },
      { $group: { _id: '$lineItems.itemName', totalRevenue: { $sum: '$lineItems.totalGrossCents' }, totalQty: { $sum: '$lineItems.quantity' }, avgUnitPrice: { $avg: '$lineItems.unitPriceCents' } } },
      { $sort: { totalRevenue: -1 } }, { $limit: 20 },
    ]) : none,
    // -- weekly last 7d --
    needsWeekly ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: { $gte: sevenDaysAgo } } },
      { $unwind: '$lineItems' },
      { $group: { _id: '$lineItems.itemName', qty: { $sum: '$lineItems.quantity' }, revenue: { $sum: '$lineItems.totalGrossCents' } } },
      { $sort: { revenue: -1 } },
    ]) : none,
    // -- weekly prev 7d --
    needsWeekly ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
      { $unwind: '$lineItems' },
      { $group: { _id: '$lineItems.itemName', qty: { $sum: '$lineItems.quantity' }, revenue: { $sum: '$lineItems.totalGrossCents' } } },
    ]) : none,
    // -- 30-day velocity (used by sales + inventory) --
    (needsSales || needsInventory) ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: { $gte: thirtyDaysAgo } } },
      { $unwind: '$lineItems' },
      { $group: { _id: '$lineItems.itemName', qty30d: { $sum: '$lineItems.quantity' } } },
    ]) : none,
    // -- this month revenue --
    (needsSales || needsFinancial) ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: { $gte: thisMonthStart } } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
    ]) : none,
    // -- last month revenue --
    (needsSales || needsFinancial) ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
    ]) : none,
    // -- monthly revenue breakdown --
    needsSales ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: { $month: '$invoiceDate' }, revenue: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]) : none,
    // -- service items --
    needsInventory ? ServiceItem.find({ tenantId: tid, isActive: true }).select('name costPriceCents defaultUnitPriceCents stockQuantity unit').lean() : Promise.resolve([] as Awaited<ReturnType<typeof ServiceItem.find>>),
    // -- products --
    needsInventory ? Product.find({ tenantId: tid, isActive: true }).select('name isService hasVariants costPriceCents defaultUnitPriceCents stockQuantity lowStockThreshold').lean() : Promise.resolve([] as Awaited<ReturnType<typeof Product.find>>),
    // -- variants --
    needsInventory ? ProductVariant.find({ tenantId: tid, isActive: true }).select('productId attributes stockQuantity costPriceCents unitPriceCents lowStockThreshold').lean() : Promise.resolve([] as Awaited<ReturnType<typeof ProductVariant.find>>),
    // -- top customers --
    needsCustomers ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: '$customerSnapshot.companyName', total: { $sum: '$totalGrossCents' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } }, { $limit: 10 },
    ]) : none,
    // -- credit note returns --
    needsReturns ? CreditNote.aggregate([
      { $match: { tenantId: tid, status: { $nin: ['cancelled'] }, creditNoteDate: yearRange(year) } },
      { $unwind: '$lineItems' },
      { $group: { _id: { $ifNull: ['$lineItems.itemName','$lineItems.description'] }, returnedQty: { $sum: '$lineItems.quantity' }, returnedValueCents: { $sum: '$lineItems.totalGrossCents' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } }, { $sort: { returnedQty: -1 } },
    ]) : none,
    // -- cancelled invoices --
    needsReturns ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: 'cancelled', invoiceDate: yearRange(year) } },
      { $group: { _id: '$customerSnapshot.companyName', count: { $sum: 1 }, totalCents: { $sum: '$totalGrossCents' } } },
      { $sort: { count: -1 } },
    ]) : none,
    // -- POS returns --
    needsReturns ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, totalGrossCents: { $lt: 0 }, invoiceDate: yearRange(year) } },
      { $unwind: '$lineItems' },
      { $group: { _id: { $ifNull: ['$lineItems.description','$lineItems.itemName'] }, returnedQty: { $sum: '$lineItems.quantity' }, returnedValueCents: { $sum: { $abs: '$lineItems.totalGrossCents' } }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } }, { $sort: { returnedValueCents: -1 } },
    ]) : none,
    // -- revenue YTD (financial summary) --
    needsFinancial ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['sent','paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]) : none,
    // -- expenses YTD --
    needsFinancial ? VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['approved','paid'] }, invoiceDate: yearRange(year) } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]) : none,
    // -- expenses this month --
    needsFinancial ? VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: { $in: ['approved','paid'] }, invoiceDate: { $gte: thisMonthStart } } },
      { $group: { _id: null, total: { $sum: '$totalGrossCents' } } },
    ]) : none,
    // -- cash balance --
    needsFinancial ? CashBookEntry.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$type', total: { $sum: '$amountCents' } } },
    ]) : none,
    // DATENSCHUTZ: AR aging — bucket totals only, no customer names or invoice numbers
    needsArAging ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: 'sent' } },
      { $addFields: {
        outstanding: { $subtract: ['$totalGrossCents', { $ifNull: ['$paidCents', 0] }] },
        daysOverdue: { $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] },
      }},
      { $match: { outstanding: { $gt: 0 } } },
      { $group: {
        _id: { $switch: { branches: [
          { case: { $lt:  ['$daysOverdue', 0]  }, then: 'current' },
          { case: { $lte: ['$daysOverdue', 30] }, then: '1_30'    },
          { case: { $lte: ['$daysOverdue', 60] }, then: '31_60'   },
          { case: { $lte: ['$daysOverdue', 90] }, then: '61_90'   },
        ], default: '91_plus' } },
        totalCents: { $sum: '$outstanding' },
        count: { $sum: 1 },
      }},
    ]) : none,
    // DATENSCHUTZ: AP aging — bucket totals only, no supplier names or invoice numbers
    needsApAging ? VendorInvoice.aggregate([
      { $match: { tenantId: tid, status: 'approved' } },
      { $addFields: {
        outstanding: { $subtract: ['$totalGrossCents', { $ifNull: ['$paidCents', 0] }] },
        daysOverdue: { $divide: [{ $subtract: [now, '$dueDate'] }, 86400000] },
      }},
      { $match: { outstanding: { $gt: 0 } } },
      { $group: {
        _id: { $switch: { branches: [
          { case: { $lt:  ['$daysOverdue', 0]  }, then: 'current' },
          { case: { $lte: ['$daysOverdue', 30] }, then: '1_30'    },
          { case: { $lte: ['$daysOverdue', 60] }, then: '31_60'   },
          { case: { $lte: ['$daysOverdue', 90] }, then: '61_90'   },
        ], default: '91_plus' } },
        totalCents: { $sum: '$outstanding' },
        count: { $sum: 1 },
      }},
    ]) : none,
    // DATENSCHUTZ: Payroll by cost center only — no employee names or individual salaries
    needsPayrollCost ? Payroll.aggregate([
      { $match: { tenantId: tid, status: 'posted', year } },
      { $unwind: '$entries' },
      { $group: {
        _id:        { $ifNull: ['$entries.costCenterNumber', 'Ohne KST'] },
        grossCents: { $sum: '$entries.totalGrossCents' },
        headcount:  { $sum: 1 },
      }},
      { $sort: { grossCents: -1 } },
    ]) : none,
    // DATENSCHUTZ: Bank account names/bankName only — no IBAN, BIC, or account holder
    needsCashPos ? BankAccount.find({ tenantId: tid, isActive: true }).select('accountName bankName currency glAccount').lean() : Promise.resolve([]),
    // Bank GL balances via posted journal entries (SKR03 bank range: 1200-1299)
    needsCashPos ? JournalEntry.aggregate([
      { $match: { tenantId: tid, status: 'posted' } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountNumber': { $regex: /^12/ } } },
      { $group: {
        _id:         '$lines.accountNumber',
        debitCents:  { $sum: '$lines.debit'  },
        creditCents: { $sum: '$lines.credit' },
      }},
    ]) : none,
    // Budget planned (account-level totals from Budget model)
    needsBudget ? Budget.aggregate([
      { $match: { tenantId: tid } },
      { $group: { _id: '$accountNumber', budgetName: { $first: '$name' }, totalBudgetCents: { $sum: '$budgetCents' } } },
      { $sort: { totalBudgetCents: -1 } },
    ]) : none,
    // Budget actual (posted expense journal lines, SKR03 expense range: 4xxx)
    needsBudget ? JournalEntry.aggregate([
      { $match: { tenantId: tid, status: 'posted', date: yearRange(year) } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountNumber': { $regex: /^4/ } } },
      { $group: {
        _id:         '$lines.accountNumber',
        debitCents:  { $sum: '$lines.debit'  },
        creditCents: { $sum: '$lines.credit' },
      }},
    ]) : none,
    // -- today's sales (paid invoices created today, nets out returns) --
    needsToday ? SalesInvoice.aggregate([
      { $match: { tenantId: tid, status: 'paid', createdAt: { $gte: todayStart, $lt: todayEnd } } },
      { $group: {
        _id:          null,
        netRevenue:   { $sum: '$totalGrossCents' },
        count:        { $sum: 1 },
        returnsCount: { $sum: { $cond: [{ $lt: ['$totalGrossCents', 0] }, 1, 0] } },
        returnsValue: { $sum: { $cond: [{ $lt: ['$totalGrossCents', 0] }, { $abs: '$totalGrossCents' }, 0] } },
      }},
    ]) : none,
    // -- today's return invoice details (individual return invoices with line items) --
    needsToday ? SalesInvoice.find({
      tenantId: tid,
      totalGrossCents: { $lt: 0 },
      createdAt: { $gte: todayStart, $lt: todayEnd },
    }).select('invoiceNumber originalInvoiceNumber notes totalGrossCents lineItems createdAt').lean() : Promise.resolve([]),
  ]);

  // ── 4. Build focused context from fetched data ─────────────────────────────
  const ctx: Record<string, unknown> = { asOf: now.toISOString().split('T')[0], year };

  if (needsSales || needsWeekly) {
    const velMap = new Map((salesLast30dRaw as { _id: string; qty30d: number }[]).map(r => [r._id, r.qty30d]));
    const w7Map  = new Map((salesLast7dRaw  as { _id: string; qty: number; revenue: number }[]).map(r => [r._id, { qty: r.qty, rev: r.revenue / 100 }]));
    const pw7Map = new Map((salesPrev7dRaw  as { _id: string; qty: number; revenue: number }[]).map(r => [r._id, { qty: r.qty, rev: r.revenue / 100 }]));

    const thisMonthRev = Math.round((salesThisMonthRaw[0]?.total ?? 0) / 100);
    const lastMonthRev = Math.round((salesLastMonthRaw[0]?.total ?? 0) / 100);
    ctx.thisMonth      = { name: MONTH_NAMES[now.getMonth()], revenue: thisMonthRev, invoices: salesThisMonthRaw[0]?.count ?? 0 };
    ctx.lastMonth      = { name: MONTH_NAMES[now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1], revenue: lastMonthRev, invoices: salesLastMonthRaw[0]?.count ?? 0 };
    ctx.lastWeekTotal  = { revenue: (salesLast7dRaw as { revenue: number }[]).reduce((s, r) => s + r.revenue, 0) / 100, from: sevenDaysAgo.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
    ctx.prevWeekTotal  = { revenue: (salesPrev7dRaw as { revenue: number }[]).reduce((s, r) => s + r.revenue, 0) / 100 };

    if (needsSales) {
      ctx.monthlyRevenue = (monthlyRevenueRaw as { _id: number; revenue: number; count: number }[]).map(m => ({ month: MONTH_NAMES[m._id - 1], revenue: Math.round(m.revenue / 100), invoices: m.count }));
      ctx.topProducts = (productSalesRaw as { _id: string; totalRevenue: number; totalQty: number; avgUnitPrice: number }[]).map(p => ({
        name: p._id,
        revenueYTD:  Math.round(p.totalRevenue / 100),
        qtyYTD:      p.totalQty,
        vel30d:      velMap.get(p._id) ?? 0,
        lastWeek:    w7Map.get(p._id)  ?? null,
        prevWeek:    pw7Map.get(p._id) ?? null,
      }));
    }

    if (intents.has('weekly')) {
      ctx.weeklyBreakdown = [...w7Map.entries()].map(([name, d]) => {
        const prev = pw7Map.get(name);
        return { name, lastWeekQty: d.qty, lastWeekRevenue: d.rev, prevWeekRevenue: prev?.rev ?? 0, changePercent: prev && prev.rev > 0 ? Math.round(((d.rev - prev.rev) / prev.rev) * 100) : null };
      }).sort((a, b) => b.lastWeekRevenue - a.lastWeekRevenue);
    }
  }

  if (needsInventory) {
    const SERVICE_UNITS = ['stunde','std','tag','monat','pauschal','hour','day','month','flat'];
    const velMap = new Map((salesLast30dRaw as { _id: string; qty30d: number }[]).map(r => [r._id, r.qty30d]));
    type Variant = { productId: unknown; attributes: unknown; stockQuantity: number; costPriceCents: number; unitPriceCents: number; lowStockThreshold: number };
    type SvcItem = { name: string; costPriceCents: number; defaultUnitPriceCents: number; stockQuantity: number; unit?: string };
    type Prod    = { _id: unknown; name: string; isService: boolean; hasVariants: boolean; costPriceCents: number; defaultUnitPriceCents: number; stockQuantity: number; lowStockThreshold: number };
    const variants     = variantCatalogRaw as unknown as Variant[];
    const svcItems     = serviceItemsRaw   as unknown as SvcItem[];
    const products2    = productCatalogRaw as unknown as Prod[];
    const varsByProd   = new Map<string, Variant[]>();
    for (const v of variants) {
      const pid = String(v.productId);
      if (!varsByProd.has(pid)) varsByProd.set(pid, []);
      varsByProd.get(pid)!.push(v);
    }
    const siList = svcItems.map(si => {
      const isSvc = SERVICE_UNITS.includes((si.unit ?? '').toLowerCase());
      const margin = si.defaultUnitPriceCents > 0 && si.costPriceCents > 0 ? Math.round(((si.defaultUnitPriceCents - si.costPriceCents) / si.defaultUnitPriceCents) * 100) : null;
      return { name: si.name, type: isSvc ? 'service' : 'physical_product', stock: isSvc ? null : si.stockQuantity, salePrice: si.defaultUnitPriceCents / 100, margin };
    });
    type InvItem = { name: string; type: string; stock: number | null; salePrice: number; margin: number | null; lowStock?: boolean; daysUntilStockout?: number | null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prodList: InvItem[] = (products2.map((p: any) => {
      const pid = String((p as { _id: unknown })._id);
      if (p.isService) return [{ name: p.name, type: 'service', stock: null, salePrice: p.defaultUnitPriceCents / 100, margin: null }];
      if (p.hasVariants) {
        return (varsByProd.get(pid) ?? []).map(v => {
          const attrs   = Object.entries(v.attributes as Record<string, string>).map(([k, val]) => `${k}: ${val}`).join(', ');
          const price   = v.unitPriceCents   > 0 ? v.unitPriceCents   : p.defaultUnitPriceCents;
          const cost    = v.costPriceCents   > 0 ? v.costPriceCents   : p.costPriceCents;
          const margin  = price > 0 && cost > 0 ? Math.round(((price - cost) / price) * 100) : null;
          const vel     = velMap.get(p.name) ?? 0;
          return { name: `${p.name} (${attrs})`, type: 'physical_product', stock: v.stockQuantity, salePrice: price / 100, margin, lowStock: v.lowStockThreshold > 0 && v.stockQuantity <= v.lowStockThreshold, daysUntilStockout: v.stockQuantity > 0 && vel > 0 ? Math.round(v.stockQuantity / (vel / 30)) : null };
        });
      }
      const margin = p.defaultUnitPriceCents > 0 && p.costPriceCents > 0 ? Math.round(((p.defaultUnitPriceCents - p.costPriceCents) / p.defaultUnitPriceCents) * 100) : null;
      const vel    = velMap.get(p.name) ?? 0;
      return [{ name: p.name, type: 'physical_product', stock: p.stockQuantity, salePrice: p.defaultUnitPriceCents / 100, margin, lowStock: p.lowStockThreshold > 0 && p.stockQuantity <= p.lowStockThreshold, daysUntilStockout: p.stockQuantity > 0 && vel > 0 ? Math.round(p.stockQuantity / (vel / 30)) : null }];
    }).flat() as InvItem[]);
    ctx.inventory = [...siList, ...prodList];

    if (intents.has('promotion')) {
      const allInv   = ctx.inventory as { name: string; margin: number | null; salePrice: number }[];
      const topProds = productSalesRaw as { _id: string; totalRevenue: number }[];
      const avgRev   = topProds.length > 0 ? topProds.reduce((s, p) => s + p.totalRevenue, 0) / topProds.length / 100 : 0;
      ctx.promotionCandidates = allInv
        .filter(i => (i.margin ?? 0) >= 35)
        .map(i => {
          const rev = Math.round((topProds.find(p => p._id === i.name || p._id.startsWith(i.name.split(' (')[0]))?.totalRevenue ?? 0) / 100);
          return { name: i.name, marginPct: i.margin, revenueYTD: rev, reason: rev < avgRev ? 'hidden gem — high margin, below-average sales' : 'double-down — high margin + strong sales' };
        })
        .sort((a, b) => (b.marginPct ?? 0) - (a.marginPct ?? 0))
        .slice(0, 6);
    }
  }

  if (needsCustomers) {
    ctx.topCustomers = (topCustomersRaw as { _id: string; total: number; count: number }[]).map(c => ({ name: c._id, revenue: Math.round(c.total / 100), invoices: c.count }));
  }

  if (needsReturns) {
    ctx.posReturns         = posReturnsRaw.length  === 0 ? 'No POS returns this year.'          : posReturnsRaw.map(r => ({ product: r._id, returnedQty: r.returnedQty, returnedValue: Math.round((r.returnedValueCents as number) / 100) }));
    ctx.creditNoteReturns  = creditNotesRaw.length === 0 ? 'No credit note returns this year.'  : creditNotesRaw.map(r => ({ product: r._id, returnedQty: r.returnedQty, returnedValue: Math.round((r.returnedValueCents as number) / 100) }));
    ctx.cancelledInvoices  = cancelledRaw.length   === 0 ? 'No cancelled invoices this year.'   : cancelledRaw.map(c => ({ customer: c._id, count: c.count, value: Math.round((c.totalCents as number) / 100) }));
  }

  if (needsToday) {
    type TodayRow = { _id: null; netRevenue: number; count: number; returnsCount: number; returnsValue: number };
    const t = (todaySalesRaw as TodayRow[])[0];
    ctx.todaySales = {
      date:         todayStart.toISOString().split('T')[0],
      netRevenue:   Math.round((t?.netRevenue   ?? 0) / 100),
      invoiceCount: t?.count        ?? 0,
      returnsCount: t?.returnsCount ?? 0,
      returnsValue: Math.round((t?.returnsValue ?? 0) / 100),
    };

    // Individual return invoice details for today
    type ReturnDoc = {
      invoiceNumber: string;
      originalInvoiceNumber?: string;
      notes?: string;
      totalGrossCents: number;
      lineItems: { description?: string; itemName?: string; quantity: number; totalGrossCents: number }[];
    };
    const returnDocs = todayReturnDetailsRaw as ReturnDoc[];
    if (returnDocs.length > 0) {
      ctx.todayReturnDetails = returnDocs.map(inv => ({
        invoiceNumber: inv.invoiceNumber,
        refundTotal:   Math.round(Math.abs(inv.totalGrossCents) / 100),
        originalRef:   inv.originalInvoiceNumber
                        ?? inv.notes?.match(/Rückgabe zu (.+)/)?.[1]
                        ?? null,
        items: inv.lineItems.map(li => ({
          product: li.description || li.itemName || 'Unknown',
          qty:     Math.abs(li.quantity),
          refund:  Math.round(Math.abs(li.totalGrossCents) / 100),
        })),
      }));
    } else {
      ctx.todayReturnDetails = 'No returns today.';
    }
  }

  if (needsFinancial) {
    const revenueYTD        = Math.round((revenueYTDRaw[0]?.total ?? 0) / 100);
    const expensesYTD       = Math.round((expensesYTDRaw[0]?.total ?? 0) / 100);
    const expensesThisMo    = Math.round((expensesThisMonthRaw[0]?.total ?? 0) / 100);
    const revenueThisMo     = Math.round((salesThisMonthRaw[0]?.total ?? 0) / 100);
    const revenueLastMo     = Math.round((salesLastMonthRaw[0]?.total ?? 0) / 100);
    const cashByType: Record<string, number> = {};
    for (const c of cashBalanceRaw as { _id: string; total: number }[]) cashByType[c._id] = c.total;
    ctx.financialSummary = {
      revenueYTD,
      expensesYTD,
      profitYTD:          revenueYTD - expensesYTD,
      revenueThisMonth:   revenueThisMo,
      expensesThisMonth:  expensesThisMo,
      profitThisMonth:    revenueThisMo - expensesThisMo,
      revenueLastMonth:   revenueLastMo,
      cashBalance:        Math.round(((cashByType['receipt'] ?? 0) - (cashByType['payment'] ?? 0)) / 100),
    };
  }

  if (needsArAging) {
    const ORDER  = ['current', '1_30', '31_60', '61_90', '91_plus'];
    const LABELS: Record<string, string> = { current: 'Nicht fällig', '1_30': '1-30 Tage', '31_60': '31-60 Tage', '61_90': '61-90 Tage', '91_plus': 'Über 90 Tage' };
    ctx.arAging = ORDER.map(k => {
      const r = (arAgingRaw as { _id: string; totalCents: number; count: number }[]).find(x => x._id === k);
      return { bucket: LABELS[k], totalEur: Math.round((r?.totalCents ?? 0) / 100), count: r?.count ?? 0 };
    });
  }

  if (needsApAging) {
    const ORDER  = ['current', '1_30', '31_60', '61_90', '91_plus'];
    const LABELS: Record<string, string> = { current: 'Nicht fällig', '1_30': '1-30 Tage', '31_60': '31-60 Tage', '61_90': '61-90 Tage', '91_plus': 'Über 90 Tage' };
    ctx.apAging = ORDER.map(k => {
      const r = (apAgingRaw as { _id: string; totalCents: number; count: number }[]).find(x => x._id === k);
      return { bucket: LABELS[k], totalEur: Math.round((r?.totalCents ?? 0) / 100), count: r?.count ?? 0 };
    });
  }

  if (needsPayrollCost) {
    ctx.payrollByCostCenter = (payrollCostRaw as { _id: string; grossCents: number; headcount: number }[])
      .map(r => ({ costCenter: r._id, grossEur: Math.round(r.grossCents / 100), headcount: r.headcount }));
  }

  if (needsCashPos) {
    type BankRow = { accountName: string; bankName: string; currency: string; glAccount: string };
    type GLRow   = { _id: string; debitCents: number; creditCents: number };
    const glMap  = new Map((bankGLRaw as GLRow[]).map(r => [r._id, Math.round((r.debitCents - r.creditCents) / 100)]));
    ctx.cashPosition = (bankAccountsRaw as unknown as BankRow[]).map(b => ({
      name:       b.accountName,
      bank:       b.bankName,
      currency:   b.currency,
      balanceEur: glMap.get(b.glAccount) ?? 0,
    }));
  }

  if (needsBudget) {
    type BdgRow = { _id: string; budgetName: string; totalBudgetCents: number };
    type ActRow = { _id: string; debitCents: number; creditCents: number };
    const bdgMap = new Map((budgetPlannedRaw as BdgRow[]).map(r => [r._id, { name: r.budgetName, planned: Math.round(r.totalBudgetCents / 100) }]));
    const actMap = new Map((budgetActualRaw as ActRow[]).map(r => [r._id, Math.round((r.debitCents - r.creditCents) / 100)]));
    const accs   = new Set([...bdgMap.keys(), ...actMap.keys()]);
    ctx.budgetVsActual = [...accs]
      .map(acc => {
        const b       = bdgMap.get(acc);
        const actual  = actMap.get(acc) ?? 0;
        const planned = b?.planned ?? 0;
        return { account: acc, name: b?.name ?? acc, plannedEur: planned, actualEur: actual, varianceEur: planned - actual };
      })
      .filter(x => x.plannedEur > 0 || x.actualEur > 0)
      .sort((a, b) => Math.abs(b.varianceEur) - Math.abs(a.varianceEur))
      .slice(0, 10);
  }

  // ── 5. Build system prompt (compact, intent-targeted) ──────────────────────
  const systemPrompt = `You are a sales and inventory assistant for a German SME ERP system.
RULES:
- Plain text only. No markdown, no asterisks, no dashes as bullets. Use numbered lines for lists: "1. Item — detail"
- Short and direct (2-4 sentences). Give full breakdown only if explicitly asked.
- Match the user's language (German or English).
- Only answer about: sales, inventory, returns, customers, financial metrics, AR/AP aging, payroll costs, cash position, budget vs actual. Redirect anything else in one sentence.
- Use exact numbers from the data. Never invent figures.
- CURRENCY: All numeric monetary fields in DATA (revenue, netRevenue, returnedValue, grossRevenue, total, balanceEur, etc.) are already in EUR (cents divided by 100). ALWAYS display them with € — write "€85" or "85 €", never bare "85". Never omit the € symbol.
- type:"service" items have no physical stock — never say "out of stock" for them.
- "Last week" = ${sevenDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]} (lastWeekTotal / weeklyBreakdown).
- RETURNS — READ CAREFULLY: There are two completely separate return data sources. Do NOT mix them up:
  1. todaySales.returnsCount / todaySales.returnsValue = TODAY ONLY: count and total refund of return invoices issued today. Use ONLY these for "how many returns today / today's return value".
  2. todayReturnDetails = TODAY ONLY: the individual return invoices with invoice number, refund total, original invoice reference, and line items (product, qty, refund). Use this when asked for details/breakdown of today's returns.
  3. posReturns = YEAR-TO-DATE product breakdown: units returned and refund value per product across the whole year. Do NOT use posReturns quantities to answer questions about today's returns.
  4. creditNoteReturns = credit note returns YTD. cancelledInvoices = Storno YTD.
- "how many returns today?" → todaySales.returnsCount. "what were today's returns?" → todayReturnDetails. "which products returned this year?" → posReturns.
- financialSummary has profitThisMonth = revenueThisMonth − expensesThisMonth.
- financialSummary.cashBalance = Kassenbuch (petty cash register ONLY — NOT bank accounts). Never say this is a bank balance.
- cashPosition = array of bank accounts: each has name, bank, currency, balanceEur from the GL. This is separate from cashBalance.
- CRITICAL: If user asks "in a bank?" or "bank account balance" or "how much in bank" — check DATA for cashPosition. If cashPosition is present, list each entry (name + balanceEur). If cashPosition is absent, say the bank account data wasn't loaded for this query and suggest they ask about "Bankstand" or "bank balance".
- If both cashBalance AND cashPosition exist in DATA: cashBalance = Kasse (cash drawer/petty cash); cashPosition entries = Bankkonten. Treat them as two separate things.
- promotionCandidates = high-margin products worth promoting; cite margin % and reason.
- arAging = accounts receivable aging by bucket [Nicht fällig / 1-30 / 31-60 / 61-90 / Über 90 Tage], totalEur and count. No customer names (DSGVO).
- apAging = same structure for accounts payable (what the company owes suppliers). No supplier names (DSGVO).
- payrollByCostCenter = YTD gross payroll aggregated by cost center number. No employee names or individual salaries (DSGVO).
- budgetVsActual = planned vs actual spend per budget account; varianceEur = planned − actual (positive = under budget, negative = over budget).
Today: ${now.toISOString().split('T')[0]} | Intents detected: ${[...intents].join(', ')}

DATA:
${JSON.stringify(ctx, null, 2)}`;

  // ── 6. Call OpenAI with focused context ────────────────────────────────────
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...history.slice(-6),
      { role: 'user', content: message },
    ],
    max_tokens: 500,
    temperature: 0.3,
  });

  res.json({ reply: completion.choices[0]?.message?.content ?? 'Keine Antwort erhalten.' });
}));

export default router;
