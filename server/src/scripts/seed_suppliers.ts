import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

const SUPPLIERS = [
  {
    companyName:          'NetCom Telekommunikation GmbH',
    legalForm:            'GmbH',
    vatId:                'DE987654321',
    address:              { street: 'Mainzer Landstraße 50', city: 'Frankfurt am Main', zip: '60325', country: 'DE' },
    contacts: [{
      name: 'Sandra Berger', email: 's.berger@netcom-gmbh.de',
      phone: '069 11223344', position: 'Kundenbetreuung', isPrimary: true,
    }],
    paymentTermsDays:     21,
    iban:                 'DE91200400100532013001',
    bic:                  'COBADEFFXXX',
    creditorAccount:      '70020',
    defaultExpenseAccount: '4920',
    paymentBlock:         false,
    taxExempt:            false,
    isActive:             true,
    notes:                'Vertragsnr. NC-2024-0047',
  },
  {
    companyName:          'Steuerberatung Schmidt & Partner mbB',
    legalForm:            'mbB',
    vatId:                'DE112233445',
    address:              { street: 'Bahnhofstraße 22', city: 'Stuttgart', zip: '70173', country: 'DE' },
    contacts: [{
      name: 'Dr. Thomas Schmidt', email: 't.schmidt@steuer-schmidt.de',
      phone: '0711 55443322', position: 'Steuerberater', isPrimary: true,
    }],
    paymentTermsDays:     30,
    iban:                 'DE36200400100532013002',
    bic:                  'COBADEFFXXX',
    creditorAccount:      '70030',
    defaultExpenseAccount: '4900',
    paymentBlock:         false,
    taxExempt:            false,
    isActive:             true,
    notes:                'Monatliches Honorar 450 € netto',
  },
  {
    companyName:          'Arbeitskleidung Profi GmbH',
    legalForm:            'GmbH',
    vatId:                'DE556677889',
    address:              { street: 'Gewerbepark 8', city: 'Nürnberg', zip: '90451', country: 'DE' },
    contacts: [{
      name: 'Maria Hofmann', email: 'm.hofmann@ak-profi.de',
      phone: '0911 66778899', position: 'Auftragsannahme', isPrimary: true,
    }],
    paymentTermsDays:     30,
    iban:                 'DE57200400100532013003',
    bic:                  'COBADEFFXXX',
    creditorAccount:      '70040',
    defaultExpenseAccount: '4980',
    paymentBlock:         false,
    taxExempt:            false,
    isActive:             true,
    notes:                'Sammelbestellung Q1/Q3 — Mindestbestellmenge 20 Stück',
  },
  {
    companyName:          'DigiSoft Solutions UG',
    legalForm:            'UG',
    vatId:                'DE334455667',
    address:              { street: 'Startup-Allee 3', city: 'Berlin', zip: '10115', country: 'DE' },
    contacts: [{
      name: 'Felix Wagner', email: 'f.wagner@digisoft.io',
      phone: '030 99887766', position: 'Geschäftsführer', isPrimary: true,
    }],
    paymentTermsDays:     14,
    iban:                 'DE02200400100532013004',
    bic:                  'COBADEFFXXX',
    creditorAccount:      '70050',
    defaultExpenseAccount: '4930',
    paymentBlock:         false,
    taxExempt:            false,
    isActive:             true,
    notes:                'Hosting + Support Paket — monatliche Abrechnung',
  },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[Supplier Seed] Connected to MongoDB');

  const db      = mongoose.connection.db!;
  const tenants = db.collection('tenants');
  const tenant  = await tenants.findOne({ loginCode: 'demo' });

  if (!tenant) {
    console.error('[Supplier Seed] Demo tenant not found. Run seed.ts first.');
    process.exit(1);
  }

  const tenantId  = tenant._id as mongoose.Types.ObjectId;
  const suppliers = db.collection('m3_suppliers');
  const counters  = db.collection('m3_counters');

  // Read current sequence (set by first manually-added supplier)
  const counterKey = { tenantId: tenantId.toString(), key: 'supplier_number' };
  let counter = await counters.findOne(counterKey);
  let seq = counter?.seq ?? 1;

  let inserted = 0;
  for (const s of SUPPLIERS) {
    const exists = await suppliers.findOne({ tenantId, companyName: s.companyName });
    if (exists) {
      console.log(`[Supplier Seed] Already exists — skipping: ${s.companyName}`);
      continue;
    }

    seq++;
    const supplierNumber = `LI-${String(seq).padStart(5, '0')}`;

    await suppliers.insertOne({
      tenantId,
      supplierNumber,
      ...s,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Keep counter in sync
    await counters.updateOne(
      counterKey,
      { $set: { seq } },
      { upsert: true }
    );

    console.log(`[Supplier Seed] ✓ ${supplierNumber} — ${s.companyName}`);
    inserted++;
  }

  console.log(`[Supplier Seed] Done — ${inserted} supplier(s) inserted.`);
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
