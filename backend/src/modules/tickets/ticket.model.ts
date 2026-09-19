import mongoose, { Schema } from 'mongoose';
import { TicketStatuses, type TicketStatus } from '../../constants/index.js';

export interface TicketMessage {
  senderId?: mongoose.Types.ObjectId;
  senderRole: string; // 'user' | staff role | 'system'
  senderName: string;
  body: string;
  attachments?: string[];
  isInternalNote?: boolean;
  createdAt: Date;
}

export interface TicketDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  subject: string;
  status: TicketStatus;
  messages: TicketMessage[];
  linkedTransactionIds: mongoose.Types.ObjectId[];
  assignedTo?: mongoose.Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema = new Schema<TicketDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: Object.values(TicketStatuses), default: TicketStatuses.OPEN, index: true },
    messages: [
      {
        senderId: { type: Schema.Types.ObjectId, ref: 'User' },
        senderRole: { type: String, required: true },
        senderName: { type: String, required: true },
        body: { type: String, required: true, maxlength: 5000 },
        attachments: { type: [String], default: [] },
        isInternalNote: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    linkedTransactionIds: [{ type: Schema.Types.ObjectId, ref: 'Transaction' }],
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

export const Ticket = mongoose.model<TicketDoc>('Ticket', TicketSchema);
