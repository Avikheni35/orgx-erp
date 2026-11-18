import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/AppError';
import { Notification } from '../models/Notification';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipientId: req.user!.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const unreadCount = notifications.filter((n) => !n.read).length;
  res.json({ notifications, unreadCount });
}));

router.get('/count', asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipientId: req.user!.userId, read: false });
  res.json({ unreadCount: count });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const n = await Notification.findOne({ _id: req.params.id, recipientId: req.user!.userId });
  if (!n) throw new AppError('Not found', 404);
  n.read = true;
  await n.save();
  res.json(n);
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ recipientId: req.user!.userId, read: false }, { read: true });
  res.json({ message: 'All marked as read' });
}));

export default router;
