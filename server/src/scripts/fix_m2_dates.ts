import mongoose from 'mongoose';

async function run() {
  await mongoose.connect('mongodb://localhost:27017/orgx');

  const JE = mongoose.model('M3JournalEntry', new mongoose.Schema({}, { strict: false, collection: 'm3_journal_entries' }));
  const CB = mongoose.model('M3CashBookEntry', new mongoose.Schema({}, { strict: false, collection: 'm3_cashbook_entries' }));

  const today = new Date('2026-09-02T12:00:00.000Z');
  const cutoff = new Date('2026-09-01');

  const je = await (JE as any).updateMany(
    { sourceType: 'M2Payment', date: { $lt: cutoff } },
    { $set: { date: today } }
  );
  console.log('Journal entries fixed:', je.modifiedCount);

  const cb = await (CB as any).updateMany(
    { description: /Event-Personal Auszahlung/, date: { $lt: cutoff } },
    { $set: { date: today } }
  );
  console.log('Cashbook entries fixed:', cb.modifiedCount);

  await mongoose.disconnect();
}

run().catch(console.error);
