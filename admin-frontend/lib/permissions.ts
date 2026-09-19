export function can(
  user: { permissions?: string[] } | null | undefined,
  permission?: string,
): boolean {
  if (!permission) return true;
  return Boolean(
    user?.permissions?.includes('*') || user?.permissions?.includes(permission),
  );
}

export function canAny(
  user: { permissions?: string[] } | null | undefined,
  permissions: string[],
): boolean {
  return permissions.some((p) => can(user, p));
}
