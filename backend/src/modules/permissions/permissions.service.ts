import mongoose from 'mongoose';
import { ApiError } from '../../shared/utils/ApiError.js';
import { withTransaction } from '../../shared/db/connectDb.js';
import { Role } from './role.model.js';
import { Permission } from './permission.model.js';
import { RolePermission as RolePermissionModel } from './rolePermission.model.js';
import { PermissionCatalog, PermissionValues, RolePermissions } from '../../constants/permissions.js';
import { RoleLabels, RoleRank, Roles, RoleValues, type RoleName } from '../../constants/roles.js';
import { PermissionWildcard } from '../../constants/roles.js';
import {
  invalidateRoleAuthorization,
  invalidateUserAuthorization,
} from '../../shared/utils/permissionHelpers.js';
import { logAudit } from '../audit/audit.model.js';
import { User } from '../auth/user.model.js';

export async function listPermissionSystem() {
  const [permissions, mappings] = await Promise.all([
    Permission.find().sort({ module: 1, name: 1 }).lean(),
    RolePermissionModel.find()
      .populate<{ roleId: { _id: unknown; name: RoleName } }>('roleId', 'name')
      .populate<{ permissionId: { name: string } }>('permissionId', 'name')
      .lean(),
  ]);

  const roles = RoleValues.map((name) => ({
    name,
    label: RoleLabels[name],
    rank: RoleRank[name],
    isSystem: true,
  })).sort((a, b) => b.rank - a.rank);

  const rolePermissions: Record<string, string[]> = Object.fromEntries(
    RoleValues.map((r) => [r, []]),
  );
  for (const mapping of mappings) {
    const roleDoc = mapping.roleId as unknown as { name?: RoleName };
    if (!roleDoc?.name || !(roleDoc.name in rolePermissions)) continue;
    rolePermissions[roleDoc.name]!.push(mapping.permissionId.name);
  }
  rolePermissions[Roles.SUPER_ADMIN] = [PermissionWildcard];

  return { roles, permissions, rolePermissions };
}

export async function getPermissionsForRole(role: RoleName): Promise<string[]> {
  if (role === Roles.SUPER_ADMIN) return [PermissionWildcard];
  const roleDoc = await Role.findOne({ name: role });
  if (!roleDoc) return [];
  const mappings = await RolePermissionModel.find({ roleId: roleDoc._id })
    .populate<{ permissionId: { name: string } }>('permissionId', 'name')
    .lean();
  return mappings.map((m) => m.permissionId.name);
}

export async function replaceRolePermissions(
  role: RoleName,
  permissionNames: string[],
  actor: { id: string; role: string; ip?: string; userAgent?: string },
): Promise<string[]> {
  if (role === Roles.SUPER_ADMIN) {
    throw ApiError.badRequest('Super admin always uses wildcard permissions');
  }
  const invalid = permissionNames.filter((p) => !PermissionValues.includes(p));
  if (invalid.length > 0) throw ApiError.badRequest(`Unknown permissions: ${invalid.join(', ')}`);

  const roleDoc = await Role.findOne({ name: role });
  if (!roleDoc) throw ApiError.notFound('Role not found');

  await withTransaction(async (session) => {
    await RolePermissionModel.deleteMany({ roleId: roleDoc._id }, { session });
    if (permissionNames.length > 0) {
      const perms = await Permission.find({ name: { $in: permissionNames } }).session(session);
      await RolePermissionModel.insertMany(
        perms.map((p) => ({
          roleId: roleDoc._id,
          permissionId: p._id,
          grantedBy: new mongoose.Types.ObjectId(actor.id),
        })),
        { session },
      );
    }
  });

  await invalidateRoleAuthorization(role);
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'role.permissions_replaced',
    targetType: 'role',
    targetId: role,
    metadata: { role, permissions: permissionNames },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  return getPermissionsForRole(role);
}

/**
 * Ensures Role/Permission collections exist with catalog + default mappings.
 * Idempotent: re-running never duplicates. Used by seed and app bootstrap.
 */
export async function ensureRbacSeeded() {
  for (const def of PermissionCatalog) {
    await Permission.updateOne(
      { name: def.name },
      { $set: { label: def.label, description: def.description, module: def.module, action: def.action } },
      { upsert: true },
    );
  }
  for (const roleName of RoleValues) {
    await Role.updateOne(
      { name: roleName },
      { $set: { label: RoleLabels[roleName], isSystem: true, sortOrder: RoleRank[roleName] } },
      { upsert: true },
    );
  }
  for (const [roleName, perms] of Object.entries(RolePermissions) as [RoleName, string[]][]) {
    if (perms[0] === PermissionWildcard) continue;
    const roleDoc = await Role.findOne({ name: roleName });
    if (!roleDoc) continue;
    const permDocs = await Permission.find({ name: { $in: perms } });
    for (const p of permDocs) {
      await RolePermissionModel.updateOne(
        { roleId: roleDoc._id, permissionId: p._id },
        { $setOnInsert: { roleId: roleDoc._id, permissionId: p._id } },
        { upsert: true },
      );
    }
  }
}

/** Assign a role to a user with anti-escalation already enforced by middleware. */
export async function assignUserRole(
  userId: string,
  role: RoleName,
  actor: { id: string; role: string; ip?: string; userAgent?: string },
) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  const oldRole = user.role;
  user.role = role;
  user.roleRank = RoleRank[role];
  await user.save();

  await invalidateUserAuthorization(userId);
  if (oldRole !== role) await invalidateRoleAuthorization(oldRole);
  await logAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: 'user.role_assigned',
    targetType: 'user',
    targetId: userId,
    metadata: { userId, from: oldRole, to: role },
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
  return user;
}
