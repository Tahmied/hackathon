'use client';

import { io, type Socket } from 'socket.io-client';
import { API_URL, getAccessToken } from './api';

let socket: Socket | null = null;
let pendingResolvers: ((s: Socket) => void)[] = [];
let pendingRejecters: ((e: Error) => void)[] = [];

function flushPending() {
  const resolvers = pendingResolvers;
  const rejecters = pendingRejecters;
  pendingResolvers = [];
  pendingRejecters = [];
  if (socket?.connected) resolvers.forEach((r) => r(socket!));
  else rejecters.forEach((r) => r(new Error('not connected')));
}

/**
 * Returns a connected, authenticated socket. Auth is re-evaluated on every
 * connect attempt (including auto-reconnects) so token rotation never breaks
 * the live channel. The socket keeps retrying in the background; callers get
 * either a connected socket or an error once the current attempt fails — and
 * can simply call getSocket() again later.
 */
export function getSocket(): Promise<Socket> {
  if (socket?.connected) return Promise.resolve(socket);

  if (!socket) {
    socket = io(API_URL, {
      auth: (cb) => cb({ token: getAccessToken() ?? '' }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socket.on('connect', () => {
      pendingResolvers.forEach((r) => r(socket!));
      pendingResolvers = [];
      pendingRejecters = [];
    });
    socket.on('connect_error', () => {
      // Typically a stale token — the HTTP layer refreshes it, so clear the
      // pending attempt; the next getSocket() call retries with a fresh token.
      if (pendingRejecters.length > 0) flushPending();
    });
  }

  return new Promise((resolve, reject) => {
    pendingResolvers.push(resolve);
    pendingRejecters.push(reject);
  });
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
  pendingResolvers = [];
  pendingRejecters = [];
}
