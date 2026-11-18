import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../utils/asyncHandler';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { FiscalYear } from '../models/FiscalYear';
import { SalesInvoice } from '../models/SalesInvoice';
import { VendorInvoice } from '../models/VendorInvoice';
import { CompanySettings } from '../models/CompanySettings';

const router = Router();
router.use(requireAuth);
router.use(requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'));

function buildDateFilter(q: Record<string, unknown>, fyId?: string, from?: string, to?: string) {
  if (fyId) q.fiscalYearId = fyId;
  if (from || to) {
    q.date = {} as Record<string, Date>;
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }
}

// Aggregate posted journal lines into a net-by-account map
// net = credit - debit (positive = credit-side balance, negative = debit-side balance)
async function netByAccount(tenantId: unknown, q: Record<string, unknown>): Promise<Map<string, { net: number; name: string }>> {
  const entries = await JournalEntry.find(q).select('lines');
  const map = new Map<string, { net: number; name: string }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const prev = map.get(line.accountNumber) ?? { net: 0, name: line.accountName ?? line.accountNumber };
      prev.net += (line.credit ?? 0) - (line.debit ?? 0);
      map.set(line.accountNumber, prev);
    }
  }
  return map;
}

// ── GET /api/reports/fiscal-years — list FYs for filter dropdowns ─────────────
router.get('/fiscal-years', asyncHandler(async (req, res) => {
  const fys = await FiscalYear.find({ tenantId: req.tenantId }).sort({ startDate: -1 });
  res.json({ fiscalYears: fys });
}));

// ── GET /api/reports/susa — Summen und Salden (Trial Balance) ─────────────────
router.get('/susa', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const entries = await JournalEntry.find(q).select('lines');

  // Aggregate debit/credit totals separately (not net)
  const map = new Map<string, { debit: number; credit: number; name: string }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const prev = map.get(line.accountNumber) ?? { debit: 0, credit: 0, name: line.accountName ?? line.accountNumber };
      prev.debit  += line.debit  ?? 0;
      prev.credit += line.credit ?? 0;
      map.set(line.accountNumber, prev);
    }
  }

  // Enrich with account master data
  const accounts = await Account.find({ tenantId: req.tenantId }).select('number name type');
  const acctMaster = new Map(accounts.map(a => [a.number, { name: a.name, type: a.type }]));

  const rows = Array.from(map.entries())
    .map(([number, { debit, credit, name }]) => {
      const master  = acctMaster.get(number);
      const balance = Math.round((debit - credit) * 100) / 100;
      return {
        number,
        name:          master?.name ?? name,
        type:          master?.type ?? '',
        debit:         Math.round(debit  * 100) / 100,
        credit:        Math.round(credit * 100) / 100,
        debitBalance:  balance > 0 ? balance : 0,
        creditBalance: balance < 0 ? Math.abs(balance) : 0,
      };
    })
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  const totalDebit         = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit        = rows.reduce((s, r) => s + r.credit, 0);
  const totalDebitBalance  = rows.reduce((s, r) => s + r.debitBalance, 0);
  const totalCreditBalance = rows.reduce((s, r) => s + r.creditBalance, 0);

  res.json({
    rows,
    totals: {
      debit:         Math.round(totalDebit         * 100) / 100,
      credit:        Math.round(totalCredit        * 100) / 100,
      debitBalance:  Math.round(totalDebitBalance  * 100) / 100,
      creditBalance: Math.round(totalCreditBalance * 100) / 100,
    },
  });
}));

// ── SKR03 BWA groupings ────────────────────────────────────────────────────────
// sign: +1 = revenue-type (credit-heavy in normal operation), -1 = expense-type
const BWA_GROUPS = [
  { key: 'revenue',      label: 'Umsatzerlöse',                  from: '8000', to: '8999', sign:  1 },
  { key: 'cogs',         label: 'Wareneinsatz / Materialeinsatz', from: '3000', to: '3999', sign: -1 },
  { key: 'personnel',    label: 'Personalkosten',                 from: '4100', to: '4399', sign: -1 },
  { key: 'depreciation', label: 'Abschreibungen',                 from: '4800', to: '4899', sign: -1 },
  { key: 'other_ops',    label: 'Sonstige betriebliche Kosten',   from: '4400', to: '4799', sign: -1 },
  { key: 'misc_exp',     label: 'Sonstige Aufwendungen',          from: '4900', to: '7299', sign: -1 },
  { key: 'interest_exp', label: 'Zinsaufwand',                    from: '7300', to: '7399', sign: -1 },
  { key: 'interest_inc', label: 'Zinserträge',                    from: '2600', to: '2699', sign:  1 },
] as const;

