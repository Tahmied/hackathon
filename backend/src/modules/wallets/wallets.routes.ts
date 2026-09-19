import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { getReservedBreakdown, getWalletsOverview } from './wallets.service.js';
import { WalletTypes } from '../../constants/index.js';

const router = Router();

const walletTypeQuery = z.object({
  walletType: z.enum(['MAIN', 'DEMO']).optional(),
});

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  send(res, 200, await getWalletsOverview(req.user!.id));
}));

router.get(
  '/reserved',
  validate({ query: walletTypeQuery }),
  asyncHandler(async (req, res) => {
    const walletType = (req.validatedQuery?.walletType as 'MAIN' | 'DEMO' | undefined) ?? undefined;
    send(res, 200, await getReservedBreakdown(req.user!.id, walletType));
  }),
);

export default router;
