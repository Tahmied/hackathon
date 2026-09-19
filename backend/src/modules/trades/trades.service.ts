import { ApiError } from '../../shared/utils/ApiError.js';
import { withTransaction } from '../../shared/db/connectDb.js';
import mongoose from 'mongoose';
import type { Types } from 'mongoose';
import { Wallet } from '../wallets/wallet.model.js';
import { Trade } from './trade.model.js';
import { Asset } from '../market/asset.model.js';
import { isMarketStale, getPrice } from '../market/market.engine.js';
import type { TradeSide, WalletType } from '../../constants/index.js';
import { WalletTypes } from '../../constants/index.js';
import { parseBdtToPaisa, roundPaisa, toBdt } from '../../shared/utils/money.js';
import { logAudit } from '../audit/audit.model.js';
import { notifyUser } from '../notifications/notifications.service.js';

/** Signed PnL in paisa; loss clamped at −margin (margin is the max loss). */
export function computePnlPaisa(
  marginPaisa: number,
  leverage: number,
  entryPrice: number,
  closePrice: number,
  side: TradeSide,
): number {
  const ratio = (closePrice - entryPrice) / entryPrice;
  const signed = side === 'BUY' ? ratio : -ratio;
  const raw = marginPaisa * leverage * signed;
  return Math.max(roundPaisa(raw), -marginPaisa);
}

export function floatingPnlPaisa(trade: {
  margin: number;
  leverage: number;
  entryPrice: number;
  side: TradeSide;
}, currentPrice: number | null): number | null {
  if (!currentPrice) return null;
  return computePnlPaisa(trade.margin, trade.leverage, trade.entryPrice, currentPrice, trade.side);
}

export async function openTrade(
  userId: string,
  input: { walletType: WalletType; symbol: string; side: TradeSide; marginBdt: number; leverage: number },
) {
  if (isMarketStale()) {
    throw ApiError.serviceUnavailable(
      'Market data is delayed. Trading is temporarily paused.',
      'MARKET_STALE',
    );
  }
  const symbol = input.symbol.toUpperCase();
  const price = getPrice(symbol);
  if (!price) throw ApiError.badRequest('Unknown or inactive asset');

  const asset = await Asset.findOne({ symbol, isActive: true });
  if (!asset) throw ApiError.badRequest('Unknown or inactive asset');

  const marginPaisa = parseBdtToPaisa(input.marginBdt);
  if (!marginPaisa) throw ApiError.badRequest('Invalid margin amount');
  if (marginPaisa < asset.minMarginPaisa) {
    throw ApiError.badRequest(`Minimum margin is ৳${toBdt(asset.minMarginPaisa)}`);
  }
  if (marginPaisa > asset.maxMarginPaisa) {
    throw ApiError.badRequest(`Maximum margin is ৳${toBdt(asset.maxMarginPaisa)}`);
  }
  if (!asset.leverageOptions.includes(input.leverage)) {
    throw ApiError.badRequest(`Leverage must be one of: ${asset.leverageOptions.join('x, ')}x`);
  }

  const trade = await withTransaction(async (session) => {
    // Atomic conditional debit: prevents double-spend and negative balances
    const wallet = await Wallet.findOneAndUpdate(
      { userId, type: input.walletType, available: { $gte: marginPaisa } },
      { $inc: { available: -marginPaisa, reserved: marginPaisa } },
      { new: true, session },
    );
    if (!wallet) {
      throw ApiError.badRequest(
        'Insufficient available balance (funds may be reserved in open trades)',
        'INSUFFICIENT_AVAILABLE',
      );
    }

    const [created] = await Trade.create(
      [
        {
          userId,
          walletId: wallet._id,
          walletType: input.walletType,
          symbol,
          side: input.side,
          margin: marginPaisa,
          leverage: input.leverage,
          entryPrice: price,
          status: 'OPEN',
        },
      ],
      { session },
    );
    return created;
  });

  await logAudit({
    actorId: userId,
    actorRole: 'user',
    action: 'trade.opened',
    targetType: 'trade',
    targetId: trade._id,
    metadata: {
      userId,
      symbol,
      side: input.side,
      marginBdt: input.marginBdt,
      leverage: input.leverage,
      entryPrice: price,
      walletType: input.walletType,
    },
  });

  return { trade, currentPrice: price };
}

