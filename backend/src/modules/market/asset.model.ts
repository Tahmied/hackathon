import mongoose, { Schema } from 'mongoose';
import { AssetCategories, type AssetCategory } from '../../constants/index.js';

export interface AssetDoc {
  _id: mongoose.Types.ObjectId;
  symbol: string; // BTC/USD
  name: string;
  category: AssetCategory;
  basePrice: number; // USD price for crypto/commodities, BDT for pairs quoted in BDT
  quoteCurrency: 'USD' | 'BDT';
  usdBdtRate: number; // conversion used to express USD asset margin in BDT
  volatility: number; // per-tick stdev fraction, e.g. 0.0008
  driftReversion: number; // pull back toward base price
  leverageOptions: number[];
  minMarginPaisa: number;
  maxMarginPaisa: number;
  lastPrice: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AssetSchema = new Schema<AssetDoc>(
  {
    symbol: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, enum: Object.values(AssetCategories), required: true },
    basePrice: { type: Number, required: true },
    quoteCurrency: { type: String, enum: ['USD', 'BDT'], default: 'USD' },
    usdBdtRate: { type: Number, default: 120 },
    volatility: { type: Number, default: 0.0008 },
    driftReversion: { type: Number, default: 0.002 },
    leverageOptions: { type: [Number], default: [1, 5, 10, 20] },
    minMarginPaisa: { type: Number, default: 100 * 100 },
    maxMarginPaisa: { type: Number, default: 500000 * 100 },
    lastPrice: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Asset = mongoose.model<AssetDoc>('Asset', AssetSchema);
