import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import * as service from './permissions.service.js';
import type { RoleName } from '../../constants/roles.js';

export const permissionController = {
  list: asyncHandler(async (req, res) => {
    send(res, 200, await service.listPermissionSystem());
  }),

  getRole: asyncHandler(async (req, res) => {
    const role = req.validatedParams?.role as RoleName;
    send(res, 200, { role, permissions: await service.getPermissionsForRole(role) });
  }),

  replaceRole: asyncHandler(async (req, res) => {
    const role = req.validatedParams?.role as RoleName;
    const permissions = (req.validatedBody?.permissions as string[]) ?? [];
    const updated = await service.replaceRolePermissions(role, permissions, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    send(res, 200, { role, permissions: updated }, 'Role permissions updated');
  }),

  assignRole: asyncHandler(async (req, res) => {
    const userId = req.validatedParams?.userId as string;
    const role = req.validatedBody?.role as RoleName;
    const user = await service.assignUserRole(userId, role, {
      id: req.user!.id,
      role: req.user!.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    send(res, 200, { id: user._id, role: user.role, roleRank: user.roleRank }, 'Role assigned');
  }),
};
