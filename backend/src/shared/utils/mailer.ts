import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to, subject }, 'SMTP not configured — email skipped');
    return false;
  }
  try {
    await tx.sendMail({ from: env.MAIL_FROM, to, subject, html });
    logger.info({ to, subject }, 'email sent');
    return true;
  } catch (err) {
    logger.error({ err, to, subject }, 'email send failed');
    return false;
  }
}

function otpEmailTemplate(code: string, purpose: string): string {
  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#0b1120;padding:20px 28px">
      <span style="color:#22d3ee;font-weight:700;font-size:20px">Nova<span style="color:#facc15">Trade</span></span>
      <span style="color:#94a3b8;font-size:12px;display:block;margin-top:2px">Trade crypto, gold & forex in BDT</span>
    </div>
    <div style="padding:28px">
      <h2 style="margin:0 0 8px;color:#0f172a;font-size:18px">Your verification code</h2>
      <p style="color:#475569;font-size:14px;margin:0 0 18px">
        Use this one-time code to continue (${purpose}). It expires in <b>5 minutes</b>.
      </p>
      <div style="font-size:34px;letter-spacing:10px;font-weight:700;color:#0f172a;background:#f1f5f9;border-radius:10px;padding:16px;text-align:center">${code}</div>
      <p style="color:#94a3b8;font-size:12px;margin-top:18px">
        If you didn't request this, you can safely ignore this email. Never share this code.
      </p>
    </div>
  </div>`;
}

export async function sendOtpEmail(to: string, code: string, purpose: string) {
  return sendMail(to, `${code} is your NovaTrade verification code`, otpEmailTemplate(code, purpose));
}
