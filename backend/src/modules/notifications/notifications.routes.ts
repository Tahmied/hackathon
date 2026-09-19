import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { validate } from '../../shared/middleware/validate.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { listNotifications, markNotificationsRead } from './notifications.service.js';

const router = Router();

const listQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});
const markBody = z.object({ ids: z.array(z.string()).max(100).optional() });

router.use(authenticate);

router.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validatedQuery as { page: number; limit: number };
    send(res, 200, await listNotifications(req.user!.id, page, limit));
  }),
);

router.post(
  '/read',
  validate({ body: markBody }),
  asyncHandler(async (req, res) => {
    const { ids } = req.validatedBody as { ids?: string[] };
    await markNotificationsRead(req.user!.id, ids);
    send(res, 200, { ok: true }, 'Marked read');
  }),
);

export default router;
