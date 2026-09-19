import type { AuthUser } from '../../shared/utils/permissionHelpers.js';
import { hasPermission } from '../../shared/utils/permissionHelpers.js';
import { getWalletsOverview, getReservedBreakdown } from '../wallets/wallets.service.js';
import { listOpenTrades, listTradeHistory } from '../trades/trades.service.js';
import { listMyTransactions, listAdminTransactions } from '../transactions/transactions.service.js';
import { getUserDetail } from '../users/users.service.js';
import { getAllPrices, getMarketStatus } from '../market/market.engine.js';
import { Asset } from '../market/asset.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { Ticket } from '../tickets/ticket.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { AuditLog } from '../audit/audit.model.js';
import { Wallet } from '../wallets/wallet.model.js';
import { User } from '../auth/user.model.js';
import { Trade } from '../trades/trade.model.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { toBdt } from '../../shared/utils/money.js';
import type { PermissionKey } from '../../constants/permissions.js';

/**
 * Tool registry for the JSON tool protocol. Every tool declares:
 *  - name / whenToUse / parameters (rendered into the model's system prompt)
 *  - permission: optional RBAC key the CALLER must hold (AI never exceeds the human)
 *  - execute(args, ctx) → JSON-serializable result + a short summary for the trace
 */
export interface ToolContext {
  caller: AuthUser;
}

export interface Tool {
  name: string;
  whenToUse: string;
  parameters: string;
  permission?: PermissionKey;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<{ result: unknown; summary: string }>;
}

const money = (paisa: unknown) => `৳${toBdt(Number(paisa ?? 0)).toFixed(2)}`;

export const userTools: Tool[] = [
  {
    name: 'getMyWallets',
    whenToUse: 'Get the user MAIN and DEMO wallet balances (available, reserved, total).',
    parameters: '{}',
    execute: async (_args, ctx) => {
      const overview = await getWalletsOverview(ctx.caller.id);
      const summary = overview.wallets
        .map((w) => `${w.type}: available ${money(w.available)}, reserved ${money(w.reserved)}`)
        .join(' | ');
      return { result: overview, summary };
    },
  },
  {
    name: 'getMyOpenTrades',
    whenToUse: 'List the user open trades with margin and floating PnL. Use for "where is my money" questions.',
    parameters: '{ walletType?: "MAIN"|"DEMO" }',
    execute: async (args, ctx) => {
      const walletType = (args.walletType as 'MAIN' | 'DEMO' | undefined) ?? undefined;
      const trades = await listOpenTrades(ctx.caller.id, walletType);
      const totalReserved = trades.reduce((s, t) => s + t.margin, 0);
      return {
        result: {
          count: trades.length,
          totalReservedPaisa: totalReserved,
          trades: trades.map((t) => ({
            tradeId: t._id,
            symbol: t.symbol,
            side: t.side,
            marginBdt: toBdt(t.margin),
            leverage: t.leverage,
            entryPrice: t.entryPrice,
            currentPrice: t.currentPrice,
            floatingPnlBdt: t.floatingPnlBdt,
          })),
        },
        summary: `${trades.length} open trade(s), reserved total ${money(totalReserved)}`,
      };
    },
  },
  {
    name: 'explainReservedBalance',
    whenToUse: 'Explain exactly which open trades are holding the user reserved (margin) funds.',
    parameters: '{}',
    execute: async (_args, ctx) => {
      const breakdown = await getReservedBreakdown(ctx.caller.id);
      const parts = breakdown.wallets.flatMap((w) =>
        (w.trades as { tradeId: string; symbol: string; marginBdt: number }[]).map(
          (t) => `trade #${t.tradeId} (${t.symbol}) holds ৳${t.marginBdt.toFixed(2)}`,
        ),
      );
      return {
        result: breakdown,
        summary: parts.length
          ? `Reserved ৳${breakdown.totalReservedBdt.toFixed(2)}: ${parts.join(', ')}`
          : 'No reserved funds',
      };
    },
  },
  {
    name: 'getMyTransactions',
    whenToUse: 'List the user recent deposits/withdrawals with statuses.',
    parameters: '{ type?: "DEPOSIT"|"WITHDRAWAL", limit?: number }',
    execute: async (args, ctx) => {
      const type = args.type as 'DEPOSIT' | 'WITHDRAWAL' | undefined;
      const data = await listMyTransactions(ctx.caller.id, {
        type,
        page: 1,
        limit: Math.min(Number(args.limit ?? 10), 20),
      });
      return {
        result: data.transactions.map((t) => ({
          id: t._id,
          type: t.type,
          amountBdt: t.amountBdt,
          status: t.status,
          reference: t.reference,
          createdAt: t.createdAt,
        })),
        summary: `${data.transactions.length} transaction(s)`,
      };
    },
  },
  {
    name: 'getMyTradeHistory',
    whenToUse: 'List the user closed trades with realized PnL.',
    parameters: '{ limit?: number }',
    execute: async (args, ctx) => {
      const data = await listTradeHistory(ctx.caller.id, 1, Math.min(Number(args.limit ?? 10), 20));
      return {
        result: data.trades.map((t) => ({
          id: t._id,
          symbol: t.symbol,
          side: t.side,
          pnlBdt: t.pnlBdt,
          closeReason: t.closeReason,
          closedAt: t.closedAt,
        })),
        summary: `${data.trades.length} closed trade(s)`,
      };
    },
  },
  {
    name: 'getMyKycStatus',
    whenToUse: 'Get the user KYC verification status and any rejection reason.',
    parameters: '{}',
    execute: async (_args, ctx) => {
      const kyc = await KycSubmission.findOne({ userId: ctx.caller.id }).sort({ createdAt: -1 }).lean();
      const user = await User.findById(ctx.caller.id).select('kycStatus kycRejectionReason').lean();
      return {
        result: { kycStatus: user?.kycStatus, rejectionReason: user?.kycRejectionReason, submission: kyc },
        summary: `KYC status: ${user?.kycStatus ?? 'UNVERIFIED'}`,
      };
    },
  },
  {
    name: 'getMarketPrices',
    whenToUse: 'Get current live market prices for all assets and feed health.',
    parameters: '{}',
    execute: async () => {
      const status = getMarketStatus();
      return {
        result: { prices: getAllPrices(), marketStale: status.stale },
        summary: `${status.assets.length} assets, stale=${status.stale}`,
      };
    },
  },
  {
    name: 'getAssetInfo',
    whenToUse: 'Get details for one asset (min/max margin, leverage options, category).',
    parameters: '{ symbol: string }',
    execute: async (args) => {
      const symbol = String(args.symbol ?? '').toUpperCase();
      const asset = await Asset.findOne({ symbol }).lean();
      if (!asset) return { result: null, summary: `asset ${symbol} not found` };
      return {
        result: {
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          leverageOptions: asset.leverageOptions,
          minMarginBdt: toBdt(asset.minMarginPaisa),
          maxMarginBdt: toBdt(asset.maxMarginPaisa),
        },
        summary: `${asset.symbol} (${asset.name})`,
      };
    },
  },
];

