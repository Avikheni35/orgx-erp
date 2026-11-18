import ExcelJS from 'exceljs';
import { Router } from 'express';
import { env } from '../config/env';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { gobdHash } from '../utils/crypto';
import { nextSeq } from '../models/Counter';
import { JournalEntry } from '../models/JournalEntry';
import { Account } from '../models/Account';
import { Period } from '../models/Period';
import { FiscalYear } from '../models/FiscalYear';
import { reverseSalesInvoiceInventory } from '../utils/autoPost';
import { Types } from 'mongoose';

const router = Router();
router.use(requireAuth);

// ── Schemas ──────────────────────────────────────────────────────────────────
const lineSchema = z.object({
  accountNumber: z.string().min(1),
  debit:         z.number().min(0).default(0),
  credit:        z.number().min(0).default(0),
  costCenter:    z.string().optional().default(''),
  description:   z.string().optional().default(''),
});

const createSchema = z.object({
  date:        z.string().refine((d) => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  description: z.string().min(1).max(200),
  reference:   z.string().optional().default(''),
  lines:       z.array(lineSchema).min(2, 'Mindestens 2 Buchungszeilen erforderlich'),
});

// ── Helpers ──────────────────────────────────────────────────────────────────
async function resolveAccountName(tenantId: string, number: string): Promise<string> {
  const acct = await Account.findOne({ tenantId, number }, { name: 1 });
  return acct?.name ?? number;
}

async function resolvePeriodAndYear(tenantId: string, date: Date) {
  const period = await Period.findOne({
    tenantId,
    startDate: { $lte: date },
    endDate:   { $gte: date },
  });
  if (!period) return { periodId: undefined, fiscalYearId: undefined };
  const fy = await FiscalYear.findOne({ tenantId, _id: period.fiscalYearId });
  return { periodId: period._id, fiscalYearId: fy?._id };
}

// ── GET /api/journal ──────────────────────────────────────────────────────────
router.get('/', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { status, account, from, to, sourceType, sourceId, page = '1', limit = '50' } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId };

  if (status)     q.status     = status;
  if (account)    q['lines.accountNumber'] = account;
  if (sourceType) q.sourceType = sourceType;
  if (sourceId)   q.sourceId   = sourceId;
  if (from || to) {
    q.date = {};
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await JournalEntry.countDocuments(q);
  const entries = await JournalEntry.find(q)
    .sort({ _id: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  res.json({ entries, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
}));

// ── POST /api/journal ─────────────────────────────────────────────────────────
router.post('/', requireRole('erp_admin', 'erp_accountant'), validate(createSchema), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof createSchema>;
  const date = new Date(body.date);

  // Validate balanced entry
  const totalDebit  = body.lines.reduce((s, l) => s + (l.debit  ?? 0), 0);
  const totalCredit = body.lines.reduce((s, l) => s + (l.credit ?? 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    throw new AppError(`Buchungssatz nicht ausgeglichen: Soll ${totalDebit.toFixed(2)} ≠ Haben ${totalCredit.toFixed(2)}`, 400);
  }
  if (totalDebit === 0) throw new AppError('Buchungssatz darf nicht leer sein (Betrag 0).', 400);

  // Validate accounts exist and are active
  for (const line of body.lines) {
    const acct = await Account.findOne({ tenantId: req.tenantId, number: line.accountNumber, isActive: true });
    if (!acct) throw new AppError(`Konto ${line.accountNumber} nicht gefunden oder inaktiv.`, 400);
  }

  // Resolve account names
  const lines = await Promise.all(
    body.lines.map(async (l) => ({
      ...l,
      accountName: await resolveAccountName(String(req.tenantId), l.accountNumber),
    }))
  );

  const { periodId, fiscalYearId } = await resolvePeriodAndYear(String(req.tenantId), date);

  const entryNumber = await nextSeq(String(req.tenantId), 'journal');
  const entryNumStr = `BU-${String(entryNumber).padStart(6, '0')}`;

  const hash = gobdHash({
    tenantId:    String(req.tenantId),
    entryNumber: entryNumStr,
    date:        date.toISOString(),
    description: body.description,
    lines,
    totalDebit,
    totalCredit,
  });

  const entry = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: entryNumStr,
    date,
    description: body.description,
    reference:   body.reference ?? '',
    status:      'draft',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    createdBy:   req.user?.userId,
  });

  res.status(201).json(entry);
}));

