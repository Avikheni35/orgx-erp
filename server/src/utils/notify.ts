import { Types } from 'mongoose';
import { Notification } from '../models/Notification';
import { User } from '../models/User';

type NotifyParams = {
  tenantId: Types.ObjectId | string;
  recipientId: Types.ObjectId | string;
  type: string;
  title: string;
  body: string;
  link?: string;
};

export async function notify(params: NotifyParams): Promise<void> {
  try {
    await Notification.create({
      tenantId:    params.tenantId,
      recipientId: params.recipientId,
      type:        params.type,
      title:       params.title,
      body:        params.body,
      link:        params.link,
    });
  } catch {
    // fire-and-forget — never throws
  }
}

/** Notify all erp_admin users in the tenant (fire-and-forget). */
export async function notifyAdmins(params: Omit<NotifyParams, 'recipientId'>): Promise<void> {
  try {
    const admins = await User.find({ tenantId: params.tenantId, role: 'erp_admin', status: 'active' }, { _id: 1 }).lean();
    if (!admins.length) return;
    await Notification.insertMany(
      admins.map(a => ({
        tenantId:    params.tenantId,
        recipientId: a._id,
        type:        params.type,
        title:       params.title,
        body:        params.body,
        link:        params.link,
      }))
    );
  } catch {
    // fire-and-forget — never throws
  }
}
