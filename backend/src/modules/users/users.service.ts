import mongoose from 'mongoose';
import { ApiError } from '../../shared/utils/ApiError.js';
import { User, hashPassword } from '../auth/user.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { AuditLog } from '../audit/audit.model.js';
import { Trade } from '../trades/trade.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { invalidateUserAuthorization } from '../../shared/utils/permissionHelpers.js';
import { logAudit } from '../audit/audit.model.js';

export async function getProfile(userId: string) {
  const user = await User.findById(userId).select('-passwordHash -failedLoginAttempts -lockedUntil');
  if (!user) throw ApiError.notFound('User not found');
  const wallets = await Wallet.find({ userId: user._id }).lean();
  const [openTrades, totalTrades, totalTransactions] = await Promise.all([
    Trade.countDocuments({ userId: user._id, status: 'OPEN' }),
    Trade.countDocuments({ userId: user._id }),
    Transaction.countDocuments({ userId: user._id }),
  ]);
  return {
    user,
    wallets,
    stats: { openTrades, totalTrades, totalTransactions },
  };
}

export async function updateProfile(
  userId: string,
  patch: { name?: string; phone?: string; avatarUrl?: string },
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (patch.name !== undefined) user.name = patch.name;
  if (patch.phone !== undefined) user.phone = patch.phone;
  if (patch.avatarUrl !== undefined) user.avatarUrl = patch.avatarUrl;
  await user.save();
  await invalidateUserAuthorization(userId);
  return user.toObject();
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');
  if (user.passwordHash) {
    const ok = await user.comparePassword(input.currentPassword);
    if (!ok) throw ApiError.badRequest('Current password is incorrect');
  }
  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await invalidateUserAuthorization(userId);
  return true;
}

export async function listUsers(query: {
  q?: string;
  role?: string;
  kycStatus?: string;
  page: number;
  limit: number;
}) {
  const filter: Record<string, unknown> = {};
  if (query.q) {
    const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  if (query.role) filter.role = query.role;
  if (query.kycStatus) filter.kycStatus = query.kycStatus;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  const userIds = users.map((u) => u._id);
  const wallets = await Wallet.find({ userId: { $in: userIds } }).lean();

  return {
    users: users.map((u) => ({
      ...u,
      wallets: wallets.filter((w) => String(w.userId) === String(u._id)),
    })),
    total,
    page: query.page,
    pages: Math.ceil(total / query.limit),
  };
}

export async function getUserDetail(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw ApiError.notFound('User not found');
  const [wallets, openTrades, totalTrades, txCount, ticketsCount] = await Promise.all([
    Wallet.find({ userId }).lean(),
    Trade.countDocuments({ userId, status: 'OPEN' }),
    Trade.countDocuments({ userId }),
    Transaction.countDocuments({ userId }),
    mongoose.model('Ticket').countDocuments({ userId }),
  ]);
  return { user, wallets, stats: { openTrades, totalTrades, txCount, ticketsCount } };
}

/**
 * Chronological activity timeline for a user — merges audit logs and key
 * domain events (admin needs to reconstruct what happened, in order).
 */
export async function getUserTimeline(userId: string, limit = 100) {
  const [audits, trades, transactions] = await Promise.all([
    AuditLog.find({ $or: [{ actorId: userId }, { 'metadata.userId': userId }] })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    Trade.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
    Transaction.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
  ]);

  type Event = { at: Date; kind: string; label: string; ref?: string; detail?: Record<string, unknown> };
  const events: Event[] = [];

  for (const a of audits) {
    events.push({
      at: a.createdAt,
      kind: 'audit',
      label: a.action,
      ref: a._id.toString(),
      detail: a.metadata,
    });
  }
  for (const t of trades) {
    events.push({
      at: t.createdAt,
      kind: 'trade',
      label:
        t.status === 'OPEN'
          ? `Trade opened: ${t.side} ${t.symbol}`
          : `Trade closed: ${t.side} ${t.symbol} (${t.closeReason})`,
      ref: t._id.toString(),
      detail: { margin: t.margin, entryPrice: t.entryPrice, pnl: t.pnl ?? null },
    });
  }
  for (const t of transactions) {
    events.push({
      at: t.createdAt,
      kind: 'transaction',
      label: `${t.type} ${t.status}`,
      ref: t._id.toString(),
      detail: { amount: t.amount, reference: t.reference, method: t.method },
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return events.slice(0, limit);
}

export async function setUserActive(
  userId: string,
  isActive: boolean,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'super_admin' && !isActive) {
    throw ApiError.badRequest('Cannot block a super admin');
  }
  user.isActive = isActive;
  await user.save();
  await invalidateUserAuthorization(userId);
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: isActive ? 'user.unblocked' : 'user.blocked',
    targetType: 'user',
    targetId: userId,
    metadata: { userId },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  return user.toObject();
}
