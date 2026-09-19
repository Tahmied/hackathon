import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { RefreshSession } from '../../modules/auth/refreshSession.model.js';
import { User } from '../../modules/auth/user.model.js';
import { redisSet } from '../../config/redis.js';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface DeviceMeta {
  ip?: string;
  userAgent?: string;
}

function refreshExpiryDate(): Date {
  const numeric = parseInt(env.REFRESH_TOKEN_EXPIRY, 10); // '7d' → 7, '720m' → 720
  const looksLikeDays = env.REFRESH_TOKEN_EXPIRY.endsWith('d');
  const ms = looksLikeDays
    ? numeric * 24 * 60 * 60 * 1000
    : Number.isFinite(numeric)
      ? numeric * 60 * 1000
      : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export async function issueTokens(
  payload: { userId: string; email: string; role: string },
  meta: DeviceMeta = {},
): Promise<TokenPair> {
  const accessToken = jwt.sign(
    payload,
    env.ACCESS_TOKEN_KEY,
    { expiresIn: env.ACCESS_TOKEN_EXPIRY } as jwt.SignOptions,
  );
  const refreshToken = jwt.sign(
    { userId: payload.userId, type: 'refresh' },
    env.REFRESH_TOKEN_KEY,
    { expiresIn: env.REFRESH_TOKEN_EXPIRY } as jwt.SignOptions,
  );

  await RefreshSession.create({
    userId: payload.userId,
    tokenHash: sha256(refreshToken),
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: refreshExpiryDate(),
  });

  return { accessToken, refreshToken };
}

/** Rotate: revoke the presented session, issue a fresh pair. Detects reuse. */
export async function rotateRefreshToken(
  rawRefreshToken: string,
  meta: DeviceMeta = {},
): Promise<TokenPair> {
  let payload: { userId: string; type?: string };
  try {
    payload = jwt.verify(rawRefreshToken, env.REFRESH_TOKEN_KEY) as { userId: string; type?: string };
  } catch {
    throw ApiError.unauthorized('Invalid refresh token');
  }
  if (payload.type !== 'refresh') throw ApiError.unauthorized('Invalid token type');

  const hash = sha256(rawRefreshToken);
  const session = await RefreshSession.findOne({ tokenHash: hash });
  if (!session) throw ApiError.unauthorized('Refresh session not found');

  if (session.revokedAt) {
    // Token reuse detected — revoke everything for this user
    await RefreshSession.updateMany(
      { userId: session.userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    throw ApiError.unauthorized('Refresh token reuse detected. Please login again.');
  }
  if (session.expiresAt < new Date()) throw ApiError.unauthorized('Refresh token expired');

  session.revokedAt = new Date();
  await session.save();
  const user = await User.findById(payload.userId).select('email role');
  return issueTokens({ userId: payload.userId, email: user?.email ?? '', role: user?.role ?? 'user' }, meta);
}

export async function revokeRefreshToken(rawRefreshToken: string) {
  await RefreshSession.updateOne(
    { tokenHash: sha256(rawRefreshToken), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId: string) {
  await RefreshSession.updateMany(
    { userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function blacklistAccessToken(token: string) {
  const payload = jwt.decode(token) as { exp?: number } | null;
  const ttl = payload?.exp ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 10) : 900;
  await redisSet(`blacklist:access:${sha256(token)}`, '1', ttl);
}

export async function isAccessTokenBlacklisted(token: string): Promise<boolean> {
  const { redisGet } = await import('../../config/redis.js');
  return (await redisGet(`blacklist:access:${sha256(token)}`)) === '1';
}
