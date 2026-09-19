import mongoose, { Schema } from 'mongoose';

export interface AuditLogDoc {
  _id: mongoose.Types.ObjectId;
  actorId?: mongoose.Types.ObjectId;
  actorRole?: string;
  action: string; // e.g. 'deposit.approved', 'role.permissions_replaced', 'system.market_stale'
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String },
    action: { type: String, required: true, index: true },
    targetType: { type: String },
    targetId: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Timeline queries: everything for one target user, chronological
AuditLogSchema.index({ 'metadata.userId': 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model<AuditLogDoc>('AuditLog', AuditLogSchema);

export interface AuditEntry {
  actorId?: mongoose.Types.ObjectId | string;
  actorRole?: string;
  action: string;
  targetType?: string;
  targetId?: string | mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/** Append-only. Never update or delete. */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({
      ...entry,
      targetId: entry.targetId ? String(entry.targetId) : undefined,
    });
  } catch {
    // audit must never break the main flow
  }
}
