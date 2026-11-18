import mongoose from 'mongoose';

const shiftSchema = new mongoose.Schema({
  tenantId:          { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Tenant' },
  userId:            { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  userName:          { type: String, default: '' },
  openedAt:          { type: Date, required: true },
  closedAt:          { type: Date },
  openingFloatCents: { type: Number, required: true, default: 0 },
  closingFloatCents: { type: Number },
  salesCount:        { type: Number, default: 0 },
  salesCents:        { type: Number, default: 0 },
  status:            { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true, collection: 'm3_shifts' });

shiftSchema.index({ tenantId: 1, status: 1 });
shiftSchema.index({ tenantId: 1, userId: 1, status: 1 });

export const Shift = mongoose.model('Shift', shiftSchema);
