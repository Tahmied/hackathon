import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { ApiError } from '../../shared/utils/ApiError.js';
import * as service from './auth.service.js';

function meta(req: { ip?: string; headers: Record<string, unknown> }) {
  return { ip: req.ip, userAgent: req.headers['user-agent'] as string | undefined };
}

function authPayload(res: { tokens: { accessToken: string; refreshToken: string }; user: unknown }) {
  return {
    accessToken: res.tokens.accessToken,
    refreshToken: res.tokens.refreshToken,
    user: res.user,
  };
}

export const authController = {
  register: asyncHandler(async (req, res) => {
    const result = await service.registerUser(req.validatedBody as never, meta(req));
    send(res, 201, authPayload(result), 'Account created');
  }),

  login: asyncHandler(async (req, res) => {
    const result = await service.loginUser(req.validatedBody as never, meta(req));
    send(res, 200, authPayload(result), 'Logged in');
  }),

  google: asyncHandler(async (req, res) => {
    const result = await service.googleLogin(req.validatedBody as never, meta(req));
    send(res, 200, authPayload(result), 'Logged in with Google');
  }),

  refresh: asyncHandler(async (req, res) => {
    const { refreshToken } = req.validatedBody as { refreshToken: string };
    const result = await service.refreshSession(refreshToken, meta(req));
    send(res, 200, authPayload(result), 'Token refreshed');
  }),

  logout: asyncHandler(async (req, res) => {
    const { refreshToken } = req.validatedBody as { refreshToken: string };
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    await service.logoutUser(refreshToken, accessToken);
    send(res, 200, { ok: true }, 'Logged out');
  }),

  me: asyncHandler(async (req, res) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await service.me(req.user.id);
    send(res, 200, { user });
  }),

  requestOtp: asyncHandler(async (req, res) => {
    const { email, purpose } = req.validatedBody as { email: string; purpose: 'LOGIN' | 'PASSWORD_RESET' };
    const result =
      purpose === 'LOGIN'
        ? await service.requestLoginOtp(email, meta(req))
        : await service.requestPasswordResetOtp(email, meta(req));
    send(res, 200, result, 'If the account exists, a code has been sent');
  }),

  verifyOtp: asyncHandler(async (req, res) => {
    const { email, code } = req.validatedBody as { email: string; code: string };
    const result = await service.verifyLoginOtp({ email, code }, meta(req));
    send(res, 200, authPayload(result), 'Logged in');
  }),

  resetPassword: asyncHandler(async (req, res) => {
    const body = req.validatedBody as { email: string; code: string; newPassword: string };
    await service.resetPassword(body, meta(req));
    send(res, 200, { ok: true }, 'Password updated. Please login with your new password.');
  }),
};
