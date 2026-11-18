import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

const CUSTOMERS = [
  {
    companyName:      'Automotive Parts GmbH',
    legalForm:        'GmbH',
    vatId:            'DE211234567',
    address:          { street: 'Werkstraße 5', city: 'Stuttgart', zip: '70372', country: 'DE' },
    contacts: [{
      name: 'Andreas Braun', email: 'a.braun@automotive-parts.de',
      phone: '0711 33445566', position: 'Einkaufsleiter', isPrimary: true,
    }],
    paymentTermsDays: 30,
    creditLimitCents: 1500000,
    debtorAccount:    '10001',
    dunningBlock:     false,
    taxExempt:        false,
    isActive:         true,
    notes:            'Rahmenvertrag gültig bis 31.12.2025 — Personaldienstleistungen Produktion',
  },
  {
    companyName:      'LogiTrans Spedition AG',
    legalForm:        'AG',
    vatId:            'DE309876543',
    address:          { street: 'Hafenring 12', city: 'Hamburg', zip: '20457', country: 'DE' },
    contacts: [
      { name: 'Petra Lange', email: 'p.lange@logitrans.de', phone: '040 88776655', position: 'Personalreferentin', isPrimary: true },
      { name: 'Bernd Koch',  email: 'b.koch@logitrans.de',  phone: '040 88776600', position: 'Geschäftsführer',    isPrimary: false },
    ],
    paymentTermsDays: 14,
    creditLimitCents: 2000000,
    debtorAccount:    '10002',
    dunningBlock:     false,
    taxExempt:        false,
    isActive:         true,
    notes:            'Schwerpunkt: Lagerlogistik & Staplerfahrer',
  },
  {
    companyName:      'CleanPro Gebäudedienste GmbH',
    legalForm:        'GmbH',
    vatId:            'DE445566778',
    address:          { street: 'Reinigungsweg 3', city: 'Köln', zip: '50667', country: 'DE' },
    contacts: [{
      name: 'Stefan Mayer', email: 's.mayer@cleanpro.de',
      phone: '0221 99887766', position: 'Niederlassungsleiter', isPrimary: true,
    }],
    paymentTermsDays: 21,
    creditLimitCents: 800000,
    debtorAccount:    '10003',
    dunningBlock:     false,
    taxExempt:        false,
    isActive:         true,
    notes:            'Reinigungspersonal — Abruf nach Bedarf',
  },
  {
    companyName:      'TechBau Hoch- und Tiefbau GmbH',
    legalForm:        'GmbH',
    vatId:            'DE667788990',
    address:          { street: 'Baustelle Ost 8', city: 'Leipzig', zip: '04103', country: 'DE' },
    contacts: [{
      name: 'Ralf Zimmermann', email: 'r.zimmermann@techbau.de',
      phone: '0341 22334455', position: 'Bauleiter', isPrimary: true,
    }],
    paymentTermsDays: 30,
    creditLimitCents: 3000000,
    debtorAccount:    '10004',
    dunningBlock:     false,
    taxExempt:        false,
    isActive:         true,
    notes:            'Saisonale Verstärkung — Frühjahr bis Herbst',
  },
  {
    companyName:      'Handels KG Schreiber & Söhne',
    legalForm:        'KG',
    vatId:            'DE778899001',
    address:          { street: 'Marktplatz 1', city: 'Nürnberg', zip: '90403', country: 'DE' },
    contacts: [{
      name: 'Heinrich Schreiber', email: 'h.schreiber@schreiber-soehne.de',
      phone: '0911 11223344', position: 'Inhaber', isPrimary: true,
    }],
    paymentTermsDays: 7,
    creditLimitCents: 500000,
    debtorAccount:    '10005',
    dunningBlock:     false,
    taxExempt:        false,
    isActive:         true,
    notes:            'Kassenpersonal & Lagerhilfe — Weihnachtsgeschäft',
  },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[Customer Seed] Connected to MongoDB');

  const db      = mongoose.connection.db!;
  const tenants = db.collection('tenants');
  const tenant  = await tenants.findOne({ loginCode: 'demo' });

  if (!tenant) {
    console.error('[Customer Seed] Demo tenant not found. Run seed.ts first.');
    process.exit(1);
  }

  const tenantId  = tenant._id as mongoose.Types.ObjectId;
  const customers = db.collection('m3_customers');
  const counters  = db.collection('m3_counters');

  const counterKey = { tenantId: tenantId.toString(), key: 'customer_number' };
  let counter = await counters.findOne(counterKey);
  let seq = counter?.seq ?? 0;

  let inserted = 0;
  for (const c of CUSTOMERS) {
    const exists = await customers.findOne({ tenantId, companyName: c.companyName });
    if (exists) {
      console.log(`[Customer Seed] Already exists — skipping: ${c.companyName}`);
      continue;
    }

    seq++;
    const customerNumber = `KD-${String(seq).padStart(5, '0')}`;
    const debtorAccount  = c.debtorAccount || String(10000 + seq);

    await customers.insertOne({
      tenantId,
      customerNumber,
      ...c,
      debtorAccount,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await counters.updateOne(
      counterKey,
      { $set: { seq } },
      { upsert: true }
    );

    console.log(`[Customer Seed] ✓ ${customerNumber} (${debtorAccount}) — ${c.companyName}`);
    inserted++;
  }

  console.log(`[Customer Seed] Done — ${inserted} customer(s) inserted.`);
  await mongoose.disconnect();
}

seed().catch(e => { console.error(e); process.exit(1); });
