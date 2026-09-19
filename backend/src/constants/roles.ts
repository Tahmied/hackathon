export const Roles = {
  USER: 'user',
  SUPPORT_AGENT: 'support_agent',
  KYC_REVIEWER: 'kyc_reviewer',
  FINANCE_REVIEWER: 'finance_reviewer',
  SUPER_ADMIN: 'super_admin',
} as const;

export type RoleName = (typeof Roles)[keyof typeof Roles];
export const RoleValues: RoleName[] = Object.values(Roles);

export const RoleRank: Record<RoleName, number> = {
  [Roles.USER]: 10,
  [Roles.SUPPORT_AGENT]: 20,
  [Roles.KYC_REVIEWER]: 30,
  [Roles.FINANCE_REVIEWER]: 40,
  [Roles.SUPER_ADMIN]: 50,
};

/** Anti-escalation: a role may only assign/manage roles listed here. */
export const ManageableRoles: Record<RoleName, RoleName[]> = {
  [Roles.USER]: [],
  [Roles.SUPPORT_AGENT]: [],
  [Roles.KYC_REVIEWER]: [Roles.SUPPORT_AGENT],
  [Roles.FINANCE_REVIEWER]: [Roles.KYC_REVIEWER, Roles.SUPPORT_AGENT],
  [Roles.SUPER_ADMIN]: Object.values(Roles),
};

export const StaffRoles: RoleName[] = [
  Roles.SUPPORT_AGENT,
  Roles.KYC_REVIEWER,
  Roles.FINANCE_REVIEWER,
  Roles.SUPER_ADMIN,
];

export const RoleLabels: Record<RoleName, string> = {
  [Roles.USER]: 'User (Trader)',
  [Roles.SUPPORT_AGENT]: 'Support Agent',
  [Roles.KYC_REVIEWER]: 'KYC Reviewer',
  [Roles.FINANCE_REVIEWER]: 'Finance Reviewer',
  [Roles.SUPER_ADMIN]: 'Super Admin',
};

export const PermissionWildcard = '*';
