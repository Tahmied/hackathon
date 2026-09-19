import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './admin.service.js';

const router = Router();

const pageQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});
const alertParams = z.object({ alertId: z.string().regex(/^[0-9a-fA-F]{24}$/) });

router.use(authenticate);

router.get(
  '/dashboard',
  requirePermission(PermissionKeys.DASHBOARD_READ),
  asyncHandler(async (_req, res) => {
    send(res, 200, await service.getAdminDashboard());
  }),
);

router.get(
  '/finance-summary',
  requireAnyPermission(PermissionKeys.DEPOSITS_READ, PermissionKeys.WITHDRAWALS_READ),
  asyncHandler(async (_req, res) => {
    send(res, 200, await service.getFinanceSummary());
  }),
);

router.get(
  '/alerts',
  requirePermission(PermissionKeys.DASHBOARD_READ),
  validate({ query: pageQuery }),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.validatedQuery as { page: number; limit: number };
    send(res, 200, await service.listAlerts(page, limit));
  }),
);

router.post(
  '/alerts/:alertId/resolve',
  requirePermission(PermissionKeys.DASHBOARD_READ),
  validate({ params: alertParams }),
  asyncHandler(async (req, res) => {
    send(res, 200, { alert: await service.resolveAlert(req.validatedParams!.alertId as string) }, 'Alert resolved');
  }),
);

export default router;
