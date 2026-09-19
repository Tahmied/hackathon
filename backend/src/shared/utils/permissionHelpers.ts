import { Types } from 'mongoose';
import { redisDel, redisDelPrefix, redisGetJson, redisSet } from '../../config/redis.js';
import { PermissionWildcard, Roles, type RoleName } from '../../constants/roles.js';
import { Role } from '../../modules/permissions/role.model.js';
import { RolePermission } from '../../modules/permissions/rolePermission.model.js';
import { Permission } from '../../modules/permissions/permission.model.js';
import { User } from '../../modules/auth/user.model.js';
import { KycStatuses, type KycStatus } from '../../constants/index.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  roleRank: number;
  permissions: string[];
  kycStatus: KycStatus;
  avatarUrl?: string;
  passwordChangedAt?: Date | null;
}

const CACHE_TTL_SECONDS = 300;

export function getEffectivePermissions(
  rolePerms: string[],
  granted: string[] = [],
  denied: string[] = [],
): string[] {
  if (rolePerms.includes(PermissionWildcard)) return [PermissionWildcard];
  const effective = new Set([...rolePerms, ...granted]);
  denied.forEach((perm) => effective.delete(perm));
  return [...effective];
}

/** DB-authoritative effective permissions for a user (super_admin bypasses). */
export async function getDatabaseEffectivePermissions(
  role: RoleName,
  granted: string[],
  denied: string[],
): Promise<string[]> {
  if (role === Roles.SUPER_ADMIN) return [PermissionWildcard];

  const roleDoc = await Role.findOne({ name: role });
  if (!roleDoc) return getEffectivePermissions([], granted, denied);

  const mappings = await RolePermission.find({ roleId: roleDoc._id }).populate<{
    permissionId: Pick<PermissionDoc, 'name'>;
  }>('permissionId', 'name');
  const rolePerms = mappings.map((m) => m.permissionId.name);
  return getEffectivePermissions(rolePerms, granted, denied);
}

interface PermissionDoc {
  name: string;
}

export async function fetchUserWithPermissions(userId: string): Promise<AuthUser | null> {
  const cacheKey = `user:permissions:${userId}`;
  const cached = await redisGetJson<AuthUser>(cacheKey);
  if (cached) return cached;

  const user = await User.findById(userId).select('+passwordChangedAt');
  if (!user || !user.isActive) return null;

  const permissions = await getDatabaseEffectivePermissions(
    user.role,
    user.permissionsGranted,
    user.permissionsDenied,
  );

  const authUser: AuthUser = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    roleRank: user.roleRank,
    permissions,
    kycStatus: user.kycStatus,
    avatarUrl: user.avatarUrl,
    passwordChangedAt: user.passwordChangedAt ?? null,
  };

  await redisSet(cacheKey, JSON.stringify(authUser), CACHE_TTL_SECONDS);
  return authUser;
}

/** Zero-I/O permission check against req.user.permissions. */
export function hasPermission(user: AuthUser, permission: string): boolean {
  return (
    user.permissions.includes(PermissionWildcard) || user.permissions.includes(permission)
  );
}

export function hasAnyPermission(user: AuthUser, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(user, p));
}

export async function invalidateUserAuthorization(userId: string) {
  await redisDel(`user:permissions:${userId}`);
}

export async function invalidateRoleAuthorization(roleName: RoleName) {
  const users = await User.find({ role: roleName }).select('_id').lean();
  for (const u of users) {
    await redisDel(`user:permissions:${u._id.toString()}`);
  }
}

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
