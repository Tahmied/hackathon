import mongoose, { Schema } from 'mongoose';
import {
  CloseReasons,
  TradeSides,
  TradeStatuses,
  type CloseReason,
  type TradeSide,
  type TradeStatus,
} from '../../constants/index.js';

export interface TradeDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  walletType: 'MAIN' | 'DEMO';
  symbol: string;
  side: TradeSide;
  margin: number; // paisa reserved
  leverage: number;
  entryPrice: number;
  closePrice?: number;
  pnl?: number; // paisa (credited/debited at close)
  status: TradeStatus;
  closeReason?: CloseReason;
  closedBy?: mongoose.Types.ObjectId;
  openedAt: Date;
  closedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TradeSchema = new Schema<TradeDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    walletType: { type: String, enum: ['MAIN', 'DEMO'], required: true },
    symbol: { type: String, required: true, index: true },
    side: { type: String, enum: Object.values(TradeSides), required: true },
    margin: { type: Number, required: true, min: 1 },
    leverage: { type: Number, required: true, min: 1, max: 100 },
    entryPrice: { type: Number, required: true },
    closePrice: { type: Number },
    pnl: { type: Number },
    status: { type: String, enum: Object.values(TradeStatuses), default: TradeStatuses.OPEN, index: true },
    closeReason: { type: String, enum: Object.values(CloseReasons) },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { timestamps: true },
);

TradeSchema.index({ userId: 1, status: 1 });

export const Trade = mongoose.model<TradeDoc>('Trade', TradeSchema);
