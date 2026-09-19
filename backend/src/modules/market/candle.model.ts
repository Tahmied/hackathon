import mongoose, { Schema } from 'mongoose';

export interface CandleDoc {
  _id: mongoose.Types.ObjectId;
  symbol: string;
  interval: string; // '1m' | '5m' | '15m'
  openTime: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
}

const CandleSchema = new Schema<CandleDoc>(
  {
    symbol: { type: String, required: true },
    interval: { type: String, required: true },
    openTime: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    ticks: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

CandleSchema.index({ symbol: 1, interval: 1, openTime: 1 }, { unique: true });

export const Candle = mongoose.model<CandleDoc>('Candle', CandleSchema);
