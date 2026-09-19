import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/auth.js';
import { requireAnyPermission, requirePermission } from '../../shared/middleware/rbac.js';
import { validate } from '../../shared/middleware/validate.js';
import { PermissionKeys } from '../../constants/permissions.js';
import { usersController } from './users.controller.js';
import {
  blockUserSchema,
  changePasswordSchema,
  listUsersQuerySchema,
  updateProfileSchema,
  userIdParamsSchema,
} from './users.validator.js';

const router = Router();

router.use(authenticate);

// Self-service profile
router.get('/me/profile', usersController.getProfile);
router.put(
  '/me/profile',
  validate({ body: updateProfileSchema }),
  usersController.updateProfile,
);
router.put(
  '/me/password',
  validate({ body: changePasswordSchema }),
  usersController.changePassword,
);

// Staff: user directory
router.get(
  '/',
  requirePermission(PermissionKeys.USERS_READ),
  validate({ query: listUsersQuerySchema }),
  usersController.listUsers,
);

router.get(
  '/:userId',
  requireAnyPermission(PermissionKeys.USERS_READ, PermissionKeys.TICKETS_READ),
  validate({ params: userIdParamsSchema }),
  usersController.getUser,
);

router.get(
  '/:userId/timeline',
  requireAnyPermission(PermissionKeys.USERS_READ, PermissionKeys.TICKETS_READ),
  validate({ params: userIdParamsSchema }),
  usersController.getTimeline,
);

router.put(
  '/:userId/active',
  requirePermission(PermissionKeys.USERS_BLOCK),
  validate({ params: userIdParamsSchema, body: blockUserSchema }),
  usersController.setUserActive,
);

export default router;
