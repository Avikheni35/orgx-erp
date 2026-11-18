import { SalesInvoice } from '../models/SalesInvoice';
import { DunningRecord } from '../models/DunningRecord';
import { Customer } from '../models/Customer';
import { CompanySettings } from '../models/CompanySettings';
import { peers } from '../utils/serviceClient';

const DEFAULT_LEVELS = [
  { level: 1, feeCents: 0,    graceDays: 14 },
  { level: 2, feeCents: 1500, graceDays: 7  },
  { level: 3, feeCents: 4000, graceDays: 7  },
];

async function processDunning(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await SalesInvoice.find({
    status: 'sent',
    dueDate: { $lt: today },
    tenantId: { $exists: true, $ne: null },
  }).lean();

  if (!invoices.length) return;
  console.log(`[DunningCron] Checking ${invoices.length} overdue invoice(s)`);

  // Group by tenantId so we load CompanySettings once per tenant
  const byTenant = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    if (!inv.tenantId) continue;
    const key = inv.tenantId.toString();
    if (!byTenant.has(key)) byTenant.set(key, []);
    byTenant.get(key)!.push(inv);
  }

  for (const [tenantIdStr, tenantInvoices] of byTenant) {
    const tenantId = tenantInvoices[0].tenantId;

    const settings = await CompanySettings.findOne({ tenantId }).lean();
    const levels = (settings?.dunningLevels?.length ? settings.dunningLevels : DEFAULT_LEVELS) as Array<{
      level: number; feeCents: number; graceDays: number;
    }>;

    const invoiceIds = tenantInvoices.map(i => i._id);

    const latestRecords = await DunningRecord.aggregate([
      { $match: { tenantId, invoiceId: { $in: invoiceIds } } },
      { $sort: { invoiceId: 1, issuedAt: -1 } },
      { $group: { _id: '$invoiceId', level: { $first: '$level' }, issuedAt: { $first: '$issuedAt' } } },
    ]);
    const dunningMap = new Map(latestRecords.map((d: { _id: { toString(): string }; level: number; issuedAt: Date }) => [d._id.toString(), d]));

    const customerIds = [...new Set(tenantInvoices.map(i => i.customerId.toString()))];
    const blockedCustomers = await Customer.find(
      { _id: { $in: customerIds }, tenantId, dunningBlock: true },
      { _id: 1 },
    ).lean();
    const blockedSet = new Set(blockedCustomers.map(c => (c._id as { toString(): string }).toString()));

    let created = 0;
    for (const inv of tenantInvoices) {
      if (blockedSet.has(inv.customerId.toString())) continue;

      const last = dunningMap.get((inv._id as { toString(): string }).toString());
      const currentLevel = last?.level ?? 0;
      if (currentLevel >= 3) continue;

      const nextLevel = (currentLevel + 1) as 1 | 2 | 3;
      const levelCfg = levels.find(l => l.level === nextLevel);
      if (!levelCfg) continue;

      const referenceDate = last ? new Date(last.issuedAt) : new Date(inv.dueDate);
      const daysSince = Math.floor((today.getTime() - referenceDate.getTime()) / 86_400_000);
      if (daysSince < levelCfg.graceDays) continue;

      const dunningDueDate = new Date(today);
      dunningDueDate.setDate(dunningDueDate.getDate() + levelCfg.graceDays);

      try {
        await DunningRecord.create({
          tenantId,
          invoiceId:     inv._id,
          customerId:    inv.customerId,
          invoiceNumber: inv.invoiceNumber,
          companyName:   inv.customerSnapshot.companyName,
          level:         nextLevel,
          issuedAt:      new Date(),
          dunningDueDate,
          feeCents:      levelCfg.feeCents,
          notes:         '',
        });
        created++;
        console.log(`[DunningCron] Level-${nextLevel} dunning issued for ${inv.invoiceNumber}`);
        const daysOverdue = Math.floor((today.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
        void peers.m1.sendNotification(tenantIdStr, {
          type:  'warning',
          title: 'Invoice overdue',
          body:  `Invoice ${inv.invoiceNumber} is ${daysOverdue} days overdue (dunning level ${nextLevel}).`,
        });
      } catch (err) {
        console.error(`[DunningCron] Failed for ${inv.invoiceNumber}:`, err);
      }
    }

    if (created > 0) {
      console.log(`[DunningCron] Tenant ${tenantIdStr}: ${created} dunning record(s) created`);
    }
  }
}

export function startDunningCron(): void {
  processDunning().catch(console.error);

  const MS_24H = 24 * 60 * 60 * 1000;
  setInterval(() => {
    processDunning().catch(console.error);
  }, MS_24H);

  console.log('[DunningCron] Started (runs every 24h)');
}
