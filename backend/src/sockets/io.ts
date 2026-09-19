import { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { verifyAccessToken } from '../shared/middleware/auth.js';
import { fetchUserWithPermissions, type AuthUser } from '../shared/utils/permissionHelpers.js';
import { logger } from '../shared/utils/logger.js';
import { StaffRoles } from '../constants/roles.js';

let io: Server | null = null;
const userSockets = new Map<string, AuthUser>();

export function getIO(): Server | null {
  return io;
}

export function getOnlineUser(userId: string): AuthUser | undefined {
  return userSockets.get(userId);
}

interface SocketWithUser extends Socket {
  data: { user?: AuthUser };
}

export function initSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    pingTimeout: 20000,
  });

  io.use(async (socket: SocketWithUser, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Authentication required'));
      const payload = verifyAccessToken(token);
      if (!payload) return next(new Error('Invalid or expired token'));
      const user = await fetchUserWithPermissions(payload.userId);
      if (!user) return next(new Error('User not found or blocked'));
      socket.data.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: SocketWithUser) => {
    const user = socket.data.user;
    if (!user) return;
    userSockets.set(user.id, user);
    logger.debug({ user: user.email }, 'socket connected');

    socket.join('market');
    socket.join(`user:${user.id}`);

    if (StaffRoles.includes(user.role)) {
      socket.join('staff');
    }

    socket.on('market:subscribe', (symbols?: string[]) => {
      if (Array.isArray(symbols) && symbols.length > 0) {
        for (const s of symbols) socket.join(`market:${s}`);
      }
    });

    socket.on('disconnect', () => {
      userSockets.delete(user.id);
      logger.debug({ user: user.email }, 'socket disconnected');
    });
  });

  logger.info('socket.io initialized');
  return io;
}
