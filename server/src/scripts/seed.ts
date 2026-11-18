import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/orgx';

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('[M3 Seed] Connected to MongoDB');

  // -- collections (using native driver to avoid model conflicts) --
  const db = mongoose.connection.db!;
  const tenants = db.collection('tenants');
  const users   = db.collection('users');

  // Find or create demo tenant
  let tenant = await tenants.findOne({ loginCode: 'demo' });
  if (!tenant) {
    const res = await tenants.insertOne({
      name: 'Demo GmbH', loginCode: 'demo', status: 'active',
      enabledModules: ['m1', 'm2', 'm3'], createdAt: new Date(), updatedAt: new Date(),
    });
    tenant = await tenants.findOne({ _id: res.insertedId });
    console.log('[M3 Seed] Created demo tenant');
  } else {
    // Ensure m3 is in enabledModules
    const modules: string[] = tenant.enabledModules || [];
    if (!modules.includes('m3')) {
      await tenants.updateOne({ _id: tenant._id }, { $addToSet: { enabledModules: 'm3' }, $set: { updatedAt: new Date() } });
      console.log('[M3 Seed] Added m3 to demo tenant enabledModules');
    }
  }

  const tenantId = tenant!._id;

  const erpPw    = process.env.SEED_ERP_PASSWORD   ?? 'Erp1234!';
  const kassePw  = process.env.SEED_KASSE_PASSWORD ?? 'Kasse1234!';
  const erp_users = [
    { email: 'admin@erp.demo',          password: erpPw,          role: 'erp_admin',      firstName: 'ERP',       lastName: 'Admin' },
    { email: 'buchhalter@erp.demo',     password: erpPw,          role: 'erp_accountant', firstName: 'Max',       lastName: 'Buchhalter' },
    { email: 'viewer@erp.demo',         password: erpPw,          role: 'erp_viewer',     firstName: 'Leser',     lastName: 'Viewer' },
    { email: 'steuerberater@erp.demo',  password: erpPw,          role: 'erp_tax_advisor',firstName: 'Steuer',    lastName: 'Berater' },
    { email: 'kassierer@erp.demo',      password: kassePw,        role: 'erp_employee',   firstName: 'Kassa',     lastName: 'Mitarbeiter' },
  ];

  for (const u of erp_users) {
    const existing = await users.findOne({ email: u.email, tenantId });
    if (existing) {
      console.log(`[M3 Seed] User already exists: ${u.email}`);
      continue;
    }
    const passwordHash = await bcrypt.hash(u.password, 12);
    await users.insertOne({
      tenantId,
      email: u.email,
      passwordHash,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      status: 'active',
      emailVerified: true,
      twoFactorEnabled: false,
      failedLoginAttempts: 0,
      refreshTokenHashes: [],
      language: 'de',
      notificationPreferences: { email: true, sms: true, push: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`[M3 Seed] Created ${u.role}: ${u.email} / ${u.password}`);
  }

  console.log('\n[M3 Seed] Done!');
  console.log('  Tenant code: demo');
  console.log(`  ERP Admin:   admin@erp.demo / ${erpPw}`);
  console.log(`  Accountant:  buchhalter@erp.demo / ${erpPw}`);
  console.log(`  Viewer:      viewer@erp.demo / ${erpPw}`);
  console.log(`  Tax Advisor: steuerberater@erp.demo / ${erpPw}`);
  console.log(`  Employee:    kassierer@erp.demo / ${kassePw}`);

  await mongoose.disconnect();
}

seed().catch((err) => { console.error(err); process.exit(1); });
