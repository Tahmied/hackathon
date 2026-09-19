import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './users.service.js';
import type { RoleName } from '../../constants/roles.js';

export const usersController = {
  getProfile: asyncHandler(async (req, res) => {
    send(res, 200, await service.getProfile(req.user!.id));
  }),

  updateProfile: asyncHandler(async (req, res) => {
    const patch = req.validatedBody as { name?: string; phone?: string; avatarUrl?: string };
    send(res, 200, await service.updateProfile(req.user!.id, patch), 'Profile updated');
  }),

  changePassword: asyncHandler(async (req, res) => {
    const input = req.validatedBody as { currentPassword: string; newPassword: string };
    await service.changePassword(req.user!.id, input);
    send(res, 200, { ok: true }, 'Password changed');
  }),

  listUsers: asyncHandler(async (req, res) => {
    const query = req.validatedQuery as {
      q?: string;
      role?: string;
      kycStatus?: string;
      page: number;
      limit: number;
    };
    send(res, 200, await service.listUsers(query));
  }),

  getUser: asyncHandler(async (req, res) => {
    send(res, 200, await service.getUserDetail(req.validatedParams!.userId as string));
  }),

  getTimeline: asyncHandler(async (req, res) => {
    send(res, 200, await service.getUserTimeline(req.validatedParams!.userId as string));
  }),

  setUserActive: asyncHandler(async (req, res) => {
    const isActive = req.validatedBody?.isActive as boolean;
    const user = await service.setUserActive(req.validatedParams!.userId as string, isActive, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
    });
    send(res, 200, user, isActive ? 'User unblocked' : 'User blocked');
  }),

  assignRole: asyncHandler(async (req, res) => {
    // Handled in permissions routes; kept here for symmetric API docs only.
    send(res, 200, { ok: true });
  }),
};

export type { RoleName };
