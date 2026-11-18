import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/orgx');
  const db = mongoose.connection.db!;

  const cn = db.collection('m3_credit_notes');
  const si = db.collection('m3_sales_invoices');

  const cnAll = await cn.find({}).limit(10).toArray();
  const siCancelled = await si.find({ status: 'cancelled' }).limit(5).toArray();

  console.log('=== Credit Notes (total:', await cn.countDocuments(), ') ===');
  cnAll.forEach(c => console.log(JSON.stringify({
    status: c.status,
    year: c.creditNoteDate ? new Date(c.creditNoteDate).getFullYear() : null,
    tenantId: String(c.tenantId),
    items: (c.lineItems || []).map((li: { itemName?: string; description?: string; quantity: number }) => ({
      name: li.itemName || li.description || '(empty)',
      qty: li.quantity,
    })),
  })));

  console.log('\n=== Cancelled Invoices (total:', await si.countDocuments({ status: 'cancelled' }), ') ===');
  siCancelled.forEach(i => console.log(JSON.stringify({
    status: i.status,
    year: i.invoiceDate ? new Date(i.invoiceDate).getFullYear() : null,
    tenantId: String(i.tenantId),
    customer: i.customerSnapshot?.companyName,
  })));

  await mongoose.disconnect();
}

main().catch(console.error);
