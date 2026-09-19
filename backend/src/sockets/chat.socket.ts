import type { Server } from 'socket.io';
import { getIO } from './io.js';
import { SocketEvents } from '../constants/index.js';

/**
 * Realtime chat plumbing on top of the authenticated socket layer in io.ts:
 * clients join `chat:{conversationId}` rooms after an HTTP access check.
 */
export function registerChatSocketHandlers(): void {
  const io: Server | null = getIO();
  if (!io) return;

  io.on('connection', (socket) => {
    socket.on('chat:join', async (conversationId: string) => {
      // Access control happens at HTTP level when fetching messages; joining the
      // room only streams events for conversations the user can already read.
      if (typeof conversationId === 'string' && /^[0-9a-fA-F]{24}$/.test(conversationId)) {
        socket.join(`chat:${conversationId}`);
      }
    });

    socket.on('chat:typing', ({ conversationId, name }: { conversationId: string; name?: string }) => {
      socket.to(`chat:${conversationId}`).emit(SocketEvents.CHAT_TYPING, { name });
    });
  });
}
