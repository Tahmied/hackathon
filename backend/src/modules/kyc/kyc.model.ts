import mongoose, { Schema } from 'mongoose';

export interface KycSubmissionDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  docType: 'NID' | 'PASSPORT' | 'DRIVING_LICENSE';
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
    analyzedAt?: Date;
  };
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  reviewComment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const KycSubmissionSchema = new Schema<KycSubmissionDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    docType: { type: String, enum: ['NID', 'PASSPORT', 'DRIVING_LICENSE'], required: true },
    fullNameOnDoc: { type: String },
    docNumber: { type: String },
    frontUrl: { type: String, required: true },
    backUrl: { type: String },
    ocrText: { type: String },
    ocrConfidence: { type: Number },
    ocrUnclear: { type: Boolean, default: false },
    extractedName: { type: String, default: null },
    aiAnalysis: {
      available: { type: Boolean, default: false },
      reason: { type: String },
      nameMatch: { type: Boolean, default: null },
      issues: { type: [String], default: [] },
      summary: { type: String },
      analyzedAt: { type: Date },
    },
    status: { type: String, enum: ['PENDING', 'VERIFIED', 'REJECTED'], default: 'PENDING' },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    reviewComment: { type: String },
  },
  { timestamps: true },
);

export const KycSubmission = mongoose.model<KycSubmissionDoc>('KycSubmission', KycSubmissionSchema);
