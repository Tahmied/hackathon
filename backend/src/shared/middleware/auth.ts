import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  fetchUserWithPermissions,
  type AuthUser,
} from '../utils/permissionHelpers.js';

export interface AccessPayload {
  userId: string;
  role: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    return jwt.verify(token, env.ACCESS_TOKEN_KEY) as AccessPayload;
  } catch {
    return null;
  }
}

export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token required');
  }
  const token = header.slice(7);
  const decoded = verifyAccessToken(token);
  if (!decoded) throw ApiError.unauthorized('Invalid or expired access token');

  const user = await fetchUserWithPermissions(decoded.userId);
  if (!user) throw ApiError.unauthorized('User not found or blocked');

  // Tokens issued before a password change are stale
  if (
    user.passwordChangedAt &&
    decoded.iat &&
    decoded.iat * 1000 < new Date(user.passwordChangedAt).getTime() - 1000
  ) {
    throw ApiError.unauthorized('Password changed recently, please login again');
  }

  req.user = user;
  next();
});

export type { AuthUser };
