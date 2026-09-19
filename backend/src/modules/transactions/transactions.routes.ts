import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import {
  depositSchema,
  listTxQuery,
  rejectSchema,
  resolveConflictSchema,
  reviewActionSchema,
  txIdParams,
  withdrawalSchema,
} from './transactions.validator.js';
import * as service from './transactions.service.js';
import type { TransactionStatus, TransactionType } from '../../constants/index.js';

const router = Router();

function actor(req: { user?: { id: string; role: string }; ip?: string; headers: Record<string, unknown> }) {
  return {
    id: req.user!.id,
    role: req.user!.role,
    ip: req.ip,
    userAgent: req.headers['user-agent'] as string | undefined,
  };
}

router.use(authenticate);

// ---------- user ----------
router.post(
  '/deposits',
  validate({ body: depositSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.submitDeposit(req.user!.id, req.validatedBody as never);
    send(res, 201, result, result.conflict ? 'Deposit submitted — flagged for conflict review' : 'Deposit submitted');
  }),
);

router.post(
  '/withdrawals',
  validate({ body: withdrawalSchema }),
  asyncHandler(async (req, res) => {
    const tx = await service.submitWithdrawal(req.user!.id, req.validatedBody as never);
    send(res, 201, { transaction: tx }, 'Withdrawal submitted');
  }),
);

router.get(
  '/mine',
  validate({ query: listTxQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as { type?: TransactionType; status?: TransactionStatus; page: number; limit: number };
    send(res, 200, await service.listMyTransactions(req.user!.id, q));
  }),
);

// ---------- admin: finance review ----------
router.get(
  '/',
  requireAnyPermission(PermissionKeys.DEPOSITS_READ, PermissionKeys.WITHDRAWALS_READ),
  validate({ query: listTxQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as {
      type?: TransactionType;
      status?: TransactionStatus;
      userId?: string;
      page: number;
      limit: number;
    };
    send(res, 200, await service.listAdminTransactions(q));
  }),
);

router.get(
  '/conflicts',
  requirePermission(PermissionKeys.CONFLICTS_READ),
  asyncHandler(async (req, res) => {
    send(res, 200, { groups: await service.listConflictGroups() });
  }),
);

router.get(
  '/:txId',
  requireAnyDepositReadPermission(),
  validate({ params: txIdParams }),
  asyncHandler(async (req, res) => {
    send(res, 200, await service.getTransactionDetail(req.validatedParams!.txId as string));
  }),
);

router.post(
  '/:txId/approve',
  validate({ params: txIdParams, body: reviewActionSchema }),
  asyncHandler(async (req, res) => {
    const tx = await service.getTransactionDetail(req.validatedParams!.txId as string);
    const a = actor(req);
    if (tx.type === 'DEPOSIT') {
      reqHas(req, PermissionKeys.DEPOSITS_APPROVE);
      send(res, 200, { transaction: await service.approveDeposit(String(tx._id), a) }, 'Deposit approved');
    } else {
      reqHas(req, PermissionKeys.WITHDRAWALS_APPROVE);
      send(res, 200, { transaction: await service.approveWithdrawal(String(tx._id), a) }, 'Withdrawal approved');
    }
  }),
);

router.post(
  '/:txId/reject',
  validate({ params: txIdParams, body: rejectSchema }),
  asyncHandler(async (req, res) => {
    const tx = await service.getTransactionDetail(req.validatedParams!.txId as string);
    const note = (req.validatedBody?.note as string) ?? '';
    const a = actor(req);
    if (tx.type === 'DEPOSIT') {
      reqHas(req, PermissionKeys.DEPOSITS_REJECT);
      send(res, 200, { transaction: await service.rejectDeposit(String(tx._id), note, a) }, 'Deposit rejected');
    } else {
      reqHas(req, PermissionKeys.WITHDRAWALS_REJECT);
      send(res, 200, { transaction: await service.rejectWithdrawal(String(tx._id), note, a) }, 'Withdrawal rejected');
    }
  }),
);

router.post(
  '/:txId/request-info',
  requirePermission(PermissionKeys.DEPOSITS_REQUEST_INFO),
  validate({ params: txIdParams, body: rejectSchema }),
  asyncHandler(async (req, res) => {
    const note = (req.validatedBody?.note as string) ?? '';
    const tx = await service.requestDepositInfo(req.validatedParams!.txId as string, note, actor(req));
    send(res, 200, { transaction: tx }, 'Info requested from user');
  }),
);

const conflictGroupParams = z.object({
  conflictGroupId: z.string().min(8).max(60),
});

router.post(
  '/conflicts/:conflictGroupId/resolve',
  requirePermission(PermissionKeys.CONFLICTS_RESOLVE),
  validate({ params: conflictGroupParams, body: resolveConflictSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validatedBody as unknown as { approveTransactionId: string; note: string };
    const result = await service.resolveConflict(req.validatedParams!.conflictGroupId as string, input, actor(req));
    send(res, 200, result, 'Conflict resolved');
  }),
);

export default router;

// ---- helpers (route-level permission refinement by transaction type) ----
function requireAnyDepositReadPermission() {
  return requireAnyPermission(PermissionKeys.DEPOSITS_READ, PermissionKeys.WITHDRAWALS_READ);
}

function reqHas(req: { user?: { permissions: string[] } }, permission: string) {
  const ok =
    req.user?.permissions.includes('*') || req.user?.permissions.includes(permission);
  if (!ok) {
    throw ApiError.forbidden(`Permission '${permission}' is required`);
  }
}
