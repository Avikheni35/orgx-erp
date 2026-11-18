import { RecurringInvoice, RecurringFrequency } from '../models/RecurringInvoice';
import { SalesInvoice } from '../models/SalesInvoice';
import { Customer } from '../models/Customer';
import { nextSeq } from '../models/Counter';

function addFrequency(date: Date, frequency: RecurringFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7);     break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);   break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);   break;
    case 'yearly':    d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

async function processRecurringInvoices(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = await RecurringInvoice.find({
    status: 'active',
    nextRunDate: { $lte: today },
  });

  if (due.length === 0) return;
  console.log(`[RecurringCron] Processing ${due.length} recurring invoice(s)`);

  for (const ri of due) {
    try {
      const customer = await Customer.findById(ri.customerId);
      const snapshot = ri.customerSnapshot;

      if (customer && !snapshot.companyName) {
        snapshot.companyName   = customer.companyName || '';
        snapshot.legalForm     = customer.legalForm   || '';
        snapshot.vatId         = customer.vatId        || '';
        snapshot.debtorAccount = customer.debtorAccount || '';
        snapshot.address       = customer.address || snapshot.address;
      }

      const invoiceNumber = await nextSeq('RE', ri.tenantId.toString());
      const invoiceDate   = new Date();
      const dueDate       = new Date();
      dueDate.setDate(dueDate.getDate() + ri.paymentTermDays);

      await SalesInvoice.create({
        tenantId:         ri.tenantId,
        invoiceNumber,
        customerId:       ri.customerId,
        customerSnapshot: snapshot,
        status:           'draft',
        invoiceDate,
        dueDate,
        lineItems:        ri.lineItems,
        totalNetCents:    ri.lineItems.reduce((s, l) => s + l.totalNetCents, 0),
        totalVatCents:    ri.lineItems.reduce((s, l) => s + l.totalVatCents, 0),
        totalGrossCents:  ri.lineItems.reduce((s, l) => s + l.totalGrossCents, 0),
        paidCents:        0,
        notes:            ri.notes || '',
      });

      ri.lastRunAt    = new Date();
      ri.nextRunDate  = addFrequency(today, ri.frequency);
      await ri.save();

      console.log(`[RecurringCron] Created ${invoiceNumber} from template "${ri.title}"`);
    } catch (err) {
      console.error(`[RecurringCron] Failed for template ${ri._id}:`, err);
    }
  }
}

export function startRecurringInvoiceCron(): void {
  // Run once on startup (catch up if server was down)
  processRecurringInvoices().catch(console.error);

  // Then every 24 hours
  const MS_24H = 24 * 60 * 60 * 1000;
  setInterval(() => {
    processRecurringInvoices().catch(console.error);
  }, MS_24H);

  console.log('[RecurringCron] Started (runs every 24h)');
}
