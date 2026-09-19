import { Roles, type RoleName } from './roles.js';
import { PermissionWildcard } from './roles.js';

/**
 * Permission keys use `module:action` format. The catalog is seeded into the
 * permissions collection; the Roles & Access matrix edits role -> permissions.
 */
export const PermissionKeys = {
  DASHBOARD_READ: 'dashboard:read',

  USERS_READ: 'users:read',
  USERS_WRITE: 'users:write',
  USERS_BLOCK: 'users:block',
  USERS_MANAGE_ROLES: 'users:manage_roles',

  KYC_READ: 'kyc:read',
  KYC_REVIEW: 'kyc:review',

  DEPOSITS_READ: 'deposits:read',
  DEPOSITS_APPROVE: 'deposits:approve',
  DEPOSITS_REJECT: 'deposits:reject',
  DEPOSITS_REQUEST_INFO: 'deposits:request_info',

  WITHDRAWALS_READ: 'withdrawals:read',
  WITHDRAWALS_APPROVE: 'withdrawals:approve',
  WITHDRAWALS_REJECT: 'withdrawals:reject',

  CONFLICTS_READ: 'conflicts:read',
  CONFLICTS_RESOLVE: 'conflicts:resolve',

  TRADES_READ: 'trades:read',
  TRADES_CLOSE: 'trades:close',

  TICKETS_READ: 'tickets:read',
  TICKETS_REPLY: 'tickets:reply',
  TICKETS_NOTES: 'tickets:notes',
  TICKETS_CLOSE: 'tickets:close',

  CHAT_READ: 'chat:read',
  CHAT_JOIN: 'chat:join',

  AUDIT_READ: 'audit:read',

  SETTINGS_READ: 'settings:read',
  SETTINGS_WRITE: 'settings:write',

  AI_USE: 'ai:use',

  DEVTOOLS_TRIGGER: 'devtools:trigger',
} as const;

export type PermissionKey = (typeof PermissionKeys)[keyof typeof PermissionKeys];

export interface PermissionDefinition {
  name: PermissionKey;
  label: string;
  description: string;
  module: string;
  action: string;
}

function def(
  name: PermissionKey,
  label: string,
  description: string,
): PermissionDefinition {
  const [module, action] = name.split(':');
  return { name, label, description, module: module!, action: action! };
}