function sumGroup(netMap: Map<string, { net: number }>, from: string, to: string, sign: number): number {
  let total = 0;
  for (const [acct, { net }] of netMap) {
    // lexicographic comparison works for 4-digit SKR03 account numbers
    if (acct >= from && acct <= to) total += net;
  }
  return Math.round(total * sign * 100) / 100;
}

// ── GET /api/reports/bwa — Betriebswirtschaftliche Auswertung ─────────────────
router.get('/bwa', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const netMap = await netByAccount(req.tenantId, q);

  const groups = BWA_GROUPS.map(g => ({
    key:   g.key,
    label: g.label,
    value: sumGroup(netMap, g.from, g.to, g.sign),
  }));

  const byKey = Object.fromEntries(groups.map(g => [g.key, g.value]));

  const revenue     = byKey['revenue']      ?? 0;
  const cogs        = byKey['cogs']         ?? 0;
  const grossProfit = Math.round((revenue - cogs) * 100) / 100;

  const opExp = ['personnel', 'depreciation', 'other_ops', 'misc_exp']
    .reduce((s, k) => s + (byKey[k] ?? 0), 0);
  const ebit = Math.round((grossProfit - opExp) * 100) / 100;

  const interestInc = byKey['interest_inc'] ?? 0;
  const interestExp = byKey['interest_exp'] ?? 0;
  const finResult   = Math.round((interestInc - interestExp) * 100) / 100;
  const ebt         = Math.round((ebit + finResult) * 100) / 100;

  res.json({
    groups,
    summary: { revenue, cogs, grossProfit, opExp, ebit, interestInc, interestExp, finResult, ebt },
  });
}));

// ── GET /api/reports/guv — Gewinn und Verlust (Income Statement) ───────────────
router.get('/guv', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const netMap = await netByAccount(req.tenantId, q);

  const revenueLines: { number: string; name: string; amount: number }[] = [];
  const expenseLines: { number: string; name: string; amount: number }[] = [];

  for (const [number, { net, name }] of netMap) {
    const n = parseInt(number, 10);
    if (n >= 8000 && n <= 8999) {
      // Revenue accounts are credit-heavy: net = credit - debit = positive
      revenueLines.push({ number, name, amount: Math.round(net * 100) / 100 });
    } else if ((n >= 4000 && n <= 7999)) {
      // Expense accounts are debit-heavy: net = credit - debit = negative; flip sign for display
      const amount = Math.round(-net * 100) / 100;
      if (amount !== 0) expenseLines.push({ number, name, amount });
    }
  }

  revenueLines.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
  expenseLines.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));

  const totalRevenue  = Math.round(revenueLines.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const totalExpenses = Math.round(expenseLines.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const netResult     = Math.round((totalRevenue - totalExpenses) * 100) / 100;

  res.json({ revenueLines, expenseLines, totalRevenue, totalExpenses, netResult });
}));

// ── GET /api/reports/bilanz — Balance Sheet ────────────────────────────────────
// SKR03 balance sheet groupings
const BS_AKTIVA = [
  { key: 'fixed_assets', label: 'Anlagevermögen',             from: '0000', to: '0999' },
  { key: 'cash_bank',    label: 'Kasse / Bank',               from: '1000', to: '1199' },
  { key: 'ar',           label: 'Forderungen aus L&L',        from: '1200', to: '1299' },
  { key: 'other_rec',    label: 'Sonstige Forderungen',       from: '1300', to: '1499' },
  { key: 'input_vat',    label: 'Vorsteuer',                  from: '1500', to: '1599' },
] as const;

