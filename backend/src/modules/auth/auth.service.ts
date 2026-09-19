import { env } from '../../config/env.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import { withTransaction } from '../../shared/db/connectDb.js';
import {
  ensureWallets,
  Wallet,
  DEMO_WALLET_STARTING_BALANCE_PAISA,
} from '../wallets/wallet.model.js';
import { User, hashPassword, type UserDoc } from './user.model.js';
import { RefreshSession } from './refreshSession.model.js';
import {
  issueTokens,
  revokeAllUserSessions,
  rotateRefreshToken,
  revokeRefreshToken,
  type TokenPair,
} from '../../shared/utils/token.service.js';
import { fetchUserWithPermissions, type AuthUser } from '../../shared/utils/permissionHelpers.js';
import { requestOtp, verifyOtp } from '../../shared/utils/otp.service.js';
import { OtpPurposes } from '../../constants/index.js';
import { logAudit } from '../audit/audit.model.js';

interface DeviceMeta {
  ip?: string;
  userAgent?: string;
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

async function issueForUser(user: UserDoc, meta: DeviceMeta): Promise<TokenPair> {
  return issueTokens(
    { userId: user._id.toString(), email: user.email, role: user.role },
    meta,
  );
}

async function assertNotLocked(user: UserDoc) {
  if (!user.isActive) throw ApiError.forbidden('Account is blocked. Contact support.');
  if (user.isLocked()) {
    throw ApiError.forbidden(
      `Account locked due to failed attempts. Try again after ${user.lockedUntil?.toISOString()}`,
    );
  }
}

async function registerFailedAttempt(user: UserDoc) {
  user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
  if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    user.failedLoginAttempts = 0;
  }
  await user.save();
}

export async function registerUser(
  input: { name: string; email: string; phone?: string; password: string },
  meta: DeviceMeta,
) {
  const existing = await User.findOne({ email: input.email.toLowerCase() });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await hashPassword(input.password);
  const user = await withTransaction(async (session) => {
    const [created] = await User.create(
      [
        {
          name: input.name,
          email: input.email.toLowerCase(),
          phone: input.phone,
          passwordHash,
          role: 'user',
          roleRank: 10,
        },
      ],
      { session },
    );
    await ensureWallets(created._id, session);
    // Every account starts with ৳100,000 in virtual demo funds
    await Wallet.updateOne(
      { userId: created._id, type: 'DEMO' },
      { $set: { available: DEMO_WALLET_STARTING_BALANCE_PAISA } },
      { session },
    );
    return created;
  });

  await logAudit({
    actorId: user._id,
    actorRole: user.role,
    action: 'auth.registered',
    targetType: 'user',
    targetId: user._id,
    metadata: { userId: user._id.toString(), email: user.email },
    ip: meta.ip,
  });

  const tokens = await issueForUser(user, meta);
  const authUser = await fetchUserWithPermissions(user._id.toString());
  return { tokens, user: authUser };
}

export async function loginUser(
  input: { email: string; password: string },
  meta: DeviceMeta,
) {
  const user = await User.findByEmailWithSecrets(input.email);
  if (!user) throw ApiError.unauthorized('Invalid email or password');
  await assertNotLocked(user);

  const ok = await user.comparePassword(input.password);
  if (!ok) {
    await registerFailedAttempt(user);
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.passwordHash) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
  }
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueForUser(user, meta);
  const authUser = await fetchUserWithPermissions(user._id.toString());
  await logAudit({
    actorId: user._id,
    actorRole: user.role,
    action: 'auth.login',
    targetType: 'user',
    targetId: user._id,
    metadata: { method: 'password' },
    ip: meta.ip,
  });
  return { tokens, user: authUser };
}

export async function refreshSession(
  refreshToken: string,
  meta: DeviceMeta,
): Promise<{ tokens: TokenPair; user: AuthUser | null }> {
  const tokens = await rotateRefreshToken(refreshToken, meta);
  const decoded = (await import('jsonwebtoken')).default.verify(
    tokens.accessToken,
    env.ACCESS_TOKEN_KEY,
  ) as { userId: string };
  const user = await fetchUserWithPermissions(decoded.userId);
  if (!user) throw ApiError.unauthorized('User not found or blocked');
  return { tokens, user };
}

export async function logoutUser(refreshToken: string, accessToken?: string) {
  await revokeRefreshToken(refreshToken);
  if (accessToken) {
    const { blacklistAccessToken } = await import('../../shared/utils/token.service.js');
    await blacklistAccessToken(accessToken);
  }
}