export const PermissionCatalog: PermissionDefinition[] = [
  def(PermissionKeys.DASHBOARD_READ, 'View dashboard', 'View the admin dashboard and system health', ),

  def(PermissionKeys.USERS_READ, 'View users', 'Search and view user profiles and timelines'),
  def(PermissionKeys.USERS_WRITE, 'Edit users', 'Update user details and status'),
  def(PermissionKeys.USERS_BLOCK, 'Block users', 'Block or unblock user accounts'),
  def(PermissionKeys.USERS_MANAGE_ROLES, 'Manage roles', 'Assign roles and edit the role permission matrix'),

  def(PermissionKeys.KYC_READ, 'View KYC', 'View KYC submissions and documents'),
  def(PermissionKeys.KYC_REVIEW, 'Review KYC', 'Approve or reject identity verification'),

  def(PermissionKeys.DEPOSITS_READ, 'View deposits', 'View deposit requests and receipts'),
  def(PermissionKeys.DEPOSITS_APPROVE, 'Approve deposits', 'Credit user balance by approving deposits'),
  def(PermissionKeys.DEPOSITS_REJECT, 'Reject deposits', 'Reject deposit requests'),
  def(PermissionKeys.DEPOSITS_REQUEST_INFO, 'Request deposit info', 'Ask users for more deposit evidence'),

  def(PermissionKeys.WITHDRAWALS_READ, 'View withdrawals', 'View withdrawal requests'),
  def(PermissionKeys.WITHDRAWALS_APPROVE, 'Approve withdrawals', 'Release approved withdrawal payouts'),
  def(PermissionKeys.WITHDRAWALS_REJECT, 'Reject withdrawals', 'Reject and refund withdrawal requests'),

  def(PermissionKeys.CONFLICTS_READ, 'View conflicts', 'View duplicate-reference conflicts'),
  def(PermissionKeys.CONFLICTS_RESOLVE, 'Resolve conflicts', 'Resolve conflicting deposits with justification'),

  def(PermissionKeys.TRADES_READ, 'View trades', 'View all user trades'),
  def(PermissionKeys.TRADES_CLOSE, 'Close trades', 'Force-close open trades as admin action'),

  def(PermissionKeys.TICKETS_READ, 'View tickets', 'View support tickets'),
  def(PermissionKeys.TICKETS_REPLY, 'Reply to tickets', 'Respond to support tickets'),
  def(PermissionKeys.TICKETS_NOTES, 'Add internal notes', 'Add staff-only internal notes'),
  def(PermissionKeys.TICKETS_CLOSE, 'Close tickets', 'Resolve or close support tickets'),

  def(PermissionKeys.CHAT_READ, 'View live chats', 'See the live chat inbox'),
  def(PermissionKeys.CHAT_JOIN, 'Join live chats', 'Answer users in live support chat'),

  def(PermissionKeys.AUDIT_READ, 'View audit logs', 'Read the immutable audit log'),

  def(PermissionKeys.SETTINGS_READ, 'View settings', 'View system settings'),
  def(PermissionKeys.SETTINGS_WRITE, 'Edit settings', 'Change system settings'),

  def(PermissionKeys.AI_USE, 'Use AI assistant', 'Use the staff AI assistant and AI analyses'),

  def(PermissionKeys.DEVTOOLS_TRIGGER, 'Trigger demo scenarios', 'Fire demo/chaos scenarios (feed pause, AI outage)'),
];

/** In-code default role -> permissions mapping (also seeded to DB on bootstrap). */
export const RolePermissions: Record<RoleName, string[]> = {
  [Roles.SUPER_ADMIN]: [PermissionWildcard],
  [Roles.FINANCE_REVIEWER]: [
    PermissionKeys.DASHBOARD_READ,
    PermissionKeys.USERS_READ,
    PermissionKeys.DEPOSITS_READ,
    PermissionKeys.DEPOSITS_APPROVE,
    PermissionKeys.DEPOSITS_REJECT,
    PermissionKeys.DEPOSITS_REQUEST_INFO,
    PermissionKeys.WITHDRAWALS_READ,
    PermissionKeys.WITHDRAWALS_APPROVE,
    PermissionKeys.WITHDRAWALS_REJECT,
    PermissionKeys.CONFLICTS_READ,
    PermissionKeys.CONFLICTS_RESOLVE,
    PermissionKeys.TRADES_READ,
    PermissionKeys.AI_USE,
  ],
  [Roles.KYC_REVIEWER]: [
    PermissionKeys.DASHBOARD_READ,
    PermissionKeys.USERS_READ,
    PermissionKeys.KYC_READ,
    PermissionKeys.KYC_REVIEW,
    PermissionKeys.AI_USE,
  ],
  [Roles.SUPPORT_AGENT]: [
    PermissionKeys.DASHBOARD_READ,
    PermissionKeys.USERS_READ,
    PermissionKeys.KYC_READ,
    PermissionKeys.DEPOSITS_READ,
    PermissionKeys.WITHDRAWALS_READ,
    PermissionKeys.TRADES_READ,
    PermissionKeys.TICKETS_READ,
    PermissionKeys.TICKETS_REPLY,
    PermissionKeys.TICKETS_NOTES,
    PermissionKeys.TICKETS_CLOSE,
    PermissionKeys.CHAT_READ,
    PermissionKeys.CHAT_JOIN,
    PermissionKeys.AI_USE,
  ],
  [Roles.USER]: [],
};

export const PermissionValues: string[] = PermissionCatalog.map((p) => p.name);
