import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import {
  ManageableRoles,
  RoleRank,
  RoleValues,
  type RoleName,
} from '../../constants/roles.js';
import { hasPermission, hasAnyPermission } from '../utils/permissionHelpers.js';
import type { PermissionKey } from '../../constants/permissions.js';

export function requirePermission(requiredPermission: PermissionKey | string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.forbidden('Authentication required'));
    if (hasPermission(req.user, requiredPermission)) return next();
    return next(ApiError.forbidden(`Permission '${requiredPermission}' is required`));
  };
}

export function requireAnyPermission(...allowed: (PermissionKey | string)[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.forbidden('Authentication required'));
    if (hasAnyPermission(req.user, allowed)) return next();
    return next(ApiError.forbidden('Missing required permissions'));
  };
}

export function requireAllPermissions(...required: (PermissionKey | string)[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.forbidden('Authentication required'));
    const missing = required.filter((p) => !hasPermission(req.user!, p));
    if (missing.length > 0) return next(ApiError.forbidden(`Missing permissions: ${missing.join(', ')}`));
    return next();
  };
}

export function requireRole(...allowedRoles: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.forbidden('Authentication required'));
    const userRole = req.user.role;
    if (allowedRoles.includes(userRole)) return next();
    // rank hierarchy pass: higher-or-equal rank than the minimum allowed role
    const userRank = RoleRank[userRole];
    const allowedRanks = allowedRoles.map((r) => RoleRank[r]).filter(Boolean);
    if (allowedRanks.length > 0 && userRank >= Math.min(...allowedRanks)) return next();
    return next(ApiError.forbidden(`Role '${userRole}' cannot access this resource`));
  };
}

export function requireMinimumRole(minimumRole: RoleName) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.forbidden('Authentication required'));
    const minimumRank = RoleRank[minimumRole];
    const userRank = RoleRank[req.user.role];
    if (!minimumRank || !userRank || userRank < minimumRank) {
      return next(ApiError.forbidden('Insufficient role'));
    }
    return next();
  };
}

/** Anti-escalation guard: validates req.body.role against ManageableRoles of the actor. */
export function requireManageableRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.forbidden('Authentication required'));
  const targetRole = req.validatedBody?.role as RoleName | undefined;
  if (!targetRole) return next();
  if (!RoleValues.includes(targetRole)) return next(ApiError.forbidden('Invalid role'));
  const manageable = ManageableRoles[req.user.role] || [];
  if (!manageable.includes(targetRole)) {
    return next(ApiError.forbidden(`You cannot assign or manage the '${targetRole}' role`));
  }
  return next();
}

export function isStaff(user?: AuthUser): boolean {
  return Boolean(user && user.roleRank >= RoleRank.support_agent);
}

import type { AuthUser } from '../utils/permissionHelpers.js';
