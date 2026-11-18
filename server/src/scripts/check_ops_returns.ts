import mongoose from 'mongoose';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/orgx');
  const db = mongoose.connection.db!;
  const si = db.collection('m3_sales_invoices');

  // POS returns = SalesInvoices with negative totalGrossCents
  const returns = await si.find({ totalGrossCents: { $lt: 0 } }).toArray();
  console.log('POS return invoices (negative total):', returns.length);
  returns.forEach(r => console.log(' -', JSON.stringify({
    invoiceNumber: r.invoiceNumber,
    status: r.status,
    totalGrossCents: r.totalGrossCents,
    date: r.invoiceDate,
    notes: r.notes,
    customer: r.customerSnapshot?.companyName,
  })));

  // Also check inventory movements of type 'return'
  const inv = db.collection('m3_inventory_movements');
  const returnMovements = await inv.find({ type: 'return' }).toArray();
  console.log('\nInventory movements type=return:', returnMovements.length);
  returnMovements.forEach(m => console.log(' -', JSON.stringify({ itemName: m.itemName, qty: m.qty })));

  await mongoose.disconnect();
}

main().catch(console.error);
