import { ApiError } from '../../shared/utils/ApiError.js';
import { Conversation, ChatMessage, type ToolTraceStep } from './chat.model.js';
import { ConversationStatuses, ChatSenderTypes, SocketEvents, ConversationChannels } from '../../constants/index.js';
import { getIO } from '../../sockets/io.js';
import { StaffRoles } from '../../constants/roles.js';
import { toBdt } from '../../shared/utils/money.js';

export async function getOrCreateConversation(userId: string, channel: 'AI' | 'HUMAN' = 'AI') {
  // Reuse the most recent non-closed conversation for the channel
  let conversation = await Conversation.findOne({
    userId,
    channel,
    status: { $ne: ConversationStatuses.CLOSED },
  }).sort({ lastMessageAt: -1 });

  if (!conversation) {
    conversation = await Conversation.create({
      userId,
      channel,
      status: channel === ConversationChannels.AI ? ConversationStatuses.BOT : ConversationStatuses.HUMAN,
      lastMessageAt: new Date(),
    });
    const io = getIO();
    io?.to('staff').emit(SocketEvents.CONVERSATION_NEW, {
      conversationId: conversation._id.toString(),
      channel,
    });
  }
  return conversation;
}

export async function listForUser(userId: string) {
  return Conversation.find({ userId, status: { $ne: ConversationStatuses.CLOSED } })
    .sort({ lastMessageAt: -1 })
    .lean();
}

export async function listForStaff() {
  const conversations = await Conversation.find({ status: { $ne: ConversationStatuses.CLOSED } })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .populate('userId', 'name email avatarUrl kycStatus role')
    .lean();
  return conversations;
}

async function assertAccess(conversation: { userId: unknown; joinedStaff: unknown[] }, user: { id: string; roleRank: number }) {
  const isOwner = String(conversation.userId) === user.id;
  const isStaff = user.roleRank >= 20;
  if (!isOwner && !isStaff) throw ApiError.forbidden('Not allowed to access this conversation');
}

export async function getMessages(conversationId: string, user: { id: string; roleRank: number }) {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(conversation, user);
  const messages = await ChatMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(200)
    .lean();
  return { conversation, messages };
}

export interface SendMessageResult {
  conversationId: string;
  messageId: string;
  senderType: string;
}

export async function sendMessage(
  conversationId: string,
  sender: { id: string; name: string; role: string; roleRank: number },
  input: { body: string; attachments?: string[] },
): Promise<SendMessageResult> {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  await assertAccess(conversation, sender);

  const isOwner = String(conversation.userId) === sender.id;
  const senderType = isOwner ? ChatSenderTypes.USER : ChatSenderTypes.AGENT;

  const message = await ChatMessage.create({
    conversationId,
    senderType,
    senderId: sender.id,
    senderName: sender.name,
    body: input.body,
    attachments: input.attachments ?? [],
  });

  conversation.lastMessage = input.body.slice(0, 140);
  conversation.lastMessageAt = new Date();
  conversation.lastMessageBy = senderType;
  if (!isOwner) {
    conversation.unreadForUser += 1;
    if (!conversation.joinedStaff.some((s) => String(s) === sender.id)) {
      conversation.joinedStaff.push(sender.id as never);
    }
    if (conversation.status === ConversationStatuses.BOT) {
      conversation.status = ConversationStatuses.HUMAN;
    }
  } else {
    // Staff inbox pings are for live-support conversations only —
    // AI (BOT) chats never notify or count as staff unread.
    const isLiveSupport =
      conversation.channel === ConversationChannels.HUMAN ||
      conversation.status === ConversationStatuses.HUMAN;
    conversation.lastMessageBy = senderType;
    if (isLiveSupport) {
      conversation.unreadForStaff += 1;
    }
  }
  await conversation.save();

  const io = getIO();
  const payload = {
    id: message._id.toString(),
    conversationId,
    senderType,
    senderName: sender.name,
    body: message.body,
    attachments: message.attachments,
    createdAt: message.createdAt,
  };
  io?.to(`chat:${conversationId}`).emit(SocketEvents.CHAT_MESSAGE, payload);
  // Fallback channel: the user's personal room is joined at socket connect time,
  // so staff replies are delivered even if a chat-room join was missed.
  if (senderType === ChatSenderTypes.AGENT) {
    io?.to(`user:${conversation.userId}`).emit(SocketEvents.CHAT_MESSAGE, payload);
  }

  // Staff inbox notification (sound + badge on admin panel) — live support only
  if (isOwner && conversation.status === ConversationStatuses.HUMAN) {
    io?.to('staff').emit(SocketEvents.CONVERSATION_UPDATED, {
      conversationId,
      lastMessage: conversation.lastMessage,
      unreadForStaff: conversation.unreadForStaff,
      userId: String(conversation.userId),
    });
    io?.to('staff').emit('chat:notify', {
      conversationId,
      from: sender.name,
      preview: input.body.slice(0, 100),
    });
  }

  // Auto AI reply for BOT-status conversations
  if (
    isOwner &&
    conversation.channel === ConversationChannels.AI &&
    conversation.status === ConversationStatuses.BOT &&
    conversation.joinedStaff.length === 0
  ) {
    void triggerAiReply(conversationId, String(conversation.userId), input.body);
  }

  return { conversationId, messageId: message._id.toString(), senderType };
}

