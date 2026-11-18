import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  tenantId: Types.ObjectId;
  recipientId: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    tenantId:    { type: Schema.Types.ObjectId, required: true },
    recipientId: { type: Schema.Types.ObjectId, required: true },
    type:        { type: String, required: true },
    title:       { type: String, required: true },
    body:        { type: String, required: true },
    link:        String,
    read:        { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'm3notifications' }
);

// 90-day TTL
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
NotificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });

export const Notification = model<INotification>('M3Notification', NotificationSchema);
