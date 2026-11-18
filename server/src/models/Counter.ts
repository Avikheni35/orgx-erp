import { Schema, model, Document } from 'mongoose';

export interface ICounter extends Document {
  tenantId: string;
  key: string;
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  tenantId: { type: String, required: true },
  key:      { type: String, required: true },
  seq:      { type: Number, default: 0 },
}, { collection: 'm3_counters' });

CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

export const Counter = model<ICounter>('M3Counter', CounterSchema);

export async function nextSeq(tenantId: string, key: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}