// ── GET /api/journal/opening-balances ────────────────────────────────────────
router.get('/opening-balances', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ tenantId: req.tenantId, sourceType: 'OpeningBalance' });
  res.json({ entry: entry ?? null });
}));

// ── POST /api/journal/opening-balances ───────────────────────────────────────
const openingBalanceSchema = z.object({
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Ungültiges Datum'),
  balances: z.array(z.object({
    accountNumber: z.string().min(1),
    debit:         z.number().min(0).default(0),
    credit:        z.number().min(0).default(0),
  })).min(1),
});

router.post('/opening-balances', requireRole('erp_admin', 'erp_accountant'), validate(openingBalanceSchema), asyncHandler(async (req, res) => {
  const body     = req.body as z.infer<typeof openingBalanceSchema>;
  const tenantId = String(req.tenantId);
  const date     = new Date(body.date);

  // Filter out zero lines
  const nonZero = body.balances.filter((b) => b.debit > 0 || b.credit > 0);
  if (nonZero.length === 0) throw new AppError('Mindestens eine Buchungszeile mit Betrag erforderlich.', 400);

  // Validate balance
  const totalDebit  = nonZero.reduce((s, b) => s + b.debit,  0);
  const totalCredit = nonZero.reduce((s, b) => s + b.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError(`Eröffnungsbilanz muss ausgeglichen sein (Soll = Haben). Differenz: ${Math.abs(totalDebit - totalCredit).toFixed(2)} €`, 400);
  }

  // Delete existing opening balance entry if any
  await JournalEntry.deleteOne({ tenantId: req.tenantId, sourceType: 'OpeningBalance' });

  // Resolve account names
  const lines = await Promise.all(
    nonZero.map(async (b) => ({
      accountNumber: b.accountNumber,
      accountName:   await resolveAccountName(tenantId, b.accountNumber),
      debit:         b.debit,
      credit:        b.credit,
      description:   'Eröffnungsbuchung',
    }))
  );

  const { periodId, fiscalYearId } = await resolvePeriodAndYear(tenantId, date);
  const seq    = await nextSeq(tenantId, 'journal');
  const entryNum = `BU-${String(seq).padStart(6, '0')}`;

  const hash = gobdHash({ tenantId, entryNumber: entryNum, date: date.toISOString(), description: 'Eröffnungsbuchung', lines, totalDebit, totalCredit });

  const entry = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: entryNum,
    date,
    description: 'Eröffnungsbuchung',
    status:      'posted',
    lines,
    totalDebit,
    totalCredit,
    periodId,
    fiscalYearId,
    gobdHash:    hash,
    sourceType:  'OpeningBalance',
    createdBy:   req.user?.userId,
    postedAt:    new Date(),
    postedBy:    req.user?.userId,
  });

  res.status(201).json({ entry, message: 'Eröffnungsbuchung gespeichert.' });
}));

// ── GET /api/journal/:id ──────────────────────────────────────────────────────
router.get('/:id', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!entry) throw new AppError('Buchungssatz nicht gefunden.', 404);
  res.json(entry);
}));

