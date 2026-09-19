import { Router } from 'express';
import { authenticate, verifyAccessToken } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { marketController, candlesQuerySchema, marketQuerySchema, symbolParamsSchema } from './market.controller.js';
import { isMarketStale } from './market.engine.js';

const router = Router();

/** Public market data (also used logged-out on the landing page ticker). */
router.get('/assets', validate({ query: marketQuerySchema }), marketController.listAssets);
router.get('/assets/:symbol', validate({ params: symbolParamsSchema }), marketController.getAsset);
router.get('/candles', validate({ query: candlesQuerySchema }), marketController.getCandles);

/** Market feed health — public so the landing page can show a status badge. */
router.get('/status', (_req, res, next) => {
  if (isMarketStale()) {
    return res.status(503).json({
      success: false,
      code: 'MARKET_STALE',
      message: 'Market data is delayed',
      data: null,
    });
  }
  next();
}, marketController.getStatus);

export default router;
