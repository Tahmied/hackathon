import { Transaction } from '../transactions/transaction.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { Ticket } from '../tickets/ticket.model.js';
import { Conversation } from '../chat/chat.model.js';
import { User } from '../auth/user.model.js';
import { SystemAlert } from './systemAlert.model.js';
import { getMarketStatus } from '../market/market.engine.js';
import { getAiStatus } from '../ai/ai.service.js';
import { redisIsHealthy } from '../../config/redis.js';
import { getIO } from '../../sockets/io.js';
import { Trade } from '../trades/trade.model.js';
import { listConflictGroups } from '../transactions/transactions.service.js';
import { toBdt } from '../../shared/utils/money.js';

export async function getAdminDashboard() {
  const [
    pendingKyc,
    pendingDeposits,
    pendingWithdrawals,
    openTickets,
    activeChats,
    openTrades,
    totalUsers,
    conflictCount,
    alerts,
    market,
    ai,
  ] = await Promise.all([
    KycSubmission.countDocuments({ status: 'PENDING' }),
    Transaction.countDocuments({ type: 'DEPOSIT', status: 'PENDING' }),
    Transaction.countDocuments({ type: 'WITHDRAWAL', status: 'PENDING' }),
    Ticket.countDocuments({ status: { $in: ['OPEN', 'PENDING'] } }),
    Conversation.countDocuments({ status: { $ne: 'CLOSED' } }),
    Trade.countDocuments({ status: 'OPEN' }),
    User.countDocuments({ role: 'user' }),
    Transaction.countDocuments({ status: 'CONFLICT' }),
    SystemAlert.find({ resolvedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(10).lean(),
    Promise.resolve(getMarketStatus()),
    Promise.resolve(getAiStatus()),
  ]);

  const io = getIO();
  return {
    actionCenter: {
      pendingKyc,
      pendingDeposits,
      pendingWithdrawals,
      openTickets,
      activeChats,
      openTrades,
      totalUsers,
      conflictDeposits: conflictCount,
    },
    systemHealth: {
      market,
      ai,
      redis: redisIsHealthy() ? 'connected' : 'down (DB fallback active)',
      websocket: {
        onlineSockets: io ? io.engine.clientsCount : 0,
      },
    },
    alerts,
  };
}

export async function listAlerts(page = 1, limit = 50) {
  const [alerts, total] = await Promise.all([
    SystemAlert.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SystemAlert.countDocuments(),
  ]);
  return { alerts, total, page, pages: Math.ceil(total / limit) };
}

export async function resolveAlert(alertId: string) {
  return SystemAlert.findByIdAndUpdate(alertId, { $set: { resolvedAt: new Date() } }, { new: true });
}

/** Finance dashboard: volumes by status for quick reconciliation. */
export async function getFinanceSummary() {
  const [depositAgg, withdrawalAgg, conflicts] = await Promise.all([
    Transaction.aggregate([
      { $match: { type: 'DEPOSIT' } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { type: 'WITHDRAWAL' } },
      { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    listConflictGroups(),
  ]);
  const shape = (agg: { _id: string; count: number; total: number }[]) =>
    Object.fromEntries(agg.map((a) => [a._id, { count: a.count, totalBdt: toBdt(a.total) }]));
  return {
    deposits: shape(depositAgg),
    withdrawals: shape(withdrawalAgg),
    conflictGroups: conflicts.length,
  };
}