// ── POST /api/journal/:id/post ────────────────────────────────────────────────
router.post('/:id/post', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!entry) throw new AppError('Buchungssatz nicht gefunden.', 404);
  if (entry.status !== 'draft') throw new AppError('Nur Entwürfe können gebucht werden.', 400);

  // Period and fiscal year open check at post time
  const period = await Period.findOne({
    tenantId:  req.tenantId,
    startDate: { $lte: entry.date },
    endDate:   { $gte: entry.date },
  });
  if (period && period.status !== 'open') {
    throw new AppError(`Buchungsperiode "${period.name}" ist ${period.status === 'locked' ? 'gesperrt' : 'geschlossen'}.`, 422);
  }
  if (period?.fiscalYearId) {
    const fy = await FiscalYear.findById(period.fiscalYearId);
    if (fy && fy.status !== 'open') {
      throw new AppError(`Geschäftsjahr "${fy.name}" ist abgeschlossen. Buchungen nicht mehr möglich.`, 422);
    }
  }

  await JournalEntry.updateOne(
    { _id: entry._id },
    { $set: { status: 'posted', postedAt: new Date(), postedBy: req.user?.userId } }
  );

  res.json({ message: `Buchungssatz ${entry.entryNumber} gebucht.` });
}));

// ── POST /api/journal/:id/reverse ─────────────────────────────────────────────
router.post('/:id/reverse', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, tenantId: req.tenantId });
  if (!entry) throw new AppError('Buchungssatz nicht gefunden.', 404);
  if (entry.status !== 'posted') throw new AppError('Nur gebuchte Buchungssätze können storniert werden.', 400);
  if (entry.reversedBy) throw new AppError('Dieser Buchungssatz wurde bereits storniert.', 400);

  const reverseDate = req.body?.date ? new Date(req.body.date) : new Date();
  const { periodId, fiscalYearId } = await resolvePeriodAndYear(String(req.tenantId), reverseDate);

  const reversalNumber = await nextSeq(String(req.tenantId), 'journal');
  const reversalNumStr = `BU-${String(reversalNumber).padStart(6, '0')}`;

  // Flip debit/credit for each line
  const reversalLines = entry.lines.map((l) => ({
    accountNumber: l.accountNumber,
    accountName:   l.accountName,
    debit:         l.credit,
    credit:        l.debit,
    costCenter:    l.costCenter,
    description:   `Storno: ${l.description || entry.description}`,
  }));

  const hash = gobdHash({
    tenantId:    String(req.tenantId),
    entryNumber: reversalNumStr,
    date:        reverseDate.toISOString(),
    description: `Storno von ${entry.entryNumber}: ${entry.description}`,
    reversalOf:  String(entry._id),
    lines:       reversalLines,
  });

  const reversal = await JournalEntry.create({
    tenantId:    req.tenantId,
    entryNumber: reversalNumStr,
    date:        reverseDate,
    description: `Storno von ${entry.entryNumber}: ${entry.description}`,
    reference:   entry.reference,
    status:      'posted',
    lines:       reversalLines,
    totalDebit:  entry.totalCredit,
    totalCredit: entry.totalDebit,
    periodId,
    fiscalYearId,
    reversalOf:  entry._id,
    gobdHash:    hash,
    createdBy:   req.user?.userId,
    postedAt:    new Date(),
    postedBy:    req.user?.userId,
  });

  await JournalEntry.updateOne({ _id: entry._id }, {
    $set: { status: 'reversed', reversedBy: reversal._id },
  });

  // Restore inventory when manually reversing a posted sales revenue entry
  if (
    entry.sourceType === 'SalesInvoice' &&
    entry.sourceId &&
    entry.lines.some((l) => l.credit > 0 && l.accountNumber.startsWith('8'))
  ) {
    reverseSalesInvoiceInventory(
      entry.sourceId as Types.ObjectId,
      entry.tenantId as Types.ObjectId,
      reversal._id as Types.ObjectId,
      entry.reference ?? ''
    ).catch((e) => console.error('[inventoryRestore] failed:', e));
  }

  res.status(201).json({ reversal, message: `Storno ${reversalNumStr} erstellt.` });
}));

