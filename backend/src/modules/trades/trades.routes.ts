import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import {
  adminCloseTrade,
  listAllTrades,
  listOpenTrades,
  listTradeHistory,
  openTrade,
  closeTrade,
  tradeStats,
} from './trades.service.js';
import { WalletTypes } from '../../constants/index.js';

const router = Router();

const openTradeSchema = z.object({
  walletType: z.enum(['MAIN', 'DEMO']).default('MAIN'),
  symbol: z.string().min(3).max(20),
  side: z.enum(['BUY', 'SELL']),
  marginBdt: z.coerce.number().positive().max(1_000_000),
  leverage: z.coerce.number().min(1).max(100),
});

const historyQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  walletType: z.enum(['MAIN', 'DEMO']).optional(),
});

const adminListQuery = z.object({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const tradeIdParams = z.object({
  tradeId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

router.use(authenticate);

router.get(
  '/open',
  validate({ query: historyQuery }),
  asyncHandler(async (req, res) => {
    const walletType = req.validatedQuery?.walletType as 'MAIN' | 'DEMO' | undefined;
    send(res, 200, { trades: await listOpenTrades(req.user!.id, walletType) });
  }),
);

router.get(
  '/history',
  validate({ query: historyQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as { page: number; limit: number };
    send(res, 200, await listTradeHistory(req.user!.id, q.page, q.limit));
  }),
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    send(res, 200, await tradeStats(req.user!.id));
  }),
);

router.post(
  '/',
  validate({ body: openTradeSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validatedBody as unknown as {
      walletType: (typeof WalletTypes)[keyof typeof WalletTypes];
      symbol: string;
      side: 'BUY' | 'SELL';
      marginBdt: number;
      leverage: number;
    };
    const result = await openTrade(req.user!.id, input);
    send(res, 201, result, 'Trade opened');
  }),
);

router.post(
  '/:tradeId/close',
  validate({ params: tradeIdParams }),
  asyncHandler(async (req, res) => {
    const result = await closeTrade(req.user!.id, req.validatedParams!.tradeId as string);
    send(res, 200, result, 'Trade closed');
  }),
);

// Admin: all trades
router.get(
  '/all',
  requirePermission(PermissionKeys.TRADES_READ),
  validate({ query: adminListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as { status?: string; userId?: string; page: number; limit: number };
    send(res, 200, await listAllTrades(q));
  }),
);

router.post(
  '/:tradeId/admin-close',
  requirePermission(PermissionKeys.TRADES_CLOSE),
  validate({ params: tradeIdParams }),
  asyncHandler(async (req, res) => {
    const result = await adminCloseTrade(req.validatedParams!.tradeId as string, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
    });
    send(res, 200, result, 'Trade closed by admin');
  }),
);

export default router;
