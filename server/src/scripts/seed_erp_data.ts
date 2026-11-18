import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { SKR03 } from '../data/skr03';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

function generateMonthlyPeriods(fiscalYearId: mongoose.Types.ObjectId, tenantId: mongoose.Types.ObjectId, year: number) {
  const periods = [];
  for (let month = 0; month < 12; month++) {
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 0); // last day of month
    const name  = start.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    periods.push({
      tenantId,
      fiscalYearId,
      name,
      number: month + 1,
      startDate: start,
      endDate:   end,
      status:    'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return periods;
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[M3 Data Seed] Connected to MongoDB');

  const db      = mongoose.connection.db!;
  const tenants = db.collection('tenants');

  const tenant = await tenants.findOne({ loginCode: 'demo' });
  if (!tenant) {
    console.error('[M3 Data Seed] Demo tenant not found. Run seed.ts first.');
    process.exit(1);
  }
  const tenantId = tenant._id as mongoose.Types.ObjectId;
  console.log(`[M3 Data Seed] Tenant: ${tenant.name} (${tenantId})`);

  // ── 1. Company Settings ───────────────────────────────────────────────────
  const settings = db.collection('m3_companysettings');
  const existing = await settings.findOne({ tenantId });
  if (existing) {
    console.log('[M3 Data Seed] Company settings already exist — skipping');
  } else {
    await settings.insertOne({
      tenantId,
      companyName:            'Demo GmbH',
      legalForm:              'GmbH',
      address: {
        street:               'Musterstraße 1',
        city:                 'Berlin',
        zip:                  '10115',
        country:              'DE',
      },
      vatId:                  'DE123456789',
      steuernummer:           '12/345/67890',
      hrNumber:               'HRB 12345 B',
      fiscalYearStart:        '01-01',
      chartOfAccounts:        'SKR03',
      vatPeriod:              'quarterly',
      invoicePrefix:          'RE',
      invoiceStartNumber:     1000,
      invoiceDueDays:         14,
      invoiceTermsText:       'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
      datevBeraternummer:     '',
      datevMandantennummer:   '',
      dunningLevels:          [
        { level: 1, daysOverdue: 7,  fee: 0,    text: 'Erste Mahnung' },
        { level: 2, daysOverdue: 14, fee: 500,  text: 'Zweite Mahnung' },
        { level: 3, daysOverdue: 28, fee: 1500, text: 'Letzte Mahnung vor Inkasso' },
      ],
      mileageRateCents:        30,
      poApprovalThresholdCents: 100000,
      createdAt:               new Date(),
      updatedAt:               new Date(),
    });
    console.log('[M3 Data Seed] ✓ Company settings created (Demo GmbH, SKR03, DE123456789)');
  }

  // ── 2. Chart of Accounts (SKR03) ──────────────────────────────────────────
  const accounts = db.collection('m3_accounts');
  const accountCount = await accounts.countDocuments({ tenantId });
  if (accountCount > 0) {
    console.log(`[M3 Data Seed] ${accountCount} accounts already exist — skipping`);
  } else {
    const docs = SKR03.map((a) => ({
      tenantId,
      number:       a.number,
      name:         a.name,
      type:         a.type,
      subtype:      a.subtype,
      taxCode:      a.taxCode,
      parentNumber: '',
      isActive:     true,
      isLocked:     false,
      notes:        '',
      createdAt:    new Date(),
      updatedAt:    new Date(),
    }));
    await accounts.insertMany(docs);
    console.log(`[M3 Data Seed] ✓ Imported ${docs.length} SKR03 accounts`);
  }

  // ── 3. Fiscal Year 2026 with monthly periods ──────────────────────────────
  const fiscalYears = db.collection('m3_fiscalyears');
  const periods     = db.collection('m3_periods');

  const year = 2026;
  const existingFY = await fiscalYears.findOne({ tenantId, name: `Geschäftsjahr ${year}` });
  if (existingFY) {
    console.log(`[M3 Data Seed] Fiscal year ${year} already exists — skipping`);
  } else {
    const fyRes = await fiscalYears.insertOne({
      tenantId,
      name:      `Geschäftsjahr ${year}`,
      startDate: new Date(year, 0, 1),
      endDate:   new Date(year, 11, 31),
      status:    'open',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const fyId = fyRes.insertedId as mongoose.Types.ObjectId;

    const periodDocs = generateMonthlyPeriods(fyId, tenantId, year);
    await periods.insertMany(periodDocs);
    console.log(`[M3 Data Seed] ✓ Fiscal year ${year} created with 12 monthly periods`);
  }

  console.log('\n[M3 Data Seed] Done! You can now create journal entries.');
  console.log('  → Login:      http://localhost:3002');
  console.log('  → Buchführung: http://localhost:3002/erp/buchfuehrung/new');
  console.log('  → Kontenplan:  http://localhost:3002/erp/accounts');
  console.log('  → Geschäftsjahre: http://localhost:3002/erp/einstellungen/geschaeftsjahre');

  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