async function closeTradeInternal(
  trade: { _id: Types.ObjectId; userId: Types.ObjectId; walletId: Types.ObjectId; margin: number; status: string },
  closePrice: number,
  pnlPaisa: number,
  reason: 'MANUAL' | 'STOP_OUT' | 'ADMIN',
  session: mongoose.ClientSession,
  closedBy?: string,
) {
  // Release reserved margin and settle pnl atomically
  await Wallet.findByIdAndUpdate(
    trade.walletId,
    { $inc: { reserved: -trade.margin, available: trade.margin + pnlPaisa } },
    { session },
  );

  await Trade.findByIdAndUpdate(
    trade._id,
    {
      $set: {
        status: 'CLOSED',
        closePrice,
        pnl: pnlPaisa,
        closeReason: reason,
        closedAt: new Date(),
        closedBy: closedBy ?? undefined,
      },
    },
    { session },
  );
}

export async function closeTrade(userId: string, tradeId: string) {
  if (isMarketStale()) {
    throw ApiError.serviceUnavailable(
      'Market data is delayed. Trading is temporarily paused.',
      'MARKET_STALE',
    );
  }
  const currentPrice = await getPriceForTrade(tradeId);
  const result = await withTransaction(async (session) => {
    const trade = await Trade.findOne({ _id: tradeId, userId, status: 'OPEN' }).session(session);
    if (!trade) {
      const existing = await Trade.findById(tradeId).session(session);
      if (existing && existing.status === 'CLOSED') {
        throw ApiError.conflict('Trade is already closed', 'TRADE_ALREADY_CLOSED');
      }
      throw ApiError.notFound('Open trade not found');
    }
    const closePrice = currentPrice ?? trade.entryPrice;
    const pnl = computePnlPaisa(trade.margin, trade.leverage, trade.entryPrice, closePrice, trade.side);
    await closeTradeInternal(trade, closePrice, pnl, 'MANUAL', session);
    return { trade, pnl, closePrice };
  });

  await logAudit({
    actorId: userId,
    actorRole: 'user',
    action: 'trade.closed',
    targetType: 'trade',
    targetId: tradeId,
    metadata: {
      userId,
      symbol: result.trade.symbol,
      closePrice: result.closePrice,
      pnlPaisa: result.pnl,
      pnlBdt: toBdt(result.pnl),
    },
  });

  await notifyUser({
    userId,
    type: 'TRADE_CLOSED',
    title: `Trade closed: ${result.trade.symbol}`,
    body: `PnL ${result.pnl >= 0 ? '+' : ''}৳${toBdt(result.pnl).toFixed(2)}`,
    data: { tradeId, pnl: result.pnl },
  });

  return result;
}

async function getPriceForTrade(tradeId: string): Promise<number | null> {
  const trade = await Trade.findById(tradeId).select('symbol');
  if (!trade) return null;
  return getPrice(trade.symbol);
}

/** Background monitor: auto stop-out when floating loss ≥ margin. */
export function startStopOutMonitor(intervalMs = 5000) {
  setInterval(async () => {
    try {
      if (isMarketStale()) return;
      const open = await Trade.find({ status: 'OPEN' }).lean();
      for (const trade of open) {
        const price = getPrice(trade.symbol);
        if (!price) continue;
        const pnl = computePnlPaisa(trade.margin, trade.leverage, trade.entryPrice, price, trade.side);
        if (pnl <= -trade.margin) {
          await withTransaction(async (session) => {
            const fresh = await Trade.findOne({ _id: trade._id, status: 'OPEN' }).session(session);
            if (!fresh) return;
            await closeTradeInternal(fresh, price, -fresh.margin, 'STOP_OUT', session);
          });
          await notifyUser({
            userId: String(trade.userId),
            type: 'TRADE_STOP_OUT',
            title: `Stop out: ${trade.symbol}`,
            body: 'Your trade hit the maximum loss (margin) and was closed automatically.',
            data: { tradeId: trade._id.toString() },
          });
        }
      }
    } catch {
      // monitor must never crash the process
    }
  }, intervalMs);
}

