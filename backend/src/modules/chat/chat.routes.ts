import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireAnyPermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './chat.service.js';

const router = Router();

const startSchema = z.object({ channel: z.enum(['AI', 'HUMAN']).default('AI') });
const messageSchema = z.object({
  body: z.string().min(1).max(5000),
  attachments: z.array(z.string().max(500)).max(3).optional(),
});
const conversationIdParams = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

router.use(authenticate);

router.post(
  '/start',
  validate({ body: startSchema }),
  asyncHandler(async (req, res) => {
    const { channel } = req.validatedBody as { channel: 'AI' | 'HUMAN' };
    const conversation = await service.getOrCreateConversation(req.user!.id, channel);
    send(res, 200, { conversation });
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    send(res, 200, { conversations: await service.listForUser(req.user!.id) });
  }),
);

router.get(
  '/inbox',
  requireAnyPermission(PermissionKeys.CHAT_READ, PermissionKeys.CHAT_JOIN),
  asyncHandler(async (req, res) => {
    send(res, 200, { conversations: await service.listForStaff() });
  }),
);

router.get(
  '/:conversationId/messages',
  validate({ params: conversationIdParams }),
  asyncHandler(async (req, res) => {
    const result = await service.getMessages(req.validatedParams!.conversationId as string, req.user!);
    send(res, 200, result);
  }),
);

router.post(
  '/:conversationId/messages',
  validate({ params: conversationIdParams, body: messageSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validatedBody as unknown as { body: string; attachments?: string[] };
    const result = await service.sendMessage(
      req.validatedParams!.conversationId as string,
      { id: req.user!.id, name: req.user!.name, role: req.user!.role, roleRank: req.user!.roleRank },
      input,
    );
    send(res, 201, result, 'Message sent');
  }),
);

router.post(
  '/:conversationId/escalate',
  validate({ params: conversationIdParams }),
  asyncHandler(async (req, res) => {
    const conversation = await service.escalateToHuman(
      req.validatedParams!.conversationId as string,
      req.user!.id,
    );
    send(res, 200, { conversation }, 'Escalated to human support');
  }),
);

router.post(
  '/:conversationId/read',
  validate({ params: conversationIdParams }),
  asyncHandler(async (req, res) => {
    const conversation = await service.markRead(req.validatedParams!.conversationId as string, req.user!);
    send(res, 200, { conversation }, 'Marked read');
  }),
);

router.post(
  '/:conversationId/close',
  validate({ params: conversationIdParams }),
  asyncHandler(async (req, res) => {
    const conversation = await service.closeConversation(req.validatedParams!.conversationId as string, req.user!);
    send(res, 200, { conversation }, 'Conversation closed');
  }),
);

export default router;
