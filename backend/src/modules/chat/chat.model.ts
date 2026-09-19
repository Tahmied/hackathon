import mongoose, { Schema } from 'mongoose';
import {
  ChatSenderTypes,
  ConversationChannels,
  ConversationStatuses,
  type ChatSenderType,
  type ConversationChannel,
  type ConversationStatus,
} from '../../constants/index.js';

export interface ToolTraceStep {
  thought: string;
  tool?: string;
  args?: Record<string, unknown>;
  resultSummary?: string;
}

export interface ConversationDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  channel: ConversationChannel;
  status: ConversationStatus;
  joinedStaff: mongoose.Types.ObjectId[];
  subject?: string;
  linkedTicketId?: mongoose.Types.ObjectId;
  lastMessage?: string;
  lastMessageAt: Date;
  lastMessageBy?: ChatSenderType;
  unreadForStaff: number;
  unreadForUser: number;
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<ConversationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channel: { type: String, enum: Object.values(ConversationChannels), default: ConversationChannels.AI },
    status: { type: String, enum: Object.values(ConversationStatuses), default: ConversationStatuses.BOT },
    joinedStaff: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    subject: { type: String },
    linkedTicketId: { type: Schema.Types.ObjectId, ref: 'Ticket' },
    lastMessage: { type: String },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageBy: { type: String, enum: Object.values(ChatSenderTypes) },
    unreadForStaff: { type: Number, default: 0 },
    unreadForUser: { type: Number, default: 0 },
  },
  { timestamps: true },
);

ConversationSchema.index({ status: 1, lastMessageAt: -1 });

export const Conversation = mongoose.model<ConversationDoc>('Conversation', ConversationSchema);

export interface ChatMessageDoc {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderType: ChatSenderType;
  senderId?: mongoose.Types.ObjectId;
  senderName: string;
  body: string;
  attachments?: string[];
  toolTrace?: ToolTraceStep[];
  aiUnavailable?: boolean;
  createdAt: Date;
}

const ChatMessageSchema = new Schema<ChatMessageDoc>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderType: { type: String, enum: Object.values(ChatSenderTypes), required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, required: true },
    body: { type: String, required: true, maxlength: 5000 },
    attachments: { type: [String], default: [] },
    toolTrace: [
      {
        thought: { type: String },
        tool: { type: String },
        args: { type: Schema.Types.Mixed },
        resultSummary: { type: String },
      },
    ],
    aiUnavailable: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ChatMessageSchema.index({ conversationId: 1, createdAt: 1 });

export const ChatMessage = mongoose.model<ChatMessageDoc>('ChatMessage', ChatMessageSchema);
