import { z } from 'zod';

const emailSchema = z.string().email().max(200);
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password too long');

export const registerSchema = z.object({
  name: z.string().min(2).max(80),
  email: emailSchema,
  phone: z.string().min(6).max(20).optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20),
});

export const logoutSchema = refreshTokenSchema;

export const otpRequestSchema = z.object({
  email: emailSchema,
  purpose: z.enum(['LOGIN', 'PASSWORD_RESET']),
});

export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const resetPasswordSchema = otpVerifySchema.extend({
  newPassword: passwordSchema,
});

export const googleLoginSchema = z.object({
  email: emailSchema,
  name: z.string().min(1).max(120),
  googleId: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  emailVerified: z.boolean().optional(),
});
