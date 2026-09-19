import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './tickets.service.js';

const router = Router();

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  body: z.string().min(5).max(5000),
  attachments: z.array(z.string().max(500)).max(3).optional(),
  linkedTransactionIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).max(10).optional(),
});

const messageSchema = z.object({
  body: z.string().min(1).max(5000),
  attachments: z.array(z.string().max(500)).max(3).optional(),
  isInternalNote: z.boolean().optional(),
});

const listQuery = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

const ticketIdParams = z.object({ ticketId: z.string().regex(/^[0-9a-fA-F]{24}$/) });
const statusSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']),
});

router.use(authenticate);

router.post(
  '/',
  validate({ body: createSchema }),
  asyncHandler(async (req, res) => {
    const ticket = await service.createTicket(req.user!.id, req.validatedBody as never);
    send(res, 201, { ticket }, 'Ticket created');
  }),
);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    send(res, 200, { tickets: await service.listMyTickets(req.user!.id) });
  }),
);

router.get(
  '/',
  requirePermission(PermissionKeys.TICKETS_READ),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery as { status?: string; page: number; limit: number };
    send(res, 200, await service.listAllTickets(q));
  }),
);

router.get(
  '/:ticketId',
  validate({ params: ticketIdParams }),
  asyncHandler(async (req, res) => {
    send(res, 200, { ticket: await service.getTicket(req.validatedParams!.ticketId as string, req.user!) });
  }),
);

router.get(
  '/:ticketId/context',
  requirePermission(PermissionKeys.TICKETS_READ),
  validate({ params: ticketIdParams }),
  asyncHandler(async (req, res) => {
    send(res, 200, await service.getTicketUserContext(req.validatedParams!.ticketId as string));
  }),
);

router.post(
  '/:ticketId/messages',
  validate({ params: ticketIdParams, body: messageSchema }),
  asyncHandler(async (req, res) => {
    const input = req.validatedBody as unknown as {
      body: string;
      attachments?: string[];
      isInternalNote?: boolean;
    };
    const ticket = await service.addTicketMessage(req.validatedParams!.ticketId as string, {
      id: req.user!.id,
      role: req.user!.role,
      name: req.user!.name,
    }, input);
    send(res, 200, { ticket }, input.isInternalNote ? 'Internal note added' : 'Reply sent');
  }),
);

router.post(
  '/:ticketId/status',
  requirePermission(PermissionKeys.TICKETS_CLOSE),
  validate({ params: ticketIdParams, body: statusSchema }),
  asyncHandler(async (req, res) => {
    const { status } = req.validatedBody as unknown as { status: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED' };
    const ticket = await service.setTicketStatus(req.validatedParams!.ticketId as string, status, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
    });
    send(res, 200, { ticket }, 'Status updated');
  }),
);

export default router;
