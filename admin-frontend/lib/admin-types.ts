import type { TransactionView } from './types';

export interface AdminDashboard {
  actionCenter: {
    pendingKyc: number;
    pendingDeposits: number;
    pendingWithdrawals: number;
    openTickets: number;
    activeChats: number;
    openTrades: number;
    totalUsers: number;
    conflictDeposits: number;
  };
  systemHealth: {
    market: {
      stale: boolean;
      paused: boolean;
      lastTickAt: string;
      latencyMs: number;
      assets: { symbol: string; price: number }[];
    };
    ai: {
      configured: boolean;
      model: string;
      lastErrorAt: string | null;
      lastErrorMessage: string | null;
      simulatedOutage: boolean;
    };
    redis: string;
    websocket: { onlineSockets: number };
  };
  alerts: SystemAlertView[];
}

export interface SystemAlertView {
  _id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
  resolvedAt?: string;
}

export interface AdminUserView {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  kycStatus: string;
  isActive: boolean;
  createdAt: string;
  wallets?: { type: string; availableBdt?: number; available: number; reserved: number }[];
}

export interface KycAdminView {
  _id: string;
  userId: { _id: string; name: string; email: string; kycStatus?: string; phone?: string };
  docType: string;
  fullNameOnDoc?: string;
  docNumber?: string;
  frontUrl: string;
  backUrl?: string;
  ocrText?: string;
  ocrConfidence?: number;
  ocrUnclear?: boolean;
  extractedName?: string | null;
  aiAnalysis?: {
    available: boolean;
    reason?: string;
    nameMatch?: boolean | null;
    issues?: string[];
    summary?: string;
  };
  status: string;
  createdAt: string;
}

export interface AdminTicketView {
  _id: string;
  subject: string;
  status: string;
  userId?: { _id: string; name: string; email: string; kycStatus?: string };
  messages: {
    senderName: string;
    senderRole: string;
    body: string;
    isInternalNote?: boolean;
    createdAt: string;
  }[];
  updatedAt: string;
}

export interface TicketContext {
  user?: { name: string; email: string; kycStatus?: string; createdAt: string };
  transactions: TransactionView[];
  trades: {
    _id: string;
    symbol: string;
    side: string;
    margin: number;
    status: string;
    pnl?: number;
    createdAt: string;
  }[];
}

export interface AuditLogView {
  _id: string;
  actorId?: { _id: string; name: string; email: string; role: string };
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: string;
}

export interface RoleMatrixData {
  roles: { name: string; label: string; rank: number; isSystem: boolean }[];
  permissions: { name: string; label: string; description?: string; module: string; action: string }[];
  rolePermissions: Record<string, string[]>;
}

export interface ConflictGroupView {
  conflictGroupId: string;
  deposits: (TransactionView & { userId: { _id: string; name: string; email: string } })[];
}

export interface TimelineEventView {
  at: string;
  kind: string;
  label: string;
  ref?: string;
  detail?: Record<string, unknown>;
}
