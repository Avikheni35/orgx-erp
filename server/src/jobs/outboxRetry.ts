import { OutboxEvent } from '../models/OutboxEvent';
import { IntegrationSettings } from '../models/IntegrationSettings';
import mongoose from 'mongoose';

async function processOutbox(): Promise<void> {
  const pending = await OutboxEvent.find({
    status: 'pending',
    attempts: { $lt: 10 },
  }).limit(50);

  for (const evt of pending) {
    const tenantId = evt.get('tenantId') as mongoose.Types.ObjectId;
    const target   = evt.get('targetModule') as 'm1' | 'm2';

    const settings = await IntegrationSettings
      .findOne({ tenantId })
      .lean();
    const peer = settings?.connectedServices?.[target];

    evt.set('attempts', (evt.get('attempts') as number) + 1);
    evt.set('lastAttemptAt', new Date());

    if (!peer?.enabled || !peer.url || !peer.token) {
      if ((evt.get('attempts') as number) >= 10) evt.set('status', 'failed');
      await evt.save();
      continue;
    }

    let ok = false;
    try {
      const res = await fetch(`${peer.url}${evt.get('targetPath') as string}`, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'x-service-token': peer.token,
          'x-caller-module': 'm3',
        },
        body:   JSON.stringify(evt.get('payload')),
        signal: AbortSignal.timeout(3000),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    if (ok) {
      evt.set('status', 'delivered');
    } else if ((evt.get('attempts') as number) >= 10) {
      evt.set('status', 'failed');
    }
    await evt.save();
  }
}

export function startOutboxRetry(): void {
  setInterval(() => {
    processOutbox().catch(console.error);
  }, 60_000);
  console.log('[M3] OutboxRetry started (every 60s)');
}
