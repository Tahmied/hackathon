import { Notification } from './notification.model.js';
import { getIO } from '../../sockets/io.js';
import { SocketEvents } from '../../constants/index.js';

export async function notifyUser(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  try {
    const notification = await Notification.create({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
    });
    getIO()
      ?.to(`user:${input.userId}`)
      .emit(SocketEvents.NOTIFICATION, {
        id: notification._id.toString(),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        createdAt: notification.createdAt,
      });
    return notification;
  } catch {
    return null;
  }
}

export async function listNotifications(userId: string, page = 1, limit = 20) {
  const [notifications, total, unread] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, readAt: { $exists: false } }),
  ]);
  return { notifications, total, unread, page, pages: Math.ceil(total / limit) };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const filter: Record<string, unknown> = { userId, readAt: { $exists: false } };
  if (ids && ids.length > 0) filter._id = { $in: ids };
  await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return true;
}
