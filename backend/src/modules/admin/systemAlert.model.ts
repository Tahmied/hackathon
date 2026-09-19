import mongoose, { Schema } from 'mongoose';

export interface SystemAlertDoc {
  _id: mongoose.Types.ObjectId;
  type: string; // MARKET_STALE | DUPLICATE_REFERENCE | AI_OUTAGE | ...
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  data?: Record<string, unknown>;
  resolvedAt?: Date;
  createdAt: Date;
}

const SystemAlertSchema = new Schema<SystemAlertDoc>(
  {
    type: { type: String, required: true, index: true },
    severity: { type: String, enum: ['INFO', 'WARNING', 'CRITICAL'], default: 'WARNING' },
    message: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    resolvedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SystemAlertSchema.index({ createdAt: -1 });
SystemAlertSchema.index({ resolvedAt: 1 });

export const SystemAlert = mongoose.model<SystemAlertDoc>('SystemAlert', SystemAlertSchema);

export async function raiseAlert(
  type: string,
  severity: SystemAlertDoc['severity'],
  message: string,
  data?: Record<string, unknown>,
) {
  try {
    await SystemAlert.create({ type, severity, message, data });
  } catch {
    // alerts must never break the flow
  }
}
