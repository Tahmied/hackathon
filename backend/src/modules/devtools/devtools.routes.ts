import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { setFeedPaused, isFeedPaused, getMarketStatus } from '../market/market.engine.js';
import { setAiOutage, getAiStatus } from '../ai/ai.service.js';

const router = Router();

router.use(authenticate);
router.use((req, _res, next) => {
  if (!env.DEMO_MODE) {
    return next(ApiError.notFound());
  }
  next();
});

const toggleSchema = z.object({ enabled: z.boolean() });

/**
 * Demo triggers (hackathon): make the challenge cases easy to fire live.
 * Guarded by DEMO_MODE=true and the devtools:trigger permission.
 */
router.post(
  '/market/pause',
  requirePermission(PermissionKeys.DEVTOOLS_TRIGGER),
  validate({ body: toggleSchema }),
  asyncHandler(async (req, res) => {
    const { enabled } = req.validatedBody as { enabled: boolean };
    setFeedPaused(enabled);
    send(res, 200, { paused: isFeedPaused() }, enabled ? 'Market feed paused (will go stale)' : 'Market feed resumed');
  }),
);

router.post(
  '/ai/outage',
  requirePermission(PermissionKeys.DEVTOOLS_TRIGGER),
  validate({ body: toggleSchema }),
  asyncHandler(async (req, res) => {
    const { enabled } = req.validatedBody as { enabled: boolean };
    setAiOutage(enabled);
    send(res, 200, { outage: enabled, health: getAiStatus() }, enabled ? 'AI outage simulated' : 'AI restored');
  }),
);

/**
 * Challenge Case 2 fixture: two users submitting the SAME deposit reference.
 */
router.post(
  '/seed-conflict',
  requirePermission(PermissionKeys.DEVTOOLS_TRIGGER),
  asyncHandler(async (req, res) => {
    const { submitDeposit } = await import('../transactions/transactions.service.js');
    const ref = `DUP-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const { User } = await import('../auth/user.model.js');
    const users = await User.find({ role: 'user' }).limit(2).lean();
    if (users.length < 2) throw ApiError.badRequest('Seed at least 2 users first (run npm run seed)');
    const first = await submitDeposit(users[0]!._id.toString(), {
      walletType: 'MAIN',
      amountBdt: 5000,
      method: 'BKASH',
      reference: ref,
    });
    const second = await submitDeposit(users[1]!._id.toString(), {
      walletType: 'MAIN',
      amountBdt: 4000,
      method: 'BKASH',
      reference: ref,
    });
    send(
      res,
      201,
      {
        reference: ref,
        depositA: { id: first.deposit._id, userId: users[0]!._id, amountBdt: 5000, conflict: first.conflict },
        depositB: { id: second.deposit._id, userId: users[1]!._id, amountBdt: 4000, conflict: second.conflict },
      },
      'Conflict scenario seeded (reference: ' + ref + ')',
    );
  }),
);

router.get(
  '/status',
  requirePermission(PermissionKeys.DEVTOOLS_TRIGGER),
  asyncHandler(async (_req, res) => {
    send(res, 200, {
      demoMode: env.DEMO_MODE,
      feedPaused: isFeedPaused(),
      market: getMarketStatus(),
      ai: getAiStatus(),
    });
  }),
);

export default router;