const BS_PASSIVA = [
  { key: 'equity',       label: 'Eigenkapital',               from: '2000', to: '2099' },
  { key: 'lt_liab',      label: 'Langfristige Verbindlichkeiten', from: '2100', to: '2999' },
  { key: 'ap',           label: 'Verbindlichkeiten aus L&L',  from: '1600', to: '1699' },
  { key: 'tax_liab',     label: 'Steuerverbindlichkeiten',    from: '1770', to: '1799' },
  { key: 'other_liab',   label: 'Sonstige Verbindlichkeiten', from: '1700', to: '1769' },
] as const;

router.get('/bilanz', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const entries = await JournalEntry.find(q).select('lines');

  // net[acct] = debit - credit: positive = debit-heavy (asset), negative = credit-heavy (liability/equity)
  const net = new Map<string, { net: number; name: string }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const prev = net.get(line.accountNumber) ?? { net: 0, name: line.accountName ?? line.accountNumber };
      prev.net += (line.debit ?? 0) - (line.credit ?? 0);
      net.set(line.accountNumber, prev);
    }
  }

  type BsLine = { number: string; name: string; amount: number };

  function rangeLines(from: string, to: string, wantPositive: boolean): { lines: BsLine[]; total: number } {
    const lines: BsLine[] = [];
    for (const [number, { net: n, name }] of net) {
      if (number < from || number > to) continue;
      if (Math.abs(n) < 0.001) continue;
      if (wantPositive && n > 0) lines.push({ number, name, amount: Math.round(n * 100) / 100 });
      if (!wantPositive && n < 0) lines.push({ number, name, amount: Math.round(-n * 100) / 100 });
    }
    lines.sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    return { lines, total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100 };
  }

  const aktivaGroups = BS_AKTIVA
    .map(g => { const { lines, total } = rangeLines(g.from, g.to, true); return { key: g.key, label: g.label, lines, total }; })
    .filter(g => g.lines.length > 0);

  const passivaGroups = BS_PASSIVA
    .map(g => { const { lines, total } = rangeLines(g.from, g.to, false); return { key: g.key, label: g.label, lines, total }; })
    .filter(g => g.lines.length > 0);

  // Jahresergebnis = -(net of all P&L accounts 3xxx-8xxx)
  // Revenue (8xxx) is credit-heavy → net < 0; Expenses are debit-heavy → net > 0
  // Profit = revenue - expenses = -sum(P&L nets)
  let guv = 0;
  for (const [number, { net: n }] of net) {
    const num = parseInt(number, 10);
    if (num >= 3000 && num <= 8999) guv -= n;
  }
  guv = Math.round(guv * 100) / 100;

  const totalAktiva  = Math.round(aktivaGroups.reduce((s, g) => s + g.total, 0) * 100) / 100;
  const totalPassiva = Math.round((passivaGroups.reduce((s, g) => s + g.total, 0) + guv) * 100) / 100;

  res.json({ aktivaGroups, passivaGroups, guv, totalAktiva, totalPassiva });
}));

// ── GET /api/reports/ust — USt-Voranmeldung (VAT advance return preview) ──────
router.get('/ust', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const entries = await JournalEntry.find(q).select('lines date entryNumber description sourceType sourceId');

  // Accumulate debit/credit totals per account
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const prev = totals.get(line.accountNumber) ?? { debit: 0, credit: 0 };
      prev.debit  += line.debit  ?? 0;
      prev.credit += line.credit ?? 0;
      totals.set(line.accountNumber, prev);
    }
  }

  // credit-heavy accounts: net = credit - debit > 0 (liabilities/revenue)
  // debit-heavy accounts:  net = debit - credit > 0 (assets/expenses)
  const creditNet = (acct: string) => {
    const t = totals.get(acct);
    return t ? Math.round((t.credit - t.debit) * 100) / 100 : 0;
  };
  const debitNet = (acct: string) => {
    const t = totals.get(acct);
    return t ? Math.round((t.debit - t.credit) * 100) / 100 : 0;
  };

  // Umsatzsteuer (output VAT) — credit-heavy liabilities
  const ust19 = creditNet('1776'); // 19% USt
  const ust7  = creditNet('1771'); // 7% USt

  // Vorsteuer (input VAT) — debit-heavy assets
  const vst19 = debitNet('1576'); // 19% Vorsteuer
  const vst7  = debitNet('1571'); // 7% Vorsteuer

  // Revenue base amounts (Bemessungsgrundlage) — credit-heavy revenue accounts
  const rev19 = creditNet('8400'); // Erlöse 19%
  const rev7  = creditNet('8300'); // Erlöse 7%
  // Also check other common revenue accounts
  const revOther = creditNet('8100') + creditNet('8200');

  // Purchase base amounts (Einkauf netto) — debit-heavy expense accounts
  const purch19 = debitNet('4200') + debitNet('3200');
  const purch7  = debitNet('4100') + debitNet('3100');

  const totalOutput = Math.round((ust19 + ust7) * 100) / 100;
  const totalInput  = Math.round((vst19 + vst7) * 100) / 100;
  const zahllast    = Math.round((totalOutput - totalInput) * 100) / 100;

  res.json({
    umsaetze: [
      { rate: 19, base: rev19,   ust: ust19,  kz: 81 },
      { rate: 7,  base: rev7,    ust: ust7,   kz: 86 },
      ...(revOther > 0 ? [{ rate: 0, base: revOther, ust: 0, kz: 48 }] : []),
    ],
    einkauf: [
      { rate: 19, base: purch19, vst: vst19, kz: 66 },
      { rate: 7,  base: purch7,  vst: vst7,  kz: 66 },
    ],
    totalOutput,
    totalInput,
    zahllast,
  });
}));