export async function listOpenTrades(userId: string, walletType?: WalletType) {
  const filter: Record<string, unknown> = { userId, status: 'OPEN' };
  if (walletType) filter.walletType = walletType;
  const trades = await Trade.find(filter).sort({ openedAt: -1 }).lean();
  return trades.map((t) => {
    const price = getPrice(t.symbol);
    const pnl = floatingPnlPaisa(t, price);
    return {
      ...t,
      currentPrice: price,
      floatingPnlPaisa: pnl,
      floatingPnlBdt: pnl === null ? null : toBdt(pnl),
    };
  });
}

export async function listTradeHistory(userId: string, page = 1, limit = 20) {
  const filter: Record<string, unknown> = { userId, status: 'CLOSED' };
  const [trades, total] = await Promise.all([
    Trade.find(filter)
      .sort({ closedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Trade.countDocuments(filter),
  ]);
  return {
    trades: trades.map((t) => ({ ...t, pnlBdt: toBdt(t.pnl ?? 0) })),
    total,
    page,
    pages: Math.ceil(total / limit),
  };
}

export async function tradeStats(userId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const userOid = new mongoose.Types.ObjectId(userId);
  const [todayAgg, allAgg] = await Promise.all([
    Trade.aggregate([
      { $match: { userId: userOid, status: 'CLOSED', closedAt: { $gte: startOfDay } } },
      { $group: { _id: null, pnl: { $sum: '$pnl' }, wins: { $sum: { $cond: [{ $gt: ['$pnl', 0] }, 1, 0] } }, count: { $sum: 1 } } },
    ]),
    Trade.aggregate([
      { $match: { userId: userOid, status: 'CLOSED' } },
      { $group: { _id: null, pnl: { $sum: '$pnl' }, wins: { $sum: { $cond: [{ $gt: ['$pnl', 0] }, 1, 0] } }, count: { $sum: 1 } } },
    ]),
  ]);
  return {
    today: { pnlBdt: toBdt(todayAgg[0]?.pnl ?? 0), wins: todayAgg[0]?.wins ?? 0, count: todayAgg[0]?.count ?? 0 },
    allTime: { pnlBdt: toBdt(allAgg[0]?.pnl ?? 0), wins: allAgg[0]?.wins ?? 0, count: allAgg[0]?.count ?? 0 },
  };
}

export async function adminCloseTrade(tradeId: string, actor: { id: string; role: string; ip?: string }) {
  const currentPrice = await getPriceForTrade(tradeId);
  const result = await withTransaction(async (session) => {
    const trade = await Trade.findOne({ _id: tradeId, status: 'OPEN' }).session(session);
    if (!trade) throw ApiError.conflict('Trade is not open', 'TRADE_ALREADY_CLOSED');
    const closePrice = currentPrice ?? trade.entryPrice;
    const pnl = computePnlPaisa(trade.margin, trade.leverage, trade.entryPrice, closePrice, trade.side);
    await closeTradeInternal(trade, closePrice, pnl, 'ADMIN', session, actor.id);
    return { trade, pnl, closePrice };
  });
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'trade.admin_closed',
    targetType: 'trade',
    targetId: tradeId,
    metadata: { userId: result.trade.userId.toString(), pnlPaisa: result.pnl },
    ip: actor.ip,
  });
  await notifyUser({
    userId: String(result.trade.userId),
    type: 'TRADE_CLOSED',
    title: `Trade closed by admin: ${result.trade.symbol}`,
    body: `PnL ${result.pnl >= 0 ? '+' : ''}৳${toBdt(result.pnl).toFixed(2)}`,
    data: { tradeId },
  });
  return result;
}

export async function listAllTrades(filter: { status?: string; userId?: string; page: number; limit: number }) {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.userId) query.userId = filter.userId;
  const [trades, total] = await Promise.all([
    Trade.find(query)
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .populate('userId', 'name email')
      .lean(),
    Trade.countDocuments(query),
  ]);
  return { trades, total, page: filter.page, pages: Math.ceil(total / filter.limit) };
}
