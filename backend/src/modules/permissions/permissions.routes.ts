import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import {
  requireManageableRole,
  requireMinimumRole,
  requirePermission,
} from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { Roles, RoleValues } from '../../constants/roles.js';
import { permissionController } from './permissions.controller.js';

const router = Router();

const roleParamSchema = z.object({ role: z.enum(RoleValues as [string, ...string[]]) });
const replacePermissionsSchema = z.object({
  permissions: z.array(z.string()).max(200),
});
const assignRoleSchema = z.object({ role: z.enum(RoleValues as [string, ...string[]]) });
const userIdParams = z.object({ userId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id') });

router.use(authenticate);

router.get('/', requirePermission(PermissionKeys.USERS_MANAGE_ROLES), permissionController.list);

router.get(
  '/roles/:role',
  requirePermission(PermissionKeys.USERS_MANAGE_ROLES),
  validate({ params: roleParamSchema }),
  permissionController.getRole,
);

router.put(
  '/roles/:role',
  requireMinimumRole(Roles.SUPER_ADMIN),
  requirePermission(PermissionKeys.USERS_MANAGE_ROLES),
  validate({ params: roleParamSchema, body: replacePermissionsSchema }),
  permissionController.replaceRole,
);

// Assign role to a user (staff management)
router.put(
  '/users/:userId/role',
  requireMinimumRole(Roles.FINANCE_REVIEWER),
  requirePermission(PermissionKeys.USERS_MANAGE_ROLES),
  validate({ params: userIdParams, body: assignRoleSchema }),
  requireManageableRole,
  permissionController.assignRole,
);

export default router;