// ── Aging bucket helper ────────────────────────────────────────────────────────
function agingBucket(daysOverdue: number): 'current' | '1-30' | '31-60' | '61-90' | '90+' {
  if (daysOverdue <= 0)  return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

// ── GET /api/reports/ar — Offene Posten Debitoren (Open AR / Accounts Receivable) ──
router.get('/ar', asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await SalesInvoice.find({
    tenantId: req.tenantId,
    status:   'sent',            // sent = open (paid/cancelled excluded)
  }).select('invoiceNumber customerId customerSnapshot invoiceDate dueDate totalGrossCents paidCents sentAt').sort({ dueDate: 1 });

  const items = invoices.map(inv => {
    const openCents   = inv.totalGrossCents - inv.paidCents;
    const due         = new Date(inv.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return {
      _id:         String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      customerId:  String(inv.customerId),
      companyName: inv.customerSnapshot.companyName,
      invoiceDate: inv.invoiceDate,
      dueDate:     inv.dueDate,
      daysOverdue,
      openCents,
      bucket:      agingBucket(daysOverdue),
    };
  });

  // Bucket totals
  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let totalOpen = 0;
  for (const item of items) {
    buckets[item.bucket] += item.openCents;
    totalOpen            += item.openCents;
  }

  res.json({ items, totalOpen, buckets });
}));

// ── GET /api/reports/ap — Offene Posten Kreditoren (Open AP / Accounts Payable) ──
router.get('/ap', asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await VendorInvoice.find({
    tenantId: req.tenantId,
    status:   'approved',        // approved = open (paid/cancelled excluded)
  }).select('supplierInvoiceNumber supplierId supplierSnapshot invoiceDate dueDate totalGrossCents paidCents approvedAt').sort({ dueDate: 1 });

  const items = invoices.map(inv => {
    const openCents   = inv.totalGrossCents - inv.paidCents;
    const due         = new Date(inv.dueDate);
    due.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86_400_000);
    return {
      _id:           String(inv._id),
      invoiceNumber: inv.supplierInvoiceNumber,
      supplierId:    String(inv.supplierId),
      companyName:   inv.supplierSnapshot.companyName,
      invoiceDate:   inv.invoiceDate,
      dueDate:       inv.dueDate,
      daysOverdue,
      openCents,
      bucket:        agingBucket(daysOverdue),
    };
  });

  const buckets = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  let totalOpen = 0;
  for (const item of items) {
    buckets[item.bucket] += item.openCents;
    totalOpen            += item.openCents;
  }

  res.json({ items, totalOpen, buckets });
}));

