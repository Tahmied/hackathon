import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './ai.service.js';

const router = Router();

const staffChatSchema = z.object({
  message: z.string().min(1).max(4000),
  userId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
});

const idParams = (field: string) =>
  z.object({ [field]: z.string().regex(/^[0-9a-fA-F]{24}$/) });

router.use(authenticate);

// Staff assistant + analyses
router.post(
  '/staff-chat',
  requirePermission(PermissionKeys.AI_USE),
  validate({ body: staffChatSchema }),
  asyncHandler(async (req, res) => {
    const { message, userId } = req.validatedBody as unknown as { message: string; userId?: string };
    const result = await service.staffAssistant(req.user!, message, userId);
    send(res, 200, result);
  }),
);

router.get(
  '/analyze/deposit/:txId',
  requirePermission(PermissionKeys.DEPOSITS_READ),
  validate({ params: idParams('txId') }),
  asyncHandler(async (req, res) => {
    send(res, 200, { analysis: await service.analyzeDepositReceipt(req.validatedParams!.txId as string, req.user) });
  }),
);

router.get(
  '/analyze/kyc/:kycId',
  requirePermission(PermissionKeys.KYC_READ),
  validate({ params: idParams('kycId') }),
  asyncHandler(async (req, res) => {
    send(res, 200, { analysis: await service.analyzeKycDocument(req.validatedParams!.kycId as string) });
  }),
);

router.get(
  '/summarize/ticket/:ticketId',
  requirePermission(PermissionKeys.TICKETS_READ),
  validate({ params: idParams('ticketId') }),
  asyncHandler(async (req, res) => {
    send(res, 200, { summary: await service.summarizeTicket(req.validatedParams!.ticketId as string) });
  }),
);

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    send(res, 200, service.getAiStatus());
  }),
);

export default router;
