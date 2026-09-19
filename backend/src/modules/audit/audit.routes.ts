import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { AuditLog } from './audit.model.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';

const router = Router();

const listQuerySchema = z.object({
  action: z.string().max(80).optional(),
  actorId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  targetId: z.string().max(80).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});

router.use(authenticate);

router.get(
  '/',
  requirePermission(PermissionKeys.AUDIT_READ),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as {
      action?: string;
      actorId?: string;
      targetId?: string;
      page: number;
      limit: number;
    };
    const filter: Record<string, unknown> = {};
    if (q.action) filter.action = q.action;
    if (q.actorId) filter.actorId = q.actorId;
    if (q.targetId) filter.targetId = q.targetId;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate('actorId', 'name email role')
        .lean(),
      AuditLog.countDocuments(filter),
    ]);
    send(res, 200, { logs, total, page: q.page, pages: Math.ceil(total / q.limit) });
  }),
);

export default router;