export const staffTools: Tool[] = [
  {
    name: 'searchUsers',
    whenToUse: 'Search platform users by name/email. Returns id, name, email, role, kycStatus.',
    parameters: '{ query: string }',
    permission: PermissionKeys.USERS_READ,
    execute: async (args) => {
      const q = String(args.query ?? '').trim();
      if (!q) return { result: [], summary: 'empty query' };
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const users = await User.find({ $or: [{ name: rx }, { email: rx }] })
        .limit(8)
        .select('name email role kycStatus isActive createdAt')
        .lean();
      return { result: users, summary: `${users.length} user(s) matched "${q}"` };
    },
  },
  {
    name: 'getUserDetails',
    whenToUse: 'Full details for one user: wallets, trade stats, KYC. Use after searchUsers.',
    parameters: '{ userId: string }',
    permission: PermissionKeys.USERS_READ,
    execute: async (args) => {
      const userId = String(args.userId ?? '');
      const detail = await getUserDetail(userId);
      const wallets = await Wallet.find({ userId }).lean();
      return {
        result: {
          user: detail.user,
          wallets,
          stats: detail.stats,
        },
        summary: `user ${detail.user.name} (${detail.user.email})`,
      };
    },
  },
  {
    name: 'getUserTransactions',
    whenToUse: 'Recent deposits/withdrawals for a user with statuses (finance context).',
    parameters: '{ userId: string, type?: "DEPOSIT"|"WITHDRAWAL" }',
    permission: PermissionKeys.DEPOSITS_READ,
    execute: async (args) => {
      const userId = String(args.userId ?? '');
      const type = args.type as 'DEPOSIT' | 'WITHDRAWAL' | undefined;
      const data = await listAdminTransactions({ userId, type, page: 1, limit: 10 });
      return {
        result: data.transactions.map((t) => ({
          id: t._id,
          type: t.type,
          amountBdt: t.amountBdt,
          status: t.status,
          reference: t.reference,
          conflict: t.status === 'CONFLICT',
        })),
        summary: `${data.transactions.length} transaction(s)`,
      };
    },
  },
  {
    name: 'getUserOpenTrades',
    whenToUse: 'Open trades for a user (what is reserving their balance).',
    parameters: '{ userId: string }',
    permission: PermissionKeys.TRADES_READ,
    execute: async (args) => {
      const userId = String(args.userId ?? '');
      const trades = await Trade.find({ userId, status: 'OPEN' }).lean();
      return {
        result: trades.map((t) => ({
          id: t._id,
          symbol: t.symbol,
          side: t.side,
          marginBdt: toBdt(t.margin),
          leverage: t.leverage,
          entryPrice: t.entryPrice,
        })),
        summary: `${trades.length} open trade(s)`,
      };
    },
  },
  {
    name: 'getPendingReviews',
    whenToUse: 'Count and sample of pending deposits/withdrawals/KYC for the action center.',
    parameters: '{ type: "DEPOSIT"|"WITHDRAWAL"|"KYC" }',
    permission: PermissionKeys.DASHBOARD_READ,
    execute: async (args) => {
      const type = String(args.type ?? 'DEPOSIT').toUpperCase();
      if (type === 'KYC') {
        const [pending, sample] = await Promise.all([
          KycSubmission.countDocuments({ status: 'PENDING' }),
          KycSubmission.find({ status: 'PENDING' }).limit(5).select('userId docType createdAt').lean(),
        ]);
        return { result: { pending, sample }, summary: `${pending} pending KYC` };
      }
      const filter = { type: type as 'DEPOSIT' | 'WITHDRAWAL', status: 'PENDING' as const };
      const [pending, sample] = await Promise.all([
        Transaction.countDocuments(filter),
        Transaction.find(filter).limit(5).select('userId type amount status createdAt').lean(),
      ]);
      return {
        result: { pending, sample: sample.map((s) => ({ ...s, amountBdt: toBdt(s.amount) })) },
        summary: `${pending} pending ${type}`,
      };
    },
  },
  {
    name: 'getTicket',
    whenToUse: 'Read a support ticket thread by id.',
    parameters: '{ ticketId: string }',
    permission: PermissionKeys.TICKETS_READ,
    execute: async (args) => {
      const ticket = await Ticket.findById(String(args.ticketId ?? '')).lean();
      if (!ticket) return { result: null, summary: 'ticket not found' };
      return {
        result: { subject: ticket.subject, status: ticket.status, messages: ticket.messages.slice(-10) },
        summary: `ticket "${ticket.subject}" (${ticket.status})`,
      };
    },
  },
  {
    name: 'getMarketStatus',
    whenToUse: 'Market feed health: staleness, latency, connected state.',
    parameters: '{}',
    execute: async () => {
      const status = getMarketStatus();
      return {
        result: status,
        summary: `stale=${status.stale} latency=${status.latencyMs}ms paused=${status.paused}`,
      };
    },
  },
  {
    name: 'detectUserAnomalies',
    whenToUse: 'Rule-based anomaly scan for a user: duplicate references, deposit velocity, unusual withdrawals.',
    parameters: '{ userId: string }',
    permission: PermissionKeys.USERS_READ,
    execute: async (args) => {
      const userId = String(args.userId ?? '');
      const anomalies = await runAnomalyRules(userId);
      return {
        result: anomalies,
        summary: anomalies.length ? `${anomalies.length} anomaly flag(s)` : 'no anomalies',
      };
    },
  },
  {
    name: 'getAuditTrail',
    whenToUse: 'Recent audit log entries for a user (who did what, when).',
    parameters: '{ userId: string, limit?: number }',
    permission: PermissionKeys.AUDIT_READ,
    execute: async (args) => {
      const userId = String(args.userId ?? '');
      const logs = await AuditLog.find({
        $or: [{ actorId: userId }, { 'metadata.userId': userId }],
      })
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(args.limit ?? 15), 50))
        .lean();
      return {
        result: logs.map((l) => ({ action: l.action, at: l.createdAt, metadata: l.metadata })),
        summary: `${logs.length} audit entries`,
      };
    },
  },
];

