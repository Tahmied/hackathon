import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './kyc.service.js';

const router = Router();

const submitSchema = z.object({
  docType: z.enum(['NID', 'PASSPORT', 'DRIVING_LICENSE']),
  fullNameOnDoc: z.string().min(2).max(80).optional(),
  docNumber: z.string().min(4).max(30).optional(),
  frontUrl: z.string().min(3).max(500),
  backUrl: z.string().max(500).optional(),
});

const kycIdParams = z.object({ kycId: z.string().regex(/^[0-9a-fA-F]{24}$/) });
const reviewSchema = z.object({
  approve: z.boolean(),
  comment: z.string().min(3, 'A review comment is mandatory').max(1000),
});
const queueQuery = z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional() });

router.use(authenticate);

router.post(
  '/',
  validate({ body: submitSchema }),
  asyncHandler(async (req, res) => {
    const submission = await service.submitKyc(req.user!.id, req.validatedBody as never);
    send(res, 201, { submission }, 'KYC submitted for review');
  }),
);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    send(res, 200, await service.getMyKyc(req.user!.id));
  }),
);

router.get(
  '/',
  requirePermission(PermissionKeys.KYC_READ),
  validate({ query: queueQuery }),
  asyncHandler(async (req, res) => {
    send(res, 200, { submissions: await service.listKycQueue(req.validatedQuery?.status as string | undefined) });
  }),
);

router.get(
  '/:kycId',
  requirePermission(PermissionKeys.KYC_READ),
  validate({ params: kycIdParams }),
  asyncHandler(async (req, res) => {
    send(res, 200, await service.getKycDetail(req.validatedParams!.kycId as string));
  }),
);

router.post(
  '/:kycId/review',
  requirePermission(PermissionKeys.KYC_REVIEW),
  validate({ params: kycIdParams, body: reviewSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validatedBody as unknown as { approve: boolean; comment: string };
    const kyc = await service.reviewKyc(req.validatedParams!.kycId as string, input, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    send(res, 200, { kyc }, input.approve ? 'KYC approved' : 'KYC rejected');
  }),
);

export default router;
