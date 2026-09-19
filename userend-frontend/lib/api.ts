'use client';

import axios, { AxiosError } from 'axios';
import type { Session } from 'next-auth';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

/** Module-level session token store, kept fresh by <AuthGate>. */
let currentSession: Session | null = null;
let sessionRefetch: (() => Promise<Session | null>) | null = null;

export function setApiSession(session: Session | null, refetch?: () => Promise<Session | null>) {
  currentSession = session;
  if (refetch) sessionRefetch = refetch;
}

export function getAccessToken(): string | undefined {
  return currentSession?.accessToken;
}

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'content-type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | undefined> | null = null;

async function refreshAccessToken(): Promise<string | undefined> {
  if (!sessionRefetch) return undefined;
  // Triggers the NextAuth jwt callback server-side, which rotates the token
  const session = await sessionRefetch();
  currentSession = session;
  return session?.accessToken;
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      try {
        refreshing = refreshing ?? refreshAccessToken().finally(() => (refreshing = null));
        const newToken = await refreshing;
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api.request(original);
        }
      } catch {
        /* fallthrough */
      }
    }
    return Promise.reject(error);
  },
);

export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Cannot reach the trading server — it may be restarting. Check your positions before retrying.';
    }
    const data = error.response?.data as { message?: string; code?: string } | undefined;
    if (data?.code === 'MARKET_STALE') return 'Market data is delayed. Trading is temporarily paused.';
    return data?.message ?? error.message;
  }
  return 'Something went wrong';
}
