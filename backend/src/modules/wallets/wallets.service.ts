import { ApiError } from '../../shared/utils/ApiError.js';
import { Wallet, Wallet as WalletModel } from './wallet.model.js';
import { Trade } from '../trades/trade.model.js';
import { WalletTypes, type WalletType } from '../../constants/index.js';
import { toBdt } from '../../shared/utils/money.js';

export async function getWalletsOverview(userId: string) {
  const wallets = await Wallet.find({ userId }).lean();
  const main = wallets.find((w) => w.type === WalletTypes.MAIN);
  const demo = wallets.find((w) => w.type === WalletTypes.DEMO);

  const totalAvailablePaisa = wallets.reduce((sum, w) => sum + w.available, 0);
  const totalReservedPaisa = wallets.reduce((sum, w) => sum + w.reserved, 0);

  return {
    wallets: wallets.map((w) => ({
      id: w._id,
      type: w.type,
      available: w.available,
      reserved: w.reserved,
      total: w.available + w.reserved,
      availableBdt: toBdt(w.available),
      reservedBdt: toBdt(w.reserved),
      totalBdt: toBdt(w.available + w.reserved),
    })),
    summary: {
      totalAvailableBdt: toBdt(totalAvailablePaisa),
      totalReservedBdt: toBdt(totalReservedPaisa),
      totalBalanceBdt: toBdt(totalAvailablePaisa + totalReservedPaisa),
    },
    mainWalletId: main?._id ?? null,
    demoWalletId: demo?._id ?? null,
  };
}

/**
 * Challenge Case 1: which open trades are holding the reserved funds?
 */
export async function getReservedBreakdown(userId: string, walletType?: WalletType) {
  const filter: Record<string, unknown> = { userId, status: 'OPEN' };
  const wallets = await WalletModel.find({ userId }).lean();
  if (walletType) filter.walletType = walletType;

  const openTrades = await Trade.find(filter)
    .sort({ openedAt: -1 })
    .lean();

  const byWallet = new Map<string, { walletType: WalletType; reserved: number; trades: unknown[] }>();
  for (const trade of openTrades) {
    const key = String(trade.walletId);
    const entry =
      byWallet.get(key) ??
      {
        walletType: trade.walletType,
        reserved: 0,
        trades: [] as unknown[],
      };
    entry.reserved += trade.margin;
    entry.trades.push({
      tradeId: trade._id,
      symbol: trade.symbol,
      side: trade.side,
      marginPaisa: trade.margin,
      marginBdt: toBdt(trade.margin),
      leverage: trade.leverage,
      entryPrice: trade.entryPrice,
      openedAt: trade.openedAt,
    });
    byWallet.set(key, entry);
  }

  return {
    totalReservedBdt: toBdt(openTrades.reduce((s, t) => s + t.margin, 0)),
    wallets: [...byWallet.entries()].map(([walletId, v]) => ({
      walletId,
      walletType: v.walletType,
      reservedBdt: toBdt(v.reserved),
      trades: v.trades,
    })),
  };
}

export async function getWalletByType(userId: string, type: WalletType) {
  const wallet = await WalletModel.findOne({ userId, type });
  if (!wallet) throw ApiError.notFound(`Wallet (${type}) not found`);
  return wallet;
}
