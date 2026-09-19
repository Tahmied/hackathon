import mongoose, { Schema } from 'mongoose';
import {
  PaymentMethods,
  TransactionStatuses,
  TransactionTypes,
  type PaymentMethod,
  type TransactionStatus,
  type TransactionType,
} from '../../constants/index.js';

export interface OcrExtracted {
  amount?: number | null; // paisa
  reference?: string | null;
  payer?: string | null;
  date?: string | null;
  rawConfidence?: number;
}

export interface AiAnalysis {
  available: boolean;
  reason?: string;
  verdict?: 'MATCH' | 'MISMATCH' | 'UNCLEAR';
  issues?: string[];
  summary?: string;
  analyzedAt?: Date;
}

export interface TransactionDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  walletId: mongoose.Types.ObjectId;
  walletType: 'MAIN' | 'DEMO';
  type: TransactionType;
  amount: number; // paisa
  method: PaymentMethod;
  accountNumber?: string;
  reference: string;
  receiptUrl?: string;
  ocrText?: string;
  ocrConfidence?: number;
  ocrUnclear?: boolean;
  extractedData?: OcrExtracted;
  aiAnalysis?: AiAnalysis;
  status: TransactionStatus;
  conflictGroupId?: string;
  conflictWith?: mongoose.Types.ObjectId[];
  processedBy?: mongoose.Types.ObjectId;
  processedAt?: Date;
  adminNote?: string;
  infoRequestNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<TransactionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    walletId: { type: Schema.Types.ObjectId, ref: 'Wallet', required: true },
    walletType: { type: String, enum: ['MAIN', 'DEMO'], required: true },
    type: { type: String, enum: Object.values(TransactionTypes), required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: PaymentMethods, required: true },
    accountNumber: { type: String },
    reference: { type: String, required: true, index: true },
    receiptUrl: { type: String },
    ocrText: { type: String },
    ocrConfidence: { type: Number },
    ocrUnclear: { type: Boolean, default: false },
    extractedData: {
      amount: { type: Number, default: null },
      reference: { type: String, default: null },
      payer: { type: String, default: null },
      date: { type: String, default: null },
      rawConfidence: { type: Number },
    },
    aiAnalysis: {
      available: { type: Boolean, default: false },
      reason: { type: String },
      verdict: { type: String, enum: ['MATCH', 'MISMATCH', 'UNCLEAR'] },
      issues: { type: [String], default: [] },
      summary: { type: String },
      analyzedAt: { type: Date },
    },
    status: {
      type: String,
      enum: Object.values(TransactionStatuses),
      default: TransactionStatuses.PENDING,
      index: true,
    },
    conflictGroupId: { type: String, index: true },
    conflictWith: { type: [Schema.Types.ObjectId], ref: 'Transaction', default: undefined },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: { type: Date },
    adminNote: { type: String },
    infoRequestNote: { type: String },
  },
  { timestamps: true },
);

TransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, type: 1 });

export const Transaction = mongoose.model<TransactionDoc>('Transaction', TransactionSchema);
