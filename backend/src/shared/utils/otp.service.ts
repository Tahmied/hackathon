import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { redisDel, redisGetJson, redisSet } from '../../config/redis.js';
import { ApiError } from '../utils/ApiError.js';
import { sendOtpEmail } from './mailer.js';
import { logger } from './logger.js';

const OTP_TTL_SECONDS = 300;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;

interface OtpRecord {
  hash: string;
  attempts: number;
}

function otpKey(purpose: string, email: string) {
  return `otp:${purpose}:${email.toLowerCase()}`;
}

export async function requestOtp(
  email: string,
  purpose: string,
  opts: { ip?: string; ipLimit?: boolean } = {},
): Promise<{ sent: boolean; cooldownSeconds: number }> {
  const key = otpKey(purpose, email);
  const cooldownKey = `otp:cooldown:${purpose}:${email.toLowerCase()}`;

  const cooldown = await redisGetJson<{ until: number }>(cooldownKey);
  if (cooldown && cooldown.until > Date.now()) {
    const seconds = Math.ceil((cooldown.until - Date.now()) / 1000);
    throw ApiError.tooMany(`Please wait ${seconds}s before requesting another code`, 'OTP_COOLDOWN');
  }

  // crude per-IP throttle for OTP sends
  if (opts.ip && opts.ipLimit) {
    const ipKey = `otp:ip:${opts.ip}`;
    const count = await redisGetJson<{ n: number }>(ipKey);
    if ((count?.n ?? 0) >= 20) throw ApiError.tooMany('Too many OTP requests. Try again later.');
    await redisSet(ipKey, JSON.stringify({ n: (count?.n ?? 0) + 1 }), 3600);
  }

  const code = String(crypto.randomInt(100000, 999999));
  const hash = await bcrypt.hash(code, 8);
  await redisSet(key, JSON.stringify({ hash, attempts: 0 } satisfies OtpRecord), OTP_TTL_SECONDS);
  await redisSet(cooldownKey, JSON.stringify({ until: Date.now() + RESEND_COOLDOWN_SECONDS * 1000 }), RESEND_COOLDOWN_SECONDS);

  const sent = await sendOtpEmail(email, code, purpose);
  if (!sent) logger.warn({ email, purpose }, 'OTP email not sent (SMTP down) — code logged');
  logger.info({ email, purpose, code: sent ? undefined : code }, 'otp requested');
  return { sent, cooldownSeconds: RESEND_COOLDOWN_SECONDS };
}

export async function verifyOtp(email: string, purpose: string, code: string): Promise<void> {
  const key = otpKey(purpose, email);
  const record = await redisGetJson<OtpRecord>(key);
  if (!record) throw ApiError.badRequest('Code expired or not requested. Request a new one.', 'OTP_EXPIRED');

  if (record.attempts >= MAX_ATTEMPTS) {
    await redisDel(key);
    throw ApiError.tooMany('Too many wrong attempts. Request a new code.', 'OTP_MAX_ATTEMPTS');
  }

  const ok = await bcrypt.compare(code, record.hash);
  if (!ok) {
    await redisSet(key, JSON.stringify({ ...record, attempts: record.attempts + 1 }), OTP_TTL_SECONDS);
    throw ApiError.badRequest('Incorrect code', 'OTP_INVALID');
  }

  await redisDel(key);
}