// ── GET /reports/datev-export ─────────────────────────────────────────────────
// Generates a DATEV EXTF Buchungsstapel CSV file for download.
// One row per journal LINE (debit or credit), paired with its counter account.
router.get('/datev-export', asyncHandler(async (req, res) => {
  const { fyId, from, to } = req.query as Record<string, string>;

  const settings = await CompanySettings.findOne({ tenantId: req.tenantId });
  const beraternr  = settings?.datevBeraternummer  || '0';
  const mandantnr  = settings?.datevMandantennummer || '0';
  const kontenlaenge = 4; // standard SKR03/04 account length

  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  buildDateFilter(q, fyId, from, to);

  const entries = await JournalEntry.find(q).sort({ date: 1, entryNumber: 1 });

  if (entries.length === 0) {
    res.status(404).json({ message: 'Keine gebuchten Buchungssätze im gewählten Zeitraum.' });
    return;
  }

  // Determine date range for header
  const dates    = entries.map(e => e.date);
  const dateFrom = new Date(Math.min(...dates.map(d => d.getTime())));
  const dateTo   = new Date(Math.max(...dates.map(d => d.getTime())));

  function datevDate(d: Date) {
    // DATEV Belegdatum: DDMM (4 chars) without year — year comes from header
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}${mm}`;
  }
  function datevDateFull(d: Date) {
    // YYYYMMDD for header
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  }
  function fmtAmount(eur: number) {
    // DATEV uses comma as decimal separator, no currency symbol
    return Math.abs(eur).toFixed(2).replace('.', ',');
  }
  function truncate(s: string, len: number) {
    return s.replace(/[";]/g, ' ').slice(0, len);
  }

  // DATEV EXTF header line (row 1)
  const wirtschaftsjahrBeginn = from ? from.replace(/-/g, '').slice(0, 8) : `${dateFrom.getFullYear()}0101`;
  const header1 = [
    '"EXTF"', '700', '21', '"Buchungsstapel"', '5', '',
    '""', '""', '""', '""',
    beraternr, mandantnr,
    wirtschaftsjahrBeginn,
    kontenlaenge,
    datevDateFull(dateFrom),
    datevDateFull(dateTo),
    '"ERP-Export"', '0', '', '1', '0', '0', '0', '0', '""', '0',
  ].join(';');

  // Column header line (row 2) — standard DATEV Buchungsstapel fields
  const header2 = [
    '"Umsatz (ohne Soll/Haben-Kz)"',
    '"Soll/Haben-Kennzeichen"',
    '"WKZ Umsatz"',
    '"Kurs"',
    '"Basis-Umsatz"',
    '"WKZ Basis-Umsatz"',
    '"Konto"',
    '"Gegenkonto (ohne BU-Schlüssel)"',
    '"BU-Schlüssel"',
    '"Belegdatum"',
    '"Belegfeld 1"',
    '"Belegfeld 2"',
    '"Skonto"',
    '"Buchungstext"',
  ].join(';');

  const rows: string[] = [header1, header2];

  for (const entry of entries) {
    const debitLines  = entry.lines.filter(l => l.debit  > 0);
    const creditLines = entry.lines.filter(l => l.credit > 0);

    // For each debit line, pair with first credit account as Gegenkonto
    const primaryCredit = creditLines[0]?.accountNumber ?? '';
    for (const dl of debitLines) {
      rows.push([
        fmtAmount(dl.debit),
        'S',
        'EUR',
        '', '', '',
        dl.accountNumber,
        primaryCredit,
        '',
        datevDate(entry.date),
        `"${truncate(entry.entryNumber, 12)}"`,
        `"${truncate(entry.reference ?? '', 12)}"`,
        '',
        `"${truncate(dl.description ?? entry.description, 60)}"`,
      ].join(';'));
    }

    // For each credit line, pair with first debit account as Gegenkonto (skip if already captured above)
    if (debitLines.length > 1 || creditLines.length > 1) {
      const primaryDebit = debitLines[0]?.accountNumber ?? '';
      for (const cl of creditLines) {
        rows.push([
          fmtAmount(cl.credit),
          'H',
          'EUR',
          '', '', '',
          cl.accountNumber,
          primaryDebit,
          '',
          datevDate(entry.date),
          `"${truncate(entry.entryNumber, 12)}"`,
          `"${truncate(entry.reference ?? '', 12)}"`,
          '',
          `"${truncate(cl.description ?? entry.description, 60)}"`,
        ].join(';'));
      }
    }
  }

  // DATEV expects Windows-1252 but UTF-8 with BOM works in modern DATEV versions
  const csv = '﻿' + rows.join('\r\n');
  const filename = `DATEV_Export_${datevDateFull(dateFrom)}_${datevDateFull(dateTo)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

export default router;
