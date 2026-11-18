import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/orgx');
  const db = mongoose.connection.db!;

  const users = db.collection('users');
  const customers = db.collection('m3_customers');

  const usersFound = await users.find({
    $or: [
      { name: /mustermann/i },
      { firstName: /max/i },
      { lastName: /mustermann/i },
      { email: /mustermann/i },
    ],
  }).toArray();

  const custFound = await customers.find({
    $or: [
      { companyName: /mustermann/i },
      { contactName: /mustermann/i },
    ],
  }).toArray();

  console.log('Users matching Max Mustermann:', usersFound.length);
  usersFound.forEach(u => console.log(' -', u.email, '|', u.firstName || '', u.lastName || '', '| role:', u.role, '| tenantId:', String(u.tenantId)));

  console.log('\nCustomers matching Mustermann:', custFound.length);
  custFound.forEach(c => console.log(' -', c.companyName, '|', c.contactName, '| tenantId:', String(c.tenantId)));

  await mongoose.disconnect();
}

main().catch(console.error);