async function triggerAiReply(conversationId: string, userId: string, userMessage: string) {
  const io = getIO();
  try {
    const { generateAssistantReply } = await import('../ai/ai.service.js');
    await generateAssistantReply({ conversationId, userId, userMessage });
  } catch {
    const fallback = await ChatMessage.create({
      conversationId,
      senderType: ChatSenderTypes.AI,
      senderName: 'Nova AI',
      body: 'AI Assistant is currently offline. Please contact human support — a live agent will be with you shortly.',
      aiUnavailable: true,
    });
    const payload = {
      id: fallback._id.toString(),
      conversationId,
      senderType: 'AI' as const,
      senderName: 'Nova AI',
      body: fallback.body,
      aiUnavailable: true,
      createdAt: fallback.createdAt,
    };
    io?.to(`chat:${conversationId}`).emit(SocketEvents.CHAT_MESSAGE, payload);
    io?.to(`user:${userId}`).emit(SocketEvents.CHAT_MESSAGE, payload);
  }
}

export async function escalateToHuman(conversationId: string, userId: string) {
  const conversation = await Conversation.findOne({ _id: conversationId, userId });
  if (!conversation) throw ApiError.notFound('Conversation not found');
  if (conversation.status === ConversationStatuses.CLOSED) throw ApiError.badRequest('Conversation closed');

  conversation.status = ConversationStatuses.HUMAN;
  conversation.channel = ConversationChannels.HUMAN;
  await conversation.save();

  const systemMsg = await ChatMessage.create({
    conversationId,
    senderType: ChatSenderTypes.SYSTEM,
    senderName: 'System',
    body: 'You are being connected to a human support agent…',
  });

  const io = getIO();
  const systemPayload = {
    id: systemMsg._id.toString(),
    conversationId,
    senderType: 'SYSTEM' as const,
    senderName: 'System',
    body: systemMsg.body,
    createdAt: systemMsg.createdAt,
  };
  io?.to(`chat:${conversationId}`).emit(SocketEvents.CHAT_MESSAGE, systemPayload);
  io?.to(`user:${userId}`).emit(SocketEvents.CHAT_MESSAGE, systemPayload);
  io?.to('staff').emit(SocketEvents.CONVERSATION_NEW, {
    conversationId,
    channel: 'HUMAN',
    userId,
    preview: conversation.lastMessage,
  });

  return conversation;
}

export async function markRead(conversationId: string, user: { id: string; roleRank: number }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  const isStaff = user.roleRank >= 20;
  if (isStaff) conversation.unreadForStaff = 0;
  else conversation.unreadForUser = 0;
  await conversation.save();
  return conversation;
}

export async function closeConversation(conversationId: string, user: { id: string; roleRank: number }) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found');
  const isStaff = user.roleRank >= 20;
  const isOwner = String(conversation.userId) === user.id;
  if (!isStaff && !isOwner) throw ApiError.forbidden('Not allowed');
  conversation.status = ConversationStatuses.CLOSED;
  await conversation.save();
  getIO()?.to(`chat:${conversationId}`).emit(SocketEvents.CONVERSATION_UPDATED, { conversationId, closed: true });
  return conversation;
}

/** Summary card for the staff inbox rows. */
export async function conversationSummaries(conversations: Awaited<ReturnType<typeof listForStaff>>) {
  return conversations.map((c) => ({
    ...c,
    user: c.userId as unknown as { name: string; email: string; kycStatus?: string },
  }));
}

export function summarizeTrace(trace: ToolTraceStep[]): string[] {
  return trace.map((t) => t.tool ? `${t.tool}() → ${t.resultSummary ?? 'ok'}` : 'thought');
}

export function formatPaisaSummary(paisa: number): string {
  return `৳${toBdt(paisa).toFixed(2)}`;
}
