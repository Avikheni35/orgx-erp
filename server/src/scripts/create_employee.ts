import bcrypt from 'bcryptjs';
import { MongoClient } from 'mongodb';

async function main() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('orgx');
  const adminUser = await db.collection('users').findOne({ email: 'admin@erp.demo' });
  console.log('admin tenantId:', adminUser?.tenantId);
  const tenant = { _id: adminUser!.tenantId };

  const existing = await db.collection('users').findOne({ email: 'kassierer@erp.demo' });
  if (existing) {
    console.log('Already exists, role:', existing.role);
  } else {
    const hash = await bcrypt.hash('Kasse1234!', 12);
    await db.collection('users').insertOne({
      tenantId: tenant!._id, email: 'kassierer@erp.demo', passwordHash: hash,
      role: 'erp_employee', firstName: 'Max', lastName: 'Kassierer',
      status: 'active', emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
    });
    console.log('Created: kassierer@erp.demo / Kasse1234!');
  }
  await client.close();
  process.exit(0);
}
main().catch(console.error);