// ── GET /api/journal/account/:number/ledger ───────────────────────────────────
router.get('/account/:number/ledger', requireRole('erp_admin', 'erp_accountant', 'erp_viewer', 'erp_tax_advisor'), asyncHandler(async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const baseQ: Record<string, unknown> = {
    tenantId: req.tenantId,
    status:   'posted',
    'lines.accountNumber': req.params.number,
  };

  // Compute opening balance from all transactions strictly before `from`
  let openingBalance = 0;
  if (from) {
    const priorEntries = await JournalEntry.find({
      ...baseQ,
      date: { $lt: new Date(from) },
    }).sort({ _id: 1 });
    for (const e of priorEntries) {
      for (const l of e.lines) {
        if (l.accountNumber === req.params.number) openingBalance += l.debit - l.credit;
      }
    }
  }

  // Fetch transactions within the requested range
  const q = { ...baseQ } as Record<string, unknown>;
  if (from || to) {
    q.date = {};
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }
  const entries = await JournalEntry.find(q).sort({ _id: 1 });

  let balance = openingBalance;
  const ledger = entries.flatMap((e) =>
    e.lines
      .filter((l) => l.accountNumber === req.params.number)
      .map((l) => {
        balance += l.debit - l.credit;
        return {
          entryId:     String(e._id),
          date:        e.date,
          entryNumber: e.entryNumber,
          description: e.description,
          reference:   e.reference,
          debit:       l.debit,
          credit:      l.credit,
          balance,
        };
      })
  );

  res.json({ account: req.params.number, openingBalance, ledger, finalBalance: balance });
}));

