import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';
const OID = () => new mongoose.Types.ObjectId();

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[Seed] Connected to MongoDB');
  const db = mongoose.connection.db!;

  // ── TRUNCATE ────────────────────────────────────────────────────────────────
  const m3Collections = [
    'm3_accounts','m3_fiscalyears','m3_periods','m3_customers','m3_suppliers',
    'm3_service_items','m3_sales_invoices','m3_vendor_invoices','m3_journal_entries',
    'm3_cashbook_entries','m3_payrolls','m3_employees','m3_sales_quotes',
    'm3_sales_orders','m3_purchase_orders','m3_credit_notes','m3_payments',
    'm3_accruals','m3_sepa_mandates','m3_direct_debit_runs','m3_elster_filings',
    'm3_absences','m3_bank_accounts','m3_cost_centers','m3_fixed_assets',
    'm3_travel_expenses','m3_inventory_movements','m3_notifications','m3_audit_logs',
    'm3_counters','m3_company_settings','m3_companysettings','m3_journal_entries',
  ];
  for (const col of m3Collections) {
    try { await db.collection(col).drop(); } catch { /* ignore */ }
  }
  console.log('[Seed] Dropped all M3 collections');

  // ── TENANT ──────────────────────────────────────────────────────────────────
  const tenant = await db.collection('tenants').findOne({ loginCode: 'demo' });
  if (!tenant) throw new Error('Demo tenant not found — run M1 seed first');
  const tenantId = tenant._id as mongoose.Types.ObjectId;
  console.log('[Seed] Using tenant:', tenantId.toString());

  // Delete existing M3 users
  await db.collection('users').deleteMany({
    tenantId,
    role: { $in: ['erp_admin', 'erp_accountant', 'erp_viewer', 'erp_employee'] },
  });

  // ── USERS ───────────────────────────────────────────────────────────────────
  const adminId = OID();
  const erpPw   = process.env.SEED_ERP_PASSWORD   ?? 'Erp1234!';
  const kassePw = process.env.SEED_KASSE_PASSWORD ?? 'Kasse1234!';
  const pw = await bcrypt.hash(erpPw, 12);
  await db.collection('users').insertMany([
    {
      _id: adminId, tenantId, email: 'admin@erp.demo', passwordHash: pw,
      role: 'erp_admin', firstName: 'Alex', lastName: 'Morgan', status: 'active',
      emailVerified: true, twoFactorEnabled: false, failedLoginAttempts: 0,
      refreshTokenHashes: [], language: 'en',
      notificationPreferences: { email: true, sms: false, push: false },
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: OID(), tenantId, email: 'accountant@erp.demo', passwordHash: pw,
      role: 'erp_accountant', firstName: 'Emma', lastName: 'Clarke', status: 'active',
      emailVerified: true, twoFactorEnabled: false, failedLoginAttempts: 0,
      refreshTokenHashes: [], language: 'en',
      notificationPreferences: { email: true, sms: false, push: false },
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: OID(), tenantId, email: 'viewer@erp.demo', passwordHash: pw,
      role: 'erp_viewer', firstName: 'Tom', lastName: 'Reed', status: 'active',
      emailVerified: true, twoFactorEnabled: false, failedLoginAttempts: 0,
      refreshTokenHashes: [], language: 'en',
      notificationPreferences: { email: false, sms: false, push: false },
      createdAt: new Date(), updatedAt: new Date(),
    },
    {
      _id: OID(), tenantId, email: 'kassierer@erp.demo',
      passwordHash: await bcrypt.hash(kassePw, 12),
      role: 'erp_employee', firstName: 'Kassa', lastName: 'Mitarbeiter', status: 'active',
      emailVerified: true, twoFactorEnabled: false, failedLoginAttempts: 0,
      refreshTokenHashes: [], language: 'de',
      notificationPreferences: { email: false, sms: false, push: false },
      createdAt: new Date(), updatedAt: new Date(),
    },
  ]);
  console.log('[Seed] Created 4 ERP users');

  // ── COMPANY SETTINGS ────────────────────────────────────────────────────────
  await db.collection('m3_companysettings').insertOne({
    _id: OID(), tenantId,
    companyName: 'Meridian Consulting GmbH', legalForm: 'GmbH',
    address: { street: '45 Innovation Drive', city: 'Frankfurt am Main', zip: '60325', country: 'DE' },
    vatId: 'DE812345678', steuernummer: '04/815/60789', hrNumber: 'HRB 112233',
    fiscalYearStart: 1, chartOfAccounts: 'SKR03', vatPeriod: 'monthly', currency: 'EUR',
    invoicePrefix: 'RE', invoiceStartNumber: 1, invoiceDueDays: 30,
    invoiceTermsText: 'Payment due within 30 days of invoice date without deduction.',
    datevBeraternummer: '', datevMandantennummer: '',
    dunningLevels: [
      { level: 1, feeCents: 0, graceDays: 14 },
      { level: 2, feeCents: 1500, graceDays: 7 },
      { level: 3, feeCents: 4000, graceDays: 7 },
    ],
    mileageRateCents: 30, poApprovalThresholdCents: 100000, salesMode: 'invoice',
    createdAt: new Date(), updatedAt: new Date(),
  });
  console.log('[Seed] Created company settings');

  // ── CHART OF ACCOUNTS ───────────────────────────────────────────────────────
  const now = new Date();
  const accounts = [
    // Assets
    { number: '0200', name: 'Office Equipment',           type: 'asset',     taxCode: '' },
    { number: '0210', name: 'Furniture & Fixtures',       type: 'asset',     taxCode: '' },
    { number: '0800', name: 'Prepaid Expenses',           type: 'asset',     taxCode: '' },
    { number: '0300', name: 'Share Capital',              type: 'equity',    taxCode: '' },
    { number: '0900', name: 'Retained Earnings',          type: 'equity',    taxCode: '' },
    { number: '0990', name: 'Net Income Current Year',    type: 'equity',    taxCode: '' },
    { number: '1000', name: 'Cash Register',              type: 'asset',     taxCode: '' },
    { number: '1200', name: 'Business Checking Account',  type: 'asset',     taxCode: '' },
    { number: '1400', name: 'Accounts Receivable',        type: 'asset',     taxCode: '' },
    { number: '1410', name: 'Other Receivables',          type: 'asset',     taxCode: '' },
    { number: '1580', name: 'Input VAT 19%',              type: 'asset',     taxCode: 'VST19' },
    { number: '1581', name: 'Input VAT 7%',               type: 'asset',     taxCode: 'VST7' },
    { number: '1590', name: 'Clearing Account',           type: 'asset',     taxCode: '' },
    { number: '1771', name: 'Output VAT 7%',              type: 'liability', taxCode: 'UST7' },
    { number: '1776', name: 'Output VAT 19%',             type: 'liability', taxCode: 'UST19' },
    { number: '3300', name: 'Accounts Payable',           type: 'liability', taxCode: '' },
    { number: '3500', name: 'Accrued Liabilities',        type: 'liability', taxCode: '' },
    { number: '3800', name: 'Deferred Revenue',           type: 'liability', taxCode: '' },
    { number: '4000', name: 'Wages & Salaries',           type: 'expense',   taxCode: '' },
    { number: '4130', name: 'Employer Social Security',   type: 'expense',   taxCode: '' },
    { number: '4200', name: 'Office Rent',                type: 'expense',   taxCode: '' },
    { number: '4210', name: 'Electricity & Utilities',    type: 'expense',   taxCode: '' },
    { number: '4220', name: 'Internet & Telecommunications', type: 'expense', taxCode: '' },
    { number: '4230', name: 'Office Supplies',            type: 'expense',   taxCode: '' },
    { number: '4240', name: 'Postage & Shipping',         type: 'expense',   taxCode: '' },
    { number: '4800', name: 'Travel & Accommodation',     type: 'expense',   taxCode: '' },
    { number: '4810', name: 'Meals & Entertainment',      type: 'expense',   taxCode: '' },
    { number: '4900', name: 'Marketing & Advertising',    type: 'expense',   taxCode: '' },
    { number: '4980', name: 'Software Subscriptions',     type: 'expense',   taxCode: '' },
    { number: '6300', name: 'Legal & Professional Fees',  type: 'expense',   taxCode: '' },
    { number: '6310', name: 'Accounting Fees',            type: 'expense',   taxCode: '' },
    { number: '6800', name: 'Bank Charges & Fees',        type: 'expense',   taxCode: '' },
    { number: '7000', name: 'Depreciation – Equipment',   type: 'expense',   taxCode: '' },
    { number: '7010', name: 'Depreciation – Furniture',   type: 'expense',   taxCode: '' },
    { number: '7900', name: 'Miscellaneous Expenses',     type: 'expense',   taxCode: '' },
    { number: '8000', name: 'Consulting Services Revenue',type: 'revenue',   taxCode: 'UST19' },
    { number: '8100', name: 'Training & Workshops Revenue',type: 'revenue',  taxCode: 'UST19' },
    { number: '8200', name: 'Software License Revenue',   type: 'revenue',   taxCode: 'UST19' },
    { number: '8400', name: 'Other Operating Revenue',    type: 'revenue',   taxCode: 'UST19' },
  ];
  await db.collection('m3_accounts').insertMany(
    accounts.map(a => ({ _id: OID(), tenantId, ...a, subtype: '', parentNumber: '', isActive: true, isLocked: false, notes: '', createdAt: now, updatedAt: now }))
  );
  console.log(`[Seed] Created ${accounts.length} accounts`);

  // ── FISCAL YEAR + PERIODS ───────────────────────────────────────────────────
  const fyId = OID();
  await db.collection('m3_fiscalyears').insertOne({
    _id: fyId, tenantId,
    name: 'Fiscal Year 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'open',
    createdAt: now, updatedAt: now,
  });

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthDays  = [31,28,31,30,31,30,31,31,30,31,30,31];
  const periods = monthNames.map((name, i) => ({
    _id: OID(), tenantId, fiscalYearId: fyId,
    name: `${name} 2026`, number: i + 1,
    startDate: new Date(`2026-${String(i+1).padStart(2,'0')}-01`),
    endDate:   new Date(`2026-${String(i+1).padStart(2,'0')}-${monthDays[i]}`),
    status: i < 7 ? 'closed' : 'open',
    createdAt: now, updatedAt: now,
  }));
  await db.collection('m3_periods').insertMany(periods);
  console.log('[Seed] Created fiscal year 2026 + 12 periods');

  // ── COST CENTERS ────────────────────────────────────────────────────────────
  await db.collection('m3_cost_centers').insertMany([
    { _id: OID(), tenantId, number: 'CC-001', name: 'Consulting', description: 'Client-facing consulting work', annualBudgetCents: 0, isActive: true, createdAt: now, updatedAt: now },
    { _id: OID(), tenantId, number: 'CC-002', name: 'Administration', description: 'Internal administrative functions', annualBudgetCents: 0, isActive: true, createdAt: now, updatedAt: now },
  ]);
  console.log('[Seed] Created 2 cost centers');

  // ── BANK ACCOUNT ────────────────────────────────────────────────────────────
  await db.collection('m3_bank_accounts').insertOne({
    _id: OID(), tenantId,
    accountName: 'Main Operating Account',
    bankName: 'Commerzbank AG',
    iban: 'DE89370400440532013000',
    bic: 'COBADEFFXXX',
    accountHolder: 'Meridian Consulting GmbH',
    currency: 'EUR', isDefault: true, glAccount: '1200', notes: '',
    isActive: true, createdAt: now, updatedAt: now,
  });
  console.log('[Seed] Created bank account');

  // ── FIXED ASSETS ────────────────────────────────────────────────────────────
  await db.collection('m3_fixed_assets').insertMany([
    {
      _id: OID(), tenantId,
      assetNumber: 'FA-001', name: 'MacBook Pro Fleet', category: 'equipment',
      description: 'Laptop computers for consulting team',
      acquisitionDate: new Date('2025-03-01'), acquisitionCostCents: 180000,
      residualValueCents: 0, usefulLifeMonths: 36, depreciationMethod: 'linear',
      assetAccount: '0200', depreciationExpenseAccount: '7000', accumulatedDepAccount: '0200',
      monthlyDepreciationCents: 5000, accumulatedDepreciationCents: 85000,
      lastDepreciationDate: new Date('2026-07-31'), status: 'active',
      disposalProceedsCents: 0, createdBy: adminId, createdAt: now, updatedAt: now,
    },
    {
      _id: OID(), tenantId,
      assetNumber: 'FA-002', name: 'Office Furniture Set', category: 'furniture',
      description: 'Desks, chairs, and storage units',
      acquisitionDate: new Date('2024-06-01'), acquisitionCostCents: 450000,
      residualValueCents: 0, usefulLifeMonths: 120, depreciationMethod: 'linear',
      assetAccount: '0210', depreciationExpenseAccount: '7010', accumulatedDepAccount: '0210',
      monthlyDepreciationCents: 3750, accumulatedDepreciationCents: 86250,
      lastDepreciationDate: new Date('2026-07-31'), status: 'active',
      disposalProceedsCents: 0, createdBy: adminId, createdAt: now, updatedAt: now,
    },
  ]);
  console.log('[Seed] Created 2 fixed assets');

  // ── CUSTOMERS ───────────────────────────────────────────────────────────────
  const custAlphaId = OID(), custBetaId = OID(), custGammaId = OID(), custDeltaId = OID(), custEpsilonId = OID();
  await db.collection('m3_customers').insertMany([
    {
      _id: custAlphaId, tenantId, customerNumber: 'KD-001', companyName: 'Alpha Technologies GmbH', legalForm: 'GmbH',
      address: { street: '12 Tech Park', city: 'Frankfurt', zip: '60306', country: 'DE' },
      vatId: 'DE811234567',
      contacts: [{ _id: OID(), name: 'Stefan Hoffmann', email: 'stefan.hoffmann@alpha-tech.de', phone: '+49 69 1234 5678', position: 'CTO', isPrimary: true }],
      paymentTermsDays: 14, creditLimitCents: 3500000, iban: '', bic: '', debtorAccount: '1400',
      dunningBlock: false, taxExempt: false, isActive: true, notes: 'Key enterprise client', createdAt: now, updatedAt: now,
    },
    {
      _id: custBetaId, tenantId, customerNumber: 'KD-002', companyName: 'Beta Pharma AG', legalForm: 'AG',
      address: { street: '88 Research Boulevard', city: 'Munich', zip: '80331', country: 'DE' },
      vatId: 'DE822345678',
      contacts: [{ _id: OID(), name: 'Dr. Anna Richter', email: 'a.richter@betapharma.de', phone: '+49 89 2345 6789', position: 'Director Strategy', isPrimary: true }],
      paymentTermsDays: 30, creditLimitCents: 5000000, iban: '', bic: '', debtorAccount: '1400',
      dunningBlock: false, taxExempt: false, isActive: true, notes: 'Pharmaceutical sector', createdAt: now, updatedAt: now,
    },
    {
      _id: custGammaId, tenantId, customerNumber: 'KD-003', companyName: 'Gamma Retail GmbH', legalForm: 'GmbH',
      address: { street: '5 Market Square', city: 'Hamburg', zip: '20095', country: 'DE' },
      vatId: 'DE833456789',
      contacts: [{ _id: OID(), name: 'Klaus Brandt', email: 'k.brandt@gamma-retail.de', phone: '+49 40 3456 7890', position: 'COO', isPrimary: true }],
      paymentTermsDays: 30, creditLimitCents: 2500000, iban: '', bic: '', debtorAccount: '1400',
      dunningBlock: false, taxExempt: false, isActive: true, notes: 'Retail chain operator', createdAt: now, updatedAt: now,
    },
    {
      _id: custDeltaId, tenantId, customerNumber: 'KD-004', companyName: 'Delta Logistics SE', legalForm: 'SE',
      address: { street: '200 Freight Lane', city: 'Berlin', zip: '10115', country: 'DE' },
      vatId: 'DE844567890',
      contacts: [{ _id: OID(), name: 'Maria Schulz', email: 'm.schulz@delta-logistics.de', phone: '+49 30 4567 8901', position: 'VP Operations', isPrimary: true }],
      paymentTermsDays: 21, creditLimitCents: 4000000, iban: '', bic: '', debtorAccount: '1400',
      dunningBlock: false, taxExempt: false, isActive: true, notes: 'Logistics transformation project', createdAt: now, updatedAt: now,
    },
    {
      _id: custEpsilonId, tenantId, customerNumber: 'KD-005', companyName: 'Epsilon Finance GmbH', legalForm: 'GmbH',
      address: { street: '1 Banking Street', city: 'Düsseldorf', zip: '40213', country: 'DE' },
      vatId: 'DE855678901',
      contacts: [{ _id: OID(), name: 'Tobias Krause', email: 't.krause@epsilon-finance.de', phone: '+49 211 5678 9012', position: 'CFO', isPrimary: true }],
      paymentTermsDays: 30, creditLimitCents: 3000000, iban: '', bic: '', debtorAccount: '1400',
      dunningBlock: false, taxExempt: false, isActive: true, notes: 'Financial services sector', createdAt: now, updatedAt: now,
    },
  ]);
  console.log('[Seed] Created 5 customers');

  // ── SUPPLIERS ───────────────────────────────────────────────────────────────
  const supProOfficeId = OID(), supCloudStackId = OID(), supMuellerPartnerId = OID(), supMainDriveId = OID();
  await db.collection('m3_suppliers').insertMany([
    {
      _id: supProOfficeId, tenantId, supplierNumber: 'LF-001', companyName: 'ProOffice Solutions GmbH', legalForm: 'GmbH',
      address: { street: '7 Supply Road', city: 'Frankfurt', zip: '60311', country: 'DE' }, vatId: 'DE700111222',
      contacts: [{ _id: OID(), name: 'Petra Wolf', email: 'petra.wolf@prooffice.de', phone: '+49 69 111 222', position: 'Account Manager', isPrimary: true }],
      paymentTermsDays: 14, iban: 'DE21500400600653477400', bic: 'COBADEFFXXX',
      creditorAccount: '3300', defaultExpenseAccount: '4230',
      paymentBlock: false, taxExempt: false, isActive: true, notes: 'Office supplies vendor', createdAt: now, updatedAt: now,
    },
    {
      _id: supCloudStackId, tenantId, supplierNumber: 'LF-002', companyName: 'CloudStack Technologies GmbH', legalForm: 'GmbH',
      address: { street: '99 Cloud Avenue', city: 'Berlin', zip: '10178', country: 'DE' }, vatId: 'DE700222333',
      contacts: [{ _id: OID(), name: 'Jonas Fischer', email: 'j.fischer@cloudstack.de', phone: '+49 30 222 333', position: 'Enterprise Sales', isPrimary: true }],
      paymentTermsDays: 30, iban: 'DE89370400440532013099', bic: 'COBADEFFXXX',
      creditorAccount: '3300', defaultExpenseAccount: '4980',
      paymentBlock: false, taxExempt: false, isActive: true, notes: 'Cloud hosting & software', createdAt: now, updatedAt: now,
    },
    {
      _id: supMuellerPartnerId, tenantId, supplierNumber: 'LF-003', companyName: 'Mueller & Partner Rechtsanwälte', legalForm: 'Partnerschaft',
      address: { street: '3 Justice Way', city: 'Frankfurt', zip: '60313', country: 'DE' }, vatId: 'DE700333444',
      contacts: [{ _id: OID(), name: 'Ralf Mueller', email: 'r.mueller@mueller-partner.de', phone: '+49 69 333 444', position: 'Partner', isPrimary: true }],
      paymentTermsDays: 14, iban: 'DE12500105170648489890', bic: 'INGDDEFFXXX',
      creditorAccount: '3300', defaultExpenseAccount: '6300',
      paymentBlock: false, taxExempt: false, isActive: true, notes: 'Legal counsel', createdAt: now, updatedAt: now,
    },
    {
      _id: supMainDriveId, tenantId, supplierNumber: 'LF-004', companyName: 'MainDrive Real Estate GmbH', legalForm: 'GmbH',
      address: { street: '45 Property Plaza', city: 'Frankfurt', zip: '60325', country: 'DE' }, vatId: 'DE700444555',
      contacts: [{ _id: OID(), name: 'Gisela Hartmann', email: 'g.hartmann@maindrive.de', phone: '+49 69 444 555', position: 'Property Manager', isPrimary: true }],
      paymentTermsDays: 5, iban: 'DE87200400600653477488', bic: 'COBADEFFXXX',
      creditorAccount: '3300', defaultExpenseAccount: '4200',
      paymentBlock: false, taxExempt: true, isActive: true, notes: 'Office landlord — rent VAT exempt', createdAt: now, updatedAt: now,
    },
  ]);
  console.log('[Seed] Created 4 suppliers');

  // ── EMPLOYEES ───────────────────────────────────────────────────────────────
  const empJamesId = OID(), empSarahId = OID(), empMichaelId = OID(), empLisaId = OID();
  await db.collection('m3_employees').insertMany([
    {
      _id: empJamesId, tenantId, employeeNumber: 'EMP-001',
      firstName: 'James', lastName: 'Wilson', dateOfBirth: new Date('1980-04-15'),
      email: 'james.wilson@meridian-consulting.de', phone: '+49 69 4440 1201', address: 'Bockenheimer Anlage 15, 60322 Frankfurt',
      department: 'Management', position: 'Managing Director',
      startDate: new Date('2023-01-01'), status: 'active', salaryType: 'monthly', salaryCents: 550000,
      taxClass: '1', healthInsurance: 'AOK Bayern', steuerIdEncrypted: '12345678901', svNummerEncrypted: '65070880W025', ibanEncrypted: 'DE89370400440532013001',
      personnelAccount: '4000', costCenterNumber: 'CC-002', notes: '', createdBy: adminId, createdAt: now, updatedAt: now,
    },
    {
      _id: empSarahId, tenantId, employeeNumber: 'EMP-002',
      firstName: 'Sarah', lastName: 'Chen', dateOfBirth: new Date('1988-09-22'),
      email: 'sarah.chen@meridian-consulting.de', phone: '+49 69 4440 1202', address: 'Sachsenhausen 8, 60594 Frankfurt',
      department: 'Consulting', position: 'Senior Consultant',
      startDate: new Date('2023-06-01'), status: 'active', salaryType: 'monthly', salaryCents: 420000,
      taxClass: '1', healthInsurance: 'TK', steuerIdEncrypted: '22345678902', svNummerEncrypted: '65070880W026', ibanEncrypted: 'DE89370400440532013002',
      personnelAccount: '4000', costCenterNumber: 'CC-001', notes: '', createdBy: adminId, createdAt: now, updatedAt: now,
    },
    {
      _id: empMichaelId, tenantId, employeeNumber: 'EMP-003',
      firstName: 'Michael', lastName: 'Braun', dateOfBirth: new Date('1991-12-05'),
      email: 'michael.braun@meridian-consulting.de', phone: '+49 69 4440 1203', address: 'Nordend 22, 60318 Frankfurt',
      department: 'Consulting', position: 'IT Consultant',
      startDate: new Date('2024-02-01'), status: 'active', salaryType: 'monthly', salaryCents: 380000,
      taxClass: '1', healthInsurance: 'Barmer', steuerIdEncrypted: '32345678903', svNummerEncrypted: '65070880W027', ibanEncrypted: 'DE89370400440532013003',
      personnelAccount: '4000', costCenterNumber: 'CC-001', notes: '', createdBy: adminId, createdAt: now, updatedAt: now,
    },
    {
      _id: empLisaId, tenantId, employeeNumber: 'EMP-004',
      firstName: 'Lisa', lastName: 'Weber', dateOfBirth: new Date('1995-03-18'),
      email: 'lisa.weber@meridian-consulting.de', phone: '+49 69 4440 1204', address: 'Westend 5, 60325 Frankfurt',
      department: 'Administration', position: 'Office Manager',
      startDate: new Date('2024-09-01'), status: 'active', salaryType: 'monthly', salaryCents: 290000,
      taxClass: '1', healthInsurance: 'DAK', steuerIdEncrypted: '42345678904', svNummerEncrypted: '65070880W028', ibanEncrypted: 'DE89370400440532013004',
      personnelAccount: '4000', costCenterNumber: 'CC-002', notes: '', createdBy: adminId, createdAt: now, updatedAt: now,
    },
  ]);
  console.log('[Seed] Created 4 employees');

  // ── SERVICE ITEMS ───────────────────────────────────────────────────────────
  await db.collection('m3_service_items').insertMany([
    { _id: OID(), tenantId, name: 'Strategy Consulting', description: 'Daily consulting rate for strategy projects', unit: 'day', category: 'Consulting', costPriceCents: 80000, defaultUnitPriceCents: 120000, vatRate: 19, stockQuantity: 0, isActive: true, notes: '', createdAt: now, updatedAt: now },
    { _id: OID(), tenantId, name: 'IT Consulting', description: 'Hourly IT support and advisory', unit: 'hour', category: 'Consulting', costPriceCents: 10000, defaultUnitPriceCents: 15000, vatRate: 19, stockQuantity: 0, isActive: true, notes: '', createdAt: now, updatedAt: now },
    { _id: OID(), tenantId, name: 'Project Management', description: 'Project oversight and coordination', unit: 'hour', category: 'Consulting', costPriceCents: 12000, defaultUnitPriceCents: 18000, vatRate: 19, stockQuantity: 0, isActive: true, notes: '', createdAt: now, updatedAt: now },
    { _id: OID(), tenantId, name: 'Training Workshop', description: 'Full-day workshop session', unit: 'session', category: 'Training', costPriceCents: 150000, defaultUnitPriceCents: 250000, vatRate: 19, stockQuantity: 0, isActive: true, notes: '', createdAt: now, updatedAt: now },
    { _id: OID(), tenantId, name: 'Software License', description: 'Monthly software license fee', unit: 'month', category: 'Software', costPriceCents: 20000, defaultUnitPriceCents: 35000, vatRate: 19, stockQuantity: 0, isActive: true, notes: '', createdAt: now, updatedAt: now },
  ]);
  console.log('[Seed] Created 5 service items');

  // ── SEPA MANDATES ───────────────────────────────────────────────────────────
  await db.collection('m3_sepa_mandates').insertMany([
    {
      _id: OID(), tenantId, mandateReference: 'MAN-001', type: 'CORE', sequence: 'RCUR',
      customerId: custAlphaId, customerName: 'Alpha Technologies GmbH',
      iban: 'DE12500105170648489890', bic: 'INGDDEFFXXX',
      signedAt: new Date('2023-03-15'), creditorId: 'DE98ZZZ09999999999', status: 'active', notes: '',
      createdAt: now, updatedAt: now,
    },
    {
      _id: OID(), tenantId, mandateReference: 'MAN-002', type: 'CORE', sequence: 'RCUR',
      customerId: custBetaId, customerName: 'Beta Pharma AG',
      iban: 'DE87200400600653477400', bic: 'COBADEFFXXX',
      signedAt: new Date('2023-07-01'), creditorId: 'DE98ZZZ09999999999', status: 'active', notes: '',
      createdAt: now, updatedAt: now,
    },
  ]);
  console.log('[Seed] Created 2 SEPA mandates');

  // ── JOURNAL ENTRY COUNTER ────────────────────────────────────────────────────
  let buSeq = 0;
  const buNum = () => { buSeq++; return `BU-${String(buSeq).padStart(6,'0')}`; };
  const kbSeq = { v: 0 };
  const kbNum = () => { kbSeq.v++; return `KB-${String(kbSeq.v).padStart(6,'0')}`; };

  const makeJE = (entryNumber: string, date: Date, description: string, lines: {accountNumber:string;accountName:string;debit:number;credit:number}[], sourceType?: string) => {
    const totalDebit  = lines.reduce((s,l) => s + l.debit,  0);
    const totalCredit = lines.reduce((s,l) => s + l.credit, 0);
    return {
      _id: OID(), tenantId, entryNumber, date, description, reference: '',
      status: 'posted', lines, totalDebit, totalCredit,
      gobdHash: '', sourceType: sourceType ?? 'Payment',
      createdBy: adminId, postedAt: date, postedBy: adminId,
      createdAt: date, updatedAt: date,
    };
  };

  // ── OPENING BALANCE ─────────────────────────────────────────────────────────
  const obDate = new Date('2025-12-31');
  await db.collection('m3_journal_entries').insertOne(makeJE(buNum(), obDate, 'Opening Balance as of 01 January 2026', [
    { accountNumber: '1200', accountName: 'Business Checking Account', debit: 85000, credit: 0 },
    { accountNumber: '0200', accountName: 'Office Equipment',          debit: 1200,  credit: 0 },
    { accountNumber: '0210', accountName: 'Furniture & Fixtures',      debit: 3750,  credit: 0 },
    { accountNumber: '0300', accountName: 'Share Capital',             debit: 0, credit: 25000 },
    { accountNumber: '0900', accountName: 'Retained Earnings',         debit: 0, credit: 64950 },
  ], 'OpeningBalance'));
  console.log('[Seed] Created opening balance');

  // ── HELPER: account name lookup ─────────────────────────────────────────────
  const accName: Record<string, string> = {};
  for (const a of accounts) accName[a.number] = a.name;

  // ── SALES INVOICES ──────────────────────────────────────────────────────────
  interface SalesInv {
    _id: mongoose.Types.ObjectId; invoiceNumber: string; customerId: mongoose.Types.ObjectId;
    companyName: string; status: string; invoiceDate: Date; dueDate: Date;
    lineItems: {description:string;unit:string;quantity:number;unitPriceCents:number;vatRate:number;totalNetCents:number;totalVatCents:number;totalGrossCents:number}[];
    totalNetCents: number; totalVatCents: number; totalGrossCents: number;
    paidCents: number; paidAt?: Date;
  }
  const salesInvoices: SalesInv[] = [
    { _id: OID(), invoiceNumber: 'RE2026-0001', customerId: custAlphaId, companyName: 'Alpha Technologies GmbH', status: 'paid', invoiceDate: new Date('2026-01-08'), dueDate: new Date('2026-01-22'), lineItems: [{ description: 'Strategy Consulting – 10 days', unit: 'day', quantity: 10, unitPriceCents: 120000, vatRate: 19, totalNetCents: 1200000, totalVatCents: 228000, totalGrossCents: 1428000 }], totalNetCents: 1200000, totalVatCents: 228000, totalGrossCents: 1428000, paidCents: 1428000, paidAt: new Date('2026-01-20') },
    { _id: OID(), invoiceNumber: 'RE2026-0002', customerId: custGammaId, companyName: 'Gamma Retail GmbH', status: 'paid', invoiceDate: new Date('2026-01-20'), dueDate: new Date('2026-02-19'), lineItems: [{ description: 'IT Consulting – 50h', unit: 'hour', quantity: 50, unitPriceCents: 15000, vatRate: 19, totalNetCents: 750000, totalVatCents: 142500, totalGrossCents: 892500 }, { description: 'Training Workshop – 1 session', unit: 'session', quantity: 1, unitPriceCents: 250000, vatRate: 19, totalNetCents: 250000, totalVatCents: 47500, totalGrossCents: 297500 }], totalNetCents: 1000000, totalVatCents: 190000, totalGrossCents: 1190000, paidCents: 1190000, paidAt: new Date('2026-02-10') },
    { _id: OID(), invoiceNumber: 'RE2026-0003', customerId: custDeltaId, companyName: 'Delta Logistics SE', status: 'paid', invoiceDate: new Date('2026-02-05'), dueDate: new Date('2026-02-26'), lineItems: [{ description: 'Project Management – 80h', unit: 'hour', quantity: 80, unitPriceCents: 18000, vatRate: 19, totalNetCents: 1440000, totalVatCents: 273600, totalGrossCents: 1713600 }], totalNetCents: 1440000, totalVatCents: 273600, totalGrossCents: 1713600, paidCents: 1713600, paidAt: new Date('2026-02-25') },
    { _id: OID(), invoiceNumber: 'RE2026-0004', customerId: custBetaId, companyName: 'Beta Pharma AG', status: 'paid', invoiceDate: new Date('2026-02-18'), dueDate: new Date('2026-03-10'), lineItems: [{ description: 'Strategy Consulting – 8 days', unit: 'day', quantity: 8, unitPriceCents: 120000, vatRate: 19, totalNetCents: 960000, totalVatCents: 182400, totalGrossCents: 1142400 }], totalNetCents: 960000, totalVatCents: 182400, totalGrossCents: 1142400, paidCents: 1142400, paidAt: new Date('2026-03-05') },
    { _id: OID(), invoiceNumber: 'RE2026-0005', customerId: custAlphaId, companyName: 'Alpha Technologies GmbH', status: 'paid', invoiceDate: new Date('2026-03-03'), dueDate: new Date('2026-03-17'), lineItems: [{ description: 'Strategy Consulting – 15 days', unit: 'day', quantity: 15, unitPriceCents: 120000, vatRate: 19, totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000 }], totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000, paidCents: 2142000, paidAt: new Date('2026-03-15') },
    { _id: OID(), invoiceNumber: 'RE2026-0006', customerId: custEpsilonId, companyName: 'Epsilon Finance GmbH', status: 'paid', invoiceDate: new Date('2026-03-12'), dueDate: new Date('2026-04-11'), lineItems: [{ description: 'IT Consulting – 60h', unit: 'hour', quantity: 60, unitPriceCents: 15000, vatRate: 19, totalNetCents: 900000, totalVatCents: 171000, totalGrossCents: 1071000 }, { description: 'Project Management – 40h', unit: 'hour', quantity: 40, unitPriceCents: 18000, vatRate: 19, totalNetCents: 720000, totalVatCents: 136800, totalGrossCents: 856800 }], totalNetCents: 1620000, totalVatCents: 307800, totalGrossCents: 1927800, paidCents: 1927800, paidAt: new Date('2026-04-08') },
    { _id: OID(), invoiceNumber: 'RE2026-0007', customerId: custBetaId, companyName: 'Beta Pharma AG', status: 'paid', invoiceDate: new Date('2026-03-25'), dueDate: new Date('2026-04-24'), lineItems: [{ description: 'Training Workshop – 2 sessions', unit: 'session', quantity: 2, unitPriceCents: 250000, vatRate: 19, totalNetCents: 500000, totalVatCents: 95000, totalGrossCents: 595000 }, { description: 'Software License – 3 months', unit: 'month', quantity: 3, unitPriceCents: 35000, vatRate: 19, totalNetCents: 105000, totalVatCents: 19950, totalGrossCents: 124950 }], totalNetCents: 605000, totalVatCents: 114950, totalGrossCents: 719950, paidCents: 719950, paidAt: new Date('2026-04-20') },
    { _id: OID(), invoiceNumber: 'RE2026-0008', customerId: custDeltaId, companyName: 'Delta Logistics SE', status: 'paid', invoiceDate: new Date('2026-04-07'), dueDate: new Date('2026-04-28'), lineItems: [{ description: 'Strategy Consulting – 12 days', unit: 'day', quantity: 12, unitPriceCents: 120000, vatRate: 19, totalNetCents: 1440000, totalVatCents: 273600, totalGrossCents: 1713600 }, { description: 'Project Management – 20h', unit: 'hour', quantity: 20, unitPriceCents: 18000, vatRate: 19, totalNetCents: 360000, totalVatCents: 68400, totalGrossCents: 428400 }], totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000, paidCents: 2142000, paidAt: new Date('2026-04-26') },
    { _id: OID(), invoiceNumber: 'RE2026-0009', customerId: custGammaId, companyName: 'Gamma Retail GmbH', status: 'paid', invoiceDate: new Date('2026-04-21'), dueDate: new Date('2026-05-12'), lineItems: [{ description: 'IT Consulting – 80h', unit: 'hour', quantity: 80, unitPriceCents: 15000, vatRate: 19, totalNetCents: 1200000, totalVatCents: 228000, totalGrossCents: 1428000 }, { description: 'Training Workshop – 1 session', unit: 'session', quantity: 1, unitPriceCents: 250000, vatRate: 19, totalNetCents: 250000, totalVatCents: 47500, totalGrossCents: 297500 }], totalNetCents: 1450000, totalVatCents: 275500, totalGrossCents: 1725500, paidCents: 1725500, paidAt: new Date('2026-05-08') },
    { _id: OID(), invoiceNumber: 'RE2026-0010', customerId: custAlphaId, companyName: 'Alpha Technologies GmbH', status: 'paid', invoiceDate: new Date('2026-05-05'), dueDate: new Date('2026-05-19'), lineItems: [{ description: 'Strategy Consulting – 18 days', unit: 'day', quantity: 18, unitPriceCents: 120000, vatRate: 19, totalNetCents: 2160000, totalVatCents: 410400, totalGrossCents: 2570400 }], totalNetCents: 2160000, totalVatCents: 410400, totalGrossCents: 2570400, paidCents: 2570400, paidAt: new Date('2026-05-18') },
    { _id: OID(), invoiceNumber: 'RE2026-0011', customerId: custEpsilonId, companyName: 'Epsilon Finance GmbH', status: 'paid', invoiceDate: new Date('2026-05-14'), dueDate: new Date('2026-06-13'), lineItems: [{ description: 'Project Management – 100h', unit: 'hour', quantity: 100, unitPriceCents: 18000, vatRate: 19, totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000 }, { description: 'IT Consulting – 40h', unit: 'hour', quantity: 40, unitPriceCents: 15000, vatRate: 19, totalNetCents: 600000, totalVatCents: 114000, totalGrossCents: 714000 }], totalNetCents: 2400000, totalVatCents: 456000, totalGrossCents: 2856000, paidCents: 2856000, paidAt: new Date('2026-06-10') },
    { _id: OID(), invoiceNumber: 'RE2026-0012', customerId: custBetaId, companyName: 'Beta Pharma AG', status: 'paid', invoiceDate: new Date('2026-05-28'), dueDate: new Date('2026-06-27'), lineItems: [{ description: 'Software License – 6 months', unit: 'month', quantity: 6, unitPriceCents: 35000, vatRate: 19, totalNetCents: 210000, totalVatCents: 39900, totalGrossCents: 249900 }, { description: 'Training Workshop – 2 sessions', unit: 'session', quantity: 2, unitPriceCents: 250000, vatRate: 19, totalNetCents: 500000, totalVatCents: 95000, totalGrossCents: 595000 }], totalNetCents: 710000, totalVatCents: 134900, totalGrossCents: 844900, paidCents: 844900, paidAt: new Date('2026-06-25') },
    { _id: OID(), invoiceNumber: 'RE2026-0013', customerId: custAlphaId, companyName: 'Alpha Technologies GmbH', status: 'paid', invoiceDate: new Date('2026-06-03'), dueDate: new Date('2026-06-17'), lineItems: [{ description: 'Strategy Consulting – 20 days', unit: 'day', quantity: 20, unitPriceCents: 120000, vatRate: 19, totalNetCents: 2400000, totalVatCents: 456000, totalGrossCents: 2856000 }], totalNetCents: 2400000, totalVatCents: 456000, totalGrossCents: 2856000, paidCents: 2856000, paidAt: new Date('2026-06-15') },
    { _id: OID(), invoiceNumber: 'RE2026-0014', customerId: custDeltaId, companyName: 'Delta Logistics SE', status: 'paid', invoiceDate: new Date('2026-06-16'), dueDate: new Date('2026-07-07'), lineItems: [{ description: 'IT Consulting – 120h', unit: 'hour', quantity: 120, unitPriceCents: 15000, vatRate: 19, totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000 }, { description: 'Project Management – 60h', unit: 'hour', quantity: 60, unitPriceCents: 18000, vatRate: 19, totalNetCents: 1080000, totalVatCents: 205200, totalGrossCents: 1285200 }], totalNetCents: 2880000, totalVatCents: 547200, totalGrossCents: 3427200, paidCents: 3427200, paidAt: new Date('2026-07-04') },
    { _id: OID(), invoiceNumber: 'RE2026-0015', customerId: custEpsilonId, companyName: 'Epsilon Finance GmbH', status: 'sent', invoiceDate: new Date('2026-06-27'), dueDate: new Date('2026-07-27'), lineItems: [{ description: 'Strategy Consulting – 10 days', unit: 'day', quantity: 10, unitPriceCents: 120000, vatRate: 19, totalNetCents: 1200000, totalVatCents: 228000, totalGrossCents: 1428000 }, { description: 'Training Workshop – 3 sessions', unit: 'session', quantity: 3, unitPriceCents: 250000, vatRate: 19, totalNetCents: 750000, totalVatCents: 142500, totalGrossCents: 892500 }], totalNetCents: 1950000, totalVatCents: 370500, totalGrossCents: 2320500, paidCents: 0 },
    { _id: OID(), invoiceNumber: 'RE2026-0016', customerId: custAlphaId, companyName: 'Alpha Technologies GmbH', status: 'paid', invoiceDate: new Date('2026-07-08'), dueDate: new Date('2026-07-22'), lineItems: [{ description: 'Strategy Consulting – 15 days', unit: 'day', quantity: 15, unitPriceCents: 120000, vatRate: 19, totalNetCents: 1800000, totalVatCents: 342000, totalGrossCents: 2142000 }, { description: 'IT Consulting – 20h', unit: 'hour', quantity: 20, unitPriceCents: 15000, vatRate: 19, totalNetCents: 300000, totalVatCents: 57000, totalGrossCents: 357000 }], totalNetCents: 2100000, totalVatCents: 399000, totalGrossCents: 2499000, paidCents: 2499000, paidAt: new Date('2026-07-21') },
    { _id: OID(), invoiceNumber: 'RE2026-0017', customerId: custBetaId, companyName: 'Beta Pharma AG', status: 'sent', invoiceDate: new Date('2026-07-22'), dueDate: new Date('2026-08-05'), lineItems: [{ description: 'Project Management – 80h', unit: 'hour', quantity: 80, unitPriceCents: 18000, vatRate: 19, totalNetCents: 1440000, totalVatCents: 273600, totalGrossCents: 1713600 }, { description: 'Training Workshop – 2 sessions', unit: 'session', quantity: 2, unitPriceCents: 250000, vatRate: 19, totalNetCents: 500000, totalVatCents: 95000, totalGrossCents: 595000 }], totalNetCents: 1940000, totalVatCents: 368600, totalGrossCents: 2308600, paidCents: 0 },
    { _id: OID(), invoiceNumber: 'RE2026-0018', customerId: custGammaId, companyName: 'Gamma Retail GmbH', status: 'draft', invoiceDate: new Date('2026-08-11'), dueDate: new Date('2026-09-10'), lineItems: [{ description: 'IT Consulting – 50h', unit: 'hour', quantity: 50, unitPriceCents: 15000, vatRate: 19, totalNetCents: 750000, totalVatCents: 142500, totalGrossCents: 892500 }], totalNetCents: 750000, totalVatCents: 142500, totalGrossCents: 892500, paidCents: 0 },
  ];

  // Insert sales invoices
  await db.collection('m3_sales_invoices').insertMany(salesInvoices.map(inv => ({
    ...inv,
    customerSnapshot: {
      companyName: inv.companyName, legalForm: '', address: { street: '', city: '', zip: '', country: 'DE' }, vatId: '', debtorAccount: '1400',
    },
    sentAt: inv.status !== 'draft' ? inv.invoiceDate : undefined,
    notes: '',
    createdAt: inv.invoiceDate, updatedAt: inv.invoiceDate,
  })));
  console.log(`[Seed] Created ${salesInvoices.length} sales invoices`);

  // Journal entries for sales invoices (sent/paid only)
  const siJournalEntries = [];
  for (const inv of salesInvoices) {
    if (inv.status === 'draft') continue;
    const net = inv.totalNetCents / 100;
    const vat = inv.totalVatCents / 100;
    const gross = inv.totalGrossCents / 100;
    // Determine revenue account from line items
    const revAcct = inv.lineItems.some(l => l.description.includes('Software License')) ? '8200' :
                    inv.lineItems.some(l => l.description.includes('Training')) ? '8100' : '8000';
    siJournalEntries.push(makeJE(buNum(), inv.invoiceDate, `Invoice ${inv.invoiceNumber} – ${inv.companyName}`, [
      { accountNumber: '1400', accountName: accName['1400'], debit: gross, credit: 0 },
      { accountNumber: revAcct, accountName: accName[revAcct], debit: 0, credit: net },
      { accountNumber: '1776', accountName: accName['1776'], debit: 0, credit: vat },
    ], 'SalesInvoice'));
    if (inv.status === 'paid' && inv.paidAt) {
      siJournalEntries.push(makeJE(buNum(), inv.paidAt, `Payment received – ${inv.invoiceNumber}`, [
        { accountNumber: '1200', accountName: accName['1200'], debit: gross, credit: 0 },
        { accountNumber: '1400', accountName: accName['1400'], debit: 0, credit: gross },
      ], 'Payment'));
    }
  }
  await db.collection('m3_journal_entries').insertMany(siJournalEntries);
  console.log(`[Seed] Created ${siJournalEntries.length} sales invoice journal entries`);

  // ── VENDOR INVOICES ──────────────────────────────────────────────────────────
  let viSeq = 0;
  const viNum = () => { viSeq++; return `EK2026-${String(viSeq).padStart(4,'0')}`; };

  interface VendorInv { _id: mongoose.Types.ObjectId; supplierInvoiceNumber: string; supplierId: mongoose.Types.ObjectId; companyName: string; status: string; invoiceDate: Date; dueDate: Date; totalNetCents: number; totalVatCents: number; totalGrossCents: number; paidCents: number; paidAt?: Date; expenseAccount: string; description: string; }
  const vendorInvoices: VendorInv[] = [];

  const monthStarts = [1,2,3,4,5,6,7].map(m => ({ m, d1: new Date(`2026-${String(m).padStart(2,'0')}-01`), d5: new Date(`2026-${String(m).padStart(2,'0')}-05`), d28: new Date(`2026-${String(m).padStart(2,'0')}-28`) }));

  for (const { m, d1, d5, d28 } of monthStarts) {
    const label = ['Jan','Feb','Mar','Apr','May','Jun','Jul'][m-1];
    vendorInvoices.push({
      _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supMainDriveId, companyName: 'MainDrive Real Estate GmbH',
      status: 'paid', invoiceDate: d1, dueDate: d5, totalNetCents: 250000, totalVatCents: 0, totalGrossCents: 250000,
      paidCents: 250000, paidAt: d5, expenseAccount: '4200', description: `Office Rent ${label} 2026`,
    });
    vendorInvoices.push({
      _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supCloudStackId, companyName: 'CloudStack Technologies GmbH',
      status: 'paid', invoiceDate: d1, dueDate: d28, totalNetCents: 48000, totalVatCents: 9120, totalGrossCents: 57120,
      paidCents: 57120, paidAt: d28, expenseAccount: '4980', description: `Cloud Hosting ${label} 2026`,
    });
    vendorInvoices.push({
      _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supCloudStackId, companyName: 'CloudStack Technologies GmbH',
      status: 'paid', invoiceDate: d1, dueDate: d28, totalNetCents: 8500, totalVatCents: 1615, totalGrossCents: 10115,
      paidCents: 10115, paidAt: d28, expenseAccount: '4220', description: `Internet & Phone ${label} 2026`,
    });
  }

  // One-off vendor invoices
  vendorInvoices.push({ _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supMuellerPartnerId, companyName: 'Mueller & Partner Rechtsanwälte', status: 'paid', invoiceDate: new Date('2026-02-10'), dueDate: new Date('2026-02-24'), totalNetCents: 320000, totalVatCents: 60800, totalGrossCents: 380800, paidCents: 380800, paidAt: new Date('2026-02-20'), expenseAccount: '6300', description: 'Legal Consulting Q1 2026' });
  vendorInvoices.push({ _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supProOfficeId, companyName: 'ProOffice Solutions GmbH', status: 'paid', invoiceDate: new Date('2026-03-15'), dueDate: new Date('2026-03-29'), totalNetCents: 42000, totalVatCents: 7980, totalGrossCents: 49980, paidCents: 49980, paidAt: new Date('2026-03-25'), expenseAccount: '4230', description: 'Office Supplies – March 2026' });
  vendorInvoices.push({ _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supMuellerPartnerId, companyName: 'Mueller & Partner Rechtsanwälte', status: 'paid', invoiceDate: new Date('2026-05-08'), dueDate: new Date('2026-05-22'), totalNetCents: 480000, totalVatCents: 91200, totalGrossCents: 571200, paidCents: 571200, paidAt: new Date('2026-05-18'), expenseAccount: '6300', description: 'Contract Review May 2026' });
  vendorInvoices.push({ _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supProOfficeId, companyName: 'ProOffice Solutions GmbH', status: 'paid', invoiceDate: new Date('2026-06-12'), dueDate: new Date('2026-06-26'), totalNetCents: 38500, totalVatCents: 7315, totalGrossCents: 45815, paidCents: 45815, paidAt: new Date('2026-06-22'), expenseAccount: '4230', description: 'Office Supplies – Q2 2026' });
  vendorInvoices.push({ _id: OID(), supplierInvoiceNumber: viNum(), supplierId: supMuellerPartnerId, companyName: 'Mueller & Partner Rechtsanwälte', status: 'approved', invoiceDate: new Date('2026-07-15'), dueDate: new Date('2026-07-29'), totalNetCents: 150000, totalVatCents: 28500, totalGrossCents: 178500, paidCents: 0, expenseAccount: '6300', description: 'Employment Contract Review Jul 2026' });

  await db.collection('m3_vendor_invoices').insertMany(vendorInvoices.map(vi => ({
    ...vi,
    supplierSnapshot: { companyName: vi.companyName, legalForm: '', address: { street: '', city: '', zip: '', country: 'DE' }, vatId: '', creditorAccount: '3300' },
    lineItems: [{ description: vi.description, unit: 'pauschal', quantity: 1, unitPriceCents: vi.totalNetCents, vatRate: vi.totalVatCents > 0 ? 19 : 0, totalNetCents: vi.totalNetCents, totalVatCents: vi.totalVatCents, totalGrossCents: vi.totalGrossCents }],
    approvedAt: vi.status === 'paid' || vi.status === 'approved' ? vi.invoiceDate : undefined,
    notes: '',
    createdAt: vi.invoiceDate, updatedAt: vi.invoiceDate,
  })));
  console.log(`[Seed] Created ${vendorInvoices.length} vendor invoices`);

  // Journal entries for vendor invoices
  const viJournalEntries = [];
  for (const vi of vendorInvoices) {
    const net = vi.totalNetCents / 100;
    const vat = vi.totalVatCents / 100;
    const gross = vi.totalGrossCents / 100;
    const lines: {accountNumber:string;accountName:string;debit:number;credit:number}[] = [];
    lines.push({ accountNumber: vi.expenseAccount, accountName: accName[vi.expenseAccount] ?? vi.expenseAccount, debit: net, credit: 0 });
    if (vat > 0) lines.push({ accountNumber: '1580', accountName: accName['1580'], debit: vat, credit: 0 });
    lines.push({ accountNumber: '3300', accountName: accName['3300'], debit: 0, credit: gross });
    viJournalEntries.push(makeJE(buNum(), vi.invoiceDate, `Vendor Invoice ${vi.supplierInvoiceNumber} – ${vi.companyName}`, lines, 'VendorInvoice'));
    if (vi.status === 'paid' && vi.paidAt) {
      viJournalEntries.push(makeJE(buNum(), vi.paidAt, `Payment to ${vi.companyName} – ${vi.supplierInvoiceNumber}`, [
        { accountNumber: '3300', accountName: accName['3300'], debit: gross, credit: 0 },
        { accountNumber: '1200', accountName: accName['1200'], debit: 0, credit: gross },
      ], 'Payment'));
    }
  }
  await db.collection('m3_journal_entries').insertMany(viJournalEntries);
  console.log(`[Seed] Created ${viJournalEntries.length} vendor invoice journal entries`);

  // ── PAYROLL ──────────────────────────────────────────────────────────────────
  const payrollEntries = [
    { employeeId: empJamesId, employeeNumber: 'EMP-001', employeeName: 'James Wilson', salaryType: 'monthly' as const, grossCents: 550000, hoursWorked: 0, additionalCents: 0, deductionCents: 0, totalGrossCents: 550000, taxCents: 110000, socialSecurityCents: 115500, netCents: 324500, personnelAccount: '4000', costCenterNumber: 'CC-002', note: '' },
    { employeeId: empSarahId, employeeNumber: 'EMP-002', employeeName: 'Sarah Chen', salaryType: 'monthly' as const, grossCents: 420000, hoursWorked: 0, additionalCents: 0, deductionCents: 0, totalGrossCents: 420000, taxCents: 84000, socialSecurityCents: 88200, netCents: 247800, personnelAccount: '4000', costCenterNumber: 'CC-001', note: '' },
    { employeeId: empMichaelId, employeeNumber: 'EMP-003', employeeName: 'Michael Braun', salaryType: 'monthly' as const, grossCents: 380000, hoursWorked: 0, additionalCents: 0, deductionCents: 0, totalGrossCents: 380000, taxCents: 76000, socialSecurityCents: 79800, netCents: 224200, personnelAccount: '4000', costCenterNumber: 'CC-001', note: '' },
    { employeeId: empLisaId, employeeNumber: 'EMP-004', employeeName: 'Lisa Weber', salaryType: 'monthly' as const, grossCents: 290000, hoursWorked: 0, additionalCents: 0, deductionCents: 0, totalGrossCents: 290000, taxCents: 58000, socialSecurityCents: 60900, netCents: 171100, personnelAccount: '4000', costCenterNumber: 'CC-002', note: '' },
  ];
  const totalGrossPayroll = 1640000;
  const totalNetPayroll   = 967600;
  const monthLabels = ['January','February','March','April','May','June','July'];

  const payrollDocs = [];
  const payrollJEs = [];
  for (let m = 1; m <= 7; m++) {
    const payDate = new Date(`2026-${String(m).padStart(2,'0')}-25`);
    const label = monthLabels[m-1];
    const payrollJEId = OID();
    const je = {
      ...makeJE(buNum(), payDate, `Payroll ${label} 2026`, [
        { accountNumber: '4000', accountName: accName['4000'], debit: totalGrossPayroll/100, credit: 0 },
        { accountNumber: '1200', accountName: accName['1200'], debit: 0, credit: totalNetPayroll/100 },
        { accountNumber: '3500', accountName: accName['3500'], debit: 0, credit: (totalGrossPayroll - totalNetPayroll)/100 },
      ], 'Payment'),
      _id: payrollJEId,
    };
    payrollJEs.push(je);
    payrollDocs.push({
      _id: OID(), tenantId,
      payrollNumber: `LOHN-2026-${String(m).padStart(2,'0')}`,
      period: `${label} 2026`, year: 2026, month: m,
      status: 'posted', entries: payrollEntries,
      totalGrossCents: totalGrossPayroll, totalNetCents: totalNetPayroll,
      journalEntryId: payrollJEId, notes: '',
      createdBy: adminId, finalizedAt: payDate, postedAt: payDate,
      createdAt: payDate, updatedAt: payDate,
    });
  }
  await db.collection('m3_payrolls').insertMany(payrollDocs);
  await db.collection('m3_journal_entries').insertMany(payrollJEs);
  console.log(`[Seed] Created ${payrollDocs.length} payroll records`);

  // ── CASHBOOK ENTRIES ─────────────────────────────────────────────────────────
  interface CashEntry { date: Date; type: 'receipt'|'payment'; description: string; amountCents: number; contraAccount: string; }
  const cashEntries: CashEntry[] = [
    { date: new Date('2026-01-15'), type: 'receipt',  description: 'Client advance payment',        amountCents: 50000,  contraAccount: '8000' },
    { date: new Date('2026-02-20'), type: 'receipt',  description: 'Petty cash replenishment',      amountCents: 20000,  contraAccount: '8400' },
    { date: new Date('2026-04-10'), type: 'receipt',  description: 'Workshop registration fee',     amountCents: 25000,  contraAccount: '8100' },
    { date: new Date('2026-06-05'), type: 'receipt',  description: 'Miscellaneous income',          amountCents: 15000,  contraAccount: '8400' },
    { date: new Date('2026-08-01'), type: 'receipt',  description: 'Cash sale',                     amountCents: 30000,  contraAccount: '8000' },
    { date: new Date('2026-01-22'), type: 'payment',  description: 'Office supplies (cash)',        amountCents: 8900,   contraAccount: '4230' },
    { date: new Date('2026-03-08'), type: 'payment',  description: 'Postage',                       amountCents: 4500,   contraAccount: '4240' },
    { date: new Date('2026-05-15'), type: 'payment',  description: 'Refreshments for workshop',    amountCents: 12300,  contraAccount: '4810' },
    { date: new Date('2026-07-03'), type: 'payment',  description: 'Taxi receipts',                 amountCents: 6700,   contraAccount: '4800' },
    { date: new Date('2026-08-12'), type: 'payment',  description: 'Stationery',                    amountCents: 3200,   contraAccount: '4230' },
  ];

  const cbDocs = [];
  const cbJEs = [];
  for (const e of cashEntries) {
    const num = kbNum();
    const amt = e.amountCents / 100;
    cbDocs.push({
      _id: OID(), tenantId, entryNumber: num, date: e.date, type: e.type, description: e.description,
      cashAccount: '1000', cashAccountName: accName['1000'],
      contraAccount: e.contraAccount, contraAccountName: accName[e.contraAccount] ?? e.contraAccount,
      amountCents: e.amountCents, vatRate: 0, vatCents: 0, netCents: e.amountCents,
      createdBy: adminId, createdAt: e.date, updatedAt: e.date,
    });
    const lines = e.type === 'receipt'
      ? [{ accountNumber: '1000', accountName: accName['1000'], debit: amt, credit: 0 }, { accountNumber: e.contraAccount, accountName: accName[e.contraAccount] ?? e.contraAccount, debit: 0, credit: amt }]
      : [{ accountNumber: e.contraAccount, accountName: accName[e.contraAccount] ?? e.contraAccount, debit: amt, credit: 0 }, { accountNumber: '1000', accountName: accName['1000'], debit: 0, credit: amt }];
    cbJEs.push(makeJE(buNum(), e.date, `${num}: ${e.description}`, lines));
  }
  await db.collection('m3_cashbook_entries').insertMany(cbDocs);
  await db.collection('m3_journal_entries').insertMany(cbJEs);
  console.log(`[Seed] Created ${cbDocs.length} cashbook entries`);

  // ── TRAVEL EXPENSES ──────────────────────────────────────────────────────────
  await db.collection('m3_travel_expenses').insertMany([
    {
      _id: OID(), tenantId, expenseNumber: 'TE-2026-001',
      employeeId: empSarahId, employeeName: 'Sarah Chen',
      purpose: 'Client meeting – Alpha Technologies Q1 Review', destination: 'Berlin',
      startDate: new Date('2026-03-10'), endDate: new Date('2026-03-11'),
      lines: [
        { category: 'transport', description: 'Train Frankfurt–Berlin return', amountCents: 18500, vatRate: 7, receiptNumber: 'DB-20260310' },
        { category: 'hotel',     description: 'Hotel 1 night',                amountCents: 14500, vatRate: 7, receiptNumber: 'HTL-20260310' },
        { category: 'meal',      description: 'Dinner with client',           amountCents: 5500,  vatRate: 19, receiptNumber: 'REST-20260310' },
      ],
      totalAmountCents: 38500, costCenterNumber: 'CC-001', personnelAccount: '4000', expenseAccount: '4800',
      status: 'approved', submittedAt: new Date('2026-03-12'), approvedBy: adminId, approvedAt: new Date('2026-03-13'),
      rejectionReason: '', notes: '', createdBy: empSarahId,
      createdAt: new Date('2026-03-12'), updatedAt: new Date('2026-03-13'),
    },
    {
      _id: OID(), tenantId, expenseNumber: 'TE-2026-002',
      employeeId: empMichaelId, employeeName: 'Michael Braun',
      purpose: 'IT Workshop – CloudStack Partner Event', destination: 'Munich',
      startDate: new Date('2026-05-20'), endDate: new Date('2026-05-21'),
      lines: [
        { category: 'transport', description: 'Flight Frankfurt–Munich return', amountCents: 28000, vatRate: 0, receiptNumber: 'LH-20260520' },
        { category: 'hotel',     description: 'Hotel 1 night',                  amountCents: 16500, vatRate: 7, receiptNumber: 'HTL-20260520' },
        { category: 'meal',      description: 'Meals during trip',              amountCents: 7500,  vatRate: 19, receiptNumber: 'MEAL-20260520' },
      ],
      totalAmountCents: 52000, costCenterNumber: 'CC-001', personnelAccount: '4000', expenseAccount: '4800',
      status: 'approved', submittedAt: new Date('2026-05-22'), approvedBy: adminId, approvedAt: new Date('2026-05-23'),
      rejectionReason: '', notes: '', createdBy: empMichaelId,
      createdAt: new Date('2026-05-22'), updatedAt: new Date('2026-05-23'),
    },
  ]);
  console.log('[Seed] Created 2 travel expenses');

  // ── ABSENCES ─────────────────────────────────────────────────────────────────
  await db.collection('m3_absences').insertMany([
    {
      _id: OID(), tenantId, employeeId: empLisaId, employeeName: 'Lisa Weber',
      type: 'vacation', startDate: new Date('2026-07-14'), endDate: new Date('2026-07-18'),
      days: 5, reason: 'Annual leave', status: 'approved',
      approvedBy: adminId, approvedAt: new Date('2026-07-01'), notes: '',
      createdBy: empLisaId, createdAt: new Date('2026-06-28'), updatedAt: new Date('2026-07-01'),
    },
    {
      _id: OID(), tenantId, employeeId: empJamesId, employeeName: 'James Wilson',
      type: 'sick', startDate: new Date('2026-03-10'), endDate: new Date('2026-03-11'),
      days: 2, reason: 'Illness', status: 'approved',
      approvedBy: adminId, approvedAt: new Date('2026-03-10'), notes: '',
      createdBy: empJamesId, createdAt: new Date('2026-03-10'), updatedAt: new Date('2026-03-10'),
    },
  ]);
  console.log('[Seed] Created 2 absences');

  // ── COUNTERS ─────────────────────────────────────────────────────────────────
  await db.collection('m3_counters').insertMany([
    { tenantId: tenantId.toString(), key: 'journal',         seq: buSeq },
    { tenantId: tenantId.toString(), key: 'cashbook',        seq: kbSeq.v },
    { tenantId: tenantId.toString(), key: 'invoice_2026',     seq: salesInvoices.length },
    { tenantId: tenantId.toString(), key: 'vendor_invoice',  seq: vendorInvoices.length },
    { tenantId: tenantId.toString(), key: 'payroll',         seq: payrollDocs.length },
    { tenantId: tenantId.toString(), key: 'travel_expense',  seq: 2 },
  ]);
  console.log('[Seed] Set counters');

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  const totalJEs = await db.collection('m3_journal_entries').countDocuments({ tenantId });
  console.log('\n══════════════════════════════════════════════');
  console.log('  M3 ERP — Seed Complete (Meridian Consulting GmbH)');
  console.log('══════════════════════════════════════════════');
  console.log('  Tenant code:    demo');
  console.log(`  Admin:          admin@erp.demo / ${erpPw}`);
  console.log(`  Accountant:     accountant@erp.demo / ${erpPw}`);
  console.log(`  Viewer:         viewer@erp.demo / ${erpPw}`);
  console.log(`  Employee (POS): kassierer@erp.demo / ${kassePw}`);
  console.log('──────────────────────────────────────────────');
  console.log(`  Accounts:       ${accounts.length}`);
  console.log(`  Customers:      5`);
  console.log(`  Suppliers:      4`);
  console.log(`  Employees:      4`);
  console.log(`  Service Items:  5`);
  console.log(`  Sales Invoices: ${salesInvoices.length}  (Jan–Aug 2026)`);
  console.log(`  Vendor Invoices:${vendorInvoices.length}`);
  console.log(`  Payrolls:       ${payrollDocs.length}  (Jan–Jul 2026)`);
  console.log(`  Cashbook:       ${cbDocs.length}  entries`);
  console.log(`  Journal Entries:${totalJEs}  total`);
  console.log(`  SEPA Mandates:  2`);
  console.log(`  Fixed Assets:   2`);
  console.log(`  Travel Expenses:2`);
  console.log(`  Absences:       2`);
  console.log('══════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

seed().catch(err => { console.error('[Seed] ERROR:', err); process.exit(1); });