export async function runAnomalyRules(userId: string) {
  const anomalies: { code: string; detail: string }[] = [];
  const since5m = new Date(Date.now() - 5 * 60 * 1000);
  const [recentDeposits, dupRefs, bigWithdrawals] = await Promise.all([
    Transaction.countDocuments({ userId, type: 'DEPOSIT', createdAt: { $gte: since5m } }),
    Transaction.aggregate([
      { $match: { userId: new (await import('mongoose')).Types.ObjectId(userId), type: 'DEPOSIT' } },
      { $group: { _id: '$reference', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 3 },
    ]),
    Transaction.countDocuments({
      userId,
      type: 'WITHDRAWAL',
      amount: { $gte: 50000 * 100 },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }),
  ]);
  if (recentDeposits >= 3) {
    anomalies.push({ code: 'DEPOSIT_VELOCITY', detail: `${recentDeposits} deposits in the last 5 minutes — unusual pace.` });
  }
  if (dupRefs.length > 0) {
    anomalies.push({ code: 'DUPLICATE_REFERENCE', detail: `Reference(s) used more than once: ${dupRefs.map((d) => d._id).join(', ')}.` });
  }
  if (bigWithdrawals >= 2) {
    anomalies.push({ code: 'WITHDRAWAL_PATTERN', detail: `${bigWithdrawals} large withdrawals (≥৳50,000) in 24h.` });
  }
  return anomalies;
}

/** Tools the caller is allowed to use, given their permissions. */
export function toolsFor(caller: AuthUser, staff: boolean): Tool[] {
  const pool = staff ? [...userTools, ...staffTools] : userTools;
  return pool.filter((t) => !t.permission || hasPermission(caller, t.permission));
}

export function renderToolDocs(tools: Tool[]): string {
  return tools
    .map((t) => `- ${t.name}(${t.parameters}): ${t.whenToUse}`)
    .join('\n');
}
