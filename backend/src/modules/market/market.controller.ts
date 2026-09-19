import { z } from 'zod';
import { ApiError } from '../../shared/utils/ApiError.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { Asset } from './asset.model.js';
import { getCandles, getMarketStatus } from './market.engine.js';

export const marketController = {
  listAssets: asyncHandler(async (req, res) => {
    const q = (req.validatedQuery?.q as string | undefined)?.toLowerCase();
    const filter: Record<string, unknown> = { isActive: true };
    const assets = await Asset.find(filter).sort({ symbol: 1 }).lean();
    const filtered = q
      ? assets.filter(
          (a) => a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
        )
      : assets;
    send(res, 200, { assets: filtered });
  }),

  getAsset: asyncHandler(async (req, res) => {
    const symbol = String(req.validatedParams?.symbol ?? '').toUpperCase();
    const asset = await Asset.findOne({ symbol, isActive: true }).lean();
    if (!asset) throw ApiError.notFound('Asset not found');
    send(res, 200, { asset });
  }),

  getCandles: asyncHandler(async (req, res) => {
    const query = req.validatedQuery as { symbol: string; interval: string; limit: number };
    const candles = await getCandles(
      query.symbol.toUpperCase(),
      query.interval,
      query.limit,
    );
    send(res, 200, { candles });
  }),

  getStatus: asyncHandler(async (_req, res) => {
    send(res, 200, getMarketStatus());
  }),
};

export const marketQuerySchema = z.object({
  q: z.string().max(50).optional(),
});

export const symbolParamsSchema = z.object({
  symbol: z.string().min(3).max(20),
});

export const candlesQuerySchema = z.object({
  symbol: z.string().min(3).max(20),
  interval: z.enum(['1m', '5m', '15m']).default('1m'),
  limit: z.coerce.number().min(10).max(1000).default(300),
});