export async function requestLoginOtp(
  email: string,
  meta: DeviceMeta,
): Promise<{ sent: boolean }> {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Do not reveal whether the account exists for PASSWORD_RESET; for LOGIN we
  // also respond OK to avoid enumeration — email only sent when user exists.
  if (user) {
    const res = await requestOtp(email, OtpPurposes.LOGIN, { ip: meta.ip, ipLimit: true });
    await logAudit({
      actorId: user._id,
      actorRole: user.role,
      action: 'auth.otp_requested',
      targetType: 'user',
      targetId: user._id,
      metadata: { purpose: OtpPurposes.LOGIN },
      ip: meta.ip,
    });
    return { sent: res.sent };
  }
  return { sent: false };
}

export async function verifyLoginOtp(
  input: { email: string; code: string },
  meta: DeviceMeta,
) {
  await verifyOtp(input.email, OtpPurposes.LOGIN, input.code);
  const user = await User.findByEmailWithSecrets(input.email);
  if (!user) throw ApiError.unauthorized('Account not found');
  await assertNotLocked(user);
  user.emailVerified = true;
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueForUser(user, meta);
  const authUser = await fetchUserWithPermissions(user._id.toString());
  return { tokens, user: authUser };
}

export async function requestPasswordResetOtp(email: string, meta: DeviceMeta) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user) {
    await requestOtp(email, OtpPurposes.PASSWORD_RESET, { ip: meta.ip, ipLimit: true });
    await logAudit({
      actorId: user._id,
      action: 'auth.password_reset_requested',
      targetType: 'user',
      targetId: user._id,
      ip: meta.ip,
    });
  }
  return { sent: true }; // always true — anti-enumeration
}

export async function resetPassword(
  input: { email: string; code: string; newPassword: string },
  meta: DeviceMeta,
) {
  await verifyOtp(input.email, OtpPurposes.PASSWORD_RESET, input.code);
  const user = await User.findByEmailWithSecrets(input.email);
  if (!user) throw ApiError.notFound('Account not found');

  user.passwordHash = await hashPassword(input.newPassword);
  user.passwordChangedAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  await revokeAllUserSessions(user._id.toString());
  await logAudit({
    actorId: user._id,
    actorRole: user.role,
    action: 'auth.password_reset',
    targetType: 'user',
    targetId: user._id,
    ip: meta.ip,
  });
}

export async function googleLogin(
  input: { email: string; name: string; googleId: string; avatarUrl?: string; emailVerified?: boolean },
  meta: DeviceMeta,
) {
  let user = await User.findByEmailWithSecrets(input.email);
  if (!user) {
    user = await withTransaction(async (session) => {
      const [created] = await User.create(
        [
          {
            name: input.name,
            email: input.email.toLowerCase(),
            googleId: input.googleId,
            avatarUrl: input.avatarUrl,
            emailVerified: true,
            role: 'user',
            roleRank: 10,
          },
        ],
        { session },
      );
      const wallets = await ensureWallets(created._id, session);
      // Give a small demo balance so Google sign-ups can trade immediately
      await Wallet.updateOne(
        { userId: created._id, type: 'DEMO' },
        { $set: { available: DEMO_WALLET_STARTING_BALANCE_PAISA } },
        { session },
      );
      return created;
    });
    await logAudit({
      actorId: user._id,
      actorRole: user.role,
      action: 'auth.registered',
      targetType: 'user',
      targetId: user._id,
      metadata: { method: 'google' },
      ip: meta.ip,
    });
  } else {
    if (user.googleId && user.googleId !== input.googleId) {
      throw ApiError.conflict('This email is linked to a different Google account');
    }
    if (!user.googleId) {
      user.googleId = input.googleId;
      user.emailVerified = true;
    }
    user.lastLoginAt = new Date();
    await user.save();
    await ensureWallets(user._id);
  }

  await assertNotLocked(user);
  const tokens = await issueForUser(user, meta);
  const authUser = await fetchUserWithPermissions(user._id.toString());
  return { tokens, user: authUser };
}

export async function me(userId: string): Promise<AuthUser | null> {
  return fetchUserWithPermissions(userId);
}

export async function getUserSessionsCount(userId: string) {
  return RefreshSession.countDocuments({ userId, revokedAt: { $exists: false } });
}