// ── GET /api/journal/export/ledgers — one Excel sheet per account ─────────────
router.get('/export/ledgers', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const { from, to, lang = 'de' } = req.query as Record<string, string>;
  const de = lang !== 'en';
  const tenantId = req.tenantId;

  // ── i18n labels ──────────────────────────────────────────────────────────────
  const L = {
    summary:        de ? 'Kontenübersicht'        : 'Account Summary',
    acctNo:         de ? 'Konto-Nr.'              : 'Account No.',
    acctName:       de ? 'Kontoname'              : 'Account Name',
    type:           de ? 'Typ'                    : 'Type',
    postings:       de ? 'Buchungen'              : 'Postings',
    totalDebit:     de ? 'Soll gesamt (€)'        : 'Total Debit (€)',
    totalCredit:    de ? 'Haben gesamt (€)'       : 'Total Credit (€)',
    openingBalance: de ? 'Eröffnungssaldo (€)'    : 'Opening Balance (€)',
    closingBalance: de ? 'Schlusssaldo (€)'       : 'Closing Balance (€)',
    date:           de ? 'Datum'                  : 'Date',
    entryNo:        de ? 'Belegnummer'            : 'Entry No.',
    reference:      de ? 'Referenz'               : 'Reference',
    description:    de ? 'Buchungstext'           : 'Description',
    debit:          de ? 'Soll (€)'              : 'Debit (€)',
    credit:         de ? 'Haben (€)'             : 'Credit (€)',
    total:          de ? 'Summe'                  : 'Total',
    openingRow:     de ? 'Eröffnungssaldo'        : 'Opening Balance',
    noPostings:     de ? 'Keine Buchungen im gewählten Zeitraum.' : 'No postings in selected period.',
  };

  const COLS = [
    { label: L.date,        key: 'date',        width: 14 },
    { label: L.entryNo,     key: 'entryNumber',  width: 16 },
    { label: L.reference,   key: 'reference',    width: 16 },
    { label: L.description, key: 'description',  width: 40 },
    { label: L.debit,       key: 'debit',        width: 14 },
    { label: L.credit,      key: 'credit',       width: 14 },
    { label: L.closingBalance, key: 'balance',    width: 14 },
  ];

  // ── Data fetch ───────────────────────────────────────────────────────────────
  const accounts = await Account.find({ tenantId }).sort({ number: 1 }).lean();

  // Fetch ALL posted entries — we'll split them into prior (opening balance) and period rows
  const allEntries = await JournalEntry.find({ tenantId, status: 'posted' }).sort({ date: 1, _id: 1 }).lean();

  const fromDate = from ? new Date(from) : null;
  const toDate   = to   ? new Date(to + 'T23:59:59') : null;

  type LedgerLine = { date: Date; entryNumber: string; reference: string; description: string; debit: number; credit: number };
  // opening balance per account (sum of all lines strictly before `from`)
  const openingByAccount = new Map<string, number>();
  // period lines (within from..to)
  const linesByAccount   = new Map<string, LedgerLine[]>();
  for (const a of accounts) { openingByAccount.set(a.number, 0); linesByAccount.set(a.number, []); }

  for (const entry of allEntries) {
    const entryDate = new Date(entry.date);
    const inPrior  = fromDate && entryDate < fromDate;
    const inPeriod = (!fromDate || entryDate >= fromDate) && (!toDate || entryDate <= toDate);

    for (const line of entry.lines) {
      if (inPrior) {
        openingByAccount.set(line.accountNumber, (openingByAccount.get(line.accountNumber) ?? 0) + line.debit - line.credit);
      } else if (inPeriod) {
        if (!linesByAccount.has(line.accountNumber)) linesByAccount.set(line.accountNumber, []);
        linesByAccount.get(line.accountNumber)!.push({
          date:        entry.date,
          entryNumber: entry.entryNumber,
          reference:   entry.reference ?? '',
          description: line.description || entry.description,
          debit:       line.debit,
          credit:      line.credit,
        });
      }
    }
  }

  // ── Workbook ─────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = `${env.APP_NAME} ERP`;
  wb.created = new Date();

  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  const MONEY_FMT = '#,##0.00';

  // Helper: apply header styling to a row
  function styleHeader(row: ExcelJS.Row, descColIdx: number) {
    row.height = 18;
    row.eachCell((cell, col) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: col === descColIdx ? 'left' : 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF60A5FA' } } };
    });
  }

  // ── Sheet 1: Account Summary ──────────────────────────────────────────────────
  const summarySheet = wb.addWorksheet(L.summary);
  const SUMM_COLS = [
    { label: L.acctNo,         key: 'number',         width: 14 },
    { label: L.acctName,       key: 'name',           width: 36 },
    { label: L.type,           key: 'type',           width: 14 },
    { label: L.postings,       key: 'count',          width: 12 },
    { label: L.totalDebit,     key: 'totalDebit',     width: 16 },
    { label: L.totalCredit,    key: 'totalCredit',    width: 16 },
    { label: L.openingBalance, key: 'openingBalance', width: 18 },
    { label: L.closingBalance, key: 'closingBalance', width: 18 },
  ];

  // Title row (row 1)
  summarySheet.mergeCells(1, 1, 1, SUMM_COLS.length);
  const summTitle = summarySheet.getCell('A1');
  summTitle.value = L.summary + (from || to ? `  (${from ?? ''}–${to ?? ''})` : '');
  summTitle.font  = { bold: true, size: 13 };
  summTitle.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  summarySheet.getRow(1).height = 24;

  // Set column widths via getColumn (avoids auto-header-in-row-1 issue)
  SUMM_COLS.forEach((c, i) => { summarySheet.getColumn(i + 1).width = c.width; });

  // Header row (row 2) — manually set values
  const summHeader = summarySheet.getRow(2);
  summHeader.values = ['', ...SUMM_COLS.map(c => c.label)]; // col index is 1-based; pad with empty col 0
  summHeader.values = SUMM_COLS.map(c => c.label); // rewrite correctly via 1-based splice
  SUMM_COLS.forEach((c, i) => { summHeader.getCell(i + 1).value = c.label; });
  styleHeader(summHeader, 2); // column 2 = name (left-aligned)
  summarySheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

  // Data rows
  const TYPE_LABEL: Record<string, string> = de
    ? { asset: 'Aktiva', liability: 'Passiva', equity: 'Eigenkapital', revenue: 'Erlöse', expense: 'Aufwand' }
    : { asset: 'Asset',  liability: 'Liability', equity: 'Equity', revenue: 'Revenue', expense: 'Expense' };

  for (const acct of accounts) {
    const lines      = linesByAccount.get(acct.number) ?? [];
    const opening    = openingByAccount.get(acct.number) ?? 0;
    const totDeb     = lines.reduce((s, l) => s + l.debit,  0);
    const totCred    = lines.reduce((s, l) => s + l.credit, 0);
    const closing    = opening + totDeb - totCred;
    const row = summarySheet.addRow([
      acct.number,
      acct.name,
      TYPE_LABEL[acct.type] ?? acct.type,
      lines.length,
      totDeb   || null,
      totCred  || null,
      opening  || null,
      closing  || null,
    ]);
    row.getCell(1).font = { bold: true, family: 3 };
    for (const ci of [5, 6, 7, 8]) {
      row.getCell(ci).numFmt = MONEY_FMT;
      row.getCell(ci).alignment = { horizontal: 'right' };
      if (ci === 8 && closing < 0) row.getCell(ci).font = { color: { argb: 'FFCC0000' } };
    }
    row.commit();
  }
  summarySheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: SUMM_COLS.length } };

  // ── Per-account sheets ────────────────────────────────────────────────────────
  let sheetsAdded = 0;

  for (const [number, lines] of linesByAccount.entries()) {
    if (lines.length === 0) continue;
    sheetsAdded++;
    const acct = accounts.find(a => a.number === number);
    const name = acct?.name ?? number;
    const sheetName = `${number} ${name}`.replace(/[\\/*?[\]:]/g, '').trim().slice(0, 31);

    const ws = wb.addWorksheet(sheetName);

    // Set column widths (no header property — avoids polluting row 1)
    COLS.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.key   = c.key;
      col.width = c.width;
    });

    // Row 1: Account title
    ws.mergeCells(1, 1, 1, COLS.length);
    const titleCell = ws.getCell('A1');
    titleCell.value = `${number}  ${name}`;
    titleCell.font  = { bold: true, size: 12 };
    titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    ws.getRow(1).height = 22;

    // Row 2: Column headers — manually set each cell
    const headerRow = ws.getRow(2);
    COLS.forEach((c, i) => { headerRow.getCell(i + 1).value = c.label; });
    styleHeader(headerRow, 4); // column 4 = description (left-aligned)

    // Rows 3+: Opening balance row (if date range is filtered)
    const opening = openingByAccount.get(number) ?? 0;
    if (fromDate) {
      const obRow = ws.getRow(ws.rowCount + 1);
      obRow.getCell(4).value = L.openingRow;
      obRow.getCell(4).font  = { bold: true, italic: true };
      obRow.getCell(7).value = opening || null;
      obRow.getCell(7).numFmt = MONEY_FMT;
      obRow.getCell(7).alignment = { horizontal: 'right' };
      obRow.getCell(7).font = { bold: true, italic: true, color: opening < 0 ? { argb: 'FFCC0000' } : undefined };
      obRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      obRow.commit();
    }

    // Data rows
    let balance = opening;
    for (const l of lines) {
      balance += l.debit - l.credit;
      const row = ws.getRow(ws.rowCount + 1);
      row.getCell(1).value = new Date(l.date);
      row.getCell(1).numFmt = 'DD.MM.YYYY';
      row.getCell(2).value = l.entryNumber;
      row.getCell(3).value = l.reference;
      row.getCell(4).value = l.description;
      row.getCell(5).value = l.debit  > 0 ? l.debit  : null;
      row.getCell(6).value = l.credit > 0 ? l.credit : null;
      row.getCell(7).value = balance;
      for (const ci of [5, 6, 7]) {
        row.getCell(ci).numFmt = MONEY_FMT;
        row.getCell(ci).alignment = { horizontal: 'right' };
      }
      if (balance < 0) row.getCell(7).font = { color: { argb: 'FFCC0000' } };
      row.commit();
    }

    // Totals row (closing balance)
    const totDeb  = lines.reduce((s, l) => s + l.debit,  0);
    const totCred = lines.reduce((s, l) => s + l.credit, 0);
    const totalRow = ws.getRow(ws.rowCount + 1);
    totalRow.getCell(4).value = L.total;
    totalRow.getCell(5).value = totDeb  || null;
    totalRow.getCell(6).value = totCred || null;
    totalRow.getCell(7).value = balance; // = opening + period net = true closing balance
    totalRow.font = { bold: true };
    for (const ci of [5, 6, 7]) {
      totalRow.getCell(ci).numFmt = MONEY_FMT;
      totalRow.getCell(ci).alignment = { horizontal: 'right' };
      totalRow.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
    totalRow.commit();

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: COLS.length } };
  }

  if (sheetsAdded === 0) {
    const ws = wb.addWorksheet(de ? 'Keine Buchungen' : 'No Postings');
    ws.getCell('A1').value = L.noPostings;
  }

  const dateTag  = from && to ? `_${from}_${to}` : `_${new Date().toISOString().slice(0, 10)}`;
  const filename = `${de ? 'Kontenblätter' : 'Ledgers'}${dateTag}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ── GET /api/journal/export/datev ─────────────────────────────────────────────
router.get('/export/datev', requireRole('erp_admin', 'erp_accountant'), asyncHandler(async (req, res) => {
  const { from, to, fyId } = req.query as Record<string, string>;
  const q: Record<string, unknown> = { tenantId: req.tenantId, status: 'posted' };
  if (fyId) q.fiscalYearId = fyId;
  if (from || to) {
    q.date = {};
    if (from) (q.date as Record<string, Date>).$gte = new Date(from);
    if (to)   (q.date as Record<string, Date>).$lte = new Date(to);
  }

  const entries = await JournalEntry.find(q).sort({ _id: 1 });

  // DATEV Buchungsstapel CSV (simplified header format)
  const header = [
    '"EXTF";510;21;"Buchungsstapel";4;20161214;;"";"";"";"";"";"";"";"";"";"";"";"";"";""',
    `"Buchungstyp";"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen";"WKZ Umsatz";"Kurs";"Basis-Umsatz";"WKZ Basis-Umsatz";"Konto";"Gegenkonto (ohne BU-Schlüssel)";"BU-Schlüssel";"Belegdatum";"Belegfeld 1";"Belegfeld 2";"Skonto";"Buchungstext"`,
  ].join('\r\n');

  const rows = entries.flatMap((e) => {
    const lines = e.lines;
    if (lines.length < 2) return [];
    const rows = [];
    for (let i = 0; i < lines.length - 1; i++) {
      const l = lines[i];
      const gegen = lines[lines.length - 1];
      const amount = l.debit > 0 ? l.debit : l.credit;
      const shKz   = l.debit > 0 ? 'S' : 'H';
      const dateStr = e.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }).replace('.', '');
      rows.push(`"";"${amount.toFixed(2).replace('.', ',')}";${shKz};"EUR";"";"";"";${l.accountNumber};${gegen.accountNumber};"";${dateStr};"${e.entryNumber}";"${e.reference}";"";"${e.description}"`);
    }
    return rows;
  });

  const csv = header + '\r\n' + rows.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="DATEV_Buchungsstapel_${Date.now()}.csv"`);
  res.send(Buffer.from('\xEF\xBB\xBF' + csv)); // UTF-8 BOM for Excel
}));

export default router;
