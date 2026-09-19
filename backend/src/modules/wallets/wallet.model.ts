import mongoose, { Schema } from 'mongoose';
import { WalletTypes, type WalletType } from '../../constants/index.js';

export interface WalletDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: WalletType;
  available: number; // paisa
  reserved: number; // paisa
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<WalletDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(WalletTypes), required: true },
    available: { type: Number, default: 0, min: 0 },
    reserved: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

WalletSchema.index({ userId: 1, type: 1 }, { unique: true });

export const Wallet = mongoose.model<WalletDoc>('Wallet', WalletSchema);

/** Provision MAIN + DEMO wallets for a user (idempotent). */
export async function ensureWallets(userId: mongoose.Types.ObjectId, session?: mongoose.ClientSession) {
  for (const type of [WalletTypes.MAIN, WalletTypes.DEMO]) {
    const exists = await Wallet.findOne({ userId, type }).session(session ?? null);
    if (!exists) {
      await Wallet.create([{ userId, type, available: 0, reserved: 0 }], { session });
    }
  }
}

/** Extra virtual funds for the demo wallet on first provision. */
export const DEMO_WALLET_STARTING_BALANCE_PAISA = 100000 * 100;
